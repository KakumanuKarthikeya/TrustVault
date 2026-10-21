import { Check, ShieldCheck } from 'lucide-react'
import Brand from '../components/Brand.jsx'

const benefits = ['Private file storage', 'Permission-based access', 'Persistent audit history']

export default function AuthLayout({ children }) {
  return (
    <main className="auth-layout">
      <section className="auth-promo">
        <div className="auth-orbit auth-orbit-top" />
        <div className="auth-orbit auth-orbit-bottom" />
        <Brand />
        <div className="promo-copy">
          <div className="promo-shield"><ShieldCheck size={32} /></div>
          <h1>Your documents.<br />Protected by design.</h1>
          <p>Securely organize, share, and track every important file from one trusted workspace.</p>
          <ul>{benefits.map((benefit) => <li key={benefit}><Check size={15} />{benefit}</li>)}</ul>
        </div>
        <small className="auth-copyright">TrustVault · Secure document workspace</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand"><Brand /></div>
        {children}
      </section>
    </main>
  )
}
