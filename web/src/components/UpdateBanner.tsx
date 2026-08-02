// Плашка «вышла новая версия». Нужна потому, что вкладку с приложением
// держат открытой весь вечер игры: после моего деплоя у людей в браузере
// продолжает работать старый бандл, и они не понимают, почему у соседа
// кнопка есть, а у них нет.
//
// Проверяем не через service worker (он обновляется только когда меняется
// сам его файл — а он меняется редко), а прямым сравнением: тянем index.html
// с сервера и смотрим, тот же ли главный js-файл. Имя файла содержит хеш
// содержимого, так что любое изменение кода даёт новое имя.
import { useEffect, useState } from 'react'

// Минута, а не пять: за столом деплой прилетает посреди игры, и ждать пять
// минут «почему у меня нет кнопки» — ровно та ситуация, ради которой плашка
// и делалась. Запрос — один маленький index.html.
const CHECK_EVERY_MS = 60 * 1000

function currentBundle(): string | null {
  const script = [...document.querySelectorAll('script[type="module"][src]')]
    .map((s) => (s as HTMLScriptElement).src)
    .find((src) => src.includes('/assets/'))
  return script ?? null
}

async function latestBundle(): Promise<string | null> {
  // no-store: иначе браузер (и наш же service worker) вернут ту самую
  // страницу, с которой мы и грузились, и обновление никогда не заметится.
  const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
  if (!res.ok) return null
  const html = await res.text()
  const match = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)
  if (!match) return null
  return new URL(match[1], window.location.origin).href
}

export default function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const mine = currentBundle()
    if (!mine) return
    let cancelled = false

    async function check() {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        const latest = await latestBundle()
        if (!cancelled && latest && latest !== mine) setStale(true)
      } catch {
        // Нет сети — не наше дело, проверим в следующий раз.
      }
    }

    const timer = window.setInterval(check, CHECK_EVERY_MS)
    // Вернулись на вкладку — самый вероятный момент, когда деплой уже прошёл.
    document.addEventListener('visibilitychange', check)
    void check()
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!stale) return null

  return (
    <div className="update-banner" role="status">
      <span>✨ Вышла новая версия приложения</span>
      <button type="button" onClick={() => window.location.reload()}>
        Обновить
      </button>
    </div>
  )
}
