import { useState } from 'react'
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import { requestPasswordReset } from '../services/authService.js'

function requestErrorMessage(error) {
  const status = error.response?.status
  if (!error.response) {
    return 'Cannot reach the TrustVault API. Check that the backend is running and its CORS_ORIGINS allows this frontend.'
  }
  if (status === 503 && error.response.data?.error === 'Password reset email is not configured') {
    return 'Password reset email is not configured. Add RESEND_API_KEY and EMAIL_FROM to backend/.env, use a sender on a domain verified in Resend, and restart the backend.'
  }
  if (status === 429) return 'Too many reset requests. Wait 15 minutes before trying again.'
  if (status >= 500) return 'The server could not process your request. Please try again later.'
  return 'Enter a valid email address and try again.'
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const response = await requestPasswordReset(email.trim())
      setMessage(response.data.message)
    } catch (requestError) {
      setError(requestErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout variant="login">
      <div className="auth-card">
        <div className="auth-card-icon"><LockKeyhole size={19} /></div>
        <h2>Forgot password?</h2>
        <p className="auth-intro">Enter your account email and we’ll send a reset link if an active account matches.</p>
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
          <label>Email address
            <span className="input-with-icon"><Mail size={16} /><input type="email" autoComplete="email" required maxLength="254" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></span>
          </label>
          {message && <p className="form-notice" role="status">{message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={submitting}>
            {submitting ? <>Sending link… <LoaderCircle className="auth-loading-icon" size={17} /></> : <>Send reset link <ArrowRight size={17} /></>}
          </button>
        </form>
        <div className="auth-security-note"><span aria-hidden="true" /><LockKeyhole size={16} /><span>Reset links are single-use and expire after 30 minutes.</span></div>
        <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
      </div>
    </AuthLayout>
  )
}
