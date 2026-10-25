import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, UserRound, Users } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { ErrorState, LoadingState } from '../components/StateViews.jsx'
import { useAuth } from '../context/useAuth.js'
import { listAdminUsers, updateAdminUserStatus } from '../services/adminService.js'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const pageLimit = 20

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selectedUser, setSelectedUser] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function fetchUsers() {
      try {
        const data = await listAdminUsers(page, pageLimit, controller.signal)
        if (active) setResult(data)
      } catch (requestError) {
        if (active && requestError.name !== 'CanceledError') {
          setError(requestError.response?.data?.error || 'Could not load user accounts.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchUsers()
    return () => {
      active = false
      controller.abort()
    }
  }, [page, retry])

  function reloadUsers() {
    setError('')
    setLoading(true)
    setRetry((value) => value + 1)
  }

  async function changeStatus() {
    if (!selectedUser) return
    setUpdating(true)
    setActionError('')
    try {
      await updateAdminUserStatus(selectedUser.id, selectedUser.status === 'active' ? 'disabled' : 'active')
      setSelectedUser(null)
      reloadUsers()
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || 'Account status could not be updated.')
    } finally {
      setUpdating(false)
    }
  }

  const users = result?.users || []
  const pagination = result?.pagination
  return (
    <main className="page admin-users-page">
      <div className="page-heading">
        <div><span className="eyebrow">ADMINISTRATION</span><h1>User management</h1><p>Review registered accounts and manage access status.</p></div>
        <span className="admin-indicator"><ShieldCheck size={15} />Admin only</span>
      </div>
      {actionError && <div className="form-error admin-action-error" role="alert">{actionError}</div>}
      {error ? <ErrorState message={error} onRetry={reloadUsers} /> : loading ? <LoadingState label="Loading user accounts…" /> : (
        <>
          <div className="admin-users-summary"><span><Users size={16} /><strong>{pagination?.total ?? 0}</strong> registered accounts</span><button className="button button-secondary" onClick={reloadUsers}><RefreshCw size={14} />Refresh</button></div>
          <section className="panel admin-users-panel">
            {users.length === 0 ? <div className="state-view"><UserRound size={25} /><strong>No user accounts found</strong></div> : (
              <div className="table-scroll"><table className="data-table admin-users-table">
                <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Account access</th></tr></thead>
                <tbody>{users.map((account) => {
                  const isSelf = account.id === currentUser.id
                  const canChange = account.role !== 'admin' && !isSelf
                  return (
                    <tr key={account.id}>
                      <td><span className="admin-user-cell"><span className="admin-user-avatar">{account.name?.slice(0, 1).toUpperCase() || '?'}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></span></td>
                      <td><span className={`admin-role-badge${account.role === 'admin' ? ' admin-role-badge-admin' : ''}`}>{account.role}</span></td>
                      <td><span className={`admin-status-badge${account.status === 'active' ? ' admin-status-active' : ' admin-status-disabled'}`}><span />{account.status}</span></td>
                      <td>{account.createdAt && !Number.isNaN(new Date(account.createdAt).getTime()) ? dateFormat.format(new Date(account.createdAt)) : '—'}</td>
                      <td>{canChange ? <button className={`button ${account.status === 'active' ? 'button-danger' : 'button-secondary'} admin-status-action`} onClick={() => { setSelectedUser(account); setActionError('') }}>{account.status === 'active' ? 'Disable' : 'Reactivate'}</button> : <span className="admin-status-restricted">{isSelf ? 'Current account' : 'Protected admin'}</span>}</td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
            )}
            {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} accounts</span><div><button className="button button-secondary pagination-prev" disabled={page <= 1 || loading} onClick={() => { setError(''); setLoading(true); setPage((value) => value - 1) }}>Previous</button><button className="button button-secondary" disabled={page >= pagination.pages || loading} onClick={() => { setError(''); setLoading(true); setPage((value) => value + 1) }}>Next</button></div></div>}
          </section>
          <p className="data-limit-note">Password and credential fields are never returned. Administrator accounts and your current account cannot be disabled here.</p>
        </>
      )}
      {selectedUser && <ConfirmDialog title={`${selectedUser.status === 'active' ? 'Disable' : 'Reactivate'} account?`} message={selectedUser.status === 'active' ? `Disabling ${selectedUser.name} prevents future sign-ins and API access. Existing sessions will stop working.` : `Reactivating ${selectedUser.name} restores sign-in and API access.`} confirmLabel={selectedUser.status === 'active' ? 'Disable account' : 'Reactivate account'} busy={updating} onConfirm={changeStatus} onCancel={() => setSelectedUser(null)} />}
    </main>
  )
}
