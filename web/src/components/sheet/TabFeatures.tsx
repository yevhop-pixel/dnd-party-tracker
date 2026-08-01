import { useEffect, useState } from 'react'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import type { Feature } from '../../lib/types'
import type { SheetTabProps } from './types'
import { applyReorderResult, reorderItems } from './reorder'
import { useDebouncedPatches } from './useDebouncedPatches'
import { getUiState, setUiState } from '../../lib/uiState'
import './tabs-inv.css'

// Свёрнутые карточки запоминаем per-лист — у разных персонажей разный набор черт.
function collapsedKey(sheetId: string): string {
  return `collapsed-feature-${sheetId}`
}

export default function TabFeatures({ sheet }: SheetTabProps) {
  const [items, setItems] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addTitle, setAddTitle] = useState('')
  const [addDesc, setAddDesc] = useState('')

  const { schedule, discard } = useDebouncedPatches<Feature>(
    (id, patch) => updateChild<Feature>('feature', id, patch),
    (message) => setError(message),
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    setCollapsed(new Set(getUiState<string[]>(collapsedKey(sheet.id)) ?? []))
    listChildren<Feature>('feature', sheet.id)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить черты'))
      .finally(() => setLoading(false))
  }, [sheet.id])

  // Точечная правка поля: обновляем локально сразу (без «прыжка» списка)
  // и откладываем запрос к серверу.
  function editItem(id: string, patch: Partial<Feature>) {
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

  async function handleAdd() {
    if (!addTitle.trim()) return
    const nextOrder = items.length ? Math.max(...items.map((it) => it.sort_order)) + 1 : 0
    try {
      const created = await insertChild<Feature>('feature', {
        character_id: sheet.id,
        title: addTitle.trim(),
        description: addDesc,
        sort_order: nextOrder,
      })
      setItems((prev) => [...prev, created])
      setAddTitle('')
      setAddDesc('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить черту')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Удалить эту черту?')) return
    discard(id)
    try {
      await deleteChild('feature', id)
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить черту')
    }
  }

  // Порядок берём в исходном (не отфильтрованном) списке, чтобы кнопки
  // вверх/вниз работали предсказуемо даже при активном поиске.
  async function handleMove(id: string, dir: -1 | 1) {
    try {
      const result = await reorderItems(items, id, dir, (childId, sortOrder) =>
        updateChild<Feature>('feature', childId, { sort_order: sortOrder }),
      )
      if (!result) return
      setItems((prev) => applyReorderResult(prev, result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок')
    }
  }

  const filtered = search.trim()
    ? items.filter((it) => it.title.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  if (loading) return <p>Загрузка…</p>

  return (
    <div className="sheet-tab-features">
      <section className="sheet-section">
        <div className="tab-list-header">
          <h2>Черты и особенности</h2>
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
          {filtered.map((ft) => {
            const isCollapsed = collapsed.has(ft.id)
            return (
              <li key={ft.id} className="card">
                <div className="item-card-head">
                  <input type="text" value={ft.title} onChange={(e) => editItem(ft.id, { title: e.target.value })} />
                  <div className="item-card-actions">
                    <button type="button" className="icon-btn" onClick={() => toggleCollapse(ft.id)}>
                      {isCollapsed ? '▾' : '▴'}
                    </button>
                    <button type="button" className="icon-btn" onClick={() => handleMove(ft.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="icon-btn" onClick={() => handleMove(ft.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="icon-btn icon-btn-danger" onClick={() => handleDelete(ft.id)}>
                      ✕
                    </button>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="item-card-body">
                    <textarea
                      className="item-card-desc"
                      placeholder="Описание…"
                      value={ft.description}
                      onChange={(e) => editItem(ft.id, { description: e.target.value })}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="card add-form">
          <span className="add-form-title">Добавить черту</span>
          <input
            type="text"
            placeholder="Название пассивки…"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />
          <textarea
            className="item-card-desc"
            placeholder="Описание…"
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
          />
          <button type="button" onClick={handleAdd} disabled={!addTitle.trim()}>
            + Добавить
          </button>
        </div>
      </section>
    </div>
  )
}
