import { useEffect, useRef, useState } from 'react'
import type { SheetTabProps } from './types'
import type { CharacterSheet } from '../../lib/types'
import { removeAvatar, uploadAvatar } from '../../lib/avatars'
import Avatar from '../Avatar'
import { submitCheckRoll } from '../../features/dice/diceApi'
import { rollNotation } from '../../features/dice/notation'

// Модификатор характеристики по правилам D&D: floor((значение - 10) / 2).
function abilityModifierValue(value: number): number {
  return Math.floor((value - 10) / 2)
}

function abilityModifier(value: number): string {
  const mod = abilityModifierValue(value)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

// Числовое поле с кнопками -/+ и прямым вводом. Держим локальный текст,
// чтобы можно было напечатать минус или временно очистить поле, не теряя фокус.
function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  showModifier = false,
  onRoll,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  step?: number
  min?: number
  max?: number
  showModifier?: boolean
  // Если задан — заголовок карточки (label + модификатор) становится
  // кликабельной зоной для броска d20. Кнопки -/+ и поле ввода в неё не
  // входят, чтобы правка значения не запускала бросок.
  onRoll?: () => void
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function clamp(next: number): number {
    let result = next
    if (min !== undefined) result = Math.max(min, result)
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  function handleTextChange(raw: string) {
    const cleaned = raw.replace(/[^0-9-]/g, '')
    setText(cleaned)
    if (cleaned === '' || cleaned === '-') return
    const parsed = Number(cleaned)
    if (!Number.isNaN(parsed)) onChange(clamp(parsed))
  }

  function applyStep(delta: number) {
    onChange(clamp(value + delta))
  }

  return (
    <div className={`stat-field${onRoll ? ' stat-field-rollable' : ''}`}>
      {onRoll ? (
        <button type="button" className="stat-field-header" onClick={onRoll} title={`Бросить ${label} (d20)`}>
          <span className="stat-field-label">{label}</span>
          {showModifier && <span className="stat-field-mod">{abilityModifier(value)}</span>}
          <span className="stat-field-dice" aria-hidden="true">
            🎲
          </span>
        </button>
      ) : (
        <>
          <span className="stat-field-label">{label}</span>
          {showModifier && <span className="stat-field-mod">{abilityModifier(value)}</span>}
        </>
      )}
      <div className="stat-field-row">
        <button type="button" className="stat-btn" onClick={() => applyStep(-step)}>
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          className="stat-input"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <button type="button" className="stat-btn" onClick={() => applyStep(step)}>
          +
        </button>
      </div>
    </div>
  )
}

export default function TabStats({ sheet, onSheetChange }: SheetTabProps) {
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [rollToast, setRollToast] = useState<string | null>(null)
  const rollToastTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (rollToastTimer.current !== null) window.clearTimeout(rollToastTimer.current)
    }
  }, [])

  function showRollToast(text: string) {
    setRollToast(text)
    if (rollToastTimer.current !== null) window.clearTimeout(rollToastTimer.current)
    rollToastTimer.current = window.setTimeout(() => setRollToast(null), 4000)
  }

  // Бросок проверки характеристики/инициативы прямо с карточки. В кампании —
  // пишем в общую ленту (submitCheckRoll), вне кампании — бросаем локально
  // через notation.ts, ничего никуда не отправляя.
  function rollCheck(label: string, modifier: number) {
    if (sheet.campaign_id) {
      submitCheckRoll(sheet.campaign_id, sheet.id, label, modifier)
        .then((roll) => showRollToast(`${label}: ${roll.total} (${roll.detail})`))
        .catch((err) => {
          showRollToast(`${label}: не удалось бросить — ${err instanceof Error ? err.message : 'ошибка'}`)
        })
      return
    }
    const roll = rollNotation({ terms: [{ sign: 1, count: 1, sides: 20 }], modifier })
    showRollToast(`${label}: ${roll.total} (${roll.detail}) — вне кампании, в ленту не записано`)
  }

  function set<K extends keyof CharacterSheet>(key: K, value: CharacterSheet[K]) {
    onSheetChange({ [key]: value } as Partial<CharacterSheet>)
  }

  // uploadAvatar/removeAvatar сами не пишут avatar_path в БД (см.
  // lib/avatars.ts) — единственный путь записи здесь, через onSheetChange
  // и автосейв SheetEditor, чтобы не было двойной записи листа.
  async function handleAvatarUpload(file: File) {
    setAvatarError('')
    setAvatarBusy(true)
    try {
      const path = await uploadAvatar(sheet, file)
      onSheetChange({ avatar_path: path })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось загрузить фото')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleAvatarRemove() {
    setAvatarError('')
    setAvatarBusy(true)
    try {
      await removeAvatar(sheet)
      onSheetChange({ avatar_path: null })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось убрать фото')
    } finally {
      setAvatarBusy(false)
    }
  }

  function stepHp(delta: number) {
    const next = Math.min(sheet.hp_max, Math.max(0, sheet.hp_current + delta))
    set('hp_current', next)
  }

  // При уменьшении макс. ХП ниже текущего — зажимаем текущее до нового
  // максимума одним патчем, чтобы hp_current никогда не превышал hp_max.
  function setHpMax(next: number) {
    const clampedMax = Math.max(0, next)
    const patch: Partial<CharacterSheet> = { hp_max: clampedMax }
    if (sheet.hp_current > clampedMax) patch.hp_current = clampedMax
    onSheetChange(patch)
  }

  return (
    <div className="sheet-tab-stats">
      <section className="sheet-section">
        <h2>Профиль</h2>
        <div className="avatar-editor">
          <Avatar path={sheet.avatar_path} name={sheet.char_name || sheet.name} size={96} />
          <div className="avatar-editor-actions">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void handleAvatarUpload(file)
              }}
            />
            <button type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
              {avatarBusy ? 'Загружаем…' : 'Загрузить фото'}
            </button>
            {sheet.avatar_path && (
              <button type="button" disabled={avatarBusy} onClick={() => void handleAvatarRemove()}>
                Убрать
              </button>
            )}
          </div>
        </div>
        {avatarError && <p className="auth-error">{avatarError}</p>}
        <div className="field">
          <span>Имя персонажа</span>
          <input
            type="text"
            value={sheet.char_name}
            onChange={(e) => set('char_name', e.target.value)}
          />
        </div>
        <div className="stat-grid stat-grid-2">
          <div className="field">
            <span>Класс</span>
            <input type="text" value={sheet.char_class} onChange={(e) => set('char_class', e.target.value)} />
          </div>
          <div className="field">
            <span>Раса</span>
            <input type="text" value={sheet.char_race} onChange={(e) => set('char_race', e.target.value)} />
          </div>
        </div>
        <div className="stat-grid stat-grid-2">
          <div className="field">
            <span>Уровень</span>
            <input
              type="number"
              value={sheet.char_level}
              onChange={(e) => set('char_level', Math.round(Number(e.target.value) || 0))}
            />
          </div>
          <div className="field">
            <span>Мировоззрение</span>
            <input
              type="text"
              value={sheet.char_alignment}
              onChange={(e) => set('char_alignment', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="sheet-section">
        <h2>Золото</h2>
        <div className="stat-grid stat-grid-3">
          <NumberStepper label="Кошелёк" value={sheet.wallet_gold} min={0} onChange={(v) => set('wallet_gold', v)} />
          <NumberStepper label="Банк" value={sheet.bank_gold} min={0} onChange={(v) => set('bank_gold', v)} />
          <NumberStepper label="Долг" value={sheet.debt_gold} min={0} onChange={(v) => set('debt_gold', v)} />
        </div>
        <div className="field">
          <span>Заметка о валюте</span>
          <input
            type="text"
            value={sheet.other_currency_note}
            onChange={(e) => set('other_currency_note', e.target.value)}
          />
        </div>
      </section>

      <section className="sheet-section">
        <h2>HP и характеристики</h2>

        <div className="stat-grid stat-grid-3">
          <NumberStepper label="КД" value={sheet.armor_class} onChange={(v) => set('armor_class', v)} />
          <NumberStepper label="Скорость" value={sheet.speed} onChange={(v) => set('speed', v)} />
          <NumberStepper
            label="Инициатива"
            value={sheet.initiative}
            onChange={(v) => set('initiative', v)}
            onRoll={() => rollCheck('Инициатива', sheet.initiative)}
          />
        </div>

        <div className="hp-box">
          <span className="hp-box-label">ХП (очки здоровья)</span>
          <div className="hp-box-row">
            <div className="hp-box-buttons">
              <button type="button" className="stat-btn" onClick={() => stepHp(-5)}>
                −5
              </button>
              <button type="button" className="stat-btn" onClick={() => stepHp(-1)}>
                −1
              </button>
            </div>
            <span className="hp-box-value">
              {sheet.hp_current}/{sheet.hp_max}
            </span>
            <div className="hp-box-buttons">
              <button type="button" className="stat-btn stat-btn-accent" onClick={() => stepHp(1)}>
                +1
              </button>
              <button type="button" className="stat-btn stat-btn-accent" onClick={() => stepHp(5)}>
                +5
              </button>
            </div>
          </div>
          <div className="stat-grid stat-grid-2 hp-box-max">
            <NumberStepper
              label="Текущее ХП"
              value={sheet.hp_current}
              min={0}
              max={sheet.hp_max}
              onChange={(v) => set('hp_current', v)}
            />
            <NumberStepper label="Макс. ХП" value={sheet.hp_max} min={0} onChange={setHpMax} />
          </div>
        </div>

        <h2>Характеристики</h2>
        <div className="stat-grid stat-grid-3">
          <NumberStepper
            label="СИЛ"
            value={sheet.strength}
            showModifier
            onChange={(v) => set('strength', v)}
            onRoll={() => rollCheck('СИЛ', abilityModifierValue(sheet.strength))}
          />
          <NumberStepper
            label="ЛОВ"
            value={sheet.dexterity}
            showModifier
            onChange={(v) => set('dexterity', v)}
            onRoll={() => rollCheck('ЛОВ', abilityModifierValue(sheet.dexterity))}
          />
          <NumberStepper
            label="ТЕЛ"
            value={sheet.constitution}
            showModifier
            onChange={(v) => set('constitution', v)}
            onRoll={() => rollCheck('ТЕЛ', abilityModifierValue(sheet.constitution))}
          />
          <NumberStepper
            label="ИНТ"
            value={sheet.intelligence}
            showModifier
            onChange={(v) => set('intelligence', v)}
            onRoll={() => rollCheck('ИНТ', abilityModifierValue(sheet.intelligence))}
          />
          <NumberStepper
            label="МУД"
            value={sheet.wisdom}
            showModifier
            onChange={(v) => set('wisdom', v)}
            onRoll={() => rollCheck('МУД', abilityModifierValue(sheet.wisdom))}
          />
          <NumberStepper
            label="ХАР"
            value={sheet.charisma}
            showModifier
            onChange={(v) => set('charisma', v)}
            onRoll={() => rollCheck('ХАР', abilityModifierValue(sheet.charisma))}
          />
        </div>
        {rollToast && <div className="roll-toast">{rollToast}</div>}
      </section>
    </div>
  )
}
