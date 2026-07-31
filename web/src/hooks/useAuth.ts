import { useEffect, useState } from 'react'
import type { AuthResponse, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Текущая сессия Supabase + методы регистрации/входа/выхода.
// Подписывается на onAuthStateChange, чтобы сессия обновлялась во всём приложении.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Сеть недоступна или Supabase не отвечает — считаем пользователя неавторизованным,
      // а не оставляем экран в вечной загрузке.
      .catch(() => setSession(null))
      .finally(() => setLoading(false))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
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

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { session, user: session?.user ?? null, loading, signUp, signIn, signOut }
}
