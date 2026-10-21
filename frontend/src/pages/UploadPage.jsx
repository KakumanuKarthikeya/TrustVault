import { useState } from 'react'
import { ArrowLeft, Check, ShieldCheck, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload.jsx'
import { uploadDocument } from '../services/documentService.js'
import { useAuth } from '../context/useAuth.js'

const categorySuggestions = ['general', 'compliance', 'finance', 'legal', 'people', 'product', 'security']

export default function UploadPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('general')
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [complete, setComplete] = useState(false)
  const canUpload = ['owner', 'admin'].includes(user.role)

  function chooseFile(next) {
    setFile(next)
    if (next) setName(next.name.replace(/\.[^.]+$/, ''))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!file) {
      setError('Select a file before uploading.')
      return
    }
    if (!canUpload) {
      setError('Your account role is not permitted to upload documents.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name.trim())
    formData.append('category', category)
    if (description.trim()) formData.append('description', description.trim())
    setUploading(true)
    setProgress(0)
    try {
      await uploadDocument(formData, (event) => {
        if (event.total) setProgress(Math.round((event.loaded / event.total) * 100))
      })
      setComplete(true)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Upload failed. The backend did not confirm that this file was stored.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="page upload-page">
      <Link to="/documents" className="back-link"><ArrowLeft size={15} /> Back to documents</Link>
      <div className="page-heading"><div><h1>Upload document</h1><p>Add a file to your secure workspace and choose how it should be organized.</p></div></div>
      {complete ? (
        <section className="panel upload-success" role="status">
          <span className="success-icon"><Check size={25} /></span>
          <h2>Upload confirmed</h2>
          <p>The backend confirmed the document upload.</p>
          <div><button className="button button-primary" onClick={() => navigate('/documents', { state: { uploaded: true } })}>View documents</button><button className="button button-secondary" onClick={() => { setComplete(false); setFile(null); setName(''); setDescription('') }}>Upload another</button></div>
        </section>
      ) : (
        <form className="panel upload-form" onSubmit={handleSubmit}>
          {!canUpload && <p className="form-notice">Your account role does not include upload access. The backend permits uploads only for owners and administrators.</p>}
          <section className="upload-step">
            <div className="step-heading"><span className="step-number">1</span><div><h2>Select file</h2><p>Choose a document from your device.</p></div></div>
            <div className="step-content"><FileUpload file={file} onFileChange={chooseFile} disabled={uploading} />{uploading && <div className="upload-progress" role="status"><span style={{ width: `${progress}%` }} /><small>{progress}% uploaded</small></div>}</div>
          </section>
          <section className="upload-step upload-details-step">
            <div className="step-heading"><span className="step-number">2</span><div><h2>Document details</h2><p>Add helpful details to keep your workspace organized.</p></div></div>
            <div className="step-content upload-fields">
              <label>Document name<input required maxLength="255" value={name} onChange={(event) => setName(event.target.value)} placeholder="Document name" /></label>
              <label>Category<input required maxLength="50" list="document-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Enter a category" /><datalist id="document-categories">{categorySuggestions.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label className="field-full">Description <span className="label-hint">Optional</span><textarea rows="4" maxLength="2000" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short description for your team…" /></label>
            </div>
          </section>
          {error && <p className="form-error upload-error" role="alert">{error}</p>}
          <footer className="upload-footer">
            <div className="encryption-note"><ShieldCheck size={17} /><span><strong>Private document storage</strong><small>Access rules are enforced by the backend.</small></span></div>
            <div><button type="button" className="button button-secondary" disabled={uploading} onClick={() => navigate('/documents')}>Cancel</button><button className="button button-primary" disabled={uploading || !canUpload}><Upload size={16} />{uploading ? 'Uploading…' : 'Upload document'}</button></div>
          </footer>
        </form>
      )}
    </main>
  )
}
