import { useEffect, useState, type FormEvent } from 'react'
import type { CharacterSheet, InitiativeEntry } from '../../lib/types'
import { addEntry, clearAll, deleteEntry, listEntries, setCurrent, subscribeToInitiative, updateEntry } from './initiativeApi'
import './initiative.css'

export interface InitiativeTrackerProps {
  campaignId: string
  isGm: boolean
  sheets?: CharacterSheet[]
}

// initiative desc, created_at asc — тот же порядок, что и listEntries,
// пересчитываем на клиенте после инлайн-правки числа (не ждём round-trip
// в базу и обратно через realtime только ради пересортировки).
function sortEntries(list: InitiativeEntry[]): InitiativeEntry[] {
  return [...list].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// Трекер инициативы боя: ГМ ведёт список бойцов и порядок ходов, все
// участники кампании видят живьём, чей сейчас ход (см. initiativeApi.ts —
// select-политика отдаёт строки всем всегда).
export default function InitiativeTracker({ campaignId, isGm, sheets }: InitiativeTrackerProps) {
  const [entries, setEntries] = useState<InitiativeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newInitiative, setNewInitiative] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')

    function reload() {
      listEntries(campaignId)
        .then((data) => setEntries(sortEntries(data)))
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить бой'))
        .finally(() => setLoading(false))
    }

    reload()
    // onResync = reload: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список целиком.
    const unsubscribe = subscribeToInitiative(campaignId, reload, reload)
    return unsubscribe
  }, [campaignId])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const initiative = Number(newInitiative) || 0
    setBusy(true)
    setError('')
    try {
      const created = await addEntry(campaignId, name, initiative)
      setEntries((prev) => sortEntries([...prev, created]))
      setNewName('')
      setNewInitiative('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddAllCharacters() {
    if (!sheets || sheets.length === 0) return
    setBusy(true)
    setError('')
    try {
      // Не дублируем персонажей, уже стоящих в бою.
      const existingCharIds = new Set(entries.map((e) => e.character_id).filter((id): id is string => id !== null))
      const toAdd = sheets.filter((s) => !existingCharIds.has(s.id))
      const created = await Promise.all(
        toAdd.map((s) => addEntry(campaignId, s.char_name || s.name, s.initiative, s.id)),
      )
      setEntries((prev) => sortEntries([...prev, ...created]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить персонажей')
    } finally {
      setBusy(false)
    }
  }

  // Значение числа меняем локально при каждом нажатии, в базу отправляем
  // только по onBlur (commitInitiative) — иначе на каждый символ ушёл бы
  // отдельный update.
  function handleInitiativeInput(id: string, value: string) {
    const num = Number(value)
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, initiative: Number.isFinite(num) ? num : e.initiative } : e)),
    )
  }

  async function commitInitiative(entry: InitiativeEntry) {
    try {
      await updateEntry(entry.id, { initiative: entry.initiative })
      setEntries((prev) => sortEntries(prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить инициативу')
    }
  }

  async function handleDelete(entry: InitiativeEntry) {
    setError('')
    try {
      await deleteEntry(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить запись')
    }
  }

  // Следующий ход по кругу считаем на уже отсортированном клиентском
  // списке: если ни у кого нет is_current — начинаем с первого (самая
  // высокая инициатива), иначе передаём следующему за текущим бойцом.
  async function handleNextTurn() {
    if (entries.length === 0) return
    setError('')
    const currentIndex = entries.findIndex((e) => e.is_current)
    const nextEntry = currentIndex === -1 ? entries[0] : entries[(currentIndex + 1) % entries.length]
    try {
      await setCurrent(nextEntry.id, campaignId)
      setEntries((prev) => prev.map((e) => ({ ...e, is_current: e.id === nextEntry.id })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось передать ход')
    }
  }

  async function handleReset() {
    if (!window.confirm('Сбросить бой? Все записи инициативы будут удалены.')) return
    setError('')
    try {
      await clearAll(campaignId)
      setEntries([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить бой')
    }
  }

  if (loading) return <p>Загрузка…</p>

  return (
    <div className="initiative-tracker">
      {error && <p className="auth-error">{error}</p>}

      {entries.length === 0 ? (
        <p className="card-sub-text">Бой не начат.</p>
      ) : (
        <ul className="card-list">
          {entries.map((entry) => (
            <li key={entry.id} className={`card${entry.is_current ? ' initiative-current' : ''}`}>
              <div className="card-main">
                <span className="initiative-name">
                  {entry.is_current && <span className="initiative-current-mark">▶</span>}
                  {entry.name}
                </span>
                {isGm ? (
                  <input
                    type="number"
                    className="initiative-input"
                    value={entry.initiative}
                    onChange={(e) => handleInitiativeInput(entry.id, e.target.value)}
                    onBlur={() => void commitInitiative(entry)}
                  />
                ) : (
                  <span className="badge">{entry.initiative}</span>
                )}
              </div>
              {isGm && (
                <div className="card-sub">
                  <button type="button" onClick={() => void handleDelete(entry)}>
                    Удалить
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isGm && (
        <>
          <div className="initiative-actions">
            <button type="button" disabled={entries.length === 0} onClick={() => void handleNextTurn()}>
              Ход →
            </button>
            <button
              type="button"
              className="initiative-danger-btn"
              disabled={entries.length === 0}
              onClick={() => void handleReset()}
            >
              Сбросить бой
            </button>
          </div>

          <form className="inline-form" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Имя"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="number"
              placeholder="Иниц."
              value={newInitiative}
              disabled={busy}
              onChange={(e) => setNewInitiative(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              Добавить
            </button>
          </form>

          {sheets && sheets.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void handleAddAllCharacters()}>
              + все персонажи кампании
            </button>
          )}
        </>
      )}
    </div>
  )
}
