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

// При отсутствующих переменных createClient всё равно получает строки —
// клиент создаётся нерабочим, но не бросает исключение при импорте модуля.
// Пустая строка вместо URL не годится: createClient бросает Error ещё до
// рендера React (валит приложение белым экраном, не давая показать
// configError), поэтому подсовываем заведомо валидный, но нерабочий URL.
export const supabase = createClient(supabaseUrl || 'https://invalid.invalid', supabaseAnonKey || 'invalid')
