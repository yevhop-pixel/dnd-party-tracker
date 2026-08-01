import { useEffect, useState } from 'react'
import type { CharacterSheet } from '../lib/types'

interface HpBarProps {
  sheet: CharacterSheet
  // Патч уходит наверх: в редакторе листа — через автосейв, на экране
  // кампании — прямым updateSheet (см. вызывающий код).
  onChange: (patch: Partial<CharacterSheet>) => void
}

// ХП в шапке — всегда на виду: и в редакторе листа (на любой вкладке), и на
// экране кампании, где идёт бой. Кнопки ±1/±5 и прямой ввод; значение
// зажимается в [0, hp_max].
export default function HpBar({ sheet, onChange }: HpBarProps) {
  const [text, setText] = useState(String(sheet.hp_current))

  useEffect(() => {
    setText(String(sheet.hp_current))
  }, [sheet.hp_current])

  function commit(next: number) {
    const clamped = Math.min(sheet.hp_max, Math.max(0, next))
    setText(String(clamped))
    onChange({ hp_current: clamped })
  }

  function handleText(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, '')
    if (cleaned === '') {
      setText('')
      return
    }
    // В поле кладём уже зажатое значение: иначе при вводе «99» на максимуме 20
    // в базу уходит 20, hp_current не меняется, эффект синхронизации не
    // срабатывает — и в шапке до самого blur висит «99 / 20».
    const clamped = Math.min(sheet.hp_max, Math.max(0, Number(cleaned)))
    setText(String(clamped))
    onChange({ hp_current: clamped })
  }

  // Зажим снизу тоже нужен: hp_current в базе может быть отрицательным (CHECK
  // на колонке нет, значение могло приехать из Android-клиента), а width со
  // знаком минус браузер просто отбрасывает — полоска рисуется «полной».
  const percent = sheet.hp_max > 0 ? Math.max(0, Math.min(100, (sheet.hp_current / sheet.hp_max) * 100)) : 0

  return (
    <div className="sheet-hp">
      <span className="sheet-hp-label">ХП</span>
      <button type="button" className="stat-btn" onClick={() => commit(sheet.hp_current - 5)} title="−5">
        −5
      </button>
      <button type="button" className="stat-btn" onClick={() => commit(sheet.hp_current - 1)} title="−1">
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="sheet-hp-input"
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => setText(String(sheet.hp_current))}
      />
      <span className="sheet-hp-max">/ {sheet.hp_max}</span>
      <button type="button" className="stat-btn" onClick={() => commit(sheet.hp_current + 1)} title="+1">
        +
      </button>
      <button type="button" className="stat-btn" onClick={() => commit(sheet.hp_current + 5)} title="+5">
        +5
      </button>
      <span className="sheet-hp-bar" aria-hidden="true">
        <span className="sheet-hp-bar-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  )
}
