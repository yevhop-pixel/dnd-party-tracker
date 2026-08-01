// Личная булавка на карте локации — заметка «для себя» (см. map_pin в
// schema.sql, RLS pin_own: видит и правит только владелец). Вынесена из
// MapViewer.tsx отдельным компонентом по образцу TokenMarker, чтобы файл не
// разбухал — та же структура: divIcon, popup с полями редактирования, drag.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import * as L from 'leaflet'
import type { MapPin } from '../../lib/types'
import { deletePin, updatePin } from './mapsApi'
import { TOKEN_COLORS, clamp01, escapeHtml } from './MapViewer'

interface PinMarkerProps {
  pin: MapPin
  width: number
  height: number
  onError: (message: string) => void
  // Список меток живёт в MapViewer и не имеет realtime-подписки, поэтому
  // результат каждой операции надо вернуть наверх руками — иначе удалённая
  // метка остаётся на экране до перезагрузки карты (баг с прода).
  onDeleted: (id: string) => void
  onUpdated: (pin: MapPin) => void
  // true для метки, только что созданной кликом по карте — открываем попап
  // сразу, чтобы можно было вписать название, не тыкая в маркер повторно.
  autoOpenPopup?: boolean
}

// Метка — «капля» (teardrop), в отличие от круглых токенов персонажей и
// ромбовидных токенов-порталов (см. TokenMarker выше) — так метки не путаются
// с фишками на общей карте. Координаты — та же CRS.Simple: latlng =
// [y * height, x * width], что и у токенов.
export default function PinMarker({
  pin,
  width,
  height,
  onError,
  onDeleted,
  onUpdated,
  autoOpenPopup,
}: PinMarkerProps) {
  const [label, setLabel] = useState(pin.label)
  const [body, setBody] = useState(pin.body)
  const [busy, setBusy] = useState(false)
  const markerRef = useRef<L.Marker | null>(null)
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Что реально ушло в базу по названию. Сверяться с pin.label нельзя: путь с
  // debounce намеренно не зовёт onUpdated, поэтому проп отстаёт. Иначе правка
  // «A → AB → снова A» на blur считалась бы «ничего не изменилось» и в базе
  // навсегда осталось бы «AB».
  const lastSavedLabel = useRef(pin.label)

  // Синхронизация с пропсом — только когда по этому полю нет несохранённой
  // правки (таймер debounce ещё тикает). Иначе ответ на СОСЕДНЮЮ операцию
  // (например, сохранение названия) приносит ещё старую заметку и затирает
  // то, что человек прямо сейчас допечатывает.
  useEffect(() => {
    if (!labelTimer.current) {
      setLabel(pin.label)
      lastSavedLabel.current = pin.label
    }
  }, [pin.label])
  useEffect(() => {
    if (!bodyTimer.current) setBody(pin.body)
  }, [pin.body])

  // Открываем попап после монтирования (не во время рендера) — Leaflet-марк
  // должен быть уже примонтирован к карте.
  useEffect(() => {
    if (autoOpenPopup) markerRef.current?.openPopup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (labelTimer.current) clearTimeout(labelTimer.current)
      if (bodyTimer.current) clearTimeout(bodyTimer.current)
    }
  }, [])

  const glyph = escapeHtml((pin.label.trim().slice(0, 1) || '•').toUpperCase())
  // SVG teardrop: круглая «голова» сверху, острый хвостик снизу — классическая
  // форма пина. iconAnchor указывает точно на кончик хвостика, чтобы метка
  // стояла остриём в выбранной точке, а не центром.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'map-pin-icon-wrap',
        html:
          `<div class="map-pin-icon">` +
          `<svg width="26" height="34" viewBox="0 0 26 34">` +
          `<path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 21 13 21s13-12 13-21C26 5.8 20.2 0 13 0z" fill="${pin.color}" stroke="#fff" stroke-width="2"/>` +
          `</svg>` +
          `<span class="map-pin-glyph">${glyph}</span>` +
          `</div>`,
        iconSize: [26, 34],
        iconAnchor: [13, 34],
      }),
    [pin.color, glyph],
  )

  const position: L.LatLngTuple = [pin.y * height, pin.x * width]

  async function commitLabel() {
    // Отменяем отложенную запись — blur всё равно отправит актуальное значение.
    if (labelTimer.current) {
      clearTimeout(labelTimer.current)
      labelTimer.current = null
    }
    const trimmed = label.trim()
    if (trimmed === lastSavedLabel.current) return
    try {
      lastSavedLabel.current = trimmed
      onUpdated(await updatePin(pin.id, { label: trimmed }))
    } catch (err) {
      lastSavedLabel.current = pin.label
      setLabel(pin.label)
      onError(err instanceof Error ? err.message : 'Не удалось переименовать метку')
    }
  }

  // Название сохраняем не только по blur, но и с debounce: попап метки часто
  // закрывают кликом по карте, не снимая фокус с поля — и правка терялась.
  function handleLabelChange(value: string) {
    setLabel(value)
    if (labelTimer.current) clearTimeout(labelTimer.current)
    labelTimer.current = setTimeout(() => {
      labelTimer.current = null
      const trimmed = value.trim()
      if (trimmed === lastSavedLabel.current) return
      lastSavedLabel.current = trimmed
      // onUpdated здесь НЕ зовём: пока запрос летит, человек продолжает
      // печатать, а ответ вернул бы старую строку и effect выше затёр бы ей
      // поле ввода. Наверх название уходит только по blur (commitLabel).
      updatePin(pin.id, { label: trimmed }).catch((err) =>
        onError(err instanceof Error ? err.message : 'Не удалось переименовать метку'),
      )
    }, 600)
  }

  // Заметка сохраняется с debounce — иначе каждый символ печати ходил бы в базу.
  function handleBodyChange(value: string) {
    setBody(value)
    if (bodyTimer.current) clearTimeout(bodyTimer.current)
    bodyTimer.current = setTimeout(() => {
      bodyTimer.current = null
      // Тоже без onUpdated — по той же причине, что и с названием выше.
      updatePin(pin.id, { body: value }).catch((err) =>
        onError(err instanceof Error ? err.message : 'Не удалось сохранить заметку'),
      )
    }, 600)
  }

  async function handleColor(color: string) {
    try {
      onUpdated(await updatePin(pin.id, { color }))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Не удалось изменить цвет метки')
    }
  }

  async function handleDelete() {
    // Отложенные записи гасим ДО confirm: диалог висит сколько угодно, таймер
    // за это время успевает выстрелить, и апдейт уходит по уже удалённой
    // строке — .single() отвечает ошибкой, и поверх успешного удаления
    // вылезает липкое «Не удалось сохранить заметку».
    const hadPendingEdits = labelTimer.current !== null || bodyTimer.current !== null
    if (labelTimer.current) {
      clearTimeout(labelTimer.current)
      labelTimer.current = null
    }
    if (bodyTimer.current) {
      clearTimeout(bodyTimer.current)
      bodyTimer.current = null
    }

    if (!window.confirm(`Удалить метку «${pin.label || '(без имени)'}»?`)) {
      // Передумали — недописанную правку возвращаем в базу сами, раз уж
      // отменили её таймер.
      if (hadPendingEdits) {
        lastSavedLabel.current = label.trim()
        updatePin(pin.id, { label: label.trim(), body }).catch((err) =>
          onError(err instanceof Error ? err.message : 'Не удалось сохранить метку'),
        )
      }
      return
    }

    setBusy(true)
    try {
      const removed = await deletePin(pin.id)
      // Закрываем попап до размонтирования маркера — Leaflet иначе оставляет
      // «висящее» окошко поверх карты.
      markerRef.current?.closePopup()
      // Убираем метку с экрана в любом случае: removed=false значит строки уже
      // нет (удалили с другого устройства) — держать маркер незачем.
      onDeleted(pin.id)
      if (!removed) onError('Метка уже была удалена')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Не удалось удалить метку')
      setBusy(false)
    }
  }

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const latlng = (e.target as L.Marker).getLatLng()
          const x = clamp01(latlng.lng / width)
          const y = clamp01(latlng.lat / height)
          updatePin(pin.id, { x, y })
            .then(onUpdated)
            .catch((err) => onError(err instanceof Error ? err.message : 'Не удалось переместить метку'))
        },
      }}
    >
      {/* autoPan=false: иначе Leaflet при открытии попапа уводит карту вбок,
          чтобы вместить окошко — вид уезжает прямо под руками (баг с прода). */}
      <Popup autoPan={false} closeOnClick={false}>
        <div className="map-pin-popup">
          <input
            type="text"
            placeholder="Название"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <textarea
            className="map-pin-body"
            placeholder="Заметка"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
          />
          <div className="map-token-swatches">
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === pin.color ? 'map-token-swatch map-token-swatch-active' : 'map-token-swatch'}
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
