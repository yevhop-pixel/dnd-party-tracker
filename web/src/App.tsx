import { createContext, useContext, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import CampaignPicker from './pages/CampaignPicker'
import PlayerView from './pages/PlayerView'
import GmView from './pages/GmView'
import SheetEditor from './pages/SheetEditor'

// Сессия и методы авторизации доступны всем страницам через контекст,
// чтобы не плодить отдельные подписки на onAuthStateChange в каждой странице.
type AuthContextValue = ReturnType<typeof useAuth>
const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext должен использоваться внутри <App>')
  return ctx
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuthContext()
  if (loading) return <div className="app-loading">Загрузка…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const auth = useAuth()

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/campaigns"
            element={
              <RequireAuth>
                <CampaignPicker />
              </RequireAuth>
            }
          />
          <Route
            path="/play/:campaignId"
            element={
              <RequireAuth>
                <PlayerView />
              </RequireAuth>
            }
          />
          <Route
            path="/gm/:campaignId"
            element={
              <RequireAuth>
                <GmView />
              </RequireAuth>
            }
          />
          <Route
            path="/sheet/:sheetId"
            element={
              <RequireAuth>
                <SheetEditor />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/campaigns" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
