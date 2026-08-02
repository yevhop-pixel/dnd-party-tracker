// Service worker: без него браузер не предлагает «Установить приложение», и
// сайт не открывается офлайн. Собирается не Vite'ом, а лежит как есть в
// public/ — поэтому здесь обычный JS без импортов и без сборки.

const CACHE = 'dnd-tracker-v1'
// Область действия = папка, в которой лежит сам sw.js (у нас подпапка
// /dnd-party-tracker/), поэтому пути считаем от registration.scope.
const SCOPE = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  // Кладём оболочку сразу, чтобы первый офлайн-запуск не упал.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SCOPE, `${SCOPE}manifest.webmanifest`]))
      .catch(() => {
        /* нет сети на установке — не повод падать */
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // supabase, giphy — мимо кэша

  // HTML — только сеть, кэш лишь как аварийный запасной: иначе после деплоя
  // человек неделю сидел бы на старой версии.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(SCOPE, copy))
          return res
        })
        .catch(() => caches.match(SCOPE).then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Статика: имена собранных файлов содержат хеш, а гифки не меняются —
  // отдаём из кэша сразу и тихо обновляем в фоне.
  if (url.pathname.includes('/assets/') || url.pathname.includes('/crit/') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
          .catch(() => cached ?? Response.error())
        return cached ?? network
      }),
    )
  }
})
