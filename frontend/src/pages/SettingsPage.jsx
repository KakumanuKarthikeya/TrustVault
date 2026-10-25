import { useEffect, useState } from 'react'
import { Bell, Check, Copy, Database, LockKeyhole, UserRound, ShieldCheck, LogOut, LoaderCircle } from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import QRCode from 'qrcode'
import {
  changePassword,
  disableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
  verifyTwoFactorSetup,
} from '../services/authService.js'

const tabs = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: LockKeyhole },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'storage', label: 'Storage', icon: Database },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('profile')
  const [copyState, setCopyState] = useState('')

  async function copyAccountId() {
    setCopyState('')
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(user.id)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <main className="page settings-page">
      <div className="page-heading"><div><h1>Profile &amp; settings</h1><p>Manage your personal details and account security.</p></div></div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="settings-content">
          {tab === 'profile' && (
            <>
              <section className="panel settings-panel">
                <div className="panel-heading"><div><h2>Profile details</h2><p>Information returned for your signed-in account.</p></div><span className="avatar settings-avatar">{user.name?.slice(0, 1).toUpperCase()}</span></div>
                <div className="settings-fields">
                  <label>Full name<input readOnly value={user.name || ''} /></label>
                  <label>Email address<input readOnly value={user.email || ''} /></label>
                  <label>Account role<input readOnly value={user.role || ''} /></label>
                  <label>Account status<input readOnly value={user.status || ''} /></label>
                  <label className="settings-account-id-field">Account ID
                    <span className="settings-account-id">
                      <input readOnly value={user.id || ''} aria-label="Account ID" />
                      <button className="button button-secondary" type="button" onClick={copyAccountId} disabled={!user.id}>
                        {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                        {copyState === 'copied' ? 'Copied' : 'Copy'}
                      </button>
                    </span>
                    {copyState === 'error' && <small className="form-error" role="alert">Could not copy the account ID. Select and copy it manually.</small>}
                    {copyState === 'copied' && <small className="settings-copy-success" role="status">Account ID copied.</small>}
                  </label>
                </div>
                <p className="settings-unavailable">Profile editing is not available: the backend has no profile-update endpoint.</p>
              </section>
              <SecurityPanel />
            </>
          )}
          {tab === 'security' && <SecurityPanel />}
          {tab === 'notifications' && <UnavailablePanel icon={Bell} title="Notification preferences" message="Notification settings are not available because the backend does not expose a notification preferences API." />}
          {tab === 'storage' && <UnavailablePanel icon={Database} title="Storage" message="The backend does not provide storage quotas or account storage settings. Document sizes are shown from accessible document metadata." />}
          <div className="settings-actions"><button className="button button-secondary" onClick={() => setTab('profile')}>Cancel</button><button className="button button-primary" disabled title="Profile updates are not supported by the backend">Save changes</button></div>
        </div>
      </div>
    </main>
  )
}

function SecurityPanel() {
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  return (
    <section className="panel settings-panel">
      <div className="panel-heading"><div><h2>Account security</h2><p>Security features available for this account.</p></div></div>
      <div className="security-row"><span className="security-icon"><LockKeyhole size={17} /></span><span><strong>Password</strong><small>Change your password after verifying your current one.</small></span><button className="button button-secondary" type="button" onClick={() => setShowPasswordForm((shown) => !shown)}>{showPasswordForm ? 'Cancel' : 'Change password'}</button></div>
      {showPasswordForm && <PasswordChangeForm />}
      <TwoFactorPanel />
      <div className="security-row"><span className="security-icon"><LogOut size={17} /></span><span><strong>Current session</strong><small>Sign out revokes this access token on the backend.</small></span><SignOutButton /></div>
      <p className="settings-unavailable">Active-session inventory and remote session management are not supported.</p>
    </section>
  )
}

function TwoFactorPanel() {
  const { replaceAccessToken } = useAuth()
  const [status, setStatus] = useState(null)
  const [qrCode, setQrCode] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refreshStatus() {
    const { data } = await getTwoFactorStatus()
    setStatus(data)
    return data
  }

  useEffect(() => {
    let active = true
    getTwoFactorStatus()
      .then(({ data }) => {
        if (active) setStatus(data)
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Could not load two-factor status.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function handleSetup() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const { data } = await setupTwoFactor()
      const image = await QRCode.toDataURL(data.otpauthUri, {
        width: 220,
        margin: 1,
        color: { dark: '#14233c', light: '#ffffff' },
      })
      setQrCode(image)
      setSetupCode('')
      setStatus((current) => ({ ...current, setupInProgress: true }))
      setMessage('Scan the QR code with your authenticator app, then enter its current 6-digit code.')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not start two-factor setup.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifySetup(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await verifyTwoFactorSetup(setupCode)
      setQrCode('')
      setSetupCode('')
      await refreshStatus()
      setMessage('Two-factor authentication is enabled.')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The authenticator code could not be verified.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisable(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const { data } = await disableTwoFactor({ currentPassword, code: disableCode })
      replaceAccessToken(data.token)
      setCurrentPassword('')
      setDisableCode('')
      await refreshStatus()
      setMessage('Two-factor authentication is disabled.')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not disable two-factor authentication.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="two-factor-settings">
      <div className="security-row">
        <span className="security-icon"><ShieldCheck size={17} /></span>
        <span><strong>Two-factor authentication</strong><small>{loading ? 'Checking status…' : status?.enabled ? 'Enabled for this account.' : status?.setupInProgress ? 'Setup in progress. Complete verification to enable 2FA.' : status?.available ? 'Not enabled.' : 'Unavailable: configure TOTP_ENCRYPTION_KEY on the backend.'}</small></span>
        {loading ? <LoaderCircle size={16} className="auth-loading-icon" /> : status?.enabled
          ? <button className="button button-secondary" type="button" onClick={() => { setQrCode(''); setError(''); setMessage(''); setStatus((current) => ({ ...current, disabling: !current.disabling })) }}>{status.disabling ? 'Cancel' : 'Disable 2FA'}</button>
          : <button className="button button-secondary" type="button" disabled={!status?.available || submitting} onClick={handleSetup}>{submitting ? 'Setting up…' : status?.setupInProgress ? 'Restart setup' : 'Set up 2FA'}</button>}
      </div>
      {qrCode && !status?.enabled && <form className="two-factor-form" onSubmit={handleVerifySetup}>
        <p>Scan this QR code using Google Authenticator, Microsoft Authenticator, or another TOTP app. Setup expires after 10 minutes.</p>
        <img className="two-factor-qr" src={qrCode} alt="Authenticator app setup QR code" />
        <label>6-digit authenticator code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Verifying…' : 'Verify and enable 2FA'}</button>
      </form>}
      {status?.enabled && status.disabling && <form className="two-factor-form" onSubmit={handleDisable}>
        <p>Confirm your current password and an unused code from your authenticator app.</p>
        <label>Current password<input type="password" autoComplete="current-password" required maxLength={72} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>6-digit authenticator code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={disableCode} onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Disabling…' : 'Confirm disable'}</button>
      </form>}
      {error && <p className="form-error two-factor-feedback" role="alert">{error}</p>}
      {message && <p className="form-notice two-factor-feedback" role="status">{message}</p>}
    </div>
  )
}

function PasswordChangeForm() {
  const { replaceAccessToken } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const response = await changePassword({ currentPassword, newPassword })
      replaceAccessToken(response.data.token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage(response.data.message)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to change your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="settings-password-form" onSubmit={handleSubmit} aria-busy={submitting}>
      <label>Current password<input type="password" autoComplete="current-password" required maxLength={72} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      <small className="settings-password-hint">Use at least 12 characters. Changing your password signs out other sessions.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-notice" role="status">{message}</p>}
      <button className="button button-primary" type="submit" disabled={submitting}>
        {submitting ? <>Updating… <LoaderCircle className="auth-loading-icon" size={15} /></> : 'Update password'}
      </button>
    </form>
  )
}

function SignOutButton() {
  const { logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function handleLogout() {
    setBusy(true)
    setError('')
    try {
      await logout()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Logout could not be confirmed.')
    } finally {
      setBusy(false)
    }
  }
  return <span className="signout-control"><button className="button button-secondary" disabled={busy} onClick={handleLogout}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <small className="form-error">{error}</small>}</span>
}

function UnavailablePanel({ icon: Icon, title, message }) {
  return <section className="panel settings-panel unavailable-settings"><span className="settings-large-icon"><Icon size={22} /></span><h2>{title}</h2><p>{message}</p></section>
}
