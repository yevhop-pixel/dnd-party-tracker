import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthContext } from '../App'
import { getCampaign, getMyPremium, listCampaignMembers, listCampaignSheets, type CampaignMemberInfo } from '../lib/api'
import PremiumPage from '../features/premium/PremiumPage'
import WorldClock from '../features/clock/WorldClock'
import { copyToClipboard } from '../lib/clipboard'
import { saveLastCampaign } from '../lib/lastCampaign'
import { getUiState, setUiState } from '../lib/uiState'
import type { Campaign, CharacterSheet } from '../lib/types'
import DicePanel from '../features/dice/DicePanel'
import RollFeed from '../features/dice/RollFeed'
import CritWatcher from '../features/dice/CritWatcher'
import ChatPanel from '../features/chat/ChatPanel'
import ChatNotifier from '../features/chat/ChatNotifier'
import MapManager from '../features/maps/MapManager'
import GmNoteBox from '../features/notes/GmNoteBox'
import SheetReadOnly from '../components/SheetReadOnly'
import Avatar from '../components/Avatar'
import InitiativeTracker from '../features/initiative/InitiativeTracker'
import Popover from '../components/Popover'

type TabKey = 'players' | 'initiative' | 'dice' | 'maps' | 'chat' | 'premium' | 'time'

// Бой и чат ушли под «⋯»: они и так под рукой «карманами» выше, а
// полноэкранные версии нужны изредка (как и у игрока).
const TABS: { key: TabKey; label: string }[] = [
  { key: 'players', label: 'Игроки' },
  { key: 'dice', label: 'Кубы' },
  { key: 'maps', label: 'Карты' },
  { key: 'initiative', label: 'Бой' },
  { key: 'chat', label: 'Чат' },
  { key: 'premium', label: '👑 Премиум' },
  { key: 'time', label: '🕐 Время' },
]
const PRIMARY_TABS: TabKey[] = ['players', 'dice', 'maps', 'premium', 'time']

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
  const [chatUnread, setChatUnread] = useState(0)
  // Шуточная подписка — у человека, а не у листа: у ГМа персонажа нет вовсе.
  const [premium, setPremium] = useState(false)

  useEffect(() => {
    getMyPremium()
      .then(setPremium)
      .catch(() => setPremium(false))
  }, [])
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

  const userNames = Object.fromEntries(members.map((m) => [m.id, m.name]))

  return (
    <div className="page campaign-page">
      {/* Уровня кампании, не вкладки «Кубы» — иначе крит-анимация/музыка не
          играет у тех, кто сидит на другой вкладке (см. STATUS.md). */}
      <CritWatcher campaignId={campaignId} myUserId={user.id} isGm={true} userNames={userNames} />
      {/* Тоже уровня кампании: о сообщении надо узнавать с любой вкладки. */}
      <ChatNotifier
        campaignId={campaignId}
        myUserId={user.id}
        chatOpen={activeTab === 'chat'}
        userNames={userNames}
        onUnreadChange={setChatUnread}
      />
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

      {/* Те же «карманы», что у игрока: чат и бой всплывают поверх экрана с
          любой вкладки, не сдвигая его. */}
      <div className="campaign-pockets">
        {/* Подписи словами и на телефоне: у ГМа карманов всего два, они
            умещаются в строку — ужимать до значков (как у игрока с его пятью)
            здесь значило бы потерять слова просто так. */}
        <Popover label="💬 Чат" badge={chatUnread} width={460} onOpen={() => setChatUnread(0)}>
          <ChatPanel campaignId={campaignId} myUserId={user.id} isGm={true} members={members} />
        </Popover>
        <Popover label="⚔ Бой" width={560}>
          <InitiativeTracker campaignId={campaignId} isGm={true} sheets={sheets ?? undefined} />
        </Popover>
      </div>

      <nav className="sheet-tabs">
        {TABS.filter((t) => PRIMARY_TABS.includes(t.key)).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`sheet-tab${activeTab === tab.key ? ' sheet-tab-active' : ''}${
              tab.key === 'premium' ? ' sheet-tab-premium' : ''
            }`}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        {/* Редкие вкладки — под «⋯»; имя открытой ставим прямо на кнопку. */}
        <Popover
          label={
            PRIMARY_TABS.includes(activeTab)
              ? '⋯'
              : `⋯ ${TABS.find((t) => t.key === activeTab)?.label ?? ''}`
          }
          badge={chatUnread}
          width={220}
          bare
          chipClass="sheet-tab"
          activeChipClass="sheet-tab-active"
        >
          {(close) => (
            <div className="tab-menu">
              {TABS.filter((t) => !PRIMARY_TABS.includes(t.key)).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-menu-item${activeTab === tab.key ? ' tab-menu-item-active' : ''}`}
                  onClick={() => {
                    selectTab(tab.key)
                    close()
                  }}
                >
                  {tab.label}
                  {tab.key === 'chat' && chatUnread > 0 && <span className="tab-badge">{chatUnread}</span>}
                </button>
              ))}
            </div>
          )}
        </Popover>
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
        <div className="dice-layout">
          <div className="dice-layout-controls">
            <DicePanel campaignId={campaignId} characterId={null} premium={premium} />
          </div>
          <div className="dice-layout-feed">
            <RollFeed
              campaignId={campaignId}
              myUserId={user.id}
              isGm={true}
              userNames={userNames}
              myCharacterId={null}
              avatarsByUser={Object.fromEntries(sheets.map((s) => [s.owner_id, s.avatar_path]))}
            />
          </div>
        </div>
      )}

      {activeTab === 'maps' && <MapManager campaignId={campaignId} />}

      {activeTab === 'chat' && <ChatPanel campaignId={campaignId} myUserId={user.id} isGm={true} members={members} />}

      {activeTab === 'premium' && <PremiumPage active={premium} onChange={setPremium} />}

      {activeTab === 'time' && <WorldClock />}
    </div>
  )
}
