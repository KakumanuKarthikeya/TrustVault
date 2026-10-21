import api from './api.js'

export async function listAuditLogs() {
  const { data } = await api.get('/audit-logs', { params: { limit: 100 } })
  return data.auditLogs
}
