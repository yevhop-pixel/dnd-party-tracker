import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../App'
import {
  createCampaign,
  createSheet,
  joinCampaign,
  listMyCampaigns,
  listMySheets,
  type MyCampaign,
} from '../lib/api'
import { importSheetFromJson } from '../lib/backup'
import { copyToClipboard } from '../lib/clipboard'
import type { CharacterSheet } from '../lib/types'

export default function CampaignPicker() {
  const { user, signOut } = useAuthContext()
  const navigate = useNavigate()

  // --- Мои кампании ---
  const [campaigns, setCampaigns] = useState<MyCampaign[] | null>(null)
  const [campaignsError, setCampaignsError] = useState('')
  const [copiedCode, setCopiedCode] = useState('')

  // --- Создание кампании ---
  const [newCampaignName, setNewCampaignName] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [createCampaignError, setCreateCampaignError] = useState('')
  const [createdCode, setCreatedCode] = useState('')

  // --- Вступление по коду ---
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  // --- Мои персонажи ---
  const [sheets, setSheets] = useState<CharacterSheet[] | null>(null)
  const [sheetsError, setSheetsError] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // --- Создание персонажа ---
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  const [newSheetName, setNewSheetName] = useState('')
  const [creatingSheet, setCreatingSheet] = useState(false)

  useEffect(() => {
    void loadCampaigns()
    void loadSheets()
  }, [])

  async function loadCampaigns() {
    setCampaignsError('')
    try {
      setCampaigns(await listMyCampaigns())
    } catch (err) {
      setCampaignsError(err instanceof Error ? err.message : 'Не удалось загрузить кампании')
    }
  }

  async function loadSheets() {
    setSheetsError('')
    try {
      setSheets(await listMySheets())
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Не удалось загрузить персонажей')
    }
  }

  function openCampaign(c: MyCampaign) {
    navigate(c.role === 'gm' ? `/gm/${c.campaign.id}` : `/play/${c.campaign.id}`)
  }

  async function copyCode(code: string) {
    const ok = await copyToClipboard(code)
    // Показываем результат в любом случае: молчание кнопки читается как поломка.
    setCopiedCode(ok ? code : `err:${code}`)
    setTimeout(() => setCopiedCode(''), 2000)
  }

  async function handleCreateCampaign(e: FormEvent) {
    e.preventDefault()
    setCreateCampaignError('')
    setCreatedCode('')
    setCreatingCampaign(true)
    try {
      const campaign = await createCampaign(newCampaignName.trim())
      setNewCampaignName('')
      setCreatedCode(campaign.join_code)
      await loadCampaigns()
    } catch (err) {
      setCreateCampaignError(err instanceof Error ? err.message : 'Не удалось создать кампанию')
    } finally {
      setCreatingCampaign(false)
    }
  }

  async function handleJoinCampaign(e: FormEvent) {
    e.preventDefault()
    setJoinError('')
    setJoining(true)
    try {
      const campaignId = await joinCampaign(joinCode.trim())
      setJoinCode('')
      navigate(`/play/${campaignId}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Не удалось вступить в кампанию')
    } finally {
      setJoining(false)
    }
  }

  async function handleNewSheet(e: FormEvent) {
    e.preventDefault()
    const name = newSheetName.trim()
    if (!name) return
    setSheetsError('')
    setCreatingSheet(true)
    try {
      const sheet = await createSheet(name)
      setSheets((prev) => (prev ? [sheet, ...prev] : [sheet]))
      setNewSheetOpen(false)
      setNewSheetName('')
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Не удалось создать персонажа')
    } finally {
      setCreatingSheet(false)
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSheetsError('')
    setImporting(true)
    try {
      const text = await file.text()
      await importSheetFromJson(text)
      await loadSheets()
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Не удалось импортировать персонажа')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Кампании</h1>
        <button type="button" onClick={() => void signOut()}>
          Выйти
        </button>
      </header>
      <p>Вы вошли как {user?.email}.</p>

      <section className="section">
        <h2>Мои кампании</h2>
        {campaigns === null && !campaignsError && <p>Загрузка…</p>}
        {campaignsError && <p className="auth-error">{campaignsError}</p>}
        {campaigns && campaigns.length === 0 && <p>Вы пока не состоите ни в одной кампании.</p>}
        {campaigns && campaigns.length > 0 && (
          <ul className="card-list">
            {campaigns.map(({ campaign, role }) => (
              <li key={campaign.id} className="card card-clickable" onClick={() => openCampaign({ campaign, role })}>
                <div className="card-main">
                  <strong>{campaign.name}</strong>
                  <span className="badge">{role === 'gm' ? 'ГМ' : 'Игрок'}</span>
                </div>
                {role === 'gm' && (
                  <div className="card-sub" onClick={(e) => e.stopPropagation()}>
                    Код: <code>{campaign.join_code}</code>
                    <button type="button" onClick={() => void copyCode(campaign.join_code)}>
                      {copiedCode === campaign.join_code
                        ? 'Скопировано ✓'
                        : copiedCode === `err:${campaign.join_code}`
                          ? 'Выделите код вручную'
                          : 'Копировать'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Создать кампанию</h2>
        <form className="inline-form" onSubmit={handleCreateCampaign}>
          <input
            type="text"
            value={newCampaignName}
            onChange={(e) => setNewCampaignName(e.target.value)}
            placeholder="Название кампании"
            required
          />
          <button type="submit" disabled={creatingCampaign}>
            {creatingCampaign ? 'Создаём…' : 'Создать'}
          </button>
        </form>
        {createCampaignError && <p className="auth-error">{createCampaignError}</p>}
        {createdCode && (
          <p>
            Кампания создана. Код для игроков: <code>{createdCode}</code>
          </p>
        )}
      </section>

      <section className="section">
        <h2>Войти по коду</h2>
        <form className="inline-form" onSubmit={handleJoinCampaign}>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Код кампании"
            maxLength={6}
            required
          />
          <button type="submit" disabled={joining}>
            {joining ? 'Входим…' : 'Войти'}
          </button>
        </form>
        {joinError && <p className="auth-error">{joinError}</p>}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Мои персонажи</h2>
          {newSheetOpen ? (
            <form className="inline-form" onSubmit={handleNewSheet}>
              <input
                type="text"
                value={newSheetName}
                autoFocus
                placeholder="Имя персонажа"
                disabled={creatingSheet}
                onChange={(e) => setNewSheetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNewSheetOpen(false)
                    setNewSheetName('')
                  }
                }}
              />
              <button type="submit" disabled={creatingSheet}>
                {creatingSheet ? 'Создаём…' : 'Создать'}
              </button>
              <button
                type="button"
                disabled={creatingSheet}
                onClick={() => {
                  setNewSheetOpen(false)
                  setNewSheetName('')
                }}
              >
                Отмена
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setNewSheetOpen(true)}>
              Новый персонаж
            </button>
          )}
          <button type="button" disabled={importing} onClick={() => importInputRef.current?.click()}>
            {importing ? 'Импортируем…' : 'Импорт из файла'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportFile(e)}
          />
        </div>
        {sheets === null && !sheetsError && <p>Загрузка…</p>}
        {sheetsError && <p className="auth-error">{sheetsError}</p>}
        {sheets && sheets.length === 0 && <p>Персонажей пока нет.</p>}
        {sheets && sheets.length > 0 && (
          <ul className="card-list">
            {sheets.map((sheet) => (
              <li
                key={sheet.id}
                className="card card-clickable"
                onClick={() => navigate(`/sheet/${sheet.id}`)}
              >
                <strong>{sheet.name}</strong>
                <span className="card-sub-text">
                  {sheet.char_name || 'Без имени персонажа'} · {sheet.char_class || 'без класса'}, уровень{' '}
                  {sheet.char_level}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
