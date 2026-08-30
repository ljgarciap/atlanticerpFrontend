import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PettyCashPage from './PettyCashPage'
import { adminContabApi } from '@/api/adminContabApi'
import { autocompleteApi } from '@/api/autocompleteApi'
import type {
  PettyCashSummary, PettyCashPendingResult, PettyCashReportListItem, PettyCashReportDetail,
  PettyCashRejectedLine,
} from '@/types/adminContab'

// Batch 20 de Admin&Cont (SCRUM-612→617, REQ-535→540) — Caja Chica. Cubre: contadores de las 3
// pestañas (REQ-536), panel Pendientes agrupado con subtotal/total general (REQ-537), "Generar
// reporte" deshabilitado sin pendientes (REQ-538), y detalle de reporte con gate de aprobación
// exclusivo de Mark vía `puede_aprobar` (REQ-539/540).
// Batch 21 (SCRUM-618→623, REQ-541→546) agrega: panel Rechazados real (REQ-543).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    pettyCash: {
      summary: vi.fn(), pending: vi.fn(), createExpenses: vi.fn(), generateReport: vi.fn(),
      reports: vi.fn(), reportDetail: vi.fn(), attachmentUrl: vi.fn(), approveReport: vi.fn(),
      downloadReportPdf: vi.fn(), rejected: vi.fn(), expenseDetail: vi.fn(), updateExpense: vi.fn(),
      addAttachment: vi.fn(), rejectExpense: vi.fn(), rejectReport: vi.fn(), reopenExpense: vi.fn(),
    },
  },
}))

vi.mock('@/api/autocompleteApi', () => ({
  autocompleteApi: { users: vi.fn() },
}))

const mockedApi = vi.mocked(adminContabApi, true)
const mockedAutocomplete = vi.mocked(autocompleteApi, true)

function makeSummary(overrides: Partial<PettyCashSummary> = {}): PettyCashSummary {
  return { pendientes_count: 2, reportes_count: 1, reportes_sin_aprobar_count: 1, rechazados_count: 0, pendientes_total: 50.5, ...overrides }
}

function makePending(overrides: Partial<PettyCashPendingResult> = {}): PettyCashPendingResult {
  return {
    grupos: [{
      solicitante_id: 5, solicitante_nombre: 'Yaneth Pineda', subtotal: 50.5,
      lineas: [
        { id: 1, fecha: '01 jul 2026', proveedor: 'Cafetería Manolo', descripcion: 'Café', monto_bruto: 18.5, itbms: 1.3, total: 19.8, estado: 'pendiente', intentos_rechazo: 0, attachments: [{ id: 1, nombre_archivo: 'recibo.jpg', mime_type: 'image/jpeg' }] },
        { id: 2, fecha: '01 jul 2026', proveedor: 'Farmacia Arrocha', descripcion: 'Botiquín', monto_bruto: 28.0, itbms: 2.7, total: 30.7, estado: 'pendiente', intentos_rechazo: 0, attachments: [] },
      ],
    }],
    total_general: 50.5,
    ...overrides,
  }
}

function makeRejectedLine(overrides: Partial<PettyCashRejectedLine> = {}): PettyCashRejectedLine {
  return {
    id: 9, fecha: '25 jun 2026', solicitante_nombre: 'Neil Quiel', proveedor: 'Copy Centro El Dorado',
    descripcion: 'Impresión de brochures', monto_bruto: 12.0, itbms: 0.84, total: 12.84,
    estado: 'rechazado_temporal', intentos_rechazo: 2, attachments: [],
    ...overrides,
  }
}

function makeReport(overrides: Partial<PettyCashReportListItem> = {}): PettyCashReportListItem {
  return { numero: '0002-2026', fecha_creacion: '02 jul 2026', total: 35, estado: 'pendiente_aprobacion', forma_pago: 'transferencia', realizado_por_nombre: 'Felix Campos', ...overrides }
}

function makeReportDetail(overrides: Partial<PettyCashReportDetail> = {}): PettyCashReportDetail {
  return {
    numero: '0002-2026', estado: 'pendiente_aprobacion', forma_pago: 'transferencia', fecha_creacion: '02 jul 2026',
    realizado_por_nombre: 'Felix Campos', aprobado_por_nombre: null, fecha_aprobacion: null,
    grupos: [{ solicitante_id: 5, solicitante_nombre: 'Yaneth Pineda', subtotal: 35, lineas: [] }],
    total_general: 35, puede_aprobar: true,
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin-contab/caja-chica']}>
        <PettyCashPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pettyCash.summary.mockResolvedValue(makeSummary())
  mockedApi.pettyCash.pending.mockResolvedValue(makePending())
  mockedApi.pettyCash.reports.mockResolvedValue([makeReport()])
  mockedApi.pettyCash.reportDetail.mockResolvedValue(makeReportDetail())
  mockedApi.pettyCash.rejected.mockResolvedValue([])
  mockedAutocomplete.users.mockResolvedValue([])
})

describe('PettyCashPage — REQ-536 pestañas', () => {
  it('muestra los contadores de Pendientes, Reportes (con sin aprobar) y Rechazados', async () => {
    renderPage()
    expect(await screen.findByText(/pendientesSub:count=2/)).toBeInTheDocument()
    expect(await screen.findByText(/reportesSubSinAprobar:count=1:sinAprobar=1/)).toBeInTheDocument()
    expect(await screen.findByText(/rechazadosSub:count=0/)).toBeInTheDocument()
  })

  it('"Generar reporte" está deshabilitado cuando no hay pendientes', async () => {
    mockedApi.pettyCash.summary.mockResolvedValue(makeSummary({ pendientes_count: 0 }))
    renderPage()
    const btn = await screen.findByText('cajaChica.generarReporte')
    expect(btn.closest('button')).toBeDisabled()
  })
})

describe('PettyCashPage — REQ-537 panel Pendientes', () => {
  it('agrupa por solicitante con subtotal y total general', async () => {
    renderPage()
    expect(await screen.findByText('Yaneth Pineda')).toBeInTheDocument()
    expect(screen.getByText('Cafetería Manolo')).toBeInTheDocument()
    expect(screen.getByText(/subtotal:solicitante=Yaneth Pineda/)).toBeInTheDocument()
    expect(screen.getByText('cajaChica.pendientesPanel.totalGeneral')).toBeInTheDocument()
    expect(screen.getAllByText(/50\.50/).length).toBeGreaterThan(0)
  })
})

describe('PettyCashPage — REQ-539/540 detalle de reporte', () => {
  it('al ver un reporte pendiente con puede_aprobar=true muestra el botón Aprobar', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.reportes'))
    fireEvent.click(await screen.findByText('cajaChica.reportesPanel.ver'))
    expect(await screen.findByText('cajaChica.detalleReporteModal.aprobar')).toBeInTheDocument()
  })

  it('un reporte finalizado no ofrece Aprobar, solo Descargar', async () => {
    mockedApi.pettyCash.reports.mockResolvedValue([makeReport({ numero: '0001-2026', estado: 'finalizado' })])
    mockedApi.pettyCash.reportDetail.mockResolvedValue(makeReportDetail({ numero: '0001-2026', estado: 'finalizado', puede_aprobar: false, aprobado_por_nombre: 'Mark Bekhar' }))
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.reportes'))
    fireEvent.click(await screen.findByText('cajaChica.reportesPanel.ver'))
    expect(await screen.findByText('cajaChica.detalleReporteModal.descargar')).toBeInTheDocument()
    expect(screen.queryByText('cajaChica.detalleReporteModal.aprobar')).not.toBeInTheDocument()
  })

  it('un reporte pendiente con puede_aprobar=true también ofrece Descargar y Rechazar reporte completo', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.reportes'))
    fireEvent.click(await screen.findByText('cajaChica.reportesPanel.ver'))
    expect(await screen.findByText('cajaChica.detalleReporteModal.descargar')).toBeInTheDocument()
    expect(screen.getByText('cajaChica.detalleReporteModal.rechazarReporte')).toBeInTheDocument()
  })
})

describe('PettyCashPage — REQ-543 panel Rechazados', () => {
  it('muestra vacío cuando no hay líneas rechazadas permanentemente', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.rechazados'))
    expect(await screen.findByText('cajaChica.rechazadosPanel.vacio')).toBeInTheDocument()
  })

  it('lista las líneas con 2 intentos y sus datos, incluido el solicitante', async () => {
    mockedApi.pettyCash.rejected.mockResolvedValue([makeRejectedLine()])
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.rechazados'))
    expect(await screen.findByText('Neil Quiel')).toBeInTheDocument()
    expect(screen.getByText('Copy Centro El Dorado')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('al hacer clic en una fila abre el modal unificado de detalle', async () => {
    mockedApi.pettyCash.rejected.mockResolvedValue([makeRejectedLine()])
    mockedApi.pettyCash.expenseDetail.mockResolvedValue({
      id: 9, fecha: '25 jun 2026', solicitante_id: 14, solicitante_nombre: 'Neil Quiel',
      proveedor: 'Copy Centro El Dorado', descripcion: 'Impresión de brochures',
      monto_bruto: 12.0, itbms: 0.84, total: 12.84, estado: 'rechazado_temporal', intentos_rechazo: 2,
      ubicacion: 'rechazados', reporte_numero: null, reporte_estado: null,
      editable: true, puede_agregar_soporte: true, puede_rechazar: false, puede_reabrir: true,
      attachments: [], historial: [
        { accion: 'rechazo', motivo: 'Descripción genérica.', fecha: '25 jun 2026', actor_nombre: 'Mark Bekhar' },
        { accion: 'rechazo', motivo: 'No corresponde a la empresa.', fecha: '01 jul 2026', actor_nombre: 'Mark Bekhar' },
      ],
    })
    renderPage()
    fireEvent.click(await screen.findByText('cajaChica.tabs.rechazados'))
    fireEvent.click(await screen.findByText('Neil Quiel'))
    expect(await screen.findByText('cajaChica.detalleLineaModal.reabrir')).toBeInTheDocument()
  })
})
