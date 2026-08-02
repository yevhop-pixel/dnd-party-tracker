import { useEffect, useState, type FormEvent } from 'react'
import type { CharacterSheet, InitiativeEntry } from '../../lib/types'
import {
  addEntry,
  clearAll,
  deleteEntry,
  getCombatRound,
  listEntries,
  setCombatRound,
  setCurrent,
  setMyInitiative,
  subscribeToCombatRound,
  subscribeToInitiative,
  updateEntry,
} from './initiativeApi'
import { listPartyStatus, type PartyStatus } from '../../lib/api'
import { submitCheckRoll } from '../dice/diceApi'
import './initiative.css'

export interface InitiativeTrackerProps {
  campaignId: string
  isGm: boolean
  // Все листы кампании — есть только у ГМа (RLS), нужны для «кинуть за всех».
  sheets?: CharacterSheet[]
  // Лист текущего игрока — чтобы он мог бросить инициативу за себя.
  mySheet?: CharacterSheet | null
}

// initiative desc, created_at asc — тот же порядок, что и listEntries,
// пересчитываем на клиенте после инлайн-правки числа (не ждём round-trip
// в базу и обратно через realtime только ради пересортировки).
function sortEntries(list: InitiativeEntry[]): InitiativeEntry[] {
  return [...list].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// ХП персонажей партии видно всем — обновление приходит не через realtime
// (события character_sheet чужих листов игроку не доезжают, их режет RLS),
// а перечитыванием party_status: по каждому событию боя и раз в POLL_MS,
// пока бой идёт. Пятнадцати секунд за столом хватает.
const POLL_MS = 15000

export default function InitiativeTracker({ campaignId, isGm, sheets, mySheet }: InitiativeTrackerProps) {
  const [entries, setEntries] = useState<InitiativeEntry[]>([])
  const [party, setParty] = useState<PartyStatus[]>([])
  const [round, setRound] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newInitiative, setNewInitiative] = useState('')
  const [newHp, setNewHp] = useState('')
  const [newAc, setNewAc] = useState('')
  const [busy, setBusy] = useState(false)

  // Передача хода в полёте — иначе двойной клик по «Ход →» пропускает бойца:
  // второй обработчик читает ещё не обновлённый список.
  const [turnBusy, setTurnBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')

    function reloadEntries() {
      listEntries(campaignId)
        .then((data) => setEntries(sortEntries(data)))
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить бой'))
        .finally(() => setLoading(false))
      listPartyStatus(campaignId)
        .then(setParty)
        .catch(() => {
          /* без статусов партии трекер работает, просто без ХП союзников */
        })
    }

    function reloadRound() {
      getCombatRound(campaignId)
        .then(setRound)
        // Не сбрасываем номер в 0 при разовой сетевой ошибке: «Бой не начат»
        // посреди четвёртого раунда — хуже, чем слегка устаревшее число.
        .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось прочитать номер раунда'))
    }

    reloadEntries()
    reloadRound()
    // onResync = reload: после обрыва канала и переподключения могли уйти
    // события, поэтому перечитываем список целиком.
    const offEntries = subscribeToInitiative(campaignId, reloadEntries, reloadEntries)
    const offRound = subscribeToCombatRound(campaignId, reloadRound)
    return () => {
      offEntries()
      offRound()
    }
  }, [campaignId])

  // Опрос ХП союзников — только пока бой реально идёт.
  useEffect(() => {
    if (entries.length === 0) return
    const id = window.setInterval(() => {
      listPartyStatus(campaignId)
        .then(setParty)
        .catch(() => {})
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [campaignId, entries.length])

  const currentEntry = entries.find((e) => e.is_current) ?? null

  // Звук и всплывашка «твой ход» живут в TurnWatcher уровня кампании — здесь
  // их быть не должно, иначе сигнал получит только тот, кто и так открыл эту
  // вкладку, и повторится на каждом возврате на неё.

  function statusOf(entry: InitiativeEntry): PartyStatus | null {
    if (!entry.character_id) return null
    return party.find((p) => p.character_id === entry.character_id) ?? null
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError('')
    try {
      const created = await addEntry(campaignId, name, Number(newInitiative) || 0)
      // ХП/КД проставляем вторым запросом: addEntry общий и для персонажей,
      // у которых этих полей быть не должно.
      const hp = Number(newHp)
      const ac = Number(newAc)
      const patch: Partial<InitiativeEntry> = {}
      if (newHp.trim() && Number.isFinite(hp)) {
        patch.hp_current = hp
        patch.hp_max = hp
      }
      if (newAc.trim() && Number.isFinite(ac)) patch.ac = ac
      const final = Object.keys(patch).length ? await updateEntry(created.id, patch) : created
      setEntries((prev) => sortEntries([...prev, final]))
      setNewName('')
      setNewInitiative('')
      setNewHp('')
      setNewAc('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddAllCharacters() {
    if (!sheets || sheets.length === 0) return
    setBusy(true)
    setError('')
    try {
      // Не дублируем персонажей, уже стоящих в бою.
      const existingCharIds = new Set(entries.map((e) => e.character_id).filter((id): id is string => id !== null))
      const toAdd = sheets.filter((s) => !existingCharIds.has(s.id))
      const created = await Promise.all(
        toAdd.map((s) => addEntry(campaignId, s.char_name || s.name, s.initiative, s.id)),
      )
      setEntries((prev) => sortEntries([...prev, ...created]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить персонажей')
    } finally {
      setBusy(false)
    }
  }

  // ГМ кидает инициативу за весь стол разом: персонажам — 1d20 с их
  // модификатором из листа, монстрам — чистый 1d20. Каждый бросок уходит и в
  // общую ленту, чтобы никто не считал, что ГМ подкрутил.
  async function handleRollForAll() {
    if (entries.length === 0) return
    setBusy(true)
    setError('')
    // Цикл не транзакционный: если оборвётся на середине, часть стола
    // останется со старой инициативой. Поэтому имя бойца, на котором встали,
    // попадает в текст ошибки, а список перечитывается в любом случае —
    // иначе ГМ видит фальшивый порядок и не знает, где именно оборвалось.
    let stoppedAt: string | null = null
    try {
      for (const entry of entries) {
        stoppedAt = entry.name
        const sheet = entry.character_id ? sheets?.find((s) => s.id === entry.character_id) : undefined
        const modifier = sheet?.initiative ?? 0
        const roll = await submitCheckRoll(campaignId, entry.character_id, `Инициатива: ${entry.name}`, modifier)
        await updateEntry(entry.id, { initiative: roll.total })
      }
      stoppedAt = null
    } catch (err) {
      const base = err instanceof Error ? err.message : 'Не удалось бросить инициативу'
      setError(stoppedAt ? `${base} (оборвалось на «${stoppedAt}», часть бойцов со старой инициативой)` : base)
    } finally {
      try {
        setEntries(sortEntries(await listEntries(campaignId)))
      } catch {
        /* список перечитается по realtime-событию */
      }
      setBusy(false)
    }
  }

  // Игрок кидает за себя: бросок уходит в ленту, число — в его запись боя
  // (её заведёт сама функция set_my_initiative, если игрока ещё нет в бою).
  async function handleRollMine() {
    if (!mySheet) return
    setBusy(true)
    setError('')
    try {
      const roll = await submitCheckRoll(campaignId, mySheet.id, 'Инициатива', mySheet.initiative)
      await setMyInitiative(campaignId, roll.total)
      setEntries(sortEntries(await listEntries(campaignId)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось бросить инициативу')
    } finally {
      setBusy(false)
    }
  }

  // Значение числа меняем локально при каждом нажатии, в базу отправляем
  // только по onBlur (commitInitiative) — иначе на каждый символ ушёл бы
  // отдельный update.
  function handleInitiativeInput(id: string, value: string) {
    const num = Number(value)
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, initiative: Number.isFinite(num) ? num : e.initiative } : e)),
    )
  }

  async function commitInitiative(entry: InitiativeEntry) {
    try {
      await updateEntry(entry.id, { initiative: entry.initiative })
      setEntries((prev) => sortEntries(prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить инициативу')
    }
  }

  // Урон/лечение монстра прямо в строке. У персонажей ХП живут в листе —
  // их правит сам игрок своей плашкой ХП, отсюда не трогаем.
  async function stepMonsterHp(entry: InitiativeEntry, delta: number) {
    const max = entry.hp_max ?? 0
    const next = Math.max(0, Math.min(max || Number.MAX_SAFE_INTEGER, (entry.hp_current ?? 0) + delta))
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, hp_current: next } : e)))
    try {
      await updateEntry(entry.id, { hp_current: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить ХП')
    }
  }

  async function handleDelete(entry: InitiativeEntry) {
    setError('')
    // Убили того, чей ход — ход сразу уходит следующему, иначе очередь
    // «теряется»: следующее нажатие «Ход →» прыгнет в начало списка и
    // остальные бойцы пропустят раунд.
    const rest = entries.filter((e) => e.id !== entry.id)
    const passTo = entry.is_current && rest.length > 0 ? rest[entries.findIndex((e) => e.id === entry.id) % rest.length] : null
    try {
      await deleteEntry(entry.id)
      setEntries(rest)
      if (passTo) {
        await setCurrent(passTo.id, campaignId)
        setEntries(rest.map((e) => ({ ...e, is_current: e.id === passTo.id })))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить запись')
    }
  }

  // Следующий ход по кругу считаем на уже отсортированном клиентском
  // списке: если ни у кого нет is_current — начинаем с первого (самая
  // высокая инициатива), иначе передаём следующему за текущим бойцом.
  // Возврат к первому = новый раунд.
  async function handleNextTurn() {
    if (entries.length === 0 || turnBusy) return
    setError('')
    setTurnBusy(true)
    const currentIndex = entries.findIndex((e) => e.is_current)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % entries.length
    const nextEntry = entries[nextIndex]
    // Раунд растёт ТОЛЬКО когда ход ушёл с последнего бойца на первого.
    // Раньше условием было «текущего нет» — но текущего нет и когда ГМ удалил
    // умершего монстра, и тогда раунд накручивался лишний раз.
    const wrapped = currentIndex === entries.length - 1 && nextIndex === 0
    const starting = currentIndex === -1 && round === 0
    try {
      await setCurrent(nextEntry.id, campaignId)
      setEntries((prev) => prev.map((e) => ({ ...e, is_current: e.id === nextEntry.id })))
      if (wrapped || starting) {
        const nextRound = round + 1
        // setRound только ПОСЛЕ успешной записи: иначе у ГМа на экране один
        // раунд, у всех остальных другой, и разойдётся навсегда.
        await setCombatRound(campaignId, nextRound)
        setRound(nextRound)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось передать ход')
    } finally {
      setTurnBusy(false)
    }
  }

  async function handleReset() {
    if (!window.confirm('Сбросить бой? Все записи инициативы будут удалены.')) return
    setError('')
    try {
      await clearAll(campaignId)
      setEntries([])
      setRound(0)
      await setCombatRound(campaignId, 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить бой')
    }
  }

  if (loading) return <p>Загрузка…</p>

  const myTurn = !!(mySheet && currentEntry && currentEntry.character_id === mySheet.id)

  return (
    <div className="initiative-tracker">
      {error && <p className="auth-error">{error}</p>}

      <div className="initiative-head">
        <span className="initiative-round">{round > 0 ? `Раунд ${round}` : 'Бой не начат'}</span>
        {currentEntry && <span className="initiative-turn-of">Ход: {currentEntry.name}</span>}
        {myTurn && <span className="initiative-your-turn">Твой ход!</span>}
        {!isGm && mySheet && (
          <button type="button" className="initiative-roll-btn" disabled={busy} onClick={() => void handleRollMine()}>
            🎲 Бросить инициативу
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="card-sub-text">Бой не начат.</p>
      ) : (
        <ul className="card-list">
          {entries.map((entry) => {
            const status = statusOf(entry)
            const hpNow = status ? status.hp_current : entry.hp_current
            const hpMax = status ? status.hp_max : entry.hp_max
            const ac = status ? status.armor_class : entry.ac
            const percent = hpMax && hpMax > 0 ? Math.max(0, Math.min(100, ((hpNow ?? 0) / hpMax) * 100)) : null
            return (
              <li key={entry.id} className={`card${entry.is_current ? ' initiative-current' : ''}`}>
                <div className="card-main">
                  <span className="initiative-name">
                    {entry.is_current && <span className="initiative-current-mark">▶</span>}
                    {entry.name}
                  </span>
                  {isGm ? (
                    <input
                      type="number"
                      className="initiative-input"
                      value={entry.initiative}
                      onChange={(e) => handleInitiativeInput(entry.id, e.target.value)}
                      onBlur={() => void commitInitiative(entry)}
                    />
                  ) : (
                    <span className="badge">{entry.initiative}</span>
                  )}
                </div>

                {(hpMax !== null || ac !== null || (isGm && !entry.character_id)) && (
                  <div className="initiative-vitals">
                    {hpMax !== null && (
                      <>
                        <span className="initiative-hp-text">
                          ХП {hpNow ?? 0}/{hpMax}
                        </span>
                        {percent !== null && (
                          <span className="initiative-hp-bar" aria-hidden="true">
                            <span className="initiative-hp-fill" style={{ width: `${percent}%` }} />
                          </span>
                        )}
                      </>
                    )}
                    {ac !== null && <span className="initiative-ac">КД {ac}</span>}
                    {/* Монстра часто заводят второпях без ХП и КД — даём
                        проставить их потом, а не «удалить и создать заново». */}
                    {isGm && !entry.character_id && (
                      <>
                        <input
                          type="number"
                          className="initiative-input"
                          placeholder="ХП"
                          value={entry.hp_max ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            setEntries((prev) =>
                              prev.map((x) => (x.id === entry.id ? { ...x, hp_max: v, hp_current: x.hp_current ?? v } : x)),
                            )
                          }}
                          onBlur={() =>
                            void updateEntry(entry.id, {
                              hp_max: entry.hp_max,
                              hp_current: entry.hp_current ?? entry.hp_max,
                            }).catch((err) =>
                              setError(err instanceof Error ? err.message : 'Не удалось сохранить ХП'),
                            )
                          }
                        />
                        <input
                          type="number"
                          className="initiative-input"
                          placeholder="КД"
                          value={entry.ac ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ac: v } : x)))
                          }}
                          onBlur={() =>
                            void updateEntry(entry.id, { ac: entry.ac }).catch((err) =>
                              setError(err instanceof Error ? err.message : 'Не удалось сохранить КД'),
                            )
                          }
                        />
                      </>
                    )}
                    {/* Урон крутится прямо здесь только у монстров: ХП персонажа
                        принадлежит его листу, править его отсюда — верный способ
                        разъехаться с листом. */}
                    {isGm && !entry.character_id && (
                      <span className="initiative-hp-steps">
                        <button type="button" className="quick-step" onClick={() => void stepMonsterHp(entry, -5)}>
                          −5
                        </button>
                        <button type="button" className="quick-step" onClick={() => void stepMonsterHp(entry, -1)}>
                          −
                        </button>
                        <button type="button" className="quick-step" onClick={() => void stepMonsterHp(entry, 1)}>
                          +
                        </button>
                      </span>
                    )}
                  </div>
                )}

                {isGm && (
                  <div className="card-sub">
                    <button type="button" onClick={() => void handleDelete(entry)}>
                      Удалить
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isGm && (
        <>
          <div className="initiative-actions">
            <button type="button" disabled={turnBusy || entries.length === 0} onClick={() => void handleNextTurn()}>
              Ход →
            </button>
            <button type="button" disabled={busy || entries.length === 0} onClick={() => void handleRollForAll()}>
              🎲 Кинуть инициативу всем
            </button>
            <button
              type="button"
              className="initiative-danger-btn"
              // Раунд обнуляется только здесь, а список ГМ мог разобрать
              // удалением по строке — тогда кнопка обязана остаться живой.
              disabled={entries.length === 0 && round === 0}
              onClick={() => void handleReset()}
            >
              Сбросить бой
            </button>
          </div>

          <form className="inline-form" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Имя"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="number"
              placeholder="Иниц."
              value={newInitiative}
              disabled={busy}
              onChange={(e) => setNewInitiative(e.target.value)}
            />
            <input
              type="number"
              placeholder="ХП"
              value={newHp}
              disabled={busy}
              onChange={(e) => setNewHp(e.target.value)}
            />
            <input
              type="number"
              placeholder="КД"
              value={newAc}
              disabled={busy}
              onChange={(e) => setNewAc(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              Добавить
            </button>
          </form>

          {sheets && sheets.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void handleAddAllCharacters()}>
              + все персонажи кампании
            </button>
          )}
        </>
      )}
    </div>
  )
}
