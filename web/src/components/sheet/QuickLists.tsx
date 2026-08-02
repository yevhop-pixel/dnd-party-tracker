// Быстрый доступ к спискам листа прямо с экрана кампании: не редактор, а
// «карман» — открыл категорию, увидел, что есть, юзанул зелье (−1) и закрыл.
// Полноценная правка (добавить, удалить, переименовать, порядок) осталась в
// редакторе листа, сюда её тащить не надо — за столом нужна скорость.
import { useEffect, useRef, useState } from 'react'
import { listChildren, updateChild, type ChildRow, type ChildTable } from '../../lib/api'
import type { CharacterSheet, Consumable, InventoryItem, Potion } from '../../lib/types'
import { useDebouncedPatches } from './useDebouncedPatches'
import { getUiState, setUiState } from '../../lib/uiState'
import './quick-lists.css'

interface QuickCategory {
  table: ChildTable
  label: string
  // Поле с названием строки: у черт это title, у остальных name.
  titleOf: (row: ChildRow) => string
  // Что показать в раскрытой строке (описание/заметки). Пусто — нечего.
  detailOf: (row: ChildRow) => string
  // Есть ли счётчик, который можно быстро крутить ±1 прямо отсюда.
  countable: boolean
}

const CATEGORIES: QuickCategory[] = [
  {
    table: 'inventory_item',
    label: 'Инвентарь',
    titleOf: (r) => (r as InventoryItem).name,
    detailOf: (r) => (r as InventoryItem).notes,
    countable: true,
  },
  {
    table: 'potion',
    label: 'Зелья',
    titleOf: (r) => (r as Potion).name,
    detailOf: (r) => (r as Potion).description,
    countable: true,
  },
  {
    table: 'consumable',
    label: 'Расходники',
    titleOf: (r) => (r as Consumable).name,
    detailOf: (r) => (r as Consumable).description,
    countable: true,
  },
  {
    table: 'equipped_item',
    label: 'Эквип',
    titleOf: (r) => `${(r as { slot: string }).slot}: ${(r as { name: string }).name}`,
    detailOf: (r) => (r as { notes: string }).notes,
    countable: false,
  },
  {
    table: 'feature',
    label: 'Черты',
    titleOf: (r) => (r as { title: string }).title,
    detailOf: (r) => (r as { description: string }).description,
    countable: false,
  },
  {
    table: 'quest',
    label: 'Квесты',
    titleOf: (r) => (r as { name: string }).name,
    detailOf: (r) => (r as { description: string }).description,
    countable: false,
  },
  {
    table: 'npc',
    label: 'NPC',
    titleOf: (r) => (r as { name: string }).name,
    detailOf: (r) => (r as { notes: string }).notes,
    countable: false,
  },
]

function quantityOf(row: ChildRow): number {
  return (row as { quantity?: number }).quantity ?? 0
}

export default function QuickLists({ sheet }: { sheet: CharacterSheet }) {
  const [openTable, setOpenTable] = useState<ChildTable | null>(
    () => (getUiState<ChildTable>('quick-list') as ChildTable | null) ?? null,
  )
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  // Гонка запросов: пока грузится «Зелья», человек уже ткнул «Инвентарь» —
  // ответ первого запроса не должен затереть список второго.
  const requestId = useRef(0)

  const category = CATEGORIES.find((c) => c.table === openTable) ?? null

  // Таблица нужна отложенному сохранению в момент отправки, а не в момент
  // клика — держим её в ref, иначе патч уйдёт не в ту таблицу, если человек
  // успел переключить категорию внутри окна дебаунса.
  const openTableRef = useRef<ChildTable | null>(openTable)
  openTableRef.current = openTable

  const { schedule } = useDebouncedPatches<ChildRow>(
    (id, patch) => updateChild(openTableRef.current ?? 'inventory_item', id, patch),
    (message) => setError(message),
  )

  useEffect(() => {
    if (!openTable) {
      setRows(null)
      return
    }
    const my = ++requestId.current
    setError('')
    setRows(null)
    listChildren(openTable, sheet.id)
      .then((data) => {
        if (my === requestId.current) setRows(data)
      })
      .catch((err) => {
        if (my === requestId.current) setError(err instanceof Error ? err.message : 'Не удалось загрузить список')
      })
  }, [openTable, sheet.id])

  function toggleCategory(table: ChildTable) {
    const next = openTable === table ? null : table
    setOpenTable(next)
    setExpanded(null)
    setUiState('quick-list', next)
  }

  function step(row: ChildRow, delta: number) {
    const next = Math.max(0, quantityOf(row) + delta)
    setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, quantity: next } : r)) : prev))
    schedule(row.id, { quantity: next } as Partial<ChildRow>)
  }

  return (
    <div className="quick-lists">
      <div className="quick-lists-chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.table}
            type="button"
            className={`quick-chip${openTable === c.table ? ' quick-chip-active' : ''}`}
            onClick={() => toggleCategory(c.table)}
          >
            {c.label}
            <span className="quick-chip-caret">{openTable === c.table ? '▴' : '▾'}</span>
          </button>
        ))}
      </div>

      {category && (
        // key — чтобы анимация раскрытия проигрывалась заново при смене
        // категории, а не только при первом открытии.
        <div className="quick-panel" key={category.table}>
          {error && <p className="quick-error">{error}</p>}
          {rows === null && !error && <p className="quick-empty">Загрузка…</p>}
          {rows !== null && rows.length === 0 && <p className="quick-empty">Пусто.</p>}
          {rows?.map((row) => {
            const detail = category.detailOf(row).trim()
            const isOpen = expanded === row.id
            const count = quantityOf(row)
            return (
              <div key={row.id} className={`quick-row${count === 0 && category.countable ? ' quick-row-empty' : ''}`}>
                <button
                  type="button"
                  className="quick-row-name"
                  disabled={!detail}
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  title={detail ? 'Показать описание' : undefined}
                >
                  {detail && <span className="quick-row-caret">{isOpen ? '▴' : '▾'}</span>}
                  {category.titleOf(row) || '(без имени)'}
                </button>
                {category.countable && (
                  <div className="quick-row-count">
                    <button type="button" className="quick-step" onClick={() => step(row, -1)} disabled={count === 0}>
                      −
                    </button>
                    <span className="quick-count-value">{count}</span>
                    <button type="button" className="quick-step" onClick={() => step(row, 1)}>
                      +
                    </button>
                  </div>
                )}
                {isOpen && detail && <p className="quick-row-detail">{detail}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
