// Бестиарий и персонажи мира: картотека, которую ведёт ГМ, а видят те, кому
// он разрешил. Одна вкладка на два раздела (монстры / персонажи) — поля у
// них одни и те же, а две вкладки в и без того тесном ряду не нужны.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BestiaryEntry, BestiaryKind, BestiaryVisibility } from '../../lib/types'
import { isTableMissing, type CampaignMemberInfo } from '../../lib/api'
import { useLiveSync } from '../../lib/useLiveSync'
import BestiaryImage from './BestiaryImage'
import {
  createEntry,
  deleteEntry,
  forgetImageUrl,
  listEntries,
  listViewers,
  removeImage,
  setViewers,
  updateEntry,
  uploadImage,
} from './bestiaryApi'
import './bestiary.css'

export interface BestiaryPanelProps {
  campaignId: string
  isGm: boolean
  members: CampaignMemberInfo[]
}

const KINDS: { key: BestiaryKind; label: string; empty: string; addLabel: string }[] = [
  { key: 'beast', label: '🐉 Бестиарий', empty: 'Ни одного монстра пока не записано.', addLabel: 'Новый монстр' },
  { key: 'npc', label: '🎭 Персонажи', empty: 'Ни одного персонажа пока не записано.', addLabel: 'Новый персонаж' },
]

const VISIBILITY: { key: BestiaryVisibility; label: string; hint: string }[] = [
  { key: 'gm', label: '🔒 Только я', hint: 'Игроки записи не видят' },
  { key: 'all', label: '👥 Всем', hint: 'Видит вся партия' },
  { key: 'chosen', label: '👤 Выбранным', hint: 'Видят только отмеченные ниже' },
]

// Сколько ждать после последнего нажатия клавиши, прежде чем сохранять.
// Полсекунды — уже не «запрос на каждую букву», но человек ещё не успел
// переключить внимание.
const SAVE_DELAY_MS = 500

function visibilityBadge(entry: BestiaryEntry): { text: string; cls: string } {
  if (entry.visibility === 'all') return { text: '👥 всем', cls: 'bestiary-badge-all' }
  if (entry.visibility === 'chosen') return { text: '👤 выбранным', cls: 'bestiary-badge-chosen' }
  return { text: '🔒 только ГМ', cls: 'bestiary-badge-gm' }
}

export default function BestiaryPanel({ campaignId, isGm, members }: BestiaryPanelProps) {
  const [kind, setKind] = useState<BestiaryKind>('beast')
  const [entries, setEntries] = useState<BestiaryEntry[] | null>(null)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelledRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const rows = await listEntries(campaignId)
      if (!cancelledRef.current) {
        setEntries(rows)
        setError('')
        setNotReady(false)
      }
    } catch (err) {
      if (cancelledRef.current) return
      if (isTableMissing(err)) {
        setNotReady(true)
        setEntries([])
        setError('')
        return
      }
      setError(err instanceof Error ? err.message : 'Не удалось загрузить бестиарий')
    }
  }, [campaignId])

  useEffect(() => {
    cancelledRef.current = false
    setEntries(null)
    void load()
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  // Realtime у бестиария нет намеренно (payload postgres_changes не проходит
  // RLS, а в строке лежат хиты монстра) — свежесть даёт перечитывание по
  // таймеру. Для картотеки, которая меняется раз в сессию, этого с запасом.
  useLiveSync(() => void load())

  const shown = (entries ?? []).filter((e) => e.kind === kind)
  const current = KINDS.find((k) => k.key === kind) ?? KINDS[0]

  async function handleAdd() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const created = await createEntry(campaignId, kind, name)
      setEntries((prev) => [...(prev ?? []), created])
      setNewName('')
      setAddOpen(false)
      // Сразу раскрываем: следом человек будет заполнять карточку, а не
      // смотреть на строчку в списке.
      setOpenId(created.id)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать запись')
    } finally {
      setBusy(false)
    }
  }

  function patchLocal(id: string, patch: Partial<BestiaryEntry>) {
    setEntries((prev) => (prev ? prev.map((e) => (e.id === id ? { ...e, ...patch } : e)) : prev))
  }

  async function handleDelete(entry: BestiaryEntry) {
    if (!window.confirm('Удалить «' + entry.name + '» насовсем?')) return
    try {
      await deleteEntry(entry)
      setEntries((prev) => (prev ? prev.filter((e) => e.id !== entry.id) : prev))
      if (openId === entry.id) setOpenId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить запись')
    }
  }

  return (
    <section className="bestiary sheet-section">
      <div className="bestiary-kinds">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`quick-chip${kind === k.key ? ' quick-chip-active' : ''}`}
            onClick={() => {
              setKind(k.key)
              setOpenId(null)
              setAddOpen(false)
            }}
          >
            {k.label}
          </button>
        ))}
        {isGm && (
          <button
            type="button"
            className="tab-add-toggle bestiary-add-toggle"
            title={addOpen ? 'Закрыть форму' : current.addLabel}
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? '×' : '+'}
          </button>
        )}
      </div>

      {isGm && addOpen && (
        <div className="bestiary-add">
          <input
            type="text"
            placeholder={current.addLabel}
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd()
              if (e.key === 'Escape') setAddOpen(false)
            }}
          />
          <button type="button" disabled={busy || !newName.trim()} onClick={() => void handleAdd()}>
            Добавить
          </button>
        </div>
      )}

      {notReady && (
        <p className="card-sub-text">
          Бестиарий ещё не включён в базе — раздел заработает сразу, как только владелец выполнит
          обновление схемы.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {entries === null && !error && <p className="card-sub-text">Загрузка…</p>}
      {entries !== null && !notReady && shown.length === 0 && (
        <p className="card-sub-text">
          {current.empty}
          {!isGm && ' Возможно, ГМ ещё ничего вам не открыл.'}
        </p>
      )}

      <ul className="bestiary-list">
        {shown.map((entry) => {
          const open = openId === entry.id
          const badge = visibilityBadge(entry)
          return (
            <li key={entry.id} className={`bestiary-card${open ? ' bestiary-card-open' : ''}`}>
              <button
                type="button"
                className="bestiary-card-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : entry.id)}
              >
                <BestiaryImage path={entry.image_path} name={entry.name} />
                <span className="bestiary-card-title">
                  <strong>{entry.name}</strong>
                  {entry.subtitle && <span className="bestiary-card-sub">{entry.subtitle}</span>}
                </span>
                <span className="bestiary-card-meta">
                  {/* Игроку метка видимости не нужна: он и так видит только
                      показанное ему, а «только ГМ» до него не доезжает. */}
                  {isGm && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
                  {entry.hp !== null && <span className="badge">♥ {entry.hp}</span>}
                  {entry.ac !== null && <span className="badge">🛡 {entry.ac}</span>}
                  <span className="bestiary-caret">{open ? '▴' : '▾'}</span>
                </span>
              </button>

              {open &&
                (isGm ? (
                  <EntryEditor
                    entry={entry}
                    members={members}
                    onPatch={(patch) => patchLocal(entry.id, patch)}
                    onDelete={() => void handleDelete(entry)}
                  />
                ) : (
                  <EntryView entry={entry} />
                ))}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// --- Что видит игрок ------------------------------------------------------

function EntryView({ entry }: { entry: BestiaryEntry }) {
  const rows = [
    { label: 'Скорость', value: entry.speed },
    { label: 'Характеристики', value: entry.stats },
    { label: 'Способности', value: entry.abilities },
    { label: 'Добыча', value: entry.loot },
  ].filter((r) => r.value.trim())

  return (
    <div className="bestiary-body">
      {entry.image_path && <BestiaryImage path={entry.image_path} name={entry.name} variant="full" />}
      {entry.description.trim() && <p className="bestiary-description">{entry.description}</p>}
      {rows.map((r) => (
        <p key={r.label} className="bestiary-row">
          <span className="bestiary-row-label">{r.label}</span> {r.value}
        </p>
      ))}
      {rows.length === 0 && !entry.description.trim() && (
        <p className="card-sub-text">ГМ пока не записал подробностей.</p>
      )}
    </div>
  )
}

// --- Что видит и правит ГМ ------------------------------------------------

interface EntryEditorProps {
  entry: BestiaryEntry
  members: CampaignMemberInfo[]
  onPatch: (patch: Partial<BestiaryEntry>) => void
  onDelete: () => void
}

function EntryEditor({ entry, members, onPatch, onDelete }: EntryEditorProps) {
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  // Кому показано — грузится при раскрытии карточки: список нужен только ГМу
  // и только здесь, тащить его вместе со всем бестиарием незачем.
  const [viewers, setViewersState] = useState<string[] | null>(null)
  // Таймеры отложенного сохранения живут по полю: правка описания не должна
  // отменять ещё не ушедшее сохранение имени.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    let cancelled = false
    if (entry.visibility !== 'chosen') {
      setViewersState(null)
      return
    }
    listViewers(entry.id)
      .then((ids) => {
        if (!cancelled) setViewersState(ids)
      })
      .catch((err) => {
        if (!cancelled) setSaveError(err instanceof Error ? err.message : 'Не удалось прочитать список')
      })
    return () => {
      cancelled = true
    }
  }, [entry.id, entry.visibility])

  useEffect(() => {
    const map = timers.current
    // Карточку свернули, не дождавшись отложенного сохранения — дописываем
    // сразу, иначе последняя буква пропала бы.
    return () => {
      Object.values(map).forEach(clearTimeout)
    }
  }, [])

  function save(field: keyof BestiaryEntry, value: string | number | null) {
    onPatch({ [field]: value } as Partial<BestiaryEntry>)
    const existing = timers.current[field as string]
    if (existing) clearTimeout(existing)
    timers.current[field as string] = setTimeout(() => {
      updateEntry(entry.id, { [field]: value } as Partial<BestiaryEntry>)
        .then(() => setSaveError(''))
        .catch((err) => setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить'))
    }, SAVE_DELAY_MS)
  }

  // Число или пусто: «0 хитов» и «не заполняли» — разные вещи, поэтому
  // пустая строка уезжает в базу как null, а не как ноль.
  function saveNumber(field: 'hp' | 'ac', raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      save(field, null)
      return
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value)) return
    save(field, Math.round(value))
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setSaveError('')
    const previous = entry.image_path
    try {
      const path = await uploadImage(entry.campaign_id, file)
      await updateEntry(entry.id, { image_path: path })
      onPatch({ image_path: path })
      // Старый файл убираем только после того, как новый прописан в записи:
      // иначе при падении апдейта картотека осталась бы вообще без картинки.
      if (previous) {
        forgetImageUrl(previous)
        await removeImage(previous).catch(() => {})
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось загрузить картинку')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveImage() {
    const path = entry.image_path
    if (!path) return
    try {
      await updateEntry(entry.id, { image_path: null })
      onPatch({ image_path: null })
      forgetImageUrl(path)
      await removeImage(path).catch(() => {})
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось убрать картинку')
    }
  }

  async function toggleViewer(userId: string) {
    const before = viewers ?? []
    const next = before.includes(userId) ? before.filter((id) => id !== userId) : [...before, userId]
    setViewersState(next)
    try {
      await setViewers(entry.id, next)
      setSaveError('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить список')
      // Откатываем: иначе на экране галочка стоит, а видимости нет.
      setViewersState(before)
    }
  }

  const players = members.filter((m) => m.role !== 'gm')

  return (
    <div className="bestiary-body">
      <div className="bestiary-picture">
        {entry.image_path ? (
          <BestiaryImage path={entry.image_path} name={entry.name} variant="full" />
        ) : (
          <p className="card-sub-text">Картинки нет</p>
        )}
        <div className="bestiary-picture-actions">
          <label className="bestiary-upload">
            {uploading ? 'Загружаем…' : entry.image_path ? 'Заменить картинку' : 'Добавить картинку'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => {
                void handleFile(e.target.files?.[0])
                // Сброс, иначе повторный выбор того же файла не даст события.
                e.target.value = ''
              }}
            />
          </label>
          {entry.image_path && (
            <button type="button" className="bestiary-remove-image" onClick={() => void handleRemoveImage()}>
              Убрать
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>Имя</span>
        <input type="text" value={entry.name} onChange={(e) => save('name', e.target.value)} />
      </label>
      <label className="field">
        <span>Подпись</span>
        <input
          type="text"
          placeholder="Молодой белый дракон, хаотично-злой"
          value={entry.subtitle}
          onChange={(e) => save('subtitle', e.target.value)}
        />
      </label>

      <div className="bestiary-numbers">
        <label className="field">
          <span>Хиты</span>
          <input
            type="number"
            inputMode="numeric"
            value={entry.hp ?? ''}
            onChange={(e) => saveNumber('hp', e.target.value)}
          />
        </label>
        <label className="field">
          <span>КД</span>
          <input
            type="number"
            inputMode="numeric"
            value={entry.ac ?? ''}
            onChange={(e) => saveNumber('ac', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Скорость</span>
          <input
            type="text"
            placeholder="9 м, полёт 24 м"
            value={entry.speed}
            onChange={(e) => save('speed', e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Характеристики</span>
        <input
          type="text"
          placeholder="СИЛ 18 ЛОВ 10 ТЕЛ 17 ИНТ 8 МДР 11 ХАР 12"
          value={entry.stats}
          onChange={(e) => save('stats', e.target.value)}
        />
      </label>
      <label className="field">
        <span>Способности и атаки</span>
        <textarea
          className="auto-textarea"
          rows={3}
          value={entry.abilities}
          onChange={(e) => save('abilities', e.target.value)}
        />
      </label>
      <label className="field">
        <span>Описание</span>
        <textarea
          className="auto-textarea"
          rows={3}
          value={entry.description}
          onChange={(e) => save('description', e.target.value)}
        />
      </label>
      <label className="field">
        <span>Добыча</span>
        <input type="text" value={entry.loot} onChange={(e) => save('loot', e.target.value)} />
      </label>

      <div className="bestiary-visibility">
        <span className="bestiary-visibility-title">Кому показывать</span>
        <div className="bestiary-visibility-row">
          {VISIBILITY.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.hint}
              className={`quick-chip${entry.visibility === v.key ? ' quick-chip-active' : ''}`}
              onClick={() => save('visibility', v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {entry.visibility === 'chosen' && (
          <div className="bestiary-viewers">
            {players.length === 0 && <p className="card-sub-text">В кампании пока нет игроков.</p>}
            {players.map((m) => (
              <label key={m.id} className="bestiary-viewer">
                <input
                  type="checkbox"
                  checked={(viewers ?? []).includes(m.id)}
                  disabled={viewers === null}
                  onChange={() => void toggleViewer(m.id)}
                />
                {m.name}
              </label>
            ))}
            {viewers !== null && viewers.length === 0 && players.length > 0 && (
              <p className="card-sub-text">Никто не отмечен — запись пока не видит никто, кроме вас.</p>
            )}
          </div>
        )}
      </div>

      {saveError && <p className="auth-error">{saveError}</p>}

      <button type="button" className="bestiary-delete" onClick={onDelete}>
        Удалить запись
      </button>
    </div>
  )
}
