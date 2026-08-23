// Настоящий трёхмерный кубик: кувыркается, замедляется и ложится нужной
// гранью в камеру. Геометрия — в solids.ts, движение — здесь.
//
// Главное ограничение, из которого всё вытекает: результат броска УЖЕ
// посчитан честным генератором и записан в базу до того, как начнётся
// анимация (см. diceApi.submitRoll). Значит кубик не бросают — ему
// показывают, чем всё кончилось. Физический движок тут не подходит принципиально:
// он выдал бы своё число. Поэтому кувырок нарисован, а посадка — точная.
import { useEffect, useRef } from 'react'
import { clipPath, faceHeight, faceTransform, faceWidth, restTransform, solidFor } from './solids'
import './die3d.css'

export interface Die3DProps {
  sides: number
  // Пока null — кубик кувыркается без остановки (результат ещё летит из базы).
  // Как только число известно, кубик доворачивается и ложится этой гранью.
  value: number | null
  size?: number
  // Премиум-бросок — золотой кубик тем же телом, другой заливкой.
  gold?: boolean
  // false — кубик стоит неподвижно. Нужен ленте: в ней могут висеть десятки
  // так и не вскрытых бросков, и держать десятки вечных анимаций (у каждой —
  // свой композитный слой) на телефоне незачем.
  animate?: boolean
}

// Кувырок и посадка. Полсекунды на посадку — за меньшее глаз не успевает
// проследить за гранью, за большее начинает казаться, что кубик залип.
const LAND_MS = 620
const TUMBLE_MS = 1100

// Небольшой наклон в покое: строго анфас многогранник читается как плоская
// картинка, а чуть повёрнутый — как предмет.
const REST_TILT = 'rotateX(-9deg) rotateY(7deg)'

function tumbleKeyframes(): Keyframe[] {
  // Не случайные числа: одна и та же дорожка у всех за столом выглядит
  // одинаково, а разброс даёт стартовый угол самого тела.
  return [
    { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)' },
    { transform: 'rotateX(180deg) rotateY(140deg) rotateZ(60deg)' },
    { transform: 'rotateX(360deg) rotateY(300deg) rotateZ(140deg)' },
    { transform: 'rotateX(540deg) rotateY(460deg) rotateZ(200deg)' },
    { transform: 'rotateX(720deg) rotateY(620deg) rotateZ(300deg)' },
  ]
}

export default function Die3D({ sides, value, size = 64, gold = false, animate = true }: Die3DProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const tumbleRef = useRef<Animation | null>(null)
  // Поза, на которой оборвался кувырок. React в фазе эффектов сначала гоняет
  // ВСЕ cleanup'ы и только потом создающие функции — к моменту, когда эффект
  // посадки читает getComputedStyle, кувырок уже отменён и стиль вернулся в
  // none. Поэтому позу снимаем сами, прямо в момент отмены.
  const lastPoseRef = useRef<string | null>(null)

  // Бесконечный кувырок, пока число неизвестно.
  useEffect(() => {
    const body = bodyRef.current
    if (!body || value !== null) return
    // Снимаем позу прошлого броска, иначе кувырок крутится поверх неё.
    body.style.transform = ''
    lastPoseRef.current = null
    if (!animate || typeof body.animate !== 'function') return
    // WAAPI медиазапросом не глушится — проверяем сами, иначе у человека с
    // «уменьшить движение» в ленте вечно кувыркаются все нераскрытые броски.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const anim = body.animate(tumbleKeyframes(), {
      duration: TUMBLE_MS,
      iterations: Infinity,
      easing: 'linear',
    })
    tumbleRef.current = anim
    return () => {
      lastPoseRef.current = getComputedStyle(body).transform
      anim.cancel()
      tumbleRef.current = null
    }
  }, [value, animate])

  // Посадка: из текущего положения кувырка доворачиваем до грани.
  useEffect(() => {
    const body = bodyRef.current
    if (!body || value === null) return

    const solid = solidFor(sides, value)
    const target = solid.faces.find((f) => f.value === value) ?? solid.faces[0]
    const final = `${REST_TILT} ${restTransform(target)}`

    if (typeof body.animate !== 'function') {
      body.style.transform = final
      return
    }

    // Стартуем посадку С ТОГО ЖЕ положения, на котором оборвался кувырок —
    // иначе кубик дёрнулся бы в исходную позу и только потом поехал.
    const captured = lastPoseRef.current
    const current = getComputedStyle(body).transform
    const from = captured && captured !== 'none' ? captured : current

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const anim = body.animate(
      reduced
        ? [{ transform: final }]
        : [
            { transform: from === 'none' ? 'rotateX(0deg)' : from, offset: 0 },
            // Лишний оборот перед посадкой: без него кубик просто «доезжает»
            // по кратчайшей дуге и падение читается как поворот меню.
            { transform: `rotateX(200deg) rotateY(160deg) ${final}`, offset: 0.45 },
            { transform: final, offset: 1 },
          ],
      {
        duration: reduced ? 1 : LAND_MS,
        // Замедление с перелётом: кубик проскакивает грань и возвращается,
        // как настоящий, когда доваливается на ребре.
        easing: 'cubic-bezier(0.18, 0.9, 0.24, 1.06)',
        fill: 'forwards',
      },
    )
    // Дописываем позу обычным стилем: fill: 'forwards' держится, только пока
    // жива сама анимация, а её снимает и перемонтирование компонента, и
    // двойной прогон эффектов в dev-режиме React. Из-за этого кубик застывал
    // в исходной позе и все броски показывали одну и ту же грань.
    anim.onfinish = () => {
      body.style.transform = final
    }
    return () => {
      anim.cancel()
    }
  }, [value, sides])

  const solid = solidFor(sides, value ?? 1)
  const radius = solid.inradius * size
  const w = faceWidth(solid.shape, size)
  const h = faceHeight(solid.shape, size)
  const box = Math.round(size * 1.75)

  return (
    <span
      className={`die3d${gold ? ' die3d-premium' : ''}`}
      style={{ width: box, height: box, perspective: size * 9 }}
      // Числа на всех гранях — картинка, а не текст: без этого скринридер
      // зачитывал бы «1 2 3 … 20», а поиск по странице цеплялся за грани.
      aria-hidden="true"
    >
      <span className="die3d-body" ref={bodyRef}>
        {solid.faces.map((f, i) => (
          <span
            key={`${f.value}-${i}`}
            className={`die3d-face die3d-face-${solid.shape}`}
            style={{
              width: w,
              height: h,
              marginLeft: -w / 2,
              marginTop: -h / 2,
              fontSize: Math.round(size * 0.3),
              clipPath: clipPath(solid.shape),
              transform: faceTransform(f, solid.shape, size, radius),
            }}
          >
            <span className="die3d-num">{f.value}</span>
          </span>
        ))}
      </span>
      <span className="die3d-shadow" style={{ width: size * 0.9 }} />
    </span>
  )
}
