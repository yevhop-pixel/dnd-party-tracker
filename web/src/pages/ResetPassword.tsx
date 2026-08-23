// Экран «задайте новый пароль». Показывается, когда человек пришёл по ссылке
// из письма: supabase-js к этому моменту уже разобрал хеш и выдал временную
// сессию, поэтому updateUser({ password }) сработает без старого пароля.
//
// Экран рисуется ВМЕСТО роутера (см. App.tsx): пока пароль не задан, ходить по
// приложению незачем, а уйти с этого экрана и потерять одноразовую сессию —
// значит начинать восстановление заново.
import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../App'

const MIN_LENGTH = 6

export default function ResetPassword() {
  const { session, loading, recoveryError, updatePassword, signOut } = useAuthContext()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <div className="app-loading">Загрузка…</div>

  // Ссылка просрочена, уже использована или испорчена почтовым клиентом —
  // сессии нет, менять пароль нечем. Отправляем за новым письмом.
  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Ссылка не сработала</h1>
          <p className="auth-error">{recoveryError || 'Ссылка устарела или уже была использована'}</p>
          <p>Ссылка живёт около часа и срабатывает один раз. Запросите новую на экране входа.</p>
          <button type="button" onClick={() => void signOut().finally(() => window.location.reload())}>
            К входу
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Пароль изменён</h1>
          <p>Новый пароль уже действует — вы вошли под ним.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Продолжить
          </button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) {
      setError(`Пароль короче ${MIN_LENGTH} символов`)
      return
    }
    if (password !== repeat) {
      setError('Пароли не совпадают')
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить пароль')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Новый пароль</h1>
        <p>{session.user.email}</p>

        <label className="field">
          Новый пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            minLength={MIN_LENGTH}
            required
          />
        </label>

        <label className="field">
          Ещё раз
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Сохраняем…' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  )
}
