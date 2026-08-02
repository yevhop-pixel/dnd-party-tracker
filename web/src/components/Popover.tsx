// Кнопка-чипс + панель, всплывающая ПОВЕРХ интерфейса (не раздвигая его).
// Общая механика для чата и боя на экране кампании: закрытие кликом мимо и по
// Esc, своя прокрутка, значок непрочитанного на кнопке.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import './popover.css'

interface PopoverProps {
  label: string
  // Заголовок панели, если он должен отличаться от надписи на кнопке. На
  // телефоне кнопки ужимаются до одного значка («💬»), но в шапке панели
  // нужно нормальное слово («💬 Чат»).
  title?: string
  // Число на значке (0 — значка нет).
  badge?: number
  // Ширина панели; по умолчанию узкая, как у быстрых списков.
  width?: number
  // Дёргается при открытии — например, чтобы обнулить счётчик непрочитанных.
  onOpen?: () => void
  // Открыт/закрыт — родителю бывает нужно знать (счётчик непрочитанных
  // должен считать «человек смотрит в чат» и когда чат открыт карманом).
  onToggle?: (open: boolean) => void
  // Класс кнопки: по умолчанию чипс «кармана», но меню «⋯» в ряду вкладок
  // должно выглядеть вкладкой, а не чипсом.
  chipClass?: string
  activeChipClass?: string
  // Прятать шапку с названием — у короткого меню она лишняя.
  bare?: boolean
  // Функцией — чтобы пункт меню мог закрыть панель за собой.
  children: ReactNode | ((close: () => void) => ReactNode)
}

export default function Popover({
  label,
  title,
  badge = 0,
  width = 420,
  onOpen,
  onToggle,
  chipClass = 'quick-chip',
  activeChipClass = 'quick-chip-active',
  bare = false,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(0)
  // Через ref, чтобы эффект не пересоздавался на каждый рендер родителя.
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  // Панель встаёт по центру своей кнопки и прижимается к краю, если по центру
  // не помещается. Считаем от родителя-ряда, а не от окна.
  useEffect(() => {
    if (!open) return
    function place() {
      const wrap = wrapRef.current
      const btn = btnRef.current
      const panel = panelRef.current
      if (!wrap || !btn || !panel) return
      // Панель позиционируется от своей кнопки, поэтому «по центру» — это
      // половина разницы ширин. Дальше проверяем, влезает ли она в ряд, и
      // при необходимости прижимаем к его краю.
      const rowWidth = (wrap.offsetParent as HTMLElement | null)?.clientWidth ?? window.innerWidth
      const wrapLeft = wrap.offsetLeft
      const centred = btn.offsetWidth / 2 - panel.offsetWidth / 2
      const maxAbsolute = Math.max(0, rowWidth - panel.offsetWidth)
      const absolute = Math.max(0, Math.min(maxAbsolute, wrapLeft + centred))
      setLeft(absolute - wrapLeft)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    onToggleRef.current?.(open)
  }, [open])

  function toggle() {
    setOpen((v) => {
      if (!v) onOpen?.()
      return !v
    })
  }

  return (
    <div className="popover" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`${chipClass}${open ? ` ${activeChipClass}` : ''}`}
        title={title ?? undefined}
        onClick={toggle}
      >
        {label}
        {badge > 0 && <span className="tab-badge">{badge}</span>}
        {!bare && <span className="quick-chip-caret">{open ? '▴' : '▾'}</span>}
      </button>

      {open && (
        <div className="popover-panel" ref={panelRef} style={{ left, width }}>
          {!bare && (
            <div className="popover-head">
              <span className="popover-title">{title ?? label}</span>
              <button type="button" className="quick-close" title="Закрыть" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
          )}
          <div className="popover-body">
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>
        </div>
      )}
    </div>
  )
}
