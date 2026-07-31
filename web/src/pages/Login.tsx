import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../App'
import { configError } from '../lib/supabase'

export default function Login() {
  const { session, loading, signIn } = useAuthContext()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Нет ключей Supabase — дальше всё равно ничего не заработает,
  // показываем понятный экран вместо белого экрана/непонятных ошибок сети.
  if (configError) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Приложение не настроено</h1>
          <p className="auth-error">{configError}</p>
        </div>
      </div>
    )
  }

  // Пока сессия не проверена — не показываем форму, чтобы она не мигала
  // у уже залогиненного пользователя перед редиректом.
  if (loading) return null
  // Уже вошедшему пользователю здесь делать нечего.
  if (session) return <Navigate to="/campaigns" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/campaigns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Вход</h1>

        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            minLength={6}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <p className="auth-switch">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  )
}
