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

  const acceptSession = useCallback((data) => {
    if (!data.token || !data.user) throw new Error('Authentication response is incomplete')
    sessionStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
    setBootstrapError('')
    return data.user
  }, [])

  const login = useCallback(async (credentials, { deferSession = false } = {}) => {
    const { data } = await loginRequest(credentials)
    if (data.requiresTwoFactor) return data
    return deferSession ? data : acceptSession(data)
  }, [acceptSession])

  const completeTwoFactorLogin = useCallback((data, { deferSession = false } = {}) => (
    deferSession ? data : acceptSession(data)
  ), [acceptSession])

  const register = useCallback(async (details) => {
    const { data } = await registerRequest(details)
    return acceptSession(data)
  }, [acceptSession])

  const logout = useCallback(async () => {
    await logoutRequest()
    clearSession()
  }, [clearSession])

  const replaceAccessToken = useCallback((nextToken) => {
    sessionStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
  }, [])

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
    completeLogin: acceptSession,
    completeTwoFactorLogin,
    register,
    logout,
    replaceAccessToken,
    clearSession,
    retryBootstrap,
  }), [token, user, loading, bootstrapError, login, completeTwoFactorLogin, register, logout, replaceAccessToken, clearSession, retryBootstrap, acceptSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
