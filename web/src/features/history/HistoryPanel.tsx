// Журнал изменений для ГМа: кто из игроков что поправил у себя в листе.
// Пишут журнал триггеры в базе (см. schema.sql), здесь только показ.
//
// Realtime тут нет намеренно, как и у бестиария: payload postgres_changes не
// проходит RLS, а в строке лежит чужое золото. Свежесть даёт useLiveSync.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeLogRow } from '../../lib/types'
import { useLiveSync } from '../../lib/useLiveSync'
import { listChanges } from './historyApi'
import './history.css'

export interface HistoryPanelProps {
  campaignId: string
  // user_id -> имя, чтобы подписать, КТО правил (а не только чей лист).
  userNames: Record<string, string>
}

// Человеческие названия таблиц.
const ENTITY_LABEL: Record<string, string> = {
  sheet: 'лист',
  inventory_item: 'вещь',
  equipped_item: 'экипировка',
  potion: 'зелье',
  consumable: 'расходник',
  feature: 'черта',
  quest: 'квест',
  npc: 'NPC',
}

function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? entity
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Одна строка журнала словами. Разделено на три случая, потому что «добавил
// зелье лечения» и «золото было 438, стало 400» читаются по-разному, а
// одинаковый шаблон на всё превратил бы журнал в таблицу с прочерками.
function describe(row: ChangeLogRow): { what: string; from?: string; to?: string } {
  if (row.action === 'insert') return { what: `добавил${row.entity_name ? ` ${entityLabel(row.entity)} «${row.entity_name}»` : ''}` }
  if (row.action === 'delete') return { what: `убрал${row.entity_name ? ` ${entityLabel(row.entity)} «${row.entity_name}»` : ''}` }
  if (row.entity === 'sheet') {
    return { what: row.field ?? 'поле листа', from: row.old_value ?? '—', to: row.new_value ?? '—' }
  }
  return {
    what: `${entityLabel(row.entity)} «${row.entity_name}», ${row.field ?? 'поле'}`,
    from: row.old_value ?? '—',
    to: row.new_value ?? '—',
  }
}

export default function HistoryPanel({ campaignId, userNames }: HistoryPanelProps) {
  const [rows, setRows] = useState<ChangeLogRow[] | null>(null)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const cancelledRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await listChanges(campaignId)
      if (!cancelledRef.current) {
        setRows(data)
        setError('')
        setNotReady(false)
      }
    } catch (err) {
      if (cancelledRef.current) return
      // Схему накатывают руками — до этого таблицы просто нет.
      const code = (err as { code?: string } | null)?.code
      if (code === '42P01') {
        setNotReady(true)
        setRows([])
        setError('')
        return
      }
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю')
    }
  }, [campaignId])

  useEffect(() => {
    cancelledRef.current = false
    setRows(null)
    void load()
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  useLiveSync(() => void load())

  return (
    <div className="history">
      {notReady && (
        <p className="card-sub-text">
          История ещё не включена в базе — заработает сразу после обновления схемы.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {rows === null && !error && <p className="card-sub-text">Загрузка…</p>}
      {rows !== null && !notReady && rows.length === 0 && (
        <p className="card-sub-text">Пока никто ничего не менял.</p>
      )}

      <ul className="history-list">
        {(rows ?? []).map((row) => {
          const { what, from, to } = describe(row)
          // Кто правил и чей лист — обычно один и тот же человек, тогда имя
          // не дублируем.
          const actor = row.actor_id ? (userNames[row.actor_id] ?? '') : ''
          const subject = row.char_name || actor || 'Игрок'
          const byOther = actor && actor !== subject ? actor : ''
          return (
            <li key={row.id} className="history-row">
              <div className="history-row-main">
                <strong className="history-who">{subject}</strong>
                <span className="history-what">{what}</span>
                {from !== undefined && (
                  <span className="history-change">
                    <span className="history-from">{from}</span>
                    <span className="history-arrow">→</span>
                    <span className="history-to">{to}</span>
                  </span>
                )}
              </div>
              <div className="history-meta">
                {byOther && <span className="badge">правил {byOther}</span>}
                <span className="history-time">{formatTime(row.created_at)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
