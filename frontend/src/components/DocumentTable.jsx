import { useState } from 'react'
import { Download, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { PermissionBadge } from './Badges.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { EmptyState } from './StateViews.jsx'
import {
  downloadDocument,
  deleteDocument,
  grantDocumentPermission,
  revokeDocumentPermission,
  updateDocument,
} from '../services/documentService.js'
import { lookupUserByEmail } from '../services/userService.js'
import formatBytes from '../utils/formatBytes.js'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function fileKind(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/png') return 'PNG'
  if (mimeType === 'image/jpeg') return 'JPG'
  return 'FILE'
}

function DocumentActions({ document, owned, onChanged }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [manageAccess, setManageAccess] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [access, setAccess] = useState('read')
  const [accessMessage, setAccessMessage] = useState('')
  const [name, setName] = useState(document.name)
  const [category, setCategory] = useState(document.category)
  const [description, setDescription] = useState(document.description || '')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())

  async function handleDownload() {
    setWorking(true)
    setError('')
    try {
      await downloadDocument(document)
      setOpen(false)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Download failed. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      const updated = await updateDocument(document.id, { name, category, description })
      onChanged({ type: 'update', document: updated })
      setEdit(false)
      setOpen(false)
    } catch (requestError) {
      onChanged({ type: 'refresh' })
      setError(requestError.response?.data?.error || 'The server did not confirm the update. It may have committed; refresh to verify.')
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    setWorking(true)
    setError('')
    try {
      await deleteDocument(document.id)
      onChanged({ type: 'delete', document })
      setConfirmDelete(false)
    } catch (requestError) {
      onChanged({ type: 'refresh' })
      setError(requestError.response?.data?.error || 'The server did not confirm deletion. It may have committed; refresh to verify.')
    } finally {
      setWorking(false)
    }
  }

  async function handleGrant(event) {
    event.preventDefault()
    if (!recipient) {
      setError('Look up an active account by email before granting access.')
      return
    }
    setWorking(true)
    setError('')
    setAccessMessage('')
    try {
      await grantDocumentPermission(document.id, recipient.id, access)
      setAccessMessage(`The backend confirmed ${access} access for ${recipient.email}.`)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The backend did not confirm the access grant.')
    } finally {
      setWorking(false)
    }
  }

  async function handleLookup() {
    const normalizedEmail = recipientEmail.trim().toLowerCase()
    setError('')
    setAccessMessage('')
    setRecipient(null)
    if (!validEmail) {
      setError('Enter a valid recipient email address.')
      return
    }
    setLookupLoading(true)
    try {
      setRecipient(await lookupUserByEmail(normalizedEmail))
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Account lookup failed. Please try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleRevoke() {
    if (!recipient) {
      setError('Look up the recipient by email before revoking access.')
      return
    }
    setWorking(true)
    setError('')
    setAccessMessage('')
    try {
      await revokeDocumentPermission(document.id, recipient.id)
      setAccessMessage(`The backend confirmed access was revoked for ${recipient.email}.`)
      setConfirmRevoke(false)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The backend did not confirm the access revocation.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="document-actions">
      <button className="icon-button row-menu-button" aria-label={`Actions for ${document.name}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div className="action-menu">
          <button onClick={handleDownload} disabled={working}><Download size={15} />Download</button>
          <button onClick={() => { setEdit(true); setOpen(false) }}><Pencil size={15} />Edit details</button>
          {owned && <button onClick={() => { setManageAccess(true); setOpen(false); setRecipientEmail(''); setRecipient(null); setError(''); setAccessMessage('') }}><FileText size={15} />Manage access</button>}
          {owned && <button className="action-danger" onClick={() => { setConfirmDelete(true); setOpen(false) }}><Trash2 size={15} />Delete</button>}
        </div>
      )}
      {error && <div className="inline-action-error" role="alert">{error}</div>}
      {edit && (
        <div className="dialog-backdrop">
          <form className="confirm-dialog document-edit-form" role="dialog" aria-modal="true" aria-labelledby={`edit-title-${document.id}`} onSubmit={handleSave}>
            <h2 id={`edit-title-${document.id}`}>Edit document details</h2>
            <label>Document name<input required maxLength="255" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Category<input required maxLength="50" value={category} onChange={(event) => setCategory(event.target.value)} /></label>
            <label>Description<textarea maxLength="2000" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button button-secondary" disabled={working} onClick={() => setEdit(false)}>Cancel</button>
              <button className="button button-primary" disabled={working}>{working ? 'Saving…' : 'Save details'}</button>
            </div>
          </form>
        </div>
      )}
      {manageAccess && (
        <div className="dialog-backdrop">
          <form className="confirm-dialog document-edit-form access-form" role="dialog" aria-modal="true" aria-labelledby={`access-title-${document.id}`} onSubmit={handleGrant}>
            <h2 id={`access-title-${document.id}`}>Manage document access</h2>
            <p>Look up an active account by email to share this document. Only you, as the owner, can change its access.</p>
            <label>Recipient email
              <span className="recipient-lookup-field">
                <input required type="email" maxLength="254" value={recipientEmail} onChange={(event) => { setRecipientEmail(event.target.value); setRecipient(null); setAccessMessage(''); setError('') }} placeholder="name@example.com" autoComplete="email" />
                <button type="button" className="button button-secondary" disabled={working || lookupLoading || !recipientEmail.trim()} onClick={handleLookup}>
                  {lookupLoading ? 'Looking up…' : 'Find account'}
                </button>
              </span>
            </label>
            {recipient && <p className="recipient-lookup-result" role="status"><strong>{recipient.name}</strong><span>{recipient.email}</span></p>}
            <label>Access level<select value={access} onChange={(event) => setAccess(event.target.value)}><option value="read">Read</option><option value="edit">Edit</option></select></label>
            {accessMessage && <p className="form-notice" role="status">{accessMessage}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions access-dialog-actions">
              <button type="button" className="button button-secondary" disabled={working || lookupLoading} onClick={() => setManageAccess(false)}>Close</button>
              <button type="button" className="button button-secondary" disabled={working || lookupLoading || !recipient} onClick={() => setConfirmRevoke(true)}>Revoke access</button>
              <button className="button button-primary" disabled={working || lookupLoading || !recipient}>{working ? 'Saving…' : 'Grant access'}</button>
            </div>
          </form>
        </div>
      )}
      {confirmDelete && <ConfirmDialog title="Delete document?" message={`“${document.name}” will be permanently deleted.`} confirmLabel="Delete document" busy={working} onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />}
      {confirmRevoke && <ConfirmDialog title="Revoke document access?" message={`Revoke ${recipient?.email || 'this account'}'s access to “${document.name}”?`} confirmLabel="Revoke access" busy={working} onConfirm={handleRevoke} onCancel={() => setConfirmRevoke(false)} />}
    </div>
  )
}

export default function DocumentTable({ documents, currentUserId, view = 'list', onChanged, emptyMessage }) {
  if (documents.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className={view === 'grid' ? 'document-grid' : 'table-scroll'}>
      {view === 'grid' ? documents.map((document) => {
        const owned = document.ownerId === currentUserId
        return (
          <article className="document-grid-card" key={document.id}>
            <div className="grid-card-heading"><span className="file-kind-icon"><FileText size={18} /></span><DocumentActions document={document} owned={owned} onChanged={onChanged} /></div>
            <strong className="document-name">{document.name}</strong>
            <span className="document-subtitle">{fileKind(document.mimeType)} · {formatBytes(document.size)}</span>
            <div className="grid-card-meta"><span>{document.category || 'Uncategorized'}</span><PermissionBadge owned={owned} /></div>
            <span className="grid-card-date">Modified {dateFormat.format(new Date(document.updatedAt))}</span>
          </article>
        )
      }) : (
        <table className="data-table document-data-table">
          <thead><tr><th>Name</th><th>Category</th><th>Owner</th><th>Modified</th><th>Access</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {documents.map((document) => {
              const owned = document.ownerId === currentUserId
              return (
                <tr key={document.id}>
                  <td><div className="table-file"><span className="file-kind-icon">{fileKind(document.mimeType)}</span><span><strong className="document-name">{document.name}</strong><small>{fileKind(document.mimeType)} · {formatBytes(document.size)}</small></span></div></td>
                  <td>{document.category || 'Uncategorized'}</td>
                  <td><span className="owner-cell"><span className="mini-avatar">{owned ? 'You' : '—'}</span>{owned ? 'You' : 'Other owner'}</span></td>
                  <td>{dateFormat.format(new Date(document.updatedAt))}</td>
                  <td><PermissionBadge owned={owned} /></td>
                  <td><DocumentActions document={document} owned={owned} onChanged={onChanged} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
