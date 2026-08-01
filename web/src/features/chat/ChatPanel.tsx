import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { Message } from '../../lib/types'
import {
  countUnread,
  getAttachmentUrl,
  listAnnouncements,
  listParty,
  listThread,
  markThreadRead,
  sendMessage,
  subscribeToMessages,
} from './chatApi'
import './chat.css'

export interface ChatMember {
  id: string
  name: string
  role: 'gm' | 'player'
}

interface ChatPanelProps {
  campaignId: string
  myUserId: string
  isGm: boolean
  members: ChatMember[]
}

// Что сейчас открыто в правой панели: личный диалог с конкретным участником,
// общая лента объявлений ГМа или общий чат кампании (виден всем). null —
// ничего не выбрано (только у ГМа, на мобильном это стартовый экран со
// списком собеседников).
type Selection = { kind: 'dialog'; userId: string } | { kind: 'announcements' } | { kind: 'party' }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// На тач-устройствах у Enter нет клавиатурного смысла «отправить» — экранная
// клавиатура использует его для переноса строки/предиктивного набора, поэтому
// там отправка только по кнопке.
function isCoarsePointerDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export default function ChatPanel({ campaignId, myUserId, isGm, members }: ChatPanelProps) {
  const gm = members.find((m) => m.role === 'gm')
  const players = members.filter((m) => m.role === 'player')

  function getMemberName(id: string): string {
    return members.find((m) => m.id === id)?.name ?? 'Участник'
  }

  // Игрок сразу открыт в диалоге с ГМом (это его единственный собеседник).
  // ГМ на старте не выбрал никого — на мобильном это экран со списком.
  const [selection, setSelection] = useState<Selection | null>(
    !isGm && gm ? { kind: 'dialog', userId: gm.id } : null,
  )

  const [messages, setMessages] = useState<Message[] | null>(null)
  const [threadError, setThreadError] = useState('')

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [listError, setListError] = useState('')

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  // Фото, выбранное в composer'е, но ещё не отправленное — и его превью
  // (object URL, живёт только пока файл не отправлен/не убран).
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Кэш подписанных ссылок на уже отправленные вложения, по attachment_path —
  // чтобы не дёргать getAttachmentUrl на каждый рендер. attachmentErrors —
  // пути, для которых запрос не удался (истёк URL/нет прав); кнопка «повторить»
  // убирает путь оттуда и просит ссылку заново.
  const [attachmentUrls, setAttachmentUrls] = useState<Map<string, string>>(new Map())
  const [attachmentErrors, setAttachmentErrors] = useState<Set<string>>(new Set())

  const bottomRef = useRef<HTMLDivElement>(null)

  // handleInsert подписки живёт дольше, чем один рендер — держим свежую
  // выборку в ref, чтобы не пересоздавать подписку при каждом клике по списку.
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  // --- Бейджи непрочитанного (только ГМ) ---------------------------------
  const reloadUnread = useCallback(async () => {
    if (!isGm) return
    try {
      const counts = await countUnread(campaignId)
      setUnreadCounts(counts)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Не удалось загрузить непрочитанные')
    }
  }, [isGm, campaignId])

  useEffect(() => {
    void reloadUnread()
  }, [reloadUnread])

  // --- Загрузка сообщений открытой нити -----------------------------------
  useEffect(() => {
    if (!selection) {
      setMessages(null)
      return
    }
    let cancelled = false
    setMessages(null)
    setThreadError('')
    ;(async () => {
      try {
        const data =
          selection.kind === 'announcements'
            ? await listAnnouncements(campaignId)
            : selection.kind === 'party'
              ? await listParty(campaignId)
              : await listThread(campaignId, selection.userId)
        if (cancelled) return
        setMessages(data)
        if (selection.kind === 'dialog') {
          await markThreadRead(campaignId, selection.userId)
          if (!cancelled) setUnreadCounts((c) => ({ ...c, [selection.userId]: 0 }))
        }
      } catch (err) {
        if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Не удалось загрузить сообщения')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selection, campaignId])

  // --- Живые обновления -----------------------------------------------------
  const handleInsert = useCallback(
    (msg: Message) => {
      const isMine = msg.sender_id === myUserId
      const isToMe = msg.recipient_id === myUserId
      const isBroadcast = msg.recipient_id === null // объявление или общий чат — оба видны всем участникам
      // Подписка не фильтруется RLS — отбрасываем всё, что не моё, не адресовано мне и не общее.
      if (!isMine && !isToMe && !isBroadcast) return

      const sel = selectionRef.current
      const belongsToOpenThread =
        sel != null &&
        ((sel.kind === 'announcements' && msg.channel === 'announcement') ||
          (sel.kind === 'party' && msg.channel === 'party') ||
          (sel.kind === 'dialog' && msg.channel === 'private' && (msg.sender_id === sel.userId || msg.recipient_id === sel.userId)))

      if (belongsToOpenThread) {
        setMessages((prev) => (prev && prev.some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg]))
        if (!isMine && sel && sel.kind === 'dialog') {
          void markThreadRead(campaignId, sel.userId)
        }
        return
      }

      // Входящее в закрытую нить: у ГМа это личное сообщение от игрока — бейдж.
      if (isGm && isToMe && !isMine) {
        setUnreadCounts((c) => ({ ...c, [msg.sender_id]: (c[msg.sender_id] ?? 0) + 1 }))
      }
    },
    [myUserId, isGm, campaignId],
  )

  // Перечитывает открытую нить без сброса состояния между запросами —
  // используется только после переподключения канала (см. onResync ниже),
  // где гонки с переключением вкладок не критичны.
  const reloadOpenThread = useCallback(async () => {
    const sel = selectionRef.current
    if (!sel) return
    try {
      const data =
        sel.kind === 'announcements'
          ? await listAnnouncements(campaignId)
          : sel.kind === 'party'
            ? await listParty(campaignId)
            : await listThread(campaignId, sel.userId)
      setMessages(data)
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Не удалось загрузить сообщения')
    }
  }, [campaignId])

  // После обрыва realtime-канала и переподключения могли уйти события —
  // перечитываем и открытую нить, и счётчики непрочитанного.
  const handleResync = useCallback(() => {
    void reloadOpenThread()
    void reloadUnread()
  }, [reloadOpenThread, reloadUnread])

  useEffect(() => {
    const unsubscribe = subscribeToMessages(campaignId, handleInsert, handleResync)
    return unsubscribe
  }, [campaignId, handleInsert, handleResync])

  // --- Автоскролл к последнему сообщению -------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // --- Превью выбранного, но ещё не отправленного фото -----------------------
  useEffect(() => {
    if (!attachFile) {
      setAttachPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(attachFile)
    setAttachPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [attachFile])

  // --- Подписанные ссылки на вложения уже отправленных сообщений -------------
  // Догружает по одной для каждого attachment_path, которого ещё нет в кэше
  // и который не в списке ошибок; повторный запуск после каждого обновления
  // кэша сам завершается, когда «недостающих» больше не осталось.
  useEffect(() => {
    if (!messages) return
    const missing = messages
      .map((m) => m.attachment_path)
      .filter((p): p is string => !!p && !attachmentUrls.has(p) && !attachmentErrors.has(p))
    if (missing.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const path of missing) {
        try {
          const url = await getAttachmentUrl(path)
          if (cancelled) return
          setAttachmentUrls((prev) => new Map(prev).set(path, url))
        } catch {
          if (cancelled) return
          setAttachmentErrors((prev) => new Set(prev).add(path))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [messages, attachmentUrls, attachmentErrors])

  function retryAttachment(path: string) {
    setAttachmentErrors((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // позволяет выбрать тот же файл повторно
    if (!file) return
    setAttachFile(file)
  }

  async function handleSend() {
    if (!selection) return
    const body = draft.trim()
    if (!body && !attachFile) return
    const recipientId = selection.kind === 'dialog' ? selection.userId : null
    const channel: Message['channel'] =
      selection.kind === 'dialog' ? 'private' : selection.kind === 'announcements' ? 'announcement' : 'party'
    setSending(true)
    setSendError('')
    try {
      const msg = await sendMessage(campaignId, recipientId, body, attachFile ?? undefined, channel)
      setDraft('')
      setAttachFile(null)
      setMessages((prev) => (prev && prev.some((m) => m.id === msg.id) ? prev : [...(prev ?? []), msg]))
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Не удалось отправить сообщение')
    } finally {
      setSending(false)
    }
  }

  // Общий чат открыт для отправки всем участникам; объявления — только ГМу;
  // личный диалог — обеим сторонам (по RLS).
  const composerVisible = selection != null && (selection.kind === 'dialog' || selection.kind === 'party' || isGm)

  function renderAttachment(path: string) {
    if (attachmentErrors.has(path)) {
      return (
        <div className="chat-attachment-error">
          <span>Не удалось загрузить фото</span>
          <button type="button" onClick={() => retryAttachment(path)}>
            Повторить
          </button>
        </div>
      )
    }
    const url = attachmentUrls.get(path)
    if (!url) return <div className="chat-attachment-loading">Загрузка фото…</div>
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Вложение" className="chat-attachment-image" />
      </a>
    )
  }

  function renderMessages() {
    if (!selection) return null
    if (threadError) return <p className="auth-error">{threadError}</p>
    if (messages === null) return <p className="chat-empty">Загрузка…</p>
    if (messages.length === 0) return <p className="chat-empty">Пока нет сообщений.</p>
    // В общем чате пишут все участники — над чужими пузырями нужна подпись
    // автора; в личном диалоге и объявлениях собеседник и так очевиден.
    const showAuthor = selection.kind === 'party'
    return (
      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.sender_id === myUserId ? 'chat-message-mine' : 'chat-message-theirs'}`}>
            {showAuthor && m.sender_id !== myUserId && <div className="chat-message-author">{getMemberName(m.sender_id)}</div>}
            <div className="chat-message-body">
              {m.attachment_path && renderAttachment(m.attachment_path)}
              {m.body && <div className="chat-message-text">{m.body}</div>}
            </div>
            <div className="chat-message-time">{formatTime(m.created_at)}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    )
  }

  function renderComposer() {
    if (!composerVisible) return null
    return (
      <>
        {attachPreviewUrl && (
          <div className="chat-attach-preview">
            <img src={attachPreviewUrl} alt="Предпросмотр" />
            <button type="button" className="chat-attach-remove" onClick={() => setAttachFile(null)} aria-label="Убрать фото">
              ×
            </button>
          </div>
        )}
        <div className="chat-composer">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="chat-attach-input"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="chat-attach-btn"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Прикрепить фото"
            title="Прикрепить фото"
          >
            📎
          </button>
          <textarea
            className="chat-composer-input"
            value={draft}
            placeholder="Написать сообщение…"
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return
              // IME (набор иероглифов и т.п.): Enter подтверждает вариант в
              // композиции, а не отправляет сообщение.
              if (e.nativeEvent.isComposing) return
              if (isCoarsePointerDevice()) return
              e.preventDefault()
              void handleSend()
            }}
          />
          <button type="button" onClick={() => void handleSend()} disabled={sending || (!draft.trim() && !attachFile)}>
            {sending ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
        {sendError && <p className="auth-error">{sendError}</p>}
      </>
    )
  }

  if (isGm) {
    return (
      <div className={`chat-panel-gm ${selection ? 'chat-thread-open' : ''}`}>
        <aside className="chat-list">
          <h2>Переписка</h2>
          {listError && <p className="auth-error">{listError}</p>}
          <ul className="chat-list-items">
            <li>
              <button
                type="button"
                className={`chat-list-item ${selection?.kind === 'party' ? 'chat-list-item-active' : ''}`}
                onClick={() => setSelection({ kind: 'party' })}
              >
                <span>💬 Общий чат</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`chat-list-item ${selection?.kind === 'announcements' ? 'chat-list-item-active' : ''}`}
                onClick={() => setSelection({ kind: 'announcements' })}
              >
                <span>📢 Объявление всем</span>
              </button>
            </li>
            {players.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`chat-list-item ${
                    selection?.kind === 'dialog' && selection.userId === p.id ? 'chat-list-item-active' : ''
                  }`}
                  onClick={() => setSelection({ kind: 'dialog', userId: p.id })}
                >
                  <span>{p.name}</span>
                  {!!unreadCounts[p.id] && <span className="chat-badge">{unreadCounts[p.id]}</span>}
                </button>
              </li>
            ))}
            {players.length === 0 && <li className="chat-empty">В кампании пока нет игроков.</li>}
          </ul>
        </aside>
        <section className="chat-thread">
          {selection ? (
            <>
              <div className="chat-thread-header">
                <button type="button" className="chat-back-btn" onClick={() => setSelection(null)}>
                  ← Назад
                </button>
                <h2>
                  {selection.kind === 'announcements'
                    ? '📢 Объявление всем'
                    : selection.kind === 'party'
                      ? '💬 Общий чат'
                      : getMemberName(selection.userId)}
                </h2>
              </div>
              {renderMessages()}
              {renderComposer()}
            </>
          ) : (
            <p className="chat-empty">Выберите собеседника слева.</p>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="chat-panel-player">
      <div className="chat-tabs">
        <button
          type="button"
          className={`chat-tab ${selection?.kind === 'party' ? 'chat-tab-active' : ''}`}
          onClick={() => setSelection({ kind: 'party' })}
        >
          💬 Общий чат
        </button>
        <button
          type="button"
          className={`chat-tab ${selection?.kind === 'dialog' ? 'chat-tab-active' : ''}`}
          disabled={!gm}
          onClick={() => gm && setSelection({ kind: 'dialog', userId: gm.id })}
        >
          Сообщения
        </button>
        <button
          type="button"
          className={`chat-tab ${selection?.kind === 'announcements' ? 'chat-tab-active' : ''}`}
          onClick={() => setSelection({ kind: 'announcements' })}
        >
          📢 Объявления
        </button>
      </div>
      {!gm && <p className="chat-empty">ГМ кампании не найден среди участников.</p>}
      <div className="chat-thread">
        {renderMessages()}
        {renderComposer()}
      </div>
    </div>
  )
}
