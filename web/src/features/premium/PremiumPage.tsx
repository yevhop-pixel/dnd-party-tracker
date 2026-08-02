// Шуточная «премиум-подписка». Настоящей оплаты здесь нет и не будет: кнопка
// просто включает флаг на листе. Единственное, что важно всерьёз — эффект на
// кубы ВИДЕН всей партии (золотая обводка в ленте и пометка ✨ у броска),
// потому что тихо подкрученные кубы в общей игре были бы обманом стола.
import { useState } from 'react'
import { setMyPremium } from '../../lib/api'
import './premium.css'

interface PremiumPageProps {
  // Подписка человека, а не персонажа: у ГМа листа нет, а премиум ему тоже
  // положен (по просьбе владельца).
  active: boolean
  onChange: (next: boolean) => void
}

const PERKS = [
  { icon: '👑', title: 'Золотая иконка', text: 'Аватарка в ленте бросков светится золотом. Все видят, кто тут при деньгах.' },
  { icon: '🎲', title: '+10% удачи на d20', text: 'В одном броске из десяти кубик перебрасывается, и берётся лучший результат.' },
  { icon: '🛡️', title: '−20% провалов', text: 'Каждая пятая натуральная единица переигрывается. Позор — не для премиум-класса.' },
  { icon: '✨', title: 'Пометка в ленте', text: 'Подкрученные броски помечаются звёздочкой: партия должна знать, за чей счёт банкет.' },
]

export default function PremiumPage({ active, onChange }: PremiumPageProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justBought, setJustBought] = useState(false)

  async function toggle(next: boolean) {
    setBusy(true)
    setError('')
    try {
      await setMyPremium(next)
      onChange(next)
      setJustBought(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оформить подписку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`premium-page${active ? ' premium-page-active' : ''}`}>
      <div className="premium-hero">
        <span className="premium-crown">👑</span>
        <h2>DnD Tracker PREMIUM</h2>
        <p className="premium-tagline">Кубик любит тех, кто платит.</p>
        <div className="premium-price">
          <span className="premium-price-amount">$100</span>
          <span className="premium-price-period">разово, навсегда, без возврата</span>
        </div>
      </div>

      <ul className="premium-perks">
        {PERKS.map((perk) => (
          <li key={perk.title}>
            <span className="premium-perk-icon">{perk.icon}</span>
            <div>
              <strong>{perk.title}</strong>
              <p>{perk.text}</p>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="auth-error">{error}</p>}

      {active ? (
        <div className="premium-active-box">
          <p className="premium-active-text">
            {justBought ? '👑 Оплата принята. Ну, почти.' : '👑 Премиум активен'}
          </p>
          <button type="button" className="premium-cancel" disabled={busy} onClick={() => void toggle(false)}>
            Отказаться от премиума
          </button>
        </div>
      ) : (
        <button type="button" className="premium-buy" disabled={busy} onClick={() => void toggle(true)}>
          {busy ? 'Списываем…' : 'Купить за $100'}
        </button>
      )}

    </div>
  )
}
