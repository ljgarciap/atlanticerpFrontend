import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import NewPurchaseOrderPage, { type NewOrderPrefillState } from './NewPurchaseOrderPage'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'

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
    products: { search: vi.fn(), searchPage: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

// SCRUM-1163 — simula la paginación REAL del servidor (`GET /compras/products?page=`): corta por página, excluye los ya agregados y devuelve el total.
function serveProducts(all: unknown[]) {
  mockedComprasApi.products.searchPage.mockImplementation(async ({ page, perPage, excludeIds, search }) => {
    const term = search.toLowerCase()
    const visibles = (all as Array<{ id: number; reference: string; description: string }>)
      .filter(p => !excludeIds.includes(p.id))
      .filter(p => term === '' || p.reference.toLowerCase().includes(term) || p.description.toLowerCase().includes(term))
    const lastPage = Math.max(1, Math.ceil(visibles.length / perPage))
    return {
      fuzzy: false,
      data: visibles.slice((page - 1) * perPage, page * perPage) as never,
      meta: { total: visibles.length, per_page: perPage, current_page: page, last_page: lastPage },
    }
  })
}

const PROVIDER = { id: 1, name: 'Proveedor Demo A', tax_id: null, category: null, origin: 'internacional' as const, currency: 'USD', is_active: true, contact_name: null, rating: null, last_purchase_at: null }
const PRODUCT = { id: 10, reference: 'REF-1', factory_reference: null, name: 'Artículo E27', description: 'Artículo E27', brand: null, photo_url: null, price_full: 20, cost: 12, stock_quantity: 5, reorder_point: null }

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
  window.sessionStorage.clear()
  useAuthStore.setState({ user: null })
  mockedComprasApi.providers.list.mockResolvedValue({
    fuzzy: false, kpis: { total_providers: 1, average_rating: null, low_rating_count: 0, active_categories: 0, categories: [] },
    data: [PROVIDER], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
  })
  serveProducts([PRODUCT])
  mockedComprasApi.approvedProjects.search.mockResolvedValue({ data: [] })
})

describe('NewPurchaseOrderPage', () => {
  it('el paso Productos permanece oculto hasta elegir un proveedor', async () => {
    // REQ-128 Escenario 1.
    renderPage()
    fireEvent.focus(screen.getByPlaceholderText('compras:newOrder.provider.searchPlaceholder'))
    await waitFor(() => expect(screen.getByText('Proveedor Demo A')).toBeInTheDocument())
    expect(screen.queryByText('compras:newOrder.steps.products')).not.toBeInTheDocument()
  })

  it('el listado de proveedores no se muestra hasta enfocar el campo de búsqueda (SCRUM-729)', async () => {
    renderPage()
    // No debe estar permanentemente desplegado apenas hay resultados — solo al enfocar.
    await waitFor(() => expect(mockedComprasApi.providers.list).toHaveBeenCalled())
    expect(screen.queryByText('Proveedor Demo A')).not.toBeInTheDocument()

    fireEvent.focus(screen.getByPlaceholderText('compras:newOrder.provider.searchPlaceholder'))
    await waitFor(() => expect(screen.getByText('Proveedor Demo A')).toBeInTheDocument())
  })

  it('elegir un proveedor revela el paso Productos', async () => {
    renderPage()
    await selectFirstProvider('Proveedor Demo A')

    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.products')).toBeInTheDocument())
  })

  it('agregar un producto existente crea una línea con el costo real del catálogo', async () => {
    // REQ-130 Escenario 2 (precarga) — el costo mostrado viene del catálogo, no se inventa.
    renderPage()
    await selectFirstProvider('Proveedor Demo A')
    await waitFor(() => expect(screen.getByText('Artículo E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument())
    // REQ-130 Escenario 2 (SCRUM-193) — el costo precargado es un input editable, no texto fijo;
    // subtotal (cantidad=1 × costo=12) sigue siendo texto.
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
    expect(screen.getByText('$12.00')).toBeInTheDocument()
  })

  // SCRUM-1162 — el listado de productos del proveedor se pagina (20 por defecto, 10/20/50) y lo ya agregado a la orden no se pierde al paginar.
  it('pagina los productos del proveedor: 20 por defecto, cambia a 10 y conserva lo agregado al cambiar de página (SCRUM-1162)', async () => {
    const productos = Array.from({ length: 45 }, (_, i) => ({ ...PRODUCT, id: 100 + i, reference: `REF-${i + 1}`, description: `Producto ${i + 1}`, name: `Producto ${i + 1}` }))
    serveProducts(productos)
    renderPage()
    await selectFirstProvider('Proveedor Demo A')

    await waitFor(() => expect(screen.getByText('Producto 1')).toBeInTheDocument())
    expect(screen.getAllByText('compras:newOrder.products.add')).toHaveLength(20)
    expect(screen.queryByText('Producto 21')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('20 pagination.perPage'), { target: { value: '10' } })
    await waitFor(() => expect(screen.getAllByText('compras:newOrder.products.add')).toHaveLength(10))

    // Página 2 → agrega "Producto 11" a la orden; seguir paginando no la pierde ni la vuelve a ofrecer.
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(await screen.findByText('Producto 11')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('compras:newOrder.products.add')[0])
    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Producto 11').length).toBe(1)) // solo en la línea de la orden, ya no en el listado de disponibles
  })

  // SCRUM-1163 — paginación REAL en servidor: un proveedor con más de 100 productos muestra su total real y todas las páginas se pueden recorrer (antes el tope de 100 dejaba el resto inalcanzable).
  it('un proveedor con más de 100 productos muestra el total real y permite llegar a la última página (SCRUM-1163)', async () => {
    const muchos = Array.from({ length: 130 }, (_, i) => ({ ...PRODUCT, id: 500 + i, reference: `TOPE-${i}`, description: `Tope ${i}`, name: `Tope ${i}` }))
    serveProducts(muchos)
    renderPage()
    await selectFirstProvider('Proveedor Demo A')

    await screen.findByText('Tope 0')
    expect(screen.queryByTestId('product-search-capped-hint')).not.toBeInTheDocument()
    // 130 productos a 20 por página => 7 páginas; la última (7) trae los 10 restantes, incluido el que antes no se veía (el 130º).
    fireEvent.click(await screen.findByRole('button', { name: '7' }))
    expect(await screen.findByText('Tope 129')).toBeInTheDocument()
    expect(screen.getAllByText('compras:newOrder.products.add')).toHaveLength(10)
  })

  // SCRUM-1172 — tres motivos distintos para no ver filas, cada uno con su mensaje.
  it('distingue «proveedor sin productos», «búsqueda sin resultados» y «ya agregaste todos» (SCRUM-1172)', async () => {
    serveProducts([])
    const { unmount } = renderPage()
    await selectFirstProvider('Proveedor Demo A')
    expect(await screen.findByTestId('product-picker-empty-noProducts')).toHaveTextContent('compras:newOrder.products.empty')
    unmount()

    serveProducts([{ ...PRODUCT, id: 700, reference: 'UNICO-1', description: 'Producto unico', name: 'Producto unico' }])
    renderPage()
    await selectFirstProvider('Proveedor Demo A')
    await screen.findByText('Producto unico')

    fireEvent.change(screen.getByPlaceholderText('compras:newOrder.products.searchPlaceholder'), { target: { value: 'zzzz-no-existe' } })
    expect(await screen.findByTestId('product-picker-empty-search')).toHaveTextContent('compras:newOrder.products.noResults')

    fireEvent.change(screen.getByPlaceholderText('compras:newOrder.products.searchPlaceholder'), { target: { value: '' } })
    fireEvent.click(await screen.findByText('compras:newOrder.products.add'))
    expect(await screen.findByTestId('product-picker-empty-allAdded')).toHaveTextContent('compras:newOrder.products.allAdded')
  })

  // SCRUM-1172 — recargar la página (desmontar y volver a montar) no pierde la orden en curso.
  it('conserva el proveedor y las líneas al recargar y se limpia al crear la orden (SCRUM-1172)', async () => {
    useAuthStore.setState({ user: { id: 7 } as never })
    const { unmount } = renderPage()
    await selectFirstProvider('Proveedor Demo A')
    await waitFor(() => expect(screen.getByText('Artículo E27')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))
    await waitFor(() => expect(screen.getByText('compras:newOrder.actions.submit')).toBeInTheDocument())
    unmount()

    renderPage()   // «recarga»: no se vuelve a elegir proveedor ni producto
    expect(await screen.findByText('compras:newOrder.actions.submit')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).not.toBeInTheDocument()
  })

  it('el borrador es por usuario: otra persona en el mismo navegador no lo ve (SCRUM-1172)', async () => {
    useAuthStore.setState({ user: { id: 7 } as never })
    const { unmount } = renderPage()
    await selectFirstProvider('Proveedor Demo A')
    await waitFor(() => expect(screen.getByText('Artículo E27')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:newOrder.products.add'))
    await waitFor(() => expect(screen.getByText('compras:newOrder.actions.submit')).toBeInTheDocument())
    unmount()

    useAuthStore.setState({ user: { id: 8 } as never })
    renderPage()
    expect(await screen.findByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).toBeInTheDocument()
    expect(screen.queryByText('compras:newOrder.actions.submit')).not.toBeInTheDocument()
  })

  it('un borrador corrupto en el almacenamiento se ignora sin romper la pantalla (SCRUM-1172)', async () => {
    useAuthStore.setState({ user: { id: 7 } as never })
    window.sessionStorage.setItem('atlanticerp:draft:compras-nueva-orden:7', '{no es json')
    renderPage()
    expect(await screen.findByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).toBeInTheDocument()
    window.sessionStorage.setItem('atlanticerp:draft:compras-nueva-orden:7', JSON.stringify({ providerId: 'x', draft: 3 }))
    renderPage()
    expect((await screen.findAllByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).length).toBeGreaterThan(0)
  })

  // Pre-QA SCRUM-1172 — forma válida pero contenido malformado (una línea null) dejaba la pantalla en blanco hasta cerrar la pestaña.
  it.each([
    [{ providerId: 1, providerName: 'Proveedor Demo A', draft: { lines: [null] } }],
    [{ providerId: 1, providerName: 'Proveedor Demo A', draft: { lines: [{}], shippingType: 'terrestre', whoPaysShipping: 'cliente', modality: 'directo' } }],
  ])('un borrador con líneas malformadas se ignora y la pantalla carga (SCRUM-1172) %#', async (saved) => {
    useAuthStore.setState({ user: { id: 7 } as never })
    window.sessionStorage.setItem('atlanticerp:draft:compras-nueva-orden:7', JSON.stringify(saved))
    renderPage()
    expect(await screen.findByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).toBeInTheDocument()
  })

  // SCRUM-956 — subtotal/total de la línea deben llevar separador de miles, no solo decimales.
  it('formatea subtotal y total de la orden con separador de miles', async () => {
    serveProducts([{ ...PRODUCT, id: 11, reference: 'REF-2', cost: 12345.50 }])
    renderPage()
    await selectFirstProvider('Proveedor Demo A')
    await waitFor(() => expect(screen.getByText('Artículo E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:newOrder.products.add'))

    await waitFor(() => expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument())
    expect(screen.getByText('$12,345.50')).toBeInTheDocument() // subtotal (cantidad=1 x costo=12345.50)
    expect(screen.getByText((_, el) => el?.textContent === 'compras:newOrder.lines.total: $12,345.50')).toBeInTheDocument()
  })

  it('crear la orden envía provider_id y las líneas al backend', async () => {
    mockedComprasApi.orders.create.mockResolvedValue({
      id: 99, provider_id: 1, provider_name: 'Proveedor Demo A', provider_origin: null, origin_module: null, created_by_name: 'Designer',
      status: 'por_aprobar',
      next_status: 'ordenado', is_critical: false, modality: 'directo', estimated_arrival_date: null,
      requires_primary_approval: false, blocked_by_primary_approval: false, approved_by: null,
      approved_by_name: null,
      total_amount: 12, import_cost: null, freight_cost: null, handling_cost: null, other_cost: null, additional_costs_total: 0, payable_total: 12, currency: 'USD',
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
    await selectFirstProvider('Proveedor Demo A')
    await waitFor(() => expect(screen.getByText('Artículo E27')).toBeInTheDocument())
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
      bank_swift: null, bank_beneficiary: null, bank_image: null,
    });
    renderPage({
      providerId: 1,
      product: { id: 10, reference: 'REF-1', description: 'Artículo E27', unitCost: 12, quantity: 3 },
    })

    // El Paso 1 ya llega "cerrado" — nunca se muestra el buscador de proveedor.
    await waitFor(() => expect(screen.getByText('Proveedor Demo A')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('compras:newOrder.provider.searchPlaceholder')).not.toBeInTheDocument()

    // La línea prefilled ya está en la tabla, con la cantidad sugerida por Inventario.
    // ("Artículo E27" aparece 2 veces: el resultado del buscador de productos y la línea ya
    // agregada — se identifica la línea por su input de cantidad, único en toda la página).
    expect(screen.getByText('compras:newOrder.steps.lines')).toBeInTheDocument()
    expect(screen.getAllByText('Artículo E27').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
  })

  it('prefill de Pendientes de reposición (SCRUM-1184) precarga varias líneas del mismo proveedor con su cantidad', async () => {
    mockedComprasApi.providers.get.mockResolvedValue({
      ...PROVIDER, contact_name: null, whatsapp: null, phone: null, email: null,
      address: null, country: null, bank_name: null, bank_account_number: null,
      bank_swift: null, bank_beneficiary: null, bank_image: null,
    });
    renderPage({
      providerId: 1,
      products: [
        { id: 10, reference: 'REF-1', description: 'Artículo E27', unitCost: 12, quantity: 7 },
        { id: 11, reference: 'REF-2', description: 'Panel XL 60x60', unitCost: 30, quantity: 4 },
      ],
    })

    await waitFor(() => expect(screen.getByText('Proveedor Demo A')).toBeInTheDocument())
    expect(screen.getAllByText('Artículo E27').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Panel XL 60x60').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()
  })
})
