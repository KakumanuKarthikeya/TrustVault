import { useRef, useState } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import formatBytes from '../utils/formatBytes.js'

const maxBytes = 5 * 1024 * 1024
const acceptedExtensions = /\.(pdf|png|jpe?g)$/i

export default function FileUpload({ file, onFileChange, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  function acceptFile(candidate) {
    setError('')
    if (!candidate) return
    if (!acceptedExtensions.test(candidate.name)) {
      onFileChange(null)
      setError('Choose a PDF, PNG, or JPEG file.')
      return
    }
    if (candidate.size > maxBytes) {
      onFileChange(null)
      setError('The file must be 5 MiB or smaller.')
      return
    }
    if (candidate.size === 0) {
      onFileChange(null)
      setError('The selected file is empty.')
      return
    }
    onFileChange(candidate)
  }

  return (
    <div>
      {file ? (
        <div className="selected-file">
          <span className="file-kind-icon"><FileUp size={19} /></span>
          <span className="selected-file-details"><strong>{file.name}</strong><small>{formatBytes(file.size)} · Ready to upload</small></span>
          <button type="button" className="icon-button" aria-label="Remove selected file" disabled={disabled} onClick={() => { onFileChange(null); setError('') }}><Trash2 size={17} /></button>
        </div>
      ) : (
        <button
          type="button"
          className={`drop-zone${dragging ? ' drop-zone-active' : ''}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]) }}
        >
          <span className="drop-icon"><FileUp size={21} /></span>
          <strong>Choose a file or drag it here</strong>
          <span>PDF, PNG, or JPEG · Maximum file size 5 MiB</span>
        </button>
      )}
      <input ref={inputRef} className="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => { acceptFile(event.target.files[0]); event.target.value = '' }} />
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
