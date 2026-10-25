import api from './api.js'

export async function lookupUserByEmail(email) {
  const { data } = await api.get('/users/lookup', { params: { email } })
  return data.user
}
