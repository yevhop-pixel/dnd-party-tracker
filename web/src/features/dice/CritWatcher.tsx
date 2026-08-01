import { useEffect, useRef, useState } from 'react'
import type { DiceRoll } from '../../lib/types'
import ChibiOverlay from './ChibiOverlay'
import { getRoll, subscribeToRolls } from './diceApi'

// Крит-оверлей (анимация + музыка) уровня кампании — раньше жил внутри
// RollFeed, поэтому не срабатывал у тех, кто сидит не на вкладке «Кубы».
// Компонент невидим (return null, пока нечего показывать) и монтируется на
// уровне страницы (PlayerView/GmView), а не внутри таба.

export interface CritWatcherProps {
  campaignId: string
  myUserId: string
  isGm: boolean
  userNames: Record<string, string>
}

// Realtime-payload не проходит RLS-фильтрацию is_secret (см. diceApi.ts) —
// чужой тайный бросок скрываем на клиенте, если мы не ГМ и не автор.
function isVisible(roll: DiceRoll, myUserId: string, isGm: boolean): boolean {
  if (!roll.is_secret) return true
  return isGm || roll.user_id === myUserId
}

export default function CritWatcher({ campaignId, myUserId, isGm, userNames }: CritWatcherProps) {
  const [chibi, setChibi] = useState<{ id: string; crit: 'success' | 'fail'; rollerName: string } | null>(null)
  // Один показ анимации на бросок — иначе resync/повторная подписка могли бы
  // проиграть овервлей повторно для уже показанного крита.
  const shownCritIds = useRef<Set<string>>(new Set())
  // Крит-броски, ещё не вскрытые (is_pending=true) — на случай, если ответ на
  // них (contest) придёт раньше UPDATE is_pending:false (ответчик не может
  // снять pending с чужой строки — вскрытие целиком клиентское).
  const pendingCrits = useRef<Map<string, { crit: 'success' | 'fail'; userId: string }>>(new Map())

  useEffect(() => {
    let cancelled = false

    function showChibi(id: string, crit: 'success' | 'fail', userId: string) {
      if (shownCritIds.current.has(id)) return
      shownCritIds.current.add(id)
      setChibi({ id, crit, rollerName: userNames[userId] ?? 'Игрок' })
    }

    const unsubscribe = subscribeToRolls(campaignId, (roll, eventType) => {
      if (cancelled) return
      if (!isVisible(roll, myUserId, isGm)) return

      if (eventType === 'UPDATE') {
        // Интересует только вскрытие (is_pending → false) крит-броска —
        // сам факт UPDATE ничего другого не меняет (см. RLS-политику).
        if (roll.crit && !roll.is_pending) {
          pendingCrits.current.delete(roll.id)
          showChibi(roll.id, roll.crit, roll.user_id)
        }
        return
      }

      // INSERT
      if (roll.contest_roll_id) {
        // Встречный ответ вскрывает цель. Если сам ответ — крит, показываем
        // его (последовательно два оверлея подряд не заморачиваемся); иначе
        // пробуем вскрыть цель — сперва из локального кэша, иначе дозапросом.
        if (roll.crit) {
          showChibi(roll.id, roll.crit, roll.user_id)
          return
        }
        const cached = pendingCrits.current.get(roll.contest_roll_id)
        if (cached) {
          pendingCrits.current.delete(roll.contest_roll_id)
          showChibi(roll.contest_roll_id, cached.crit, cached.userId)
        } else {
          const targetId = roll.contest_roll_id
          void getRoll(targetId).then((target) => {
            if (cancelled || !target || !target.crit) return
            if (!isVisible(target, myUserId, isGm)) return
            showChibi(target.id, target.crit, target.user_id)
          })
        }
        return
      }

      if (!roll.crit) return
      if (roll.is_pending) {
        pendingCrits.current.set(roll.id, { crit: roll.crit, userId: roll.user_id })
        return
      }
      showChibi(roll.id, roll.crit, roll.user_id)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [campaignId])

  if (!chibi) return null

  return (
    <ChibiOverlay
      key={chibi.id}
      crit={chibi.crit}
      rollId={chibi.id}
      rollerName={chibi.rollerName}
      onDone={() => setChibi(null)}
    />
  )
}
