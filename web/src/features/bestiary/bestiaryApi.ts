// Слой доступа к бестиарию: записи, список «кому показано» и картинки.
// Стиль тот же, что у mapsApi/avatars — тонкая обёртка над supabase-js,
// ошибки не глушатся, всё разграничение живёт в RLS (см. schema.sql).
//
// Realtime здесь намеренно нет: payload postgres_changes не проходит
// RLS-фильтрацию, а в строке лежат хиты и способности монстра. Свежесть
// даёт useLiveSync на стороне панели.

import { supabase } from '../../lib/supabase'
import type { BestiaryEntry, BestiaryKind } from '../../lib/types'

const BUCKET = 'bestiary'
// Портрет монстра — не обои: 5 МБ хватает с запасом, а лишний десяток
// мегабайт партия качала бы на телефонах через мобильный интернет.
const MAX_FILE_SIZE = 5 * 1024 * 1024
const SIGNED_URL_TTL_SECONDS = 60 * 60

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// randomUUID есть только в secure context — с телефона по http://192.168…
// он падает, поэтому тот же фолбэк, что в lib/avatars.ts.
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

export async function listEntries(campaignId: string): Promise<BestiaryEntry[]> {
  // RLS сама решает, что отдать: ГМу всё, игроку — только показанное ему.
  // Клиент ничего не фильтрует, иначе разграничение поехало бы в два места.
  const { data, error } = await supabase
    .from('bestiary_entry')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as BestiaryEntry[]
}

export async function createEntry(campaignId: string, kind: BestiaryKind, name: string): Promise<BestiaryEntry> {
  const { data, error } = await supabase
    .from('bestiary_entry')
    .insert({ campaign_id: campaignId, kind, name })
    .select()
    .single()
  if (error) throw error
  return data as BestiaryEntry
}

export async function updateEntry(id: string, patch: Partial<BestiaryEntry>): Promise<BestiaryEntry> {
  const { data, error } = await supabase.from('bestiary_entry').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as BestiaryEntry
}

// Удаление под RLS возвращает успех и ноль строк, если политика не пустила —
// поэтому .select('id') и проверка (тот же урок, что с булавками на картах).
export async function deleteEntry(entry: BestiaryEntry): Promise<void> {
  const { data, error } = await supabase.from('bestiary_entry').delete().eq('id', entry.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Запись удалить не удалось — нет прав или её уже нет')
  // Картинку подчищаем ПОСЛЕ записи: осиротевший файл невиден никому (его
  // политика чтения смотрит на запись, которой уже нет), а вот запись без
  // файла выглядела бы как поломка.
  if (entry.image_path) {
    await supabase.storage.from(BUCKET).remove([entry.image_path]).catch(() => {})
  }
}

// --- Кому показано (visibility = 'chosen') -------------------------------
// Список читает и правит только ГМ (политика bestiary_viewer_gm).

export async function listViewers(entryId: string): Promise<string[]> {
  const { data, error } = await supabase.from('bestiary_viewer').select('user_id').eq('entry_id', entryId)
  if (error) throw error
  return (data ?? []).map((r) => r.user_id as string)
}

export async function setViewers(entryId: string, userIds: string[]): Promise<void> {
  // Список короткий (четыре человека за столом), поэтому переписываем его
  // целиком, а не считаем разницу: меньше кода и нет шанса разъехаться.
  const { error: delError } = await supabase.from('bestiary_viewer').delete().eq('entry_id', entryId)
  if (delError) throw delError
  if (userIds.length === 0) return
  const { error } = await supabase
    .from('bestiary_viewer')
    .insert(userIds.map((userId) => ({ entry_id: entryId, user_id: userId })))
  if (error) throw error
}

// --- Картинка ------------------------------------------------------------

export async function uploadImage(campaignId: string, file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) throw new Error('Картинка должна быть PNG, JPEG, WEBP или GIF')
  if (file.size > MAX_FILE_SIZE) throw new Error('Картинка больше 5 МБ')
  // Первый сегмент пути обязан быть campaign_id — это проверяет политика
  // bestiary_file_write.
  const path = `${campaignId}/${genId()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}

export async function removeImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// Кэш держит ПРОМИС, а не строку: два компонента с одним path схлопываются
// в один запрос подписи (тот же приём, что в lib/avatars.ts).
const urlCache = new Map<string, Promise<string>>()

export function getImageUrl(path: string): Promise<string> {
  const cached = urlCache.get(path)
  if (cached) return cached
  const promise = supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data) throw error ?? new Error('Не удалось получить ссылку на картинку')
      return data.signedUrl
    })
    .catch((err) => {
      // Сломанный промис в кэше остался бы навсегда.
      urlCache.delete(path)
      throw err
    })
  urlCache.set(path, promise)
  return promise
}

// Картинку заменили — старая подпись в кэше больше не нужна.
export function forgetImageUrl(path: string): void {
  urlCache.delete(path)
}
