import { useEffect, useState } from 'react'
import { MapContainer, ImageOverlay } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GameMap } from '../../lib/types'
import { getMapUrl } from './mapsApi'
import './maps.css'

interface MapViewerProps {
  map: GameMap
}

// Просмотр картинки карты локации. Карта — не географическая, поэтому
// используем L.CRS.Simple: координаты — это пиксели изображения. Прежде
// чем строить границы для ImageOverlay, нужно узнать реальный размер
// картинки — грузим Image() по подписанному URL и читаем naturalWidth/Height.
export default function MapViewer({ map }: MapViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [bounds, setBounds] = useState<L.LatLngBoundsLiteral | null>(null)
  const [error, setError] = useState('')

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

  if (error) return <p className="maps-error">{error}</p>
  if (!imageUrl || !bounds) return <p>Загрузка карты…</p>

  // maxBounds чуть шире самой картинки — не даём утащить вид совсем за край.
  const maxBounds = L.latLngBounds(bounds).pad(0.25)

  return (
    <MapContainer
      // Пересоздаём Leaflet-карту только при смене самой карты (map.id), а не
      // при каждом обновлении signed URL — иначе realtime-события сбрасывали
      // бы зум и перекачивали картинку без надобности.
      key={map.id}
      className="map-viewer-container"
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={maxBounds}
      maxBoundsViscosity={1}
      minZoom={-5}
      maxZoom={4}
      zoomSnap={0.25}
      attributionControl={false}
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
    </MapContainer>
  )
}
