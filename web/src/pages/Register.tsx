import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../App'

export default function Register() {
  const { session, loading, signUp } = useAuthContext()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Заполняется, когда signUp создал user, но не выдал session — включено
  // подтверждение email, и до логина ещё нужно перейти по ссылке из письма.
  const [confirmationMessage, setConfirmationMessage] = useState('')

  // Пока сессия не проверена — не показываем форму, чтобы она не мигала
  // у уже залогиненного пользователя перед редиректом.
  if (loading) return null
  if (session) return <Navigate to="/campaigns" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setConfirmationMessage('')
    setSubmitting(true)
    try {
      const data = await signUp(email, password, displayName)
      if (data.user && !data.session) {
        // Подтверждение email включено в проекте Supabase — сессии ещё нет,
        // редиректить некуда, пользователь должен сначала подтвердить почту.
        setConfirmationMessage('Регистрация принята. Проверьте почту и подтвердите адрес, затем войдите.')
        return
      }
      navigate('/campaigns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось зарегистрироваться')
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmationMessage) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Регистрация</h1>
          <p>{confirmationMessage}</p>
          <p className="auth-switch">
            <Link to="/login">Перейти ко входу</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Регистрация</h1>

        <label className="field">
          Имя
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            required
          />
        </label>

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
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Регистрируем…' : 'Зарегистрироваться'}
        </button>

        <p className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  )
}
