import { useEffect, useState } from 'react'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import type { Consumable, Potion } from '../../lib/types'
import { applyReorderResult, reorderItems } from './reorder'
import './tabs-npc.css'

// Общий компонент для вкладок «Зелья» и «Расходники» — таблицы potion и
// consumable устроены одинаково (name, quantity, description, sort_order).
type QuantityRow = Potion | Consumable

interface QuantityListTabProps {
  characterId: string
  table: 'potion' | 'consumable'
  title: string
  namePlaceholder: string
  descPlaceholder: string
  emptyText: string
}

export default function QuantityListTab({
  characterId,
  table,
  title,
  namePlaceholder,
  descPlaceholder,
  emptyText,
}: QuantityListTabProps) {
  const [items, setItems] = useState<QuantityRow[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addDesc, setAddDesc] = useState('')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  // Точечная блокировка кнопок конкретной карточки на время мутации —
  // без спиннера на весь список.
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, table])

  async function load() {
    setError('')
    try {
      setItems(await listChildren<QuantityRow>(table, characterId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список')
    }
  }

  async function handleAdd() {
    const name = addName.trim()
    if (!name) return
    setAdding(true)
    try {
      const maxSort = items && items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : -1
      await insertChild<QuantityRow>(table, {
        character_id: characterId,
        name,
        quantity: Math.max(0, Number(addQty) || 0),
        description: addDesc,
        sort_order: maxSort + 1,
      })
      setAddName('')
      setAddQty('1')
      setAddDesc('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setAdding(false)
    }
  }

  async function handleQtyChange(item: QuantityRow, delta: number) {
    const next = Math.max(0, item.quantity + delta)
    if (next === item.quantity) return
    setBusyId(item.id)
    try {
      await updateChild<QuantityRow>(table, item.id, { quantity: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить количество')
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(item: QuantityRow) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditDesc(item.description)
  }

  async function handleSaveEdit(item: QuantityRow) {
    if (!editName.trim()) return
    setBusyId(item.id)
    try {
      await updateChild<QuantityRow>(table, item.id, { name: editName, description: editDesc })
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(item: QuantityRow) {
    if (!window.confirm(`Удалить «${item.name}»?`)) return
    setBusyId(item.id)
    try {
      await deleteChild(table, item.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить запись')
    } finally {
      setBusyId(null)
    }
  }

  // Соседей ищем в полном (несортированном поиском) списке — так стрелки
  // двигают элемент в общем sort_order, а не в отфильтрованном подсписке.
  async function handleMove(item: QuantityRow, direction: -1 | 1) {
    if (!items) return
    setBusyId(item.id)
    try {
      const result = await reorderItems(items, item.id, direction, (childId, sortOrder) =>
        updateChild<QuantityRow>(table, childId, { sort_order: sortOrder }),
      )
      if (result) setItems((prev) => (prev ? applyReorderResult(prev, result) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок')
    } finally {
      setBusyId(null)
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = (items ?? []).filter((item) => !query || item.name.toLowerCase().includes(query))
  const totalQty = (items ?? []).reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="sheet-tab-qty-list">
      <section className="sheet-section">
        <h2>
          {title} ({totalQty} шт)
        </h2>

        <div className="tab-toolbar">
          <input type="text" placeholder="Поиск по названию…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {items === null && !error && <p>Загрузка…</p>}
        {error && <p className="auth-error">{error}</p>}
        {items && filtered.length === 0 && <p>{emptyText}</p>}

        {items && filtered.length > 0 && (
          <ul className="card-list">
            {filtered.map((item) => {
              const fullIdx = items.findIndex((i) => i.id === item.id)
              return (
                <li key={item.id} className="card item-card">
                  {editingId === item.id ? (
                    <div className="npc-form">
                      <div className="field">
                        <span>Название</span>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="field">
                        <span>Описание</span>
                        <textarea
                          className="textarea-field"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                        />
                      </div>
                      <div className="npc-form-actions">
                        <button
                          type="button"
                          disabled={!editName.trim() || busyId === item.id}
                          onClick={() => void handleSaveEdit(item)}
                        >
                          Сохранить
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="item-card-header">
                        <strong className="item-card-title">{item.name}</strong>
                        <div className="item-card-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={busyId === item.id || fullIdx <= 0}
                            onClick={() => void handleMove(item, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={busyId === item.id || fullIdx < 0 || fullIdx >= items.length - 1}
                            onClick={() => void handleMove(item, 1)}
                          >
                            ↓
                          </button>
                          <button type="button" className="icon-btn" onClick={() => startEdit(item)}>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn-danger"
                            disabled={busyId === item.id}
                            onClick={() => void handleDelete(item)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                      <div className="qty-row">
                        <span>Кол-во:</span>
                        <button
                          type="button"
                          className="stat-btn"
                          disabled={busyId === item.id}
                          onClick={() => void handleQtyChange(item, -1)}
                        >
                          −
                        </button>
                        <span className="qty-value">{item.quantity}</span>
                        <button
                          type="button"
                          className="stat-btn stat-btn-accent"
                          disabled={busyId === item.id}
                          onClick={() => void handleQtyChange(item, 1)}
                        >
                          +
                        </button>
                      </div>
                      {item.description && <p className="item-card-notes">{item.description}</p>}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="sheet-section">
        <h2>Добавить</h2>
        <div className="npc-form">
          <div className="field">
            <span>Название</span>
            <input
              type="text"
              placeholder={namePlaceholder}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
          </div>
          <div className="field">
            <span>Количество</span>
            <input type="number" min={0} value={addQty} onChange={(e) => setAddQty(e.target.value)} />
          </div>
          <div className="field">
            <span>Описание</span>
            <textarea
              className="textarea-field"
              placeholder={descPlaceholder}
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
            />
          </div>
          <div className="npc-form-actions">
            <button type="button" disabled={!addName.trim() || adding} onClick={() => void handleAdd()}>
              {adding ? 'Добавляем…' : '+ Добавить'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
