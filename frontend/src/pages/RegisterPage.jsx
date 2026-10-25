import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import { useAuth } from '../context/useAuth.js'

function passwordBytes(value) {
  return new TextEncoder().encode(value).length
}

function registrationError(error) {
  const status = error.response?.status
  const serverMessage = error.response?.data?.error

  if (!error.response) {
    return 'Cannot reach the TrustVault API. Check that the backend is running and its CORS_ORIGINS allows this frontend.'
  }
  if (status === 400) return serverMessage || 'Check your name, email address, and password requirements.'
  if (status === 409) return 'An account with this email already exists. Sign in instead.'
  if (status === 429) {
    return 'Too many authentication attempts. Login and registration share a limit of 10 requests per IP every 15 minutes. Wait for the limit window to reset before trying again.'
  }
  if (status === 503) {
    return serverMessage === 'Authentication unavailable'
      ? 'Authentication is unavailable. Ensure JWT_SECRET is set to a private value of at least 32 bytes in backend/.env, then restart the backend.'
      : serverMessage || 'Registration is temporarily unavailable.'
  }
  if (status >= 500) return serverMessage || 'The server encountered an error while creating your account. Try again later.'
  return serverMessage || 'Unable to create your account. Please try again.'
}

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    if (passwordBytes(form.password) > 72) {
      setError('Password must be no more than 72 UTF-8 bytes.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await register({ name: form.name.trim(), email: form.email, password: form.password })
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(registrationError(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout variant="register">
      <div className="auth-card auth-card-register">
        <div className="auth-card-icon"><LockKeyhole size={19} /></div>
        <h2>Create your account</h2>
        <p className="auth-intro">Your secure workspace starts with a few simple steps.</p>
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
          <label>Full name
            <span className="input-with-icon"><UserRound size={16} /><input required autoComplete="name" maxLength="100" placeholder="Your name" value={form.name} onChange={(event) => update('name', event.target.value)} /></span>
          </label>
          <label>Email address
            <span className="input-with-icon"><Mail size={16} /><input type="email" required autoComplete="email" maxLength="254" placeholder="you@company.com" value={form.email} onChange={(event) => update('email', event.target.value)} /></span>
          </label>
          <label>Password <small className="label-hint">At least 12 characters</small>
            <span className="input-with-icon"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} required autoComplete="new-password" minLength="12" maxLength="72" value={form.password} onChange={(event) => update('password', event.target.value)} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
          </label>
          <label>Confirm password
            <span className="input-with-icon"><LockKeyhole size={16} /><input type={showConfirm ? 'text' : 'password'} required autoComplete="new-password" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} /><button className="password-toggle" type="button" aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'} onClick={() => setShowConfirm((value) => !value)}>{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={submitting}>{submitting ? <>Creating account... <LoaderCircle className="spin" size={17} /></> : <>Create account <ArrowRight size={17} /></>}</button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </AuthLayout>
  )
}
