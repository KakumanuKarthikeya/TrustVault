import { CalendarDays, Grid2X2, List, Search } from 'lucide-react'

export default function SearchFilters({ filters, setFilters, documents, view, setView }) {
  const categories = [...new Set(documents.map((document) => document.category).filter(Boolean))].sort()
  const owners = [...new Set(documents.map((document) => document.ownerId).filter(Boolean))]

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <form className="filters-panel" onSubmit={(event) => event.preventDefault()}>
      <label className="filter-search"><Search size={17} /><input aria-label="Search by document name" placeholder="Search by document name…" value={filters.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label className="filter-select"><span className="visually-hidden">Category</span><select value={filters.category} onChange={(event) => update('category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label className="filter-select"><span className="visually-hidden">Owner</span><select value={filters.ownerId} onChange={(event) => update('ownerId', event.target.value)}><option value="">All owners</option>{owners.map((owner) => <option key={owner} value={owner}>{owner === filters.currentUserId ? 'You' : `Account ${owner.slice(-6)}`}</option>)}</select></label>
      <details className="filter-date-menu">
        <summary><CalendarDays size={15} /><span>{filters.from || filters.to ? 'Custom dates' : 'Any date'}</span></summary>
        <div className="filter-date-popover">
          <label>Created from<input aria-label="Created from" type="date" value={filters.from} onChange={(event) => update('from', event.target.value)} /></label>
          <label>Created to<input aria-label="Created to" type="date" value={filters.to} onChange={(event) => update('to', event.target.value)} /></label>
        </div>
      </details>
      <div className="view-toggle" aria-label="Document view">
        <button type="button" className={view === 'list' ? 'selected' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={18} /></button>
        <button type="button" className={view === 'grid' ? 'selected' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={17} /></button>
      </div>
    </form>
  )
}
