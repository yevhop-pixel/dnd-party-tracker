import { useEffect, useState } from 'react'
import type { SheetTabProps } from './types'
import type { Quest } from '../../lib/types'
import { deleteChild, insertChild, listChildren, updateChild } from '../../lib/api'
import './tabs-npc.css'

// type в базе — свободный текст, но UI ограничивает выбор двумя значениями.
const QUEST_TYPES = ['Сюжет', 'Побочка'] as const
const TYPE_FILTERS = ['Все', ...QUEST_TYPES] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

const QUEST_STATUSES = ['Активный', 'Завершённый', 'Проваленный'] as const
const STATUS_FILTERS = ['Все', ...QUEST_STATUSES] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function nextType(current: string): string {
  const idx = QUEST_TYPES.indexOf(current as (typeof QUEST_TYPES)[number])
  return QUEST_TYPES[(idx + 1) % QUEST_TYPES.length] ?? QUEST_TYPES[0]
}

function statusClass(status: string): string {
  if (status === 'Завершённый') return 'status-success'
  if (status === 'Проваленный') return 'status-failed'
  return 'status-active'
}

interface QuestDraft {
  name: string
  type: string
  description: string
}

const EMPTY_DRAFT: QuestDraft = { name: '', type: QUEST_TYPES[0], description: '' }

// Форма с полями квеста — общая для добавления и для редактирования карточки.
function QuestForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
}: {
  draft: QuestDraft
  onChange: (patch: Partial<QuestDraft>) => void
  onSubmit: () => void
  onCancel?: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="npc-form">
      <div className="field">
        <span>Название квеста</span>
        <input type="text" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="field">
        <span>Тип</span>
        <button type="button" className="type-badge" onClick={() => onChange({ type: nextType(draft.type) })}>
          {draft.type}
        </button>
      </div>
      <div className="field">
        <span>Описание</span>
        <textarea
          className="textarea-field"
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
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

export default function TabQuests({ sheet }: SheetTabProps) {
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('Все')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Все')

  const [addDraft, setAddDraft] = useState<QuestDraft>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<QuestDraft>(EMPTY_DRAFT)

  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id])

  async function load() {
    setError('')
    try {
      setQuests(await listChildren<Quest>('quest', sheet.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить квесты')
    }
  }

  async function handleAdd() {
    if (!addDraft.name.trim()) return
    setAdding(true)
    try {
      await insertChild<Quest>('quest', { character_id: sheet.id, ...addDraft, status: QUEST_STATUSES[0] })
      setAddDraft(EMPTY_DRAFT)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить квест')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(quest: Quest) {
    setEditingId(quest.id)
    // Сохраняем исходное значение type как есть — дефолт («Сюжет») нужен
    // только для НОВОГО квеста, а не для подмены уже сохранённого пустого.
    setEditDraft({ name: quest.name, type: quest.type, description: quest.description })
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id)
    try {
      await updateChild<Quest>('quest', id, editDraft)
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetStatus(quest: Quest, status: string) {
    if (quest.status === status) return
    setBusyId(quest.id)
    try {
      await updateChild<Quest>('quest', quest.id, { status })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(quest: Quest) {
    if (!window.confirm(`Удалить квест «${quest.name || 'без названия'}»?`)) return
    setBusyId(quest.id)
    try {
      await deleteChild('quest', quest.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить квест')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = (quests ?? []).filter(
    (quest) =>
      (typeFilter === 'Все' || quest.type === typeFilter) && (statusFilter === 'Все' || quest.status === statusFilter),
  )

  return (
    <div className="sheet-tab-quests">
      <section className="sheet-section">
        <h2>Журнал квестов ({filtered.length})</h2>

        <div className="tab-toolbar">
          <select className="tab-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="tab-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {quests === null && !error && <p>Загрузка…</p>}
        {error && <p className="auth-error">{error}</p>}
        {quests && filtered.length === 0 && <p>Квестов нет.</p>}

        {quests && filtered.length > 0 && (
          <ul className="card-list">
            {filtered.map((quest) => (
              <li key={quest.id} className="card item-card">
                {editingId === quest.id ? (
                  <QuestForm
                    draft={editDraft}
                    onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                    onSubmit={() => void handleSaveEdit(quest.id)}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Сохранить"
                    disabled={busyId === quest.id}
                  />
                ) : (
                  <>
                    <div className="item-card-header">
                      <strong className="item-card-title">{quest.name || 'Без названия'}</strong>
                      <div className="item-card-actions">
                        <span className="type-badge">{quest.type || '—'}</span>
                        <button type="button" className="icon-btn" onClick={() => startEdit(quest)}>
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          disabled={busyId === quest.id}
                          onClick={() => void handleDelete(quest)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                    {quest.description && <p className="item-card-notes">{quest.description}</p>}
                    <div className="status-row">
                      {QUEST_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`status-btn ${statusClass(status)}${quest.status === status ? ' status-btn-selected' : ''}`}
                          disabled={busyId === quest.id}
                          onClick={() => void handleSetStatus(quest, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sheet-section">
        <h2>Добавить квест</h2>
        <QuestForm
          draft={addDraft}
          onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
          onSubmit={() => void handleAdd()}
          submitLabel={adding ? 'Добавляем…' : '+ Добавить'}
          disabled={adding}
        />
      </section>
    </div>
  )
}
