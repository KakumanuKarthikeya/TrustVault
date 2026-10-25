import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import SearchFilters from '../components/SearchFilters.jsx'
import DocumentTable from '../components/DocumentTable.jsx'
import { ErrorState, LoadingState } from '../components/StateViews.jsx'
import { listDocuments } from '../services/documentService.js'
import { useAuth } from '../context/useAuth.js'

const pageSize = 5
const headingByScope = {
  all: { title: 'Documents', description: 'Find, organize, and securely manage files across your workspace.' },
  owned: { title: 'My Documents', description: 'Documents owned by your account.' },
  shared: { title: 'Shared With Me', description: 'Documents owned by others that the backend has made accessible to your account.' },
}

export default function DocumentsPage({ scope }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState('list')
  const [sort, setSort] = useState('modified')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    name: searchParams.get('q') || '',
    category: '',
    ownerId: '',
    from: '',
    to: '',
    currentUserId: user.id,
  })
  const heading = headingByScope[scope]

  const loadDocuments = useCallback(async (requestFilters, signal) => {
    setLoading(true)
    setError('')
    try {
      setDocuments(await listDocuments(requestFilters, signal))
    } catch (requestError) {
      if (requestError.name !== 'CanceledError') setError(requestError.response?.data?.error || 'Could not load documents.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => loadDocuments(filters, controller.signal), filters.name ? 250 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filters, retry, loadDocuments])

  useEffect(() => {
    function handleGlobalSearch(event) {
      setFilters((current) => ({ ...current, name: event.detail || '' }))
      setPage(1)
    }
    window.addEventListener('trustvault:document-search', handleGlobalSearch)
    return () => window.removeEventListener('trustvault:document-search', handleGlobalSearch)
  }, [])

  const scopedDocuments = useMemo(() => documents.filter((document) => {
    if (scope === 'owned') return document.ownerId === user.id
    if (scope === 'shared') return document.ownerId !== user.id
    return true
  }), [documents, scope, user.id])
  const sortedDocuments = useMemo(() => [...scopedDocuments].sort((first, second) => {
    if (sort === 'name') return first.name.localeCompare(second.name)
    return new Date(second.updatedAt) - new Date(first.updatedAt)
  }), [scopedDocuments, sort])

  const pages = Math.max(1, Math.ceil(sortedDocuments.length / pageSize))
  const displayedPage = Math.min(page, pages)
  const shown = sortedDocuments.slice((displayedPage - 1) * pageSize, displayedPage * pageSize)
  const ownedCount = documents.filter((document) => document.ownerId === user.id).length
  const sharedCount = documents.length - ownedCount
  const activeFilters = [
    filters.name && { key: 'name', label: `Name: ${filters.name}` },
    filters.category && { key: 'category', label: `Category: ${filters.category}` },
    filters.ownerId && { key: 'ownerId', label: `Owner: ${filters.ownerId === user.id ? 'You' : `Account ${filters.ownerId.slice(-6)}`}` },
    filters.from && { key: 'from', label: `From: ${filters.from}` },
    filters.to && { key: 'to', label: `To: ${filters.to}` },
  ].filter(Boolean)

  function updateDocuments(change) {
    if (change.type === 'refresh') {
      setRetry((count) => count + 1)
      return
    }
    if (change.type === 'delete') {
      setDocuments((current) => current.filter((document) => document.id !== change.document.id))
    } else {
      setDocuments((current) => current.map((document) => document.id === change.document.id ? change.document : document))
    }
  }

  function handleFilters(next) {
    setFilters((current) => typeof next === 'function' ? next(current) : next)
    setPage(1)
  }

  function clearFilters() {
    setFilters((current) => ({
      name: '',
      category: '',
      ownerId: '',
      from: '',
      to: '',
      currentUserId: current.currentUserId,
    }))
    setPage(1)
  }

  function removeFilter(key) {
    setFilters((current) => ({ ...current, [key]: '' }))
    setPage(1)
  }

  return (
    <main className="page documents-page">
      <div className="page-heading documents-heading">
        <div><h1>{heading.title}</h1><p>{heading.description}</p></div>
        <button className="button button-primary" onClick={() => navigate('/upload')}><span aria-hidden="true">＋</span><span>Upload document</span></button>
      </div>
      <nav className="document-scope-tabs" aria-label="Document categories">
        <Link className={scope === 'all' ? 'active' : ''} to="/documents" aria-current={scope === 'all' ? 'page' : undefined}>All documents <span>{loading ? '—' : documents.length}</span></Link>
        <Link className={scope === 'owned' ? 'active' : ''} to="/my-documents" aria-current={scope === 'owned' ? 'page' : undefined}>Owned by me <span>{loading ? '—' : ownedCount}</span></Link>
        <Link className={scope === 'shared' ? 'active' : ''} to="/shared" aria-current={scope === 'shared' ? 'page' : undefined}>Shared with me <span>{loading ? '—' : sharedCount}</span></Link>
      </nav>
      <SearchFilters filters={filters} setFilters={handleFilters} documents={documents} view={view} setView={setView} />
      {activeFilters.length > 0 && (
        <div className="active-filter-row">
          <span className="active-filter-label"><SlidersHorizontal size={13} />Active filters</span>
          {activeFilters.map(({ key, label }) => <button key={key} className="active-filter-chip" onClick={() => removeFilter(key)}>{label}<X size={12} /></button>)}
          <button className="clear-filters-button" onClick={clearFilters}>Clear all</button>
        </div>
      )}
      <div className="results-summary documents-results-summary">
        <span><strong>{loading ? 'Loading…' : sortedDocuments.length}</strong> {sortedDocuments.length === 1 ? 'document' : 'documents'} {scope === 'all' ? 'in this workspace' : scope === 'owned' ? 'owned by you' : 'shared with you'}{documents.length >= 100 ? ' · latest 100 returned' : ''}</span>
        <label className="document-sort-control"><span>Sorted by</span><span className="document-sort-select"><select aria-label="Sort documents" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="modified">Last modified</option><option value="name">Name</option></select><ChevronDown size={14} aria-hidden="true" /></span></label>
      </div>
      {error ? <ErrorState message={error} onRetry={() => setRetry((count) => count + 1)} /> : loading ? <LoadingState label="Loading documents…" /> : (
        <>
          <section className="panel documents-table-panel">
            <DocumentTable documents={shown} currentUserId={user.id} view={view} onChanged={updateDocuments} emptyMessage="No documents match these filters. Clear a filter or upload a document." />
            {sortedDocuments.length > 0 && (
              <div className="pagination">
                <span>Showing {((displayedPage - 1) * pageSize) + 1}–{Math.min(displayedPage * pageSize, sortedDocuments.length)} of {sortedDocuments.length}</span>
                <div>
                  <button className="button button-secondary pagination-prev" disabled={displayedPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                  {Array.from({ length: pages }, (_, index) => index + 1).filter((number) => number === 1 || number === pages || Math.abs(number - displayedPage) <= 1).map((number, index, visiblePages) => <span className="document-page-number-slot" key={number}>{index > 0 && number - visiblePages[index - 1] > 1 && <span className="document-page-ellipsis">…</span>}<button className={`page-number${displayedPage === number ? ' current' : ''}`} aria-label={`Page ${number}`} aria-current={displayedPage === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
                  <button className="button button-secondary" disabled={displayedPage >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
              </div>
            )}
          </section>
          {scope === 'all' && <p className="data-limit-note">The service exposes at most 100 newest accessible documents per request. The API does not return individual permission levels, so shared access is not labeled as read or edit.</p>}
          {scope === 'shared' && <p className="data-limit-note">The API does not return individual permission levels. Shared access is shown without assuming read or edit rights.</p>}
        </>
      )}
    </main>
  )
}
