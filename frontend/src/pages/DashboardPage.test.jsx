import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'

const { useAuthMock, listDocumentsMock, listAuditLogsMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listDocumentsMock: vi.fn(),
  listAuditLogsMock: vi.fn(),
}))

vi.mock('../context/useAuth.js', () => ({ useAuth: useAuthMock }))
vi.mock('../services/documentService.js', () => ({ listDocuments: listDocumentsMock }))
vi.mock('../services/auditService.js', () => ({ listAuditLogs: listAuditLogsMock }))

const regularUser = { id: 'user-1', name: 'Test User', role: 'user' }

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>)
}

describe('dashboard workspace overview', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: regularUser })
    listDocumentsMock.mockReset()
    listAuditLogsMock.mockReset()
  })

  afterEach(() => cleanup())

  it('shows loading and then renders empty document statistics', async () => {
    let resolveDocuments
    listDocumentsMock.mockReturnValue(new Promise((resolve) => { resolveDocuments = resolve }))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading documents')
    resolveDocuments([])

    await waitFor(() => expect(screen.getByText('Total documents').closest('article')).toHaveTextContent('0'))
    expect(screen.getByText('Upload a document to get started.')).toBeInTheDocument()
    expect(screen.getByText('Admin only')).toBeInTheDocument()
    expect(listAuditLogsMock).not.toHaveBeenCalled()
  })

  it('renders document rows after successful loading', async () => {
    listDocumentsMock.mockResolvedValue([{
      id: 'doc-1',
      name: 'Quarterly report.pdf',
      ownerId: regularUser.id,
      mimeType: 'application/pdf',
      category: 'Reports',
      size: 2048,
      updatedAt: '2026-10-20T10:00:00.000Z',
    }])
    renderPage()

    expect(await screen.findByText('Quarterly report.pdf')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    const documentRow = screen.getByRole('row', { name: /Quarterly report\.pdf/ })
    expect(within(documentRow).getByText('Owner')).toBeInTheDocument()
    expect(documentRow).toHaveTextContent('2 KB')
  })

  it('shows API errors and retries document loading', async () => {
    listDocumentsMock
      .mockRejectedValueOnce({ response: { data: { error: 'Documents unavailable' } } })
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Documents unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(listDocumentsMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Upload a document to get started.')).toBeInTheDocument()
  })
})
