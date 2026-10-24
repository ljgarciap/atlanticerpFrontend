import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoPedidosPage from './PedidosPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
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
    // SCRUM-854 — mismo endpoint que Pipeline/Cotizaciones/Reportes usan para poblar el
    // UserMultiSelect de Vendedor/Diseñador.
    home: { vendors: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, folio: 'COT-1006',
    master_client: { id: 1, name: 'Familia Torres' },
    sales_project: { id: 1, name: 'Residencia Albrook 14B' },
    amount: 22000, approved_at: '2026-02-10T00:00:00Z',
    quoted_margin: 40, invoiced_margin: 40, invoiced_partial: false, estado: 'igual',
    owner: { id: 1, name: 'Tecnico Servicios Ruiz' },
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

// SCRUM-854 — mockImplementation con selector (no mockReturnValue) porque `usePermission`
// (ya usado acá para canConfigureThreshold) llama a useAuthStore con un selector propio, no
// destructura {user} directo — mismo patrón que ReportsPage.test.tsx.
function mockAuthState(user: Record<string, unknown> | null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user }
    return selector ? selector(state) : state
  }) as never)
}

function renderPage(entry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoPedidosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.orders.list.mockResolvedValue(makeResult())
  mockedApi.home.vendors.mockResolvedValue([])
  mockAuthState({ id: 1, role: 'designer', permissions: [] })
})

describe('VentasDisenoPedidosPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:orders.title')).toBeInTheDocument()
  })

  // SCRUM-1119 — Compras ve Pedidos sin ventas_diseno.read: Catálogo y Cotizaciones llevarían a una redirección.
  it('sin ventas_diseno.read (Compras) no muestra los botones Catálogo ni Ver cotizaciones', async () => {
    mockAuthState({ id: 2, role: 'lider_compras', permissions: [] })
    renderPage()
    await screen.findByText('ventasDiseno:orders.title')
    expect(screen.queryByText('ventasDiseno:orders.actions.catalog')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:orders.actions.viewQuotes')).not.toBeInTheDocument()
  })

  // SCRUM-1184 — «Pendientes de reposición» (Compras) enlaza a un pedido con ?search=<N° de pedido>.
  it('SCRUM-1184: abre con el N° de pedido de la URL ya buscado', async () => {
    mockAuthState({ id: 2, role: 'lider_compras', permissions: [] })
    renderPage('/ventas-diseno/pedidos?search=PED-2026-0042')
    await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'PED-2026-0042' })))
  })

  it('con ventas_diseno.read (Gerencia) muestra los botones Catálogo y Ver cotizaciones', async () => {
    mockAuthState({ id: 9, role: 'management', permissions: ['ventas_diseno.read'] })
    renderPage()
    expect(await screen.findByText('ventasDiseno:orders.actions.catalog')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:orders.actions.viewQuotes')).toBeInTheDocument()
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

  // SCRUM-854 (rebote de QA, 2026-09-09) — esta pantalla era la única de las 6 ubicaciones del
  // ticket sin el filtro Vendedor/Diseñador.
  describe('filtro Vendedor/Diseñador (SCRUM-854)', () => {
    it('no se muestra para un vendedor (solo ve lo propio, sin utilidad para él)', async () => {
      renderPage()
      await screen.findByText('ventasDiseno:orders.table.empty')

      expect(screen.queryByRole('button', { name: /userFilter/ })).not.toBeInTheDocument()
      expect(mockedApi.home.vendors).not.toHaveBeenCalled()
    })

    it('gerencia puede filtrar pedidos por vendedores seleccionados', async () => {
      mockAuthState({ id: 9, role: 'management', permissions: [] })
      mockedApi.home.vendors.mockResolvedValue([
        { id: 5, name: 'Vendedor Disenador Test 2' }, { id: 6, name: 'Vendedor Disenador Test 3' },
      ])
      renderPage()
      await screen.findByText('ventasDiseno:orders.table.empty')

      fireEvent.click(await screen.findByRole('button', { name: /userFilter/ }))
      fireEvent.click(await screen.findByText('Vendedor Disenador Test 2'))

      await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(
        expect.objectContaining({ owner_ids: [5] }),
      ))
    })

    it('Borrar filtros también limpia la selección de vendedores', async () => {
      mockAuthState({ id: 9, role: 'management', permissions: [] })
      mockedApi.home.vendors.mockResolvedValue([{ id: 5, name: 'Vendedor Disenador Test 2' }])
      renderPage()
      await screen.findByText('ventasDiseno:orders.table.empty')

      fireEvent.click(await screen.findByRole('button', { name: /userFilter/ }))
      fireEvent.click(await screen.findByText('Vendedor Disenador Test 2'))
      await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(expect.objectContaining({ owner_ids: [5] })))

      fireEvent.click(screen.getByText('ventasDiseno:orders.filters.clear'))

      await waitFor(() => expect(mockedApi.orders.list).toHaveBeenCalledWith(
        expect.not.objectContaining({ owner_ids: expect.anything() }),
      ))
    })
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
