import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext.jsx'
import { useAuth } from './useAuth.js'

const { getCurrentUserMock, loginRequestMock, logoutRequestMock, registerRequestMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  loginRequestMock: vi.fn(),
  logoutRequestMock: vi.fn(),
  registerRequestMock: vi.fn(),
}))

vi.mock('../services/authService.js', () => ({
  getCurrentUser: getCurrentUserMock,
  loginRequest: loginRequestMock,
  logoutRequest: logoutRequestMock,
  registerRequest: registerRequestMock,
}))

function AuthProbe() {
  const auth = useAuth()
  return (
    <div>
      <output data-testid="user-name">{auth.user?.name || 'Signed out'}</output>
      <button onClick={() => auth.login({ email: 'test@example.test', password: 'fixture-password' })}>Login</button>
      <button onClick={() => auth.logout().catch(() => {})}>Logout</button>
    </div>
  )
}

function renderProvider() {
  return render(<AuthProvider><AuthProbe /></AuthProvider>)
}

describe('authentication session handling', () => {
  beforeEach(() => {
    sessionStorage.clear()
    getCurrentUserMock.mockReset()
    loginRequestMock.mockReset()
    logoutRequestMock.mockReset()
    registerRequestMock.mockReset()
  })

  afterEach(() => cleanup())

  it('stores a successful login session and clears it only after logout succeeds', async () => {
    loginRequestMock.mockResolvedValue({
      data: { token: 'fixture-token', user: { id: 'user-1', name: 'Test User' } },
    })
    getCurrentUserMock.mockResolvedValue({ data: { user: { id: 'user-1', name: 'Test User' } } })
    logoutRequestMock.mockResolvedValue({})
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Test User'))
    expect(sessionStorage.getItem('trustvault_access_token')).toBe('fixture-token')

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Signed out'))
    expect(logoutRequestMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('trustvault_access_token')).toBeNull()
  })

  it('clears the local session when an unauthorized response is broadcast', async () => {
    sessionStorage.setItem('trustvault_access_token', 'fixture-token')
    getCurrentUserMock.mockResolvedValue({ data: { user: { id: 'user-1', name: 'Test User' } } })
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Test User'))
    window.dispatchEvent(new Event('trustvault:unauthorized'))

    await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Signed out'))
    expect(sessionStorage.getItem('trustvault_access_token')).toBeNull()
  })

  it('retains the local session when the logout request fails', async () => {
    sessionStorage.setItem('trustvault_access_token', 'fixture-token')
    getCurrentUserMock.mockResolvedValue({ data: { user: { id: 'user-1', name: 'Test User' } } })
    logoutRequestMock.mockRejectedValue({ response: { data: { error: 'Logout unavailable' } } })
    const user = userEvent.setup()
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Test User'))
    await user.click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByTestId('user-name')).toHaveTextContent('Test User')
    expect(sessionStorage.getItem('trustvault_access_token')).toBe('fixture-token')
  })
})
