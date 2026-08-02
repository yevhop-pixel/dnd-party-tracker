// Слой доступа к данным. Тонкая обёртка над supabase-js: без бизнес-логики,
// только запросы, которые соответствуют политикам RLS из supabase/schema.sql.
// Ошибки Supabase не глушатся — пробрасываются наружу, страницы сами решают,
// что показать пользователю.

import { supabase } from './supabase'
import type {
  Campaign,
  CharacterSheet,
  Consumable,
  EquippedItem,
  Feature,
  InventoryItem,
  Npc,
  Potion,
  Quest,
  Role,
} from './types'

// Сессия уже лежит в памяти supabase-js (её поддерживает onAuthStateChange),
// поэтому getSession() не ходит в сеть — в отличие от getUser().
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('Не авторизован')
  return data.session.user.id
}

// =====================================================================
//  Кампании
// =====================================================================

export interface MyCampaign {
  campaign: Campaign
  role: Role
}

// Кампании, где текущий пользователь состоит участником, вместе с ролью.
export async function listMyCampaigns(): Promise<MyCampaign[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('campaign_member')
    .select('role, campaign(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    role: row.role as Role,
    campaign: row.campaign as unknown as Campaign,
  }))
}

export async function getCampaign(id: string): Promise<Campaign> {
  // .maybeSingle() вместо .single(): для не-участника RLS не отдаёт ни одной
  // строки — .single() в этом случае бросил бы сырое «JSON object requested,
  // multiple (or no) rows returned», непонятное пользователю.
  const { data, error } = await supabase.from('campaign').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Кампания не найдена или вы не её участник')
  return data as Campaign
}

// Создаёт кампанию и сразу вступает в неё создателем как ГМ.
// Обходит RLS через RPC create_campaign — до вступления в кампанию
// insert().select() не смог бы прочитать только что созданную строку
// (campaign_read требует членства, см. schema.sql).
export async function createCampaign(name: string): Promise<Campaign> {
  const { data, error } = await supabase.rpc('create_campaign', { campaign_name: name })
  if (error) throw error
  return data as Campaign
}

// Вступление по коду обходит RLS через RPC join_campaign_by_code —
// до вступления игрок не может увидеть кампанию через select (см. schema.sql).
export async function joinCampaign(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_campaign_by_code', { code })
  if (error) {
    if (error.message.includes('campaign_not_found')) {
      throw new Error('Кампания с таким кодом не найдена')
    }
    throw error
  }
  return data as string
}

export interface CampaignMemberInfo {
  id: string
  name: string
  role: Role
}

// Участники кампании с именами — для шапки чата, ленты бросков и т.д.
// member_read (см. schema.sql) отдаёт всех со-участников кампании.
export async function listCampaignMembers(campaignId: string): Promise<CampaignMemberInfo[]> {
  const { data, error } = await supabase
    .from('campaign_member')
    .select('user_id, role, app_user(display_name)')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.user_id as string,
    name: (row.app_user as unknown as { display_name: string } | null)?.display_name || 'Игрок',
    role: row.role as Role,
  }))
}

// =====================================================================
//  Листы персонажей
// =====================================================================

// Листы, которыми владеет текущий пользователь.
export async function listMySheets(): Promise<CharacterSheet[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('character_sheet')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CharacterSheet[]
}

// Остальные поля листа берут значения по умолчанию из схемы БД.
export async function createSheet(name: string, campaignId?: string): Promise<CharacterSheet> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('character_sheet')
    .insert({ owner_id: userId, campaign_id: campaignId ?? null, name })
    .select()
    .single()
  if (error) throw error
  return data as CharacterSheet
}

export async function getSheet(id: string): Promise<CharacterSheet> {
  const { data, error } = await supabase.from('character_sheet').select('*').eq('id', id).single()
  if (error) throw error
  return data as CharacterSheet
}

export async function updateSheet(id: string, patch: Partial<CharacterSheet>): Promise<CharacterSheet> {
  const { data, error } = await supabase
    .from('character_sheet')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CharacterSheet
}

// .select().single() здесь не ради данных — без него update, отклонённый RLS
// (0 затронутых строк), возвращает error === null, и вызывающий код не может
// отличить успех от «RLS отбросил»: с .single() на 0 строк придёт ошибка.
export async function attachSheetToCampaign(sheetId: string, campaignId: string): Promise<void> {
  const { error } = await supabase
    .from('character_sheet')
    .update({ campaign_id: campaignId })
    .eq('id', sheetId)
    .select()
    .single()
  if (error) throw error
}

export async function detachSheetFromCampaign(sheetId: string): Promise<void> {
  const { error } = await supabase
    .from('character_sheet')
    .update({ campaign_id: null })
    .eq('id', sheetId)
    .select()
    .single()
  if (error) throw error
}

// Листы кампании: sheet_read (см. schema.sql) сама решает, что вернуть —
// игроку только его собственный лист, ГМу все листы кампании. Код для
// обеих ролей одинаковый, разница целиком на стороне RLS.
export async function listCampaignSheets(campaignId: string): Promise<CharacterSheet[]> {
  const { data, error } = await supabase
    .from('character_sheet')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as CharacterSheet[]
}

// Аватарки партии: игроку sheet_read чужие листы не отдаёт, поэтому имя и
// картинку соседа по столу берём через RPC party_avatars — она возвращает
// ровно три поля и проверяет членство внутри себя (см. schema.sql).
export interface PartyAvatar {
  owner_id: string
  char_name: string
  avatar_path: string | null
}

export async function listPartyAvatars(campaignId: string): Promise<PartyAvatar[]> {
  const { data, error } = await supabase.rpc('party_avatars', { p_campaign: campaignId })
  if (error) throw error
  return (data ?? []) as PartyAvatar[]
}

// =====================================================================
//  Содержимое листа — универсальный CRUD для дочерних таблиц
// =====================================================================

// Экспортируем как единый union типов записей, чтобы вызывающий код
// мог параметризовать listChildren/insertChild и т.д. дженериком.
export type ChildRow = Feature | InventoryItem | EquippedItem | Npc | Quest | Potion | Consumable
export type ChildTable =
  | 'feature'
  | 'inventory_item'
  | 'equipped_item'
  | 'npc'
  | 'quest'
  | 'potion'
  | 'consumable'

// Таблицы, где есть sort_order (npc и quest сортировки не имеют).
const TABLES_WITH_SORT_ORDER: ReadonlySet<ChildTable> = new Set([
  'feature',
  'inventory_item',
  'equipped_item',
  'potion',
  'consumable',
])

export async function listChildren<T extends ChildRow>(table: ChildTable, characterId: string): Promise<T[]> {
  let query = supabase.from(table).select('*').eq('character_id', characterId)
  // Второй .order('id') — тай-брейкер: без него строки с одинаковым
  // sort_order/created_at (например, только что импортированные) не имеют
  // детерминированного порядка и «прыгают» между перерисовками.
  if (TABLES_WITH_SORT_ORDER.has(table)) {
    query = query.order('sort_order', { ascending: true }).order('id', { ascending: true })
  } else {
    query = query.order('created_at', { ascending: true }).order('id', { ascending: true })
  }
  const { data, error } = await query
  if (error) throw error
  return data as T[]
}

export async function insertChild<T extends ChildRow>(
  table: ChildTable,
  row: Partial<T> & { character_id: string },
): Promise<T> {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw error
  return data as T
}

export async function updateChild<T extends ChildRow>(
  table: ChildTable,
  id: string,
  patch: Partial<T>,
): Promise<T> {
  const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).select().single()
  if (error) throw error
  return data as T
}

export async function deleteChild(table: ChildTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}
