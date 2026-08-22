import { useEffect, useState } from 'react'
import { getImageUrl } from './bestiaryApi'

interface BestiaryImageProps {
  path: string | null
  name: string
  // 'thumb' — квадратик в списке, 'full' — картинка в раскрытой карточке.
  variant?: 'thumb' | 'full'
}

// Картинка записи бестиария. Файл лежит в приватном бакете, поэтому
// показывается по подписанной ссылке (кэш — в bestiaryApi). Пока ссылка не
// готова или её не дали, рисуем заглушку: у монстра свой знак, у человека —
// свой, чтобы пустая карточка не выглядела сломанной.
export default function BestiaryImage({ path, name, variant = 'thumb' }: BestiaryImageProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!path) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // Сразу после загрузки файла image_path ещё едет в базу автосейвом, и
    // политика чтения его пока не пропускает — одна повторная попытка через
    // пару секунд закрывает эту гонку (тот же приём, что в Avatar).
    const attempt = (retriesLeft: number) => {
      getImageUrl(path)
        .then((signed) => {
          if (!cancelled) setUrl(signed)
        })
        .catch(() => {
          if (cancelled) return
          if (retriesLeft > 0) retryTimer = setTimeout(() => attempt(retriesLeft - 1), 2000)
          else setFailed(true)
        })
    }
    attempt(1)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [path])

  const cls = variant === 'full' ? 'bestiary-image-full' : 'bestiary-image-thumb'

  if (path && url && !failed) {
    return <img src={url} alt={name} className={cls} onError={() => setFailed(true)} />
  }
  return (
    <div className={`${cls} bestiary-image-empty`} aria-hidden="true">
      🐉
    </div>
  )
}
