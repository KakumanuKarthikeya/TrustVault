import { ArrowDownToLine, FileEdit, LockKeyhole, Share2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './Badges.jsx'
import { EmptyState } from './StateViews.jsx'

const actionNames = {
  'document.upload': 'Uploaded a document',
  'document.download': 'Downloaded a document',
  'document.update': 'Updated document details',
  'document.delete': 'Deleted a document',
  'permission.grant': 'Changed document access',
  'permission.revoke': 'Revoked document access',
  'document.access.denied': 'Access was denied',
  'permission.change.denied': 'Permission change was denied',
  'auth.login.failed': 'Sign-in was denied',
  'auth.logout': 'Signed out',
}

function ActionIcon({ action }) {
  if (action === 'document.upload') return <Upload size={16} />
  if (action === 'document.download') return <ArrowDownToLine size={16} />
  if (action.includes('permission')) return <Share2 size={16} />
  if (action.includes('denied')) return <LockKeyhole size={16} />
  return <FileEdit size={16} />
}

export default function ActivityTimeline({ entries, loading, error, onRetry }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest available audit events</p></div><Link to="/audit" className="text-link">View all</Link></div>
      {loading ? <div className="panel-state">Loading authorized audit history…</div> : error ? <div className="panel-state"><p>{error}</p><button className="text-link button-link" onClick={onRetry}>Try again</button></div> : entries.length === 0 ? <EmptyState title="No audit activity available" message="Activity is shown only to workspace administrators." /> : (
        <ol className="activity-list">
          {entries.slice(0, 5).map((entry, index) => (
            <li key={`${entry.timestamp}-${index}`} className="activity-item">
              <span className={`activity-icon ${entry.outcome === 'denied' ? 'activity-denied' : ''}`}><ActionIcon action={entry.action} /></span>
              <div className="activity-copy">
                <strong>{actionNames[entry.action] || entry.action}</strong>
                <span>Actor {entry.actorUserId ? String(entry.actorUserId).slice(-6) : 'Unavailable'} · Document {entry.documentId ? String(entry.documentId).slice(-6) : '—'}</span>
                <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
              </div>
              <StatusBadge outcome={entry.outcome} />
            </li>
          ))}
        </ol>
      )}
      <Link to="/audit" className="panel-footer-link">Open audit history <span aria-hidden="true">→</span></Link>
    </section>
  )
}
