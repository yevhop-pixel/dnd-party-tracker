// Слой доступа к данным для карт локаций. Тонкая обёртка над supabase-js,
// см. src/lib/api.ts — тот же стиль: без бизнес-логики сверх необходимого,
// ошибки не глушатся. Отдельный файл (а не lib/api.ts), т.к. это зона
// модуля maps — см. распределение работ между исполнителями.

import { supabase } from '../../lib/supabase'
import type { GameMap, MapPin, MapToken } from '../../lib/types'

const BUCKET = 'maps'
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 МБ
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
// файла в Storage, а не как секрет.
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

// Сессия уже лежит в памяти supabase-js (её поддерживает onAuthStateChange),
// поэтому getSession() не ходит в сеть — в отличие от getUser(). Тот же
// паттерн, что requireUserId в lib/api.ts; локальная копия — это зона
// модуля maps, а не общий api.ts (см. шапку файла).
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('Не авторизован')
  return data.session.user.id
}

// Все карты, доступные текущему пользователю: RLS сама решает, что отдать —
// ГМ видит все карты кампании, игрок только is_revealed (см. schema.sql).
export async function listMaps(campaignId: string): Promise<GameMap[]> {
  const { data, error } = await supabase
    .from('game_map')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as GameMap[]
}

// nextSortOrder передаётся вызывающим кодом (обычно max(sort_order) + 1 из
// уже загруженного списка), чтобы не делать лишний запрос за агрегатом.
export async function uploadMap(
  campaignId: string,
  file: File,
  locationName: string,
  nextSortOrder: number,
): Promise<GameMap> {
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) throw new Error('Допустимые форматы изображения: PNG, JPEG, WEBP')
  if (file.size > MAX_FILE_SIZE) throw new Error('Файл слишком большой: максимум 15 МБ')

  // Первый сегмент пути обязан быть campaign_id — это проверяет storage-политика.
  const path = `${campaignId}/${genId()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('game_map')
    .insert({
      campaign_id: campaignId,
      location_name: locationName,
      storage_path: path,
      is_revealed: false,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) {
    // insert не прошёл — не оставляем файл-сироту в Storage.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data as GameMap
}

// revealed=true: reveal_map открывает карту, НЕ скрывая остальные — открытых
// может быть несколько (мировая + детализации). current_map_id в
// campaign_state получает эту карту как «показанную последней» — по этому
// сигналу PlayerMap автоматически переключает игроков на неё.
export async function setRevealed(mapId: string, revealed: boolean): Promise<void> {
  // Обе операции — RPC: помимо атомарности они обновляют campaign_state,
  // по которому игроки узнают о смене карты (см. subscribeToCampaignState).
  const { error } = await supabase.rpc(revealed ? 'reveal_map' : 'hide_map', { map_id: mapId })
  if (error) throw error
}

export async function renameMap(mapId: string, locationName: string): Promise<GameMap> {
  const { data, error } = await supabase
    .from('game_map')
    .update({ location_name: locationName })
    .eq('id', mapId)
    .select()
    .single()
  if (error) throw error
  return data as GameMap
}

// Удаляем сперва строку, потом файл: если удаление файла из Storage вдруг
// упадёт, в базе не останется карты со ссылкой на несуществующий файл —
// максимум останется файл-сирота, который ничему не мешает.
export async function deleteMap(map: GameMap): Promise<void> {
  const { error } = await supabase.from('game_map').delete().eq('id', map.id)
  if (error) throw error
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([map.storage_path])
  if (removeError) throw removeError
}

// Бакет 'maps' приватный — доступ к файлу только по подписанной ссылке.
export async function getMapUrl(map: GameMap): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(map.storage_path, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

// Живая подписка на все изменения карт кампании. Не разбираем payload —
// по любому событию (INSERT/UPDATE/DELETE) просто просим вызывающий код
// перечитать список: RLS сама отфильтрует то, что видно текущему
// пользователю, это надёжнее ручной синхронизации локального состояния.
// onResync вызывается при повторном 'SUBSCRIBED' (после обрыва канала и
// переподключения) — за время простоя могли уйти события, вызывающий код
// должен перечитать список карт заново.
export function subscribeToMaps(campaignId: string, onChange: () => void, onResync?: () => void): () => void {
  let connectedOnce = false
  const channel = supabase
    .channel(`game_map:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_map', filter: `campaign_id=eq.${campaignId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

// ---------------------------------------------------------------------
// Токены на карте: фишки персонажей/монстров (см. map_token в schema.sql).
// ---------------------------------------------------------------------

export async function listTokens(mapId: string): Promise<MapToken[]> {
  const { data, error } = await supabase.from('map_token').select('*').eq('map_id', mapId)
  if (error) throw error
  return data as MapToken[]
}

// x/y не передаём — новый токен всегда встаёт в центр карты (0.5, 0.5),
// дальше ГМ перетаскивает его на место.
export async function addToken(campaignId: string, mapId: string, label: string, color: string): Promise<MapToken> {
  const { data, error } = await supabase
    .from('map_token')
    .insert({ campaign_id: campaignId, map_id: mapId, label, color, x: 0.5, y: 0.5 })
    .select()
    .single()
  if (error) throw error
  return data as MapToken
}

// patch — частичное обновление (обычно {x, y} после drag, либо {label, color}
// из попапа редактирования, либо {target_map_id} при настройке портала).
export async function updateToken(
  id: string,
  patch: Partial<Pick<MapToken, 'x' | 'y' | 'label' | 'color' | 'target_map_id'>>,
): Promise<MapToken> {
  const { data, error } = await supabase.from('map_token').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as MapToken
}

export async function deleteToken(id: string): Promise<void> {
  const { error } = await supabase.from('map_token').delete().eq('id', id)
  if (error) throw error
}

// Живая подписка на токены конкретной карты — тот же паттерн, что и
// subscribeToMaps: по любому событию просим перечитать список целиком.
export function subscribeToTokens(mapId: string, onChange: () => void, onResync?: () => void): () => void {
  let connectedOnce = false
  const channel = supabase
    .channel(`map_token:${mapId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'map_token', filter: `map_id=eq.${mapId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

// ---------------------------------------------------------------------
// Личные булавки на карте: заметки «для себя» (см. map_pin в schema.sql).
// Приватность целиком на стороне RLS (policy pin_own: owner_id = auth.uid()) —
// listPins ничего не фильтрует сам, база и так не отдаст чужие метки.
// Realtime не нужен: метки личные, синхронизировать не с кем.
// ---------------------------------------------------------------------

export async function listPins(mapId: string): Promise<MapPin[]> {
  const { data, error } = await supabase
    .from('map_pin')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as MapPin[]
}

// x/y — точка клика, которой создаётся метка (перевод latlng → нормированные
// координаты делает вызывающий код в MapViewer).
export async function addPin(mapId: string, x: number, y: number, label: string): Promise<MapPin> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('map_pin')
    .insert({ map_id: mapId, owner_id: userId, x, y, label })
    .select()
    .single()
  if (error) throw error
  return data as MapPin
}

// patch — частичное обновление (обычно {x, y} после drag, либо {label, body,
// color} из попапа редактирования).
export async function updatePin(
  id: string,
  patch: Partial<Pick<MapPin, 'label' | 'body' | 'color' | 'x' | 'y'>>,
): Promise<MapPin> {
  const { data, error } = await supabase.from('map_pin').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as MapPin
}

// .select() здесь не для данных, а для проверки: если строку отфильтровала RLS,
// Postgres удалит 0 строк и вернёт УСПЕХ с пустым массивом — молча, без ошибки.
// Без этой проверки «удаление» выглядело бы сработавшим, а метка оставалась бы.
export async function deletePin(id: string): Promise<void> {
  const { data, error } = await supabase.from('map_pin').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Метка не удалена: нет прав или её уже нет')
}

// Текущая карта, которую ГМ показал последней (campaign_state.current_map_id,
// см. reveal_map/hide_map в schema.sql) — сигнал переключения для игрока,
// когда открыто сразу несколько карт (см. PlayerMap). Строка может ещё не
// существовать (ГМ ни разу не открывал карту) — тогда data будет null.
export async function getCampaignState(campaignId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('campaign_state')
    .select('current_map_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  return data?.current_map_id ?? null
}

// Подписка на campaign_state — единственный канал, по которому ИГРОК надёжно
// узнаёт о скрытии карты. Прямое событие по game_map ему не доставляется:
// после is_revealed=false строка перестаёт проходить его RLS-чтение, и push
// молча выпадает. Строка campaign_state читаема участникам всегда.
export function subscribeToCampaignState(
  campaignId: string,
  onChange: () => void,
  onResync?: () => void,
): () => void {
  let connectedOnce = false
  const channel = supabase
    .channel(`campaign_state:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'campaign_state', filter: `campaign_id=eq.${campaignId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}
