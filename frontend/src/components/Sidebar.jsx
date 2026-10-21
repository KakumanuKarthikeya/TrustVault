import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  FileText, Files, LayoutDashboard, LogOut, Settings, Share2, ShieldCheck, History,
} from 'lucide-react'
import Brand from './Brand.jsx'
import { useAuth } from '../context/useAuth.js'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'All Documents', icon: Files },
  { to: '/my-documents', label: 'My Documents', icon: FileText },
  { to: '/shared', label: 'Shared With Me', icon: Share2 },
  { to: '/audit', label: 'Audit History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
    } catch (error) {
      setLogoutError(error.response?.data?.error || 'Logout could not be confirmed. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <>
      {open && <button className="drawer-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand"><Brand /></div>
        <nav className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <ShieldCheck size={17} />
            <div><strong>Protected workspace</strong><span>Private document storage</span></div>
          </div>
          <div className="sidebar-user">
            <span className="avatar avatar-sidebar">{user?.name?.slice(0, 1).toUpperCase() || '?'}</span>
            <div className="sidebar-user-details">
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="icon-button logout-button" aria-label="Log out" title="Log out" disabled={loggingOut} onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
          {logoutError && <p className="sidebar-error" role="alert">{logoutError}</p>}
        </div>
      </aside>
    </>
  )
}
