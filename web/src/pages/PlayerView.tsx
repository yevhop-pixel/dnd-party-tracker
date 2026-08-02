import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthContext } from '../App'
import {
  attachSheetToCampaign,
  createSheet,
  detachSheetFromCampaign,
  getCampaign,
  listCampaignMembers,
  listCampaignSheets,
  listMySheets,
  listPartyAvatars,
  updateSheet,
  type CampaignMemberInfo,
} from '../lib/api'
import { saveLastCampaign } from '../lib/lastCampaign'
import { getUiState, setUiState } from '../lib/uiState'
import type { Campaign, CharacterSheet } from '../lib/types'
import DicePanel from '../features/dice/DicePanel'
import RollFeed from '../features/dice/RollFeed'
import CritWatcher from '../features/dice/CritWatcher'
import MacroBar from '../features/dice/MacroBar'
import ChatPanel from '../features/chat/ChatPanel'
import PlayerMap from '../features/maps/PlayerMap'
import Avatar from '../components/Avatar'
import HpBar from '../components/HpBar'
import InitiativeTracker from '../features/initiative/InitiativeTracker'
import QuickLists from '../components/sheet/QuickLists'

type TabKey = 'sheet' | 'dice' | 'initiative' | 'map' | 'chat'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'sheet', label: 'Лист' },
  { key: 'dice', label: 'Кубы' },
  { key: 'initiative', label: 'Бой' },
  { key: 'map', label: 'Карта' },
  { key: 'chat', label: 'Чат' },
]

function initialTab(): TabKey {
  const saved = getUiState<TabKey>('play-tab')
  return saved && TABS.some((t) => t.key === saved) ? saved : 'sheet'
}

export default function PlayerView() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [members, setMembers] = useState<CampaignMemberInfo[] | null>(null)
  const [mySheet, setMySheet] = useState<CharacterSheet | null>(null)
  // user_id -> avatar_path соседей по кампании (свой лист сюда тоже попадает).
  const [partyAvatars, setPartyAvatars] = useState<Record<string, string | null>>({})
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Ошибка любого действия на экране (ХП, правка листа) — баннером, не вместо
  // экрана. См. комментарий у handleHpChange.
  const [actionError, setActionError] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  // --- Выбор персонажа для кампании (пока у игрока нет привязанного листа) ---
  const [candidates, setCandidates] = useState<CharacterSheet[] | null>(null)
  const [candidatesError, setCandidatesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  const [newSheetName, setNewSheetName] = useState('')

  useEffect(() => {
    if (campaignId) void loadAll(campaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  useEffect(() => {
    if (loaded && !mySheet) void loadCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mySheet])

  const me = members?.find((m) => m.id === user?.id)
  const isGm = me?.role === 'gm'

  // ГМ, зашедший на /play/:id, должен попадать на свой экран — зеркально
  // тому, как GmView отправляет не-ГМа на /play/:id.
  useEffect(() => {
    if (loaded && members && campaignId && isGm) {
      navigate(`/gm/${campaignId}`, { replace: true })
    }
  }, [loaded, members, campaignId, isGm, navigate])

  async function loadAll(id: string) {
    setLoadError('')
    try {
      const [c, mem, sheets] = await Promise.all([getCampaign(id), listCampaignMembers(id), listCampaignSheets(id)])
      setCampaign(c)
      saveLastCampaign({ id: c.id, name: c.name, role: 'player' })
      setMembers(mem)
      // Аватарки партии — отдельным (не блокирующим) запросом: без них экран
      // полностью рабочий, просто в ленте будут кружки с буквой.
      listPartyAvatars(id)
        .then((rows) => setPartyAvatars(Object.fromEntries(rows.map((r) => [r.owner_id, r.avatar_path]))))
        .catch(() => setPartyAvatars({}))
      // listCampaignSheets для ГМа возвращает все листы кампании — нельзя
      // просто брать первый, иначе ГМ увидит чужой лист как свой.
      setMySheet(sheets.find((s) => s.owner_id === user?.id) ?? null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить кампанию')
    } finally {
      setLoaded(true)
    }
  }

  async function loadCandidates() {
    setCandidatesError('')
    try {
      const all = await listMySheets()
      setCandidates(all.filter((s) => s.campaign_id === null || s.campaign_id === campaignId))
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : 'Не удалось загрузить персонажей')
    }
  }

  async function handleAttach(sheetId: string) {
    if (!campaignId) return
    setBusy(true)
    setCandidatesError('')
    try {
      await attachSheetToCampaign(sheetId, campaignId)
      await loadAll(campaignId)
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : 'Не удалось привязать персонажа')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateNew(e: FormEvent) {
    e.preventDefault()
    if (!campaignId) return
    const name = newSheetName.trim()
    if (!name) return
    setBusy(true)
    setCandidatesError('')
    try {
      await createSheet(name, campaignId)
      setNewSheetOpen(false)
      setNewSheetName('')
      await loadAll(campaignId)
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : 'Не удалось создать персонажа')
    } finally {
      setBusy(false)
    }
  }

  // ХП правится прямо с экрана кампании: оптимистично в локальный лист, затем
  // в базу. Ошибка идёт в ОТДЕЛЬНЫЙ actionError, а не в loadError: loadError
  // рендерится вместо всего экрана, и одна неудачная запись ХП выбрасывала бы
  // игрока из боя вместе с лентой бросков, чатом и realtime-подписками.
  // При отказе откатываем оптимистичное значение — иначе на экране одно ХП,
  // в базе другое, и следующий «−1» считается от вранья.
  function handleHpChange(patch: Partial<CharacterSheet>) {
    if (!mySheet) return
    const sheetId = mySheet.id
    const previousHp = mySheet.hp_current
    setMySheet((prev) => (prev ? { ...prev, ...patch } : prev))
    setActionError('')
    updateSheet(sheetId, patch).catch((err) => {
      setMySheet((prev) => (prev ? { ...prev, hp_current: previousHp } : prev))
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить ХП')
    })
  }


  async function handleDetach() {
    if (!mySheet || !campaignId) return
    if (!window.confirm('Отвязать персонажа от кампании? Лист останется у вас, но перестанет быть частью кампании.')) return
    try {
      await detachSheetFromCampaign(mySheet.id)
      await loadAll(campaignId)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось отвязать персонажа')
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <header className="page-header">
          <button type="button" onClick={() => navigate('/campaigns')}>
            ← Кампании
          </button>
        </header>
        <p className="auth-error">{loadError}</p>
      </div>
    )
  }

  if (!campaignId || !loaded || !campaign || !members || !user || isGm) {
    return (
      <div className="page">
        <p>Загрузка…</p>
      </div>
    )
  }

  const userNames = Object.fromEntries(members.map((m) => [m.id, m.name]))

  function selectTab(tab: TabKey) {
    setActiveTab(tab)
    setUiState('play-tab', tab)
  }

  return (
    <div className="page campaign-page">
      {/* Уровня кампании, не вкладки «Кубы» — иначе крит-анимация/музыка не
          играет у тех, кто сидит на другой вкладке (см. STATUS.md). */}
      <CritWatcher campaignId={campaignId} myUserId={user.id} isGm={false} userNames={userNames} />
      <header className="page-header">
        <button type="button" onClick={() => navigate('/campaigns')}>
          ← Кампании
        </button>
        <h1>{campaign.name}</h1>
        {/* ХП живёт прямо в шапке — той же плашкой, что и в листе, и не
            занимает отдельную строку на экране кампании. */}
        {mySheet && <HpBar sheet={mySheet} onChange={handleHpChange} />}
        {mySheet && (
          <button type="button" onClick={() => navigate(`/sheet/${mySheet.id}`)}>
            📋 Мой лист
          </button>
        )}
      </header>

      {actionError && <p className="auth-error">{actionError}</p>}

      {/* Быстрые списки под рукой с любой вкладки кампании: посмотреть, что
          есть, и скрутить счётчик (выпил зелье — −1). Полная правка — в
          редакторе листа по кнопке «Мой лист». */}
      {mySheet && <QuickLists sheet={mySheet} />}

      {/* Вкладки доступны всегда, даже пока к кампании не привязан персонаж —
          свежевступивший игрок должен сразу видеть карту и мочь написать ГМу. */}
      <nav className="sheet-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`sheet-tab${activeTab === tab.key ? ' sheet-tab-active' : ''}`}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'sheet' && (
        <>
          {mySheet ? (
            <section className="sheet-section">
              <div className="card-avatar-row">
                <Avatar path={mySheet.avatar_path} name={mySheet.char_name || mySheet.name} size={48} />
                <h2>{mySheet.char_name || mySheet.name}</h2>
              </div>
              <p>
                {mySheet.char_class || 'без класса'} · уровень {mySheet.char_level} · ХП {mySheet.hp_current}/
                {mySheet.hp_max} · КД {mySheet.armor_class}
              </p>
              <button type="button" onClick={() => navigate(`/sheet/${mySheet.id}`)}>
                Открыть редактор листа
              </button>
              <button type="button" onClick={() => void handleDetach()}>
                Отвязать от кампании
              </button>
            </section>
          ) : (
            <section className="section">
              <h2>Выберите персонажа для этой кампании</h2>
              {candidatesError && <p className="auth-error">{candidatesError}</p>}
              {candidates === null && !candidatesError && <p>Загрузка…</p>}
              {candidates && candidates.length === 0 && <p>Свободных персонажей нет — создайте нового.</p>}
              {candidates && candidates.length > 0 && (
                <ul className="card-list">
                  {candidates.map((s) => (
                    <li key={s.id} className="card">
                      <div className="card-main">
                        <strong>{s.name}</strong>
                        <button type="button" disabled={busy} onClick={() => void handleAttach(s.id)}>
                          Привязать
                        </button>
                      </div>
                      <span className="card-sub-text">
                        {s.char_name || 'Без имени персонажа'} · {s.char_class || 'без класса'}, уровень{' '}
                        {s.char_level}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {newSheetOpen ? (
                <form className="inline-form" onSubmit={handleCreateNew}>
                  <input
                    type="text"
                    value={newSheetName}
                    autoFocus
                    placeholder="Имя персонажа"
                    disabled={busy}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setNewSheetOpen(false)
                        setNewSheetName('')
                      }
                    }}
                  />
                  <button type="submit" disabled={busy}>
                    {busy ? 'Создаём…' : 'Создать'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setNewSheetOpen(false)
                      setNewSheetName('')
                    }}
                  >
                    Отмена
                  </button>
                </form>
              ) : (
                <button type="button" disabled={busy} onClick={() => setNewSheetOpen(true)}>
                  Создать нового
                </button>
              )}
            </section>
          )}
        </>
      )}

      {activeTab === 'dice' && (
        <div className="dice-layout">
          <div className="dice-layout-controls">
            <DicePanel campaignId={campaignId} characterId={mySheet?.id ?? null} />
            {mySheet && <MacroBar campaignId={campaignId} sheet={mySheet} />}
          </div>
          <div className="dice-layout-feed">
            <RollFeed
              campaignId={campaignId}
              myUserId={user.id}
              isGm={false}
              userNames={userNames}
              myCharacterId={mySheet?.id ?? null}
              avatarsByUser={{ ...partyAvatars, [user.id]: mySheet?.avatar_path ?? null }}
            />
          </div>
        </div>
      )}

      {activeTab === 'initiative' && <InitiativeTracker campaignId={campaignId} isGm={false} />}

      {activeTab === 'map' && <PlayerMap campaignId={campaignId} />}

      {activeTab === 'chat' && (
        <ChatPanel campaignId={campaignId} myUserId={user.id} isGm={false} members={members} />
      )}
    </div>
  )
}
