import api from './api.js'

export async function listAuditLogs(filters = {}) {
  const params = { limit: 100 }
  for (const key of ['action', 'from', 'to']) {
    if (filters[key]) params[key] = filters[key]
  }
  const { data } = await api.get('/audit-logs', { params })
  return data.auditLogs
}
