// Бестиарий и персонажи мира: картотека, которую ведёт ГМ, а видят те, кому
// он разрешил. Одна вкладка на два раздела (монстры / персонажи) — поля у
// них одни и те же, а две вкладки в и без того тесном ряду не нужны.
//
// Набор полей продиктован тем, как картотекой реально пользуются: имя,
// подкласс, фото, локация, описание, особенности. Хиты, КД, скорость и
// характеристики убраны по прямой просьбе ГМа — он их не заполнял, а места
// они занимали больше всего. В базе колонки остались (см. schema.sql).
import { useCallback, useEffect, useRef, useState } from 'react'
import { BESTIARY_RANKS, type BestiaryEntry, type BestiaryKind, type BestiaryVisibility } from '../../lib/types'
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
const SAVE_DELAY_MS = 600

// Колонки rank и location добавляются отдельной миграцией, а схему в Supabase
// накатывают руками. В окне между выкладкой кода и накатыванием записи
// приходят без этих полей — подставляем значения по умолчанию, иначе <select>
// остаётся без value, а поле ввода на первом же нажатии клавиши превращается
// из неуправляемого в управляемое и теряет введённое.
function rankOf(entry: BestiaryEntry): BestiaryEntry['rank'] {
  return entry.rank ?? 'Обычный'
}

function locationOf(entry: BestiaryEntry): string {
  return entry.location ?? ''
}

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
  // Записи, которые прямо сейчас правят и чьи изменения могли ещё не доехать
  // до базы. Перечитывание по таймеру обязано их не трогать — иначе ответ
  // сервера со старым текстом затирает то, что человек набирает. Ровно на это
  // и жаловался ГМ: «слово пропадает во время набора, нужно переписывать».
  const dirtyRef = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const rows = await listEntries(campaignId)
      if (cancelledRef.current) return
      setEntries((prev) => {
        if (!prev) return rows
        // Строку, которую правят, оставляем свою.
        return rows.map((row) => (dirtyRef.current.has(row.id) ? (prev.find((p) => p.id === row.id) ?? row) : row))
      })
      setError('')
      setNotReady(false)
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
  // RLS, а в записи лежит то, что игрокам видеть рано) — свежесть даёт
  // перечитывание по таймеру.
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
      // Сразу раскрываем: следом человек будет заполнять карточку.
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
      dirtyRef.current.delete(entry.id)
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
                  <span className="bestiary-card-sub">
                    {rankOf(entry)}
                    {locationOf(entry) && ` · ${locationOf(entry)}`}
                  </span>
                </span>
                <span className="bestiary-card-meta">
                  {/* Игроку метка видимости не нужна: он и так видит только
                      показанное ему, а «только ГМ» до него не доезжает. */}
                  {isGm && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
                  <span className="bestiary-caret">{open ? '▴' : '▾'}</span>
                </span>
              </button>

              {open &&
                (isGm ? (
                  <EntryEditor
                    key={entry.id}
                    entry={entry}
                    members={members}
                    dirty={dirtyRef.current}
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

// --- Описание с раскрытием ------------------------------------------------

// Описание — самое важное в карточке, но целиком оно бывает на экран. Держим
// его в пять строк с кнопкой «Показать полностью»: сразу видно суть, а
// длинный текст не давит и не заставляет листать всю карточку.
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  const [clipped, setClipped] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Кнопку показываем, только если текст реально не поместился.
    setClipped(el.scrollHeight > el.clientHeight + 2)
  }, [text])

  return (
    <div className="bestiary-description-wrap">
      <p ref={ref} className={`bestiary-description${expanded ? '' : ' bestiary-description-clamped'}`}>
        {text}
      </p>
      {(clipped || expanded) && (
        <button type="button" className="bestiary-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </div>
  )
}

// --- Что видит игрок ------------------------------------------------------

function EntryView({ entry }: { entry: BestiaryEntry }) {
  const hasAnything = entry.description.trim() || entry.abilities.trim() || entry.image_path

  return (
    <div className="bestiary-body">
      {entry.image_path && <BestiaryImage path={entry.image_path} name={entry.name} variant="full" />}
      {entry.description.trim() && <Description text={entry.description} />}
      {entry.abilities.trim() && (
        <div className="bestiary-block">
          <span className="bestiary-row-label">Особенности</span>
          <p className="bestiary-row">{entry.abilities}</p>
        </div>
      )}
      {!hasAnything && <p className="card-sub-text">ГМ пока не записал подробностей.</p>}
    </div>
  )
}

// --- Что видит и правит ГМ ------------------------------------------------

interface EntryEditorProps {
  entry: BestiaryEntry
  members: CampaignMemberInfo[]
  dirty: Set<string>
  onPatch: (patch: Partial<BestiaryEntry>) => void
  onDelete: () => void
}

// Поля, которые правятся текстом с отложенным сохранением.
type TextField = 'name' | 'location' | 'description' | 'abilities'

function EntryEditor({ entry, members, dirty, onPatch, onDelete }: EntryEditorProps) {
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [viewers, setViewersState] = useState<string[] | null>(null)
  // Черновик — единственный источник правды для полей ввода, пока карточка
  // открыта. Раньше поля читали прямо из entry, и любое перечитывание списка
  // (раз в 20 секунд) подсовывало им серверный текст поверх набираемого:
  // слово исчезало на полуслове. Сюда сервер не достаёт.
  const [draft, setDraft] = useState({
    name: entry.name,
    location: locationOf(entry),
    description: entry.description,
    abilities: entry.abilities,
  })
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Что ещё не доехало до базы — чтобы дописать это при закрытии карточки.
  const pending = useRef<Partial<BestiaryEntry>>({})

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

  const entryId = entry.id
  useEffect(() => {
    dirty.add(entryId)
    const timerMap = timers.current
    const pendingMap = pending.current
    return () => {
      // Карточку свернули, не дождавшись отложенного сохранения. Раньше
      // таймеры просто гасились — и последние набранные буквы пропадали.
      // Теперь дописываем их немедленно.
      Object.values(timerMap).forEach(clearTimeout)
      const rest = { ...pendingMap }
      if (Object.keys(rest).length > 0) {
        void updateEntry(entryId, rest).finally(() => dirty.delete(entryId))
      } else {
        dirty.delete(entryId)
      }
    }
  }, [entryId, dirty])

  function commit(patch: Partial<BestiaryEntry>, key: string) {
    onPatch(patch)
    pending.current = { ...pending.current, ...patch }
    const existing = timers.current[key]
    if (existing) clearTimeout(existing)
    timers.current[key] = setTimeout(() => {
      const toSave = pending.current
      pending.current = {}
      updateEntry(entry.id, toSave)
        .then(() => setSaveError(''))
        .catch((err) => setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить'))
    }, SAVE_DELAY_MS)
  }

  function editText(field: TextField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
    commit({ [field]: value } as Partial<BestiaryEntry>, field)
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
      // Старый файл убираем только после того, как новый прописан в записи.
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
      setViewersState(before)
    }
  }

  const players = members.filter((m) => m.role !== 'gm')

  return (
    <div className="bestiary-body">
      {/* Порядок полей ровно тот, в котором карточку читают: имя, подкласс,
          фото, локация, описание, особенности. */}
      <label className="field">
        <span>Имя</span>
        <input type="text" value={draft.name} onChange={(e) => editText('name', e.target.value)} />
      </label>

      <label className="field">
        <span>Подкласс</span>
        <select
          className="bestiary-select"
          value={rankOf(entry)}
          onChange={(e) => commit({ rank: e.target.value as BestiaryEntry['rank'] }, 'rank')}
        >
          {BESTIARY_RANKS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

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
        <span>Локация</span>
        <input
          type="text"
          placeholder="Остров Горт"
          value={draft.location}
          onChange={(e) => editText('location', e.target.value)}
        />
      </label>

      <label className="field">
        <span>Описание</span>
        <textarea
          className="bestiary-textarea"
          rows={8}
          value={draft.description}
          onChange={(e) => editText('description', e.target.value)}
        />
      </label>

      <label className="field">
        <span>Особенности</span>
        <textarea
          className="bestiary-textarea"
          rows={5}
          value={draft.abilities}
          onChange={(e) => editText('abilities', e.target.value)}
        />
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
              onClick={() => commit({ visibility: v.key }, 'visibility')}
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
