import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminOnly } from '../App.jsx'
import AdminDashboardPage from './AdminDashboardPage.jsx'
import AdminUsersPage from './AdminUsersPage.jsx'

const { useAuthMock, getAdminDashboardMock, listAdminUsersMock, updateAdminUserStatusMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  getAdminDashboardMock: vi.fn(),
  listAdminUsersMock: vi.fn(),
  updateAdminUserStatusMock: vi.fn(),
}))

vi.mock('../context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('../services/adminService.js', () => ({
  getAdminDashboard: getAdminDashboardMock,
  listAdminUsers: listAdminUsersMock,
  updateAdminUserStatus: updateAdminUserStatusMock,
}))

const adminUser = { id: 'admin-id', name: 'Admin User', role: 'admin' }
const dashboardResult = {
  summary: {
    totalUsers: 12,
    activeUsers: 10,
    totalDocuments: 7,
    recentAuditEvents: 4,
  },
  auditEvents: [],
}
const account = {
  id: 'owner-id',
  name: 'Workspace Owner',
  email: 'owner@example.test',
  role: 'owner',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
}

function renderPage(page) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

function usersResult(status = 'active') {
  return {
    users: [{ ...account, status }],
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  }
}

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('administrator dashboard and user management', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ user: adminUser })
    getAdminDashboardMock.mockReset()
    listAdminUsersMock.mockReset()
    updateAdminUserStatusMock.mockReset()
  })

  afterEach(() => cleanup())

  it('shows loading while dashboard data is pending, then renders backend statistics and empty activity', async () => {
    let resolveDashboard
    getAdminDashboardMock.mockReturnValue(new Promise((resolve) => { resolveDashboard = resolve }))
    renderPage(<AdminDashboardPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading administrator dashboard')
    resolveDashboard(dashboardResult)

    await waitFor(() => {
      const totalUsersCard = screen.getByText('Total users').closest('article')
      const activeUsersCard = screen.getByText('Active users').closest('article')
      const documentsCard = screen.getByText('Total documents').closest('article')
      const auditCard = screen.getByText('Recent audit events').closest('article')
      expect(totalUsersCard).toHaveTextContent('12')
      expect(activeUsersCard).toHaveTextContent('10')
      expect(documentsCard).toHaveTextContent('7')
      expect(auditCard).toHaveTextContent('4')
    })
    expect(screen.getByText('No audit activity available')).toBeInTheDocument()
  })

  it('shows dashboard load errors and retries successfully', async () => {
    getAdminDashboardMock
      .mockRejectedValueOnce({ response: { data: { error: 'Dashboard unavailable' } } })
      .mockResolvedValueOnce(dashboardResult)
    const user = userEvent.setup()
    renderPage(<AdminDashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(getAdminDashboardMock).toHaveBeenCalledTimes(2)
  })

  it('renders the empty user-list state and recovers from a list API error', async () => {
    listAdminUsersMock
      .mockRejectedValueOnce({ response: { data: { error: 'User list unavailable' } } })
      .mockResolvedValueOnce({
        users: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      })
    const user = userEvent.setup()
    renderPage(<AdminUsersPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('User list unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No user accounts found')).toBeInTheDocument()
    expect(screen.getByText('0').parentElement).toHaveTextContent('registered accounts')
  })

  it('confirms account status changes and refreshes the list from the API', async () => {
    const pendingUpdate = deferred()
    listAdminUsersMock
      .mockResolvedValueOnce(usersResult('active'))
      .mockResolvedValueOnce(usersResult('disabled'))
    updateAdminUserStatusMock.mockReturnValue(pendingUpdate.promise)
    const user = userEvent.setup()
    renderPage(<AdminUsersPage />)

    expect(await screen.findByText('Workspace Owner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Disable' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/Disabling Workspace Owner/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Disable account' }))
    expect(within(dialog).getByRole('button', { name: 'Working…' })).toBeDisabled()
    pendingUpdate.resolve({ ...account, status: 'disabled' })

    await waitFor(() => {
      expect(updateAdminUserStatusMock).toHaveBeenCalledWith('owner-id', 'disabled')
      expect(listAdminUsersMock).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('disabled')).toBeInTheDocument()
  })

  it('shows status update errors and keeps the confirmation open for retry', async () => {
    listAdminUsersMock.mockResolvedValue(usersResult('active'))
    updateAdminUserStatusMock.mockRejectedValue({
      response: { data: { error: 'Status update rejected' } },
    })
    const user = userEvent.setup()
    renderPage(<AdminUsersPage />)

    await user.click(await screen.findByRole('button', { name: 'Disable' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Disable account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Status update rejected')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})

describe('admin route guard', () => {
  beforeEach(() => useAuthMock.mockReset())

  afterEach(() => cleanup())

  function renderGuardedRoute(user) {
    useAuthMock.mockReturnValue({ user, loading: false })
    return render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={<AdminOnly><h1>Admin dashboard</h1></AdminOnly>}
          />
          <Route path="/" element={<h1>Workspace home</h1>} />
          <Route path="/login" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('allows an authenticated admin and redirects a regular user away', () => {
    const { unmount } = renderGuardedRoute(adminUser)
    expect(screen.getByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument()
    unmount()

    renderGuardedRoute({ id: 'owner-id', role: 'owner' })
    expect(screen.getByRole('heading', { name: 'Workspace home' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument()
  })

  it('redirects unauthenticated users to sign in', () => {
    renderGuardedRoute(null)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
