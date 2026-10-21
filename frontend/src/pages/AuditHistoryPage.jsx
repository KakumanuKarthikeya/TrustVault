import { useEffect, useMemo, useState } from 'react'
import { LockKeyhole, Search, ShieldCheck } from 'lucide-react'
import { listAuditLogs } from '../services/auditService.js'
import { useAuth } from '../context/useAuth.js'
import { ErrorState, LoadingState } from '../components/StateViews.jsx'
import { StatusBadge } from '../components/Badges.jsx'

const actionLabel = (action) => action.replaceAll('.', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function AuditHistoryPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(user.role === 'admin')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    listAuditLogs()
      .then((logs) => { if (active) setEntries(logs) })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.error || 'Could not load audit history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAdmin, retry])

  const actions = [...new Set(entries.map((entry) => entry.action))]
  const filtered = useMemo(() => entries.filter((entry) => {
    const text = `${entry.actorUserId || ''} ${entry.documentId || ''} ${entry.action || ''}`.toLowerCase()
    const timestamp = new Date(entry.timestamp).getTime()
    const afterFrom = !from || timestamp >= new Date(`${from}T00:00:00`).getTime()
    const beforeTo = !to || timestamp <= new Date(`${to}T23:59:59.999`).getTime()
    return (!query || text.includes(query.toLowerCase())) &&
      (!action || entry.action === action) &&
      (!outcome || entry.outcome === outcome) &&
      afterFrom && beforeTo
  }), [entries, query, action, outcome, from, to])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const displayedPage = Math.min(page, pageCount)
  const shown = filtered.slice((displayedPage - 1) * pageSize, displayedPage * pageSize)

  function updateFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  function retryAudit() {
    setLoading(true)
    setError('')
    setRetry((value) => value + 1)
  }

  return (
    <main className="page audit-page">
      <div className="page-heading audit-heading"><div><h1>Audit history</h1><p>Review recorded security and document events across this workspace.</p></div>{isAdmin && <span className="admin-indicator"><ShieldCheck size={15} />Administrator view</span>}</div>
      <div className="restricted-notice"><LockKeyhole size={17} /><span><strong>Restricted area.</strong> Audit history is available only to authorized workspace administrators.</span></div>
      {!isAdmin ? (
        <section className="panel restricted-empty"><LockKeyhole size={26} /><h2>Administrator access required</h2><p>Your account is not authorized to view audit events. No audit data was requested.</p></section>
      ) : error ? <ErrorState message={error} onRetry={retryAudit} /> : loading ? <LoadingState label="Loading authorized audit history…" /> : (
        <>
          <form className="filters-panel audit-filters" onSubmit={(event) => event.preventDefault()}>
            <label className="filter-search"><Search size={17} /><input aria-label="Search actor or document" placeholder="Search actor or document…" value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} /></label>
            <label className="filter-select"><span className="visually-hidden">Action</span><select value={action} onChange={(event) => updateFilter(setAction, event.target.value)}><option value="">All actions</option>{actions.map((value) => <option key={value} value={value}>{actionLabel(value)}</option>)}</select></label>
            <label className="filter-select"><span className="visually-hidden">Outcome</span><select value={outcome} onChange={(event) => updateFilter(setOutcome, event.target.value)}><option value="">All outcomes</option><option value="success">Success</option><option value="denied">Denied</option></select></label>
            <label className="filter-date"><span>From</span><input type="date" aria-label="From date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} /></label>
            <label className="filter-date"><span>To</span><input type="date" aria-label="To date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} /></label>
          </form>
          <section className="panel audit-table-panel">
            {shown.length === 0 ? <div className="state-view"><LockKeyhole size={25} /><strong>No matching audit events</strong><span>Adjust your filters or search terms.</span></div> : (
              <div className="table-scroll"><table className="data-table audit-data-table">
                <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Document</th><th>Outcome</th></tr></thead>
                <tbody>{shown.map((entry, index) => <tr key={`${entry.timestamp}-${index}`}><td>{new Date(entry.timestamp).toLocaleString()}</td><td className="id-cell">{entry.actorUserId || '—'}</td><td>{actionLabel(entry.action)}</td><td className="id-cell">{entry.documentId || '—'}</td><td><StatusBadge outcome={entry.outcome} /></td></tr>)}</tbody>
              </table></div>
            )}
            {filtered.length > 0 && <div className="pagination"><span>Showing {(displayedPage - 1) * pageSize + 1}–{Math.min(displayedPage * pageSize, filtered.length)} of {filtered.length} returned events</span><div><button className="button button-secondary pagination-prev" disabled={displayedPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="page-number current">{displayedPage}</span><button className="button button-secondary" disabled={displayedPage >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
          </section>
          <p className="data-limit-note">The backend returns up to 100 newest entries; filters apply to those returned entries only.</p>
        </>
      )}
    </main>
  )
}
