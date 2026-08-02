// Быстрый доступ к спискам листа прямо с экрана кампании. Панель ВСПЛЫВАЕТ
// поверх интерфейса (position: absolute), а не раздвигает его: за столом
// открыл, глянул, скрутил счётчик, закрыл — и лента бросков под ней осталась
// на месте. Правка тут полноценная: добавить, переименовать, поменять
// описание, удалить.
import { useEffect, useRef, useState } from 'react'
import { deleteChild, insertChild, listChildren, updateChild, type ChildRow, type ChildTable } from '../../lib/api'
import type { CharacterSheet } from '../../lib/types'
import { useDebouncedPatches } from './useDebouncedPatches'
import { getUiState, setUiState } from '../../lib/uiState'
import AutoTextarea from '../AutoTextarea'
import './quick-lists.css'

interface QuickCategory {
  table: ChildTable
  label: string
  // Поле с названием: у черт это title, у остальных name.
  titleField: string
  // Поле с описанием/заметкой.
  detailField: string
  // У экипировки название состоит из слота и предмета — слот правим отдельно.
  hasSlot?: boolean
  // Есть ли счётчик, который можно быстро крутить ±1 прямо отсюда.
  countable: boolean
  // Есть ли sort_order (npc и quest сортируются по created_at, см. api.ts).
  sorted: boolean
  // Поля, без которых запись не встанет в общий ряд с созданными в редакторе
  // листа (фильтры вкладки «Квесты» смотрят на status и type).
  defaults?: Record<string, string>
}

const CATEGORIES: QuickCategory[] = [
  { table: 'inventory_item', label: 'Инвентарь', titleField: 'name', detailField: 'notes', countable: true, sorted: true },
  { table: 'potion', label: 'Зелья', titleField: 'name', detailField: 'description', countable: true, sorted: true },
  { table: 'consumable', label: 'Расходники', titleField: 'name', detailField: 'description', countable: true, sorted: true },
  {
    table: 'equipped_item',
    label: 'Эквип',
    titleField: 'name',
    detailField: 'notes',
    hasSlot: true,
    countable: false,
    sorted: true,
  },
  { table: 'feature', label: 'Черты', titleField: 'title', detailField: 'description', countable: false, sorted: true },
  {
    table: 'quest',
    label: 'Квесты',
    titleField: 'name',
    detailField: 'description',
    countable: false,
    sorted: false,
    defaults: { status: 'Активный', type: 'Сюжет' },
  },
  {
    table: 'npc',
    label: 'NPC',
    titleField: 'name',
    detailField: 'notes',
    countable: false,
    sorted: false,
    defaults: { relationship: 'Нейтр.' },
  },
]

// Поля у разных таблиц разные, а строка может на кадр пережить смену
// категории — читаем через страховку, чтобы отсутствующее поле не роняло
// экран (уже ловили белый экран именно на этом).
function textField(row: ChildRow, field: string): string {
  const value = (row as unknown as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

function quantityOf(row: ChildRow): number {
  return (row as { quantity?: number }).quantity ?? 0
}

function sortOrderOf(row: ChildRow): number {
  return (row as { sort_order?: number }).sort_order ?? 0
}

export default function QuickLists({ sheet }: { sheet: CharacterSheet }) {
  const [openTable, setOpenTable] = useState<ChildTable | null>(
    () => (getUiState<ChildTable>('quick-list') as ChildTable | null) ?? null,
  )
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const category = CATEGORIES.find((c) => c.table === openTable) ?? null

  // Таблица нужна отложенному сохранению в момент отправки, а не в момент
  // правки: если человек успел переключить категорию внутри окна дебаунса,
  // патч ушёл бы не в ту таблицу.
  const openTableRef = useRef<ChildTable | null>(openTable)
  openTableRef.current = openTable

  const { schedule, discard } = useDebouncedPatches<ChildRow>(
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
    listChildren(openTable, sheet.id)
      .then((data) => {
        if (my === requestId.current) setRows(data)
      })
      .catch((err) => {
        if (my === requestId.current) setError(err instanceof Error ? err.message : 'Не удалось загрузить список')
      })
  }, [openTable, sheet.id])

  // Панель висит поверх интерфейса, поэтому её надо закрывать кликом мимо и
  // по Esc — иначе она перекрывает то, ради чего её и открывали.
  useEffect(() => {
    if (!openTable) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTable])

  function close() {
    setOpenTable(null)
    setRows(null)
    setExpanded(null)
    setAddOpen(false)
    setUiState('quick-list', null)
  }

  function toggleCategory(table: ChildTable) {
    if (openTable === table) {
      close()
      return
    }
    setOpenTable(table)
    // Сбрасываем список ЗДЕСЬ, а не в эффекте: эффект отрабатывает уже после
    // рендера, и один кадр строки старой категории рисуются полями новой.
    setRows(null)
    setExpanded(null)
    setAddOpen(false)
    setError('')
    setUiState('quick-list', table)
  }

  function editRow(row: ChildRow, patch: Record<string, unknown>) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) : prev))
    schedule(row.id, patch as Partial<ChildRow>)
  }

  function step(row: ChildRow, delta: number) {
    editRow(row, { quantity: Math.max(0, quantityOf(row) + delta) })
  }

  async function handleAdd() {
    if (!category || !addName.trim()) return
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        character_id: sheet.id,
        [category.titleField]: addName.trim(),
        ...(category.defaults ?? {}),
      }
      if (category.hasSlot) payload.slot = 'Прочее'
      if (category.countable) payload.quantity = 1
      if (category.sorted) {
        payload.sort_order = rows && rows.length ? Math.max(...rows.map(sortOrderOf)) + 1 : 0
      }
      const created = await insertChild(category.table, payload as never)
      setRows((prev) => (prev ? [...prev, created] : [created]))
      setAddName('')
      setAddOpen(false)
      setExpanded(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(row: ChildRow) {
    if (!category) return
    const title = textField(row, category.titleField) || '(без имени)'
    if (!window.confirm(`Удалить «${title}»?`)) return
    // Снимаем отложенный патч: иначе он уйдёт по уже удалённой строке и
    // вернёт ошибку поверх успешного удаления.
    discard(row.id)
    try {
      await deleteChild(category.table, row.id)
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev))
      setExpanded(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    }
  }

  return (
    <div className="quick-lists" ref={wrapRef}>
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
          <div className="quick-panel-head">
            <span className="quick-panel-title">{category.label}</span>
            <button
              type="button"
              className="tab-add-toggle"
              title={addOpen ? 'Закрыть форму' : 'Добавить'}
              onClick={() => setAddOpen((v) => !v)}
            >
              {addOpen ? '×' : '+'}
            </button>
            <button type="button" className="quick-close" title="Закрыть" onClick={close}>
              ✕
            </button>
          </div>

          {addOpen && (
            <div className="quick-add tab-add-panel">
              <input
                type="text"
                autoFocus
                placeholder="Название…"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAdd()
                }}
              />
              <button type="button" disabled={busy || !addName.trim()} onClick={() => void handleAdd()}>
                Добавить
              </button>
            </div>
          )}

          {error && <p className="quick-error">{error}</p>}
          {rows === null && !error && <p className="quick-empty">Загрузка…</p>}
          {rows !== null && rows.length === 0 && <p className="quick-empty">Пусто.</p>}

          <div className="quick-rows">
            {rows?.map((row) => {
              const isOpen = expanded === row.id
              const count = quantityOf(row)
              return (
                <div key={row.id} className={`quick-row${count === 0 && category.countable ? ' quick-row-empty' : ''}`}>
                  <button
                    type="button"
                    className="quick-row-name"
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                  >
                    <span className="quick-row-caret">{isOpen ? '▴' : '▾'}</span>
                    {category.hasSlot && <span className="quick-row-slot">{textField(row, 'slot')}</span>}
                    {textField(row, category.titleField) || '(без имени)'}
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

                  {isOpen && (
                    <div className="quick-row-edit">
                      {category.hasSlot && (
                        <input
                          type="text"
                          placeholder="Слот"
                          value={textField(row, 'slot')}
                          onChange={(e) => editRow(row, { slot: e.target.value })}
                        />
                      )}
                      <input
                        type="text"
                        placeholder="Название"
                        value={textField(row, category.titleField)}
                        onChange={(e) => editRow(row, { [category.titleField]: e.target.value })}
                      />
                      <AutoTextarea
                        placeholder="Описание…"
                        value={textField(row, category.detailField)}
                        onChange={(e) => editRow(row, { [category.detailField]: e.target.value })}
                      />
                      <button
                        type="button"
                        className="quick-delete"
                        onClick={() => void handleDelete(row)}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
