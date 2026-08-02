// Единый реестр вкладок листа персонажа. Раньше жил внутри SheetEditor, но
// те же самые списки теперь вызываются прямо с экрана кампании (выпадашка
// «Список» у игрока) — держать два одинаковых массива в двух файлах значит
// рано или поздно забыть добавить вкладку в один из них.
import type { ReactElement } from 'react'
import TabStats from './TabStats'
import TabFeatures from './TabFeatures'
import TabInventory from './TabInventory'
import TabEquipped from './TabEquipped'
import TabNpcs from './TabNpcs'
import TabQuests from './TabQuests'
import TabPotions from './TabPotions'
import TabConsumables from './TabConsumables'
import TabNotes from './TabNotes'
import type { SheetTabProps } from './types'

export type SheetTabKey =
  | 'stats'
  | 'features'
  | 'inventory'
  | 'equipped'
  | 'npcs'
  | 'quests'
  | 'potions'
  | 'consumables'
  | 'notes'

export interface SheetTabDef {
  key: SheetTabKey
  label: string
  Component: (props: SheetTabProps) => ReactElement
}

export const SHEET_TABS: SheetTabDef[] = [
  { key: 'stats', label: 'Статы', Component: TabStats },
  { key: 'features', label: 'Черты', Component: TabFeatures },
  { key: 'inventory', label: 'Инвентарь', Component: TabInventory },
  { key: 'equipped', label: 'Эквип', Component: TabEquipped },
  { key: 'npcs', label: 'NPC', Component: TabNpcs },
  { key: 'quests', label: 'Квесты', Component: TabQuests },
  { key: 'potions', label: 'Зелья', Component: TabPotions },
  { key: 'consumables', label: 'Расходники', Component: TabConsumables },
  { key: 'notes', label: 'Заметки', Component: TabNotes },
]

export function isSheetTabKey(value: unknown): value is SheetTabKey {
  return typeof value === 'string' && SHEET_TABS.some((t) => t.key === value)
}
