import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import { resetPassword } from '../services/authService.js'

function passwordBytes(value) {
  return new TextEncoder().encode(value).length
}

function resetErrorMessage(error) {
  const status = error.response?.status
  if (!error.response) {
    return 'Cannot reach the TrustVault API. Check that the backend is running and its CORS_ORIGINS allows this frontend.'
  }
  if (status === 429) return 'Too many reset attempts. Wait 15 minutes before trying again.'
  if (status === 400) return 'This reset link is invalid, expired, or already used. Request a new link to continue.'
  if (status >= 500) return 'The server could not reset your password. Please try again later.'
  return 'Unable to reset your password. Request a new link and try again.'
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (token) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [token])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!token) {
      setError('This reset link is missing its token. Request a new link to continue.')
      return
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    if (passwordBytes(password) > 72) {
      setError('Password must be no more than 72 UTF-8 bytes.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await resetPassword({ token, password })
      setComplete(true)
    } catch (requestError) {
      setError(resetErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout variant="login">
      <div className="auth-card">
        <div className="auth-card-icon"><LockKeyhole size={19} /></div>
        <h2>{complete ? 'Password updated' : 'Choose a new password'}</h2>
        <p className="auth-intro">{complete
          ? 'Your password has been reset. Sign in with your new password to continue.'
          : 'Create a strong password to secure your TrustVault account.'}</p>
        {complete ? (
          <Link className="button button-primary auth-submit" to="/login">Back to sign in <ArrowRight size={17} /></Link>
        ) : (
          <>
            {!token && <p className="form-error" role="alert">This reset link is missing its token. Request a new link to continue.</p>}
            <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
              <label>New password
                <span className="input-with-icon"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength="12" maxLength="72" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              </label>
              <label>Confirm new password
                <span className="input-with-icon"><LockKeyhole size={16} /><input type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength="12" maxLength="72" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><button className="password-toggle" type="button" aria-label={showConfirmation ? 'Hide confirmation' : 'Show confirmation'} onClick={() => setShowConfirmation((value) => !value)}>{showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary auth-submit" disabled={submitting || !token}>
                {submitting ? <>Updating password… <LoaderCircle className="auth-loading-icon" size={17} /></> : <>Update password <ArrowRight size={17} /></>}
              </button>
            </form>
          </>
        )}
        {!complete && <p className="auth-switch">Need a new reset link? <Link to="/forgot-password">Request one</Link></p>}
        {complete && <p className="auth-switch"><Link to="/forgot-password">Request another reset</Link></p>}
      </div>
    </AuthLayout>
  )
}
