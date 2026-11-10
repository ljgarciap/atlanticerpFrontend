import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClaimSheetModal from './ClaimSheetModal'
import { serviciosApi } from '@/api/serviciosApi'
import type { ClaimSheetDetail } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${Object.values(o).join(',')}` : k),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/serviciosApi', () => ({ serviciosApi: { claimSheets: { get: vi.fn(), save: vi.fn(), reopen: vi.fn() } } }))

const api = vi.mocked(serviciosApi, true)

function sheet(over: Partial<ClaimSheetDetail>): ClaimSheetDetail {
  return {
    ticket_id: 1, reclamante: { nombre: null, telefono: null, email: null, direccion: null, proyecto: null, responsable: null },
    productos: [], id: 1, descripcion_problema: null, fecha_reclamo: null, diagnostico: null, firma_responsable: null,
    estado: 'pending', created_at: null, ...over,
  } as ClaimSheetDetail
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><ClaimSheetModal ticketId={1} ticketNumero="REC-1" canEdit canReopen onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('ClaimSheetModal — reapertura', () => {
  it('Fase 32: una hoja reabierta muestra el motivo y quién la reabrió', async () => {
    api.claimSheets.get.mockResolvedValue(sheet({ reopened_at: '2026-11-10T10:00:00Z', reopened_reason: 'El diagnóstico estaba equivocado', reopened_by: 'Líder Servicios Test' }))
    renderModal()
    const notice = await screen.findByText(/tickets\.claimSheet\.reopenedNotice/)
    expect(notice).toHaveTextContent('El diagnóstico estaba equivocado')
    expect(notice).toHaveTextContent('Líder Servicios Test')
  })

  it('una hoja reabierta antes (sin autor) solo muestra el motivo', async () => {
    api.claimSheets.get.mockResolvedValue(sheet({ reopened_at: '2026-11-10T10:00:00Z', reopened_reason: 'Motivo anterior largo', reopened_by: null }))
    renderModal()
    const notice = await screen.findByText(/tickets\.claimSheet\.reopenedNotice/)
    expect(notice).not.toHaveTextContent('reopenedBy')
  })
})
