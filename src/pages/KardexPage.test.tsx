import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import KardexPage from './KardexPage'
import { bodegaApi } from '@/api/bodegaApi'
import type { KardexListResponse, PhysicalWarehouse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: { warehouses: { list: vi.fn(), show: vi.fn() }, kardex: { list: vi.fn() } },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <KardexPage />
    </QueryClientProvider>,
  )
}

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta' },
]

const EMPTY_RESPONSE: KardexListResponse = {
  data: [],
  meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
})

describe('KardexPage', () => {
  it('muestra el mensaje de vacío cuando no hay movimientos', async () => {
    mockedApi.kardex.list.mockResolvedValue(EMPTY_RESPONSE)
    renderPage()
    expect(await screen.findByText('bodega:kardex.empty')).toBeInTheDocument()
  })

  it('muestra la cantidad con signo + para entradas y sin signo extra para salidas', async () => {
    mockedApi.kardex.list.mockResolvedValue({
      data: [
        {
          id: 1, fecha: '2026-07-21T10:00:00Z',
          producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
          bodega: 'Bodega Central', tipo: 'Entrada', cantidad: 20,
          referencia: 'Orden #5 recibida', realizado_por: 'Sistema',
          saldo_inicial: 0, saldo_resultante: 20,
        },
        {
          id: 2, fecha: '2026-07-21T11:00:00Z',
          producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
          bodega: 'Bodega Central', tipo: 'Salida', cantidad: -8,
          referencia: 'Pedido #12 despachado', realizado_por: 'Jorge P.',
          saldo_inicial: 20, saldo_resultante: 12,
        },
      ],
      meta: { total: 2, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    expect(await screen.findByText('+20')).toBeInTheDocument()
    expect(await screen.findByText('-8')).toBeInTheDocument()
    expect(screen.getByText('Orden #5 recibida')).toBeInTheDocument()
    expect(screen.getByText('Pedido #12 despachado')).toBeInTheDocument()
  })

  it('combina buscador, tipo y bodega en la misma consulta (REQ-398 RN1)', async () => {
    mockedApi.kardex.list.mockResolvedValue(EMPTY_RESPONSE)
    renderPage()
    await waitFor(() => expect(mockedApi.kardex.list).toHaveBeenCalled())

    const searchBox = await screen.findByPlaceholderText('bodega:kardex.filters.search')
    fireEvent.change(searchBox, { target: { value: 'CRISTAL' } })
    fireEvent.keyDown(searchBox, { key: 'Enter' })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'Devolución' } })
    fireEvent.change(selects[1], { target: { value: '1' } })

    await waitFor(() => expect(mockedApi.kardex.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'CRISTAL', tipo: 'Devolución', warehouse_id: 1 }),
    ))
  })
})
