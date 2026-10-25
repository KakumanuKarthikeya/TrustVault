import api from './api.js'

export async function getAdminDashboard() {
  const { data } = await api.get('/admin/dashboard')
  return data
}

export async function listAdminUsers(page, limit = 20, signal) {
  const { data } = await api.get('/admin/users', { params: { page, limit }, signal })
  return data
}

export async function updateAdminUserStatus(userId, status) {
  const { data } = await api.patch(`/admin/users/${userId}/status`, { status })
  return data.user
}
