import { useEffect, useState } from 'react'
import type { SheetTabProps } from './types'
import type { Npc } from '../../lib/types'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import { getUiState, setUiState } from '../../lib/uiState'
import AutoTextarea from '../AutoTextarea'
import './tabs-npc.css'

// Таблица npc не имеет sort_order — перемещение элементов не делаем.

// Свёрнутые карточки запоминаем per-лист — у разных персонажей разный набор NPC.
function collapsedKey(sheetId: string): string {
  return `collapsed-npc-${sheetId}`
}
const RELATIONSHIPS = ['Дружел.', 'Нейтр.', 'Враждеб.'] as const
const RELATIONSHIP_FILTERS = ['Все', ...RELATIONSHIPS] as const
type RelationshipFilter = (typeof RELATIONSHIP_FILTERS)[number]

function relationshipClass(relationship: string): string {
  if (relationship === 'Дружел.') return 'rel-badge rel-friendly'
  if (relationship === 'Враждеб.') return 'rel-badge rel-hostile'
  return 'rel-badge rel-neutral'
}

function nextRelationship(current: string): string {
  const idx = RELATIONSHIPS.indexOf(current as (typeof RELATIONSHIPS)[number])
  return RELATIONSHIPS[(idx + 1) % RELATIONSHIPS.length] ?? RELATIONSHIPS[0]
}

interface NpcDraft {
  name: string
  role: string
  faction: string
  location: string
  relationship: string
  tags: string
  notes: string
}

const EMPTY_DRAFT: NpcDraft = {
  name: '',
  role: '',
  faction: '',
  location: '',
  relationship: RELATIONSHIPS[0],
  tags: '',
  notes: '',
}

// Форма с полями NPC — общая для добавления и для редактирования карточки.
function NpcForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
}: {
  draft: NpcDraft
  onChange: (patch: Partial<NpcDraft>) => void
  onSubmit: () => void
  onCancel?: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="npc-form">
      <div className="field">
        <span>Имя</span>
        <input type="text" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="stat-grid stat-grid-2">
        <div className="field">
          <span>Роль/класс</span>
          <input type="text" value={draft.role} onChange={(e) => onChange({ role: e.target.value })} />
        </div>
        <div className="field">
          <span>Фракция</span>
          <input type="text" value={draft.faction} onChange={(e) => onChange({ faction: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <span>Локация</span>
        <input type="text" value={draft.location} onChange={(e) => onChange({ location: e.target.value })} />
      </div>
      <div className="field">
        <span>Отношение</span>
        <button
          type="button"
          className={relationshipClass(draft.relationship)}
          onClick={() => onChange({ relationship: nextRelationship(draft.relationship) })}
        >
          {draft.relationship}
        </button>
      </div>
      <div className="field">
        <span>Теги (через запятую)</span>
        <input type="text" value={draft.tags} onChange={(e) => onChange({ tags: e.target.value })} />
      </div>
      <div className="field">
        <span>Заметки</span>
        <AutoTextarea className="textarea-field" value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
      <div className="npc-form-actions">
        <button type="button" disabled={!draft.name.trim() || disabled} onClick={onSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </div>
  )
}

export default function TabNpcs({ sheet }: SheetTabProps) {
  const [npcs, setNpcs] = useState<Npc[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [relationFilter, setRelationFilter] = useState<RelationshipFilter>('Все')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [addDraft, setAddDraft] = useState<NpcDraft>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<NpcDraft>(EMPTY_DRAFT)

  // Точечная блокировка кнопок конкретной карточки на время мутации —
  // без спиннера на весь список.
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setCollapsed(new Set(getUiState<string[]>(collapsedKey(sheet.id)) ?? []))
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id])

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
    const next = new Set((npcs ?? []).map((npc) => npc.id))
    setUiState(collapsedKey(sheet.id), Array.from(next))
    setCollapsed(next)
  }

  function expandAll() {
    setUiState(collapsedKey(sheet.id), [])
    setCollapsed(new Set())
  }

  async function load() {
    setError('')
    try {
      setNpcs(await listChildren<Npc>('npc', sheet.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить NPC')
    }
  }

  async function handleAdd() {
    if (!addDraft.name.trim()) return
    setAdding(true)
    try {
      await insertChild<Npc>('npc', { character_id: sheet.id, ...addDraft })
      setAddDraft(EMPTY_DRAFT)
      setAddOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить NPC')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(npc: Npc) {
    setEditingId(npc.id)
    setEditDraft({
      name: npc.name,
      role: npc.role,
      faction: npc.faction,
      location: npc.location,
      relationship: npc.relationship,
      tags: npc.tags,
      notes: npc.notes,
    })
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id)
    try {
      await updateChild<Npc>('npc', id, editDraft)
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCycleRelationship(npc: Npc) {
    setBusyId(npc.id)
    try {
      await updateChild<Npc>('npc', npc.id, { relationship: nextRelationship(npc.relationship) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить отношение')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(npc: Npc) {
    if (!window.confirm(`Удалить «${npc.name || 'этого NPC'}»?`)) return
    setBusyId(npc.id)
    try {
      await deleteChild('npc', npc.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить NPC')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = (npcs ?? []).filter((npc) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || npc.name.toLowerCase().includes(query)
    const matchesRelation = relationFilter === 'Все' || npc.relationship === relationFilter
    return matchesSearch && matchesRelation
  })

  return (
    <div className="sheet-tab-npcs">
      <section className="sheet-section">
        <div className="tab-list-header">
          <h2>Персонажи ({filtered.length})</h2>
          <button
            type="button"
            className="tab-add-toggle"
            title={addOpen ? 'Закрыть форму' : 'Добавить'}
            aria-expanded={addOpen}
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? '×' : '+'}
          </button>
          <div className="tab-list-actions">
            <button type="button" className="tab-link-btn" onClick={collapseAll}>
              Свернуть все
            </button>
            <button type="button" className="tab-link-btn" onClick={expandAll}>
              Развернуть все
            </button>
          </div>
        </div>

        {addOpen && (
          <section className="sheet-section tab-add-panel">
            <h2>Добавить персонажа / NPC</h2>
            <NpcForm
              draft={addDraft}
              onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
              onSubmit={() => void handleAdd()}
              submitLabel={adding ? 'Добавляем…' : '+ Добавить'}
              disabled={adding}
            />
          </section>
        )}

        <div className="tab-toolbar">
          <input type="text" placeholder="Поиск по имени…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select
            className="tab-select"
            value={relationFilter}
            onChange={(e) => setRelationFilter(e.target.value as RelationshipFilter)}
          >
            {RELATIONSHIP_FILTERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {npcs === null && !error && <p>Загрузка…</p>}
        {error && <p className="auth-error">{error}</p>}
        {npcs && filtered.length === 0 && <p>Персонажей нет.</p>}

        {npcs && filtered.length > 0 && (
          <ul className="card-list">
            {filtered.map((npc) => {
              const isCollapsed = collapsed.has(npc.id)
              return (
                <li key={npc.id} className="card item-card">
                  {editingId === npc.id ? (
                    <NpcForm
                      draft={editDraft}
                      onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                      onSubmit={() => void handleSaveEdit(npc.id)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Сохранить"
                      disabled={busyId === npc.id}
                    />
                  ) : (
                    <>
                      <div className="item-card-header">
                        <strong className="item-card-title">{npc.name || 'Без имени'}</strong>
                        <div className="item-card-actions">
                          <button type="button" className="icon-btn" onClick={() => toggleCollapse(npc.id)}>
                            {isCollapsed ? '▾' : '▴'}
                          </button>
                          <button
                            type="button"
                            className={relationshipClass(npc.relationship)}
                            disabled={busyId === npc.id}
                            onClick={() => void handleCycleRelationship(npc)}
                          >
                            {npc.relationship}
                          </button>
                          <button type="button" className="text-btn" onClick={() => startEdit(npc)}>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="text-btn text-btn-danger"
                            disabled={busyId === npc.id}
                            onClick={() => void handleDelete(npc)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && (npc.role || npc.faction || npc.location) && (
                        <div className="item-card-meta">
                          {npc.role && <span>{npc.role}</span>}
                          {npc.faction && <span>{npc.faction}</span>}
                          {npc.location && <span>{npc.location}</span>}
                        </div>
                      )}
                      {!isCollapsed && npc.tags && <div className="item-card-tags">{npc.tags}</div>}
                      {!isCollapsed && npc.notes && <p className="item-card-notes">{npc.notes}</p>}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
