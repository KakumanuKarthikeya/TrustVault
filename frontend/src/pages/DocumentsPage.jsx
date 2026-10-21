import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchFilters from '../components/SearchFilters.jsx'
import DocumentTable from '../components/DocumentTable.jsx'
import { ErrorState, LoadingState } from '../components/StateViews.jsx'
import { listDocuments } from '../services/documentService.js'
import { useAuth } from '../context/useAuth.js'

const pageSize = 10
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

  const pages = Math.max(1, Math.ceil(scopedDocuments.length / pageSize))
  const displayedPage = Math.min(page, pages)
  const shown = scopedDocuments.slice((displayedPage - 1) * pageSize, displayedPage * pageSize)

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
    setFilters(next)
    setPage(1)
  }

  return (
    <main className="page documents-page">
      <div className="page-heading">
        <div><h1>{heading.title}</h1><p>{heading.description}</p></div>
        <button className="button button-primary" onClick={() => navigate('/upload')}>＋ <span>Upload document</span></button>
      </div>
      <SearchFilters filters={filters} setFilters={handleFilters} documents={documents} view={view} setView={setView} />
      <div className="results-summary">
        <span><strong>{loading ? 'Loading…' : scopedDocuments.length}</strong> {scopedDocuments.length === 1 ? 'document' : 'documents'}{scope === 'all' ? ' available in this workspace' : ''}</span>
        <span>Newest first · API returns up to 100 records</span>
      </div>
      {error ? <ErrorState message={error} onRetry={() => setRetry((count) => count + 1)} /> : loading ? <LoadingState label="Loading documents…" /> : (
        <>
          <section className="panel documents-table-panel">
            <DocumentTable documents={shown} currentUserId={user.id} view={view} onChanged={updateDocuments} />
            {scopedDocuments.length > 0 && (
              <div className="pagination">
                <span>Showing {((displayedPage - 1) * pageSize) + 1}–{Math.min(displayedPage * pageSize, scopedDocuments.length)} of {scopedDocuments.length}</span>
                <div>
                  <button className="button button-secondary pagination-prev" disabled={displayedPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                  {Array.from({ length: pages }, (_, index) => index + 1).map((number) => <button key={number} className={`page-number${displayedPage === number ? ' current' : ''}`} aria-label={`Page ${number}`} aria-current={displayedPage === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}
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
