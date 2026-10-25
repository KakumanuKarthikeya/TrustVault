import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage.jsx'

const {
  useAuthMock,
  changePasswordMock,
  disableTwoFactorMock,
  getTwoFactorStatusMock,
  setupTwoFactorMock,
  verifyTwoFactorSetupMock,
  qrToDataUrlMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  changePasswordMock: vi.fn(),
  disableTwoFactorMock: vi.fn(),
  getTwoFactorStatusMock: vi.fn(),
  setupTwoFactorMock: vi.fn(),
  verifyTwoFactorSetupMock: vi.fn(),
  qrToDataUrlMock: vi.fn(),
}))

vi.mock('../context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('../services/authService.js', () => ({
  changePassword: changePasswordMock,
  disableTwoFactor: disableTwoFactorMock,
  getTwoFactorStatus: getTwoFactorStatusMock,
  setupTwoFactor: setupTwoFactorMock,
  verifyTwoFactorSetup: verifyTwoFactorSetupMock,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: qrToDataUrlMock } }))

const account = { id: 'user-1', name: 'Test User', email: 'test@example.test', role: 'user' }
let twoFactorStatus

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>)
}

describe('account security settings', () => {
  beforeEach(() => {
    twoFactorStatus = { available: true, enabled: false, setupInProgress: false }
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({
      user: account,
      replaceAccessToken: vi.fn(),
      logout: vi.fn(),
    })
    changePasswordMock.mockReset()
    disableTwoFactorMock.mockReset()
    getTwoFactorStatusMock.mockReset().mockImplementation(async () => ({ data: twoFactorStatus }))
    setupTwoFactorMock.mockReset().mockResolvedValue({ data: { otpauthUri: 'otpauth://totp/test' } })
    verifyTwoFactorSetupMock.mockReset().mockImplementation(async () => {
      twoFactorStatus = { available: true, enabled: true, setupInProgress: false }
    })
    qrToDataUrlMock.mockReset().mockResolvedValue('data:image/png;base64,qr-image')
  })

  afterEach(() => cleanup())

  it('rejects mismatched new passwords without calling the password API', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'current-password')
    await user.type(screen.getByLabelText('New password'), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm new password'), 'A different long password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The new passwords do not match.')
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('reports backend change-password errors', async () => {
    changePasswordMock.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'incorrect-password')
    await user.type(screen.getByLabelText('New password'), 'A sufficiently long password')
    await user.type(screen.getByLabelText('Confirm new password'), 'A sufficiently long password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect')
  })

  it('shows unavailable 2FA accurately and disables setup', async () => {
    twoFactorStatus = { available: false, enabled: false, setupInProgress: false }
    renderPage()

    expect(await screen.findByText('Unavailable: configure TOTP_ENCRYPTION_KEY on the backend.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up 2FA' })).toBeDisabled()
  })

  it('generates setup QR, verifies the code, and displays enabled status', async () => {
    const user = userEvent.setup()
    renderPage()
    const setupButton = await screen.findByRole('button', { name: 'Set up 2FA' })
    await user.click(setupButton)

    expect(await screen.findByRole('img', { name: 'Authenticator app setup QR code' })).toHaveAttribute('src', 'data:image/png;base64,qr-image')
    await user.type(screen.getByLabelText('6-digit authenticator code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify and enable 2FA' }))

    expect(verifyTwoFactorSetupMock).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('Enabled for this account.')).toBeInTheDocument()
    expect(await screen.findByText('Two-factor authentication is enabled.')).toBeInTheDocument()
  })

  it('requires the password and a code to disable enabled 2FA', async () => {
    twoFactorStatus = { available: true, enabled: true, setupInProgress: false }
    disableTwoFactorMock.mockResolvedValue({ data: { token: 'refreshed-token' } })
    const user = userEvent.setup()
    renderPage()

    const disableButton = await screen.findByRole('button', { name: 'Disable 2FA' })
    await user.click(disableButton)
    await user.type(screen.getByLabelText('Current password'), 'current-password')
    await user.type(screen.getByLabelText('6-digit authenticator code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Confirm disable' }))

    await waitFor(() => expect(disableTwoFactorMock).toHaveBeenCalledWith({
      currentPassword: 'current-password',
      code: '654321',
    }))
  })
})
