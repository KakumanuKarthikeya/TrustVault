import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext.js'
import { getCurrentUser, loginRequest, logoutRequest, registerRequest } from '../services/authService.js'

const TOKEN_KEY = 'trustvault_access_token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [bootstrapError, setBootstrapError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setBootstrapError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      clearSession()
    }
    window.addEventListener('trustvault:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('trustvault:unauthorized', handleUnauthorized)
  }, [clearSession])

  useEffect(() => {
    if (!token) return

    let active = true
    getCurrentUser()
      .then(({ data }) => {
        if (active) setUser(data.user)
      })
      .catch((error) => {
        if (active && error.response?.status !== 401) {
          setBootstrapError(error.response?.data?.error || 'Unable to verify your session. Check your connection and try again.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [token, retryCount])

  const authenticate = useCallback(async (path, credentials) => {
    const { data } = path === '/auth/login'
      ? await loginRequest(credentials)
      : await registerRequest(credentials)
    sessionStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
    setBootstrapError('')
    return data.user
  }, [])

  const login = useCallback((credentials) => authenticate('/auth/login', credentials), [authenticate])
  const register = useCallback((details) => authenticate('/auth/register', details), [authenticate])

  const logout = useCallback(async () => {
    await logoutRequest()
    clearSession()
  }, [clearSession])

  const retryBootstrap = useCallback(() => {
    setBootstrapError('')
    setLoading(true)
    setRetryCount((count) => count + 1)
  }, [])

  const value = useMemo(() => ({
    token,
    user,
    loading,
    bootstrapError,
    login,
    register,
    logout,
    clearSession,
    retryBootstrap,
  }), [token, user, loading, bootstrapError, login, register, logout, clearSession, retryBootstrap])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
