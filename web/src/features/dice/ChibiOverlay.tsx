import { useEffect, useState, type CSSProperties } from 'react'
import './chibi.css'

// Полноэкранная анимация аниме-героини на крит-бросок (crit='success'|'fail'
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

  // Палитра: успех — золото/champagne, провал — бордово-синий.
  const hairFill = isSuccess ? 'url(#hairGradSuccess)' : 'url(#hairGradFail)'
  const bodiceFill = isSuccess ? 'url(#bodiceGradSuccess)' : 'url(#bodiceGradFail)'
  const skirtFill = isSuccess ? 'url(#skirtGradSuccess)' : 'url(#skirtGradFail)'
  const bootFill = isSuccess ? 'url(#bootGradSuccess)' : 'url(#bootGradFail)'
  const irisColor = isSuccess ? '#a8672e' : '#6d7fa8'
  const browColor = isSuccess ? '#3a2418' : '#14162a'
  const lipColor = isSuccess ? '#c65a6b' : '#8a4a5c'
  const trimColor = isSuccess ? '#f3d98a' : '#5a6bb0'

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

      <svg className="chibi-figure" viewBox="0 0 200 360" width="200" height="360">
        <defs>
          <linearGradient id="skinGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe6cf" />
            <stop offset="100%" stopColor="#f0b48a" />
          </linearGradient>

          <linearGradient id="hairGradSuccess" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3d98a" />
            <stop offset="45%" stopColor="#b8873f" />
            <stop offset="100%" stopColor="#4a2e1f" />
          </linearGradient>
          <linearGradient id="hairGradFail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6c7ec2" />
            <stop offset="45%" stopColor="#2a2f52" />
            <stop offset="100%" stopColor="#12142a" />
          </linearGradient>

          <linearGradient id="bodiceGradSuccess" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff3d1" />
            <stop offset="100%" stopColor="#c9931f" />
          </linearGradient>
          <linearGradient id="bodiceGradFail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a3358" />
            <stop offset="100%" stopColor="#3a1330" />
          </linearGradient>

          <linearGradient id="skirtGradSuccess" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0d27a" />
            <stop offset="100%" stopColor="#a9740f" />
          </linearGradient>
          <linearGradient id="skirtGradFail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a2846" />
            <stop offset="100%" stopColor="#26101f" />
          </linearGradient>

          <linearGradient id="bootGradSuccess" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8c973" />
            <stop offset="100%" stopColor="#7a5b23" />
          </linearGradient>
          <linearGradient id="bootGradFail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c4680" />
            <stop offset="100%" stopColor="#14162a" />
          </linearGradient>
        </defs>

        {/* длинные волосы за спиной — покачиваются отдельным слоем (лёгкая
            задержка относительно тела даёт естественный "хлёст") */}
        <g className="chibi-hair-back">
          <path
            d="M84 30 Q100 20 116 30 L118 78 Q100 86 82 78 Z"
            fill={hairFill}
          />
          <path
            d="M62 40 C38 75 28 150 42 260 C52 268 62 262 66 250 C56 165 62 95 76 46 Z"
            fill={hairFill}
          />
          <path
            d="M138 40 C162 75 172 150 158 260 C148 268 138 262 134 250 C144 165 138 95 124 46 Z"
            fill={hairFill}
          />
        </g>

        {/* ноги: длинные, статичные — покачивание фигуры отыгрывается через
            бёдра/торс (chibi-body), а не подпрыгиванием ног */}
        <g className="chibi-legs">
          <path d="M84 205 C78 245 76 285 80 335" stroke="url(#skinGrad)" strokeWidth="15" fill="none" strokeLinecap="round" />
          <path d="M116 205 C122 245 124 285 120 335" stroke="url(#skinGrad)" strokeWidth="15" fill="none" strokeLinecap="round" />

          <path d="M79 270 C77 300 79 325 80 337" stroke={bootFill} strokeWidth="17" fill="none" strokeLinecap="round" />
          <path d="M121 270 C123 300 121 325 120 337" stroke={bootFill} strokeWidth="17" fill="none" strokeLinecap="round" />
          <ellipse cx="79" cy="270" rx="9" ry="3" fill={trimColor} opacity="0.7" />
          <ellipse cx="121" cy="270" rx="9" ry="3" fill={trimColor} opacity="0.7" />

          <ellipse cx="80" cy="340" rx="13" ry="6" fill={bootFill} />
          <ellipse cx="120" cy="340" rx="13" ry="6" fill={bootFill} />
          <rect x="76" y="344" width="8" height="6" rx="2" fill={bootFill} />
          <rect x="116" y="344" width="8" height="6" rx="2" fill={bootFill} />
        </g>

        {/* торс: платье, руки, голова, лицо — раскачивание/дрожь применяется
            ко всей группе разом (см. chibi.css) */}
        <g className="chibi-body">
          <path
            d="M72 100 Q100 90 128 100 L118 163 Q100 170 82 163 Z"
            fill={bodiceFill}
            stroke="#241827"
            strokeWidth="2"
          />
          <path d="M86 106 Q92 132 86 158 L94 156 Q98 130 94 108 Z" fill="#ffffff" opacity="0.15" />

          <path d="M82 163 L118 163 L144 205 L56 205 Z" fill={skirtFill} stroke="#241827" strokeWidth="2" />
          <path d="M95 165 L88 203" stroke="#241827" strokeWidth="1.5" opacity="0.35" />
          <path d="M105 165 L112 203" stroke="#241827" strokeWidth="1.5" opacity="0.35" />
          <path d="M84 162 L116 162" stroke={trimColor} strokeWidth="4" strokeLinecap="round" />

          {isSuccess ? (
            <>
              {/* поза "вог": одна рука вверх у виска, другая — на бедре */}
              <g className="chibi-arm-left">
                <path d="M72 108 Q50 95 58 55" stroke="url(#skinGrad)" strokeWidth="9" fill="none" strokeLinecap="round" />
                <circle cx="58" cy="52" r="6" fill="url(#skinGrad)" />
              </g>
              <g className="chibi-arm-right">
                <path d="M128 108 Q150 130 116 158" stroke="url(#skinGrad)" strokeWidth="9" fill="none" strokeLinecap="round" />
                <circle cx="116" cy="158" r="6" fill="url(#skinGrad)" />
              </g>
            </>
          ) : (
            <>
              {/* драматичная поза: ладонь у щеки, вторая рука бессильно опущена */}
              <g className="chibi-arm-left">
                <path d="M72 108 Q52 92 70 66" stroke="url(#skinGrad)" strokeWidth="9" fill="none" strokeLinecap="round" />
                <circle cx="70" cy="66" r="7" fill="url(#skinGrad)" />
              </g>
              <g className="chibi-arm-right">
                <path d="M128 108 Q134 145 122 180" stroke="url(#skinGrad)" strokeWidth="9" fill="none" strokeLinecap="round" />
                <circle cx="122" cy="180" r="6" fill="url(#skinGrad)" />
              </g>
            </>
          )}

          <path d="M92 82 L108 82 L106 100 L94 100 Z" fill="url(#skinGrad)" />
          <ellipse cx="100" cy="55" rx="26" ry="30" fill="url(#skinGrad)" />

          {/* чёлка */}
          <path d="M68 44 Q74 18 100 16 Q126 18 132 44 Q112 28 100 32 Q88 28 68 44 Z" fill={hairFill} />

          {isSuccess ? (
            <>
              <path d="M76 40 Q84 35 92 39" stroke={browColor} strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M108 39 Q116 34 124 39" stroke={browColor} strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M76 42 Q84 48 92 43" stroke={browColor} strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M108 43 Q116 48 124 42" stroke={browColor} strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* левый глаз — общий для обоих исходов, только форма века отличается */}
          <ellipse cx="87" cy="58" rx="7" ry="8" fill={irisColor} />
          <circle cx="87" cy="59" r="3" fill="#1a1220" />
          <circle cx="89.5" cy="56" r="1.5" fill="#ffffff" />
          <path d="M79 52 Q87 47 95 52" stroke="#1a1220" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {isSuccess ? (
            <>
              <path d="M95 52 L99 49" stroke="#1a1220" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M95 52 L100 53" stroke="#1a1220" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M95 52 L99 56" stroke="#1a1220" strokeWidth="1.5" strokeLinecap="round" />
            </>
          ) : (
            <path d="M79 55 Q87 53 95 55 L95 58 Q87 57 79 58 Z" fill="url(#skinGrad)" opacity="0.9" />
          )}

          {/* правый глаз: у успеха — подмигивание (моргает, см. chibi.css),
              у провала — такое же полуопущенное веко, как слева */}
          {isSuccess ? (
            <g>
              <g className="chibi-eye-right-open">
                <ellipse cx="113" cy="58" rx="7" ry="8" fill={irisColor} />
                <circle cx="113" cy="59" r="3" fill="#1a1220" />
                <circle cx="115.5" cy="56" r="1.5" fill="#ffffff" />
                <path d="M105 52 Q113 47 121 52" stroke="#1a1220" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </g>
              <path
                className="chibi-eye-right-closed"
                d="M105 56 Q113 64 121 56"
                stroke="#1a1220"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <path className="chibi-sparkle" d="M128 46 L130 52 L136 54 L130 56 L128 62 L126 56 L120 54 L126 52 Z" fill="#fff6d8" />
            </g>
          ) : (
            <>
              <ellipse cx="113" cy="58" rx="7" ry="8" fill={irisColor} />
              <circle cx="113" cy="59" r="3" fill="#1a1220" />
              <circle cx="115.5" cy="56" r="1.5" fill="#ffffff" />
              <path d="M105 52 Q113 47 121 52" stroke="#1a1220" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M105 55 Q113 53 121 55 L121 58 Q113 57 105 58 Z" fill="url(#skinGrad)" opacity="0.9" />
            </>
          )}

          {isSuccess ? (
            <path d="M86 78 Q100 88 114 78 Q100 83 86 78 Z" fill={lipColor} />
          ) : (
            <>
              <path d="M88 82 Q100 76 112 82 Q100 80 88 82 Z" fill={lipColor} />

              {/* тушь-потёки под глазами */}
              <path className="chibi-mascara chibi-mascara-left" d="M81 66 Q79 73 76 80" stroke="#1a1220" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path className="chibi-mascara chibi-mascara-right" d="M119 66 Q121 73 124 80" stroke="#1a1220" strokeWidth="2" fill="none" strokeLinecap="round" />

              {/* крупные слёзы */}
              <path className="chibi-tear chibi-tear-left" d="M87 64 Q91 74 87 84 Q83 74 87 64 Z" fill="#6fb7ff" />
              <path
                className="chibi-tear chibi-tear-right chibi-tear-delay"
                d="M113 64 Q117 74 113 84 Q109 74 113 64 Z"
                fill="#6fb7ff"
              />
            </>
          )}

          {/* передние пряди, обрамляющие лицо — поверх платья */}
          <path d="M70 46 Q54 90 60 145 Q68 150 72 142 Q64 92 78 48 Z" fill={hairFill} />
          <path d="M130 46 Q146 90 140 145 Q132 150 128 142 Q136 92 122 48 Z" fill={hairFill} />
        </g>
      </svg>

      <div className={`chibi-caption ${isSuccess ? 'chibi-caption-success' : 'chibi-caption-fail'}`}>
        {isSuccess ? 'КРИТ!' : 'КРИТИЧЕСКИЙ ПРОВАЛ'}
      </div>
    </div>
  )
}
