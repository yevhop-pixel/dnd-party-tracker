import { useEffect, useRef, useState } from 'react'
import type { CharacterMacro, DiceRoll, RollMode } from '../../lib/types'
import Avatar, { colorForName } from '../../components/Avatar'
import { listRecentRolls, stopRoll, subscribeToRolls, submitCounterRoll } from './diceApi'
import { listMacros } from './macrosApi'
import { addToNotation, extractNotation } from './notation'
import './dice.css'

const MAX_ROWS = 100
// Пресеты быстрой добавки в поле «Модификатор» пикера «⚔ В ответ» — те же,
// что и в DicePanel (см. addToNotation в notation.ts).
const MODIFIER_PRESETS = ['+1d4', '-1d4', '+1d6', '-1d6']
// Длительность класса reveal-анимации на строке при вскрытии саспенс-броска
// (pending → revealed): «Стоп» автора или появление встречного ответа.
const REVEAL_ANIM_MS = 500
// Длительность «арены» дуэли (кубики летят к центру и сталкиваются) перед
// тем, как versus-строка сменится на обычную разметку с цифрами. При
// prefers-reduced-motion арена не анимируется — держим её вдвое короче.
const DUEL_ANIM_MS = 2200
const DUEL_ANIM_MS_REDUCED = 800

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export interface RollFeedProps {
  campaignId: string
  myUserId: string
  isGm: boolean
  userNames: Record<string, string>
  // Персонаж, от лица которого броски записываются в contest-ответы. У ГМа
  // персонажа нет (null), у игрока — id его листа (или null, если лист не создан).
  myCharacterId?: string | null
  // user_id -> avatar_path его персонажа (что известно родителю: у ГМа — все
  // листы кампании, у игрока — только свой; для остальных Avatar покажет
  // цветной кружок-букву — RLS всё равно не отдаст игроку чужой файл).
  avatarsByUser?: Record<string, string | null>
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// Realtime-payload не проходит RLS-фильтрацию is_secret (см. diceApi.ts) —
// чужой тайный бросок скрываем на клиенте, если мы не ГМ и не автор.
function isVisible(roll: DiceRoll, myUserId: string, isGm: boolean): boolean {
  if (!roll.is_secret) return true
  return isGm || roll.user_id === myUserId
}

// Применяет модификатор из поля пикера «⚔ В ответ» к любой выбранной
// нотации: числом («3», «-2») или кубиковой добавкой («+1d4», «-1d4»,
// «1d6») — см. addToNotation. Нераспарсиваемую нотацию (человекочитаемые
// лейблы вроде «СИЛ (1d20+2)») и пустой/нераспознанный модификатор не трогаем.
function withModifier(notation: string, modifierRaw: string): string {
  const base = extractNotation(notation) ?? notation
  return addToNotation(base, modifierRaw) ?? base
}

export default function RollFeed({ campaignId, myUserId, isGm, userNames, myCharacterId = null, avatarsByUser }: RollFeedProps) {
  const [rolls, setRolls] = useState<DiceRoll[] | null>(null)
  const [error, setError] = useState('')
  const [counterError, setCounterError] = useState('')
  // id броска, на который прямо сейчас отправляется встречный ответ — дизейблит
  // только его кнопку, остальные строки ленты остаются интерактивными.
  const [counterBusyId, setCounterBusyId] = useState<string | null>(null)
  // id броска, для которого сейчас раскрыт ряд выбора «чем ответить» — открыт
  // может быть только один одновременно.
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [counterMode, setCounterMode] = useState<RollMode>('normal')
  // Модификатор из поля пикера «⚔ В ответ» — применяется к любой выбранной
  // нотации при клике (см. withModifier). Строка, а не число — принимает и
  // число, и кубиковую добавку («+1d4»); невалидное/пустое значение игнорируем.
  const [counterModifier, setCounterModifier] = useState('')
  // Макросы игрока для ряда выбора — грузятся лениво при первом раскрытии и
  // кэшируются на весь жизненный цикл ленты (null = ещё не загружены).
  const [myMacros, setMyMacros] = useState<CharacterMacro[] | null>(null)
  const [macrosLoading, setMacrosLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // id броска, который прямо сейчас раскрывает автор («Стоп») — дизейблит
  // только его кнопку.
  const [stopBusyId, setStopBusyId] = useState<string | null>(null)
  const [stopError, setStopError] = useState('')
  // Строки, для которых прямо сейчас идёт reveal-анимация (pending →
  // revealed) — короткоживущий Set, id убирается сам по таймеру.
  const [revealAnimIds, setRevealAnimIds] = useState<Set<string>>(new Set())
  // Строки-дуэли (versus), у которых прямо сейчас идёт «арена» — кубики
  // летят к центру и сталкиваются, прежде чем откроются цифры. Заводится
  // только живым realtime INSERT ответа, не исторической загрузкой ленты.
  const [duelAnimIds, setDuelAnimIds] = useState<Set<string>>(new Set())
  // Синхронная копия rolls для realtime-колбэка ниже (эффект подписки не
  // пересоздаётся при каждом обновлении ленты — deps только [campaignId]).
  const rollsRef = useRef<DiceRoll[]>([])

  useEffect(() => {
    rollsRef.current = rolls ?? []
  }, [rolls])

  function triggerRevealAnim(id: string) {
    setRevealAnimIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setTimeout(() => {
      setRevealAnimIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, REVEAL_ANIM_MS)
  }

  function triggerDuelAnim(id: string) {
    setDuelAnimIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const duration = prefersReducedMotion() ? DUEL_ANIM_MS_REDUCED : DUEL_ANIM_MS
    setTimeout(() => {
      setDuelAnimIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, duration)
  }

  useEffect(() => {
    let cancelled = false
    setRolls(null)
    setError('')

    async function load() {
      try {
        const initial = await listRecentRolls(campaignId)
        if (!cancelled) setRolls(initial)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить броски')
      }
    }
    void load()

    // Новые броски приходят верхом ленты — так же, как их отдаёт
    // listRecentRolls (created_at desc). onResync — после обрыва канала и
    // переподключения просто перечитываем ленту заново. UPDATE — это
    // вскрытие саспенс-броска (is_pending: true → false): подменяем строку
    // в списке и, если это был переход pending → revealed, запускаем
    // reveal-анимацию.
    const unsubscribe = subscribeToRolls(
      campaignId,
      (roll, eventType) => {
        if (cancelled) return

        if (eventType === 'UPDATE') {
          const prevRoll = rollsRef.current.find((r) => r.id === roll.id)
          setRolls((prev) => {
            const base = prev ?? []
            const idx = base.findIndex((r) => r.id === roll.id)
            if (idx === -1) return base
            const next = [...base]
            next[idx] = roll
            return next
          })
          if (prevRoll?.is_pending && !roll.is_pending) {
            triggerRevealAnim(roll.id)
          }
          return
        }

        // INSERT
        if (rollsRef.current.some((r) => r.id === roll.id)) return
        setRolls((prev) => {
          const base = prev ?? []
          if (base.some((r) => r.id === roll.id)) return base
          return [roll, ...base].slice(0, MAX_ROWS)
        })
        // Встречный ответ вскрывает цель немедленно на клиенте — даже если в
        // базе is_pending у цели ещё true (ответчик не может обновить чужую
        // строку, это чисто клиентское дериватив-вскрытие).
        if (roll.contest_roll_id) {
          triggerRevealAnim(roll.contest_roll_id)
          triggerDuelAnim(roll.id)
        }
      },
      () => void load(),
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [campaignId])

  useEffect(() => {
    // Скроллим только внутренний контейнер ленты, а не всю страницу —
    // scrollIntoView на якоре тянул за собой всю страницу к разделу «Кубы».
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [rolls])

  const visible = (rolls ?? []).filter((roll) => isVisible(roll, myUserId, isGm))
  const visibleById = new Map(visible.map((roll) => [roll.id, roll]))
  // Броски, у которых уже есть видимый встречный ответ — их строка в общей
  // хронологии получает бейдж «оспорен», а сам ответ рендерится отдельно
  // ниже, выше по ленте (contest-строка), как комбинированная ячейка.
  const contestedIds = new Set(visible.filter((roll) => roll.contest_roll_id).map((roll) => roll.contest_roll_id))

  // Раскрывает/сворачивает ряд выбора «чем ответить» под строкой. При первом
  // раскрытии (если у игрока есть персонаж) лениво подгружает его макросы.
  async function toggleCounterPicker(rollId: string) {
    setCounterError('')
    if (counterFor === rollId) {
      setCounterFor(null)
      setCounterModifier('')
      return
    }
    setCounterFor(rollId)
    if (myCharacterId && myMacros === null) {
      setMacrosLoading(true)
      try {
        const list = await listMacros(myCharacterId)
        setMyMacros(list)
      } catch (err) {
        setCounterError(err instanceof Error ? err.message : 'Не удалось загрузить макросы')
      } finally {
        setMacrosLoading(false)
      }
    }
  }

  // Разбор преимущества/помехи для наглядного показа обоих кубов в дуэли:
  // results_text вида «18 (14+4) | 9 (5+4) → 18». Возвращает [выбранный,
  // отброшенный] или null (обычный бросок / нестандартный формат).
  function parseAdvPair(roll: DiceRoll): { chosen: string; dropped: string } | null {
    if (roll.roll_mode === 'normal') return null
    const m = roll.results_text.match(/^(\d+)\s*\((.*?)\)\s*\|\s*(\d+)\s*\((.*?)\)\s*→\s*(\d+)$/)
    if (!m) return null
    const [, t1, d1, t2, d2, fin] = m
    return t1 === fin
      ? { chosen: `${t1} (${d1})`, dropped: `${t2} (${d2})` }
      : { chosen: `${t2} (${d2})`, dropped: `${t1} (${d1})` }
  }

  async function handleCounter(target: DiceRoll, notationOverride?: string) {
    setCounterError('')
    setCounterFor(null)
    setCounterBusyId(target.id)
    // Модификатор из поля пикера применяется к любой выбранной нотации —
    // «Та же», конкретный режим или макрос. Пустое/невалидное значение
    // withModifier тихо игнорирует.
    const finalNotation = withModifier(notationOverride ?? target.notation, counterModifier)
    try {
      await submitCounterRoll(target, myCharacterId, finalNotation, counterMode)
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : 'Не удалось бросить в ответ')
    } finally {
      setCounterBusyId(null)
      setCounterMode('normal')
      setCounterModifier('')
    }
  }

  // Автор вскрывает свой крутящийся бросок вручную. Сама строка обновится
  // через realtime UPDATE (см. подписку выше) — здесь только шлём запрос.
  async function handleStop(rollId: string) {
    setStopError('')
    setStopBusyId(rollId)
    try {
      await stopRoll(rollId)
    } catch (err) {
      setStopError(err instanceof Error ? err.message : 'Не удалось раскрыть бросок')
    } finally {
      setStopBusyId(null)
    }
  }

  return (
    <section className="dice-feed sheet-section">
      <h2>Лента бросков</h2>
      {rolls === null && !error && <p>Загрузка…</p>}
      {error && <p className="auth-error">{error}</p>}
      {counterError && <p className="auth-error">{counterError}</p>}
      {stopError && <p className="auth-error">{stopError}</p>}
      {rolls && visible.length === 0 && <p>Бросков ещё не было.</p>}

      {visible.length > 0 && (
        <div className="dice-feed-scroll" ref={scrollRef}>
          <ul className="dice-feed-list">
            {visible.map((roll) => {
              // Строка-ответ на встречный бросок — вместо обычной строки
              // рендерим комбинированную ячейку «кто больше» на месте ответа.
              if (roll.contest_roll_id) {
                const target = visibleById.get(roll.contest_roll_id) ?? null
                const bName = userNames[roll.user_id] ?? 'Игрок'
                const aName = target ? userNames[target.user_id] ?? 'Игрок' : null
                const aTotal = target?.final_result ?? null
                const bTotal = roll.final_result
                const tie = aTotal !== null && aTotal === bTotal
                const bWins = aTotal !== null && bTotal > aTotal
                const aWins = aTotal !== null && aTotal > bTotal
                // Живая дуэль: кубики летят к центру и сталкиваются, прежде
                // чем откроются цифры — только пока id ответа в duelAnimIds
                // (заводится realtime INSERT, историческая загрузка не трогает).
                const dueling = duelAnimIds.has(roll.id)
                return (
                  <li
                    key={roll.id}
                    className={`dice-feed-row dice-feed-row-versus${!dueling && roll.crit ? ` dice-feed-row-crit-${roll.crit}` : ''}`}
                    style={{ borderLeft: `3px solid ${colorForName(bName)}` }}
                  >
                    <div className="dice-feed-row-header">
                      <span className="dice-feed-time">{formatTime(roll.created_at)}</span>
                    </div>
                    {dueling ? (
                      <div className="dice-feed-versus-arena">
                        <div className="dice-feed-versus-side dice-feed-arena-side dice-feed-arena-side-a">
                          <span className="dice-feed-versus-name" style={aName ? { color: colorForName(aName) } : undefined}>
                            {target && aName && (
                              <Avatar path={avatarsByUser?.[target.user_id] ?? null} name={aName} size={18} />
                            )}
                            {target ? aName : '(бросок вне ленты)'}
                          </span>
                          <div className="dice-feed-duel-cubes">
                            <span className="duel-cube" aria-hidden="true">?</span>
                            {target && target.roll_mode !== 'normal' && (
                              <span className="duel-cube duel-cube-secondary" aria-hidden="true">?</span>
                            )}
                          </div>
                        </div>
                        <span className="dice-feed-versus-sword dice-feed-versus-sword-duel">⚔</span>
                        <div className="dice-feed-versus-side dice-feed-arena-side dice-feed-arena-side-b">
                          <span className="dice-feed-versus-name" style={{ color: colorForName(bName) }}>
                            <Avatar path={avatarsByUser?.[roll.user_id] ?? null} name={bName} size={18} />
                            {bName}
                          </span>
                          <div className="dice-feed-duel-cubes">
                            <span className="duel-cube" aria-hidden="true">?</span>
                            {roll.roll_mode !== 'normal' && (
                              <span className="duel-cube duel-cube-secondary" aria-hidden="true">?</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="dice-feed-versus">
                        <div className={`dice-feed-versus-side${aWins ? ' dice-feed-versus-winner' : ''}${!target ? ' dice-feed-versus-missing' : ''}`}>
                          <span className="dice-feed-versus-name" style={aName ? { color: colorForName(aName) } : undefined}>
                            {target && aName && (
                              <Avatar path={avatarsByUser?.[target.user_id] ?? null} name={aName} size={18} />
                            )}
                            {target ? aName : '(бросок вне ленты)'}
                          </span>
                          {target && (
                            <>
                              <span className="dice-feed-versus-notation">
                                {target.notation}
                                {target.roll_mode !== 'normal' && (
                                  <span className="badge dice-feed-mode"> {target.roll_mode === 'advantage' ? 'преим.' : 'помеха'}</span>
                                )}
                              </span>
                              <div className="dice-feed-versus-value-row">
                                <span className="dice-feed-versus-value">{aTotal}</span>
                                {(() => {
                                  const pair = parseAdvPair(target)
                                  return pair ? (
                                    <span className="dice-feed-versus-detail">
                                      {pair.chosen} <s className="dice-feed-adv-dropped">{pair.dropped}</s>
                                    </span>
                                  ) : (
                                    <span className="dice-feed-versus-detail">{target.results_text}</span>
                                  )
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                        <span className="dice-feed-versus-sword">⚔</span>
                        <div className={`dice-feed-versus-side${bWins ? ' dice-feed-versus-winner' : ''}`}>
                          <span className="dice-feed-versus-name" style={{ color: colorForName(bName) }}>
                            <Avatar path={avatarsByUser?.[roll.user_id] ?? null} name={bName} size={18} />
                            {bName}
                          </span>
                          <span className="dice-feed-versus-notation">
                            {roll.notation}
                            {roll.roll_mode !== 'normal' && (
                              <span className="badge dice-feed-mode"> {roll.roll_mode === 'advantage' ? 'преим.' : 'помеха'}</span>
                            )}
                          </span>
                          <div className="dice-feed-versus-value-row">
                            <span className="dice-feed-versus-value">{bTotal}</span>
                            {(() => {
                              const pair = parseAdvPair(roll)
                              return pair ? (
                                <span className="dice-feed-versus-detail">
                                  {pair.chosen} <s className="dice-feed-adv-dropped">{pair.dropped}</s>
                                </span>
                              ) : (
                                <span className="dice-feed-versus-detail">{roll.results_text}</span>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                    {!dueling && tie && <span className="badge dice-feed-versus-tie">ничья</span>}
                  </li>
                )
              }

              const contested = contestedIds.has(roll.id)
              // Вскрыт = не саспенс, либо саспенс уже раскрыт встречным ответом
              // (см. contestedIds — сам факт наличия ответа означает дуэль-вскрытие).
              const pending = roll.is_pending && !contested
              const revealing = revealAnimIds.has(roll.id)
              const authorName = userNames[roll.user_id] ?? 'Игрок'
              const authorColor = colorForName(authorName)
              // Хинт/ошибка модификатора пикера считаются от нотации именно
              // этой строки (кнопка «Та же») — макросы и другие режимы под
              // капотом используют ту же withModifier, просто превью для них
              // не показываем: базовых нотаций там несколько.
              const counterHint =
                counterFor === roll.id && counterModifier.trim()
                  ? addToNotation(extractNotation(roll.notation) ?? roll.notation, counterModifier)
                  : null
              const counterModError =
                counterFor === roll.id && counterModifier.trim() && !counterHint ? 'не понял модификатор' : ''
              return (
                <li
                  key={roll.id}
                  className={`dice-feed-row${
                    roll.crit && !pending ? ` dice-feed-row-crit-${roll.crit}` : ''
                  }${revealing ? ' dice-feed-row-reveal' : ''}`}
                  style={{ borderLeft: `3px solid ${authorColor}` }}
                >
                  <div className="dice-feed-row-header">
                    <Avatar path={avatarsByUser?.[roll.user_id] ?? null} name={authorName} size={20} />
                    <span className="dice-feed-author" style={{ color: authorColor }}>{authorName}</span>
                    <span className="dice-feed-notation">{roll.notation}</span>
                    {roll.roll_mode !== 'normal' && (
                      <span className="badge dice-feed-mode">{roll.roll_mode === 'advantage' ? 'преим.' : 'помеха'}</span>
                    )}
                    {roll.is_secret && <span className="badge dice-feed-secret">тайный</span>}
                    {contested && <span className="badge dice-feed-contested">оспорен</span>}
                    {pending && <span className="badge dice-feed-pending-badge">крутится…</span>}
                    <span className="dice-feed-time">{formatTime(roll.created_at)}</span>
                  </div>
                  <div className="dice-feed-row-body">
                    {pending ? (
                      <>
                        <span className="dice-feed-cube" aria-hidden="true">
                          <span className="dice-feed-cube-face">?</span>
                        </span>
                        {roll.user_id === myUserId && (
                          <button
                            type="button"
                            className="dice-feed-stop-btn"
                            disabled={stopBusyId === roll.id}
                            onClick={() => void handleStop(roll.id)}
                          >
                            Стоп
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`dice-feed-result${roll.crit ? ` dice-feed-result-crit-${roll.crit}` : ''}`}>
                          {roll.final_result}
                        </span>
                        <span className="dice-feed-detail">{roll.results_text}</span>
                      </>
                    )}
                    <button
                      type="button"
                      className="dice-feed-counter-btn"
                      disabled={counterBusyId === roll.id}
                      onClick={() => void toggleCounterPicker(roll.id)}
                    >
                      ⚔ В ответ
                    </button>
                  </div>
                  {counterFor === roll.id && (
                    <div className="dice-feed-counter-picker">
                      {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`dice-feed-counter-chip dice-feed-counter-mode${counterMode === m ? ' dice-feed-counter-mode-active' : ''}`}
                          onClick={() => setCounterMode(m)}
                        >
                          {m === 'normal' ? 'Обычный' : m === 'advantage' ? 'Преим.' : 'Помеха'}
                        </button>
                      ))}
                      <label className="dice-feed-counter-mod">
                        Модификатор
                        <input
                          type="text"
                          className="dice-feed-counter-mod-input"
                          placeholder="+0 или +1d4"
                          value={counterModifier}
                          onChange={(e) => setCounterModifier(e.target.value)}
                        />
                      </label>
                      {MODIFIER_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`dice-feed-counter-chip dice-feed-counter-mode${counterModifier === p ? ' dice-feed-counter-mode-active' : ''}`}
                          onClick={() => setCounterModifier(counterModifier === p ? '' : p)}
                        >
                          {p.replace('-', '−')}
                        </button>
                      ))}
                      {counterHint && <span className="dice-modifier-hint">→ {counterHint}</span>}
                      {counterModError && <span className="dice-modifier-error">{counterModError}</span>}
                      <button
                        type="button"
                        className="dice-feed-counter-chip"
                        onClick={() => void handleCounter(roll)}
                      >
                        Та же ({extractNotation(roll.notation) ?? roll.notation})
                      </button>
                      {myCharacterId && macrosLoading && (
                        <span className="dice-feed-counter-loading">Загрузка макросов…</span>
                      )}
                      {myCharacterId &&
                        myMacros?.map((macro) => (
                          <button
                            key={macro.id}
                            type="button"
                            className="dice-feed-counter-chip"
                            onClick={() => void handleCounter(roll, macro.notation)}
                          >
                            {macro.label} ({macro.notation})
                          </button>
                        ))}
                      <button
                        type="button"
                        className="dice-feed-counter-chip dice-feed-counter-cancel"
                        onClick={() => {
                          setCounterFor(null)
                          setCounterModifier('')
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
