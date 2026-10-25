import { Check, ShieldCheck } from 'lucide-react'
import Brand from '../components/Brand.jsx'

const benefits = ['Private file storage', 'Permission-based access', 'Persistent audit history']
const loginBenefits = ['Encrypted Storage', 'Granular Permissions', 'Traceable Activity']

export default function AuthLayout({ children, variant = 'default' }) {
  const isLogin = variant === 'login'

  return (
    <main className={`auth-layout${isLogin ? ' auth-layout-login' : ''}`}>
      <section className="auth-promo">
        <div className="auth-orbit auth-orbit-top" />
        <div className="auth-orbit auth-orbit-bottom" />
        <Brand />
        <div className="promo-copy">
          <div className="promo-shield"><ShieldCheck size={32} /></div>
          <h1>{isLogin ? <>Your documents,<br />protected by design.</> : <>Your documents.<br />Protected by design.</>}</h1>
          <p>{isLogin
            ? 'One private workspace to organize sensitive files, control access, and keep a complete record of every action.'
            : 'Securely organize, share, and track every important file from one trusted workspace.'}</p>
          <ul>{(isLogin ? loginBenefits : benefits).map((benefit) => <li key={benefit}><Check size={15} />{benefit}</li>)}</ul>
        </div>
        {isLogin && (
          <aside className="auth-privacy-card">
            <ShieldCheck size={19} aria-hidden="true" />
            <span><strong>Privacy stays in your control</strong><small>Access is visible, revocable, and recorded in one place.</small></span>
          </aside>
        )}
        <small className="auth-copyright">{isLogin ? '© 2026 TrustVault · Secure document workspace' : 'TrustVault · Secure document workspace'}</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand"><Brand /></div>
        {children}
      </section>
    </main>
  )
}
