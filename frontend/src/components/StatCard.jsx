export default function StatCard({ label, value, detail, icon: Icon, color = 'blue' }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon stat-${color}`}><Icon size={19} /></span>
      <div className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        <span className="stat-detail">{detail}</span>
      </div>
    </article>
  )
}
