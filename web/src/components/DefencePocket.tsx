// Защита в шапке кампании: суммарные физ./маг. на чипсе, внутри — разбор по
// предметам с кнопками износа. Износ меняют прямо за столом («броня
// износилась на единицу»), поэтому крутить его надо здесь, а не уходя в лист.
import { useEffect, useState } from 'react'
import type { CharacterSheet, EquippedItem } from '../lib/types'
import { listChildren, updateChild } from '../lib/api'
import Popover from './Popover'
import './defence-pocket.css'

interface DefencePocketProps {
  sheet: CharacterSheet
}

// Износ не может «съесть» больше, чем даёт предмет: 12 при износе 20 — это 0,
// а не минус восемь.
function effective(base: number, wear: number): number {
  return Math.max(0, base - wear)
}

export default function DefencePocket({ sheet }: DefencePocketProps) {
  const [items, setItems] = useState<EquippedItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listChildren<EquippedItem>('equipped_item', sheet.id)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить экипировку')
      })
    return () => {
      cancelled = true
    }
  }, [sheet.id])

  const armour = (items ?? []).filter((i) => i.def_phys > 0 || i.def_magic > 0 || i.wear > 0)
  const totalPhys = armour.reduce((sum, i) => sum + effective(i.def_phys, i.wear), 0)
  const totalMagic = armour.reduce((sum, i) => sum + effective(i.def_magic, i.wear), 0)
  const worn = armour.some((i) => i.wear > 0)

  async function stepWear(item: EquippedItem, delta: number) {
    const next = Math.max(0, item.wear + delta)
    setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? { ...i, wear: next } : i)) : prev))
    try {
      await updateChild<EquippedItem>('equipped_item', item.id, { wear: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить износ')
    }
  }

  return (
    <Popover label={`🛡 ${totalPhys} · 🔮 ${totalMagic}${worn ? ' ⚠' : ''}`} width={320} bare>
      <div className="def-pocket">
        {error && <p className="quick-error">{error}</p>}
        {items === null && !error && <p className="quick-empty">Загрузка…</p>}
        {items !== null && armour.length === 0 && (
          <p className="quick-empty">Ни у чего в экипировке не проставлена защита.</p>
        )}

        {armour.map((item) => {
          const phys = effective(item.def_phys, item.wear)
          const magic = effective(item.def_magic, item.wear)
          return (
            <div key={item.id} className={`def-row${item.wear > 0 ? ' def-row-worn' : ''}`}>
              <div className="def-row-main">
                <span className="def-row-name">
                  <span className="def-row-slot">{item.slot}</span> {item.name || '(без имени)'}
                </span>
                <span className="def-row-values">
                  🛡 {item.wear > 0 ? `${item.def_phys}−${item.wear}=${phys}` : phys} · 🔮{' '}
                  {item.wear > 0 ? `${item.def_magic}−${item.wear}=${magic}` : magic}
                </span>
              </div>
              <div className="def-row-wear">
                <span className="def-wear-label">износ</span>
                <button type="button" className="quick-step" disabled={item.wear === 0} onClick={() => void stepWear(item, -1)}>
                  −
                </button>
                <span className="quick-count-value">{item.wear}</span>
                <button type="button" className="quick-step" onClick={() => void stepWear(item, 1)}>
                  +
                </button>
              </div>
            </div>
          )
        })}

        {armour.length > 0 && (
          <p className="def-total">
            Итого: физ. {totalPhys}, маг. {totalMagic}
            {worn ? ' — часть съедена износом' : ''}
          </p>
        )}
      </div>
    </Popover>
  )
}
