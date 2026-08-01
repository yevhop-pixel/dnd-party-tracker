import { useEffect, useRef, useState } from 'react'
import type { CharacterMacro, DiceRoll, RollMode } from '../../lib/types'
import Avatar, { colorForName } from '../../components/Avatar'
import ChibiOverlay from './ChibiOverlay'
import { listRecentRolls, subscribeToRolls, submitCounterRoll } from './diceApi'
import { listMacros } from './macrosApi'
import './dice.css'

const MAX_ROWS = 100

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
  // Макросы игрока для ряда выбора — грузятся лениво при первом раскрытии и
  // кэшируются на весь жизненный цикл ленты (null = ещё не загружены).
  const [myMacros, setMyMacros] = useState<CharacterMacro[] | null>(null)
  const [macrosLoading, setMacrosLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [chibi, setChibi] = useState<{ id: string; crit: 'success' | 'fail'; rollerName: string } | null>(null)
  // Один показ анимации на бросок — иначе resync/повторная подписка могли бы
  // проиграть овервлей повторно для уже показанного крита.
  const shownCritIds = useRef<Set<string>>(new Set())

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
    // переподключения просто перечитываем ленту заново.
    const unsubscribe = subscribeToRolls(
      campaignId,
      (roll) => {
        if (cancelled) return
        setRolls((prev) => {
          const base = prev ?? []
          if (base.some((r) => r.id === roll.id)) return base
          return [roll, ...base].slice(0, MAX_ROWS)
        })
        // Оверлей — только для новых (realtime) видимых крит-бросков, не для
        // истории, подгруженной listRecentRolls. Несколько критов подряд —
        // без очереди, показываем последний (перезапуск таймера через key).
        if (roll.crit && isVisible(roll, myUserId, isGm) && !shownCritIds.current.has(roll.id)) {
          shownCritIds.current.add(roll.id)
          setChibi({ id: roll.id, crit: roll.crit, rollerName: userNames[roll.user_id] ?? 'Игрок' })
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
    try {
      await submitCounterRoll(target, myCharacterId, notationOverride, counterMode)
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : 'Не удалось бросить в ответ')
    } finally {
      setCounterBusyId(null)
      setCounterMode('normal')
    }
  }

  return (
    <section className="dice-feed sheet-section">
      <h2>Лента бросков</h2>
      {rolls === null && !error && <p>Загрузка…</p>}
      {error && <p className="auth-error">{error}</p>}
      {counterError && <p className="auth-error">{counterError}</p>}
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
                return (
                  <li
                    key={roll.id}
                    className={`dice-feed-row dice-feed-row-versus${roll.crit ? ` dice-feed-row-crit-${roll.crit}` : ''}`}
                    style={{ borderLeft: `3px solid ${colorForName(bName)}` }}
                  >
                    <div className="dice-feed-row-header">
                      <span className="dice-feed-time">{formatTime(roll.created_at)}</span>
                    </div>
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
                    {tie && <span className="badge dice-feed-versus-tie">ничья</span>}
                  </li>
                )
              }

              const contested = contestedIds.has(roll.id)
              const authorName = userNames[roll.user_id] ?? 'Игрок'
              const authorColor = colorForName(authorName)
              return (
                <li
                  key={roll.id}
                  className={`dice-feed-row${roll.crit ? ` dice-feed-row-crit-${roll.crit}` : ''}`}
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
                    <span className="dice-feed-time">{formatTime(roll.created_at)}</span>
                  </div>
                  <div className="dice-feed-row-body">
                    <span className={`dice-feed-result${roll.crit ? ` dice-feed-result-crit-${roll.crit}` : ''}`}>
                      {roll.final_result}
                    </span>
                    <span className="dice-feed-detail">{roll.results_text}</span>
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
                      <button
                        type="button"
                        className="dice-feed-counter-chip"
                        onClick={() => void handleCounter(roll)}
                      >
                        Та же ({roll.notation})
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
                        onClick={() => setCounterFor(null)}
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

      {chibi && (
        <ChibiOverlay
          key={chibi.id}
          crit={chibi.crit}
          rollId={chibi.id}
          rollerName={chibi.rollerName}
          onDone={() => setChibi(null)}
        />
      )}
    </section>
  )
}
