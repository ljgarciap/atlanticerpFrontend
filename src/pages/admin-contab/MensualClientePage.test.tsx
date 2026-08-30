import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import MensualClientePage from './MensualClientePage'
import { adminContabApi } from '@/api/adminContabApi'
import type { AccountStatementClientOption, ClientCollectionReport } from '@/types/adminContab'

// Batch 23 Grupo 2 (SCRUM-651→655, REQ-574→578) — "Reporte mensual por cliente" (4M1). Cubre el
// componente compartido `ClientCollectionReportView` a través de este wrapper — Acumulado (4M2)
// reusa el mismo componente, solo cambia `agrupacion`/título, no repite esta cobertura.

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
    reports: { mensualCliente: vi.fn(), mensualClienteExcel: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CLIENT: AccountStatementClientOption = { id: 7, name: 'Torres Pacífico' }

function makeReportOk(overrides: Partial<Extract<ClientCollectionReport, { estado: 'ok' }>> = {}): ClientCollectionReport {
  return {
    estado: 'ok',
    resumen: { registros: 6, total_facturado: 43900, total_cobrado: 37700, total_pendiente: 6200 },
    filas: [{ fecha: '2026-01-15', num: 1, importe: 8400, media: 8400, transferencia: 8400, cheque: 0, efectivo: 0, yappy: 0, otros: 0, total_caja: 8400 }],
    totales: { num: 1, importe: 8400, media: 8400, transferencia: 8400, cheque: 0, efectivo: 0, yappy: 0, otros: 0, total_caja: 8400 },
    pendientes: [],
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MensualClientePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function selectClient(label = 'Torres Pacífico') {
  const input = screen.getByPlaceholderText('adminContab:reportes.mensualCliente.clientePlaceholder')
  fireEvent.change(input, { target: { value: 'Torres' } })
  fireEvent.focus(input)
  fireEvent.mouseDown(await screen.findByText(label))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.accountStatement.searchClients.mockResolvedValue([CLIENT])
})

describe('MensualClientePage — RN1 REQ-574 estado sin cliente', () => {
  it('sin cliente seleccionado, no pide nada al backend y muestra el mensaje', () => {
    renderPage()
    expect(screen.getByText('adminContab:reportes.mensualCliente.seleccionaCliente')).toBeInTheDocument()
    expect(mockedApi.reports.mensualCliente).not.toHaveBeenCalled()
  })
})

describe('MensualClientePage — selección de cliente dispara el reporte de inmediato', () => {
  it('elegir un cliente puntual pide el reporte con su id', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk())
    renderPage()
    await selectClient()

    await waitFor(() => expect(mockedApi.reports.mensualCliente).toHaveBeenCalledWith({ masterClientId: 7, desde: undefined, hasta: undefined }))
  })

  it('RN2 — "Todos los clientes" pide el reporte combinado con masterClientId="todos"', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk())
    renderPage()

    const input = screen.getByPlaceholderText('adminContab:reportes.mensualCliente.clientePlaceholder')
    fireEvent.focus(input)
    fireEvent.mouseDown(await screen.findByText('adminContab:reportes.mensualCliente.todosLosClientes'))

    await waitFor(() => expect(mockedApi.reports.mensualCliente).toHaveBeenCalledWith({ masterClientId: 'todos', desde: undefined, hasta: undefined }))
  })
})

describe('MensualClientePage — fechas requieren el botón Filtrar', () => {
  it('cambiar las fechas no dispara solo — hace falta presionar Filtrar', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk())
    renderPage()
    await selectClient()
    await waitFor(() => expect(mockedApi.reports.mensualCliente).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('adminContab:reportes.mensualCliente.desde'), { target: { value: '2026-01-01' } })
    expect(mockedApi.reports.mensualCliente).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('adminContab:reportes.mensualCliente.filtrar'))
    await waitFor(() => expect(mockedApi.reports.mensualCliente).toHaveBeenCalledWith({ masterClientId: 7, desde: '2026-01-01', hasta: undefined }))
  })
})

describe('MensualClientePage — Limpiar', () => {
  it('resetea cliente/fechas y vuelve al estado vacío inicial', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk())
    renderPage()
    await selectClient()
    await screen.findByText('adminContab:reportes.mensualCliente.registros')

    fireEvent.click(screen.getByText('adminContab:reportes.mensualCliente.limpiar'))

    expect(screen.getByText('adminContab:reportes.mensualCliente.seleccionaCliente')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('adminContab:reportes.mensualCliente.clientePlaceholder')).toHaveValue('')
  })
})

describe('MensualClientePage — RN1 REQ-577 sección Pendientes de cobro', () => {
  it('no aparece cuando no hay pendientes', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk({ pendientes: [] }))
    renderPage()
    await selectClient()

    await screen.findByText('adminContab:reportes.mensualCliente.registros')
    expect(screen.queryByText('adminContab:reportes.mensualCliente.pendientesTitle')).not.toBeInTheDocument()
  })

  it('aparece con al menos 1 registro pendiente', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk({
      pendientes: [{ fecha: '2026-06-28', factura: 'F-4410', proyecto: 'Torres Pacífico — Bodega Norte', monto: 6200 }],
    }))
    renderPage()
    await selectClient()

    expect(await screen.findByText('adminContab:reportes.mensualCliente.pendientesTitle')).toBeInTheDocument()
    expect(screen.getByText(/F-4410/)).toBeInTheDocument()
  })
})

describe('MensualClientePage — RN1 REQ-578 descargar bloqueado sin datos', () => {
  it('sin cliente, el botón Descargar está deshabilitado', () => {
    renderPage()
    expect(screen.getByText('adminContab:reportes.mensualCliente.descargar').closest('button')).toBeDisabled()
  })

  it('con cliente y datos, Descargar dispara el download', async () => {
    mockedApi.reports.mensualCliente.mockResolvedValue(makeReportOk())
    mockedApi.reports.mensualClienteExcel.mockResolvedValue(undefined)
    renderPage()
    await selectClient()
    await screen.findByText('adminContab:reportes.mensualCliente.registros')

    fireEvent.click(screen.getByText('adminContab:reportes.mensualCliente.descargar'))

    await waitFor(() => expect(mockedApi.reports.mensualClienteExcel).toHaveBeenCalledWith({ masterClientId: 7, desde: undefined, hasta: undefined }))
  })
})
