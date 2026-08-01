import { useCallback, useEffect, useRef, useState } from 'react'
import { getNote, upsertNote } from './notesApi'
import './notes.css'

interface GmNoteBoxProps {
  campaignId: string
  subjectUserId: string
  subjectName: string
}

// Автосохранение заметки не должно бомбить сервер на каждое нажатие клавиши —
// копим правку и отправляем одним запросом раз в SAVE_DEBOUNCE_MS (тот же
// приём, что и в SheetEditor/useDebouncedPatches).
const SAVE_DEBOUNCE_MS = 800

// Приватная заметка ГМа об игроке — свёрнутый по умолчанию блок над листом
// персонажа. Видит и правит только ГМ (обеспечено RLS на gm_note), поэтому
// клиент здесь ничего не проверяет.
export default function GmNoteBox({ campaignId, subjectUserId, subjectName }: GmNoteBoxProps) {
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // null = нет несохранённых изменений; иначе — последний ещё не отправленный текст.
  const pendingBody = useRef<string | null>(null)

  // Загрузка заметки при смене субъекта (в GmView компонент в любом случае
  // размонтируется/монтируется заново при переключении между игроками —
  // список персонажей стоит между открытыми листами).
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setLoadError('')
    setSaveState('idle')
    ;(async () => {
      try {
        const note = await getNote(campaignId, subjectUserId)
        if (cancelled) return
        setBody(note?.body ?? '')
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить заметку')
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [campaignId, subjectUserId])

  const flushSave = useCallback(() => {
    if (pendingBody.current === null) return
    const toSave = pendingBody.current
    pendingBody.current = null
    setSaveState('saving')
    upsertNote(campaignId, subjectUserId, toSave)
      .then(() => setSaveState('saved'))
      .catch(() => {
        // Если за время запроса пользователь успел напечатать ещё — не затираем
        // более свежую правку, вернём в очередь только если ничего не набрали.
        if (pendingBody.current === null) pendingBody.current = toSave
        setSaveState('error')
      })
  }, [campaignId, subjectUserId])

  // При уходе со страницы/размонтировании (смена игрока) несохранённая правка
  // не должна пропасть — отправляем немедленно, не дожидаясь debounce.
  useEffect(() => {
    const flushNow = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pendingBody.current === null) return
      const toSave = pendingBody.current
      pendingBody.current = null
      void upsertNote(campaignId, subjectUserId, toSave)
    }
    window.addEventListener('pagehide', flushNow)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      flushNow()
    }
  }, [campaignId, subjectUserId])

  function handleChange(value: string) {
    setBody(value)
    pendingBody.current = value
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }

  return (
    <div className="gm-note-box">
      <button type="button" className="gm-note-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>📝 Заметка ГМа о {subjectName}</span>
        <span className="gm-note-toggle-arrow">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="gm-note-body">
          {loadError && <p className="auth-error">{loadError}</p>}
          <textarea
            className="gm-note-textarea"
            value={body}
            disabled={!loaded}
            placeholder="Заметки, наблюдения, планы по этому игроку…"
            onChange={(e) => handleChange(e.target.value)}
          />
          <div className="gm-note-footer">
            <span className="gm-note-hint">Видно только вам</span>
            <span className={`gm-note-save-indicator${saveState === 'error' ? ' gm-note-save-error' : ''}`}>
              {saveState === 'saving'
                ? 'Сохранение…'
                : saveState === 'saved'
                  ? 'Сохранено'
                  : saveState === 'error'
                    ? 'Ошибка сохранения — проверьте сеть'
                    : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
