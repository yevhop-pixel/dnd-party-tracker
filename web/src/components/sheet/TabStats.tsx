import { useEffect, useState } from 'react'
import type { SheetTabProps } from './types'
import type { CharacterSheet } from '../../lib/types'

// Модификатор характеристики по правилам D&D: floor((значение - 10) / 2).
function abilityModifier(value: number): string {
  const mod = Math.floor((value - 10) / 2)
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
}: {
  label: string
  value: number
  onChange: (next: number) => void
  step?: number
  min?: number
  max?: number
  showModifier?: boolean
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
    <div className="stat-field">
      <span className="stat-field-label">{label}</span>
      {showModifier && <span className="stat-field-mod">{abilityModifier(value)}</span>}
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
  function set<K extends keyof CharacterSheet>(key: K, value: CharacterSheet[K]) {
    onSheetChange({ [key]: value } as Partial<CharacterSheet>)
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
        <h2>HP и характеристики</h2>

        <div className="stat-grid stat-grid-3">
          <NumberStepper label="КД" value={sheet.armor_class} onChange={(v) => set('armor_class', v)} />
          <NumberStepper label="Скорость" value={sheet.speed} onChange={(v) => set('speed', v)} />
          <NumberStepper label="Инициатива" value={sheet.initiative} onChange={(v) => set('initiative', v)} />
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
          <NumberStepper label="СИЛ" value={sheet.strength} showModifier onChange={(v) => set('strength', v)} />
          <NumberStepper label="ЛОВ" value={sheet.dexterity} showModifier onChange={(v) => set('dexterity', v)} />
          <NumberStepper
            label="ТЕЛ"
            value={sheet.constitution}
            showModifier
            onChange={(v) => set('constitution', v)}
          />
          <NumberStepper
            label="ИНТ"
            value={sheet.intelligence}
            showModifier
            onChange={(v) => set('intelligence', v)}
          />
          <NumberStepper label="МУД" value={sheet.wisdom} showModifier onChange={(v) => set('wisdom', v)} />
          <NumberStepper label="ХАР" value={sheet.charisma} showModifier onChange={(v) => set('charisma', v)} />
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
    </div>
  )
}
