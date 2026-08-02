// «Твой ход» — звук и всплывашка. Живёт на уровне кампании, как CritWatcher и
// ChatNotifier: если держать это внутри вкладки «Бой», сигнал получит только
// тот, кто и так на неё смотрит, — то есть ровно не тот случай, ради которого
// всё делалось (поймано на ревью).
import { useEffect, useRef } from 'react'
import { listEntries, subscribeToInitiative } from './initiativeApi'
import { notify, playBlip } from '../../lib/notify'

interface TurnWatcherProps {
  campaignId: string
  // id листа текущего игрока; у ГМа персонажа нет — ему сигналить нечего.
  myCharacterId: string | null
}

export default function TurnWatcher({ campaignId, myCharacterId }: TurnWatcherProps) {
  // id бойца, о чьём ходе уже сигналили. Первое увиденное значение
  // запоминается БЕЗ сигнала: иначе заход на страницу посреди чужого (или
  // своего, уже идущего) хода каждый раз пикал бы заново.
  const announcedRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    announcedRef.current = undefined

    function check() {
      listEntries(campaignId)
        .then((entries) => {
          if (cancelled) return
          const current = entries.find((e) => e.is_current) ?? null
          const currentId = current?.id ?? null
          const first = announcedRef.current === undefined
          if (announcedRef.current === currentId) return
          announcedRef.current = currentId
          if (first || !current) return
          if (myCharacterId && current.character_id === myCharacterId) {
            playBlip()
            notify('Твой ход!', current.name, `turn-${campaignId}`)
          }
        })
        .catch(() => {
          /* сигнал — не критичная функция, молча ждём следующего события */
        })
    }

    check()
    const unsubscribe = subscribeToInitiative(campaignId, check, check, ':turn')
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [campaignId, myCharacterId])

  return null
}
