import { useEffect, useState } from 'react'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import type { EquippedItem } from '../../lib/types'
import type { SheetTabProps } from './types'
import { useDebouncedPatches } from './useDebouncedPatches'
import './tabs-inv.css'

// Фиксированный порядок слотов экипировки.
const SLOTS = [
  'Оружие 1',
  'Оружие 2',
  'Доспех',
  'Щит',
  'Кольцо 1',
  'Кольцо 2',
  'Амулет',
  'Шлем',
  'Плащ',
  'Перчатки',
  'Сапоги',
]

export default function TabEquipped({ sheet }: SheetTabProps) {
  const [items, setItems] = useState<EquippedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Слот, для которого сейчас открыта инлайн-форма «Надеть».
  const [addingSlot, setAddingSlot] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addNotes, setAddNotes] = useState('')

  const { schedule, discard } = useDebouncedPatches<EquippedItem>(
    (id, patch) => updateChild<EquippedItem>('equipped_item', id, patch),
    (message) => setError(message),
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    listChildren<EquippedItem>('equipped_item', sheet.id)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить экипировку'))
      .finally(() => setLoading(false))
  }, [sheet.id])

  function editItem(id: string, patch: Partial<EquippedItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    schedule(id, patch)
  }

  async function handleRemove(id: string) {
    discard(id)
    try {
      await deleteChild('equipped_item', id)
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось снять предмет')
    }
  }

  function openAddForm(slot: string) {
    setAddingSlot(slot)
    setAddName('')
    setAddNotes('')
  }

  function closeAddForm() {
    setAddingSlot(null)
  }

  async function handleAdd(slot: string) {
    if (!addName.trim()) return
    const nextOrder = items.length ? Math.max(...items.map((it) => it.sort_order)) + 1 : 0
    try {
      const created = await insertChild<EquippedItem>('equipped_item', {
        character_id: sheet.id,
        slot,
        name: addName.trim(),
        notes: addNotes,
        sort_order: nextOrder,
      })
      setItems((prev) => [...prev, created])
      setAddingSlot(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось надеть предмет')
    }
  }

  if (loading) return <p>Загрузка…</p>

  // Слоты, которых нет в фиксированном списке (легаси-данные) — не теряем,
  // выводим отдельным блоком в конце.
  const extraSlots = Array.from(new Set(items.map((it) => it.slot).filter((slot) => !SLOTS.includes(slot))))

  return (
    <div className="sheet-tab-equipped">
      <section className="sheet-section">
        <h2>Экипировка</h2>

        {error && <p className="tab-error">{error}</p>}

        <ul className="card-list">
          {SLOTS.map((slot) => {
            const slotItems = items.filter((it) => it.slot === slot)
            return (
              <li key={slot} className="card equip-slot-card">
                <span className="badge equip-slot-label">{slot}</span>

                {slotItems.map((eq) => (
                  <div key={eq.id} className="equip-item">
                    <div className="item-card-head">
                      <input
                        type="text"
                        value={eq.name}
                        onChange={(e) => editItem(eq.id, { name: e.target.value })}
                      />
                      <div className="item-card-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          onClick={() => handleRemove(eq.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Заметки (урон, эффекты)…"
                      value={eq.notes}
                      onChange={(e) => editItem(eq.id, { notes: e.target.value })}
                    />
                  </div>
                ))}

                {slotItems.length === 0 && addingSlot !== slot && (
                  <div className="equip-slot-empty">
                    <span>Пусто</span>
                    <button type="button" onClick={() => openAddForm(slot)}>
                      Надеть
                    </button>
                  </div>
                )}

                {addingSlot === slot && (
                  <div className="equip-add-inline">
                    <input
                      type="text"
                      placeholder="Название предмета…"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Заметки (урон, эффекты)…"
                      value={addNotes}
                      onChange={(e) => setAddNotes(e.target.value)}
                    />
                    <div className="item-card-row">
                      <button type="button" onClick={() => handleAdd(slot)} disabled={!addName.trim()}>
                        Надеть
                      </button>
                      <button type="button" className="tab-link-btn" onClick={closeAddForm}>
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}

          {extraSlots.map((slot) => (
            <li key={slot} className="card equip-slot-card">
              <span className="badge equip-slot-label">{slot}</span>
              {items
                .filter((it) => it.slot === slot)
                .map((eq) => (
                  <div key={eq.id} className="equip-item">
                    <div className="item-card-head">
                      <input
                        type="text"
                        value={eq.name}
                        onChange={(e) => editItem(eq.id, { name: e.target.value })}
                      />
                      <div className="item-card-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          onClick={() => handleRemove(eq.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Заметки (урон, эффекты)…"
                      value={eq.notes}
                      onChange={(e) => editItem(eq.id, { notes: e.target.value })}
                    />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
