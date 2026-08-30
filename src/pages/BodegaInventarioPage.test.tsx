import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaInventarioPage from './BodegaInventarioPage'
import { bodegaApi } from '@/api/bodegaApi'
import type {
  BodegaInventoryListResponse, BodegaInventoryRow, PhysicalWarehouse, ProductWarehouseStockResponse,
} from '@/types/bodega'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (typeof opts === 'object' && opts) {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')
        return `${key} ${parts}`
      }
      return key
    },
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    warehouses: { list: vi.fn(), show: vi.fn() },
    adjustmentRequests: {
      list: vi.fn(), searchProducts: vi.fn(), create: vi.fn(), approve: vi.fn(), reject: vi.fn(),
      productWarehouseStock: vi.fn(),
    },
    inventory: {
      list: vi.fn(),
      get: vi.fn(),
      families: { get: vi.fn(), list: vi.fn() },
      porServir: vi.fn(),
      enCamino: vi.fn(),
      confirmArrival: vi.fn(),
    },
  },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    catalogProductFamilies: { list: vi.fn(), get: vi.fn() },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Atlantic', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta' },
  { id: 2, name: 'Mermas', responsable: null, capacidad_pct: 10, modo_detalle: 'ubicacion_exacta' },
]

function makeRow(overrides: Partial<BodegaInventoryRow> = {}): BodegaInventoryRow {
  return {
    id: 1, photo_url: null, factory_reference: 'CAND-1', reference: 'REF-1', name: 'Candelabro Cristal',
    description: 'Candelabro de cristal, 5 brazos', barcode: '7501234567890', category: 'Iluminación de techo',
    brand: 'LightCorp', family_id: 1, family_name: 'Candelabros', rotation: 'alta', warehouse_count: 2,
    disponible: 12, por_servir: 3, stock_total: 15, por_ingresar: 0, en_camino: 0,
    reorder_point: 10, estado: 'disponible', provider_id: 1, provider_name: 'LightCorp', is_active: true,
    arrival_confirmation: { pending_bodega_action: false, awaiting_compras: false, confirmed_quantity: 0, confirmed_by_name: null },
    ...overrides,
  }
}

function listResponse(overrides: Partial<BodegaInventoryListResponse> = {}): BodegaInventoryListResponse {
  return {
    fuzzy: false,
    kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_por_servir: 3 },
    data: [makeRow()],
    meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    providers: [{ id: 1, name: 'LightCorp' }],
    brands: ['LightCorp'],
    ...overrides,
  }
}

function renderPage(initialEntries: string[] = ['/bodega/inventario']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <BodegaInventarioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
  // Fix Pre-QA 2026-07-23 — la pestana Familias/filtro Categoria de Bodega usan el endpoint
  // real `bodega.read` (`bodegaApi.inventory.families.list`), no `ventasDisenoApi` (requiere
  // `ventas_diseno.read`, que ningun rol de Bodega tiene -- ver docs/pre-qa/bloque-b2-ver-inventario-20260723.md).
  mockedApi.inventory.families.list.mockResolvedValue({ data: [{ id: 1, name: 'Candelabros', description: null, product_count: 4 }] })
  mockedApi.inventory.list.mockResolvedValue(listResponse())
})

describe('BodegaInventarioPage — Productos (SCRUM-414→432)', () => {
  it('renderiza encabezado, KPIs y la fila del producto', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    expect(screen.getByText('bodega:inventory.title')).toBeInTheDocument()
    expect(screen.getByText('Candelabro de cristal, 5 brazos')).toBeInTheDocument()
    // KPI "Total por servir" viene del backend, no del `por_servir` de Ventas & Diseño — hay 2
    // nodos con "3" (el KPI y la celda "Por servir" de la fila), ambos correctos.
    expect(screen.getAllByText('3')).toHaveLength(2)
  })

  it('SCRUM-415 (REQ-345) — "Ir a ver Órdenes" navega al listado de Órdenes Zona Libre, no a Pedidos', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:inventory.actions.goToOrders'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre')
  })

  it('SCRUM-433 (REQ-345, rebote 2026-08-13) — "+ Nueva orden de compra" navega DIRECTO al formulario, sin pasar por la bandeja', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:inventory.actions.newPurchaseOrder'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre/nueva')
  })

  it('combina buscador + categoría + estado + rotación + bodega + marca en una sola query', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.inventory.list).toHaveBeenCalled())

    // Nombres de parámetro verificados contra `BodegaInventoryController::index()` real
    // (reconciliación de contrato 2026-07-23): `family_id`/`rotation`/`brand`. `provider_id`
    // (fix SCRUM-419/422 2026-07-28) viaja con el id que trae la faceta `providers`, no el nombre.
    fireEvent.change(screen.getByPlaceholderText('bodega:inventory.filters.searchPlaceholder'), { target: { value: 'candelabro' } })
    fireEvent.click(screen.getByText('common:actions.search'))
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ search: 'candelabro' }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.category'), { target: { value: '1' } })
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ family_id: 1 }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.status'), { target: { value: 'bajo_stock' } })
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ estado: 'bajo_stock' }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.rotation'), { target: { value: 'media' } })
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ rotation: 'media' }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.warehouse'), { target: { value: '2' } })
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ warehouse_id: 2 }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.provider'), { target: { value: '1' } })
    await waitFor(() => expect(mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]).toMatchObject({ provider_id: 1 }))

    fireEvent.change(screen.getByDisplayValue('bodega:inventory.filters.brand'), { target: { value: 'LightCorp' } })

    await waitFor(() => {
      const lastCall = mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]
      expect(lastCall).toMatchObject({
        search: 'candelabro', family_id: 1, estado: 'bajo_stock', rotation: 'media',
        warehouse_id: 2, provider_id: 1, brand: 'LightCorp',
      })
    })
  })

  it('el chip "Por ingresar" viaja como chip al backend', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.inventory.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('bodega:inventory.chips.por_ingresar'))

    await waitFor(() => {
      const lastCall = mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]
      expect(lastCall).toMatchObject({ chip: 'por_ingresar' })
    })
  })

  it('deep-link ?filter=rotacion (desde Home "Mayor rotación") llega ya filtrado', async () => {
    renderPage(['/bodega/inventario?filter=rotacion'])

    await waitFor(() => {
      const lastCall = mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]
      expect(lastCall).toMatchObject({ chip: 'rotacion' })
    })
  })

  it('deep-link ?filter=criticos (desde Home "Artículos críticos") llega ya filtrado', async () => {
    renderPage(['/bodega/inventario?filter=criticos'])

    await waitFor(() => {
      const lastCall = mockedApi.inventory.list.mock.calls[mockedApi.inventory.list.mock.calls.length - 1]?.[0]
      expect(lastCall).toMatchObject({ chip: 'criticos' })
    })
  })

  it('SCRUM-418 — toggle Productos/Familias muestra la pestaña de Familias como acordeón, sin botón de generar compra, con la misma tabla de 14 columnas que Productos', async () => {
    // SCRUM-418 (rebote de Daniela Amaya 2026-08-12) — el detalle de familia ahora es la MISMA
    // forma que BodegaInventoryRow (ver docblock de BodegaInventoryFamilyProductRow), no el shape
    // reducido de 4 campos de antes.
    mockedApi.inventory.families.get.mockResolvedValue({
      id: 1, name: 'Candelabros', description: null,
      products: [makeRow({ id: 1, reference: 'REF-1', description: 'Candelabro Cristal' })],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Candelabros')).toBeInTheDocument())
    // Etiqueta "[N] producto(s)" explícita (antes solo el número pelado) — mock de families.list
    // default trae product_count: 4 (ver beforeEach).
    expect(screen.getByText(/bodega:inventory\.families\.productsCount/)).toBeInTheDocument()

    // Acordeón: la lista de familias sigue visible tras expandir (no "navega" a otra pantalla).
    const familyToggle = screen.getByRole('button', { name: /Candelabros/ })
    fireEvent.click(familyToggle)
    await waitFor(() => expect(screen.getAllByText(/REF-1/).length).toBeGreaterThan(0))
    // "Candelabros" sigue visible en el botón de la familia Y ahora también como celda de la fila
    // (family_name real) — 2 coincidencias esperadas, no una sola.
    expect(screen.getAllByText('Candelabros').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/generatePurchase/i)).not.toBeInTheDocument()

    // Misma tabla de 14 columnas que "Productos" (headers reales, no la lista plana de antes).
    expect(screen.getByText('bodega:inventory.table.rotation')).toBeInTheDocument()
    expect(screen.getByText('bodega:inventory.table.status')).toBeInTheDocument()
    expect(screen.getByText('bodega:inventory.actions.requestAdjustment')).toBeInTheDocument()

    // Colapsar vuelve a ocultar el detalle sin perder la lista de familias.
    fireEvent.click(familyToggle)
    await waitFor(() => expect(screen.queryByText('bodega:inventory.table.rotation')).not.toBeInTheDocument())
    expect(screen.getByText('Candelabros')).toBeInTheDocument()
  })

  it('modal "Bodega(s)" reusa useProductWarehouseStock (bodega.read) para el desglose', async () => {
    const stock: ProductWarehouseStockResponse = {
      por_servir: 3,
      warehouses: [{ warehouse_id: 1, name: 'Atlantic', quantity: 9 }, { warehouse_id: 2, name: 'Mermas', quantity: 3 }],
    }
    mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue(stock)
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText(/warehousesCount/))

    const modalTitle = await screen.findByText(/warehouseModal\.title/)
    const modal = modalTitle.closest('[class*="rounded-2xl"]') as HTMLElement
    await waitFor(() => expect(within(modal).getByText('Atlantic')).toBeInTheDocument())
    expect(within(modal).getByText('9')).toBeInTheDocument()
    expect(mockedApi.adjustmentRequests.productWarehouseStock).toHaveBeenCalledWith(1)
  })

  it('SCRUM-422 re-check Pre-QA 2026-07-28 — modal "Bodega(s)" NO lista bodegas en 0, aunque el servicio compartido las devuelva todas', async () => {
    // `WarehouseStockService::breakdownForProducts()` (backend) siempre devuelve las 7 bodegas
    // del sistema con quantity=0 en las que no tienen stock (lo necesita SolicitudAjustePage para
    // poder elegir un destino en 0) — RN1 de SCRUM-422 exige que ESTE modal filtre esas bodegas
    // en 0 antes de renderizar, sin depender de que el backend las excluya.
    const stock: ProductWarehouseStockResponse = {
      por_servir: 3,
      warehouses: [
        { warehouse_id: 1, name: 'Bodega Central', quantity: 200 },
        { warehouse_id: 2, name: 'Showroom Obarrio', quantity: 100 },
        { warehouse_id: 3, name: 'Bodega Zona Libre', quantity: 0 },
        { warehouse_id: 4, name: 'Showroom SM', quantity: 0 },
        { warehouse_id: 5, name: 'Showroom Cliente', quantity: 0 },
        { warehouse_id: 6, name: 'Merma', quantity: 0 },
        { warehouse_id: 7, name: 'Reclamos y Devoluciones', quantity: 0 },
      ],
    }
    mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue(stock)
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText(/warehousesCount/))

    const modalTitle = await screen.findByText(/warehouseModal\.title/)
    const modal = modalTitle.closest('[class*="rounded-2xl"]') as HTMLElement
    await waitFor(() => expect(within(modal).getByText('Bodega Central')).toBeInTheDocument())
    expect(within(modal).getByText('Showroom Obarrio')).toBeInTheDocument()
    expect(within(modal).queryByText('Bodega Zona Libre')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Showroom SM')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Showroom Cliente')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Merma')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Reclamos y Devoluciones')).not.toBeInTheDocument()
  })

  it('modal "Por servir" muestra el mensaje explicativo cuando no hay datos', async () => {
    mockedApi.inventory.porServir.mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('3').find(el => el.tagName === 'BUTTON')!)

    await waitFor(() => expect(screen.getByText('bodega:inventory.porServirModal.empty')).toBeInTheDocument())
  })

  it('modal "Por servir" lista clientes/pedidos comprometidos cuando sí hay datos', async () => {
    mockedApi.inventory.porServir.mockResolvedValue({
      data: [{ order_id: 55, order_number: 'PED-055', customer_name: 'Cliente X', project_name: null, stage: 'asignado', quantity: 3 }],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('3').find(el => el.tagName === 'BUTTON')!)

    await waitFor(() => expect(screen.getByText(/PED-055/)).toBeInTheDocument())
  })

  it('modal "En camino" muestra el mensaje explicativo cuando no hay datos', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({ data: [makeRow({ en_camino: 5 })] }))
    mockedApi.inventory.enCamino.mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('5'))

    await waitFor(() => expect(screen.getByText('bodega:inventory.enCaminoModal.empty')).toBeInTheDocument())
  })

  it('modal "En camino" lista proveedor, orden y fecha real cuando sí hay datos', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({ data: [makeRow({ en_camino: 5 })] }))
    mockedApi.inventory.enCamino.mockResolvedValue({
      data: [{
        purchase_order_id: 10, quantity: 5, estimated_arrival_date: '2026-08-01', provider_name: 'LightCorp',
      }],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('5'))

    const modalTitle = await screen.findByText(/enCaminoModal\.title/)
    const modal = modalTitle.closest('[class*="rounded-2xl"]') as HTMLElement
    await waitFor(() => expect(within(modal).getByText('2026-08-01')).toBeInTheDocument())
    expect(within(modal).getByText('LightCorp')).toBeInTheDocument()
    // SCRUM-424 BUG 1 — el numero de orden de compra (purchase_order_id) ya viajaba en la
    // respuesta pero nunca se renderizaba, solo se usaba como React key.
    expect(within(modal).getByText(/enCaminoModal\.order/)).toBeInTheDocument()
  })

  it('SCRUM-424 BUG 3 — celda "En camino" es clickeable incluso en 0, igual que "Por servir"', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({ data: [makeRow({ en_camino: 0 })] }))
    mockedApi.inventory.enCamino.mockResolvedValue({ data: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('0').find(el => el.tagName === 'BUTTON')!)

    await waitFor(() => expect(screen.getByText('bodega:inventory.enCaminoModal.empty')).toBeInTheDocument())
  })

  it('botón "Solicitar ajuste" por fila abre el modal ya con el producto de esa fila, sin poder cambiarlo', async () => {
    mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue({ por_servir: 0, warehouses: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:inventory.actions.requestAdjustment'))

    // El modal reusado (`NewAdjustmentRequestModal`) salta directo al producto, sin buscador.
    await waitFor(() => expect(screen.queryByPlaceholderText('bodega:adjustments.newModal.searchProduct')).not.toBeInTheDocument())
    // SCRUM-428 (REQ-358) — "producto ya viene fijo segun la fila donde se hizo clic": a
    // diferencia de "+ Nueva solicitud" (REQ-376, producto libre), este entry point NO debe
    // ofrecer "Cambiar" de producto.
    expect(screen.queryByText('common:actions.change')).not.toBeInTheDocument()
  })
})

// Rebote REQ-361/SCRUM-431 (Daniela Amaya 2026-08-13) — reescritura del modal a 2 bloques exactos
// del mockup, con toda la fila clickeable (antes solo el nombre, sin señal visual).
describe('BodegaInventarioPage — Detalle de producto en 2 bloques (rebote SCRUM-431)', () => {
  it('Escenario 1 — toda la fila es clickeable, no solo la referencia/descripción', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    // Clic en una celda que antes NO tenía onClick propio (Stock mínimo, valor 10 — único en la página).
    fireEvent.click(screen.getByText('10'))
    expect(await screen.findByText('Candelabro Cristal')).toBeInTheDocument()
  })

  it('clickear un botón de acción dentro de la fila (Solicitar ajuste) NO abre también el detalle', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:inventory.actions.requestAdjustment'))
    await waitFor(() => expect(screen.getByText('bodega:adjustments.newModal.title')).toBeInTheDocument())
    // El modal de detalle (con el nombre del producto como encabezado) no debe estar presente.
    expect(screen.queryByText('bodega:inventory.detailModal.sectionInfo')).not.toBeInTheDocument()
  })

  it('Escenario 2/4 — encabezado con nombre+categoría y Bloque 2 "Información del producto" con los 3 campos que faltaban', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    const heading = await screen.findByText('Candelabro Cristal') // nombre, encabezado
    const modal = heading.closest('[class*="rounded-2xl"]') as HTMLElement
    expect(within(modal).getByText('Iluminación de techo')).toBeInTheDocument() // categoría, debajo del nombre
    expect(within(modal).getByText('bodega:inventory.detailModal.sectionInfo')).toBeInTheDocument()
    // REQ-361 Problema 2 — campos que antes faltaban por completo.
    expect(within(modal).getByText('bodega:inventory.detailModal.barcode')).toBeInTheDocument()
    expect(within(modal).getByText('7501234567890')).toBeInTheDocument()
    expect(within(modal).getByText('bodega:inventory.detailModal.description')).toBeInTheDocument()
    expect(within(modal).getByText('Candelabro de cristal, 5 brazos')).toBeInTheDocument()
    expect(within(modal).getByText('bodega:inventory.table.status')).toBeInTheDocument()
    expect(within(modal).getByText('bodega:inventory.status.disponible')).toBeInTheDocument()
  })

  it('RN4 — el texto de ayuda de Familia se muestra incluso sin familia asignada', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({
      data: [makeRow({ family_name: null })],
    }))
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    expect(await screen.findByText('bodega:inventory.detailModal.familyHelp')).toBeInTheDocument()
  })

  it('sin categoría asignada muestra el fallback en vez de vacío', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({
      data: [makeRow({ category: null })],
    }))
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    expect(await screen.findByText('bodega:inventory.detailModal.noCategory')).toBeInTheDocument()
  })
})

describe('BodegaInventarioPage — Confirmar llegada física (SCRUM-427)', () => {
  // Reconciliado 2026-07-23 contra el mockup real + el texto del ticket ("artículo por
  // artículo", "el botón desaparece"): es una acción POR PRODUCTO dentro del modal "Ver detalle",
  // gateada por `row.arrival_confirmation`, no una acción de encabezado que agrupe todos los
  // productos "en camino" del sistema.
  it('muestra el botón dentro del detalle del producto cuando pending_bodega_action es true, y confirma', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({
      data: [makeRow({ arrival_confirmation: { pending_bodega_action: true, awaiting_compras: false, confirmed_quantity: 0, confirmed_by_name: null } })],
    }))
    mockedApi.inventory.confirmArrival.mockResolvedValue({ confirmed_lines: [1], confirmed_quantity: 5 })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))
    await screen.findByText('Candelabro Cristal')

    fireEvent.click(screen.getByText('bodega:inventory.actions.confirmArrival'))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByText('bodega:inventory.actions.confirmAndNotify'))

    await waitFor(() => expect(mockedApi.inventory.confirmArrival).toHaveBeenCalledWith(1, { cantidad_entregada: 5 }))
  })

  it('muestra la nota de espera genérica cuando awaiting_compras es true sin nombre (fallback)', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({
      data: [makeRow({ arrival_confirmation: { pending_bodega_action: false, awaiting_compras: true, confirmed_quantity: 0, confirmed_by_name: null } })],
    }))
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))

    await waitFor(() => expect(screen.getByText('bodega:inventory.confirmArrivalModal.awaitingCompras')).toBeInTheDocument())
    expect(screen.queryByText('bodega:inventory.actions.confirmArrival')).not.toBeInTheDocument()
  })

  // Rebote REQ-427 (Daniela Amaya 2026-08-13) — la nota debe mostrar cantidad + quién confirmó.
  it('muestra la nota de espera con cantidad y usuario cuando confirmed_by_name viene informado', async () => {
    mockedApi.inventory.list.mockResolvedValue(listResponse({
      data: [makeRow({ arrival_confirmation: {
        pending_bodega_action: false, awaiting_compras: true, confirmed_quantity: 4, confirmed_by_name: 'Esteban Cardenas',
      } })],
    }))
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))

    await waitFor(() => expect(
      screen.getByText('bodega:inventory.confirmArrivalModal.awaitingComprasDetail count=4,user=Esteban Cardenas'),
    ).toBeInTheDocument())
    expect(screen.queryByText('bodega:inventory.actions.confirmArrival')).not.toBeInTheDocument()
  })

  it('no muestra botón ni nota cuando no hay nada pendiente de confirmar', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))
    await screen.findByText('Candelabro Cristal')

    expect(screen.queryByText('bodega:inventory.actions.confirmArrival')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:inventory.confirmArrivalModal.awaitingCompras')).not.toBeInTheDocument()
  })
})

// SCRUM-425 (REQ-355) — "Ver ficha técnica" en Bodega > Ver Inventario, mismo modal compartido
// con Compras (`TechnicalSpecModal`). Hallazgo de QA (marly.rangel, 2026-07-27): el botón
// existía en Compras pero faltaba acá.
describe('BodegaInventarioPage — Ver ficha técnica (SCRUM-425)', () => {
  it('el botón abre el modal y llama a bodegaApi.inventory.get (lazy, solo al abrir)', async () => {
    mockedApi.inventory.get.mockResolvedValue({
      ...makeRow(),
      technical_spec: {
        voltage: '120V', power: '8W', socket_type: 'E27', color_temperature: '3000K',
        luminous_flux: '800lm', dimensions: '10x10x5cm', weight: '0.2kg', material_finish: 'Aluminio',
        ip_rating: 'IP44', estimated_lifespan: '25000h', warranty: '2 años', certifications: 'CE/RoHS',
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))
    await screen.findByText('Candelabro Cristal')
    expect(mockedApi.inventory.get).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('bodega:inventory.technicalSpec.button'))

    await waitFor(() => expect(mockedApi.inventory.get).toHaveBeenCalledWith(1))
    expect(await screen.findByText('120V')).toBeInTheDocument()
    expect(screen.getByText('bodega:inventory.technicalSpec.fields.voltage')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando el producto no tiene ficha técnica (o el backend todavía no la expone)', async () => {
    mockedApi.inventory.get.mockResolvedValue({ ...makeRow(), technical_spec: null })
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))
    await screen.findByText('Candelabro Cristal')
    fireEvent.click(screen.getByText('bodega:inventory.technicalSpec.button'))

    expect(await screen.findByText('bodega:inventory.technicalSpec.empty')).toBeInTheDocument()
  })
})
