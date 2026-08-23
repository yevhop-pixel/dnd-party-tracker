import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Отсутствие переменных окружения не должно валить всё приложение белым
// экраном при импорте модуля — сообщение показывает первая страница,
// куда попадает гость (см. Login.tsx).
export const configError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Приложение не настроено: нет VITE_SUPABASE_URL и/или VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env и заполните значениями из настроек проекта Supabase (Project Settings → API).'
    : null

// Ссылка из письма «смените пароль» приходит с #type=recovery, а при
// просроченной ссылке — с #error=...&error_description=... Разбирает и СТИРАЕТ
// этот хеш сам supabase-js в момент создания клиента, то есть задолго до того,
// как смонтируется React. Поэтому признак снимаем прямо здесь, строкой выше
// createClient — иначе экран смены пароля просто не о чем было бы показывать.
const hash = typeof window === 'undefined' ? '' : window.location.hash
export const recoveryLink = /[#&]type=recovery/.test(hash)
export const recoveryLinkError = (() => {
  const m = /[#&]error_description=([^&]*)/.exec(hash)
  if (!m) return ''
  const text = decodeURIComponent(m[1].replace(/\+/g, ' '))
  // Единственная ошибка, которую человек увидит в жизни, — просроченная или
  // уже использованная ссылка; остальное показываем как есть.
  return /expired|invalid/i.test(text) ? 'Ссылка устарела или уже использована' : text
})()

// При отсутствующих переменных createClient всё равно получает строки —
// клиент создаётся нерабочим, но не бросает исключение при импорте модуля.
// Пустая строка вместо URL не годится: createClient бросает Error ещё до
// рендера React (валит приложение белым экраном, не давая показать
// configError), поэтому подсовываем заведомо валидный, но нерабочий URL.
// persistSession/autoRefreshToken — значения по умолчанию SDK, но прописаны
// явно, чтобы поведение (аккаунт запоминается на устройстве) не зависело от
// смены дефолтов в будущих версиях библиотеки. storageKey намеренно не
// переопределён — используется дефолтный вида sb-<ref>-auth-token; смена
// ключа разлогинила бы всех уже вошедших пользователей.
export const supabase = createClient(supabaseUrl || 'https://invalid.invalid', supabaseAnonKey || 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
