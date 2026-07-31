import type { SheetTabProps } from './types'
import QuantityListTab from './QuantityListTab'

export default function TabConsumables({ sheet }: SheetTabProps) {
  return (
    <QuantityListTab
      characterId={sheet.id}
      table="consumable"
      title="📦 Расходники"
      namePlaceholder="Стрелы, свитки…"
      descPlaceholder="Описание, эффект, особенности…"
      emptyText="Расходников пока нет."
    />
  )
}
