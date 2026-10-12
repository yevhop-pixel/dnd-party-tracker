// Плоский кубик: одна SVG-картинка вместо трёхмерного тела. Им становится
// Die3D, когда кубик лёг.
//
// Зачем: у трёхмерного d20 двадцать граней, и каждая — отдельный элемент с
// 3D-трансформом, клип-маской и градиентом. Композитор держит их слоями и
// тогда, когда кубик уже не двигается, а в ленте таких кубиков десятки.
// На телефонах лента от этого лагала (жалоба владельца 12.10.2026). Плоский
// кубик — один узел SVG без 3D, и цена у него как у обычной иконки.
import { useId } from 'react'

export interface DieFlatProps {
  sides: number
  // null — число ещё не известно (бросок крутится, но анимацию для этой
  // строки выключили), на кубике знак вопроса.
  value: number | null
  size: number
  gold?: boolean
}

interface Outline {
  // Силуэт кубика в координатах 0..100.
  shape: string
  // Рёбра внутри силуэта — чтобы картинка читалась как многогранник, а не
  // как плоская плашка.
  facets?: string
  // Боковые грани, которые светлее или темнее лицевой (у куба).
  shades?: { d: string; fill: string }[]
  // Где стоит число: у треугольной грани центр тяжести ниже середины.
  textY: number
  // Насколько крупно число при одной цифре.
  font: number
  // По горизонтали число по центру, кроме куба: там лицевая грань левее.
  textX?: number
}

const OUTLINES: Record<'d4' | 'cube' | 'd8' | 'd12' | 'd20', Outline> = {
  d4: { shape: 'M50 8 L93 86 L7 86 Z', textY: 72, font: 34 },
  // Куб — не плоский квадрат, а предмет: лицевая грань, крышка и правый бок,
  // как у трёхмерного куба в покое (REST_TILT_CUBE в Die3D). Квадрат владелец
  // уже однажды забраковал: «куб так не выглядит».
  cube: {
    shape: 'M10 32 L30 12 H90 V70 L70 90 H10 Z',
    facets: 'M10 32 H70 V90 M70 32 L90 12',
    shades: [
      { d: 'M10 32 L30 12 H90 L70 32 Z', fill: 'rgba(255,255,255,0.14)' },
      { d: 'M70 32 L90 12 V70 L70 90 Z', fill: 'rgba(0,0,0,0.22)' },
    ],
    textX: 40,
    textY: 74,
    font: 36,
  },
  d8: { shape: 'M50 5 L93 50 L50 95 L7 50 Z', facets: 'M7 50 H93', textY: 44, font: 30 },
  d12: {
    shape: 'M50 4 L94 36 L77 90 L23 90 L6 36 Z',
    facets: 'M50 4 V24 M94 36 L75 43 M77 90 L64 72 M23 90 L36 72 M6 36 L25 43 M50 24 L75 43 L64 72 L36 72 L25 43 Z',
    textY: 60,
    font: 30,
  },
  d20: {
    shape: 'M50 4 L92 27 L92 73 L50 96 L8 73 L8 27 Z',
    facets: 'M50 22 L80 70 L20 70 Z M50 4 L50 22 M92 27 L50 22 M8 27 L50 22 M92 27 L80 70 M8 27 L20 70 M92 73 L80 70 M8 73 L20 70 M50 96 L80 70 M50 96 L20 70',
    textY: 62,
    font: 26,
  },
}

function outlineFor(sides: number): Outline {
  switch (sides) {
    case 4:
      return OUTLINES.d4
    case 8:
      return OUTLINES.d8
    case 12:
      return OUTLINES.d12
    case 20:
      return OUTLINES.d20
    // d6, а также d10/d100 и прочие: у них и трёхмерная болванка — куб
    // (fallbackSolid в solids.ts), и при посадке фигура не должна меняться.
    default:
      return OUTLINES.cube
  }
}

export default function DieFlat({ sides, value, size, gold = false }: DieFlatProps) {
  // Формат useId меняется от версии React (:r0:, «r0», _r_0_), а в url(#…)
  // годятся не все символы — оставляем только безопасные.
  const gradId = 'die-flat-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const o = outlineFor(sides)
  const text = value === null ? '?' : String(value)
  // Двузначное и трёхзначное число в ту же грань — мельче.
  const font = text.length >= 3 ? o.font * 0.68 : text.length === 2 ? o.font * 0.85 : o.font
  // Плоская картинка занимает примерно столько же, сколько трёхмерное тело
  // в покое, — чтобы при смене вида ничего не прыгало.
  const px = Math.round(size * 1.3)
  return (
    <svg className="die-flat-svg" width={px} height={px} viewBox="0 0 100 100">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {gold ? (
            <>
              <stop offset="0" stopColor="#f7d977" />
              <stop offset="0.55" stopColor="#e0a52c" />
              <stop offset="1" stopColor="#9a6a12" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#6a4ad9" />
              <stop offset="0.55" stopColor="#4f34b5" />
              <stop offset="1" stopColor="#3a2590" />
            </>
          )}
        </linearGradient>
      </defs>
      <path d={o.shape} fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeLinejoin="round" />
      {o.shades?.map((sh) => (
        <path key={sh.d} d={sh.d} fill={sh.fill} />
      ))}
      {o.facets && <path d={o.facets} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" strokeLinejoin="round" />}
      <text
        className={gold ? 'die-flat-num die-flat-num-gold' : 'die-flat-num'}
        x={o.textX ?? 50}
        y={o.textY}
        fontSize={font}
        textAnchor="middle"
      >
        {text}
      </text>
    </svg>
  )
}
