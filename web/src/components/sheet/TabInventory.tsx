import { useEffect, useState, type MouseEvent } from 'react'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import type { InventoryItem } from '../../lib/types'
import type { SheetTabProps } from './types'
import { applyReorderResult, reorderItems } from './reorder'
import { useDebouncedPatches } from './useDebouncedPatches'
import './tabs-inv.css'

export default function TabInventory({ sheet }: SheetTabProps) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addWeight, setAddWeight] = useState('0')
  const [addValue, setAddValue] = useState('0')
  const [addNotes, setAddNotes] = useState('')

  const { schedule, discard } = useDebouncedPatches<InventoryItem>(
    (id, patch) => updateChild<InventoryItem>('inventory_item', id, patch),
    (message) => setError(message),
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    listChildren<InventoryItem>('inventory_item', sheet.id)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить инвентарь'))
      .finally(() => setLoading(false))
  }, [sheet.id])

  function editItem(id: string, patch: Partial<InventoryItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    schedule(id, patch)
  }

  function stepQuantity(item: InventoryItem, delta: number) {
    editItem(item.id, { quantity: Math.max(0, item.quantity + delta) })
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function collapseAll() {
    setCollapsed(new Set(items.map((it) => it.id)))
  }

  function expandAll() {
    setCollapsed(new Set())
  }

  // Тап по шапке карточки сворачивает/разворачивает её — но не когда тап
  // пришёлся на поле ввода или кнопку внутри шапки.
  function handleHeaderClick(e: MouseEvent<HTMLDivElement>, id: string) {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, button')) return
    toggleCollapse(id)
  }

  async function handleAdd() {
    if (!addName.trim()) return
    const nextOrder = items.length ? Math.max(...items.map((it) => it.sort_order)) + 1 : 0
    try {
      const created = await insertChild<InventoryItem>('inventory_item', {
        character_id: sheet.id,
        name: addName.trim(),
        quantity: Number(addQty) || 0,
        weight: Number(addWeight) || 0,
        value: Math.round(Number(addValue) || 0),
        notes: addNotes,
        sort_order: nextOrder,
      })
      setItems((prev) => [...prev, created])
      setAddName('')
      setAddQty('1')
      setAddWeight('0')
      setAddValue('0')
      setAddNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить предмет')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Удалить этот предмет?')) return
    discard(id)
    try {
      await deleteChild('inventory_item', id)
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить предмет')
    }
  }

  async function handleMove(id: string, dir: -1 | 1) {
    try {
      const result = await reorderItems(items, id, dir, (childId, sortOrder) =>
        updateChild<InventoryItem>('inventory_item', childId, { sort_order: sortOrder }),
      )
      if (!result) return
      setItems((prev) => applyReorderResult(prev, result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок')
    }
  }

  const filtered = search.trim()
    ? items.filter((it) => it.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  const totalWeight = items.reduce((sum, it) => sum + it.quantity * it.weight, 0)
  const totalValue = items.reduce((sum, it) => sum + it.quantity * it.value, 0)

  if (loading) return <p>Загрузка…</p>

  return (
    <div className="sheet-tab-inventory">
      <section className="sheet-section">
        <div className="tab-list-header">
          <h2>Инвентарь</h2>
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

        <input
          type="text"
          placeholder="Поиск по названию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <ul className="card-list">
          {filtered.length === 0 && <li className="card-sub-text">Ничего не найдено.</li>}
          {filtered.map((item) => {
            const isCollapsed = collapsed.has(item.id)
            return (
              <li key={item.id} className="card">
                <div className="item-card-head inv-card-head" onClick={(e) => handleHeaderClick(e, item.id)}>
                  {isCollapsed ? (
                    <div className="inv-collapsed-line">
                      <span className="inv-collapsed-name">{item.name}</span>
                      <span className="inv-collapsed-qty">×{item.quantity}</span>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => editItem(item.id, { name: e.target.value })}
                    />
                  )}
                  <div className="item-card-actions">
                    <button type="button" className="icon-btn" onClick={() => handleMove(item.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="icon-btn" onClick={() => handleMove(item.id, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => handleDelete(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="qty-row">
                    <span className="qty-row-label">Кол-во</span>
                    <button type="button" className="stat-btn" onClick={() => stepQuantity(item, -1)}>
                      −
                    </button>
                    <span className="qty-value">{item.quantity}</span>
                    <button type="button" className="stat-btn" onClick={() => stepQuantity(item, 1)}>
                      +
                    </button>
                  </div>
                )}

                {!isCollapsed && (
                  <div className="item-card-body">
                    <div className="item-card-row">
                      <label className="item-card-field">
                        Вес
                        <input
                          type="number"
                          value={item.weight}
                          onChange={(e) => editItem(item.id, { weight: Number(e.target.value) || 0 })}
                        />
                      </label>
                      <label className="item-card-field">
                        Ценность
                        <input
                          type="number"
                          value={item.value}
                          onChange={(e) => editItem(item.id, { value: Math.round(Number(e.target.value) || 0) })}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="Заметки…"
                      value={item.notes}
                      onChange={(e) => editItem(item.id, { notes: e.target.value })}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <p className="tab-list-footer">
          Всего вес: {totalWeight.toFixed(1)} кг · Стоимость: {totalValue} зм
        </p>

        <div className="card add-form">
          <span className="add-form-title">Добавить предмет</span>
          <input
            type="text"
            placeholder="Название предмета…"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
          <div className="item-card-row">
            <label className="item-card-field">
              Кол-во
              <input type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
            </label>
            <label className="item-card-field">
              Вес
              <input type="number" value={addWeight} onChange={(e) => setAddWeight(e.target.value)} />
            </label>
            <label className="item-card-field">
              Ценность
              <input type="number" value={addValue} onChange={(e) => setAddValue(e.target.value)} />
            </label>
          </div>
          <input
            type="text"
            placeholder="Заметки…"
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
