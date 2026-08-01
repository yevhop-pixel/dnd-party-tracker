import { useEffect, useState } from 'react'
import type { DiceRoll, RollMode } from '../../lib/types'
import { submitRoll } from './diceApi'
import { parseNotation } from './notation'
import './dice.css'

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

const MODE_LABELS: Record<RollMode, string> = {
  normal: 'Обычный',
  advantage: 'Преимущество',
  disadvantage: 'Помеха',
}
const MODES = Object.keys(MODE_LABELS) as RollMode[]

// Анимация — чисто визуальный шум, не настоящие броски (те уже ушли в базу
// через submitRoll до истечения таймера). Задержки в мс.
const ROLL_ANIMATION_MS = 1350
const REDUCED_MOTION_DELAY_MS = 400
const SPIN_TICK_MS = 80

function fieldError(value: string): string {
  if (!value.trim()) return ''
  return parseNotation(value) ? '' : 'Неверная нотация, например: 1d20+3'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Разбирает results_text advantage/disadvantage-броска ("18 (14+4) | 9 (5+4)
// → 18") на итоги двух кандидатов и финал — чтобы подсветить выбранный куб
// при раскрытии анимации.
function parseAdvantageText(text: string): { a: number; b: number; final: number } | null {
  const m = /^(-?\d+) \(.*?\) \| (-?\d+) \(.*?\) → (-?\d+)$/.exec(text)
  if (!m) return null
  return { a: Number(m[1]), b: Number(m[2]), final: Number(m[3]) }
}

// Крутящийся куб: пока идёт анимация, каждые SPIN_TICK_MS показывает
// случайное значение 1..sides — это именно визуальный шум, не бросок.
function SpinningCube({ sides }: { sides: number }) {
  const reduced = prefersReducedMotion()
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * sides))

  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), SPIN_TICK_MS)
    return () => clearInterval(id)
  }, [sides, reduced])

  return (
    <span className={`dice-cube${reduced ? '' : ' dice-cube-spinning'}`}>
      <span className="dice-cube-face">{reduced ? '…' : face}</span>
    </span>
  )
}

interface RollingSlot {
  sides: number
}

interface RollingState {
  slots: RollingSlot[]
  mode: RollMode
}

export interface DicePanelProps {
  campaignId: string
  characterId: string | null
}

export default function DicePanel(props: DicePanelProps) {
  const { campaignId, characterId } = props

  const [notation1, setNotation1] = useState('1d20')
  const [notation2, setNotation2] = useState('1d20')
  const [activeField, setActiveField] = useState<1 | 2>(1)
  const [mode, setMode] = useState<RollMode>('normal')
  const [isSecret, setIsSecret] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rolling, setRolling] = useState<RollingState | null>(null)
  const [error, setError] = useState('')
  const [lastRolls, setLastRolls] = useState<DiceRoll[]>([])
  const [lastUsedButton, setLastUsedButton] = useState<1 | 2 | 'both' | null>(null)

  const error1 = fieldError(notation1)
  const error2 = fieldError(notation2)

  function setActiveNotation(value: string) {
    if (activeField === 1) setNotation1(value)
    else setNotation2(value)
  }

  async function doRoll(target: 1 | 2 | 'both') {
    setError('')
    if (target !== 2 && !parseNotation(notation1)) {
      setError('Проверьте нотацию куба 1')
      return
    }
    if (target !== 1 && !parseNotation(notation2)) {
      setError('Проверьте нотацию куба 2')
      return
    }

    // Слоты для крутящихся кубов — чисто для отображения (sides для генерации
    // шума), реальный результат считает submitRoll, который уходит в базу
    // сразу и не ждёт анимацию (лента — протокол, задерживать нельзя).
    const slots: RollingSlot[] =
      target === 'both'
        ? [{ sides: parseNotation(notation1)!.sides }, { sides: parseNotation(notation2)!.sides }]
        : [{ sides: parseNotation(target === 1 ? notation1 : notation2)!.sides }]

    setSubmitting(true)
    setLastUsedButton(target)
    setRolling({ slots, mode })
    try {
      // isPending: true — саспенс, результат в ленте у всех, кроме автора,
      // скрыт за крутящимся кубом до ответки или «Стопа» (см. RollFeed).
      const rollsPromise =
        target === 'both'
          ? Promise.all([
              submitRoll(campaignId, characterId, notation1, mode, isSecret, true),
              submitRoll(campaignId, characterId, notation2, mode, isSecret, true),
            ])
          : submitRoll(campaignId, characterId, target === 1 ? notation1 : notation2, mode, isSecret, true).then(
              (roll) => [roll],
            )

      const animationDelay = prefersReducedMotion() ? REDUCED_MOTION_DELAY_MS : ROLL_ANIMATION_MS
      const [rolls] = await Promise.all([rollsPromise, wait(animationDelay)])
      setLastRolls(rolls)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось бросить кубы')
    } finally {
      setSubmitting(false)
      setRolling(null)
    }
  }

  return (
    <section className="dice-panel sheet-section">
      <h2>Броски кубов</h2>

      <div className="dice-fields">
        <div className="field">
          <span>Куб 1</span>
          <input
            type="text"
            value={notation1}
            onFocus={() => setActiveField(1)}
            onChange={(e) => setNotation1(e.target.value)}
          />
          {error1 && <p className="dice-field-error">{error1}</p>}
        </div>
        <div className="field">
          <span>Куб 2</span>
          <input
            type="text"
            value={notation2}
            onFocus={() => setActiveField(2)}
            onChange={(e) => setNotation2(e.target.value)}
          />
          {error2 && <p className="dice-field-error">{error2}</p>}
        </div>
      </div>

      <div className="dice-quick-row">
        {QUICK_DICE.map((d) => (
          <button key={d} type="button" className="dice-quick-btn" onClick={() => setActiveNotation(d)}>
            {d}
          </button>
        ))}
      </div>

      <div className="dice-mode-row">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`dice-mode-btn${mode === m ? ' dice-mode-btn-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <label className="dice-secret-check">
        <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} />
        Тайный бросок (виден только вам и ГМу)
      </label>

      <div className="dice-roll-actions">
        <button
          type="button"
          className={`dice-roll-btn${lastUsedButton === 1 ? ' dice-roll-btn-active' : ''}`}
          disabled={submitting}
          onClick={() => void doRoll(1)}
        >
          Бросить 1
        </button>
        <button
          type="button"
          className={`dice-roll-btn${lastUsedButton === 2 ? ' dice-roll-btn-active' : ''}`}
          disabled={submitting}
          onClick={() => void doRoll(2)}
        >
          Бросить 2
        </button>
        <button
          type="button"
          className={`dice-roll-btn${lastUsedButton === 'both' ? ' dice-roll-btn-active' : ''}`}
          disabled={submitting}
          onClick={() => void doRoll('both')}
        >
          Оба
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {rolling && (
        <div className="dice-last-result">
          {rolling.slots.map((slot, i) => (
            <div key={i} className="dice-result-item dice-result-item-rolling">
              {rolling.mode === 'normal' ? (
                <SpinningCube sides={slot.sides} />
              ) : (
                <div className="dice-cube-pair">
                  <SpinningCube sides={slot.sides} />
                  <SpinningCube sides={slot.sides} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!rolling && lastRolls.length > 0 && (
        <div className="dice-last-result">
          {lastRolls.map((roll, i) => {
            const advantage = roll.roll_mode !== 'normal' ? parseAdvantageText(roll.results_text) : null
            const critClass = roll.crit ? ` dice-result-item-crit-${roll.crit}` : ''
            return (
              <div key={`${roll.id}-${i}`} className={`dice-result-item dice-result-item-reveal${critClass}`}>
                <span className="dice-result-notation">{roll.notation}</span>
                {advantage && (
                  <div className="dice-cube-pair">
                    <span className={`dice-mini-cube${advantage.a === advantage.final ? ' dice-mini-cube-chosen' : ''}`}>
                      {advantage.a}
                    </span>
                    <span className={`dice-mini-cube${advantage.b === advantage.final ? ' dice-mini-cube-chosen' : ''}`}>
                      {advantage.b}
                    </span>
                  </div>
                )}
                <span className={`dice-result-value${roll.crit ? ` dice-result-value-crit-${roll.crit}` : ''}`}>
                  {roll.final_result}
                </span>
                <span className="dice-result-detail">{roll.results_text}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
