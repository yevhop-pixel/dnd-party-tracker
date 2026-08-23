import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../App'
import { configError } from '../lib/supabase'

export default function Login() {
  const { session, loading, signIn, sendPasswordReset } = useAuthContext()
  const navigate = useNavigate()

  const lastEmail = localStorage.getItem('dnd-last-email') ?? ''
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Восстановление пароля: свёрнуто, пока не понадобится.
  const [resetOpen, setResetOpen] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')

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
      localStorage.setItem('dnd-last-email', email)
      navigate('/campaigns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReset() {
    const address = email.trim()
    if (!address) {
      setResetError('Впишите адрес, на который зарегистрирован аккаунт')
      return
    }
    setResetBusy(true)
    setResetError('')
    try {
      await sendPasswordReset(address)
      // Ответ одинаков и для существующего адреса, и для чужого: иначе форма
      // превращается в способ проверять, кто зарегистрирован в приложении.
      setResetSent(true)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Не удалось отправить письмо')
    } finally {
      setResetBusy(false)
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
            autoFocus={!!lastEmail}
            minLength={6}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        {!resetOpen && (
          <button type="button" className="auth-link-btn" onClick={() => setResetOpen(true)}>
            Забыли пароль?
          </button>
        )}

        {resetOpen && (
          <div className="auth-reset">
            {resetSent ? (
              <p>
                Если на <b>{email.trim()}</b> есть аккаунт, письмо со ссылкой уже ушло. Ссылка живёт
                около часа и срабатывает один раз. Проверьте папку «Спам».
              </p>
            ) : (
              <>
                <p>Пришлём ссылку на адрес из поля выше — по ней можно задать новый пароль.</p>
                {resetError && <p className="auth-error">{resetError}</p>}
                <div className="auth-reset-actions">
                  <button type="button" disabled={resetBusy} onClick={() => void handleReset()}>
                    {resetBusy ? 'Отправляем…' : 'Прислать ссылку'}
                  </button>
                  <button type="button" className="auth-link-btn" onClick={() => setResetOpen(false)}>
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <p className="auth-switch">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  )
}
