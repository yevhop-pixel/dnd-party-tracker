// Бестиарий и персонажи мира: картотека, которую ведёт ГМ, а видят те, кому
// он разрешил. Одна вкладка на два раздела (монстры / персонажи) — поля у
// них одни и те же, а две вкладки в и без того тесном ряду не нужны.
//
// Набор полей продиктован тем, как картотекой реально пользуются: имя,
// подкласс, фото, локация, описание, особенности, метки. Хиты, КД, скорость и
// характеристики убраны по прямой просьбе ГМа — он их не заполнял, а места
// они занимали больше всего. В базе колонки остались (см. schema.sql).
//
// Поиск и метки появились, когда записей стало столько, что листать список
// глазами перестало быть удобно: строка поиска ищет по всем текстовым полям,
// а метки — свои слова ГМа («нежить», «квест-3»), по которым можно и искать
// (#нежить), и щёлкать прямо на карточке.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// Пределы меток — те же, что в check-ограничении базы (schema.sql), чтобы
// форма не давала набрать то, что база потом отвергнет.
const MAX_TAGS = 20
const MAX_TAG_LENGTH = 32

// Колонки rank, location и tags добавляются отдельными миграциями, а схему в
// Supabase накатывают руками. В окне между выкладкой кода и накатыванием
// записи приходят без этих полей — подставляем значения по умолчанию, иначе
// <select> остаётся без value, а поле ввода на первом же нажатии клавиши
// превращается из неуправляемого в управляемое и теряет введённое.
function rankOf(entry: BestiaryEntry): BestiaryEntry['rank'] {
  return entry.rank ?? 'Обычный'
}

function locationOf(entry: BestiaryEntry): string {
  return entry.location ?? ''
}

function tagsOf(entry: BestiaryEntry): string[] {
  return Array.isArray(entry.tags) ? entry.tags : []
}

function visibilityBadge(entry: BestiaryEntry): { text: string; cls: string } {
  if (entry.visibility === 'all') return { text: '👥 всем', cls: 'bestiary-badge-all' }
  if (entry.visibility === 'chosen') return { text: '👤 выбранным', cls: 'bestiary-badge-chosen' }
  return { text: '🔒 только ГМ', cls: 'bestiary-badge-gm' }
}

// --- Поиск ------------------------------------------------------------------

function fold(s: string): string {
  return s.toLocaleLowerCase('ru').trim()
}

// Метка в том виде, в каком её хранят: без решётки, не длиннее предела.
// Пробелы внутри превращаются в дефис («тёмный лес» → «тёмный-лес»): строка
// поиска режется по пробелам, и метка из двух слов иначе рассыпалась бы на
// два независимых условия. Пустая строка — «метки нет».
function normalizeTag(raw: string): string {
  return raw.replace(/^#+/, '').trim().replace(/\s+/g, '-').slice(0, MAX_TAG_LENGTH)
}

// Запрос режется на слова, и запись должна подойти под КАЖДОЕ: «горт солдат»
// найдёт рыболюдя с острова Горт, который был солдатом. Слово с решёткой
// («#нежить») ищется только среди меток — так, щёлкнув метку на карточке,
// получаешь ровно записи с ней, а не всё, где это слово встречается в тексте.
function searchTokens(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .filter((t) => t.length > 0 && t !== '#')
}

function matchesSearch(entry: BestiaryEntry, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = fold(
    [entry.name, rankOf(entry), locationOf(entry), entry.description, entry.abilities].join('\n'),
  )
  const tags = tagsOf(entry).map(fold)
  return tokens.every((token) => {
    if (token.startsWith('#')) {
      const want = token.slice(1)
      return tags.some((t) => t.includes(want))
    }
    return haystack.includes(token) || tags.some((t) => t.includes(token))
  })
}

// Слова запроса как их набрали (без приведения регистра) — чтобы собрать
// строку обратно после удаления одного слова.
function rawTokens(query: string): string[] {
  return query.split(/\s+/).filter((t) => t.length > 0)
}

// Метка в строке поиска — ровно слово «#метка», а не подстрока: иначе
// «#квест» находился бы внутри «#квест-3», и щелчок по одной плашке
// подсвечивал бы и резал другую.
function tagActiveIn(query: string, tag: string): boolean {
  const want = '#' + fold(tag)
  return rawTokens(query).some((t) => fold(t) === want)
}

// Щелчок по метке добавляет «#метка» в строку поиска, повторный — убирает.
function toggleTagInQuery(query: string, tag: string): string {
  const want = '#' + fold(tag)
  const tokens = rawTokens(query)
  const without = tokens.filter((t) => fold(t) !== want)
  if (without.length !== tokens.length) return without.join(' ')
  return [...tokens, '#' + tag].join(' ')
}

export default function BestiaryPanel({ campaignId, isGm, members }: BestiaryPanelProps) {
  const [kind, setKind] = useState<BestiaryKind>('beast')
  const [entries, setEntries] = useState<BestiaryEntry[] | null>(null)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
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

  const shown = useMemo(() => (entries ?? []).filter((e) => e.kind === kind), [entries, kind])
  const tokens = searchTokens(query)
  // Раскрытая карточка остаётся на экране, даже если перестала подходить под
  // поиск: ГМ переименовывает «Гоблина» при запросе «гоблин» — и на первой
  // же стёртой букве редактор захлопнулся бы посреди набора.
  const filtered = shown.filter((e) => e.id === openId || matchesSearch(e, tokens))
  const current = KINDS.find((k) => k.key === kind) ?? KINDS[0]

  // Все метки раздела, чаще встречающиеся — первыми: это и подсказки в
  // редакторе (чтобы «нежить» не превратилась в «Нежить» и «нежить» разом), и
  // ряд кнопок-фильтров над списком.
  const kindTags = useMemo(() => {
    const counts = new Map<string, { tag: string; n: number }>()
    for (const e of shown) {
      for (const tag of tagsOf(e)) {
        const key = fold(tag)
        const hit = counts.get(key)
        if (hit) hit.n += 1
        else counts.set(key, { tag, n: 1 })
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'ru'))
      .map((x) => x.tag)
  }, [shown])

  const allTags = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries ?? []) {
      for (const tag of tagsOf(e)) {
        const key = fold(tag)
        if (!seen.has(key)) seen.set(key, tag)
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [entries])

  async function handleAdd() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const created = await createEntry(campaignId, kind, name)
      setEntries((prev) => [...(prev ?? []), created])
      setNewName('')
      setAddOpen(false)
      // Сразу раскрываем: следом человек будет заполнять карточку. Поиск
      // сбрасываем, иначе новая карточка может не попасть под фильтр и
      // «исчезнуть» сразу после создания.
      setQuery('')
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

  function tagActive(tag: string): boolean {
    return tagActiveIn(query, tag)
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
              // Поиск — по разделу: чужой запрос в новом разделе встретил бы
              // человека пустым «Ничего не найдено».
              setQuery('')
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

      {/* Поиск показываем, только когда есть в чём искать: пустому разделу
          строка поиска ни к чему. Для игрока он тоже есть — ему показанных
          записей со временем набирается не меньше. */}
      {shown.length > 0 && (
        <div className="bestiary-search">
          <input
            type="search"
            className="bestiary-search-input"
            placeholder="Поиск: имя, локация, описание, #метка"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
            aria-label="Поиск по записям"
          />
          {query && (
            <button type="button" className="bestiary-search-clear" onClick={() => setQuery('')} title="Очистить">
              ×
            </button>
          )}
          {tokens.length > 0 && (
            <span className="bestiary-search-count">
              {filtered.length} из {shown.length}
            </span>
          )}
        </div>
      )}

      {kindTags.length > 0 && (
        <div className="bestiary-tagbar" aria-label="Метки">
          {kindTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`bestiary-tag${tagActive(tag) ? ' bestiary-tag-active' : ''}`}
              onClick={() => setQuery((q) => toggleTagInQuery(q, tag))}
            >
              #{tag}
            </button>
          ))}
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
      {shown.length > 0 && filtered.length === 0 && (
        <p className="card-sub-text">Ничего не найдено по «{query.trim()}».</p>
      )}

      <ul className="bestiary-list">
        {filtered.map((entry) => {
          const open = openId === entry.id
          const badge = visibilityBadge(entry)
          const tags = tagsOf(entry)
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

              {/* Метки — отдельной строкой ПОД шапкой, а не внутри неё: шапка
                  сама кнопка, а кнопка в кнопке — невалидная разметка, и
                  щелчок по метке раскрывал бы карточку вместо фильтра. */}
              {tags.length > 0 && (
                <div className="bestiary-card-tags">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`bestiary-tag${tagActive(tag) ? ' bestiary-tag-active' : ''}`}
                      title="Показать все записи с этой меткой"
                      onClick={() => setQuery((q) => toggleTagInQuery(q, tag))}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {open &&
                (isGm ? (
                  <EntryEditor
                    key={entry.id}
                    entry={entry}
                    members={members}
                    dirty={dirtyRef.current}
                    tagSuggestions={allTags}
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

// --- Метки в редакторе -----------------------------------------------------

interface TagEditorProps {
  id: string
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}

// Ввод меток как в почтовых адресатах: набрал слово, Enter или запятая —
// оно стало плашкой, Backspace в пустом поле снимает последнюю. Подсказки из
// уже существующих меток кампании держат написание единым.
function TagEditor({ id, tags, suggestions, onChange }: TagEditorProps) {
  const [text, setText] = useState('')
  const listId = `bestiary-tags-${id}`

  function addFrom(raw: string) {
    const next = [...tags]
    for (const piece of raw.split(',')) {
      const tag = normalizeTag(piece)
      if (!tag) continue
      if (next.length >= MAX_TAGS) break
      if (next.some((t) => fold(t) === fold(tag))) continue
      next.push(tag)
    }
    setText('')
    if (next.length !== tags.length) onChange(next)
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  const free = suggestions.filter((s) => !tags.some((t) => fold(t) === fold(s)))

  return (
    <div className="bestiary-tags-editor">
      {tags.length > 0 && (
        <div className="bestiary-tags">
          {tags.map((tag) => (
            <span key={tag} className="bestiary-tag bestiary-tag-static">
              #{tag}
              <button
                type="button"
                className="bestiary-tag-remove"
                aria-label={`Убрать метку ${tag}`}
                onClick={() => remove(tag)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        list={listId}
        value={text}
        placeholder={tags.length >= MAX_TAGS ? 'Больше меток нельзя' : 'Метка и Enter (или запятая)'}
        disabled={tags.length >= MAX_TAGS}
        onChange={(e) => {
          const v = e.target.value
          // Запятая — тот же «готово», что и Enter: так можно вставить
          // «нежить, лес, квест-3» одной строкой.
          if (v.includes(',')) addFrom(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addFrom(text)
          } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
            remove(tags[tags.length - 1])
          }
        }}
        onBlur={() => {
          if (text.trim()) addFrom(text)
        }}
      />
      <datalist id={listId}>
        {free.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

// --- Что видит и правит ГМ ------------------------------------------------

interface EntryEditorProps {
  entry: BestiaryEntry
  members: CampaignMemberInfo[]
  dirty: Set<string>
  tagSuggestions: string[]
  onPatch: (patch: Partial<BestiaryEntry>) => void
  onDelete: () => void
}

// Поля, которые правятся текстом с отложенным сохранением.
type TextField = 'name' | 'location' | 'description' | 'abilities'

function EntryEditor({ entry, members, dirty, tagSuggestions, onPatch, onDelete }: EntryEditorProps) {
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
  // Объект в рефе МУТИРУЕТСЯ (Object.assign / delete), а не заменяется:
  // cleanup-функция эффекта ниже держит ссылку на него с момента
  // монтирования, и подмена объекта оставила бы её со старым пустым {}.
  const pending = useRef<Partial<BestiaryEntry>>({})

  // Забрать накопленное и опустошить, не меняя сам объект.
  function takePending(): Partial<BestiaryEntry> {
    const taken = { ...pending.current }
    for (const key of Object.keys(pending.current)) {
      delete (pending.current as Record<string, unknown>)[key]
    }
    return taken
  }

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
      // Теперь дописываем их немедленно. pendingMap — тот же объект, что и
      // pending.current (см. комментарий у рефа), поэтому здесь он свежий.
      Object.values(timerMap).forEach(clearTimeout)
      const rest = { ...pendingMap }
      for (const key of Object.keys(pendingMap)) {
        delete (pendingMap as Record<string, unknown>)[key]
      }
      if (Object.keys(rest).length > 0) {
        void updateEntry(entryId, rest).finally(() => dirty.delete(entryId))
      } else {
        dirty.delete(entryId)
      }
    }
  }, [entryId, dirty])

  function commit(patch: Partial<BestiaryEntry>, key: string) {
    onPatch(patch)
    Object.assign(pending.current, patch)
    const existing = timers.current[key]
    if (existing) clearTimeout(existing)
    timers.current[key] = setTimeout(() => {
      const toSave = takePending()
      // Таймер соседнего поля мог уже увезти всё разом — пустой update
      // PostgREST отвергает, и в карточке зря загоралась бы ошибка.
      if (Object.keys(toSave).length === 0) return
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
          фото, локация, описание, особенности, метки. */}
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

      <div className="field">
        <span>Метки</span>
        <TagEditor
          id={entry.id}
          tags={tagsOf(entry)}
          suggestions={tagSuggestions}
          onChange={(tags) => commit({ tags }, 'tags')}
        />
      </div>

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
