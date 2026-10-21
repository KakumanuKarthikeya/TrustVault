import { ShieldCheck } from 'lucide-react'

export default function Brand({ compact = false }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.4} /></span>
      {!compact && <span>TrustVault</span>}
    </span>
  )
}
