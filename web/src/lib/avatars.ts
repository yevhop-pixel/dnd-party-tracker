// Слой доступа к данным для аватарок персонажей. Тот же стиль, что в
// features/maps/mapsApi.ts: без бизнес-логики сверх необходимого, ошибки
// не глушатся. avatar_path в character_sheet НЕ пишется отсюда — это
// делает вызывающий код (TabStats через onSheetChange/автосейв SheetEditor),
// иначе запись в БД шла бы двумя путями и дублировалась.

import { supabase } from './supabase'
import type { CharacterSheet } from './types'

const BUCKET = 'avatars'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 МБ
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 60 минут

// Ключ — MIME-тип из File.type, значение — расширение файла в Storage.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// crypto.randomUUID доступен только в secure context (https или localhost) —
// открытие dev-сборки с телефона по http://192.168… роняет его. Фолбэк ничем
// не защищён криптографически, но здесь UUID используется только как имя
// файла в Storage, а не как секрет. (см. mapsApi.ts — тот же приём)
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

// Загружает новую аватарку в папку владельца (<owner_id>/<uuid>.<ext> —
// первый сегмент обязан быть auth.uid(), это проверяет storage-политика
// avatar_write) и удаляет старый файл, если он был. Запись avatar_path в
// character_sheet — забота вызывающего кода (см. комментарий в шапке файла).
export async function uploadAvatar(sheet: CharacterSheet, file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) throw new Error('Допустимые форматы изображения: PNG, JPEG, WEBP')
  if (file.size > MAX_FILE_SIZE) throw new Error('Файл слишком большой: максимум 5 МБ')

  const path = `${sheet.owner_id}/${genId()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error

  // Старый файл удаляем уже после успешной загрузки нового — если что-то
  // пойдёт не так по дороге, старая аватарка не пропадёт зря. Ошибку
  // удаления старого файла глушим осознанно: новая аватарка уже загружена
  // и её путь возвращён вызывающему коду, а файл-сирота ничему не мешает.
  if (sheet.avatar_path) {
    await supabase.storage.from(BUCKET).remove([sheet.avatar_path]).catch(() => {})
  }
  return path
}

// Удаляет файл текущей аватарки. avatar_path в character_sheet обнуляет
// вызывающий код тем же путём, что и при загрузке (см. uploadAvatar выше).
export async function removeAvatar(sheet: CharacterSheet): Promise<void> {
  if (!sheet.avatar_path) return
  const { error } = await supabase.storage.from(BUCKET).remove([sheet.avatar_path])
  if (error) throw error
}

// Бакет 'avatars' приватный — доступ к файлу только по подписанной ссылке.
// Кэш по пути файла: несколько компонентов Avatar на одной странице (шапка
// листа, карточка в списке и т.д.) не должны подписывать один и тот же путь
// повторно — держим промис результата, а не готовое значение, чтобы
// параллельные вызовы для одного path тоже схлопывались в один запрос.
const urlCache = new Map<string, Promise<string>>()

export function getAvatarUrl(path: string): Promise<string> {
  const cached = urlCache.get(path)
  if (cached) return cached

  const promise = supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error) {
        // Не оставляем в кэше сломанный промис — следующая попытка (например,
        // после восстановления сети) должна подписать ссылку заново.
        urlCache.delete(path)
        throw error
      }
      return data.signedUrl
    })
  urlCache.set(path, promise)
  return promise
}
