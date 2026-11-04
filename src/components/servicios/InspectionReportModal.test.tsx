import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import InspectionReportModal from './InspectionReportModal'
import { serviciosApi } from '@/api/serviciosApi'

// Fase 20a — con la firma del cliente confirmada el informe queda congelado: aviso visible y sin acciones de edición.
const LABELS: Record<string, string> = {
  'tickets.inspectionReport.modalTitle': 'Informe de inspección',
  'tickets.inspectionReport.signedLocked': 'Este informe ya fue firmado por el cliente y no puede modificarse.',
  'tickets.inspectionReport.viewOnMobile': 'Ver en móvil',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => LABELS[key] ?? key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    inspectionReports: { fields: vi.fn(), get: vi.fn(), save: vi.fn(), saveUpload: vi.fn(), uploadPhoto: vi.fn(), downloadPdf: vi.fn(), downloadBlankPdf: vi.fn() },
    technicians: { internalOptions: vi.fn() },
    insumos: { list: vi.fn() },
  },
}))

const api = vi.mocked(serviciosApi, true)

function informe(firmado: boolean) {
  return {
    id: 1, numero: 'INF-2026-0001', ticket_id: 7, modo: 'formulario', fecha_inspeccion: null, hora_inicio: null, hora_fin: null,
    internal_technician_id: null, findings: [], materiales: [], fotos: [], conclusion: 'Conclusión', requiere_seguimiento: false,
    proximos_pasos: null, firma_tecnico_nombre: null, firma_cliente_nombre: 'Cliente', archivo_adjunto_url: null, estado: 'completed',
    created_at: '2026-11-03T00:00:00Z', firma_cliente_imagen_url: firmado ? 'http://localhost/firma.png' : null,
  }
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <InspectionReportModal
          ticketId={7} ticketTipo="installation" productos={[]} ticketTechnicianId={null} ticketNumero="INS-1" ticketCliente="C"
          ticketProyecto={null} ticketDireccion={null} canEdit canDownloadBlank onClose={() => {}} onSaved={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('InspectionReportModal — informe firmado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.inspectionReports.fields.mockResolvedValue([])
    api.technicians.internalOptions.mockResolvedValue([])
    api.insumos.list.mockResolvedValue([] as never)
  })

  it('muestra el aviso y oculta «Ver en móvil» cuando el cliente ya firmó', async () => {
    api.inspectionReports.get.mockResolvedValue(informe(true) as never)
    renderModal()
    expect(await screen.findByText('Este informe ya fue firmado por el cliente y no puede modificarse.')).toBeTruthy()
    expect(screen.queryByText('Ver en móvil')).toBeNull()
  })

  it('sin firma sigue editable: sin aviso y con «Ver en móvil»', async () => {
    api.inspectionReports.get.mockResolvedValue(informe(false) as never)
    renderModal()
    await waitFor(() => expect(screen.getByText('Ver en móvil')).toBeTruthy())
    expect(screen.queryByText('Este informe ya fue firmado por el cliente y no puede modificarse.')).toBeNull()
  })
})
