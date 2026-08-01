import { useEffect, useState, type CSSProperties } from 'react'
import './chibi.css'

// Полноэкранная анимация чиби-девочки на крит-бросок (crit='success'|'fail'
// на dice_roll — см. detectCrit в notation.ts). Рендерится из RollFeed, чтобы
// показ был одинаковым и у автора броска, и у всех, кому виден бросок.
// SHOW_MS — общее время жизни оверлея, FADE_MS — длительность ухода в конце.
const SHOW_MS = 3500
const FADE_MS = 400
const CONFETTI_COUNT = 12

export interface ChibiOverlayProps {
  crit: 'success' | 'fail'
  onDone: () => void
}

export default function ChibiOverlay({ crit, onDone }: ChibiOverlayProps) {
  const [leaving, setLeaving] = useState(false)
  const isSuccess = crit === 'success'

  // Родитель монтирует компонент заново на каждый новый крит (key={roll.id}
  // в RollFeed), поэтому таймеры достаточно завести один раз при монтировании.
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), SHOW_MS - FADE_MS)
    const doneTimer = setTimeout(onDone, SHOW_MS)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(doneTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`chibi-overlay chibi-overlay-${crit}${leaving ? ' chibi-overlay-leaving' : ''}`}
      aria-hidden="true"
    >
      <div className="chibi-glow" />

      {isSuccess && (
        <div className="chibi-confetti">
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <span key={i} className="chibi-confetti-piece" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}

      <svg className="chibi-figure" viewBox="0 0 200 260" width="220" height="286">
        {/* хвостики за головой */}
        <ellipse cx="46" cy="88" rx="15" ry="28" fill="#6b3f56" />
        <ellipse cx="154" cy="88" rx="15" ry="28" fill="#6b3f56" />

        {/* ноги */}
        <g className="chibi-legs">
          <line
            className="chibi-leg chibi-leg-left"
            x1="85"
            y1="192"
            x2="82"
            y2="230"
            stroke="#ffd9c4"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <line
            className="chibi-leg chibi-leg-right"
            x1="115"
            y1="192"
            x2="118"
            y2="230"
            stroke="#ffd9c4"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <ellipse cx="80" cy="233" rx="13" ry="7" fill="#3a2e45" />
          <ellipse cx="120" cy="233" rx="13" ry="7" fill="#3a2e45" />
        </g>

        {/* торс: голова, платье, руки — раскачивание/дрожь применяется ко
            всей группе разом (см. chibi.css) */}
        <g className="chibi-torso">
          <path
            d="M70 150 L130 150 L142 196 L58 196 Z"
            fill={isSuccess ? '#e8b923' : '#4a5578'}
            stroke="#2f313b"
            strokeWidth="2"
          />

          <line
            className="chibi-arm chibi-arm-left"
            x1="68"
            y1="156"
            x2="38"
            y2="132"
            stroke="#ffd9c4"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <line
            className="chibi-arm chibi-arm-right"
            x1="132"
            y1="156"
            x2="162"
            y2="132"
            stroke="#ffd9c4"
            strokeWidth="8"
            strokeLinecap="round"
          />

          <circle cx="100" cy="90" r="46" fill="#ffd9c4" />

          {/* чёлка */}
          <path
            d="M54 78 Q60 34 100 34 Q140 34 146 78 Q120 58 100 62 Q80 58 54 78 Z"
            fill="#6b3f56"
          />

          <ellipse cx="70" cy="100" rx="8" ry="5" fill="#ff9fb3" opacity="0.7" />
          <ellipse cx="130" cy="100" rx="8" ry="5" fill="#ff9fb3" opacity="0.7" />

          {isSuccess ? (
            <>
              {/* счастливые глаза-дуги */}
              <path d="M74 84 Q82 74 90 84" stroke="#2f2030" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M110 84 Q118 74 126 84" stroke="#2f2030" strokeWidth="4" fill="none" strokeLinecap="round" />
              {/* открытая улыбка */}
              <path d="M80 104 Q100 122 120 104 Q100 112 80 104 Z" fill="#7a2f2f" />
            </>
          ) : (
            <>
              {/* нахмуренные брови */}
              <path d="M70 74 L88 80" stroke="#2f2030" strokeWidth="3" strokeLinecap="round" />
              <path d="M130 74 L112 80" stroke="#2f2030" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="80" cy="88" rx="6" ry="7" fill="#2f2030" />
              <ellipse cx="120" cy="88" rx="6" ry="7" fill="#2f2030" />
              {/* уголки рта вниз */}
              <path d="M85 112 Q100 102 115 112" stroke="#2f2030" strokeWidth="4" fill="none" strokeLinecap="round" />

              <path className="chibi-tear chibi-tear-left" d="M80 96 Q84 104 80 112 Q76 104 80 96 Z" fill="#6fb7ff" />
              <path
                className="chibi-tear chibi-tear-right chibi-tear-delay"
                d="M120 96 Q124 104 120 112 Q116 104 120 96 Z"
                fill="#6fb7ff"
              />
            </>
          )}
        </g>
      </svg>

      <div className={`chibi-caption ${isSuccess ? 'chibi-caption-success' : 'chibi-caption-fail'}`}>
        {isSuccess ? 'КРИТ!' : 'КРИТИЧЕСКИЙ ПРОВАЛ'}
      </div>
    </div>
  )
}
