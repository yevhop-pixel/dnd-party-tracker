// Золото в шапке кампании: значение меняют чаще всего остального, а лежало
// оно в глубине вкладки «Статы». Здесь — цифра на виду и выпадающий
// мини-калькулятор: вписал сумму, нажал «+» или «−».
import { useState } from 'react'
import type { CharacterSheet } from '../lib/types'
import Popover from './Popover'
import './gold-pocket.css'

interface GoldPocketProps {
  sheet: CharacterSheet
  onChange: (patch: Partial<CharacterSheet>) => void
}

type Purse = 'wallet_gold' | 'bank_gold' | 'debt_gold'

const PURSES: { key: Purse; label: string; hint: string }[] = [
  { key: 'wallet_gold', label: 'Кошелёк', hint: 'при себе' },
  { key: 'bank_gold', label: 'Банк', hint: 'на хранении' },
  { key: 'debt_gold', label: 'Долг', hint: 'должен кому-то' },
]

export default function GoldPocket({ sheet, onChange }: GoldPocketProps) {
  const [purse, setPurse] = useState<Purse>('wallet_gold')
  const [amount, setAmount] = useState('')

  function apply(sign: 1 | -1) {
    const value = Math.round(Number(amount.replace(',', '.')))
    if (!Number.isFinite(value) || value === 0) return
    // Отрицательное золото — это долг, для него есть своя графа, поэтому в
    // кошельке и банке ниже нуля не опускаемся.
    const next = Math.max(0, sheet[purse] + sign * value)
    onChange({ [purse]: next } as Partial<CharacterSheet>)
    setAmount('')
  }

  return (
    <Popover label={`💰 ${sheet.wallet_gold}`} width={260} bare>
      <div className="gold-pocket">
        <div className="gold-purses">
          {PURSES.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`gold-purse${purse === p.key ? ' gold-purse-active' : ''}`}
              onClick={() => setPurse(p.key)}
            >
              <span className="gold-purse-label">{p.label}</span>
              <span className="gold-purse-value">{sheet[p.key]}</span>
            </button>
          ))}
        </div>

        <div className="gold-calc">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Сколько"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply(1)
            }}
          />
          <button type="button" className="gold-minus" onClick={() => apply(-1)}>
            −
          </button>
          <button type="button" className="gold-plus" onClick={() => apply(1)}>
            +
          </button>
        </div>

        <div className="gold-quick">
          {[1, 5, 10, 50, 100].map((n) => (
            <button key={n} type="button" onClick={() => setAmount(String(n))}>
              {n}
            </button>
          ))}
        </div>

        <p className="gold-hint">
          {PURSES.find((p) => p.key === purse)?.label} — {PURSES.find((p) => p.key === purse)?.hint}
        </p>
      </div>
    </Popover>
  )
}
