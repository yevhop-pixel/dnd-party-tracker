import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GameMap, MapToken } from '../../lib/types'
import { deleteToken, getMapUrl, listTokens, subscribeToTokens, updateToken } from './mapsApi'
import './maps.css'
// './leaflet-rotate.d.ts' подключается неявно — tsconfig.app.json включает весь src.

// leaflet-rotate собран как UMD-скрипт для <script>-подключения: он не импортирует
// leaflet сам, а патчит L.Map/L.Control через глобальную переменную `L`. Поэтому
// сначала публикуем уже загруженный L в window, и только потом (асинхронно —
// пакет не даёт статического ESM-экспорта с гарантированным порядком выполнения
// относительно этого модуля) подгружаем сам плагин. Рендер MapContainer с
// rotate-опциями ниже ждёт готовности этого промиса (см. rotateReady).
;(window as unknown as { L: typeof L }).L = L
const leafletRotateReady: Promise<unknown> = import('leaflet-rotate')

interface MapViewerProps {
  map: GameMap
  // ГМ может двигать/переименовывать/удалять токены; игрок только видит их.
  canEdit?: boolean
}

// Палитра для выбора цвета токена — общая для попапа редактирования (ниже)
// и формы создания токена в MapManager.
export const TOKEN_COLORS = ['#7c5cff', '#ff6b6b', '#ffb020', '#3ecf8e', '#4dabf7', '#f783ac']

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

// html divIcon собирается вручную строкой — экранируем label, чтобы теги в
// имени токена не ломали разметку попапа/маркера.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface TokenMarkerProps {
  token: MapToken
  canEdit: boolean
  width: number
  height: number
  onError: (message: string) => void
}

// Один токен — цветной кружок с инициалами. В координатах CRS.Simple карты
// latlng = [y * height, x * width]: lat растёт вниз по картинке (как и y),
// lng растёт вправо (как и x), это соответствует bounds из MapViewer.
function TokenMarker({ token, canEdit, width, height, onError }: TokenMarkerProps) {
  const [label, setLabel] = useState(token.label)
  const [busy, setBusy] = useState(false)

  useEffect(() => setLabel(token.label), [token.label])

  const initials = escapeHtml((token.label.trim().slice(0, 2) || '?').toUpperCase())
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'map-token-icon',
        html: `<div class="map-token" style="background-color:${token.color}">${initials}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [token.color, initials],
  )

  const position: L.LatLngTuple = [token.y * height, token.x * width]

  async function commitLabel() {
    const trimmed = label.trim()
    if (trimmed === token.label) return
    try {
      await updateToken(token.id, { label: trimmed })
    } catch (err) {
      setLabel(token.label)
      onError(err instanceof Error ? err.message : 'Не удалось переименовать токен')
    }
  }

  async function handleColor(color: string) {
    try {
      await updateToken(token.id, { color })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Не удалось изменить цвет токена')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Удалить токен «${token.label}»?`)) return
    setBusy(true)
    try {
      await deleteToken(token.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Не удалось удалить токен')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) {
    return (
      <Marker position={position} icon={icon}>
        <Popup>{token.label || '(без имени)'}</Popup>
      </Marker>
    )
  }

  return (
    <Marker
      position={position}
      icon={icon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const latlng = (e.target as L.Marker).getLatLng()
          const x = clamp01(latlng.lng / width)
          const y = clamp01(latlng.lat / height)
          updateToken(token.id, { x, y }).catch((err) =>
            onError(err instanceof Error ? err.message : 'Не удалось переместить токен'),
          )
        },
      }}
    >
      <Popup>
        <div className="map-token-popup">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <div className="map-token-swatches">
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === token.color ? 'map-token-swatch map-token-swatch-active' : 'map-token-swatch'}
                style={{ backgroundColor: c }}
                onClick={() => handleColor(c)}
              />
            ))}
          </div>
          <button type="button" className="maps-icon-btn maps-icon-btn-danger" disabled={busy} onClick={handleDelete}>
            Удалить
          </button>
        </div>
      </Popup>
    </Marker>
  )
}

// Просмотр картинки карты локации. Карта — не географическая, поэтому
// используем L.CRS.Simple: координаты — это пиксели изображения. Прежде
// чем строить границы для ImageOverlay, нужно узнать реальный размер
// картинки — грузим Image() по подписанному URL и читаем naturalWidth/Height.
export default function MapViewer({ map, canEdit }: MapViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [bounds, setBounds] = useState<L.LatLngBoundsLiteral | null>(null)
  const [error, setError] = useState('')

  const [tokens, setTokens] = useState<MapToken[]>([])
  const [tokensError, setTokensError] = useState('')

  // Готовность плагина поворота карты (см. leafletRotateReady выше) — до этого
  // MapContainer не рендерим, иначе опции rotate/touchRotate будут проигнорированы.
  const [rotateReady, setRotateReady] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    leafletRotateReady.then(() => setRotateReady(true))
  }, [])

  useEffect(() => {
    let cancelled = false
    setImageUrl(null)
    setBounds(null)
    setError('')

    getMapUrl(map)
      .then((url) => {
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          setBounds([
            [0, 0],
            [img.naturalHeight, img.naturalWidth],
          ])
          setImageUrl(url)
        }
        img.onerror = () => {
          if (cancelled) return
          setError('Не удалось загрузить изображение карты')
        }
        img.src = url
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось получить ссылку на карту')
      })

    return () => {
      cancelled = true
    }
    // Зависимость по map.id/storage_path, а не по всему объекту map: родители
    // (PlayerMap/MapManager) после realtime-события передают новый объект той
    // же карты — если гоняться за референсом, эффект перезапускается впустую
    // и MapContainer ниже пересоздаётся, сбрасывая зум и перекачивая картинку.
  }, [map.id, map.storage_path])

  useEffect(() => {
    setTokensError('')

    function reload() {
      listTokens(map.id)
        .then(setTokens)
        .catch((err) => setTokensError(err instanceof Error ? err.message : 'Не удалось загрузить токены'))
    }

    reload()
    // onResync = reload: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список токенов целиком.
    const unsubscribe = subscribeToTokens(map.id, reload, reload)
    return unsubscribe
  }, [map.id])

  if (error) return <p className="maps-error">{error}</p>
  if (!imageUrl || !bounds || !rotateReady) return <p>Загрузка карты…</p>

  // maxBounds чуть шире самой картинки — не даём утащить вид совсем за край.
  const maxBounds = L.latLngBounds(bounds).pad(0.25)
  const height = bounds[1][0]
  const width = bounds[1][1]

  // Поворот на 90° и сброс — для десктопа без тача (на тачскрине есть жест
  // двумя пальцами, см. touchRotate). Поворот чисто локальный для зрителя,
  // в базу не пишем.
  function rotateBy90() {
    const m = mapRef.current
    if (m) m.setBearing((m.getBearing() + 90) % 360)
  }

  function resetRotation() {
    mapRef.current?.setBearing(0)
  }

  return (
    <>
      {tokensError && <p className="maps-error">{tokensError}</p>}
      <div className="map-viewer-frame">
        <MapContainer
          // Пересоздаём Leaflet-карту только при смене самой карты (map.id), а не
          // при каждом обновлении signed URL — иначе realtime-события сбрасывали
          // бы зум и перекачивали картинку без надобности.
          key={map.id}
          ref={mapRef}
          className="map-viewer-container"
          crs={L.CRS.Simple}
          bounds={bounds}
          maxBounds={maxBounds}
          maxBoundsViscosity={1}
          minZoom={-5}
          maxZoom={4}
          zoomSnap={0.25}
          rotate
          touchRotate
          rotateControl={{ closeOnZeroBearing: false }}
          attributionControl={false}
        >
          <ImageOverlay url={imageUrl} bounds={bounds} />
          {tokens.map((token) => (
            <TokenMarker
              key={token.id}
              token={token}
              canEdit={!!canEdit}
              width={width}
              height={height}
              onError={setTokensError}
            />
          ))}
        </MapContainer>
        <div className="map-viewer-rotate-controls">
          <button type="button" className="maps-icon-btn" title="Повернуть на 90°" onClick={rotateBy90}>
            ↻ 90°
          </button>
          <button type="button" className="maps-icon-btn" title="Сбросить поворот" onClick={resetRotation}>
            Сброс
          </button>
        </div>
      </div>
    </>
  )
}
