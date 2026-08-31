import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import NewPurchaseOrderPage, { type NewOrderPrefillState } from './NewPurchaseOrderPage'
import { comprasApi } from '@/api/comprasApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (typeof opts === 'object' && opts) {
        if ('id' in opts) return `${key} ${(opts as { id: number }).id}`
        if ('amount' in opts) return `${key} ${(opts as { amount: string }).amount}`
      }
      return key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
    orders: { list: vi.fn(), get: vi.fn(), create: vi.fn(), approve: vi.fn() },
    approvedProjects: { search: vi.fn() },
    products: { search: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

const PROVIDER = { id: 1, name: 'LightCorp', category: null, origin: 'internacional' as const, currency: 'USD', is_active: true, contact_name: null, rating: null, last_purchase_at: null }
const PRODUCT = { id: 10, reference: 'REF-1', factory_reference: null, name: 'Bombillo E27', description: 'Bombillo E27', brand: null, photo_url: null, price_full: 20, cost: 12, stock_quantity: 5, reorder_point: null }

function renderPage(prefill?: NewOrderPrefillState) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const initialEntries = prefill
    ? [{ pathname: '/compras/ordenes/nueva', state: prefill }]
    : ['/compras/ordenes/nueva']
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <NewPurchaseOrderPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// SCRUM-729 — el listado de proveedores ahora solo se despliega con el campo enfocado
// (antes quedaba permanentemente visible apenas había resultados), y la opción se
// selecciona con onMouseDown (dispara antes que el onBlur del input, evitando que el
// listado se cierre justo antes del click) en vez de onClick.
function selectFirstProvider(name: string) {
  fireEvent.focus(screen.getByPlaceholderText('compras:newOrder.provider.searchPlaceholder'))
  return waitFor(() => expect(screen.getByText(name)).toBeInTheDocument())
    .then(() => fireEvent.mouseDown(screen.getByText(name)))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.providers.list.mockResolvedValue({
    fuzzy: false, kpis: { total_providers: 1, average_rating: null, low_rating_count: 0, active_categories: 0, categories: [] },
    data: [PROVIDER], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
  })
  mockedComprasApi.products.search.mockResolvedValue({ fuzzy: false, data: [PRODUCT] })
  mockedComprasApi.approvedProjects.search.mockResolvedValue({ data: [] })
})

describe('NewPurchaseOrderPage', () => {
  it('el paso Productos permanece oculto hasta elegir un proveedor', async () => {
    // REQ-128 Escenario 1.
    renderPage()
    fireEvent.focus(screen.getByPlaceholderText('compras:newOrder.provider.searchPlaceholder'))
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:newOrder.steps.products')).not.toBeInTheDocument()
  })

  it('el listado de proveedores no se muestra hasta enfocar el campo de búsqueda (SCRUM-729)', async () => {
    renderPage()
    // No debe estar permanentemente desplegado apenas hay resultados — solo al enfocar.
    await waitFor(() => expect(mockedComprasApi.providers.list).toHaveBeenCalled())
    expect(screen.queryByText('LightCorp')).not.toBeInTheDocument()

    fireEvent.focus(screen.getByPlaceholderText('compras:newOrder.provider.searchPlaceholder'))
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
  })

  it('elegir un proveedor revela el paso Productos', async () => {
    renderPage()
    await selectFirstProvider('LightCorp')

    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.products')).toBeInTheDocument())
  })

  it('agregar un producto existente crea una línea con el costo real del catálogo', async () => {
    // REQ-130 Escenario 2 (precarga) — el costo mostrado viene del catálogo, no se inventa.
    renderPage()
    await selectFirstProvider('LightCorp')
    await waitFor(() => expect(screen.getByText('Bombillo E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument())
    // REQ-130 Escenario 2 (SCRUM-193) — el costo precargado es un input editable, no texto fijo;
    // subtotal (cantidad=1 × costo=12) sigue siendo texto.
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
    expect(screen.getByText('$12.00')).toBeInTheDocument()
  })

  it('crear la orden envía provider_id y las líneas al backend', async () => {
    mockedComprasApi.orders.create.mockResolvedValue({
      id: 99, provider_id: 1, provider_name: 'LightCorp', provider_origin: null, origin_module: null, created_by_name: 'Designer',
      status: 'por_aprobar',
      next_status: 'ordenado', is_critical: false, modality: 'directo', estimated_arrival_date: null,
      requires_primary_approval: false, blocked_by_primary_approval: false, approved_by: null,
      approved_by_name: null,
      total_amount: 12, currency: 'USD',
      sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
      created_at: '2026-07-14T00:00:00Z',
      status_changed_at: '2026-07-14T00:00:00Z', shipping_type: null, who_pays_shipping: null,
      shipping_cost: null,
      liquidation_agency_id: null, liquidation_agency_name: null,
      // REQ-154 (SCRUM-217) — timeline de Logística.
      ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
      actual_arrival_date: null, container_number: null, carrier: null,
      approved_at: null, pending_amount_change: null, amount_change_requested_by: null,
      payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null, last_payment_date: null,
      reception_status: 'pendiente', shows_goods_receipt_link: false, pending_remainder_status: null,
      notes: null, lines: [],
    })
    renderPage()
    await selectFirstProvider('LightCorp')
    await waitFor(() => expect(screen.getByText('Bombillo E27')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))
    await waitFor(() => expect(screen.getByText('compras:newOrder.actions.submit')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:newOrder.actions.submit'))

    await waitFor(() => expect(mockedComprasApi.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_id: 1,
        lines: [expect.objectContaining({ catalog_product_id: 10, quantity: 1 })],
      }),
    ))
    await waitFor(() => expect(screen.getByText('compras:newOrder.success.title')).toBeInTheDocument())
  })

  it('prefill de Inventario (SCRUM-242) precarga proveedor y una línea del producto sin pasar por el buscador', async () => {
    mockedComprasApi.providers.get.mockResolvedValue({
      ...PROVIDER, contact_name: null, whatsapp: null, phone: null, email: null,
      address: null, country: null, bank_name: null, bank_account_number: null,
      bank_swift: null, bank_beneficiary: null,
    });
    renderPage({
      providerId: 1,
      product: { id: 10, reference: 'REF-1', description: 'Bombillo E27', unitCost: 12, quantity: 3 },
    })

    // El Paso 1 ya llega "cerrado" — nunca se muestra el buscador de proveedor.
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).not.toBeInTheDocument()

    // La línea prefilled ya está en la tabla, con la cantidad sugerida por Inventario.
    // ("Bombillo E27" aparece 2 veces: el resultado del buscador de productos y la línea ya
    // agregada — se identifica la línea por su input de cantidad, único en toda la página).
    expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument()
    expect(screen.getAllByText('Bombillo E27').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
  })
})
