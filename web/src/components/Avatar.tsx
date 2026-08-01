import { useEffect, useState } from 'react'
import { getAvatarUrl } from '../lib/avatars'

interface AvatarProps {
  path: string | null
  name: string
  size?: number
}

// Палитра фонов для заглушки без фото — детерминированно выбирается по
// имени, чтобы у одного персонажа цвет не менялся между перерисовками.
const PALETTE = ['#7c5cff', '#ff6b6b', '#2fb673', '#e0a52c', '#3fa9e0', '#d867d0', '#7a8a99']

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

// Круглый аватар персонажа. Пока подписанная ссылка не готова, файла нет
// (path === null) или загрузка картинки провалилась — показываем заглушку
// с первой буквой имени на цветном фоне. Кэш подписанных ссылок — в
// lib/avatars.ts, чтобы несколько Avatar с одним path не подписывали его
// повторно.
export default function Avatar({ path, name, size = 40 }: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!path) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const attempt = (retriesLeft: number) => {
      getAvatarUrl(path)
        .then((signedUrl) => {
          if (!cancelled) setUrl(signedUrl)
        })
        .catch(() => {
          // Сразу после загрузки файла avatar_path ещё едет в базу через
          // debounce-автосейв, и политика чтения его пока не пропускает —
          // одна повторная попытка через пару секунд закрывает эту гонку.
          if (cancelled) return
          if (retriesLeft > 0) {
            retryTimer = setTimeout(() => attempt(retriesLeft - 1), 2000)
          } else {
            setFailed(true)
          }
        })
    }
    attempt(1)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [path])

  const style = { width: size, height: size }

  if (path && url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        className="avatar-img"
        style={style}
        onError={() => setFailed(true)}
      />
    )
  }

  const letter = (name.trim()[0] || '?').toUpperCase()
  return (
    <div className="avatar-fallback" style={{ ...style, background: colorForName(name), fontSize: size * 0.42 }}>
      {letter}
    </div>
  )
}
