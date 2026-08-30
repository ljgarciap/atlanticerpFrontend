import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasMedioPagoPage from './VentasMedioPagoPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { PaymentMethodSalesReport } from '@/types/adminContab'

// Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago" (4M4). Cubre: carga
// sin seleccionar ningún cliente (RN1, nunca un estado vacío bloqueante), las 9 columnas reales de
// método de pago, y la sección "Pendientes de cobro" condicional (RN1 REQ-591).

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
    accountStatement: { searchClients: vi.fn() },
    reports: { ventasMedioPago: vi.fn(), ventasMedioPagoExcel: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeReport(overrides: Partial<PaymentMethodSalesReport> = {}): PaymentMethodSalesReport {
  return {
    resumen: { facturas_cobradas: 1, base_imponible: 7850.47, itbms: 549.53, total: 8400 },
    filas: [{
      fecha: '2026-01-05', cliente: 'Torres Pacífico', documento: 'F-4201',
      base_imponible: 7850.47, itbms: 549.53, total: 8400,
      transferencia: 8400, cheque: 0, efectivo: 0, tarjeta: 0, deposito: 0,
      yappy: 0, link_pago: 0, retencion_impuestos: 0, ajuste_cuenta: 0,
    }],
    pendientes: [],
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VentasMedioPagoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.accountStatement.searchClients.mockResolvedValue([])
  mockedApi.reports.ventasMedioPago.mockResolvedValue(makeReport())
})

describe('VentasMedioPagoPage', () => {
  it('loads data without requiring a client selection first', async () => {
    renderPage()

    await waitFor(() => expect(mockedApi.reports.ventasMedioPago).toHaveBeenCalledWith(expect.objectContaining({ masterClientId: undefined })))
    await waitFor(() => expect(screen.getByText('F-4201')).toBeInTheDocument())
  })

  it('renders all 9 real payment method columns', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('F-4201')).toBeInTheDocument())
    for (const metodo of ['transferencia', 'cheque', 'efectivo', 'tarjeta', 'depositoBancario', 'yappy', 'linkPago', 'retencionImpuestos', 'ajustesCuenta']) {
      expect(screen.getByText(`adminContab:reportes.ventasMedioPago.metodos.${metodo}`)).toBeInTheDocument()
    }
  })

  it('shows the Pendientes section only when there are pending invoices', async () => {
    mockedApi.reports.ventasMedioPago.mockResolvedValue(makeReport({
      pendientes: [{ fecha: '2026-06-28', documento: 'F-4410', proyecto: 'Torres Pacífico — Bodega Norte', monto: 6200 }],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('adminContab:reportes.ventasMedioPago.pendientesTitle')).toBeInTheDocument())
    expect(screen.getByText(/F-4410/)).toBeInTheDocument()
  })

  it('hides the Pendientes section when there are none', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('F-4201')).toBeInTheDocument())
    expect(screen.queryByText('adminContab:reportes.ventasMedioPago.pendientesTitle')).not.toBeInTheDocument()
  })
})
