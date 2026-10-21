import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Archive, ArrowRight, Files, HardDriveUpload, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard.jsx'
import ActivityTimeline from '../components/ActivityTimeline.jsx'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews.jsx'
import { listDocuments } from '../services/documentService.js'
import { listAuditLogs } from '../services/auditService.js'
import { useAuth } from '../context/useAuth.js'
import formatBytes from '../utils/formatBytes.js'

const dateHeading = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const dateShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const today = new Date()

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

  return (
    <main className="page dashboard-page">
      <div className="page-heading dashboard-heading">
        <div><span className="eyebrow">{dateHeading.format(today).toUpperCase()}</span><h1>Welcome back, {user.name}</h1><p>Here’s what’s happening across your secure workspace.</p></div>
        <button className="button button-primary" onClick={() => navigate('/upload')}><Upload size={17} />Upload document</button>
      </div>
      {docError && <ErrorState message={docError} onRetry={() => { setDocLoading(true); loadDocuments() }} />}
      <section className="stats-grid" aria-label="Workspace statistics">
        <StatCard label="Total documents" value={docLoading || docError ? '—' : documents.length} detail="Accessible · API max 100" icon={Files} color="blue" />
        <StatCard label="Shared documents" value={docLoading || docError ? '—' : sharedCount} detail="Shared records returned by API" icon={Archive} color="purple" />
        <StatCard label="Recent activity" value={user.role !== 'admin' ? 'Admin only' : auditLoading ? '—' : auditError ? 'Unavailable' : auditEntries.length} detail={user.role === 'admin' ? 'Latest authorized audit events' : 'Restricted audit history'} icon={Activity} color="green" />
        <StatCard label="Storage used" value={docLoading || docError ? '—' : formatBytes(storageBytes)} detail="Returned records · no quota API" icon={HardDriveUpload} color="orange" />
      </section>
      <div className="dashboard-columns">
        <section className="panel recent-documents-panel">
          <div className="panel-heading"><div><h2>Recent documents</h2><p>Your most recently updated accessible files</p></div><Link to="/documents" className="text-link">View all <ArrowRight size={14} /></Link></div>
          {docLoading ? <LoadingState label="Loading documents…" /> : docError ? <div className="panel-state">Documents could not be loaded.</div> : documents.length === 0 ? <EmptyState message="Upload a document to get started." /> : (
            <div className="recent-doc-list">
              {documents.slice(0, 5).map((doc) => (
                <Link className="recent-doc-row" to="/documents" key={doc.id}>
                  <span className="file-kind-icon"><Files size={17} /></span>
                  <span className="recent-doc-name"><strong>{doc.name}</strong><small>{doc.category || 'Uncategorized'}</small></span>
                  <span className="recent-doc-owner">{doc.ownerId === user.id ? 'You' : 'Shared'}</span>
                  <time>{dateShort.format(new Date(doc.updatedAt))}</time>
                </Link>
              ))}
            </div>
          )}
          <Link to="/documents" className="panel-footer-link">Browse all documents <span aria-hidden="true">→</span></Link>
        </section>
        <ActivityTimeline entries={auditEntries} loading={auditLoading} error={auditError} onRetry={() => { setAuditLoading(true); setAuditError(''); setAuditRetry((count) => count + 1) }} />
      </div>
    </main>
  )
}
