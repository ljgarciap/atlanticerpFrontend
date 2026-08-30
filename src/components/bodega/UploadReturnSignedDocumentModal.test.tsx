import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UploadReturnSignedDocumentModal from './UploadReturnSignedDocumentModal'
import { bodegaApi } from '@/api/bodegaApi'
import type { UploadReturnSignedDocumentResponse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: { returns: { uploadSignedDocument: vi.fn() } },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { onClose, ...render(
    <QueryClientProvider client={queryClient}>
      <UploadReturnSignedDocumentModal id={1} onClose={onClose} />
    </QueryClientProvider>,
  ) }
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => { vi.clearAllMocks() })

describe('UploadReturnSignedDocumentModal', () => {
  it('guardar sin archivo muestra error y no llama al backend', () => {
    renderModal()
    fireEvent.click(screen.getByText('bodega:returns.uploadModal.save'))
    expect(screen.getByText('bodega:returns.uploadModal.errors.required')).toBeInTheDocument()
    expect(mockedApi.returns.uploadSignedDocument).not.toHaveBeenCalled()
  })

  it('rechaza una extensión no permitida', () => {
    renderModal()
    const file = new File(['x'], 'firmado.txt', { type: 'text/plain' })
    fireEvent.change(fileInput(), { target: { files: [file] } })

    expect(screen.getByText('bodega:returns.uploadModal.errors.invalidType')).toBeInTheDocument()
    expect(screen.queryByText(/selectedFile/)).not.toBeInTheDocument()
  })

  it('rechaza un archivo mayor a 20MB', () => {
    renderModal()
    const bigFile = new File([new ArrayBuffer(21 * 1024 * 1024)], 'firmado.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput(), { target: { files: [bigFile] } })

    expect(screen.getByText('bodega:returns.uploadModal.errors.tooLarge')).toBeInTheDocument()
  })

  it('sube un archivo válido y cierra el modal', async () => {
    mockedApi.returns.uploadSignedDocument.mockResolvedValue({ id: 1, signed_document_uploaded_at: '2026-07-11T10:00:00Z' } as UploadReturnSignedDocumentResponse)
    const { onClose } = renderModal()
    const file = new File(['x'], 'firmado.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput(), { target: { files: [file] } })

    fireEvent.click(screen.getByText('bodega:returns.uploadModal.save'))

    await waitFor(() => expect(mockedApi.returns.uploadSignedDocument).toHaveBeenCalledWith(1, file))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
