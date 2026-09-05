// Слот-машина кампании: один автомат на стол.
//
// Ручку дёргают (тянут вниз, а не кликают — так просили), барабаны
// закручиваются у всех за столом сразу и встают на одном и том же: результат
// выбирает сервер (rpc slot_pull), клиент только показывает присланные
// индексы. Пока крутится — ручка заперта у всех, и заперта дважды: здесь
// (по таймеру) и на сервере (slot_pull откажет), потому что таймер на
// клиенте — вежливость, а не защита.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { SlotSpin } from '../../lib/types'
import { isTableMissing } from '../../lib/api'
import { useLiveSync } from '../../lib/useLiveSync'
import { listRecentSpins, pullLever, subscribeToSpins } from './slotsApi'
import { SLOT_OUTCOMES, SLOT_REELS, SLOT_SYMBOLS, symbolAt } from './symbols'
import './slots.css'

export interface SlotMachineProps {
  campaignId: string
  myUserId: string
  userNames: Record<string, string>
}

// Барабаны встают по очереди слева направо — так держится интрига до
// последнего.
const REEL_STOP_MS = [2600, 3400, 4200]
const SPIN_TOTAL_MS = REEL_STOP_MS[REEL_STOP_MS.length - 1]
// Столько автомат считается занятым после рывка — ровно как v_busy в
// slot_pull (schema.sql). Меньше нельзя: сервер откажет, а ручка уже ожила.
const LOCK_MS = 6000
// Сколько полных оборотов делает барабан до посадки; у каждого следующего
// на один больше, чтобы они не ехали синхронно.
const BASE_LOOPS = 3
// Лента символов повторена с запасом: максимум путь (BASE_LOOPS + 2) кругов
// плюс неполный, это меньше половины ленты.
const STRIP_REPEATS = 12
const STRIP_CELLS = STRIP_REPEATS * SLOT_SYMBOLS.length
// Сколько пикселей надо протащить ручку, чтобы автомат сработал, и на какой
// доле пути он срабатывает.
const PULL_DISTANCE_PX = 90
const PULL_FIRE_AT = 0.8
const RECENT_LIMIT = 8

// Рывок «свежий», если сервер записал его меньше LOCK_MS назад — значит,
// у остальных барабаны ещё крутятся, и нам надо крутить тоже, а не молча
// показать итог. Часы клиента и сервера могут расходиться; в худшем случае
// свежий рывок покажется статикой, что не страшно.
function isRecent(spin: SlotSpin): boolean {
  return Date.now() - new Date(spin.created_at).getTime() < LOCK_MS
}

// Сдвиг ленты в процентах от её собственной высоты: так посадка не зависит
// от размера ячейки и переживает поворот телефона без пересчёта.
function offsetFor(cellIndex: number): string {
  return `translateY(${(-(cellIndex / STRIP_CELLS) * 100).toFixed(4)}%)`
}

export default function SlotMachine({ campaignId, myUserId, userNames }: SlotMachineProps) {
  const [spins, setSpins] = useState<SlotSpin[]>([])
  const [current, setCurrent] = useState<SlotSpin | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [leverPos, setLeverPos] = useState(0)
  const [dragging, setDragging] = useState(false)

  const seenRef = useRef<Set<string>>(new Set())
  // Что сейчас стоит на каждом барабане — отсюда начинается следующий разгон.
  const shownRef = useRef<number[]>(Array.from({ length: SLOT_REELS }, () => 0))
  const stripRefs = useRef<(HTMLDivElement | null)[]>([])
  const animsRef = useRef<Animation[]>([])
  // Таймеры анимации (конец кручения) — гасятся вместе с ней. Замок ручки и
  // возврат ручки живут отдельно: остановка барабанов не должна ни отпирать
  // автомат раньше сервера, ни оставлять ручку опущенной.
  const timersRef = useRef<number[]>([])
  const busyTimerRef = useRef<number | null>(null)
  const leverTimerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)
  // moved — тянули ли ручку в этом нажатии: клик без протаскивания дёргает
  // её сам (клавиатура, скринридер, простой тап), а после протаскивания
  // сопутствующий click уже не считается.
  const dragRef = useRef<{ startY: number; fired: boolean; moved: boolean } | null>(null)
  const draggedRef = useRef(false)

  function nameOf(userId: string): string {
    return userId === myUserId ? 'Ты' : (userNames[userId] ?? 'Кто-то')
  }

  const stopEverything = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t))
    timersRef.current = []
    animsRef.current.forEach((a) => a.cancel())
    animsRef.current = []
    stripRefs.current.forEach((strip) => strip?.parentElement?.classList.remove('slots-reel-spinning'))
  }, [])

  const setStatic = useCallback(
    (reels: number[]) => {
      stopEverything()
      reels.forEach((idx, i) => {
        const strip = stripRefs.current[i]
        if (strip) strip.style.transform = offsetFor(idx)
      })
      shownRef.current = reels.slice()
    },
    [stopEverything],
  )

  const startSpin = useCallback(
    (spin: SlotSpin) => {
      stopEverything()
      setCurrent(spin)
      setSpinning(true)
      setBusy(true)
      setError('')
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // При «уменьшить движение» не отключаем разгон совсем (тогда не понять,
      // что кто-то дёрнул), а укорачиваем в несколько раз — как у кубиков.
      const scale = reduced ? 0.3 : 1
      const n = SLOT_SYMBOLS.length
      spin.reels.forEach((target, i) => {
        const strip = stripRefs.current[i]
        if (!strip) return
        const from = shownRef.current[i] ?? 0
        const travel = (BASE_LOOPS + i) * n + ((((target - from) % n) + n) % n)
        const landing = from + travel
        strip.parentElement?.classList.add('slots-reel-spinning')
        const run = strip.animate([{ transform: offsetFor(from) }, { transform: offsetFor(landing) }], {
          duration: REEL_STOP_MS[i] * scale,
          easing: 'cubic-bezier(0.15, 0.85, 0.3, 1)',
          fill: 'forwards',
        })
        run.onfinish = () => {
          strip.parentElement?.classList.remove('slots-reel-spinning')
          // Символ уже на месте; короткий «досад» вниз-вверх, как у
          // механического барабана, и фиксируем статикой.
          const settle = strip.animate(
            [
              { transform: offsetFor(landing) },
              { transform: offsetFor(landing + 0.16) },
              { transform: offsetFor(landing) },
            ],
            { duration: 240 * scale, easing: 'ease-out' },
          )
          settle.onfinish = () => {
            strip.style.transform = offsetFor(target)
            shownRef.current[i] = target
          }
          animsRef.current.push(settle)
          run.cancel()
          strip.style.transform = offsetFor(landing)
        }
        animsRef.current.push(run)
      })
      timersRef.current.push(window.setTimeout(() => setSpinning(false), SPIN_TOTAL_MS * scale + 240 * scale))
      // Замок держим столько, сколько ещё держит сервер: чужой рывок мог
      // дойти до нас с опозданием, тогда ждать осталось меньше.
      const elapsed = Math.min(LOCK_MS, Math.max(0, Date.now() - new Date(spin.created_at).getTime()))
      if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current)
      busyTimerRef.current = window.setTimeout(
        () => setBusy(false),
        Math.max(SPIN_TOTAL_MS * scale + 300, LOCK_MS - elapsed),
      )
    },
    [stopEverything],
  )

  const handleIncoming = useCallback(
    (spin: SlotSpin) => {
      if (seenRef.current.has(spin.id)) return
      seenRef.current.add(spin.id)
      setSpins((prev) => [spin, ...prev.filter((s) => s.id !== spin.id)].slice(0, RECENT_LIMIT))
      if (isRecent(spin)) startSpin(spin)
      else {
        setCurrent(spin)
        setStatic(spin.reels)
      }
    },
    [startSpin, setStatic],
  )

  const load = useCallback(async () => {
    try {
      const rows = await listRecentSpins(campaignId, RECENT_LIMIT)
      if (cancelledRef.current) return
      setNotReady(false)
      setError('')
      setSpins(rows)
      const newest = rows[0]
      if (!newest) return
      if (seenRef.current.size === 0) {
        // Первая загрузка: старое — просто история, крутить нечего. Кроме
        // рывка, который идёт прямо сейчас у остальных.
        rows.forEach((r) => seenRef.current.add(r.id))
        setCurrent(newest)
        if (isRecent(newest)) startSpin(newest)
        else setStatic(newest.reels)
        return
      }
      // Realtime мог пропустить событие — страховка та же, что у кубиков.
      if (!seenRef.current.has(newest.id)) handleIncoming(newest)
      rows.forEach((r) => seenRef.current.add(r.id))
    } catch (err) {
      if (cancelledRef.current) return
      if (isTableMissing(err)) {
        setNotReady(true)
        return
      }
      setError(err instanceof Error ? err.message : 'Не удалось загрузить автомат')
    }
  }, [campaignId, handleIncoming, startSpin, setStatic])

  useEffect(() => {
    cancelledRef.current = false
    seenRef.current = new Set()
    void load()
    const unsubscribe = subscribeToSpins(campaignId, handleIncoming, () => void load())
    return () => {
      cancelledRef.current = true
      unsubscribe()
      stopEverything()
      if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current)
      if (leverTimerRef.current !== null) window.clearTimeout(leverTimerRef.current)
    }
  }, [campaignId, load, handleIncoming, stopEverything])

  useLiveSync(() => void load())

  const canPull = !busy && !pulling && !notReady

  function busyMessage(): string {
    if (notReady) return 'Автомат ещё не подключён в базе.'
    if (current && busy) {
      return current.user_id === myUserId ? 'Ты и так крутишь, подожди.' : `Крутит ${nameOf(current.user_id)}, подожди.`
    }
    return 'Подожди немного.'
  }

  async function pull() {
    if (!canPull) {
      setError(busyMessage())
      return
    }
    setPulling(true)
    setError('')
    try {
      const spin = await pullLever(campaignId)
      if (cancelledRef.current) return
      handleIncoming(spin)
    } catch (err) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Не удалось дёрнуть ручку')
      // Сервер сказал «занят» — значит, чей-то рывок до нас не доехал.
      void load()
    } finally {
      if (!cancelledRef.current) setPulling(false)
    }
  }

  // --- Ручка: тянуть вниз ---------------------------------------------------

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, fired: false, moved: false }
    draggedRef.current = false
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const pos = Math.min(1, Math.max(0, (e.clientY - drag.startY) / PULL_DISTANCE_PX))
    setLeverPos(pos)
    if (pos > 0.1) {
      drag.moved = true
      draggedRef.current = true
    }
    if (!drag.fired && pos >= PULL_FIRE_AT) {
      drag.fired = true
      void pull()
    }
  }

  function onPointerEnd() {
    dragRef.current = null
    setDragging(false)
    setLeverPos(0)
  }

  // Ручка сама делает рывок вниз и обратно — для клавиатуры, скринридера и
  // простого щелчка/тапа без протаскивания. После протаскивания браузер тоже
  // шлёт click, но его мы уже отработали в onPointerMove.
  function kick() {
    setLeverPos(1)
    if (leverTimerRef.current !== null) window.clearTimeout(leverTimerRef.current)
    leverTimerRef.current = window.setTimeout(() => setLeverPos(0), 250)
    void pull()
  }

  function onClick() {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    kick()
  }

  const outcome = current && !spinning ? (SLOT_OUTCOMES[current.outcome] ?? SLOT_OUTCOMES.none) : null
  let status: string
  if (notReady) status = 'Автомат ещё не подключён в базе.'
  else if (spinning && current)
    status = current.user_id === myUserId ? 'Крутишь ты…' : `Крутит ${nameOf(current.user_id)}…`
  else if (outcome && current) status = `${nameOf(current.user_id)}: ${outcome.text}`
  else status = 'Потяни ручку вниз'

  return (
    <section className="slots sheet-section">
      <div className="slots-machine">
        <div className="slots-cabinet">
          <div className="slots-marquee">🎰 Однорукий бандит</div>
          <div className="slots-window">
            {Array.from({ length: SLOT_REELS }, (_, i) => (
              <div key={i} className="slots-reel">
                <div
                  className="slots-strip"
                  ref={(el) => {
                    stripRefs.current[i] = el
                  }}
                >
                  {Array.from({ length: STRIP_REPEATS }, (_, r) =>
                    SLOT_SYMBOLS.map((s, k) => (
                      <div key={`${r}-${k}`} className="slots-cell" aria-hidden="true">
                        {s}
                      </div>
                    )),
                  )}
                </div>
              </div>
            ))}
            <div className="slots-payline" aria-hidden="true" />
          </div>
          <div className={`slots-status${outcome ? ' ' + outcome.cls : ''}`} aria-live="polite">
            {status}
          </div>
          {error && <p className="auth-error slots-error">{error}</p>}
        </div>

        <div className="slots-lever-wrap">
          <button
            type="button"
            className={`slots-lever${dragging ? ' slots-lever-dragging' : ''}${canPull ? '' : ' slots-lever-locked'}`}
            style={{ '--lever-pos': leverPos } as CSSProperties}
            aria-label="Дёрнуть ручку"
            title={canPull ? 'Потяни вниз' : busyMessage()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClick={onClick}
          >
            <span className="slots-lever-arm" />
            <span className="slots-lever-knob" />
            <span className="slots-lever-base" />
          </button>
        </div>
      </div>

      {spins.length > 0 && (
        <ul className="slots-history">
          {spins.map((s) => {
            const hidden = spinning && current?.id === s.id
            const o = SLOT_OUTCOMES[s.outcome] ?? SLOT_OUTCOMES.none
            return (
              <li key={s.id} className={`slots-history-row${current?.id === s.id ? ' slots-history-current' : ''}`}>
                <span className="slots-history-name">{nameOf(s.user_id)}</span>
                {/* Пока барабаны крутятся, итог в истории не подсматривается. */}
                <span className="slots-history-reels">{hidden ? '🎰 …' : s.reels.map(symbolAt).join(' ')}</span>
                <span className={`slots-history-outcome${hidden ? '' : ' ' + o.cls}`}>{hidden ? '' : o.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
