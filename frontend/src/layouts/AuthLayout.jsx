import { Check, LockKeyhole, Shield, ShieldCheck } from 'lucide-react'
import Brand from '../components/Brand.jsx'

const benefits = ['Private file storage', 'Permission-based access', 'Persistent audit history']
export default function AuthLayout({ children, variant = 'default' }) {
  const isLogin = variant === 'login'
  const isRegister = variant === 'register'
  const isBrandedAuth = isLogin || isRegister
  const layoutClass = `auth-layout${isLogin ? ' auth-layout-login' : ''}${isRegister ? ' auth-layout-register' : ''}`

  return (
    <main className={layoutClass}>
      <section className="auth-promo">
        <div className="auth-orbit auth-orbit-top" />
        <div className="auth-orbit auth-orbit-bottom" />
        <Brand />
        {isBrandedAuth ? (
          <div className="promo-copy">
            <div className="login-security-art" aria-hidden="true">
              <span className="login-art-particle login-art-particle-one" />
              <span className="login-art-particle login-art-particle-two" />
              <span className="login-art-particle login-art-particle-three" />
              <span className="login-art-particle login-art-particle-four" />
              <div className="login-art-ring login-art-ring-outer" />
              <div className="login-art-ring login-art-ring-inner" />
              <div className="login-art-shield">
                <Shield className="login-art-shield-outline" strokeWidth={1.15} />
                <span className="login-art-lock"><LockKeyhole strokeWidth={1.6} /></span>
              </div>
              <span className="login-art-glow" />
            </div>
            <div className="login-promo-copy">
              <h1>{isRegister ? 'Your Security Starts Here.' : 'Your Digital World. Fortified.'}</h1>
              <div className="login-promo-lines">
                {isRegister ? (
                  <>
                    <p>Create your secure digital space.</p>
                    <p>Keep your files private and your access under control.</p>
                    <p>Your trust deserves strong protection.</p>
                  </>
                ) : (
                  <>
                    <p>Every file has a story.</p>
                    <p>Every detail deserves privacy.</p>
                    <p>Your trust is our strongest security.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="promo-copy">
            <div className="promo-shield"><ShieldCheck size={32} /></div>
            <h1>Your documents.<br />Protected by design.</h1>
            <p>Securely organize, share, and track every important file from one trusted workspace.</p>
            <ul>{benefits.map((benefit) => <li key={benefit}><Check size={15} />{benefit}</li>)}</ul>
          </div>
        )}
        <small className="auth-copyright">{isBrandedAuth ? '© 2026 TrustVault · Secure document workspace' : 'TrustVault · Secure document workspace'}</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand"><Brand /></div>
        {children}
      </section>
    </main>
  )
}
