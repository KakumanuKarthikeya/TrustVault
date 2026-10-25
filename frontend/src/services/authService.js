import api from './api.js'

export const loginRequest = (credentials) => api.post('/auth/login', credentials)
export const registerRequest = (details) => api.post('/auth/register', details)
export const requestPasswordReset = (email) => api.post('/auth/forgot-password', { email })
export const resetPassword = (details) => api.post('/auth/reset-password', details)
export const getCurrentUser = () => api.get('/auth/me')
export const logoutRequest = () => api.post('/auth/logout')
