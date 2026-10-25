import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'
import RegisterPage from './RegisterPage.jsx'
import ForgotPasswordPage from './ForgotPasswordPage.jsx'

const { useAuthMock, verifyTwoFactorLoginMock, requestPasswordResetMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  verifyTwoFactorLoginMock: vi.fn(),
  requestPasswordResetMock: vi.fn(),
}))

vi.mock('../context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('../services/authService.js', () => ({
  verifyTwoFactorLogin: verifyTwoFactorLoginMock,
  requestPasswordReset: requestPasswordResetMock,
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
    requestPasswordResetMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
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

  it('enforces required registration fields before calling the API', async () => {
    const register = vi.fn()
    useAuthMock.mockReturnValue({ register })
    const user = userEvent.setup()

    renderPage(<RegisterPage />)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByLabelText('Full name')).toBeInvalid()
    expect(register).not.toHaveBeenCalled()
  })

  it('submits valid registration details', async () => {
    const register = vi.fn().mockResolvedValue({ id: 'user-1' })
    useAuthMock.mockReturnValue({ register })
    const user = userEvent.setup()

    renderPage(<RegisterPage />)
    expect(screen.getByRole('heading', { name: 'Your Security Starts Here.' })).toBeInTheDocument()
    expect(screen.getByText('Create your secure digital space.')).toBeInTheDocument()
    expect(screen.getByText('Keep your files private and your access under control.')).toBeInTheDocument()
    expect(screen.getByText('Your trust deserves strong protection.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Full name'), ' Test User ')
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText(/At least 12 characters/), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(register).toHaveBeenCalledWith({
      name: 'Test User',
      email: 'test@example.test',
      password: 'A sufficiently long password',
    }))
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

  it('toggles password visibility without submitting the login form', async () => {
    const login = vi.fn()
    useAuthMock.mockReturnValue({ login })
    const user = userEvent.setup()

    renderPage(<LoginPage />)
    const password = screen.getByLabelText('Password')
    await user.type(password, 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))

    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
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

    const submit = screen.getByRole('button', { name: /authenticating/i })
    expect(submit).toBeDisabled()
    expect(submit.querySelector('.login-lock-icon')).toBeInTheDocument()
    expect(login).toHaveBeenCalledTimes(1)

    pending.reject({ response: { status: 401, data: { error: 'Invalid credentials' } } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password. Check your credentials and try again.',
    )
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('shows lock progress then confirms success before accepting the session', async () => {
    const pending = deferred()
    const login = vi.fn(() => pending.promise)
    const completeLogin = vi.fn()
    useAuthMock.mockReturnValue({ login, completeLogin })
    const user = userEvent.setup()

    renderPage(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('button', { name: /authenticating/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /authenticating/i })).toHaveTextContent('Authenticating...')
    expect(completeLogin).not.toHaveBeenCalled()

    pending.resolve({ token: 'test-token', user: { id: 'user-1' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /authenticated/i })).toBeInTheDocument())
    expect(completeLogin).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(completeLogin).toHaveBeenCalledWith({ token: 'test-token', user: { id: 'user-1' } })
    }, { timeout: 1000 })
  })

  it('requires the authenticator step before completing a two-factor login', async () => {
    const login = vi.fn().mockResolvedValue({
      requiresTwoFactor: true,
      challengeToken: 'fixture-challenge',
    })
    const completeLogin = vi.fn()
    const completeTwoFactorLogin = vi.fn((data) => data)
    verifyTwoFactorLoginMock.mockResolvedValue({
      data: { token: 'fixture-token', user: { id: 'user-1', name: 'Test User' } },
    })
    useAuthMock.mockReturnValue({ login, completeLogin, completeTwoFactorLogin })
    const user = userEvent.setup()

    renderPage(<LoginPage />)
    await user.type(screen.getByLabelText('Email address'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter the 6-digit code from your authenticator app.')).toBeInTheDocument()
    expect(completeLogin).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Authenticator code'), '123456')
    await user.click(screen.getByRole('button', { name: /verify and continue/i }))

    expect(verifyTwoFactorLoginMock).toHaveBeenCalledWith({
      challengeToken: 'fixture-challenge',
      code: '123456',
    })
    expect(await screen.findByRole('button', { name: /authenticated/i })).toBeInTheDocument()
    await waitFor(() => expect(completeLogin).toHaveBeenCalledWith({
      token: 'fixture-token',
      user: { id: 'user-1', name: 'Test User' },
    }), { timeout: 1000 })
  })

  it('requires a valid email before requesting a password reset', async () => {
    const user = userEvent.setup()
    renderPage(<ForgotPasswordPage />)

    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(screen.getByLabelText('Email address')).toBeInvalid()
    expect(requestPasswordResetMock).not.toHaveBeenCalled()
  })

  it('shows password-reset success feedback and disables submission while pending', async () => {
    const pending = deferred()
    requestPasswordResetMock.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    renderPage(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText('Email address'), ' user@example.test ')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(screen.getByRole('button', { name: /sending link/i })).toBeDisabled()
    expect(requestPasswordResetMock).toHaveBeenCalledWith('user@example.test')
    pending.resolve({ data: { message: 'If the account exists, a reset link has been sent.' } })

    expect(await screen.findByRole('status')).toHaveTextContent('If the account exists, a reset link has been sent.')
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeEnabled()
  })

  it('shows password-reset API errors accessibly', async () => {
    requestPasswordResetMock.mockRejectedValue({
      response: { status: 500, data: { error: 'Internal failure' } },
    })
    const user = userEvent.setup()
    renderPage(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText('Email address'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not process your request. Please try again later.')
  })
})
