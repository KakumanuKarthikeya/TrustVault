import { useEffect, useRef, useState } from 'react'
import { Bell, Menu, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import Brand from './Brand.jsx'

const routeNames = {
  '/': 'Dashboard',
  '/documents': 'Documents',
  '/my-documents': 'My Documents',
  '/shared': 'Shared With Me',
  '/upload': 'Upload document',
  '/audit': 'Audit history',
  '/settings': 'Settings',
}

export default function Topbar({ onMenuClick }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [showNotice, setShowNotice] = useState(false)
  const searchInput = useRef(null)
  const title = routeNames[location.pathname] || 'Workspace'

  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  function searchDocuments(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    navigate(`/documents${params.size ? `?${params.toString()}` : ''}`)
    window.dispatchEvent(new CustomEvent('trustvault:document-search', { detail: query.trim() }))
  }

  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenuClick} aria-label="Open navigation">
        <Menu size={21} />
      </button>
      <Link className="mobile-brand" to="/" aria-label="TrustVault home"><Brand /></Link>
      <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{title}</strong></div>
      <div className="topbar-actions">
        <form className="global-search" onSubmit={searchDocuments} role="search">
          <Search size={17} />
          <input ref={searchInput} aria-label="Search all documents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all documents…" />
          <kbd>⌘ K</kbd>
        </form>
        <div className="topbar-notifications">
          <button className="icon-button" aria-label="Notification availability" aria-expanded={showNotice} onClick={() => setShowNotice((value) => !value)}>
            <Bell size={19} />
          </button>
          {showNotice && <div className="notice-popover" role="status">Notifications are not available in this workspace yet.</div>}
        </div>
        <Link className="avatar avatar-top" to="/settings" aria-label={`Settings for ${user?.name}`}>
          {user?.name?.slice(0, 1).toUpperCase() || '?'}
        </Link>
      </div>
    </header>
  )
}
