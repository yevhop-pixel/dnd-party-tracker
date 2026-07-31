import { useEffect, useState } from 'react'
import type { GameMap } from '../../lib/types'
import { listMaps, subscribeToCampaignState, subscribeToMaps } from './mapsApi'
import MapViewer from './MapViewer'
import './maps.css'

interface PlayerMapProps {
  campaignId: string
}

// Экран игрока: показывает карту, которую сейчас открыл ГМ. RLS отдаёт
// игроку только is_revealed-карты (см. map_read в schema.sql), поэтому
// здесь достаточно просто взять то, что вернул listMaps.
export default function PlayerMap({ campaignId }: PlayerMapProps) {
  const [maps, setMaps] = useState<GameMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')

    function reload() {
      listMaps(campaignId)
        .then((data) => {
          setMaps(data)
          // Если карта, выбранную ранее из нескольких открытых, больше не
          // видна (скрыта или удалена) — сбрасываем выбор.
          setSelectedId((prev) => (prev && data.some((m) => m.id === prev && m.is_revealed) ? prev : null))
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить карту'))
        .finally(() => setLoading(false))
    }

    reload()
    // onResync = reload: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список карт целиком.
    const unsubscribeMaps = subscribeToMaps(campaignId, reload, reload)
    // Скрытие карты доезжает до игрока ТОЛЬКО через campaign_state: событие
    // по самой game_map после is_revealed=false не проходит его RLS-чтение.
    const unsubscribeState = subscribeToCampaignState(campaignId, reload, reload)
    return () => {
      unsubscribeMaps()
      unsubscribeState()
    }
  }, [campaignId])

  if (loading) return <p>Загрузка…</p>
  if (error) return <p className="maps-error">{error}</p>

  const revealed = maps.filter((m) => m.is_revealed)

  if (revealed.length === 0) {
    return <p className="card-sub-text">ГМ пока не открыл карту.</p>
  }

  // Легаси-состояние: если открытых карт несколько, даём выбрать вручную.
  const selected = selectedId
    ? revealed.find((m) => m.id === selectedId)
    : revealed.length === 1
      ? revealed[0]
      : undefined

  if (!selected) {
    return (
      <div className="maps-manager">
        <p>Открыто несколько карт — выберите:</p>
        <ul className="card-list">
          {revealed.map((map) => (
            <li key={map.id} className="card card-clickable" onClick={() => setSelectedId(map.id)}>
              {map.location_name}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="maps-viewer-wrap">
      <h2>{selected.location_name}</h2>
      <MapViewer map={selected} />
    </div>
  )
}
