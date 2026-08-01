import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthContext } from '../App'
import { getCampaign, listCampaignMembers, listCampaignSheets, type CampaignMemberInfo } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { saveLastCampaign } from '../lib/lastCampaign'
import { getUiState, setUiState } from '../lib/uiState'
import type { Campaign, CharacterSheet } from '../lib/types'
import DicePanel from '../features/dice/DicePanel'
import RollFeed from '../features/dice/RollFeed'
import ChatPanel from '../features/chat/ChatPanel'
import MapManager from '../features/maps/MapManager'
import GmNoteBox from '../features/notes/GmNoteBox'
import SheetReadOnly from '../components/SheetReadOnly'
import Avatar from '../components/Avatar'
import InitiativeTracker from '../features/initiative/InitiativeTracker'

type TabKey = 'players' | 'initiative' | 'dice' | 'maps' | 'chat'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'players', label: 'Игроки' },
  { key: 'initiative', label: 'Бой' },
  { key: 'dice', label: 'Кубы' },
  { key: 'maps', label: 'Карты' },
  { key: 'chat', label: 'Чат' },
]

function initialTab(): TabKey {
  const saved = getUiState<TabKey>('gm-tab')
  return saved && TABS.some((t) => t.key === saved) ? saved : 'players'
}

export default function GmView() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [members, setMembers] = useState<CampaignMemberInfo[] | null>(null)
  const [sheets, setSheets] = useState<CharacterSheet[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [copiedCode, setCopiedCode] = useState('')
  const [openedSheetId, setOpenedSheetId] = useState<string | null>(null)

  useEffect(() => {
    if (campaignId) void loadAll(campaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  async function loadAll(id: string) {
    setLoadError('')
    try {
      const [c, mem, sh] = await Promise.all([getCampaign(id), listCampaignMembers(id), listCampaignSheets(id)])
      setCampaign(c)
      saveLastCampaign({ id: c.id, name: c.name, role: 'gm' })
      setMembers(mem)
      setSheets(sh)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить кампанию')
    } finally {
      setLoaded(true)
    }
  }

  const me = members?.find((m) => m.id === user?.id)
  const isGm = me?.role === 'gm'

  // Не-ГМ (или ещё не участник) не должен оставаться на экране ГМа —
  // отправляем его на его собственный вид кампании.
  useEffect(() => {
    if (loaded && members && campaignId && !isGm) {
      navigate(`/play/${campaignId}`, { replace: true })
    }
  }, [loaded, members, campaignId, isGm, navigate])

  async function copyCode(code: string) {
    const ok = await copyToClipboard(code)
    // Результат показываем всегда: молчание кнопки читается как поломка.
    setCopiedCode(ok ? code : `err:${code}`)
    setTimeout(() => setCopiedCode(''), 2000)
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

  if (!campaignId || !loaded || !campaign || !members || !sheets || !user || !isGm) {
    return (
      <div className="page">
        <p>Загрузка…</p>
      </div>
    )
  }

  function ownerName(ownerId: string): string {
    return members?.find((m) => m.id === ownerId)?.name ?? 'Игрок'
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab)
    setUiState('gm-tab', tab)
  }

  return (
    <div className="page campaign-page">
      <header className="page-header">
        <button type="button" onClick={() => navigate('/campaigns')}>
          ← Кампании
        </button>
        <h1>{campaign.name}</h1>
        <span className="gm-header-code">
          Код: <code>{campaign.join_code}</code>
          <button type="button" onClick={() => void copyCode(campaign.join_code)}>
            {copiedCode === campaign.join_code
              ? 'Скопировано ✓'
              : copiedCode === `err:${campaign.join_code}`
                ? 'Выделите код вручную'
                : 'Копировать'}
          </button>
        </span>
      </header>

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

      {activeTab === 'players' && (
        <>
          {openedSheetId ? (
            <div className="sheet-read-only-wrap">
              <button type="button" onClick={() => setOpenedSheetId(null)}>
                ← к списку игроков
              </button>
              {(() => {
                const openedSheet = sheets.find((s) => s.id === openedSheetId)
                return openedSheet ? (
                  <GmNoteBox
                    campaignId={campaignId}
                    subjectUserId={openedSheet.owner_id}
                    subjectName={ownerName(openedSheet.owner_id)}
                  />
                ) : null
              })()}
              <SheetReadOnly sheetId={openedSheetId} />
            </div>
          ) : (
            <ul className="card-list">
              {sheets.length === 0 && <li className="card-sub-text">В кампании пока нет листов персонажей.</li>}
              {sheets.map((sheet) => (
                <li
                  key={sheet.id}
                  className="card card-clickable"
                  onClick={() => setOpenedSheetId(sheet.id)}
                >
                  <div className="card-main">
                    <div className="card-avatar-row">
                      <Avatar path={sheet.avatar_path} name={sheet.char_name || sheet.name} size={32} />
                      <strong>{sheet.char_name || sheet.name}</strong>
                    </div>
                    <span className="badge">{ownerName(sheet.owner_id)}</span>
                  </div>
                  <span className="card-sub-text">
                    {sheet.char_class || 'без класса'} · уровень {sheet.char_level} · ХП {sheet.hp_current}/
                    {sheet.hp_max} · КД {sheet.armor_class}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {activeTab === 'initiative' && <InitiativeTracker campaignId={campaignId} isGm={true} sheets={sheets} />}

      {activeTab === 'dice' && (
        <>
          <DicePanel campaignId={campaignId} characterId={null} />
          <RollFeed
            campaignId={campaignId}
            myUserId={user.id}
            isGm={true}
            userNames={Object.fromEntries(members.map((m) => [m.id, m.name]))}
            myCharacterId={null}
            avatarsByUser={Object.fromEntries(sheets.map((s) => [s.owner_id, s.avatar_path]))}
          />
        </>
      )}

      {activeTab === 'maps' && <MapManager campaignId={campaignId} />}

      {activeTab === 'chat' && <ChatPanel campaignId={campaignId} myUserId={user.id} isGm={true} members={members} />}
    </div>
  )
}
