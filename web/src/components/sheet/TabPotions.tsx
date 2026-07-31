import type { SheetTabProps } from './types'
import QuantityListTab from './QuantityListTab'

export default function TabPotions({ sheet }: SheetTabProps) {
  return (
    <QuantityListTab
      characterId={sheet.id}
      table="potion"
      title="🧪 Зелья"
      namePlaceholder="Зелье лечения…"
      descPlaceholder="Описание / эффект (2d4+2 HP, длительность…)"
      emptyText="Зелий пока нет."
    />
  )
}
