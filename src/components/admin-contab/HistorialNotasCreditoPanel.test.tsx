import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HistorialNotasCreditoPanel from './HistorialNotasCreditoPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { NotaCreditoHistorialResult, NotaCreditoHistorialRow } from '@/types/adminContab'

// Batch 12 del cuerpo principal (SCRUM-569, REQ-492) — historial combinado (notas reales + cola de
// devoluciones confirmadas por Bodega, REQ-491) con filtros. Ver ADR-SCRUM565-570.

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
    notasCredito: { historial: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const NOTA_REAL: NotaCreditoHistorialRow = {
  id: 1, tipo: 'descuento_comercial', subtipo_anulacion: null, numero: 'NC-0001',
  cliente: 'Grupo Sensei', master_client_id: 1, estado: 'aplicada', monto: 500,
  fecha: '2026-08-20', factura_origen_numero: 'F-0001', registrado_por: 'Contabilidad Test',
  devolucion_bodega_id: null, customer_return_id: null,
}

const FILA_COLA: NotaCreditoHistorialRow = {
  id: null, tipo: null, subtipo_anulacion: null, numero: null,
  cliente: 'Torres Pacífico SA', master_client_id: 2, estado: 'pendiente_generar_nota', monto: null,
  fecha: '2026-08-22', factura_origen_numero: 'HS-3402', registrado_por: null,
  devolucion_bodega_id: null, customer_return_id: 42,
}

function makeResult(overrides: Partial<NotaCreditoHistorialResult> = {}): NotaCreditoHistorialResult {
  const data = overrides.data ?? [NOTA_REAL, FILA_COLA]
  return {
    data,
    meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function renderPanel(onSelectNota = vi.fn(), onGenerarDesdeDevolucion = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HistorialNotasCreditoPanel onSelectNota={onSelectNota} onGenerarDesdeDevolucion={onGenerarDesdeDevolucion} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.notasCredito.historial.mockResolvedValue(makeResult())
})

describe('HistorialNotasCreditoPanel — REQ-492', () => {
  it('muestra notas reales y filas de la cola de Bodega mezcladas', async () => {
    renderPanel()
    expect(await screen.findByRole('cell', { name: 'Grupo Sensei' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Torres Pacífico SA' })).toBeInTheDocument()
    expect(screen.getByText('F-0001')).toBeInTheDocument()
    expect(screen.getByText('HS-3402')).toBeInTheDocument()
  })

  it('clic en una nota real llama a onSelectNota con su id', async () => {
    const onSelectNota = vi.fn()
    renderPanel(onSelectNota)
    fireEvent.click(await screen.findByRole('cell', { name: 'Grupo Sensei' }))
    expect(onSelectNota).toHaveBeenCalledWith(1)
  })

  it('clic en una fila de la cola llama a onGenerarDesdeDevolucion, no a onSelectNota', async () => {
    const onSelectNota = vi.fn()
    const onGenerarDesdeDevolucion = vi.fn()
    renderPanel(onSelectNota, onGenerarDesdeDevolucion)
    fireEvent.click(await screen.findByRole('cell', { name: 'Torres Pacífico SA' }))
    expect(onGenerarDesdeDevolucion).toHaveBeenCalledWith(FILA_COLA)
    expect(onSelectNota).not.toHaveBeenCalled()
  })

  it('filtro de búsqueda se envía al backend', async () => {
    renderPanel()
    await screen.findByRole('cell', { name: 'Grupo Sensei' })
    fireEvent.change(screen.getByPlaceholderText('notasCredito.historial.searchPlaceholder'), {
      target: { value: 'HS-3402' },
    })
    await waitFor(() => expect(mockedApi.notasCredito.historial).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'HS-3402' }),
    ))
  })

  it('sin resultados muestra el estado vacío', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeResult({ data: [] }))
    renderPanel()
    expect(await screen.findByText('notasCredito.historial.vacio')).toBeInTheDocument()
  })
})

// SCRUM-947 — el filtro "Cliente" mandaba el nombre al backend, que siempre espera
// master_client_id (int) — nunca filtró nada en la práctica. Corregido al mismo tiempo que se
// agregó paginación (mismo bloque de código).
describe('HistorialNotasCreditoPanel — SCRUM-947 filtro Cliente (bugfix) y paginación', () => {
  it('el select de Cliente ofrece los nombres pero envía el master_client_id', async () => {
    renderPanel()
    await screen.findByRole('cell', { name: 'Grupo Sensei' })

    const select = screen.getByText('notasCredito.historial.filtroCliente').closest('select')!
    expect(within(select).getByText('Grupo Sensei')).toBeInTheDocument()
    expect(within(select).getByText('Torres Pacífico SA')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: '2' } })

    await waitFor(() => expect(mockedApi.notasCredito.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ cliente: 2 }),
    ))
  })

  it('con más de una página, pide la siguiente', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(
      makeResult({ meta: { total: 45, per_page: 20, current_page: 1, last_page: 3 } }),
    )
    renderPanel()
    await screen.findByRole('cell', { name: 'Grupo Sensei' })

    fireEvent.click(screen.getByText('2'))

    await waitFor(() => expect(mockedApi.notasCredito.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, per_page: 20 }),
    ))
  })

  it('cambiar un filtro reinicia a la página 1', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(
      makeResult({ meta: { total: 45, per_page: 20, current_page: 2, last_page: 3 } }),
    )
    renderPanel()
    await screen.findByRole('cell', { name: 'Grupo Sensei' })
    fireEvent.click(screen.getByText('2'))
    await waitFor(() => expect(mockedApi.notasCredito.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))

    fireEvent.change(screen.getByPlaceholderText('notasCredito.historial.searchPlaceholder'), {
      target: { value: 'algo' },
    })

    await waitFor(() => expect(mockedApi.notasCredito.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'algo', page: 1 }),
    ))
  })
})
