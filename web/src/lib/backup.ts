// Экспорт/импорт листа персонажа в единый JSON-файл — резервная копия,
// которую можно передать между аккаунтами или перенести с Android-версии.
// Импорт всегда создаёт НОВЫЙ лист, существующие данные не перезаписывает.

import { createSheet, getSheet, insertChild, listChildren, updateSheet, type ChildTable } from './api'
import { supabase } from './supabase'
import type { CharacterSheet, Consumable, EquippedItem, Feature, InventoryItem, Npc, Potion, Quest } from './types'

const FORMAT = 'dnd-tracker-web'
const FORMAT_VERSION = 1

// Вырезает перечисленные ключи из объекта, не трогая исходный.
function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const dropped = new Set<string>(keys.map((key) => String(key)))
  const entries = Object.entries(obj).filter(([key]) => !dropped.has(key))
  return Object.fromEntries(entries) as Omit<T, K>
}

interface SheetBackup {
  format: typeof FORMAT
  version: number
  exported_at: string
  sheet: Omit<CharacterSheet, 'id' | 'owner_id' | 'campaign_id' | 'created_at' | 'updated_at'>
  features: Omit<Feature, 'id' | 'character_id'>[]
  inventory: Omit<InventoryItem, 'id' | 'character_id'>[]
  equipped: Omit<EquippedItem, 'id' | 'character_id'>[]
  npcs: Omit<Npc, 'id' | 'character_id' | 'created_at'>[]
  quests: Omit<Quest, 'id' | 'character_id' | 'created_at'>[]
  potions: Omit<Potion, 'id' | 'character_id'>[]
  consumables: Omit<Consumable, 'id' | 'character_id'>[]
}

async function buildBackup(sheetId: string): Promise<SheetBackup> {
  const sheet = await getSheet(sheetId)
  const [features, inventory, equipped, npcs, quests, potions, consumables] = await Promise.all([
    listChildren<Feature>('feature', sheetId),
    listChildren<InventoryItem>('inventory_item', sheetId),
    listChildren<EquippedItem>('equipped_item', sheetId),
    listChildren<Npc>('npc', sheetId),
    listChildren<Quest>('quest', sheetId),
    listChildren<Potion>('potion', sheetId),
    listChildren<Consumable>('consumable', sheetId),
  ])

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    sheet: omit(sheet, ['id', 'owner_id', 'campaign_id', 'created_at', 'updated_at']),
    features: features.map((row) => omit(row, ['id', 'character_id'])),
    inventory: inventory.map((row) => omit(row, ['id', 'character_id'])),
    equipped: equipped.map((row) => omit(row, ['id', 'character_id'])),
    npcs: npcs.map((row) => omit(row, ['id', 'character_id', 'created_at'])),
    quests: quests.map((row) => omit(row, ['id', 'character_id', 'created_at'])),
    potions: potions.map((row) => omit(row, ['id', 'character_id'])),
    consumables: consumables.map((row) => omit(row, ['id', 'character_id'])),
  }
}

export async function exportSheetToJson(sheetId: string): Promise<string> {
  const backup = await buildBackup(sheetId)
  return JSON.stringify(backup, null, 2)
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'Персонаж'
}

function defaultFileName(sheet: SheetBackup['sheet']): string {
  const namePart = sanitizeFileNamePart(sheet.char_name || sheet.name)
  const datePart = new Date().toISOString().slice(0, 10)
  return `${namePart}-${datePart}.json`
}

// Экспорт + скачивание файла резервной копии через Blob/object URL.
export async function downloadSheetBackup(sheetId: string, fileName?: string): Promise<void> {
  const backup = await buildBackup(sheetId)
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName ?? defaultFileName(backup.sheet)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Некоторые браузеры (Safari) читают Blob лениво уже после click() —
  // отзыв URL сразу иногда обрывает скачивание. Даём секунду форы.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// =====================================================================
//  Импорт
// =====================================================================

// Белый список полей для импорта: пропускаем только известные колонки схемы
// и приводим их к ожидаемому типу. Всё остальное (лишние ключи из чужого
// или повреждённого файла) молча отбрасывается — импорт не должен позволять
// протащить в БД что-то помимо содержимого листа.
type FieldKind = 'text' | 'int' | 'number'

function pickFields<T extends object>(source: Record<string, unknown>, spec: Record<string, FieldKind>): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, kind] of Object.entries(spec)) {
    if (!(key in source)) continue
    const value = source[key]
    if (kind === 'text') {
      if (typeof value === 'string') result[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = kind === 'int' ? Math.round(value) : value
    }
  }
  return result as Partial<T>
}

const SHEET_FIELDS: Record<string, FieldKind> = {
  name: 'text',
  char_name: 'text',
  char_class: 'text',
  char_race: 'text',
  char_level: 'int',
  char_alignment: 'text',
  wallet_gold: 'int',
  bank_gold: 'int',
  debt_gold: 'int',
  other_currency_note: 'text',
  armor_class: 'int',
  speed: 'int',
  initiative: 'int',
  hp_current: 'int',
  hp_max: 'int',
  strength: 'int',
  dexterity: 'int',
  constitution: 'int',
  intelligence: 'int',
  wisdom: 'int',
  charisma: 'int',
  campaign_notes: 'text',
}

const FEATURE_FIELDS: Record<string, FieldKind> = { title: 'text', description: 'text', sort_order: 'int' }
const INVENTORY_FIELDS: Record<string, FieldKind> = {
  name: 'text',
  quantity: 'int',
  weight: 'number',
  value: 'int',
  notes: 'text',
  sort_order: 'int',
}
const EQUIPPED_FIELDS: Record<string, FieldKind> = { slot: 'text', name: 'text', notes: 'text', sort_order: 'int' }
const NPC_FIELDS: Record<string, FieldKind> = {
  name: 'text',
  role: 'text',
  faction: 'text',
  location: 'text',
  relationship: 'text',
  tags: 'text',
  notes: 'text',
}
const QUEST_FIELDS: Record<string, FieldKind> = { name: 'text', type: 'text', description: 'text', status: 'text' }
const POTION_FIELDS: Record<string, FieldKind> = { name: 'text', quantity: 'int', description: 'text', sort_order: 'int' }
const CONSUMABLE_FIELDS: Record<string, FieldKind> = POTION_FIELDS

// Дочерние таблицы своего формата экспортируются под теми же ключами,
// что и в SheetBackup, — маппинг на имя таблицы БД + белый список полей.
const OWN_CHILD_ARRAYS: { key: keyof SheetBackup; table: ChildTable; fields: Record<string, FieldKind> }[] = [
  { key: 'features', table: 'feature', fields: FEATURE_FIELDS },
  { key: 'inventory', table: 'inventory_item', fields: INVENTORY_FIELDS },
  { key: 'equipped', table: 'equipped_item', fields: EQUIPPED_FIELDS },
  { key: 'npcs', table: 'npc', fields: NPC_FIELDS },
  { key: 'quests', table: 'quest', fields: QUEST_FIELDS },
  { key: 'potions', table: 'potion', fields: POTION_FIELDS },
  { key: 'consumables', table: 'consumable', fields: CONSUMABLE_FIELDS },
]

// Если что-то из содержимого листа не удалось вставить — откатываем
// созданный лист целиком (каскад унесёт уже вставленных детей), а не
// оставляем в базе наполовину заполненного персонажа.
async function rollbackSheet(sheetId: string, cause: unknown): Promise<never> {
  await supabase.from('character_sheet').delete().eq('id', sheetId)
  const message = cause instanceof Error ? cause.message : String(cause)
  throw new Error(`Импорт отменён: ${message}`)
}

function rowIn(row: unknown): Record<string, unknown> {
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
}

async function importOwnFormat(parsed: { sheet?: Partial<CharacterSheet> } & Record<string, unknown>): Promise<string> {
  const sheetData = (parsed.sheet ?? {}) as Record<string, unknown>
  const created = await createSheet(str(sheetData.name, 'Импортированный персонаж'))

  try {
    await updateSheet(created.id, pickFields<CharacterSheet>(sheetData, SHEET_FIELDS))

    for (const { key, table, fields } of OWN_CHILD_ARRAYS) {
      const rows = parsed[key]
      if (!Array.isArray(rows)) continue
      await Promise.all(
        rows.map((row) =>
          insertChild(table, { ...pickFields<Record<string, unknown>>(rowIn(row), fields), character_id: created.id }),
        ),
      )
    }
  } catch (err) {
    return rollbackSheet(created.id, err)
  }

  return created.id
}

// --- Android-формат (см. DndViewModel.kt: exportProfileToJson/importProfileFromJson) ---
// {
//   "profile": { charName, charClass, charRace, charLevel, charAlignment, campaignName,
//                walletGold, bankGold, debtGold, otherCurrencyNote,
//                armorClass, speed, initiative, hpCurrent, hpMax,
//                strength, dexterity, constitution, intelligence, wisdom, charisma,
//                campaignNotes, dmName, campaignCode, playerNick },
//   "features": [{ title, description, sortOrder }],
//   "inventory": [{ name, quantity, weight, value, notes, sortOrder }],
//   "equipped": [{ slot, name, notes, sortOrder }],
//   "npcs": [{ name, role, faction, location, relationship, tags, notes }],
//   "quests": [{ name, type, description, status }],
//   "potions": [{ name, quantity, description, sortOrder }],
//   "consumables": [{ name, quantity, description, sortOrder }]
// }
// Поля campaignName/dmName/campaignCode/playerNick аналога в веб-схеме не имеют
// и при импорте отбрасываются.

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Как num(), но для int-колонок — Postgres не примет дробное число в int.
function int(value: unknown, fallback = 0): number {
  return Math.round(num(value, fallback))
}

function mapAndroidProfile(p: Record<string, unknown>): Partial<CharacterSheet> {
  return {
    char_name: str(p.charName),
    char_class: str(p.charClass),
    char_race: str(p.charRace),
    char_level: int(p.charLevel, 1),
    char_alignment: str(p.charAlignment),
    wallet_gold: int(p.walletGold),
    bank_gold: int(p.bankGold),
    debt_gold: int(p.debtGold),
    other_currency_note: str(p.otherCurrencyNote),
    armor_class: int(p.armorClass, 10),
    speed: int(p.speed, 30),
    initiative: int(p.initiative),
    hp_current: int(p.hpCurrent, 10),
    hp_max: int(p.hpMax, 10),
    strength: int(p.strength, 10),
    dexterity: int(p.dexterity, 10),
    constitution: int(p.constitution, 10),
    intelligence: int(p.intelligence, 10),
    wisdom: int(p.wisdom, 10),
    charisma: int(p.charisma, 10),
    campaign_notes: str(p.campaignNotes),
  }
}

async function importAndroidFormat(parsed: { profile: Record<string, unknown> } & Record<string, unknown>): Promise<string> {
  const profile = parsed.profile
  const charName = str(profile.charName, 'Импорт')
  const created = await createSheet(`${charName} (Имп.)`)

  try {
    await updateSheet(created.id, mapAndroidProfile(profile))

    const insertArray = (key: string, table: ChildTable, map: (o: Record<string, unknown>, i: number) => Record<string, unknown>) => {
      const rows = parsed[key]
      if (!Array.isArray(rows)) return Promise.resolve()
      return Promise.all(
        rows.map((row, i) => insertChild(table, { ...map(rowIn(row), i), character_id: created.id })),
      )
    }

    await insertArray('features', 'feature', (o, i) => ({
      title: str(o.title),
      description: str(o.description),
      sort_order: int(o.sortOrder, i),
    }))
    await insertArray('inventory', 'inventory_item', (o, i) => ({
      name: str(o.name),
      quantity: int(o.quantity, 1),
      weight: num(o.weight),
      value: int(o.value),
      notes: str(o.notes),
      sort_order: int(o.sortOrder, i),
    }))
    await insertArray('equipped', 'equipped_item', (o, i) => ({
      slot: str(o.slot),
      name: str(o.name),
      notes: str(o.notes),
      sort_order: int(o.sortOrder, i),
    }))
    await insertArray('npcs', 'npc', (o) => ({
      name: str(o.name),
      role: str(o.role),
      faction: str(o.faction),
      location: str(o.location),
      relationship: str(o.relationship),
      tags: str(o.tags),
      notes: str(o.notes),
    }))
    await insertArray('quests', 'quest', (o) => ({
      name: str(o.name),
      type: str(o.type),
      description: str(o.description),
      status: str(o.status),
    }))
    await insertArray('potions', 'potion', (o, i) => ({
      name: str(o.name),
      quantity: int(o.quantity, 1),
      description: str(o.description),
      sort_order: int(o.sortOrder, i),
    }))
    await insertArray('consumables', 'consumable', (o, i) => ({
      name: str(o.name),
      quantity: int(o.quantity, 1),
      description: str(o.description),
      sort_order: int(o.sortOrder, i),
    }))
  } catch (err) {
    return rollbackSheet(created.id, err)
  }

  return created.id
}

// Понимает свой формат (format === "dnd-tracker-web") и Android-экспорт
// (наличие объекта "profile"). Создаёт новый лист персонажа и возвращает его id.
export async function importSheetFromJson(jsonText: string): Promise<string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Файл повреждён или не является корректным JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Неизвестный формат файла резервной копии')
  }
  const root = parsed as Record<string, unknown>

  if (root.format === FORMAT) {
    return importOwnFormat(root as { sheet?: Partial<CharacterSheet> } & Record<string, unknown>)
  }
  if (root.profile && typeof root.profile === 'object') {
    return importAndroidFormat(root as { profile: Record<string, unknown> } & Record<string, unknown>)
  }
  throw new Error('Неизвестный формат файла резервной копии — ожидался экспорт веб-версии или Android-приложения')
}
