import { useEffect, useState } from 'react'
import type { GameMap } from '../../lib/types'
import { getCampaignState, listMaps, subscribeToCampaignState, subscribeToMaps } from './mapsApi'
import { getUiState, setUiState } from '../../lib/uiState'
import { useCompact } from '../../lib/useCompact'
import Popover from '../../components/Popover'
import MapViewer from './MapViewer'
import './maps.css'

interface PlayerMapProps {
  campaignId: string
}

function selectionKey(campaignId: string): string {
  return `player-map-${campaignId}`
}

// Карты, которые человек убрал У СЕБЯ. Хранится локально, а не в базе: это
// личное «мне эта уже не нужна», а не действие над кампанией — у соседа та
// же карта должна остаться на месте. ГМ по-прежнему решает, какие карты
// вообще открыты; здесь только личная уборка со своего экрана.
function hiddenKey(campaignId: string): string {
  return `player-map-hidden-${campaignId}`
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
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const compact = useCompact()

  useEffect(() => {
    setLoading(true)
    setError('')
    setSelectedId(getUiState<string>(selectionKey(campaignId)))
    setHiddenIds(getUiState<string[]>(hiddenKey(campaignId)) ?? [])
    setShowHidden(false)

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

  const openedByGm = maps.filter((m) => m.is_revealed)
  // Скрытые остаются в списке, пока человек сам не попросит их показать —
  // иначе вернуть убранную карту было бы нечем.
  const revealed = showHidden ? openedByGm : openedByGm.filter((m) => !hiddenIds.includes(m.id))
  const hiddenCount = openedByGm.length - openedByGm.filter((m) => !hiddenIds.includes(m.id)).length

  function toggleHidden(mapId: string) {
    setHiddenIds((prev) => {
      const next = prev.includes(mapId) ? prev.filter((id) => id !== mapId) : [...prev, mapId]
      setUiState(hiddenKey(campaignId), next)
      // Убрали ту, что открыта — переключаемся на первую оставшуюся.
      if (!prev.includes(mapId) && selectedId === mapId) {
        const rest = openedByGm.find((m) => m.id !== mapId && !next.includes(m.id))
        setSelectedId(rest?.id ?? null)
      }
      return next
    })
  }

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
      {/* Пока карт мало — чипсы в строку. Когда их станет много, строка
          расползлась бы на пол-экрана, поэтому переключатель схлопывается в
          выпадающий список с названием текущей карты. */}
      {revealed.length > 1 && revealed.length <= 3 && !compact && (
        <div className="maps-chip-row">
          {revealed.map((map) => (
            <span key={map.id} className="maps-chip-wrap">
              <button
                type="button"
                className={map.id === selected?.id ? 'maps-chip maps-chip-active' : 'maps-chip'}
                onClick={() => setSelectedId(map.id)}
              >
                {map.location_name}
              </button>
              <button
                type="button"
                className="maps-chip-hide"
                title={hiddenIds.includes(map.id) ? 'Вернуть себе' : 'Убрать у себя'}
                onClick={() => toggleHidden(map.id)}
              >
                {hiddenIds.includes(map.id) ? '↺' : '×'}
              </button>
            </span>
          ))}
        </div>
      )}
      {revealed.length > 1 && (revealed.length > 3 || compact) && (
        <div className="maps-chip-row">
          <Popover label={`🗺 ${selected?.location_name ?? 'Карты'}`} width={260} bare>
            {(close) => (
              <div className="tab-menu">
                {revealed.map((map) => (
                  <span key={map.id} className="maps-menu-row">
                    <button
                      type="button"
                      className={`tab-menu-item${map.id === selected?.id ? ' tab-menu-item-active' : ''}`}
                      onClick={() => {
                        setSelectedId(map.id)
                        close()
                      }}
                    >
                      {map.location_name}
                    </button>
                    <button
                      type="button"
                      className="maps-chip-hide"
                      title={hiddenIds.includes(map.id) ? 'Вернуть себе' : 'Убрать у себя'}
                      onClick={() => toggleHidden(map.id)}
                    >
                      {hiddenIds.includes(map.id) ? '↺' : '×'}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Popover>
        </div>
      )}
      {/* Отдельной строкой, а не внутри переключателя карт: убрать можно и
          последнюю карту, и тогда переключателя на экране уже нет — вернуть
          её было бы нечем. */}
      {hiddenCount > 0 && (
        <div className="maps-chip-row">
          <button type="button" className="maps-hidden-toggle" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Скрыть убранные' : `Убранные карты (${hiddenCount})`}
          </button>
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
