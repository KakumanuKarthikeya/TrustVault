import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App.jsx'

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }))
vi.mock('./context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('./layouts/AppLayout.jsx', () => ({
  default: ({ children }) => <div data-testid="app-layout">{children}</div>,
}))

vi.mock('./pages/LoginPage.jsx', () => ({ default: () => <h1>Login page</h1> }))
vi.mock('./pages/RegisterPage.jsx', () => ({ default: () => <h1>Register page</h1> }))
vi.mock('./pages/ForgotPasswordPage.jsx', () => ({ default: () => <h1>Forgot password page</h1> }))
vi.mock('./pages/ResetPasswordPage.jsx', () => ({ default: () => <h1>Reset password page</h1> }))
vi.mock('./pages/DashboardPage.jsx', () => ({ default: () => <h1>Dashboard page</h1> }))
vi.mock('./pages/DocumentsPage.jsx', () => ({ default: () => <h1>Documents page</h1> }))
vi.mock('./pages/UploadPage.jsx', () => ({ default: () => <h1>Upload page</h1> }))
vi.mock('./pages/AuditHistoryPage.jsx', () => ({ default: () => <h1>Audit history page</h1> }))
vi.mock('./pages/SettingsPage.jsx', () => ({ default: () => <h1>Settings page</h1> }))
vi.mock('./pages/AdminDashboardPage.jsx', () => ({ default: () => <h1>Admin dashboard page</h1> }))
vi.mock('./pages/AdminUsersPage.jsx', () => ({ default: () => <h1>Admin users page</h1> }))

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <CurrentPath />
    </MemoryRouter>,
  )
}

describe('application route access', () => {
  beforeEach(() => useAuthMock.mockReset())
  afterEach(() => cleanup())

  it('redirects unauthenticated users from protected pages to login', async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderApp('/settings')

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/login'))
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  it('redirects an authenticated user away from the public login page', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: 'user' },
      loading: false,
    })
    renderApp('/login')

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/'))
    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
    expect(screen.getByTestId('app-layout')).toBeInTheDocument()
  })
})
