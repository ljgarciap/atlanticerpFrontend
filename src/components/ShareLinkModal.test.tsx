import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ShareLinkModal from './ShareLinkModal'
import { projectsApi } from '@/api/projectsApi'
import type { Document, ShareLink } from '@/types/project'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number, name?: string, date?: string }) => (o ? `${key}|${JSON.stringify(o)}` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/projectsApi', () => ({
  projectsApi: { listShareLinks: vi.fn(), createShareLink: vi.fn(), revokeShareLink: vi.fn() },
}))

const api = vi.mocked(projectsApi, true)
const doc = { id: 7, nombre_archivo: 'propuesta.pdf' } as Document
const link = (over: Partial<ShareLink>): ShareLink => ({
  id: 1, destinatario: null, expires_at: '2099-01-01T00:00:00Z', revoked_at: null, access_count: 0, last_accessed_at: null,
  created_by: { id: 1, first_name: 'Ana', last_name: 'Test' }, created_at: '2026-11-01T00:00:00Z', ...over,
})

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ShareLinkModal projectId={3} document={doc} onClose={() => {}} /></QueryClientProvider>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('ShareLinkModal — seguimiento de enlaces', () => {
  it('muestra a quién se compartió y cuántas veces se abrió cada enlace', async () => {
    api.listShareLinks.mockResolvedValue([
      link({ id: 1, destinatario: 'Cliente de prueba', access_count: 3, last_accessed_at: '2026-11-02T10:00:00Z' }),
      link({ id: 2 }),
    ])
    renderModal()
    expect(await screen.findByText(/crm:shareLink.sharedWith\|.*Cliente de prueba/)).toBeInTheDocument()
    expect(screen.getByTestId('share-opens-1').textContent).toContain('crm:shareLink.opens')
    expect(screen.getByTestId('share-opens-1').textContent).toContain('"count":3')
    expect(screen.getByTestId('share-opens-2').textContent).toBe('crm:shareLink.neverOpened')
  })

  it('envía el destinatario al generar el enlace y limpia el campo', async () => {
    api.listShareLinks.mockResolvedValue([])
    api.createShareLink.mockResolvedValue({ ...link({ id: 9 }), url: 'https://x.test/public/share/abc' })
    renderModal()
    const campo = await screen.findByLabelText('crm:shareLink.recipientLabel')
    fireEvent.change(campo, { target: { value: '  Estudio de prueba ' } })
    fireEvent.click(screen.getByText('crm:shareLink.generate'))
    await waitFor(() => expect(api.createShareLink).toHaveBeenCalledWith(3, 7, 'Estudio de prueba'))
    await waitFor(() => expect(campo).toHaveValue(''))
  })

  it('sin destinatario no manda el campo', async () => {
    api.listShareLinks.mockResolvedValue([])
    api.createShareLink.mockResolvedValue({ ...link({ id: 9 }), url: 'https://x.test/public/share/abc' })
    renderModal()
    fireEvent.click(await screen.findByText('crm:shareLink.generate'))
    await waitFor(() => expect(api.createShareLink).toHaveBeenCalledWith(3, 7, undefined))
  })
})
