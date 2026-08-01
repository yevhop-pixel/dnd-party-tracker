import { useEffect, useRef, useState } from 'react'
import type { DiceRoll } from '../../lib/types'
import ChibiOverlay from './ChibiOverlay'
import { listRecentRolls, subscribeToRolls, submitCounterRoll } from './diceApi'
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

export default function RollFeed({ campaignId, myUserId, isGm, userNames, myCharacterId = null }: RollFeedProps) {
  const [rolls, setRolls] = useState<DiceRoll[] | null>(null)
  const [error, setError] = useState('')
  const [counterError, setCounterError] = useState('')
  // id броска, на который прямо сейчас отправляется встречный ответ — дизейблит
  // только его кнопку, остальные строки ленты остаются интерактивными.
  const [counterBusyId, setCounterBusyId] = useState<string | null>(null)
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

  async function handleCounter(target: DiceRoll) {
    setCounterError('')
    setCounterBusyId(target.id)
    try {
      await submitCounterRoll(target, myCharacterId)
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : 'Не удалось бросить в ответ')
    } finally {
      setCounterBusyId(null)
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
                  >
                    <div className="dice-feed-row-header">
                      <span className="dice-feed-notation">{roll.notation}</span>
                      <span className="dice-feed-time">{formatTime(roll.created_at)}</span>
                    </div>
                    <div className="dice-feed-versus">
                      <div className={`dice-feed-versus-side${aWins ? ' dice-feed-versus-winner' : ''}${!target ? ' dice-feed-versus-missing' : ''}`}>
                        <span className="dice-feed-versus-name">{target ? aName : '(бросок вне ленты)'}</span>
                        {target && <span className="dice-feed-versus-value">{aTotal}</span>}
                      </div>
                      <span className="dice-feed-versus-sword">⚔</span>
                      <div className={`dice-feed-versus-side${bWins ? ' dice-feed-versus-winner' : ''}`}>
                        <span className="dice-feed-versus-name">{bName}</span>
                        <span className="dice-feed-versus-value">{bTotal}</span>
                      </div>
                    </div>
                    {tie && <span className="badge dice-feed-versus-tie">ничья</span>}
                  </li>
                )
              }

              const contested = contestedIds.has(roll.id)
              return (
                <li
                  key={roll.id}
                  className={`dice-feed-row${roll.crit ? ` dice-feed-row-crit-${roll.crit}` : ''}`}
                >
                  <div className="dice-feed-row-header">
                    <span className="dice-feed-author">{userNames[roll.user_id] ?? 'Игрок'}</span>
                    <span className="dice-feed-notation">{roll.notation}</span>
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
                      onClick={() => void handleCounter(roll)}
                    >
                      ⚔ В ответ
                    </button>
                  </div>
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
