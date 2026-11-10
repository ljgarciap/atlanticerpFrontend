import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import InspectionReportMobilePage from './InspectionReportMobilePage'
import { serviciosApi } from '@/api/serviciosApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${Object.values(o).join(',')}` : k),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/store/authStore', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, permissions: ['servicios.field_work.edit'] } }) }))
vi.mock('@/store/toastStore', () => ({ useToastStore: (sel: (s: { show: () => void }) => unknown) => sel({ show: vi.fn() }) }))
vi.mock('@/components/servicios/TicketDetailModal', () => ({ canEditInspectionReport: () => true }))
vi.mock('@/components/servicios/SignaturePad', () => ({ default: () => null }))
vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tickets: { get: vi.fn() },
    inspectionReports: { fields: vi.fn(), get: vi.fn(), save: vi.fn(), saveMobile: vi.fn(), uploadPhoto: vi.fn() },
    insumos: { list: vi.fn() },
    technicians: { internalOptions: vi.fn() },
  },
}))

const api = vi.mocked(serviciosApi, true)

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/servicios/tickets/9/informe-movil']}>
        <Routes><Route path="/servicios/tickets/:ticketId/informe-movil" element={<InspectionReportMobilePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.tickets.get.mockResolvedValue({ id: 9, numero: 'INS-9', tipo: 'installation', internal_technician: { id: 4 }, cliente_master: 'Cliente', productos: [] } as never)
  api.inspectionReports.fields.mockResolvedValue([{ label: 'Estado', ticket_product_id: null }] as never)
  api.inspectionReports.get.mockResolvedValue(null as never)
  api.inspectionReports.save.mockResolvedValue({} as never)
  api.insumos.list.mockResolvedValue([])
  api.technicians.internalOptions.mockResolvedValue([])
})

describe('InspectionReportMobilePage — borrador (Fase 32)', () => {
  it('guardar borrador envía borrador: true sin pasar por la firma', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('mobile-save-draft'))
    await waitFor(() => expect(api.inspectionReports.save).toHaveBeenCalledWith(9, expect.objectContaining({ borrador: true })))
    expect(api.inspectionReports.saveMobile).not.toHaveBeenCalled()
  })
})
