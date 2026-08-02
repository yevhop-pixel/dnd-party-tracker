// Уведомления о новых сообщениях. Живёт на уровне кампании (как CritWatcher),
// а не внутри вкладки «Чат» — иначе о сообщении узнал бы только тот, кто и так
// смотрит в чат. Делает три вещи: считает непрочитанные для значка на вкладке,
// пикает звуком и показывает системную всплывашку браузера, когда вкладка не
// на переднем плане.
//
// ЭТО НЕ ПУШ: телефон с закрытым сайтом ничего не покажет — для этого нужна
// серверная рассылка (service worker + VAPID), см. STATUS.md.
import { useEffect, useRef, useState } from 'react'
import type { Message } from '../../lib/types'
import { subscribeToMessages } from './chatApi'

interface ChatNotifierProps {
  campaignId: string
  myUserId: string
  // Открыта ли прямо сейчас вкладка «Чат» — при ней и видимой странице
  // сообщение считается прочитанным сразу.
  chatOpen: boolean
  userNames: Record<string, string>
  onUnreadChange: (count: number) => void
}

// Короткий двухнотный «блип» на WebAudio — файлов в проекте нет принципиально
// (см. крит-джингл), да и тащить ради одного звука мегабайт не хочется.
function playBlip() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    gain.connect(ctx.destination)
    for (const [freq, at] of [
      [660, 0],
      [880, 0.12],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + at)
      osc.connect(gain)
      osc.start(now + at)
      osc.stop(now + at + 0.14)
    }
    // Контекст закрываем сами — иначе на каждое сообщение остаётся висеть
    // новый, и браузер рано или поздно перестанет их выдавать.
    window.setTimeout(() => void ctx.close(), 600)
  } catch {
    // Звук — необязательная деталь: если браузер не дал контекст (нет ещё
    // ни одного жеста пользователя), молча живём дальше.
  }
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

  // Подписка вешается один раз на кампанию, а внутри колбэка нужны свежие
  // chatOpen/userNames — держим их в рефах, чтобы не пересоздавать канал на
  // каждое переключение вкладки (это обрыв и повторный SUBSCRIBED).
  const chatOpenRef = useRef(chatOpen)
  chatOpenRef.current = chatOpen
  const namesRef = useRef(userNames)
  namesRef.current = userNames
  const onUnreadRef = useRef(onUnreadChange)
  onUnreadRef.current = onUnreadChange

  useEffect(() => {
    onUnreadRef.current(unread)
  }, [unread])

  // Зашёл в чат (и вкладка браузера видима) — счётчик обнуляем.
  useEffect(() => {
    if (chatOpen && document.visibilityState === 'visible') setUnread(0)
  }, [chatOpen])

  useEffect(() => {
    function onVisible() {
      if (chatOpenRef.current && document.visibilityState === 'visible') setUnread(0)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    function handle(message: Message) {
      if (message.sender_id === myUserId) return
      // postgres_changes НЕ проходит через RLS (см. chatApi) — что из этой
      // кампании относится ко мне, решаем здесь: общий чат и объявления видят
      // все, личное — только адресат.
      const forMe =
        message.channel === 'party' ||
        message.channel === 'announcement' ||
        (message.channel === 'private' && message.recipient_id === myUserId)
      if (!forMe) return

      const looking = chatOpenRef.current && document.visibilityState === 'visible'
      if (looking) return

      setUnread((n) => n + 1)
      playBlip()

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const who = namesRef.current[message.sender_id] ?? 'Игрок'
        const what = message.body?.trim() || (message.attachment_path ? '📷 фото' : '')
        try {
          // tag: одна кампания — одно окно уведомления, чтобы двадцать
          // сообщений не выстроились двадцатью всплывашками.
          new Notification(`${who} — сообщение`, { body: what.slice(0, 140), tag: `chat-${campaignId}` })
        } catch {
          // Notification может быть запрещён политикой страницы — не беда,
          // значок на вкладке и звук уже отработали.
        }
      }
    }

    return subscribeToMessages(campaignId, handle, undefined, ':notify')
  }, [campaignId, myUserId])

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    try {
      setPermission(await Notification.requestPermission())
    } catch {
      // Отказ или недоступность — оставляем как есть, кнопка просто исчезнет
      // только после явного ответа браузера.
    }
  }

  if (permission !== 'default') return null

  return (
    <button type="button" className="chat-notify-ask" onClick={() => void requestPermission()}>
      🔔 Включить уведомления
    </button>
  )
}
