import { useEffect, useState } from 'react'
import type { AuthResponse, Session } from '@supabase/supabase-js'
import { recoveryLink, recoveryLinkError, supabase } from '../lib/supabase'

// Текущая сессия Supabase + методы регистрации/входа/выхода.
// Подписывается на onAuthStateChange, чтобы сессия обновлялась во всём приложении.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // «Человек пришёл по ссылке из письма и обязан задать новый пароль».
  // Начальное значение — из хеша (см. lib/supabase.ts), потому что событие
  // PASSWORD_RECOVERY supabase-js мог отправить ещё до того, как мы на него
  // подписались.
  const [recovering, setRecovering] = useState(recoveryLink)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Сеть недоступна или Supabase не отвечает — считаем пользователя неавторизованным,
      // а не оставляем экран в вечной загрузке.
      .catch(() => setSession(null))
      .finally(() => setLoading(false))

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  // Возвращает ответ signUp целиком: при включённом подтверждении email
  // Supabase создаёт user, но не выдаёт session — страница регистрации
  // должна отличить этот случай от обычного успешного входа.
  async function signUp(email: string, password: string, displayName: string): Promise<AuthResponse['data']> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error
    return data
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Письмо со ссылкой на смену пароля. Ссылка ведёт на корень приложения, а
  // не на отдельный маршрут: на GitHub Pages нет SPA-фолбэка, и любой глубокий
  // адрес отдал бы 404 раньше, чем приложение успело бы запуститься.
  async function sendPasswordReset(email: string) {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setRecovering(false)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setRecovering(false)
  }

  return {
    session,
    user: session?.user ?? null,
    loading,
    recovering,
    recoveryError: recoveryLinkError,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updatePassword,
  }
}
