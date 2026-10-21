export function PermissionBadge({ owned }) {
  return <span className={`badge permission-badge${owned ? ' permission-owner' : ' permission-shared'}`}>{owned ? 'Owner' : 'Shared'}</span>
}

export function StatusBadge({ outcome }) {
  const success = outcome === 'success'
  return <span className={`badge status-badge ${success ? 'status-success' : 'status-denied'}`}>{success ? 'Success' : 'Denied'}</span>
}
