import { useEffect, useState } from 'react'
import type { GameMap } from '../../lib/types'
import { getCampaignState, listMaps, subscribeToCampaignState, subscribeToMaps } from './mapsApi'
import { getUiState, setUiState } from '../../lib/uiState'
import MapViewer from './MapViewer'
import './maps.css'

interface PlayerMapProps {
  campaignId: string
}

function selectionKey(campaignId: string): string {
  return `player-map-${campaignId}`
}

// Если выбранная ранее карта больше не видна (скрыта/удалена) — сбрасываем выбор.
function validateSelection(data: GameMap[], prev: string | null): string | null {
  return prev && data.some((m) => m.id === prev && m.is_revealed) ? prev : null
}

// Экран игрока: показывает карту(ы), которые сейчас открыл ГМ. Открытых карт
// может быть несколько (мировая + детали, до которых доводят токены-порталы) —
// сверху переключатель-чипсы, выбор запоминается per-кампания в uiState. Когда
// ГМ явно «показывает» карту (campaign_state.current_map_id меняется через
// reveal_map/hide_map), у игрока принудительно открывается именно она.
export default function PlayerMap({ campaignId }: PlayerMapProps) {
  const [maps, setMaps] = useState<GameMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    setSelectedId(getUiState<string>(selectionKey(campaignId)))

    function reloadMaps() {
      listMaps(campaignId)
        .then((data) => {
          setMaps(data)
          setSelectedId((prev) => validateSelection(data, prev))
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить карту'))
        .finally(() => setLoading(false))
    }

    // current_map_id — какую карту ГМ показал последней. Если она среди
    // открытых — переключаемся на неё принудительно, даже если игрок до этого
    // смотрел другую из уже открытых карт.
    function syncFromState() {
      Promise.all([listMaps(campaignId), getCampaignState(campaignId)])
        .then(([data, currentMapId]) => {
          setMaps(data)
          setSelectedId((prev) =>
            currentMapId && data.some((m) => m.id === currentMapId && m.is_revealed)
              ? currentMapId
              : validateSelection(data, prev),
          )
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить карту'))
        .finally(() => setLoading(false))
    }

    syncFromState()
    // onResync = reload/sync: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список карт (и сигнал ГМа) целиком.
    const unsubscribeMaps = subscribeToMaps(campaignId, reloadMaps, syncFromState)
    // Скрытие карты и переключение ГМа доезжают до игрока ТОЛЬКО через
    // campaign_state: событие по самой game_map после is_revealed=false не
    // проходит его RLS-чтение.
    const unsubscribeState = subscribeToCampaignState(campaignId, syncFromState, syncFromState)
    return () => {
      unsubscribeMaps()
      unsubscribeState()
    }
  }, [campaignId])

  // Запоминаем выбор игрока (или последнюю показанную ГМ карту) — при
  // следующем заходе сразу открываем ту же карту.
  useEffect(() => {
    if (selectedId) setUiState(selectionKey(campaignId), selectedId)
  }, [selectedId, campaignId])

  if (loading) return <p>Загрузка…</p>
  if (error) return <p className="maps-error">{error}</p>

  const revealed = maps.filter((m) => m.is_revealed)

  if (revealed.length === 0) {
    return <p className="card-sub-text">ГМ пока не открыл карту.</p>
  }

  const selected = selectedId
    ? revealed.find((m) => m.id === selectedId)
    : revealed.length === 1
      ? revealed[0]
      : undefined

  return (
    <div className="maps-viewer-wrap">
      {revealed.length > 1 && (
        <div className="maps-chip-row">
          {revealed.map((map) => (
            <button
              key={map.id}
              type="button"
              className={map.id === selected?.id ? 'maps-chip maps-chip-active' : 'maps-chip'}
              onClick={() => setSelectedId(map.id)}
            >
              {map.location_name}
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <>
          <h2>{selected.location_name}</h2>
          <MapViewer
            map={selected}
            allMaps={revealed}
            onNavigateToMap={(mapId) => {
              // Портал ведёт на карту, которой сейчас нет среди открытых —
              // молча ничего не делаем (см. план фичи).
              if (revealed.some((m) => m.id === mapId)) setSelectedId(mapId)
            }}
          />
        </>
      ) : (
        <p className="card-sub-text">Открыто несколько карт — выберите вкладку выше.</p>
      )}
    </div>
  )
}
