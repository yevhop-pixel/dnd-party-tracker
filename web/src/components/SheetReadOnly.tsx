import { useEffect, useState } from 'react'
import { getSheet, listChildren } from '../lib/api'
import type {
  CharacterSheet,
  Consumable,
  EquippedItem,
  Feature,
  InventoryItem,
  Npc,
  Potion,
  Quest,
} from '../lib/types'
import Avatar from './Avatar'
import './sheet-read-only.css'
import '../components/sheet/tabs-npc.css'
import '../components/sheet/tabs-inv.css'

interface SheetReadOnlyProps {
  sheetId: string
}

// Тот же фиксированный порядок слотов, что и в TabEquipped — только для
// группировки, без формы «Надеть» (лист открыт на чтение).
const SLOTS = [
  'Оружие 1',
  'Оружие 2',
  'Доспех',
  'Щит',
  'Кольцо 1',
  'Кольцо 2',
  'Амулет',
  'Шлем',
  'Плащ',
  'Перчатки',
  'Сапоги',
]

function abilityModifier(value: number): string {
  const mod = Math.floor((value - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function relationshipClass(relationship: string): string {
  if (relationship === 'Дружел.') return 'rel-badge rel-friendly'
  if (relationship === 'Враждеб.') return 'rel-badge rel-hostile'
  return 'rel-badge rel-neutral'
}

function statusClass(status: string): string {
  if (status === 'Завершённый') return 'status-btn status-success status-btn-selected'
  if (status === 'Проваленный') return 'status-btn status-failed status-btn-selected'
  return 'status-btn status-active status-btn-selected'
}

interface ChildData {
  features: Feature[]
  inventory: InventoryItem[]
  equipped: EquippedItem[]
  npcs: Npc[]
  quests: Quest[]
  potions: Potion[]
  consumables: Consumable[]
}

// Стат-плитка без кнопок правки — просто подписанное значение.
function StatTile({ label, value, modifier }: { label: string; value: number | string; modifier?: string }) {
  return (
    <div className="stat-field">
      <span className="stat-field-label">{label}</span>
      {modifier && <span className="stat-field-mod">{modifier}</span>}
      <span className="ro-stat-value">{value}</span>
    </div>
  )
}

// Лист персонажа в режиме чтения для ГМа: та же информация, что в
// SheetEditor, но без единого элемента правки. Отдельный компонент —
// вкладки редактора рассчитаны на владельца листа и завязаны на автосейв.
export default function SheetReadOnly({ sheetId }: SheetReadOnlyProps) {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [children, setChildren] = useState<ChildData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSheet(null)
    setChildren(null)
    setError('')

    async function load() {
      try {
        const [sheetData, features, inventory, equipped, npcs, quests, potions, consumables] = await Promise.all([
          getSheet(sheetId),
          listChildren<Feature>('feature', sheetId),
          listChildren<InventoryItem>('inventory_item', sheetId),
          listChildren<EquippedItem>('equipped_item', sheetId),
          listChildren<Npc>('npc', sheetId),
          listChildren<Quest>('quest', sheetId),
          listChildren<Potion>('potion', sheetId),
          listChildren<Consumable>('consumable', sheetId),
        ])
        if (cancelled) return
        setSheet(sheetData)
        setChildren({ features, inventory, equipped, npcs, quests, potions, consumables })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить лист')
      }
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [sheetId])

  if (error) return <p className="auth-error">{error}</p>
  if (!sheet || !children) return <p>Загрузка…</p>

  const totalWeight = children.inventory.reduce((sum, it) => sum + it.quantity * it.weight, 0)
  const totalValue = children.inventory.reduce((sum, it) => sum + it.quantity * it.value, 0)

  const equippedBySlot = new Map<string, EquippedItem[]>()
  for (const item of children.equipped) {
    const list = equippedBySlot.get(item.slot) ?? []
    list.push(item)
    equippedBySlot.set(item.slot, list)
  }
  const extraSlots = Array.from(equippedBySlot.keys()).filter((slot) => !SLOTS.includes(slot))

  return (
    <div className="sheet-read-only">
      <details className="sheet-section" open>
        <summary>Профиль и статы</summary>
        <div className="ro-profile">
          <div className="card-avatar-row">
            <Avatar path={sheet.avatar_path} name={sheet.char_name || sheet.name} size={64} />
            <div>
              <h3>{sheet.char_name || sheet.name}</h3>
              <p>
                {sheet.char_class || 'без класса'} · {sheet.char_race || 'без расы'} · уровень {sheet.char_level} ·{' '}
                {sheet.char_alignment || 'без мировоззрения'}
              </p>
            </div>
          </div>
        </div>
        <div className="stat-grid stat-grid-3">
          <StatTile label="КД" value={sheet.armor_class} />
          <StatTile label="Скорость" value={sheet.speed} />
          <StatTile label="Инициатива" value={sheet.initiative} />
        </div>
        <div className="ro-hp">
          ХП: {sheet.hp_current}/{sheet.hp_max}
        </div>
        <div className="stat-grid stat-grid-3">
          <StatTile label="СИЛ" value={sheet.strength} modifier={abilityModifier(sheet.strength)} />
          <StatTile label="ЛОВ" value={sheet.dexterity} modifier={abilityModifier(sheet.dexterity)} />
          <StatTile label="ТЕЛ" value={sheet.constitution} modifier={abilityModifier(sheet.constitution)} />
          <StatTile label="ИНТ" value={sheet.intelligence} modifier={abilityModifier(sheet.intelligence)} />
          <StatTile label="МУД" value={sheet.wisdom} modifier={abilityModifier(sheet.wisdom)} />
          <StatTile label="ХАР" value={sheet.charisma} modifier={abilityModifier(sheet.charisma)} />
        </div>
      </details>

      <details className="sheet-section" open>
        <summary>Золото</summary>
        <div className="stat-grid stat-grid-3">
          <StatTile label="Кошелёк" value={sheet.wallet_gold} />
          <StatTile label="Банк" value={sheet.bank_gold} />
          <StatTile label="Долг" value={sheet.debt_gold} />
        </div>
        {sheet.other_currency_note && <p className="card-sub-text">{sheet.other_currency_note}</p>}
      </details>

      <details className="sheet-section">
        <summary>Черты ({children.features.length})</summary>
        {children.features.length === 0 && <p className="card-sub-text">Черт нет.</p>}
        <ul className="card-list">
          {children.features.map((ft) => (
            <li key={ft.id} className="card item-card">
              <strong className="item-card-title">{ft.title}</strong>
              {ft.description && <p className="item-card-notes">{ft.description}</p>}
            </li>
          ))}
        </ul>
      </details>

      <details className="sheet-section">
        <summary>Инвентарь ({children.inventory.length})</summary>
        {children.inventory.length === 0 && <p className="card-sub-text">Инвентарь пуст.</p>}
        <ul className="card-list">
          {children.inventory.map((item) => (
            <li key={item.id} className="card item-card">
              <div className="item-card-header">
                <strong className="item-card-title">{item.name}</strong>
                <span className="card-sub-text">×{item.quantity}</span>
              </div>
              <div className="item-card-meta">
                <span>Вес: {item.weight} кг</span>
                <span>Ценность: {item.value} зм</span>
              </div>
              {item.notes && <p className="item-card-notes">{item.notes}</p>}
            </li>
          ))}
        </ul>
        {children.inventory.length > 0 && (
          <p className="tab-list-footer">
            Всего вес: {totalWeight.toFixed(1)} кг · Стоимость: {totalValue} зм
          </p>
        )}
      </details>

      <details className="sheet-section">
        <summary>Эквип по слотам</summary>
        <ul className="card-list">
          {SLOTS.filter((slot) => (equippedBySlot.get(slot) ?? []).length > 0).map((slot) => (
            <li key={slot} className="card equip-slot-card">
              <span className="badge equip-slot-label">{slot}</span>
              {(equippedBySlot.get(slot) ?? []).map((eq) => (
                <div key={eq.id} className="equip-item">
                  <strong>{eq.name}</strong>
                  {eq.notes && <p className="item-card-notes">{eq.notes}</p>}
                </div>
              ))}
            </li>
          ))}
          {extraSlots.map((slot) => (
            <li key={slot} className="card equip-slot-card">
              <span className="badge equip-slot-label">{slot}</span>
              {(equippedBySlot.get(slot) ?? []).map((eq) => (
                <div key={eq.id} className="equip-item">
                  <strong>{eq.name}</strong>
                  {eq.notes && <p className="item-card-notes">{eq.notes}</p>}
                </div>
              ))}
            </li>
          ))}
        </ul>
        {children.equipped.length === 0 && <p className="card-sub-text">Ничего не надето.</p>}
      </details>

      <details className="sheet-section">
        <summary>NPC ({children.npcs.length})</summary>
        {children.npcs.length === 0 && <p className="card-sub-text">Персонажей нет.</p>}
        <ul className="card-list">
          {children.npcs.map((npc) => (
            <li key={npc.id} className="card item-card">
              <div className="item-card-header">
                <strong className="item-card-title">{npc.name || 'Без имени'}</strong>
                <span className={relationshipClass(npc.relationship)}>{npc.relationship}</span>
              </div>
              {(npc.role || npc.faction || npc.location) && (
                <div className="item-card-meta">
                  {npc.role && <span>{npc.role}</span>}
                  {npc.faction && <span>{npc.faction}</span>}
                  {npc.location && <span>{npc.location}</span>}
                </div>
              )}
              {npc.tags && <div className="item-card-tags">{npc.tags}</div>}
              {npc.notes && <p className="item-card-notes">{npc.notes}</p>}
            </li>
          ))}
        </ul>
      </details>

      <details className="sheet-section">
        <summary>Квесты ({children.quests.length})</summary>
        {children.quests.length === 0 && <p className="card-sub-text">Квестов нет.</p>}
        <ul className="card-list">
          {children.quests.map((quest) => (
            <li key={quest.id} className="card item-card">
              <div className="item-card-header">
                <strong className="item-card-title">{quest.name || 'Без названия'}</strong>
                <span className="type-badge">{quest.type || '—'}</span>
              </div>
              {quest.description && <p className="item-card-notes">{quest.description}</p>}
              <span className={statusClass(quest.status)}>{quest.status}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="sheet-section">
        <summary>Зелья ({children.potions.reduce((sum, p) => sum + p.quantity, 0)} шт)</summary>
        {children.potions.length === 0 && <p className="card-sub-text">Зелий нет.</p>}
        <ul className="card-list">
          {children.potions.map((p) => (
            <li key={p.id} className="card item-card">
              <div className="item-card-header">
                <strong className="item-card-title">{p.name}</strong>
                <span className="card-sub-text">×{p.quantity}</span>
              </div>
              {p.description && <p className="item-card-notes">{p.description}</p>}
            </li>
          ))}
        </ul>
      </details>

      <details className="sheet-section">
        <summary>Расходники ({children.consumables.reduce((sum, c) => sum + c.quantity, 0)} шт)</summary>
        {children.consumables.length === 0 && <p className="card-sub-text">Расходников нет.</p>}
        <ul className="card-list">
          {children.consumables.map((c) => (
            <li key={c.id} className="card item-card">
              <div className="item-card-header">
                <strong className="item-card-title">{c.name}</strong>
                <span className="card-sub-text">×{c.quantity}</span>
              </div>
              {c.description && <p className="item-card-notes">{c.description}</p>}
            </li>
          ))}
        </ul>
      </details>

      <details className="sheet-section">
        <summary>Заметки</summary>
        {sheet.campaign_notes ? (
          <p className="ro-notes">{sheet.campaign_notes}</p>
        ) : (
          <p className="card-sub-text">Заметок нет.</p>
        )}
      </details>
    </div>
  )
}
