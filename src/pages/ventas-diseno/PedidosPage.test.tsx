import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoPedidosPage from './PedidosPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { OrderListResult, OrderRow, OrderDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    orders: { list: vi.fn(), get: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, folio: 'COT-1006',
    master_client: { id: 1, name: 'Familia Torres' },
    sales_project: { id: 1, name: 'Residencia Albrook 14B' },
    amount: 22000, approved_at: '2026-02-10T00:00:00Z',
    quoted_margin: 40, invoiced_margin: 40, invoiced_partial: false, estado: 'igual',
    owner: { id: 1, name: 'Carlos Ruiz' },
    ...overrides,
  }
}

function makeResult(overrides: Partial<OrderListResult> = {}): OrderListResult {
  return {
    summary: { total_orders: 0, with_margin_variance: 0, avg_quoted_margin: null, avg_invoiced_margin: null, fully_invoiced_count: 0 },
    fuzzy: false, data: [],
    meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoPedidosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.orders.list.mockResolvedValue(makeResult())
})

describe('VentasDisenoPedidosPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:orders.title')).toBeInTheDocument()
  })

  it('muestra las tarjetas KPI', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({
      summary: { total_orders: 10, with_margin_variance: 3, avg_quoted_margin: 41.2, avg_invoiced_margin: 38.5, fully_invoiced_count: 3 },
    }))
    renderPage()

    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('41.2%')).toBeInTheDocument()
    expect(screen.getByText('38.5%')).toBeInTheDocument()
  })

  it('margen facturado promedio sin datos muestra —', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({
      summary: { total_orders: 5, with_margin_variance: 0, avg_quoted_margin: 40, avg_invoiced_margin: null, fully_invoiced_count: 0 },
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:orders.summary.invoicedAvgEmpty')).toBeInTheDocument()
  })

  it('muestra las filas de la tabla con folio, cliente y estado', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({ data: [makeRow()] }))
    renderPage()

    expect(await screen.findByText('COT-1006')).toBeInTheDocument()
    expect(screen.getByText('Familia Torres')).toBeInTheDocument()
    // El texto del estado aparece 2 veces (badge de la fila + <option> del filtro).
    expect(screen.getAllByText('ventasDiseno:orders.status.igual').length).toBeGreaterThanOrEqual(2)
  })

  it('pedido pendiente de compra muestra — en margen facturado', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({
      data: [makeRow({ estado: 'pendiente', invoiced_margin: null, invoiced_partial: true })],
    }))
    renderPage()

    await screen.findByText('COT-1006')
    expect(screen.getByText('ventasDiseno:orders.table.pendingValue')).toBeInTheDocument()
  })

  it('pedido con margen facturado parcial muestra el sufijo "(parcial)"', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({
      data: [makeRow({ estado: 'bajo', invoiced_margin: 33, invoiced_partial: true })],
    }))
    renderPage()

    expect(await screen.findByText(/33\.0%.*ventasDiseno:orders\.table\.partialSuffix/)).toBeInTheDocument()
  })

  it('sin pedidos muestra el mensaje vacío', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:orders.table.empty')).toBeInTheDocument()
  })

  it('escribir en la búsqueda vuelve a pedir la lista', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:orders.table.empty')

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:orders.filters.searchPlaceholder'), { target: { value: 'Torres' } })

    await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Torres' }),
    ))
  })

  it('filtrar por Estado vuelve a pedir la lista', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:orders.table.empty')

    fireEvent.change(screen.getByDisplayValue('ventasDiseno:orders.filters.allStatuses'), { target: { value: 'bajo' } })

    await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'bajo' }),
    ))
  })

  it('Borrar filtros resetea búsqueda y estado', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:orders.table.empty')

    const searchInput = screen.getByPlaceholderText('ventasDiseno:orders.filters.searchPlaceholder') as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'Torres' } })
    await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Torres' })))

    fireEvent.click(screen.getByText('ventasDiseno:orders.filters.clear'))

    expect(searchInput.value).toBe('')
    await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ search: expect.anything() }),
    ))
  })

  it('muestra el aviso de resultados aproximados', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({ fuzzy: true, data: [makeRow()] }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:orders.filters.approximate')).toBeInTheDocument()
  })

  it('clic en Ver detalle abre el modal de detalle', async () => {
    mockedApi.orders.list.mockResolvedValue(makeResult({ data: [makeRow()] }))
    mockedApi.orders.get.mockResolvedValue({} as unknown as OrderDetail) // loading state basta para esta prueba
    renderPage()

    await screen.findByText('COT-1006')
    fireEvent.click(screen.getByText('ventasDiseno:orders.table.viewDetail'))

    expect(await screen.findByText('ventasDiseno:orders.detail.title')).toBeInTheDocument()
    expect(mockedApi.orders.get).toHaveBeenCalledWith(1)
  })
})
