import { useState } from 'react'
import { Bell, Check, Copy, Database, LockKeyhole, UserRound, ShieldCheck, LogOut } from 'lucide-react'
import { useAuth } from '../context/useAuth.js'

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
  return (
    <section className="panel settings-panel">
      <div className="panel-heading"><div><h2>Account security</h2><p>Security features available for this account.</p></div></div>
      <div className="security-row"><span className="security-icon"><LockKeyhole size={17} /></span><span><strong>Password</strong><small>Password changes are not available through the backend.</small></span><button className="button button-secondary" disabled>Change password</button></div>
      <div className="security-row"><span className="security-icon"><ShieldCheck size={17} /></span><span><strong>Two-factor authentication</strong><small>No 2FA setup endpoint is available.</small></span><button className="button button-secondary" disabled>Unavailable</button></div>
      <div className="security-row"><span className="security-icon"><LogOut size={17} /></span><span><strong>Current session</strong><small>Sign out revokes this access token on the backend.</small></span><SignOutButton /></div>
      <p className="settings-unavailable">Active-session inventory and remote session management are not supported.</p>
    </section>
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
