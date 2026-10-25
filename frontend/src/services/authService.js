import api from './api.js'

export const loginRequest = (credentials) => api.post('/auth/login', credentials)
export const registerRequest = (details) => api.post('/auth/register', details)
export const requestPasswordReset = (email) => api.post('/auth/forgot-password', { email })
export const resetPassword = (details) => api.post('/auth/reset-password', details)
export const getCurrentUser = () => api.get('/auth/me')
export const logoutRequest = () => api.post('/auth/logout')
export const changePassword = (credentials) => api.post('/auth/change-password', credentials)
export const getTwoFactorStatus = () => api.get('/auth/2fa/status')
export const setupTwoFactor = () => api.post('/auth/2fa/setup')
export const verifyTwoFactorSetup = (code) => api.post('/auth/2fa/verify-setup', { code })
export const disableTwoFactor = (credentials) => api.post('/auth/2fa/disable', credentials)
export const verifyTwoFactorLogin = (credentials) => api.post('/auth/login/verify-2fa', credentials)
