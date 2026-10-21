import { AlertCircle, FileSearch, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-view" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-view state-error" role="alert">
      <AlertCircle size={24} />
      <strong>Something went wrong</strong>
      <span>{message}</span>
      {onRetry && <button className="button button-secondary" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function EmptyState({ title = 'No documents found', message = 'Try changing your search or filters.' }) {
  return (
    <div className="state-view">
      <FileSearch size={28} />
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  )
}
