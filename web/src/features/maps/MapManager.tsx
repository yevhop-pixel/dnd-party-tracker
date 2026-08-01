import { useEffect, useState } from 'react'
import type { GameMap } from '../../lib/types'
import { addToken, deleteMap, listMaps, renameMap, setRevealed, subscribeToMaps, uploadMap } from './mapsApi'
import MapViewer, { TOKEN_COLORS } from './MapViewer'
import './maps.css'

interface MapManagerProps {
  campaignId: string
}

// Экран ГМа: список карт кампании, переключение «какая локация видна
// игрокам», загрузка новых карт, просмотр выбранной карты.
export default function MapManager({ campaignId }: MapManagerProps) {
  const [maps, setMaps] = useState<GameMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMapId, setOpenMapId] = useState<string | null>(null)

  const [locationName, setLocationName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [tokenLabel, setTokenLabel] = useState('')
  const [tokenColor, setTokenColor] = useState(TOKEN_COLORS[0])
  const [addingToken, setAddingToken] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')

    function reload() {
      listMaps(campaignId)
        .then(setMaps)
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить карты'))
        .finally(() => setLoading(false))
    }

    reload()
    // onResync = reload: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список карт целиком.
    const unsubscribe = subscribeToMaps(campaignId, reload, reload)
    return unsubscribe
  }, [campaignId])

  async function handleUpload(file: File) {
    if (!locationName.trim()) {
      setError('Сначала введите название локации')
      return
    }
    setUploading(true)
    setError('')
    try {
      const nextOrder = maps.length ? Math.max(...maps.map((m) => m.sort_order)) + 1 : 0
      const created = await uploadMap(campaignId, file, locationName.trim(), nextOrder)
      setMaps((prev) => [...prev, created])
      setLocationName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить карту')
    } finally {
      setUploading(false)
    }
  }

  async function handleReveal(map: GameMap) {
    setError('')
    try {
      await setRevealed(map.id, true)
      const data = await listMaps(campaignId)
      setMaps(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось показать карту игрокам')
    }
  }

  async function handleHide(map: GameMap) {
    setError('')
    try {
      await setRevealed(map.id, false)
      setMaps((prev) => prev.map((m) => (m.id === map.id ? { ...m, is_revealed: false } : m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось скрыть карту')
    }
  }

  function startRename(map: GameMap) {
    setRenamingId(map.id)
    setRenameValue(map.location_name)
  }

  async function confirmRename(map: GameMap) {
    if (renamingId !== map.id) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === map.location_name) {
      setRenamingId(null)
      return
    }
    try {
      const updated = await renameMap(map.id, trimmed)
      setMaps((prev) => prev.map((m) => (m.id === map.id ? updated : m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переименовать карту')
    } finally {
      setRenamingId(null)
    }
  }

  async function handleDelete(map: GameMap) {
    if (!window.confirm(`Удалить карту «${map.location_name}»? Файл тоже будет удалён.`)) return
    setError('')
    try {
      await deleteMap(map)
      setMaps((prev) => prev.filter((m) => m.id !== map.id))
      if (openMapId === map.id) setOpenMapId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить карту')
    }
  }

  async function handleAddToken(map: GameMap) {
    if (!tokenLabel.trim()) return
    setAddingToken(true)
    setError('')
    try {
      await addToken(campaignId, map.id, tokenLabel.trim(), tokenColor)
      setTokenLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить токен')
    } finally {
      setAddingToken(false)
    }
  }

  if (loading) return <p>Загрузка…</p>

  const openMap = maps.find((m) => m.id === openMapId)
  if (openMap) {
    return (
      <div className="maps-viewer-wrap">
        <button type="button" className="maps-link-btn" onClick={() => setOpenMapId(null)}>
          ← к списку
        </button>
        <h2>{openMap.location_name}</h2>
        {error && <p className="maps-error">{error}</p>}
        <div className="maps-token-form">
          <input
            type="text"
            placeholder="Имя токена…"
            value={tokenLabel}
            onChange={(e) => setTokenLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddToken(openMap)
            }}
          />
          <div className="map-token-swatches">
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === tokenColor ? 'map-token-swatch map-token-swatch-active' : 'map-token-swatch'}
                style={{ backgroundColor: c }}
                onClick={() => setTokenColor(c)}
              />
            ))}
          </div>
          <button type="button" disabled={addingToken || !tokenLabel.trim()} onClick={() => handleAddToken(openMap)}>
            + Токен
          </button>
        </div>
        <MapViewer map={openMap} canEdit />
      </div>
    )
  }

  return (
    <div className="maps-manager">
      {error && <p className="maps-error">{error}</p>}

      <ul className="card-list">
        {maps.length === 0 && <li className="card-sub-text">Карт пока нет.</li>}
        {maps.map((map) => (
          <li key={map.id} className="card">
            <div className="card-main">
              {renamingId === map.id ? (
                // Поле переименования — не внутри кнопки: <input> в <button>
                // невалиден и на мобиле тап по полю открывал бы карту.
                <input
                  type="text"
                  className="maps-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(map)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(map)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <button type="button" className="maps-open-btn" onClick={() => setOpenMapId(map.id)}>
                  {map.location_name}
                </button>
              )}
              <span className={map.is_revealed ? 'badge badge-revealed' : 'badge'}>
                {map.is_revealed ? 'Открыта игрокам' : 'Скрыта'}
              </span>
            </div>
            <div className="card-sub">
              <span className="card-sub-text">{new Date(map.created_at).toLocaleDateString('ru-RU')}</span>
              {map.is_revealed ? (
                <button type="button" onClick={() => handleHide(map)}>
                  Скрыть
                </button>
              ) : (
                <button type="button" onClick={() => handleReveal(map)}>
                  Показать игрокам
                </button>
              )}
              <button type="button" className="maps-link-btn" onClick={() => startRename(map)}>
                Переименовать
              </button>
              <button type="button" className="maps-icon-btn maps-icon-btn-danger" onClick={() => handleDelete(map)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="card maps-add-form">
        <span className="maps-add-form-title">Загрузить карту</span>
        <input
          type="text"
          placeholder="Название локации…"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleUpload(file)
          }}
        />
        {uploading && <p>Загрузка…</p>}
      </div>
    </div>
  )
}
