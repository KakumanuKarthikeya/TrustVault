import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth.js'
import AppLayout from './layouts/AppLayout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import AuditHistoryPage from './pages/AuditHistoryPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import { ErrorState, LoadingState } from './components/StateViews.jsx'

function ProtectedShell() {
  const { user, loading, bootstrapError, retryBootstrap, clearSession } = useAuth()

  if (loading) return <LoadingState label="Checking your secure session…" />
  if (bootstrapError) {
    return (
      <main className="auth-bootstrap">
        <ErrorState message={bootstrapError} onRetry={retryBootstrap} />
        <button className="button button-secondary" onClick={clearSession}>Continue to sign in</button>
      </main>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout><Outlet /></AppLayout>
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState label="Checking your secure session…" />
  return user ? <Navigate to="/" replace /> : children
}

export function AdminOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState label="Checking administrator access…" />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage key="all" scope="all" />} />
        <Route path="my-documents" element={<DocumentsPage key="owned" scope="owned" />} />
        <Route path="shared" element={<DocumentsPage key="shared" scope="shared" />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="audit" element={<AdminOnly><AuditHistoryPage /></AdminOnly>} />
        <Route path="admin" element={<AdminOnly><AdminDashboardPage /></AdminOnly>} />
        <Route path="admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<main className="page"><h1>Page not found</h1></main>} />
      </Route>
    </Routes>
  )
}

export default App
