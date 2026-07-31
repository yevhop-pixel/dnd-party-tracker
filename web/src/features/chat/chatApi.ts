// Слой доступа к переписке. Тонкая обёртка над supabase-js: без бизнес-логики,
// только запросы, которые соответствуют политикам RLS из supabase/schema.sql
// (секция 7 «Личная переписка ГМ ↔ игрок»). Ошибки не глушатся — пробрасываются
// наружу, ChatPanel сам решает, что показать.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Message } from '../../lib/types'

const BUCKET = 'chat-files'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 МБ
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 60 минут

// Ключ — MIME-тип из File.type, значение — расширение файла в Storage.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// crypto.randomUUID доступен только в secure context (https или localhost) —
// открытие dev-сборки с телефона по http://192.168… роняет его. Фолбэк ничем
// не защищён криптографически, но здесь UUID используется только как имя
// файла в Storage, а не как секрет.
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

// Сессия уже лежит в памяти supabase-js, поэтому getSession() не ходит в сеть.
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('Не авторизован')
  return data.session.user.id
}

// Отправка сообщения. recipientId = null — объявление всей кампании.
// RLS (message_send) сама решает, кому можно писать: игрок — только ГМу,
// ГМ — кому угодно, включая объявления; клиент здесь ничего не проверяет.
// file — необязательное фото-вложение: сперва грузим файл в chat-files
// (первый сегмент пути — campaign_id, как того требует storage-политика),
// затем создаём строку сообщения; если insert не прошёл — не оставляем
// файл-сироту в Storage.
export async function sendMessage(
  campaignId: string,
  recipientId: string | null,
  body: string,
  file?: File,
): Promise<Message> {
  const userId = await requireUserId()

  let attachmentPath: string | null = null
  if (file) {
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) throw new Error('Допустимые форматы изображения: PNG, JPEG, WEBP, GIF')
    if (file.size > MAX_FILE_SIZE) throw new Error('Файл слишком большой: максимум 10 МБ')

    attachmentPath = `${campaignId}/${genId()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(attachmentPath, file, {
      contentType: file.type,
    })
    if (uploadError) throw uploadError
  }

  const { data, error } = await supabase
    .from('message')
    .insert({ campaign_id: campaignId, sender_id: userId, recipient_id: recipientId, body, attachment_path: attachmentPath })
    .select()
    .single()

  if (error) {
    if (attachmentPath) await supabase.storage.from(BUCKET).remove([attachmentPath])
    throw error
  }
  return data as Message
}

// Бакет 'chat-files' приватный — доступ к фото-вложению только по подписанной
// ссылке; RLS (chat_file_read) сама решает, видно ли сообщение текущему
// пользователю.
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

// Личный диалог между мной и otherUserId в рамках кампании — обе стороны
// переписки, по возрастанию времени (старые сверху, как в обычном чате).
// Забираем последние limit сообщений по убыванию времени и разворачиваем —
// иначе order(asc)+limit отдаёт САМЫЕ СТАРЫЕ N, а не последние.
export async function listThread(campaignId: string, otherUserId: string, limit = 100): Promise<Message[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('message')
    .select('*')
    .eq('campaign_id', campaignId)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as Message[]).reverse()
}

// Лента объявлений ГМа (recipient_id is null). Та же логика: берём последние
// limit по убыванию и разворачиваем в хронологический порядок.
export async function listAnnouncements(campaignId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await supabase
    .from('message')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('recipient_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as Message[]).reverse()
}

// Отмечает прочитанными сообщения от otherUserId ко мне. message_mark_read
// разрешает update только получателю — на чужие сообщения запрос просто
// не затронет ни одной строки.
export async function markThreadRead(campaignId: string, otherUserId: string): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('message')
    .update({ read_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('sender_id', otherUserId)
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
}

// Живые обновления по кампании. ВАЖНО: postgres_changes-пейлоад не проходит
// через RLS — фильтр здесь ограничивает только campaign_id, а какие именно
// сообщения из этой кампании относятся к текущему пользователю (свои,
// адресованные ему или объявления), должен решать вызывающий компонент.
// onResync вызывается при повторном 'SUBSCRIBED' (после обрыва канала и
// переподключения) — за время простоя могли уйти события, вызывающий код
// должен перечитать открытую нить/счётчики заново.
export function subscribeToMessages(
  campaignId: string,
  onInsert: (message: Message) => void,
  onResync?: () => void,
): () => void {
  let connectedOnce = false
  const channel: RealtimeChannel = supabase
    .channel(`message:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message', filter: `campaign_id=eq.${campaignId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}

// Число непрочитанных сообщений мне в кампании, сгруппированное по отправителю —
// для бейджей в списке собеседников на стороне ГМа.
export async function countUnread(campaignId: string): Promise<Record<string, number>> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('message')
    .select('sender_id')
    .eq('campaign_id', campaignId)
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1
  }
  return counts
}
