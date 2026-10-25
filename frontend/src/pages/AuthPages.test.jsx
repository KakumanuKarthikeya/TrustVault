import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'
import RegisterPage from './RegisterPage.jsx'

const { useAuthMock, verifyTwoFactorLoginMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  verifyTwoFactorLoginMock: vi.fn(),
}))

vi.mock('../context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('../services/authService.js', () => ({
  verifyTwoFactorLogin: verifyTwoFactorLoginMock,
}))

function renderPage(page) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('authentication page feedback', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthMock.mockReset()
    verifyTwoFactorLoginMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows backend registration validation errors accessibly', async () => {
    const register = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Invalid request body' },
      },
    })
    useAuthMock.mockReturnValue({ register })
    const user = userEvent.setup()

    renderPage(<RegisterPage />)
    await user.type(screen.getByLabelText('Full name'), 'Test User')
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText(/At least 12 characters/), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request body')
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('shows client-side password mismatch and does not call registration', async () => {
    const register = vi.fn()
    useAuthMock.mockReturnValue({ register })
    const user = userEvent.setup()

    renderPage(<RegisterPage />)
    await user.type(screen.getByLabelText('Full name'), 'Test User')
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText(/At least 12 characters/), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm password'), 'A different long password')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(register).not.toHaveBeenCalled()
  })

  it('disables registration and shows progress while the API request is pending', async () => {
    const pending = deferred()
    const register = vi.fn(() => pending.promise)
    useAuthMock.mockReturnValue({ register })
    const user = userEvent.setup()

    renderPage(<RegisterPage />)
    await user.type(screen.getByLabelText('Full name'), 'Test User')
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText(/At least 12 characters/), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    const submit = screen.getByRole('button', { name: /creating account/i })
    expect(submit).toBeDisabled()
    expect(register).toHaveBeenCalledTimes(1)

    pending.resolve()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled()
    })
  })

  it('shows backend login validation errors accessibly', async () => {
    const login = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Invalid request body' },
      },
    })
    useAuthMock.mockReturnValue({ login })
    const user = userEvent.setup()

    renderPage(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request body')
    expect(login).toHaveBeenCalledTimes(1)
  })

  it('disables login and shows progress while the API request is pending', async () => {
    const pending = deferred()
    const login = vi.fn(() => pending.promise)
    useAuthMock.mockReturnValue({ login })
    const user = userEvent.setup()

    renderPage(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const submit = screen.getByRole('button', { name: /verifying/i })
    expect(submit).toBeDisabled()
    expect(login).toHaveBeenCalledTimes(1)

    pending.reject({ response: { status: 401, data: { error: 'Invalid credentials' } } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password. Check your credentials and try again.',
    )
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled()
  })
})
