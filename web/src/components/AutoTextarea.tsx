import { useEffect, useRef, type ChangeEvent, type TextareaHTMLAttributes } from 'react'

type AutoTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

// Textarea без внутреннего скролла — растёт по высоте под содержимое.
// Пересчитывает высоту на mount и на каждый ввод; максимум не ограничен.
export default function AutoTextarea({ rows = 2, className, onChange, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }

  // Значение может меняться и не через ввод (переключение персонажа/листа) —
  // пересчитываем высоту при каждом изменении value, включая mount.
  useEffect(() => {
    if (ref.current) resize(ref.current)
  }, [rest.value])

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    resize(e.target)
    onChange?.(e)
  }

  return (
    <textarea
      ref={ref}
      rows={rows}
      className={className ? `auto-textarea ${className}` : 'auto-textarea'}
      onChange={handleChange}
      {...rest}
    />
  )
}
