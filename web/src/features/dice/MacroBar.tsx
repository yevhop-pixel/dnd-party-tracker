import { useEffect, useState } from 'react'
import type { CharacterMacro, CharacterSheet } from '../../lib/types'
import { deleteMacro, insertMacro, listMacros, updateMacro } from './macrosApi'
import { submitRoll } from './diceApi'
import { parseNotation } from './notation'
import { getUiState, setUiState } from '../../lib/uiState'
import './dice.css'

// Бейдж с последним результатом висит на кнопке недолго — это подсказка
// «бросок ушёл», а не замена ленты (лента — единственный источник правды).
const BADGE_TTL_MS = 2500

function fieldError(value: string): string {
  if (!value.trim()) return ''
  return parseNotation(value) ? '' : 'Неверная нотация, например: 1d20+3'
}

export interface MacroBarProps {
  campaignId: string
  sheet: CharacterSheet
}

export default function MacroBar({ campaignId, sheet }: MacroBarProps) {
  const [macros, setMacros] = useState<CharacterMacro[] | null>(null)
  const [error, setError] = useState('')
  const [rollingId, setRollingId] = useState<string | null>(null)
  const [badges, setBadges] = useState<Record<string, number>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNotation, setEditNotation] = useState('')

  // Свёрнутость макросов запоминается: на телефоне их обычно прячут совсем,
  // на большом экране держат открытыми.
  const [collapsed, setCollapsed] = useState(() => getUiState<boolean>('macros-collapsed') === true)
  const [adding, setAdding] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addNotation, setAddNotation] = useState('')

  useEffect(() => {
    let cancelled = false
    setMacros(null)
    setError('')
    listMacros(sheet.id)
      .then((rows) => {
        if (!cancelled) setMacros(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить макросы')
      })
    return () => {
      cancelled = true
    }
  }, [sheet.id])

  function toggleCollapsed(next: boolean) {
    setCollapsed(next)
    setUiState('macros-collapsed', next)
  }

  function showBadge(macroId: string, value: number) {
    setBadges((prev) => ({ ...prev, [macroId]: value }))
    setTimeout(() => {
      setBadges((prev) => {
        const { [macroId]: _removed, ...rest } = prev
        return rest
      })
    }, BADGE_TTL_MS)
  }

  async function handleRoll(macro: CharacterMacro) {
    setError('')
    setRollingId(macro.id)
    try {
      const roll = await submitRoll(campaignId, sheet.id, macro.notation, 'normal', false)
      showBadge(macro.id, roll.final_result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось бросить макрос')
    } finally {
      setRollingId(null)
    }
  }

  async function handleAdd() {
    const label = addLabel.trim()
    if (!label || fieldError(addNotation) || !addNotation.trim()) return
    setError('')
    const nextOrder = macros?.length ? Math.max(...macros.map((m) => m.sort_order)) + 1 : 0
    try {
      const created = await insertMacro(sheet.id, label, addNotation.trim(), nextOrder)
      setMacros((prev) => [...(prev ?? []), created])
      setAdding(false)
      setAddLabel('')
      setAddNotation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макрос')
    }
  }

  function startEdit(macro: CharacterMacro) {
    setEditingId(macro.id)
    setEditLabel(macro.label)
    setEditNotation(macro.notation)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel('')
    setEditNotation('')
  }

  async function handleSaveEdit(id: string) {
    const label = editLabel.trim()
    if (!label || fieldError(editNotation) || !editNotation.trim()) return
    setError('')
    try {
      const updated = await updateMacro(id, { label, notation: editNotation.trim() })
      setMacros((prev) => (prev ?? []).map((m) => (m.id === id ? updated : m)))
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макрос')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Удалить этот макрос?')) return
    setError('')
    try {
      await deleteMacro(id)
      setMacros((prev) => (prev ?? []).filter((m) => m.id !== id))
      if (editingId === id) cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить макрос')
    }
  }

  const addNotationError = fieldError(addNotation)
  const editNotationError = fieldError(editNotation)

  if (collapsed) {
    return (
      <section className="dice-macro-bar sheet-section dice-macro-bar-collapsed">
        <button type="button" className="macro-collapse-head" onClick={() => toggleCollapsed(false)}>
          <span>Макросы{macros ? ` (${macros.length})` : ''}</span>
          <span className="macro-collapse-caret">▾</span>
        </button>
      </section>
    )
  }

  return (
    <section className="dice-macro-bar sheet-section">
      <button type="button" className="macro-collapse-head" onClick={() => toggleCollapsed(true)}>
        <span>Макросы</span>
        <span className="macro-collapse-caret">▴</span>
      </button>

      {error && <p className="auth-error">{error}</p>}

      {macros === null && !error && <p>Загрузка…</p>}

      {macros && macros.length === 0 && !adding && (
        <p className="card-sub-text">Сохраните частые броски: «Атака мечом» 1d20+7</p>
      )}

      {macros && macros.length > 0 && (
        <div className="dice-macro-row">
          {macros.map((macro) =>
            editingId === macro.id ? (
              <div key={macro.id} className="dice-macro-edit-form">
                <input
                  type="text"
                  value={editLabel}
                  placeholder="Название"
                  onChange={(e) => setEditLabel(e.target.value)}
                />
                <input
                  type="text"
                  value={editNotation}
                  placeholder="Нотация, например 1d20+7"
                  onChange={(e) => setEditNotation(e.target.value)}
                />
                {editNotationError && <p className="dice-field-error">{editNotationError}</p>}
                <div className="dice-macro-edit-actions">
                  <button
                    type="button"
                    disabled={!editLabel.trim() || !editNotation.trim() || !!editNotationError}
                    onClick={() => void handleSaveEdit(macro.id)}
                  >
                    Сохранить
                  </button>
                  <button type="button" className="dice-btn-secondary" onClick={cancelEdit}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="dice-macro-danger-btn"
                    onClick={() => void handleDelete(macro.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ) : (
              <div key={macro.id} className="dice-macro-item">
                <button
                  type="button"
                  className="dice-macro-btn"
                  disabled={rollingId === macro.id}
                  onClick={() => void handleRoll(macro)}
                >
                  <span className="dice-macro-label">{macro.label}</span>
                  <span className="dice-macro-notation">{macro.notation}</span>
                  {macro.id in badges && <span className="dice-macro-badge">{badges[macro.id]}</span>}
                </button>
                <button
                  type="button"
                  className="dice-macro-edit-btn"
                  title="Изменить макрос"
                  onClick={() => startEdit(macro)}
                >
                  ✎
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {adding ? (
        <div className="dice-macro-edit-form">
          <input
            type="text"
            value={addLabel}
            autoFocus
            placeholder="Название, например «Атака мечом»"
            onChange={(e) => setAddLabel(e.target.value)}
          />
          <input
            type="text"
            value={addNotation}
            placeholder="Нотация, например 1d20+7"
            onChange={(e) => setAddNotation(e.target.value)}
          />
          {addNotationError && <p className="dice-field-error">{addNotationError}</p>}
          <div className="dice-macro-edit-actions">
            <button
              type="button"
              disabled={!addLabel.trim() || !addNotation.trim() || !!addNotationError}
              onClick={() => void handleAdd()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="dice-btn-secondary"
              onClick={() => {
                setAdding(false)
                setAddLabel('')
                setAddNotation('')
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dice-btn-secondary" onClick={() => setAdding(true)}>
          + Макрос
        </button>
      )}
    </section>
  )
}
