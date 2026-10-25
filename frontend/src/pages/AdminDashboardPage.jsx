import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Files, Users, UserRoundCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import ActivityTimeline from '../components/ActivityTimeline.jsx'
import StatCard from '../components/StatCard.jsx'
import { ErrorState, LoadingState } from '../components/StateViews.jsx'
import { getAdminDashboard } from '../services/adminService.js'

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    getAdminDashboard()
      .then((data) => { if (active) setDashboard(data) })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Could not load administrator dashboard.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  function retryDashboard() {
    setError('')
    setLoading(true)
    setRetry((value) => value + 1)
  }

  if (loading && !dashboard) return <main className="page"><LoadingState label="Loading administrator dashboard…" /></main>
  if (error && !dashboard) return <main className="page"><ErrorState message={error} onRetry={retryDashboard} /></main>

  const summary = dashboard?.summary || {}
  return (
    <main className="page admin-dashboard-page">
      <div className="page-heading admin-dashboard-heading">
        <div><span className="eyebrow">TRUSTVAULT ADMINISTRATION</span><h1>Admin dashboard</h1><p>Monitor accounts, documents, and security activity.</p></div>
        <Link to="/admin/users" className="button button-primary"><Users size={15} />Manage users</Link>
      </div>
      {error && <ErrorState message={error} onRetry={retryDashboard} />}
      <section className="stats-grid admin-stats-grid" aria-label="Administrator summary">
        <StatCard label="Total users" value={summary.totalUsers ?? '—'} detail="Registered accounts" icon={Users} color="blue" />
        <StatCard label="Active users" value={summary.activeUsers ?? '—'} detail="Accounts currently enabled" icon={UserRoundCheck} color="green" />
        <StatCard label="Total documents" value={summary.totalDocuments ?? '—'} detail="Private workspace documents" icon={Files} color="purple" />
        <StatCard label="Recent audit events" value={summary.recentAuditEvents ?? '—'} detail="Events recorded in the last 7 days" icon={Activity} color="orange" />
      </section>
      <div className="admin-dashboard-grid">
        <ActivityTimeline entries={dashboard?.auditEvents || []} loading={loading} error={error} onRetry={retryDashboard} />
        <section className="panel admin-quick-panel">
          <div className="panel-heading"><div><h2>Administration</h2><p>Manage workspace controls</p></div></div>
          <Link to="/admin/users"><span className="admin-quick-icon"><Users size={17} /></span><span><strong>User management</strong><small>Review accounts and update access status.</small></span><ArrowRight size={15} /></Link>
          <Link to="/audit"><span className="admin-quick-icon admin-quick-audit"><Activity size={17} /></span><span><strong>Audit history</strong><small>Filter recorded security and document events.</small></span><ArrowRight size={15} /></Link>
          <p className="admin-quick-note">Account roles can only be changed through the existing secure bootstrap process.</p>
        </section>
      </div>
      <p className="data-limit-note">Recent audit events count the last 7 days. User and document totals reflect current database records.</p>
    </main>
  )
}
