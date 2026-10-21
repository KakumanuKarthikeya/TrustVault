import api from './api.js'

export async function listDocuments(filters = {}, signal) {
  const params = {}
  if (filters.name) params.name = filters.name
  if (filters.category) params.category = filters.category
  if (filters.ownerId) params.ownerId = filters.ownerId
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = `${filters.to}T23:59:59.999Z`
  const { data } = await api.get('/documents', { params, signal })
  return data.documents
}

export async function uploadDocument(formData, onUploadProgress) {
  const { data } = await api.post('/documents', formData, {
    onUploadProgress,
  })
  return data.document
}

export async function updateDocument(documentId, metadata) {
  const { data } = await api.patch(`/documents/${documentId}`, metadata)
  return data.document
}

export const deleteDocument = (documentId) => api.delete(`/documents/${documentId}`)

export async function grantDocumentPermission(documentId, userId, access) {
  const { data } = await api.put(`/documents/${documentId}/permissions/${userId}`, { access })
  return data.permission
}

export const revokeDocumentPermission = (documentId, userId) =>
  api.delete(`/documents/${documentId}/permissions/${userId}`)

export async function downloadDocument(document) {
  const { data } = await api.get(`/documents/${document.id}/download`, {
    responseType: 'blob',
  })
  const objectUrl = URL.createObjectURL(data)
  const link = window.document.createElement('a')
  link.href = objectUrl
  link.download = document.originalFilename || document.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
