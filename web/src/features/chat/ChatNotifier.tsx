// Уведомления о новых сообщениях. Живёт на уровне кампании (как CritWatcher),
// а не внутри вкладки «Чат» — иначе о сообщении узнал бы только тот, кто и так
// смотрит в чат. Делает три вещи: считает непрочитанные для значка, пикает
// звуком и показывает системную всплывашку браузера.
//
// Счётчик считается ОТ ОТМЕТКИ «когда я последний раз смотрел чат», а не по
// живым событиям: сообщения, пришедшие пока сайт был закрыт, раньше значка не
// давали вовсе. Отметка хранится локально — у общего чата и объявлений в базе
// признака прочтения нет, и заводить его ради значка не стоит.
//
// ЭТО НЕ ПУШ: телефон с закрытым сайтом ничего не покажет — для этого нужна
// серверная рассылка (service worker + VAPID), см. STATUS.md.
import { useEffect, useRef, useState } from 'react'
import type { Message } from '../../lib/types'
import { countMessagesSince, subscribeToMessages } from './chatApi'
import { getUiState, setUiState } from '../../lib/uiState'
import { notify, playBlip } from '../../lib/notify'

interface ChatNotifierProps {
  campaignId: string
  myUserId: string
  // Смотрит ли человек в чат прямо сейчас: вкладка «Чат» или открытый карман.
  chatOpen: boolean
  userNames: Record<string, string>
  onUnreadChange: (count: number) => void
}

function seenKey(campaignId: string): string {
  return `chat-seen-${campaignId}`
}

export default function ChatNotifier({
  campaignId,
  myUserId,
  chatOpen,
  userNames,
  onUnreadChange,
}: ChatNotifierProps) {
  const [unread, setUnread] = useState(0)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const chatOpenRef = useRef(chatOpen)
  chatOpenRef.current = chatOpen
  const namesRef = useRef(userNames)
  namesRef.current = userNames
  const onUnreadRef = useRef(onUnreadChange)
  onUnreadRef.current = onUnreadChange

  useEffect(() => {
    onUnreadRef.current(unread)
  }, [unread])

  // Открыл чат — всё прочитано: двигаем отметку и гасим счётчик.
  useEffect(() => {
    if (!chatOpen || document.visibilityState !== 'visible') return
    setUiState(seenKey(campaignId), new Date().toISOString())
    setUnread(0)
  }, [chatOpen, campaignId])

  // Стартовый пересчёт: сколько чужих сообщений накопилось с прошлого раза.
  useEffect(() => {
    if (chatOpenRef.current) return
    const since = getUiState<string>(seenKey(campaignId))
    if (!since) {
      // Первый заход — считать «непрочитанным» всю историю незачем.
      setUiState(seenKey(campaignId), new Date().toISOString())
      return
    }
    countMessagesSince(campaignId, since)
      .then(setUnread)
      .catch(() => {
        /* значок — не критичная функция */
      })
  }, [campaignId])

  useEffect(() => {
    function handle(message: Message) {
      if (message.sender_id === myUserId) return
      // postgres_changes НЕ проходит через RLS (см. chatApi) — что из этой
      // кампании относится ко мне, решаем здесь.
      const forMe =
        message.channel === 'party' ||
        message.channel === 'announcement' ||
        (message.channel === 'private' && message.recipient_id === myUserId)
      if (!forMe) return

      const looking = chatOpenRef.current && document.visibilityState === 'visible'
      if (looking) {
        setUiState(seenKey(campaignId), new Date().toISOString())
        return
      }

      setUnread((n) => n + 1)
      playBlip()
      const who = namesRef.current[message.sender_id] ?? 'Игрок'
      const what = message.body?.trim() || (message.attachment_path ? '📷 фото' : '')
      notify(`${who} — сообщение`, what, `chat-${campaignId}`)
    }

    return subscribeToMessages(campaignId, handle, undefined, ':notify')
  }, [campaignId, myUserId])

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    try {
      setPermission(await Notification.requestPermission())
    } catch {
      /* отказ или недоступность — кнопка просто останется */
    }
  }

  if (permission !== 'default') return null

  return (
    <button type="button" className="chat-notify-ask" onClick={() => void requestPermission()}>
      🔔 Включить уведомления
    </button>
  )
}
