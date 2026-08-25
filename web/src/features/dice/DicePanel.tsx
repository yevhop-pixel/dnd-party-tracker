import { useEffect, useState } from 'react'
import type { DiceRoll, RollMode } from '../../lib/types'
import { stopRoll, submitRoll, subscribeToRolls } from './diceApi'
import { addToNotation, parseNotation, shownDice } from './notation'
import Die3D from './Die3D'
import './dice.css'

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
// Пресеты быстрой добавки в поле «Модификатор» — благословение/проклятие
// одной кнопкой (см. addToNotation в notation.ts).
const MODIFIER_PRESETS = ['+1d4', '-1d4', '+1d6', '-1d6']

const MODE_LABELS: Record<RollMode, string> = {
  normal: 'Обычный',
  advantage: 'Преимущество',
  disadvantage: 'Помеха',
}
const MODES = Object.keys(MODE_LABELS) as RollMode[]

// Кубик крутится, пока результат летит из базы, и ложится на грань, когда
// тот пришёл (см. Die3D). Само число считает submitRoll — анимация его
// только показывает. Задержки в мс.
const ROLL_ANIMATION_MS = 1350
const REDUCED_MOTION_DELAY_MS = 400

function fieldError(value: string): string {
  if (!value.trim()) return ''
  return parseNotation(value) ? '' : 'Неверная нотация, например: 1d20+3'
}

// Модификатор принимает число («3», «-2») и кубиковую добавку («+1d4»,
// «-1d4», «1d6») — см. addToNotation. Пустой/нераспознанный ввод не
// блокирует бросок — нотация уходит без изменений.
function withModifier(notation: string, modifierRaw: string): string {
  return addToNotation(notation, modifierRaw) ?? notation
}

// Какой кубик показать в карточке результата. Для нераскрытого броска грань
// не используется — важно только число граней, чтобы крутился тот же
// многогранник, что человек бросил.
function panelDice(roll: DiceRoll) {
  return shownDice(roll.notation, roll.results_text, roll.roll_mode !== 'normal', roll.roll_mode === 'advantage')
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
  // Шуточная премиум-подписка автора: подкручивает d20 и помечает бросок ✨.
  premium?: boolean
}

export default function DicePanel(props: DicePanelProps) {
  const { campaignId, characterId, premium = false } = props

  const [notation1, setNotation1] = useState('1d20')
  const [notation2, setNotation2] = useState('1d20')
  const [modifier1, setModifier1] = useState('')
  const [modifier2, setModifier2] = useState('')
  const [activeField, setActiveField] = useState<1 | 2>(1)
  const [mode, setMode] = useState<RollMode>('normal')
  const [isSecret, setIsSecret] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rolling, setRolling] = useState<RollingState | null>(null)
  const [error, setError] = useState('')
  const [lastRolls, setLastRolls] = useState<DiceRoll[]>([])
  // Броски, отправленные скрытыми (саспенс), и те из них, что уже вскрыты —
  // «Стоп» автора или прилетевший встречный ответ. Пока бросок в pending и не
  // вскрыт, панель не показывает результат даже автору.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  // id броска, который прямо сейчас раскрывают кнопкой «Стоп» в панели.
  const [stopBusyId, setStopBusyId] = useState<string | null>(null)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())

  // Вскрытие приходит извне: «Стоп» в ленте (UPDATE is_pending→false) или
  // встречный ответ (INSERT с contest_roll_id на наш бросок). Панель слушает
  // те же события, что и лента, чтобы открыть число одновременно со всеми.
  useEffect(() => {
    const unsubscribe = subscribeToRolls(campaignId, (roll, eventType) => {
      if (eventType === 'UPDATE' && !roll.is_pending) {
        setRevealedIds((prev) => (prev.has(roll.id) ? prev : new Set(prev).add(roll.id)))
      }
      if (eventType === 'INSERT' && roll.contest_roll_id) {
        const targetId = roll.contest_roll_id
        setRevealedIds((prev) => (prev.has(targetId) ? prev : new Set(prev).add(targetId)))
      }
    })
    return unsubscribe
  }, [campaignId])

  const error1 = fieldError(notation1)
  const error2 = fieldError(notation2)
  // Хинт/ошибку модификатора считаем только когда сама нотация валидна —
  // иначе пользователь увидит две ошибки сразу за одну и ту же причину.
  const modifierHint1 = !error1 && modifier1.trim() ? addToNotation(notation1, modifier1) : null
  const modifierHint2 = !error2 && modifier2.trim() ? addToNotation(notation2, modifier2) : null
  const modifierError1 = !error1 && modifier1.trim() && !modifierHint1 ? 'не понял модификатор' : ''
  const modifierError2 = !error2 && modifier2.trim() && !modifierHint2 ? 'не понял модификатор' : ''

  function setActiveNotation(value: string) {
    if (activeField === 1) setNotation1(value)
    else setNotation2(value)
  }

  // «Стоп» прямо в панели: кубик кувыркается здесь, здесь же его и
  // останавливают. Раньше кнопка была только в ленте — приходилось искать её
  // глазами в другом блоке, пока кубик крутится перед носом.
  async function handleStop(rollId: string) {
    setStopBusyId(rollId)
    try {
      await stopRoll(rollId)
      setRevealedIds((prev) => new Set(prev).add(rollId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось раскрыть бросок')
    } finally {
      setStopBusyId(null)
    }
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

    // Итоговая нотация с учётом модификатора — withModifier не вернёт пустоту
    // здесь: соответствующая нотация уже провалидирована проверками выше, а
    // невалидный/пустой модификатор withModifier тихо игнорирует.
    const finalNotation1 = target !== 2 ? withModifier(notation1, modifier1) : ''
    const finalNotation2 = target !== 1 ? withModifier(notation2, modifier2) : ''

    // Слоты для крутящихся кубов — чисто для отображения (sides первого термa
    // для генерации шума), реальный результат считает submitRoll, который
    // уходит в базу сразу и не ждёт анимацию (лента — протокол, задерживать нельзя).
    const slots: RollingSlot[] =
      target === 'both'
        ? [
            { sides: parseNotation(finalNotation1)!.terms[0].sides },
            { sides: parseNotation(finalNotation2)!.terms[0].sides },
          ]
        : [{ sides: parseNotation(target === 1 ? finalNotation1 : finalNotation2)!.terms[0].sides }]

    setSubmitting(true)
    setRolling({ slots, mode })
    try {
      // isPending: true — саспенс, результат в ленте у всех, кроме автора,
      // скрыт за крутящимся кубом до ответки или «Стопа» (см. RollFeed).
      const rollsPromise =
        target === 'both'
          ? Promise.all([
              submitRoll(campaignId, characterId, finalNotation1, mode, isSecret, true, null, premium),
              submitRoll(campaignId, characterId, finalNotation2, mode, isSecret, true, null, premium),
            ])
          : submitRoll(
              campaignId,
              characterId,
              target === 1 ? finalNotation1 : finalNotation2,
              mode,
              isSecret,
              true,
              null,
              premium,
            ).then((roll) => [roll])

      const animationDelay = prefersReducedMotion() ? REDUCED_MOTION_DELAY_MS : ROLL_ANIMATION_MS
      // Кубик здесь ТОЛЬКО кувыркается и на грань не садится. Все броски
      // панели уходят саспенс-бросками (isPending), и результат спрятан даже
      // от автора — до «Стопа» он не должен его знать. Севший кубик выдал бы
      // число раньше времени и сломал бы всю механику. Посадку показывает
      // лента в момент вскрытия, когда её видят все сразу (см. RollFeed).
      const [rolls] = await Promise.all([rollsPromise, wait(animationDelay)])
      setLastRolls(rolls)
      setPendingIds(new Set(rolls.filter((r) => r.is_pending).map((r) => r.id)))
      setRevealedIds(new Set())
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
        {/* Мишень выбора — весь блок, а не только поле нотации. Раньше
            активный куб ставил лишь onFocus этого поля, и человек, поправивший
            модификатор второго куба, всё равно бросал первый.
            Именно onClick, а не onPointerDown: на телефоне палец, начавший
            прокрутку страницы с этого блока, дал бы pointerdown и молча
            переключил бросаемый куб — click при прокрутке не наступает.
            И именно onInput, а не onFocus: путь по Tab от куба 1 к кнопке
            броска ОБЯЗАТЕЛЬНО идёт через поля куба 2, и на фокусе клавиатурник
            никогда не смог бы бросить первый куб — активность угонялась бы по
            дороге. Правка текста — другое дело: раз человек что-то печатает в
            этом блоке, он про этот куб и говорит. */}
        <div
          className={`field dice-field${activeField === 1 ? ' dice-field-active' : ''}`}
          onClick={() => setActiveField(1)}
          onInputCapture={() => setActiveField(1)}
        >
          <button
            type="button"
            className="dice-field-tab"
            aria-pressed={activeField === 1}
            onClick={() => setActiveField(1)}
          >
            <span className="dice-field-dot" aria-hidden="true" />
            Куб 1
            {activeField === 1 && (
              <span className="dice-field-mark" aria-hidden="true">
                выбран
              </span>
            )}
          </button>
          <input
            type="text"
            value={notation1}
            onChange={(e) => setNotation1(e.target.value)}
          />
          {error1 && <p className="dice-field-error">{error1}</p>}
          <div className="dice-modifier-row">
            <label className="dice-modifier-label">
              Модификатор
              <input
                type="text"
                className="dice-modifier-input"
                placeholder="+0 или +1d4"
                value={modifier1}
                onChange={(e) => setModifier1(e.target.value)}
              />
            </label>
            <div className="dice-modifier-presets">
              {MODIFIER_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`dice-modifier-preset-btn${modifier1 === p ? ' dice-modifier-preset-btn-active' : ''}`}
                  onClick={() => setModifier1(modifier1 === p ? '' : p)}
                >
                  {p.replace('-', '−')}
                </button>
              ))}
            </div>
            {modifierHint1 && <span className="dice-modifier-hint">→ {modifierHint1}</span>}
            {modifierError1 && <span className="dice-modifier-error">{modifierError1}</span>}
          </div>
        </div>
        <div
          className={`field dice-field${activeField === 2 ? ' dice-field-active' : ''}`}
          onClick={() => setActiveField(2)}
          onInputCapture={() => setActiveField(2)}
        >
          <button
            type="button"
            className="dice-field-tab"
            aria-pressed={activeField === 2}
            onClick={() => setActiveField(2)}
          >
            <span className="dice-field-dot" aria-hidden="true" />
            Куб 2
            {activeField === 2 && (
              <span className="dice-field-mark" aria-hidden="true">
                выбран
              </span>
            )}
          </button>
          <input
            type="text"
            value={notation2}
            onChange={(e) => setNotation2(e.target.value)}
          />
          {error2 && <p className="dice-field-error">{error2}</p>}
          <div className="dice-modifier-row">
            <label className="dice-modifier-label">
              Модификатор
              <input
                type="text"
                className="dice-modifier-input"
                placeholder="+0 или +1d4"
                value={modifier2}
                onChange={(e) => setModifier2(e.target.value)}
              />
            </label>
            <div className="dice-modifier-presets">
              {MODIFIER_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`dice-modifier-preset-btn${modifier2 === p ? ' dice-modifier-preset-btn-active' : ''}`}
                  onClick={() => setModifier2(modifier2 === p ? '' : p)}
                >
                  {p.replace('-', '−')}
                </button>
              ))}
            </div>
            {modifierHint2 && <span className="dice-modifier-hint">→ {modifierHint2}</span>}
            {modifierError2 && <span className="dice-modifier-error">{modifierError2}</span>}
          </div>
        </div>
      </div>

      {/* Кнопки d4…d100 подставляют нотацию в АКТИВНОЕ поле — без подписи это
          выглядело как «кнопка ничего не сделала», если человек смотрел не на
          тот куб. */}
      <div className="dice-quick-head">
        Быстрый выбор <span className="dice-quick-target">→ в куб {activeField}</span>
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

      {/* Одна большая кнопка вместо трёх: выше человек всё выбрал, здесь
          только «бросить». Кидается тот куб, поле которого активно; активный
          куб меняют клик по его блоку и правка его полей — а кнопки d4…d100
          НЕ переключают, они пишут в уже активное поле (см. setActiveNotation
          и подпись .dice-quick-head над ними). «Оба» остаётся мелкой кнопкой
          рядом — нужно редко. */}
      <div className="dice-roll-actions">
        <button
          type="button"
          className="dice-roll-main"
          disabled={submitting}
          onClick={() => void doRoll(activeField)}
        >
          {submitting ? 'Бросаем…' : `🎲 Бросить куб ${activeField}`}
        </button>
        <button
          type="button"
          className="dice-roll-both"
          disabled={submitting}
          onClick={() => void doRoll('both')}
        >
          🎲🎲 Оба
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {rolling && (
        <div className="dice-last-result">
          {rolling.slots.map((slot, i) => (
            <div key={i} className="dice-result-item dice-result-item-rolling">
              {rolling.mode === 'normal' ? (
                <Die3D sides={slot.sides} value={null} gold={premium} />
              ) : (
                <div className="dice-cube-pair">
                  <Die3D sides={slot.sides} value={null} size={52} gold={premium} />
                  <Die3D sides={slot.sides} value={null} size={52} gold={premium} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!rolling && lastRolls.length > 0 && (
        <div className="dice-last-result">
          {lastRolls.map((roll, i) => {
            // Пока бросок не вскрыт («Стоп» в ленте или встречный ответ) —
            // результат скрыт и от самого автора: саспенс общий для всех.
            const hidden = !revealedIds.has(roll.id) && pendingIds.has(roll.id)
            const advantage = !hidden && roll.roll_mode !== 'normal' ? parseAdvantageText(roll.results_text) : null
            const critClass = !hidden && roll.crit ? ` dice-result-item-crit-${roll.crit}` : ''
            if (hidden) {
              return (
                // Пояснение убрано: крутящийся кубик и так говорит сам за
                // себя, а строка текста только распирала карточку.
                <div key={`${roll.id}-${i}`} className="dice-result-item">
                  <span className="dice-result-notation">{roll.notation}</span>
                  {/* Тот же кубик и того же размера, что кувыркался секунду
                      назад. Раньше здесь был сначала большой кубик, потом
                      маленький, потом одна цифра — три разных вида подряд на
                      одном и том же месте. */}
                  <Die3D sides={panelDice(roll)?.[0]?.sides ?? 20} value={null} gold={roll.is_premium} />
                  <button
                    type="button"
                    className="dice-panel-stop"
                    disabled={stopBusyId === roll.id}
                    onClick={() => void handleStop(roll.id)}
                  >
                    {stopBusyId === roll.id ? 'Открываем…' : 'Стоп'}
                  </button>
                </div>
              )
            }
            return (
              <div key={`${roll.id}-${i}`} className={`dice-result-item dice-result-item-reveal${critClass}`}>
                <span className="dice-result-notation">{roll.notation}</span>
                {/* Кубик никуда не девается и после вскрытия: рядом с ним —
                    итог с модификатором, как на столе. */}
                {panelDice(roll)?.map((d, k, all) => (
                  <Die3D
                    key={k}
                    sides={d.sides}
                    value={d.face}
                    // Чем больше кубов в выражении, тем они мельче — иначе
                    // «2d6+1d4» не помещается в карточку.
                    size={all.length > 2 ? 44 : all.length > 1 ? 52 : 64}
                    gold={roll.is_premium}
                    dropped={d.dropped}
                  />
                ))}
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
