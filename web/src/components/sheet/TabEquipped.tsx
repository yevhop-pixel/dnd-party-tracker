import { useEffect, useState, type MouseEvent } from 'react'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import type { EquippedItem } from '../../lib/types'
import type { SheetTabProps } from './types'
import { applyReorderResult, reorderItems, reorderToTop } from './reorder'
import { useDebouncedPatches } from './useDebouncedPatches'
import { getUiState, setUiState } from '../../lib/uiState'
import AutoTextarea from '../AutoTextarea'
import './tabs-inv.css'

// Свёрнутые карточки запоминаем per-лист — у разных персонажей разная экипировка.
function collapsedKey(sheetId: string): string {
  return `collapsed-equipped_item-${sheetId}`
}

// Подсказки для поля «слот» — не ограничение, просто datalist: любой свой
// текст тоже можно ввести.
const SLOT_SUGGESTIONS = [
  'Оружие 1',
  'Оружие 2',
  'Оружие 3',
  'Доспех',
  'Щит',
  'Кольцо 1',
  'Кольцо 2',
  'Амулет',
  'Шлем',
  'Плащ',
  'Перчатки',
  'Сапоги',
  'Инструменты/Фокус',
]

export default function TabEquipped({ sheet }: SheetTabProps) {
  const [items, setItems] = useState<EquippedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [addSlot, setAddSlot] = useState('')
  const [addName, setAddName] = useState('')
  const [addNotes, setAddNotes] = useState('')

  const { schedule, discard } = useDebouncedPatches<EquippedItem>(
    (id, patch) => updateChild<EquippedItem>('equipped_item', id, patch),
    (message) => setError(message),
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    setCollapsed(new Set(getUiState<string[]>(collapsedKey(sheet.id)) ?? []))
    listChildren<EquippedItem>('equipped_item', sheet.id)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить экипировку'))
      .finally(() => setLoading(false))
  }, [sheet.id])

  function editItem(id: string, patch: Partial<EquippedItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    schedule(id, patch)
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setUiState(collapsedKey(sheet.id), Array.from(next))
      return next
    })
  }

  function collapseAll() {
    const next = new Set(items.map((it) => it.id))
    setUiState(collapsedKey(sheet.id), Array.from(next))
    setCollapsed(next)
  }

  function expandAll() {
    setUiState(collapsedKey(sheet.id), [])
    setCollapsed(new Set())
  }

  // Тап по шапке карточки сворачивает/разворачивает её — но не когда тап
  // пришёлся на поле ввода или кнопку внутри шапки (иначе клик для фокуса
  // на инпуте слота/названия неожиданно сворачивал бы карточку).
  function handleHeaderClick(e: MouseEvent<HTMLDivElement>, id: string) {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, button')) return
    toggleCollapse(id)
  }

  async function handleAdd() {
    if (!addName.trim()) return
    const nextOrder = items.length ? Math.max(...items.map((it) => it.sort_order)) + 1 : 0
    try {
      const created = await insertChild<EquippedItem>('equipped_item', {
        character_id: sheet.id,
        slot: addSlot.trim(),
        name: addName.trim(),
        notes: addNotes,
        sort_order: nextOrder,
      })
      setItems((prev) => [...prev, created])
      setAddSlot('')
      setAddName('')
      setAddNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить предмет')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Удалить этот предмет?')) return
    discard(id)
    try {
      await deleteChild('equipped_item', id)
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить предмет')
    }
  }

  async function handleMove(id: string, dir: -1 | 1) {
    try {
      const result = await reorderItems(items, id, dir, (childId, sortOrder) =>
        updateChild<EquippedItem>('equipped_item', childId, { sort_order: sortOrder }),
      )
      if (!result) return
      setItems((prev) => applyReorderResult(prev, result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок')
    }
  }

  async function handleMoveTop(id: string) {
    try {
      const result = await reorderToTop(items, id, (childId, sortOrder) =>
        updateChild<EquippedItem>('equipped_item', childId, { sort_order: sortOrder }),
      )
      if (!result) return
      setItems((prev) => applyReorderResult(prev, result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок')
    }
  }

  if (loading) return <p>Загрузка…</p>

  return (
    <div className="sheet-tab-equipped">
      <section className="sheet-section">
        <div className="tab-list-header">
          <h2>Экипировка</h2>
          <div className="tab-list-actions">
            <button type="button" className="tab-link-btn" onClick={collapseAll}>
              Свернуть все
            </button>
            <button type="button" className="tab-link-btn" onClick={expandAll}>
              Развернуть все
            </button>
          </div>
        </div>

        {error && <p className="tab-error">{error}</p>}

        <datalist id="equip-slot-suggestions">
          {SLOT_SUGGESTIONS.map((slot) => (
            <option key={slot} value={slot} />
          ))}
        </datalist>

        <ul className="card-list">
          {items.length === 0 && <li className="card-sub-text">Экипировка пуста.</li>}
          {items.map((eq) => {
            const isCollapsed = collapsed.has(eq.id)
            return (
              <li key={eq.id} className="card equip-card">
                <div className="item-card-head equip-card-head" onClick={(e) => handleHeaderClick(e, eq.id)}>
                  {isCollapsed ? (
                    <div className="equip-collapsed-line">
                      <span className="badge">{eq.slot || '—'}</span>
                      <span className="equip-collapsed-name">{eq.name}</span>
                    </div>
                  ) : (
                    <div className="equip-card-fields">
                      <input
                        type="text"
                        className="equip-slot-input"
                        list="equip-slot-suggestions"
                        placeholder="Слот…"
                        value={eq.slot}
                        onChange={(e) => editItem(eq.id, { slot: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder="Название предмета…"
                        value={eq.name}
                        onChange={(e) => editItem(eq.id, { name: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="item-card-actions">
                    <button type="button" className="icon-btn" onClick={() => toggleCollapse(eq.id)}>
                      {isCollapsed ? '▾' : '▴'}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={items.findIndex((it) => it.id === eq.id) === 0}
                      onClick={() => handleMoveTop(eq.id)}
                    >
                      ⤒
                    </button>
                    <button type="button" className="icon-btn" onClick={() => handleMove(eq.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="icon-btn" onClick={() => handleMove(eq.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="icon-btn icon-btn-danger" onClick={() => handleDelete(eq.id)}>
                      ✕
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="item-card-body">
                    <AutoTextarea
                      className="item-card-desc"
                      placeholder="Заметки (урон, эффекты)…"
                      value={eq.notes}
                      onChange={(e) => editItem(eq.id, { notes: e.target.value })}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="card add-form">
          <span className="add-form-title">Добавить предмет</span>
          <input
            type="text"
            className="equip-slot-input"
            list="equip-slot-suggestions"
            placeholder="Слот (необязательно)…"
            value={addSlot}
            onChange={(e) => setAddSlot(e.target.value)}
          />
          <input
            type="text"
            placeholder="Название предмета…"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
          <AutoTextarea
            className="item-card-desc"
            placeholder="Заметки (урон, эффекты)…"
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
          />
          <button type="button" onClick={handleAdd} disabled={!addName.trim()}>
            + Добавить
          </button>
        </div>
      </section>
    </div>
  )
}
