import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import InventarioPage from './InventarioPage'
import { comprasApi } from '@/api/comprasApi'
import type { InventoryProduct, TechnicalSpec } from '@/types/compras'

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
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    inventory: {
      list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
      toggleActive: vi.fn(), warehouseStock: vi.fn(), orderPrefill: vi.fn(), confirmPending: vi.fn(),
      checkReference: vi.fn().mockResolvedValue({ available: true }),
      uploadTechnicalSheet: vi.fn(), technicalSheetUrl: vi.fn(),
    },
    warehouses: { list: vi.fn() },
    // SCRUM-764 — list() propio de Compras, reemplaza el mock de ventasDisenoApi.catalogProductFamilies
    // (permission:ventas_diseno.read, 403 real para lider_compras).
    families: { list: vi.fn(), get: vi.fn(), generatePurchase: vi.fn() },
    // SCRUM-240 — CreateProductModal ahora busca proveedor (mismo patrón que NewPurchaseOrderPage).
    providers: { list: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeProduct(overrides: Partial<InventoryProduct> = {}): InventoryProduct {
  return {
    id: 1, reference: 'REF-1', description: 'Bombillo E27', brand: null, photo_url: null,
    category: null, rotation: null, reorder_point: null, warehouses: [],
    price_full: 20, stock_quantity: 10, por_servir: 0, disponible: 10, por_ingresar: 0, en_camino: 0,
    estado: 'disponible', is_active: true,
    cost: 12, margin_percent: 40, factory_reference: null,
    provider_id: null, provider_name: null, barcode: null,
    ...overrides,
  }
}

// SCRUM-425/426 — mismos 12 campos/orden que TECHNICAL_SPEC_FIELDS en InventarioPage.tsx.
const TECHNICAL_SPEC_FIELD_KEYS: (keyof TechnicalSpec)[] = [
  'voltage', 'power', 'socket_type', 'color_temperature', 'luminous_flux', 'dimensions',
  'weight', 'material_finish', 'ip_rating', 'estimated_lifespan', 'warranty', 'certifications',
]

function makeTechnicalSpec(overrides: Partial<TechnicalSpec> = {}): TechnicalSpec {
  return {
    voltage: '110V - 220V', power: '12 W', socket_type: 'E27', color_temperature: '3000K (cálida)',
    luminous_flux: '1050 lúmenes', dimensions: '40 x 40 x 55 cm', weight: '2.3 kg',
    material_finish: 'Metal pintado, difusor en vidrio', ip_rating: 'IP20 (interior)',
    estimated_lifespan: '25,000 horas', warranty: '12 meses', certifications: 'CE, RoHS',
    ...overrides,
  }
}


function renderPage(initialEntries: string[] = ['/inventario']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <InventarioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.warehouses.list.mockResolvedValue({ data: [{ id: 1, name: 'Illuminations' }] })
  mockedComprasApi.families.list.mockResolvedValue({
    restricted: false, can_manage: true, data: [],
    meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
  })
  mockedComprasApi.providers.list.mockResolvedValue({
    fuzzy: false,
    kpis: { total_providers: 1, average_rating: null, low_rating_count: 0, active_categories: 0, categories: [] },
    data: [{ id: 9, name: 'LightCorp', category: null, origin: 'internacional', currency: 'USD', is_active: true, contact_name: null, rating: null, last_purchase_at: null }],
    meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
  })
})

describe('InventarioPage — Productos (SCRUM-231→244)', () => {
  it('modo restringido no muestra botón crear ni columna de costo', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [{ id: 1, reference: 'REF-1', description: 'Bombillo E27', brand: null, photo_url: null,
        category: null, rotation: null, reorder_point: null, warehouses: [],
        price_full: 20, stock_quantity: 10, por_servir: 0, disponible: 10,
        por_ingresar: 0, en_camino: 0, provider_name: null,
        estado: 'disponible', is_active: true }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.actions.create')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.table.cost')).not.toBeInTheDocument()
    // SCRUM-238 rebote de Daniela 2026-08-12 + decisión de Luis 2026-08-14 — revierte el hallazgo
    // de Pre-QA 2026-07-19: "Por ingresar"/"En camino"/Proveedor NO son información financiera y
    // el mockup de la vista restringida los pide, así que sí deben verse en modo restringido.
    expect(screen.getByText('compras:inventory.table.porIngresar')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.enCamino')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.provider')).toBeInTheDocument()
  })

  it('modo completo muestra botón crear, columna de costo y toggle de vista', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    expect(screen.getByText('compras:inventory.actions.create')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.cost')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.toggle.ventas')).toBeInTheDocument()
  })

  // Bug real de producción (2026-08-18, reportado por lider_compras/gerencia2@illuminations.com.pa):
  // `TypeError: Cannot read properties of null (reading 'toLocaleString')` al cargar Inventario.
  // Causa raíz: `catalog_products.cost` es nullable en BD (3674/11632 filas NULL en prod, tras el
  // sync de migración ICG) y el chequeo `p.cost !== undefined` no cubre `null` — dejaba pasar
  // `null` a `formatMoney()`, que llama `.toLocaleString()` sin guardia. Fix: `p.cost != null`.
  it('modo completo con cost NULL (dato real de producción) muestra "—" en vez de crashear', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ cost: null, margin_percent: null })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    const row = screen.getByText('REF-1').closest('tr')
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain('—')
  })

  it('SCRUM-773 (CA4) — compras.limited.view (Líder de Operaciones): ve costos (restricted=false) pero NO ve Proveedores/+Crear nuevo producto/+Nueva orden de compra (can_manage=false)', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    // restricted=false — sigue viendo costo/margen, intención explícita de SCRUM-771.
    expect(screen.getByText('compras:inventory.table.cost')).toBeInTheDocument()
    // can_manage=false — ninguna acción de escritura debe aparecer (root cause real de SCRUM-773:
    // antes estos 3 reusaban `restricted`, que es false para este rol, y quedaban visibles).
    expect(screen.queryByText('compras:inventory.actions.providers')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.actions.create')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.actions.createOrder')).not.toBeInTheDocument()
    // La columna "Acciones" de la tabla (con "Generar orden" por fila) comparte el mismo
    // can_manage — antes reusaba `restricted` (false acá) y quedaba visible.
    expect(screen.queryByText('compras:inventory.table.actions')).not.toBeInTheDocument()
  })

  it('SCRUM-231 — modo Compras muestra "+ Nueva orden de compra" y navega a /compras/ordenes/nueva', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    const createOrderButton = screen.getByText('compras:inventory.actions.createOrder')
    expect(createOrderButton).toBeInTheDocument()
    fireEvent.click(createOrderButton)
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/nueva')
  })

  it('SCRUM-231 — modo Ventas & Diseño oculta "+ Nueva orden de compra" igual que "+ Crear nuevo producto"', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(screen.queryByText('compras:inventory.actions.createOrder')).not.toBeInTheDocument()
  })

  it('SCRUM-232 — los 5 KPIs usan separador de miles (formato en-US)', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: {
        total_products: 1234, low_stock: 2500, out_of_stock: 3400, in_attention: 5678,
        total_value: 134658.16,
      },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('2,500')).toBeInTheDocument()
    expect(screen.getByText('3,400')).toBeInTheDocument()
    expect(screen.getByText('5,678')).toBeInTheDocument()
    expect(screen.getByText('$134,658.16')).toBeInTheDocument()
  })

  it('SCRUM-233 — "Limpiar filtros" solo aparece con un filtro activo y resetea búsqueda + chip', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.filters.clear')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:inventory.chips.en_atencion'))
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'en_atencion' }),
    ))
    expect(screen.getByText('compras:inventory.filters.clear')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:inventory.filters.clear'))
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: undefined, search: undefined }),
    ))
    expect(screen.queryByText('compras:inventory.filters.clear')).not.toBeInTheDocument()
  })

  it('click en el chip En atención dispara el filtro correspondiente', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('compras:inventory.chips.en_atencion'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'en_atencion' }),
    ))
  })

  it('REQ-204 (Reportes) — llega con ?chip=en_atencion ya filtrado, no en Todos', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/inventario?chip=en_atencion'])

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'en_atencion' }),
    ))
  })

  it('REQ-112 (Inicio de Compras) — llega con ?chip=bajo_stock ya filtrado, sin botón propio en el filtro', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/inventario?chip=bajo_stock'])

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'bajo_stock' }),
    ))
    expect(screen.queryByText('compras:inventory.chips.bajo_stock')).not.toBeInTheDocument()
  })

  it('REQ-112 (Inicio de Compras) — llega con ?chip=sin_stock ya filtrado', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/inventario?chip=sin_stock'])

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'sin_stock' }),
    ))
  })

  it('ignora un valor de ?chip inválido y usa Todos por default', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/inventario?chip=algo-invalido'])

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: undefined }),
    ))
  })

  it('click en una fila abre el detalle del producto', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('REF-1'))

    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())
  })

  it('SCRUM-244 (REQ-181, rebote 2026-08-12) — columna Bodega(s) muestra un acceso compacto y clickeable, no la lista vertical', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({
        warehouses: [
          { warehouse_id: 1, warehouse_name: 'Illuminations', quantity: 2 },
          { warehouse_id: 2, warehouse_name: 'Reserva', quantity: 4 },
          { warehouse_id: 3, warehouse_name: 'Llano Bonito', quantity: 10 },
        ],
      })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({
      data: [{ warehouse_id: 1, warehouse_name: 'Illuminations', quantity: 2 }],
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    // RN2/RN3 — no lista las 3 bodegas verticalmente en la celda, muestra "3 Bodegas".
    expect(screen.queryByText(/Illuminations \(2\)/)).not.toBeInTheDocument()
    const compactAccess = screen.getByText('compras:inventory.table.warehousesCount count=3')
    expect(compactAccess).toBeInTheDocument()

    // RN1 (rebote 2026-08-16) — se abre desde la columna Bodega(s) un modal DEDICADO
    // (WarehouseStockModal), no el ProductDetailModal general — antes compartían el mismo modal
    // y se percibía como "el modal equivocado" (ver docblock de la celda en InventarioPage.tsx).
    fireEvent.click(compactAccess)
    await waitFor(() => expect(screen.getByText('compras:inventory.warehouseStock.title')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.detail.title')).not.toBeInTheDocument()
  })

  it('SCRUM-244 (REQ-181) — sin stock en ninguna bodega, la columna Bodega(s) muestra "—" sin acceso clickeable', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ warehouses: [] })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(screen.queryByText(/compras:inventory.table.warehousesCount/)).not.toBeInTheDocument()
  })

  it('SCRUM-425 (REQ-355) — "Ver ficha técnica" muestra los 12 campos de solo lectura', async () => {
    const spec = makeTechnicalSpec()
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ technical_spec: spec }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.technicalSpec.button'))

    await waitFor(() => expect(screen.getByText('compras:inventory.technicalSpec.title')).toBeInTheDocument())
    for (const key of TECHNICAL_SPEC_FIELD_KEYS) {
      expect(screen.getByText(`compras:inventory.technicalSpec.fields.${key}`)).toBeInTheDocument()
      expect(screen.getByText(spec[key])).toBeInTheDocument()
    }
  })

  it('SCRUM-425 (REQ-355) — producto sin ficha técnica (creado antes de la feature) muestra estado vacío, no 12 campos en blanco', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ technical_spec: null }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.technicalSpec.button'))

    await waitFor(() => expect(screen.getByText('compras:inventory.technicalSpec.empty')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.technicalSpec.fields.voltage')).not.toBeInTheDocument()
  })

  it('SCRUM-773 (compras.limited.view) — ve costo/margen en el detalle pero no puede editar precio/info general ni subir ficha técnica ni usar Acciones finales', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    // restricted=false — sigue viendo costo/margen (intención de SCRUM-771).
    expect(screen.getByText('compras:inventory.detail.cost')).toBeInTheDocument()
    // can_manage=false — ninguna acción de escritura del modal debe aparecer.
    expect(screen.queryByText('compras:inventory.actions.editPricing')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.actions.editGeneral')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.detail.technicalSheetDoc.upload')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.actions.deactivate')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.actions.generateOrder')).not.toBeInTheDocument()
  })

  it('editar recalcula el margen en vivo antes de guardar', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ price_full: 100, cost: 50, margin_percent: 50 })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ price_full: 100, cost: 50, margin_percent: 50 }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    // SCRUM-237 (hallazgo QA 2026-07-20): los 2 botones de edición (Información general y
    // Precios, RN4) tienen etiquetas distintas — dos "Editar" idénticos hacían indetectable
    // la edición de Precios.
    fireEvent.click(screen.getByText('compras:inventory.actions.editPricing'))
    const costInput = await screen.findByDisplayValue('50')
    fireEvent.change(costInput, { target: { value: '25' } })

    expect(screen.getByText(/compras:inventory.detail.margin: 75.00%/)).toBeInTheDocument()
  })

  it('editar "Información general" es independiente de Precios y confirma antes de guardar (RN4, SCRUM-237)', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.update.mockResolvedValue(makeProduct({ description: 'Bombillo LED E27' }))

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    // "Editar información" no debe activar la edición de Precios.
    fireEvent.click(screen.getByText('compras:inventory.actions.editGeneral'))
    expect(screen.queryByDisplayValue('12')).not.toBeInTheDocument() // input de costo (Precios) sigue sin aparecer

    // SCRUM-237 — Nombre y Descripción ahora son 2 inputs independientes que arrancan con el
    // mismo valor de fallback (`productDisplayName`, mientras el backend no mande `name` propio),
    // así que ya no alcanza con buscar por displayValue (ambiguo entre los 2) — se identifica el
    // textarea de Descripción por su label específico.
    const descriptionInput = screen.getByLabelText('compras:inventory.detail.description', { selector: 'textarea' })
    expect(descriptionInput).toHaveValue('Bombillo E27')
    fireEvent.change(descriptionInput, { target: { value: 'Bombillo LED E27' } })
    fireEvent.click(screen.getByText('compras:inventory.actions.save'))

    // Escenario 2 (RN4): aparece el resumen de confirmación in-app — nada se guarda todavía.
    expect(screen.getByText(/compras:inventory.detail.confirmSaveGeneral/)).toBeInTheDocument()
    expect(mockedComprasApi.inventory.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('compras:inventory.actions.confirm'))

    await waitFor(() => expect(mockedComprasApi.inventory.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ reference: 'REF-1', description: 'Bombillo LED E27', brand: null }),
    ))
  })

  /**
   * SCRUM-240 (corrección de Daniela Amaya, 2026-08-09) — REEMPLAZA el bloque de 4 tests que
   * existían acá ("crear producto envía el payload correcto", "bloquea el guardado si falta un
   * campo técnico", "referencia duplicada...", "defensa en profundidad ficha técnica..."): el
   * modal se reescribió por completo (campos/orden/obligatoriedad nuevos, ver docblock de
   * CreateProductModal en InventarioPage.tsx) — esos 4 tests probaban el formulario viejo
   * (referencia/descripción/precio/costo + 12 campos técnicos obligatorios), que ya no existe.
   */
  async function openCreateModalAndSelectProvider() {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    renderPage()

    fireEvent.click(await screen.findByText('compras:inventory.actions.create'))
    await waitFor(() => expect(screen.getByText('compras:inventory.create.title')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.provider')} *`), { target: { value: 'Light' } })
    // El picker de proveedor usa onMouseDown (no onClick), mismo motivo que NewPurchaseOrderPage:
    // dispara ANTES del blur del input de búsqueda, que si no cerraría la lista primero.
    fireEvent.mouseDown(await screen.findByText('LightCorp'))
  }

  // El mock de t() de este archivo concatena opts, no aplica acá (sin opts) — se define un alias
  // local mínimo solo para construir el mismo string que el componente usa como label ("X *").
  function t(key: string) { return key }

  function fillRequiredFields(overrides: Partial<{
    name: string; factoryReference: string; reference: string; brand: string; barcode: string;
    category: string; cost: string; additionalCost: string; priceFull: string; reorderPoint: string;
  }> = {}) {
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.create.name')} *`), { target: { value: overrides.name ?? 'Lámpara nueva' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.factoryReference')} *`), { target: { value: overrides.factoryReference ?? 'FAB-1' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.reference')} *`), { target: { value: overrides.reference ?? 'REF-1' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.brand')} *`), { target: { value: overrides.brand ?? 'Marca X' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.barcode')} *`), { target: { value: overrides.barcode ?? '7501234567890' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.category')} *`), { target: { value: overrides.category ?? 'bombillos' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.cost')} *`), { target: { value: overrides.cost ?? '15' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:newOrder.newProduct.additionalCost')} *`), { target: { value: overrides.additionalCost ?? '2' } })
    fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.priceFull')} *`), { target: { value: overrides.priceFull ?? '30' } })
    if (overrides.reorderPoint !== undefined) {
      fireEvent.change(screen.getByLabelText(`${t('compras:inventory.detail.reorderPoint')} *`), { target: { value: overrides.reorderPoint } })
    }
  }

  // SCRUM-426 — la ficha técnica (link, más simple de mockear que un File real) ahora es
  // obligatoria para poder enviar el formulario — helper separado de fillRequiredFields() porque
  // el test de "Cargar ficha técnica" arma su propia interacción paso a paso.
  function fillTechnicalSheetLink(link = 'https://proveedor.example.com/ficha.pdf') {
    fireEvent.click(screen.getByText('compras:inventory.detail.technicalSheetDoc.upload'))
    fireEvent.change(screen.getByPlaceholderText('compras:inventory.detail.technicalSheetDoc.linkPlaceholder'), {
      target: { value: link },
    })
    fireEvent.click(screen.getByText('compras:inventory.detail.technicalSheetDoc.saveLink'))
  }

  it('crear producto envía el payload correcto (proveedor obligatorio, costo adicional resuelto a $, stock inicial por bodega)', async () => {
    mockedComprasApi.inventory.create.mockResolvedValue(makeProduct({ reference: 'REF-1' }))
    await openCreateModalAndSelectProvider()

    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Illuminations'), { target: { value: '5' } })
    fillTechnicalSheetLink()

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    await waitFor(() => expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // SCRUM-240 (rebote de Daniela Amaya 2026-08-12) — Nombre y Descripción ya no comparten
        // columna: "Lámpara nueva" va a `name`, `description` queda vacío (no se llenó en este test).
        reference: 'REF-1', factory_reference: 'FAB-1', name: 'Lámpara nueva', description: '',
        brand: 'Marca X', barcode: '7501234567890', category: 'bombillos',
        provider_id: 9, cost: 15, price_full: 30, other_cost: 2,
        initial_stock: [{ warehouse_id: 1, quantity: 5 }],
      }),
      expect.anything(),
    ))
    // Ya no manda technical_spec (ver docblock de StoreInventoryProductRequest, backend).
    expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ technical_spec: expect.anything() }),
      expect.anything(),
    )
  })

  it('SCRUM-240 (rebote de Daniela Amaya 2026-08-12) — Nombre y Descripción son campos independientes, ambos se envían por separado', async () => {
    mockedComprasApi.inventory.create.mockResolvedValue(makeProduct())
    await openCreateModalAndSelectProvider()

    fillRequiredFields({ name: 'Lámpara colgante' })
    fireEvent.change(
      screen.getByLabelText(`${t('compras:inventory.detail.description')} (${t('compras:inventory.create.optional')})`, { exact: false }),
      { target: { value: 'Colgante de metal negro, 3 luces, incluye bombillos LED' } },
    )
    fillTechnicalSheetLink()

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    await waitFor(() => expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lámpara colgante',
        description: 'Colgante de metal negro, 3 luces, incluye bombillos LED',
      }),
      expect.anything(),
    ))
  })

  it('costo adicional en % se resuelve sobre el costo unitario antes de enviarse', async () => {
    mockedComprasApi.inventory.create.mockResolvedValue(makeProduct())
    await openCreateModalAndSelectProvider()

    fillRequiredFields({ cost: '100' })
    fireEvent.change(screen.getByLabelText('compras:newOrder.newProduct.additionalCost *'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('compras:newOrder.newProduct.additionalCost', { selector: 'select' }), { target: { value: 'porcentaje' } })
    fillTechnicalSheetLink()

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    // 10% de 100 = 10.
    await waitFor(() => expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({ other_cost: 10 }),
      expect.anything(),
    ))
  })

  it('sin proveedor seleccionado, "Crear producto" queda deshabilitado', async () => {
    await openCreateModalAndSelectProvider()
    // Deshace la selección de proveedor para probar el gate.
    fireEvent.click(screen.getByText('compras:newOrder.provider.change'))
    fillRequiredFields()

    expect(screen.getByText('compras:inventory.create.submit').closest('button')).toBeDisabled()
    expect(mockedComprasApi.inventory.create).not.toHaveBeenCalled()
  })

  it('sin stock inicial (sección completa en 0), crea el producto igual', async () => {
    mockedComprasApi.inventory.create.mockResolvedValue(makeProduct())
    await openCreateModalAndSelectProvider()
    fillRequiredFields()
    fillTechnicalSheetLink()

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    await waitFor(() => expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({ initial_stock: [] }),
      expect.anything(),
    ))
  })

  it('sin ficha técnica (ni archivo ni link), "Crear producto" queda deshabilitado (SCRUM-426)', async () => {
    await openCreateModalAndSelectProvider()
    fillRequiredFields()

    expect(screen.getByText('compras:inventory.create.submit').closest('button')).toBeDisabled()
    expect(mockedComprasApi.inventory.create).not.toHaveBeenCalled()
  })

  it('"Cargar ficha técnica" con un link se envía en el MISMO POST de creación (SCRUM-426 — antes se subía después, en 2 llamadas)', async () => {
    mockedComprasApi.inventory.create.mockResolvedValue(makeProduct({ id: 55 }))
    await openCreateModalAndSelectProvider()
    fillRequiredFields()

    fireEvent.click(screen.getByText('compras:inventory.detail.technicalSheetDoc.upload'))
    fireEvent.change(screen.getByPlaceholderText('compras:inventory.detail.technicalSheetDoc.linkPlaceholder'), {
      target: { value: 'https://proveedor.example.com/ficha.pdf' },
    })
    fireEvent.click(screen.getByText('compras:inventory.detail.technicalSheetDoc.saveLink'))

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    await waitFor(() => expect(mockedComprasApi.inventory.create).toHaveBeenCalledWith(
      expect.anything(), { link: 'https://proveedor.example.com/ficha.pdf' },
    ))
    // Ya no hay una segunda llamada "mejor esfuerzo" separada después de crear el producto.
    expect(mockedComprasApi.inventory.uploadTechnicalSheet).not.toHaveBeenCalled()
  })

  it('SCRUM-241 — referencia duplicada muestra el mensaje real del backend, no el genérico', async () => {
    // Hallazgo de QA (2026-07-18): el mensaje solo decía "No se pudo guardar el producto",
    // aunque el backend ya devuelve cuál producto tiene la referencia duplicada.
    mockedComprasApi.inventory.create.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          message: 'The reference has already been taken.',
          errors: { reference: ["La referencia pública 'DUP-1' ya pertenece al producto 'Bombillo Original'."] },
        },
      },
    })
    await openCreateModalAndSelectProvider()
    fillRequiredFields({ reference: 'DUP-1' })
    fillTechnicalSheetLink()

    fireEvent.click(screen.getByText('compras:inventory.create.submit'))

    expect(await screen.findByText("La referencia pública 'DUP-1' ya pertenece al producto 'Bombillo Original'.")).toBeInTheDocument()
  })

  it('"Cancelar" con datos sin guardar pide confirmación antes de cerrar', async () => {
    await openCreateModalAndSelectProvider()
    fillRequiredFields()

    fireEvent.click(screen.getByText('compras:inventory.actions.cancel'))

    expect(screen.getByText('compras:inventory.create.discardWarning')).toBeInTheDocument()
    // "Cancelar" en el aviso de confirmación vuelve al formulario, sin cerrar ni perder los datos.
    fireEvent.click(screen.getByText('compras:inventory.actions.cancel'))
    expect(screen.getByDisplayValue('Lámpara nueva')).toBeInTheDocument()
  })

  it('SCRUM-242 — Generar orden con proveedor asignado permite continuar a Nueva Orden precargada', async () => {
    // Regresión Senior Review 20260718 — "Generar orden" solo mostraba la cantidad sugerida y
    // se quedaba ahí, sin ningún camino real hacia crear la orden (el ticket pide literalmente
    // "abre el mismo formulario completo de crear una orden, precargado").
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ provider_id: 7 })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ provider_id: 7 }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.orderPrefill.mockResolvedValue({
      provider_id: 7, catalog_product_id: 1, suggested_quantity: 4,
      has_pending_shipment: false, pending_quantity: 0,
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click((a => a[a.length - 1])(screen.getAllByText('compras:inventory.actions.generateOrder')))
    await waitFor(() => expect(screen.getByText('compras:inventory.orderPrefill.continue')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.orderPrefill.continue'))

    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/nueva', {
      state: {
        providerId: 7,
        product: { id: 1, reference: 'REF-1', description: 'Bombillo E27', unitCost: 12, quantity: 4 },
      },
    })
  })

  it('SCRUM-242 — sin proveedor asignado avisa en vez de ofrecer un botón que no puede funcionar', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ provider_id: null })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ provider_id: null }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.orderPrefill.mockResolvedValue({
      provider_id: null, catalog_product_id: 1, suggested_quantity: 4,
      has_pending_shipment: false, pending_quantity: 0,
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click((a => a[a.length - 1])(screen.getAllByText('compras:inventory.actions.generateOrder')))

    await waitFor(() => expect(screen.getByText('compras:inventory.orderPrefill.noProvider')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.orderPrefill.continue')).not.toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-237 — el desglose de costo (importación/flete/manejo/otros) se suma en el margen en vivo y se envía al guardar', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({ price_full: 100, cost: 50 })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct({ price_full: 100, cost: 50 }))
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.update.mockResolvedValue(makeProduct({ price_full: 100, cost: 50 }))

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.actions.editPricing'))
    const freightInput = await screen.findByLabelText('compras:inventory.detail.freightCost')
    fireEvent.change(freightInput, { target: { value: '10' } })

    // Costo Total 60 (50 + 10 de flete) sobre precio 100 -> margen 40%, no el 50% de cost solo.
    expect(screen.getByText(/compras:inventory.detail.costTotal: \$60.00.+compras:inventory.detail.margin: 40.00%/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:inventory.actions.save'))

    // Escenario 2 (RN4): resumen in-app con costo total/precio/margen antes de aplicar.
    expect(screen.getByText(/compras:inventory.detail.confirmSave cost=60.00,price=100.00,margin=40.00/)).toBeInTheDocument()
    expect(mockedComprasApi.inventory.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('compras:inventory.actions.confirm'))

    await waitFor(() => expect(mockedComprasApi.inventory.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ cost: 50, freight_cost: 10, import_cost: 0, handling_cost: 0, other_cost: 0 }),
    ))
  })

  it('SCRUM-237 — asignar familia en Información general envía family_id al guardar', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.update.mockResolvedValue(makeProduct())
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: true,
      data: [{ id: 3, name: 'Kit Baño', description: null, product_count: 2, total_value: 100 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.actions.editGeneral'))
    // SCRUM-237 — Familia pasó de <select> a FamilyCombobox (combobox con creación-por-nombre,
    // ver src/components/compras/FamilyCombobox.tsx): escribir el nombre y elegir la opción
    // existente de la lista, no un fireEvent.change con el id numérico.
    const familyInput = screen.getByLabelText('compras:inventory.detail.family', { exact: false })
    fireEvent.focus(familyInput)
    fireEvent.change(familyInput, { target: { value: 'Kit Baño' } })
    fireEvent.mouseDown(await screen.findByText('Kit Baño'))
    fireEvent.click(screen.getByText('compras:inventory.actions.save'))
    fireEvent.click(screen.getByText('compras:inventory.actions.confirm'))

    await waitFor(() => expect(mockedComprasApi.inventory.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ family_id: 3 }),
    ))
  })

  it('SCRUM-236 (REQ-173) — con unidades "Por ingresar" bloquea inactivar y permite confirmarlas', async () => {
    const withPending = makeProduct({ por_ingresar: 10, disponible: 0 })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [withPending],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(withPending)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.confirmPending.mockResolvedValue({ confirmed_lines: [1], confirmed_units: 10 })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.title')).toBeInTheDocument())

    expect(screen.getByText('compras:inventory.actions.deactivate').closest('button')).toBeDisabled()
    expect(screen.getByText(/pendingInventory.warning/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:inventory.actions.confirmPending'))

    await waitFor(() => expect(mockedComprasApi.inventory.confirmPending).toHaveBeenCalledWith(1))
  })

  it('SCRUM-234 — la tabla en modo Compras muestra Categoría/Rotación/Bodega(s)/Por servir/Stock mínimo', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct({
        category: 'bombillos', rotation: 'alta', reorder_point: 5, por_servir: 3,
        warehouses: [{ warehouse_id: 1, warehouse_name: 'Illuminations', quantity: 7 }],
      })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(screen.getByText('compras:newOrder.newProduct.categories.bombillos')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.rotation.alta')).toBeInTheDocument()
    // SCRUM-244 (rebote 2026-08-12) — ya no lista "Illuminations (7)" en la celda, muestra el
    // acceso compacto "1 Bodega" (ver describe de SCRUM-244 más abajo para el detalle completo).
    expect(screen.getByText('compras:inventory.table.warehousesCount count=1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // Por servir
    expect(screen.getByText('5')).toBeInTheDocument() // Stock mínimo
  })

  it('SCRUM-238 (rebote Daniela 2026-08-12, decisión Luis 2026-08-14) — la tabla en modo Ventas & Diseño muestra Categoría/Rotación/Bodega(s)/Proveedor/Por ingresar/En camino pero NO costo', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [makeProduct({ category: 'bombillos', rotation: 'media', provider_name: 'Proveedor Uno', por_ingresar: 4, en_camino: 6 })],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(screen.getByText('compras:inventory.table.category')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.rotation')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.warehouses')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.provider')).toBeInTheDocument()
    expect(screen.getByText('Proveedor Uno')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.porIngresar')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.enCamino')).toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.table.cost')).not.toBeInTheDocument()
  })

  it('SCRUM-237 — "Datos generales" muestra Estado/Proveedor/Disponible/Por servir/Por ingresar/En camino de solo lectura', async () => {
    const product = makeProduct({
      provider_name: 'Proveedor Uno', por_servir: 2, por_ingresar: 4, en_camino: 6, disponible: 8,
    })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [product],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(product)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    await waitFor(() => expect(screen.getByText('compras:inventory.detail.generalDataSection')).toBeInTheDocument())
    // Los mismos valores también aparecen en la fila de la tabla de fondo (Proveedor/Disponible/
    // Por servir/Por ingresar/En camino son columnas ahí también) — se verifica que aparezcan AL
    // MENOS una vez, no que sean únicos en la página.
    expect(screen.getAllByText('Proveedor Uno').length).toBeGreaterThan(0)
    expect(screen.getAllByText('8').length).toBeGreaterThan(0) // Disponible
    expect(screen.getAllByText('2').length).toBeGreaterThan(0) // Por servir
    expect(screen.getAllByText('4').length).toBeGreaterThan(0) // Por ingresar
    expect(screen.getAllByText('6').length).toBeGreaterThan(0) // En camino
  })

  it('SCRUM-238 — el modal de detalle en modo Ventas & Diseño también muestra "Datos generales" (gap real reportado por Daniela 2026-08-12)', async () => {
    const product = makeProduct({
      provider_name: 'Proveedor Uno', por_servir: 2, por_ingresar: 4, en_camino: 6, disponible: 8,
      category: 'bombillos',
    })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [product],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(product)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    await waitFor(() => expect(screen.getByText('compras:inventory.detail.generalDataSection')).toBeInTheDocument())
    // getAllByText: el mismo label de categoría también aparece en la fila de la tabla detrás del modal
    expect(screen.getAllByText('compras:newOrder.newProduct.categories.bombillos').length).toBeGreaterThan(0) // subtítulo de categoría
    expect(screen.getAllByText('Proveedor Uno').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4').length).toBeGreaterThan(0) // Por ingresar
    expect(screen.getAllByText('6').length).toBeGreaterThan(0) // En camino
    // Costo/margen/precio de compra siguen exclusivos de modo Compras — sin cambios acá.
    expect(screen.queryByText('compras:inventory.detail.cost')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.detail.margin')).not.toBeInTheDocument()
  })

  it('SCRUM-238 (rebote Daniela 2026-08-12, comparado contra mockup real) — en modo restringido "Información del producto" va ANTES que "Precios", con "Ver ficha técnica" agrupado dentro', async () => {
    const product = makeProduct({ category: 'bombillos' })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [product],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(product)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    const generalSection = await screen.findByText('compras:inventory.detail.generalSection')
    const pricingSection = screen.getByText('compras:inventory.detail.pricingSection')
    const verFichaButton = screen.getByText('compras:inventory.technicalSpec.button')

    // Node.DOCUMENT_POSITION_FOLLOWING: generalSection aparece ANTES que pricingSection en el DOM.
    expect(generalSection.compareDocumentPosition(pricingSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // "Ver ficha técnica" queda agrupado dentro de la sección de información (antes de Precios), no
    // flotando después de ella.
    expect(generalSection.compareDocumentPosition(verFichaButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(verFichaButton.compareDocumentPosition(pricingSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('SCRUM-238 — en modo Compras (no restringido) el orden de secciones NO cambia: "Precios" sigue antes que "Información del producto"', async () => {
    const product = makeProduct({ category: 'bombillos' })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [product],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(product)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))

    const pricingSection = await screen.findByText('compras:inventory.detail.pricingSection')
    const productInfoSection = screen.getByText('compras:inventory.detail.productInfoSection')

    expect(pricingSection.compareDocumentPosition(productInfoSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('SCRUM-237 — editar "Información del producto" envía category y barcode', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.update.mockResolvedValue(makeProduct())

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.productInfoSection')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.actions.editGeneral'))
    const categorySelect = await screen.findByDisplayValue('—')
    fireEvent.change(categorySelect, { target: { value: 'bombillos' } })

    fireEvent.click(screen.getByText('compras:inventory.actions.save'))
    fireEvent.click(screen.getByText('compras:inventory.actions.confirm'))

    await waitFor(() => expect(mockedComprasApi.inventory.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ category: 'bombillos' }),
    ))
  })

  it('SCRUM-237 (REQ-178) — validación de referencia pública EN VIVO muestra el error del backend', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(makeProduct())
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.checkReference.mockResolvedValue({
      available: false, message: "La referencia pública 'DUP-1' ya pertenece al producto 'Otro'.",
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.productInfoSection')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.actions.editGeneral'))
    const referenceInput = await screen.findByDisplayValue('REF-1')
    fireEvent.change(referenceInput, { target: { value: 'DUP-1' } })

    await waitFor(() => expect(mockedComprasApi.inventory.checkReference).toHaveBeenCalledWith('DUP-1', 1), { timeout: 2000 })
    await waitFor(() => expect(screen.getByText(/ya pertenece al producto 'Otro'/)).toBeInTheDocument())
    expect(screen.getByText('compras:inventory.actions.save').closest('button')).toBeDisabled()
  })

  it('SCRUM-237 — "Cargar ficha técnica" sube un archivo y muestra el link tras confirmarse', async () => {
    const product = makeProduct({ has_technical_sheet: false, technical_sheet_filename: null })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [product],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.inventory.get.mockResolvedValue(product)
    mockedComprasApi.inventory.warehouseStock.mockResolvedValue({ data: [] })
    mockedComprasApi.inventory.uploadTechnicalSheet.mockResolvedValue({
      id: 1, has_technical_sheet: true, technical_sheet_filename: 'ficha.pdf', technical_sheet_uploaded_at: '2026-08-11T00:00:00Z',
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('REF-1'))
    await waitFor(() => expect(screen.getByText('compras:inventory.detail.technicalSheetDocSection')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.detail.technicalSheetDoc.upload'))
    const file = new File(['contenido'], 'ficha.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(mockedComprasApi.inventory.uploadTechnicalSheet).toHaveBeenCalledWith(
      1, { file },
    ))
  })
})

describe('InventarioPage — filtro de Bodegas (SCRUM-743)', () => {
  beforeEach(() => {
    mockedComprasApi.warehouses.list.mockResolvedValue({
      data: [
        { id: 1, name: 'Illuminations' },
        { id: 2, name: 'Bodega Norte' },
        { id: 3, name: 'Bodega Sur' },
      ],
    })
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 1, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 200 },
      data: [makeProduct()],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
  })

  it('sin selección de bodegas no manda warehouse_ids (comportamiento "todas", nunca tabla vacía por default)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: undefined }),
    )
  })

  it('seleccionar 2 bodegas manda ambos IDs en warehouse_ids', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    fireEvent.click(screen.getByLabelText('Illuminations'))
    fireEvent.click(screen.getByLabelText('Bodega Sur'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: [1, 3] }),
    ))
  })

  it('quitar 1 bodega de la selección deja el resto y actualiza warehouse_ids', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    fireEvent.click(screen.getByLabelText('Illuminations'))
    fireEvent.click(screen.getByLabelText('Bodega Norte'))
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: [1, 2] }),
    ))

    // Quitar Illuminations vía el chip visible (dropdown cerrado) — Bodega Norte se mantiene.
    fireEvent.click(screen.getByLabelText('inventory.filters.removeWarehouse name=Illuminations'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: [2] }),
    ))
  })

  it('"Seleccionar todas" manda las 3 bodegas; "Limpiar selección" vuelve a omitir el parámetro', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    fireEvent.click(screen.getByText('inventory.filters.selectAllWarehouses'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: [1, 2, 3] }),
    ))

    fireEvent.click(screen.getByText('inventory.filters.clearWarehouses'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: undefined }),
    ))
  })

  it('cambiar de bodega no resetea la búsqueda de texto activa (combinación con filtros existentes)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('compras:inventory.filters.searchPlaceholder'), {
      target: { value: 'bombillo' },
    })
    fireEvent.click(screen.getByText('common:actions.search'))
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'bombillo' }),
    ))

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    fireEvent.click(screen.getByLabelText('Bodega Norte'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'bombillo', warehouse_ids: [2] }),
    ))
    // La búsqueda sigue en el input, no se perdió.
    expect(screen.getByDisplayValue('bombillo')).toBeInTheDocument()
  })

  it('"Limpiar filtros" también resetea la selección de bodegas', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('REF-1')).toBeInTheDocument())

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    fireEvent.click(screen.getByLabelText('Illuminations'))
    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: [1] }),
    ))
    expect(screen.getByText('compras:inventory.filters.clear')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:inventory.filters.clear'))

    await waitFor(() => expect(mockedComprasApi.inventory.list).toHaveBeenCalledWith(
      expect.objectContaining({ warehouse_ids: undefined, search: undefined, chip: undefined }),
    ))
    expect(screen.queryByText('compras:inventory.filters.clear')).not.toBeInTheDocument()
  })
})

describe('InventarioPage — Familias (SCRUM-243, rediseño Lote 4 2026-08-17)', () => {
  it('lista familias como cards, con valor total colapsado, y expande inline a la tabla completa de Productos', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: true,
      data: [{ id: 1, name: 'Kit Baño', description: null, product_count: 2, total_value: 50 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.get.mockResolvedValue({
      id: 1, name: 'Kit Baño', description: null, restricted: false, can_manage: true, total_value: 50, product_count: 1,
      products: [makeProduct({ id: 1, reference: 'FAM-A', description: 'Producto A' })],
    })

    renderPage()
    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))

    // Valor total visible en la card COLAPSADA (mockup), sin necesidad de expandir.
    await waitFor(() => expect(screen.getByText('Kit Baño')).toBeInTheDocument())
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.queryByText('FAM-A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('family-toggle-1'))

    // Mismas columnas que la tabla "Productos" — Categoría/Rotación/Bodega(s)/Disponible/etc.
    await waitFor(() => expect(screen.getByText('FAM-A')).toBeInTheDocument())
    expect(screen.getByText('compras:inventory.table.category')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.rotation')).toBeInTheDocument()
    expect(screen.getByText('compras:inventory.table.disponible')).toBeInTheDocument()
  })

  it('"Generar compra" está disponible directo en la card colapsada, sin expandir primero', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: true,
      data: [{ id: 1, name: 'Kit Baño', description: null, product_count: 1, total_value: 50 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.get.mockResolvedValue({
      id: 1, name: 'Kit Baño', description: null, restricted: false, can_manage: true, total_value: 50, product_count: 1,
      products: [makeProduct({ id: 1, reference: 'FAM-A', description: 'Producto A' })],
    })
    mockedComprasApi.families.generatePurchase.mockResolvedValue({ order_ids: [10, 11] })

    renderPage()
    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Kit Baño')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:inventory.families.generatePurchase'))

    await waitFor(() => expect(mockedComprasApi.families.generatePurchase).toHaveBeenCalledWith(1))
    // Al generar, la card se auto-expande para mostrar el resultado (mensaje de éxito).
    expect(await screen.findByText('compras:inventory.families.generated count=2')).toBeInTheDocument()
  })

  it('oculta "Generar compra" y el valor total en modo restringido (RN REQ-180, SCRUM-243)', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: true, can_manage: false,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: true, can_manage: false,
      data: [{ id: 1, name: 'Kit Baño', description: null, product_count: 1, total_value: null }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.get.mockResolvedValue({
      id: 1, name: 'Kit Baño', description: null, restricted: true, can_manage: false, total_value: null, product_count: 1,
      products: [makeProduct({ id: 1, reference: 'FAM-A', description: 'Producto A', cost: undefined })],
    })

    renderPage()
    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Kit Baño')).toBeInTheDocument())

    expect(screen.queryByText('compras:inventory.families.generatePurchase')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.families.totalValueLabel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('family-toggle-1'))
    await waitFor(() => expect(screen.getByText('FAM-A')).toBeInTheDocument())
    expect(screen.queryByText('compras:inventory.table.cost')).not.toBeInTheDocument()
  })

  it('SCRUM-773 (CA4) — compras.limited.view: ve el valor total de la familia (restricted=false) pero NO "Generar compra" (can_manage=false)', async () => {
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: false,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: false,
      data: [{ id: 1, name: 'Kit Baño', description: null, product_count: 1, total_value: 50 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })

    renderPage()
    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Kit Baño')).toBeInTheDocument())

    expect(screen.getByText('compras:inventory.families.totalValueLabel')).toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.families.generatePurchase')).not.toBeInTheDocument()
  })

  it('QA 2026-07-20 (rechazo) — el modo Ventas & Diseño oculta "Generar compra" también en Familias', async () => {
    // El toggle Compras/Ventas & Diseño vivía solo dentro de ProductsTab; al cambiar a la
    // pestaña Familias, ese estado se perdía (era local al tab desmontado) y el botón
    // "Generar compra" quedaba visible aunque el usuario estuviera en modo Ventas & Diseño.
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: true,
      data: [{ id: 1, name: 'Kit Baño', description: null, product_count: 1, total_value: 50 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.get.mockResolvedValue({
      id: 1, name: 'Kit Baño', description: null, restricted: false, can_manage: true, total_value: 50, product_count: 1,
      products: [makeProduct({ id: 1, reference: 'FAM-A', description: 'Producto A' })],
    })

    renderPage()
    await screen.findByText('compras:inventory.toggle.ventas')
    fireEvent.click(screen.getByText('compras:inventory.toggle.ventas'))

    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Kit Baño')).toBeInTheDocument())

    expect(screen.queryByText('compras:inventory.families.generatePurchase')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:inventory.families.totalValueLabel')).not.toBeInTheDocument()
  })

  it('QA 2026-07-20 (rechazo) — el error del servidor al generar la compra se muestra en pantalla', async () => {
    // El mensaje real del backend ("La familia no tiene productos activos con proveedor
    // asignado.") nunca se mostraba: el componente solo revisaba generatePurchase.isSuccess.
    mockedComprasApi.inventory.list.mockResolvedValue({
      fuzzy: false, restricted: false, can_manage: true,
      kpis: { total_products: 0, low_stock: 0, out_of_stock: 0, in_attention: 0, total_value: 0 },
      data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.list.mockResolvedValue({
      restricted: false, can_manage: true,
      data: [{ id: 1, name: 'Sala Elegante', description: null, product_count: 1, total_value: 0 }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.families.get.mockResolvedValue({
      id: 1, name: 'Sala Elegante', description: null, restricted: false, can_manage: true, total_value: 0, product_count: 1,
      products: [makeProduct({ id: 1, reference: 'FAM-A', description: 'Producto A', cost: 0 })],
    })
    mockedComprasApi.families.generatePurchase.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'La familia no tiene productos activos con proveedor asignado.' } },
    })

    renderPage()
    fireEvent.click(screen.getByText('compras:inventory.tabs.families'))
    await waitFor(() => expect(screen.getByText('Sala Elegante')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:inventory.families.generatePurchase'))

    expect(await screen.findByText('La familia no tiene productos activos con proveedor asignado.')).toBeInTheDocument()
  })
})
