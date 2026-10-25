import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, LoaderCircle, Mail, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import { useAuth } from '../context/useAuth.js'

function apiError(error) {
  const status = error.response?.status
  const serverMessage = error.response?.data?.error

  if (!error.response) {
    return 'Cannot reach the TrustVault API. Start the backend on port 5000 and check its CORS_ORIGINS setting.'
  }
  if (status === 400) return serverMessage || 'Enter a valid email address and password.'
  if (status === 401) return 'Invalid email or password. Check your credentials and try again.'
  if (status === 429) return serverMessage || 'Too many sign-in attempts. Wait 15 minutes before trying again.'
  if (status === 503) {
    return serverMessage === 'Authentication unavailable'
      ? 'Authentication is not configured on the backend. Set a JWT_SECRET of at least 32 bytes in backend/.env and restart it.'
      : serverMessage || 'Authentication is temporarily unavailable.'
  }
  if (status >= 500) return serverMessage || 'The server encountered an error while signing in. Try again later.'
  return serverMessage || 'Unable to sign in. Check your connection and try again.'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => localStorage.getItem('trustvault_remembered_email') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('trustvault_remembered_email')))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const normalizedEmail = email.trim()
      await login({ email: normalizedEmail, password })
      if (rememberMe) localStorage.setItem('trustvault_remembered_email', normalizedEmail)
      else localStorage.removeItem('trustvault_remembered_email')
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout variant="login">
      <div className="auth-card">
        <div className="auth-card-icon"><LockKeyhole size={19} /></div>
        <h2>Welcome back</h2>
        <p className="auth-intro">Sign in to access your secure workspace.</p>
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
          <label>Email address
            <span className="input-with-icon"><Mail size={16} /><input type="email" autoComplete="email" required maxLength="254" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></span>
          </label>
          <label>Password
            <span className="input-with-icon"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength="72" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
          </label>
          <div className="auth-form-options">
            <label className="checkbox-label"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />Remember me</label>
            <Link className="text-link button-link" to="/forgot-password">Forgot password?</Link>
          </div>
          {message && <p className="form-notice" role="status">{message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={submitting}>{submitting ? <>Signing in… <LoaderCircle className="auth-loading-icon" size={17} /></> : <>Sign in <ArrowRight size={17} /></>}</button>
        </form>
        <div className="auth-security-note"><span aria-hidden="true" /><ShieldCheck size={16} /><span>Your documents remain protected by access controls.</span></div>
        <p className="auth-switch">New to TrustVault? <Link to="/register">Create account</Link></p>
        {rememberMe && <span className="remember-note">Your email is remembered on this device. Access tokens still expire after 15 minutes.</span>}
      </div>
    </AuthLayout>
  )
}
