// Типы, соответствующие таблицам supabase/schema.sql.
// Имена полей — snake_case, как в базе.

export type Role = 'gm' | 'player'
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export interface AppUser {
  id: string
  display_name: string
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  join_code: string
  gm_id: string
  created_at: string
}

export interface CampaignMember {
  campaign_id: string
  user_id: string
  role: Role
  joined_at: string
}

export interface CharacterSheet {
  id: string
  owner_id: string
  campaign_id: string | null

  name: string
  char_name: string
  char_class: string
  char_race: string
  char_level: number
  char_alignment: string

  wallet_gold: number
  bank_gold: number
  debt_gold: number
  other_currency_note: string

  armor_class: number
  speed: number
  initiative: number
  hp_current: number
  hp_max: number

  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number

  campaign_notes: string
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export interface Feature {
  id: string
  character_id: string
  title: string
  description: string
  sort_order: number
}

export interface InventoryItem {
  id: string
  character_id: string
  name: string
  quantity: number
  weight: number
  value: number
  notes: string
  sort_order: number
}

export interface EquippedItem {
  id: string
  character_id: string
  slot: string
  name: string
  notes: string
  // Защита предмета и его износ: ГМ говорит «броня износилась», и вместо
  // 12 она даёт 12 − 1, пока не починят. Итоговое значение считается на
  // клиенте (base − wear), в базе лежат обе части — чтобы было видно, что
  // именно сломалось и на сколько.
  def_phys: number
  def_magic: number
  wear: number
  sort_order: number
}

export interface Npc {
  id: string
  character_id: string
  name: string
  role: string
  faction: string
  location: string
  relationship: string
  tags: string
  notes: string
  created_at: string
}

export interface Quest {
  id: string
  character_id: string
  name: string
  type: string
  description: string
  status: string
  created_at: string
}

export interface Potion {
  id: string
  character_id: string
  name: string
  quantity: number
  description: string
  sort_order: number
}

export interface Consumable {
  id: string
  character_id: string
  name: string
  quantity: number
  description: string
  sort_order: number
}

export interface DiceRoll {
  id: string
  campaign_id: string
  user_id: string
  character_id: string | null
  notation: string
  roll_mode: RollMode
  results_text: string
  final_result: number
  is_secret: boolean
  crit: 'success' | 'fail' | null
  contest_roll_id: string | null
  // Саспенс: бросок сделан, но результат скрыт (крутится гранник в ленте),
  // пока автор не нажмёт «Стоп» или пока не прилетит встречный ответ.
  is_pending: boolean
  // Бросок сделан под премиумом. Хранится на самом броске: текущий статус
  // игрока не должен перекрашивать историю задним числом.
  is_premium: boolean
  created_at: string
}

export interface GameMap {
  id: string
  campaign_id: string
  location_name: string
  storage_path: string
  is_revealed: boolean
  sort_order: number
  created_at: string
}

// Сохранённые кнопки бросков персонажа («Атака мечом» → 1d20+7).
export interface CharacterMacro {
  id: string
  character_id: string
  label: string
  notation: string
  sort_order: number
}

export interface Message {
  id: string
  campaign_id: string
  sender_id: string
  recipient_id: string | null
  channel: 'private' | 'announcement' | 'party'
  body: string
  attachment_path: string | null
  read_at: string | null
  created_at: string
}

// Строка трекера инициативы боя (см. src/features/initiative).
export interface InitiativeEntry {
  id: string
  campaign_id: string
  name: string
  initiative: number
  is_current: boolean
  character_id: string | null
  // Заполнены только у монстров (character_id === null): у персонажей ХП и КД
  // живут в листе и приезжают отдельно (party_status), иначе разъедутся.
  hp_current: number | null
  hp_max: number | null
  ac: number | null
  created_at: string
}

// Токен (фишка) на карте локации — см. src/features/maps. Координаты x/y
// нормированы 0..1 от размеров картинки карты.
export interface MapToken {
  id: string
  map_id: string
  campaign_id: string
  label: string
  color: string
  x: number
  y: number
  character_id: string | null
  // Токен-портал: если задан, токен ведёт на другую карту (клик — переход
  // туда). См. MapViewer/PlayerMap/MapManager в src/features/maps.
  target_map_id: string | null
  created_at: string
}

// Личная булавка на карте локации — заметка «для себя», видит и правит
// только автор (owner_id), RLS-политика pin_own в schema.sql. Координаты
// x/y нормированы 0..1, как у MapToken. См. src/features/maps/PinMarker.tsx.
export interface MapPin {
  id: string
  map_id: string
  owner_id: string
  label: string
  body: string
  color: string
  x: number
  y: number
  created_at: string
}
