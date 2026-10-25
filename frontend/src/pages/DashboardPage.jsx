import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileImage,
  FileText,
  FolderClosed,
  HardDrive,
  LockKeyhole,
  Share2,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ActivityTimeline from '../components/ActivityTimeline.jsx'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews.jsx'
import { useAuth } from '../context/useAuth.js'
import { listAuditLogs } from '../services/auditService.js'
import { listDocuments } from '../services/documentService.js'
import formatBytes from '../utils/formatBytes.js'

const dateShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const storageTypes = [
  { label: 'PDF documents', color: '#3470e8', matches: (doc) => doc.mimeType === 'application/pdf' },
  { label: 'Images', color: '#8b63e9', matches: (doc) => doc.mimeType?.startsWith('image/') },
  { label: 'Other files', color: '#f09a46', matches: (doc) => doc.mimeType !== 'application/pdf' && !doc.mimeType?.startsWith('image/') },
]

function getInitials(name) {
  return name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
}

function DocumentIcon({ mimeType }) {
  const Icon = mimeType?.startsWith('image/') ? FileImage : FileText
  return <span className={`dashboard-file-icon${mimeType?.startsWith('image/') ? ' dashboard-file-image' : ''}`}><Icon size={17} /></span>
}

function AccessBadge({ owned }) {
  return <span className={`dashboard-access-badge${owned ? '' : ' dashboard-access-shared'}`}>{owned ? 'Owner' : 'Shared'}</span>
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [docLoading, setDocLoading] = useState(true)
  const [docError, setDocError] = useState('')
  const [auditEntries, setAuditEntries] = useState([])
  const [auditLoading, setAuditLoading] = useState(user.role === 'admin')
  const [auditError, setAuditError] = useState('')
  const [auditRetry, setAuditRetry] = useState(0)

  const loadDocuments = useCallback(async () => {
    setDocError('')
    try {
      setDocuments(await listDocuments())
    } catch (error) {
      setDocError(error.response?.data?.error || 'Could not load workspace documents.')
    } finally {
      setDocLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(loadDocuments, 0)
    return () => window.clearTimeout(timer)
  }, [loadDocuments])

  useEffect(() => {
    if (user.role !== 'admin') return
    let active = true
    listAuditLogs()
      .then((entries) => { if (active) setAuditEntries(entries) })
      .catch((error) => { if (active) setAuditError(error.response?.data?.error || 'Audit history could not be loaded.') })
      .finally(() => { if (active) setAuditLoading(false) })
    return () => { active = false }
  }, [user.role, auditRetry])

  const sharedCount = useMemo(() => documents.filter((doc) => doc.ownerId !== user.id).length, [documents, user.id])
  const storageBytes = useMemo(() => documents.reduce((total, doc) => total + (Number(doc.size) || 0), 0), [documents])
  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5),
    [documents],
  )
  const storageBreakdown = useMemo(
    () => storageTypes.map((type) => ({
      ...type,
      bytes: documents.filter(type.matches).reduce((total, doc) => total + (Number(doc.size) || 0), 0),
    })),
    [documents],
  )
  const storageGradient = useMemo(() => {
    if (!storageBytes) return '#e9edf3'
    let offset = 0
    const slices = storageBreakdown.map((type) => {
      const end = offset + (type.bytes / storageBytes) * 100
      const slice = `${type.color} ${offset}% ${end}%`
      offset = end
      return slice
    })
    return `conic-gradient(${slices.join(', ')})`
  }, [storageBreakdown, storageBytes])

  return (
    <main className="page dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-eyebrow"><span /> Workspace protected</span>
          <h1>Welcome back, {user.name}</h1>
          <p>Your documents are secure and up to date. Pick up where you left off or add something new.</p>
          <div className="dashboard-hero-actions">
            <button className="button button-primary" onClick={() => navigate('/upload')}><Upload size={15} />Upload document</button>
            <Link className="button dashboard-browse-button" to="/documents"><FolderClosed size={15} />Browse documents</Link>
          </div>
        </div>
        <div className="dashboard-security-status">
          <span className="dashboard-security-icon"><ShieldCheck size={20} /></span>
          <div><small>Security status</small><strong>Workspace protected</strong><span>Access is checked by the server</span></div>
          <Check className="dashboard-security-check" size={16} />
        </div>
      </section>

      {docError && <ErrorState message={docError} onRetry={() => { setDocLoading(true); loadDocuments() }} />}

      <section className="dashboard-stats-grid" aria-label="Workspace statistics">
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon dashboard-stat-blue"><FileText size={18} /></span>
          <div><span className="dashboard-stat-label">Total documents</span><strong>{docLoading || docError ? '—' : documents.length}</strong><small>{docLoading ? 'Loading accessible files' : 'Accessible files · up to 100 shown'}</small></div>
          <Link to="/documents" aria-label="Browse all documents"><ChevronRight size={16} /></Link>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon dashboard-stat-purple"><Share2 size={18} /></span>
          <div><span className="dashboard-stat-label">Shared documents</span><strong>{docLoading || docError ? '—' : sharedCount}</strong><small>Shared with your account</small></div>
          <Link to="/shared" aria-label="Browse shared documents"><ChevronRight size={16} /></Link>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon dashboard-stat-green"><Activity size={18} /></span>
          <div><span className="dashboard-stat-label">Recent activity</span><strong>{user.role !== 'admin' ? 'Admin only' : auditLoading ? '—' : auditError ? 'Unavailable' : auditEntries.length}</strong><small>{user.role === 'admin' ? 'Authorized audit events' : 'Audit history is restricted'}</small></div>
          <Link to="/audit" aria-label="View audit history"><ChevronRight size={16} /></Link>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon dashboard-stat-orange"><HardDrive size={18} /></span>
          <div><span className="dashboard-stat-label">Storage used</span><strong>{docLoading || docError ? '—' : formatBytes(storageBytes)}</strong><small>For accessible files · no quota API</small></div>
          <span className="dashboard-stat-chevron" aria-hidden="true"><ChevronRight size={16} /></span>
        </article>
      </section>

      <section className="dashboard-quick-section" aria-labelledby="quick-access-title">
        <div className="dashboard-section-label"><h2 id="quick-access-title">Quick access</h2><p>Jump back into frequently used areas</p></div>
        <div className="dashboard-quick-links">
          <Link to="/my-documents"><span className="quick-link-icon quick-link-blue"><FolderClosed size={17} /></span><span><strong>My documents</strong><small>Your uploaded files</small></span><ChevronRight size={15} /></Link>
          <Link to="/shared"><span className="quick-link-icon quick-link-purple"><Share2 size={17} /></span><span><strong>Shared with me</strong><small>Files shared with your account</small></span><ChevronRight size={15} /></Link>
          <Link to="/documents"><span className="quick-link-icon quick-link-green"><Clock3 size={17} /></span><span><strong>Browse documents</strong><small>Recently updated files</small></span><ChevronRight size={15} /></Link>
        </div>
      </section>

      <div className="dashboard-content-grid">
        <section className="panel dashboard-documents-panel">
          <div className="panel-heading">
            <div><h2>Recent documents</h2><p>Your most recently updated accessible files</p></div>
            <Link to="/documents" className="text-link">View all <ArrowRight size={14} /></Link>
          </div>
          {docLoading ? <LoadingState label="Loading documents…" /> : docError ? <div className="panel-state">Documents could not be loaded.</div> : documents.length === 0 ? <EmptyState message="Upload a document to get started." /> : (
            <div className="dashboard-table-scroll">
              <table className="dashboard-document-table">
                <thead><tr><th>Name</th><th>Category</th><th>Owner</th><th>Modified</th><th>Access</th></tr></thead>
                <tbody>
                  {recentDocuments.map((doc) => {
                    const owned = doc.ownerId === user.id
                    return (
                      <tr key={doc.id}>
                        <td><Link className="dashboard-document-name" to="/documents"><DocumentIcon mimeType={doc.mimeType} /><span><strong>{doc.name}</strong><small>{doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType?.startsWith('image/') ? 'Image' : 'File'} · {formatBytes(Number(doc.size) || 0)}</small></span></Link></td>
                        <td>{doc.category || 'Uncategorized'}</td>
                        <td><span className="dashboard-owner"><span>{getInitials(owned ? user.name : 'Shared')}</span>{owned ? 'You' : 'Shared'}</span></td>
                        <td>{Number.isNaN(new Date(doc.updatedAt).getTime()) ? '—' : dateShort.format(new Date(doc.updatedAt))}</td>
                        <td><AccessBadge owned={owned} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/documents" className="panel-footer-link">Browse all documents <ArrowRight size={14} /></Link>
        </section>

        <ActivityTimeline
          entries={auditEntries}
          loading={auditLoading}
          error={auditError}
          onRetry={() => { setAuditLoading(true); setAuditError(''); setAuditRetry((count) => count + 1) }}
        />
      </div>

      <div className="dashboard-bottom-grid">
        <section className="panel dashboard-storage-panel">
          <div className="panel-heading"><div><h2>Storage overview</h2><p>Accessible files by type</p></div><span className="dashboard-storage-note">No quota API</span></div>
          <div className="dashboard-storage-content">
            <div className="dashboard-storage-donut" style={{ background: storageGradient }} aria-label={`Accessible file storage: ${formatBytes(storageBytes)}`}>
              <div><strong>{formatBytes(storageBytes)}</strong><small>in accessible files</small></div>
            </div>
            <ul className="dashboard-storage-legend">
              {storageBreakdown.map((type) => <li key={type.label}><span style={{ backgroundColor: type.color }} /><span>{type.label}</span><strong>{formatBytes(type.bytes)}</strong></li>)}
            </ul>
          </div>
        </section>
        <section className="dashboard-security-panel">
          <span className="dashboard-security-panel-icon"><LockKeyhole size={17} /></span>
          <div><strong>Your workspace is protected</strong><p>Documents are private by default. Access is checked by the backend for every request.</p></div>
          <span className="dashboard-protected-pill"><Check size={12} />Protected</span>
        </section>
      </div>
    </main>
  )
}
