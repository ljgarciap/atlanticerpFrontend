import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import MensualClienteAcumuladoPage from './MensualClienteAcumuladoPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { ClientCollectionReport } from '@/types/adminContab'

// SCRUM-935 — "Mensual por cliente — acumulado" (4M2): sin columna "Media". El resto de la
// cobertura del componente compartido vive en MensualClientePage.test.tsx.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    accountStatement: { searchClients: vi.fn() },
    reports: { mensualClienteAcumulado: vi.fn(), mensualClienteAcumuladoExcel: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const REPORT: ClientCollectionReport = {
  estado: 'ok',
  resumen: { registros: 2, total_facturado: 1000, total_cobrado: 800, total_pendiente: 200 },
  filas: [{ anio: 2026, mes: 'Enero', num: 2, importe: 1000, transferencia: 800, cheque: 0, efectivo: 0, yappy: 0, otros: 0, total_caja: 800 }],
  totales: { num: 2, importe: 1000, transferencia: 800, cheque: 0, efectivo: 0, yappy: 0, otros: 0, total_caja: 800 },
  pendientes: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.accountStatement.searchClients.mockResolvedValue([{ id: 7, name: 'Torres Pacífico' }])
  mockedApi.reports.mensualClienteAcumulado.mockResolvedValue(REPORT)
})

describe('MensualClienteAcumuladoPage — SCRUM-935', () => {
  it('la tabla acumulada no incluye la columna "Media"', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><MensualClienteAcumuladoPage /></MemoryRouter>
      </QueryClientProvider>,
    )

    const input = screen.getByPlaceholderText('adminContab:reportes.mensualCliente.clientePlaceholder')
    fireEvent.change(input, { target: { value: 'Torres' } })
    fireEvent.focus(input)
    fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))

    expect(await screen.findByText('adminContab:reportes.mensualCliente.columnas.importe')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:reportes.mensualCliente.columnas.media')).not.toBeInTheDocument()
  })
})
