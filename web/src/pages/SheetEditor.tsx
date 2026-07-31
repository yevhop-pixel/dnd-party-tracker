import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSheet, updateSheet } from '../lib/api'
import { downloadSheetBackup } from '../lib/backup'
import type { CharacterSheet } from '../lib/types'
import TabStats from '../components/sheet/TabStats'
import TabFeatures from '../components/sheet/TabFeatures'
import TabInventory from '../components/sheet/TabInventory'
import TabEquipped from '../components/sheet/TabEquipped'
import TabNpcs from '../components/sheet/TabNpcs'
import TabQuests from '../components/sheet/TabQuests'
import TabPotions from '../components/sheet/TabPotions'
import TabConsumables from '../components/sheet/TabConsumables'
import TabNotes from '../components/sheet/TabNotes'
import type { SheetTabProps } from '../components/sheet/types'

type TabKey = 'stats' | 'features' | 'inventory' | 'equipped' | 'npcs' | 'quests' | 'potions' | 'consumables' | 'notes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stats', label: 'Статы' },
  { key: 'features', label: 'Черты' },
  { key: 'inventory', label: 'Инвентарь' },
  { key: 'equipped', label: 'Эквип' },
  { key: 'npcs', label: 'NPC' },
  { key: 'quests', label: 'Квесты' },
  { key: 'potions', label: 'Зелья' },
  { key: 'consumables', label: 'Расходники' },
  { key: 'notes', label: 'Заметки' },
]

const TAB_COMPONENTS: Record<TabKey, (props: SheetTabProps) => ReactElement> = {
  stats: TabStats,
  features: TabFeatures,
  inventory: TabInventory,
  equipped: TabEquipped,
  npcs: TabNpcs,
  quests: TabQuests,
  potions: TabPotions,
  consumables: TabConsumables,
  notes: TabNotes,
}

// Автосохранение изменений листа не должно бомбить сервер на каждое нажатие
// клавиши — копим правки и отправляем одним запросом раз в SAVE_DEBOUNCE_MS.
const SAVE_DEBOUNCE_MS = 600

export default function SheetEditor() {
  const { sheetId } = useParams()
  const navigate = useNavigate()

  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('stats')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exportError, setExportError] = useState('')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Partial<CharacterSheet>>({})

  useEffect(() => {
    if (!sheetId) return
    void loadSheet(sheetId)
    // При уходе со страницы (unmount или закрытие вкладки) несохранённый патч
    // не должен пропасть — отправляем его немедленно, не дожидаясь debounce.
    const flushNow = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (Object.keys(pendingPatch.current).length === 0) return
      const patch = pendingPatch.current
      pendingPatch.current = {}
      // TODO: при 'pagehide' браузер может оборвать обычный fetch раньше, чем
      // он уйдёт в сеть — надёжнее был бы keepalive-запрос (fetch с
      // { keepalive: true } / navigator.sendBeacon), но supabase-js такого
      // режима «из коробки» не даёт, а городить прямой fetch мимо клиента
      // ради этого не стоит. Оставляем как есть.
      void updateSheet(sheetId, patch)
    }
    window.addEventListener('pagehide', flushNow)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      flushNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId])

  async function loadSheet(id: string) {
    setLoadError('')
    try {
      setSheet(await getSheet(id))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить персонажа')
    }
  }

  const flushSave = useCallback(() => {
    if (!sheetId || Object.keys(pendingPatch.current).length === 0) return
    const patch = pendingPatch.current
    pendingPatch.current = {}
    setSaveState('saving')
    updateSheet(sheetId, patch)
      .then(() => setSaveState('saved'))
      .catch(() => {
        // Вернуть несохранённое в очередь, чтобы следующая правка увела его на сервер
        pendingPatch.current = { ...patch, ...pendingPatch.current }
        setSaveState('error')
      })
  }, [sheetId])

  async function handleExport() {
    if (!sheetId) return
    setExportError('')
    try {
      await downloadSheetBackup(sheetId)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Не удалось экспортировать персонажа')
    }
  }

  function handleSheetChange(patch: Partial<CharacterSheet>) {
    setSheet((prev) => (prev ? { ...prev, ...patch } : prev))
    pendingPatch.current = { ...pendingPatch.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }

  if (loadError) {
    return (
      <div className="page">
        <header className="page-header">
          <button type="button" onClick={() => navigate('/campaigns')}>
            ← Назад
          </button>
        </header>
        <p className="auth-error">{loadError}</p>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="page">
        <p>Загрузка…</p>
      </div>
    )
  }

  const ActiveTabComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="page sheet-page">
      <header className="page-header">
        <button type="button" onClick={() => navigate('/campaigns')}>
          ← Назад
        </button>
        <span className={`sheet-save-indicator${saveState === 'error' ? ' sheet-save-error' : ''}`}>
          {saveState === 'saving'
            ? 'Сохранение…'
            : saveState === 'saved'
              ? 'Сохранено'
              : saveState === 'error'
                ? 'Ошибка сохранения — проверьте сеть'
                : ''}
        </span>
        <button type="button" onClick={() => void handleExport()}>
          Экспорт
        </button>
      </header>
      {exportError && <p className="auth-error">{exportError}</p>}

      <div className="sheet-title">
        <h1>{sheet.char_name || sheet.name}</h1>
        <p>
          {sheet.char_class || 'без класса'} · {sheet.char_race || 'без расы'} · уровень {sheet.char_level}
        </p>
      </div>

      <nav className="sheet-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`sheet-tab${activeTab === tab.key ? ' sheet-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="sheet-tab-content">
        <ActiveTabComponent sheet={sheet} onSheetChange={handleSheetChange} />
      </div>
    </div>
  )
}
