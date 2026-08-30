import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LibroFacturasPage from './LibroFacturasPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { InvoiceBookReport } from '@/types/adminContab'

// Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas" (4M3). Cubre: el filtro de
// tipo dispara solo (RN2, sin botón), notas de crédito muestran negativo, columna Motivo vacía en
// facturas, sin sección "Pendientes" (no aplica a este reporte).

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
    reports: { libroFacturas: vi.fn(), libroFacturasExcel: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeReport(overrides: Partial<InvoiceBookReport> = {}): InvoiceBookReport {
  return {
    resumen: { facturas: 1, notas_credito: 1, base_imponible: 11074.76, itbms: 775.24, total: 11850 },
    documentos: [
      { fecha: '2026-01-05', ruc: '8-745-1230', cliente: 'Torres Pacífico', tipo: 'Factura', motivo: null, documento: 'F-4201', base_imponible: 7850.47, porcentaje: 7, itbms: 549.53, total: 8400 },
      { fecha: '2026-01-25', ruc: '155-987654-2-2025', cliente: 'Grupo Sensei', tipo: 'Nota de Crédito', motivo: 'Descuento comercial', documento: 'NC-0002', base_imponible: -140.19, porcentaje: 7, itbms: -9.81, total: -150 },
    ],
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LibroFacturasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.reports.libroFacturas.mockResolvedValue(makeReport())
})

describe('LibroFacturasPage', () => {
  it('renders documents with motivo blank on invoices and negative amounts on credit notes', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('F-4201')).toBeInTheDocument())
    expect(screen.getByText('NC-0002')).toBeInTheDocument()
    // Factura: motivo vacío ("—")
    const rows = screen.getAllByRole('row')
    const facturaRow = rows.find(r => r.textContent?.includes('F-4201'))
    expect(facturaRow?.textContent).toContain('—')
    // Nota de crédito: total negativo — regex sin símbolo de moneda fijo, Node/ICU renderiza
    // es-PA como "USD 150.00", no "$150.00" (mismo gotcha ya documentado en ReportesPage.test.tsx).
    expect(screen.getByText(/^-.*150\.00$/)).toBeInTheDocument()
  })

  it('changing tipo filter refetches immediately without pressing Filtrar', async () => {
    renderPage()

    await waitFor(() => expect(mockedApi.reports.libroFacturas).toHaveBeenCalledTimes(1))
    expect(mockedApi.reports.libroFacturas).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: undefined }))

    fireEvent.change(screen.getByLabelText(/adminContab:reportes.libroFacturas.tipo/), { target: { value: 'nota_credito' } })

    await waitFor(() => expect(mockedApi.reports.libroFacturas).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'nota_credito' })))
  })

  it('disables the download button when there are no documents', async () => {
    mockedApi.reports.libroFacturas.mockResolvedValue(makeReport({ documentos: [], resumen: { facturas: 0, notas_credito: 0, base_imponible: 0, itbms: 0, total: 0 } }))
    renderPage()

    await waitFor(() => expect(screen.getByText('adminContab:reportes.libroFacturas.sinDocumentos')).toBeInTheDocument())
    expect(screen.getByText('adminContab:reportes.libroFacturas.descargar').closest('button')).toBeDisabled()
  })
})
