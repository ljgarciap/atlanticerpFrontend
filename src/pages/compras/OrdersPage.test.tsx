import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import OrdersPage from './OrdersPage'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { PurchaseOrderSummary } from '@/types/compras'

// REQ-140/146 (SCRUM-203/209): gap real detectado por el Analista al reconciliar el sprint —
// GET /api/compras/orders no exponía ningún campo de proyecto y la tabla principal no tenía
// columna para mostrarlo. Este archivo no existía antes de este fix.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'object' && opts && 'count' in opts ? `${key} ${(opts as { count: number }).count}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { list: vi.fn() },
    orders: { list: vi.fn(), get: vi.fn(), create: vi.fn(), approve: vi.fn() },
    // SCRUM-733 — OrdersPage ya no usa approvedProjects.search() (ver comentario en OrdersPage.tsx),
    // usa shipmentProjects.search() igual que LogisticsPage (endpoint /compras/orders/shipment-projects).
    shipmentProjects: { search: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

// SCRUM-773 (CA1) — "+ Nueva orden" pasa a exigir compras.write (antes no tenía ningún check
// propio). Mismo patrón que LogisticsPage.test.tsx/OrderDetailPage.test.tsx.
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))
const mockedStore = vi.mocked(useAuthStore)
function mockAuthState(permissions: string[] | null = null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: permissions === null ? null : { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

function makeSummary(overrides: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary {
  return {
    id: 1, provider_id: 1, provider_name: 'LightCorp', provider_origin: null, origin_module: null, created_by_name: 'Ana',
    status: 'por_aprobar', next_status: 'ordenado', is_critical: false, modality: 'directo',
    // REQ-140 (SCRUM-203) — "Tipo de envío"/"Costo de envío"/"Fecha de pago", ausentes de la
    // tabla principal hasta este ticket (gap real vs. mockup 2A/Excel de requerimientos).
    shipping_type: null, shipping_cost: null,
    estimated_arrival_date: null, requires_mark_approval: false, blocked_by_mark_approval: false,
    approved_by: null, approved_by_name: null, total_amount: 100, currency: 'USD',
    sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
    created_at: '2026-07-01T00:00:00Z', status_changed_at: '2026-07-01T00:00:00Z',
    payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null, last_payment_date: null,
    reception_status: 'pendiente', shows_goods_receipt_link: false, pending_remainder_status: null,
    // REQ-154 (SCRUM-217) — timeline de Logística.
    ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
    actual_arrival_date: null,
    ...overrides,
  }
}

function renderPage(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <OrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: sin usuario logueado (permissions null) => canCreate false, consistente con lo que
  // ya asumían los tests existentes de este archivo (ninguno afirmaba sobre "+ Nueva orden").
  mockAuthState(null)
  mockedComprasApi.providers.list.mockResolvedValue({
    fuzzy: false,
    kpis: { total_providers: 0, average_rating: null, low_rating_count: 0, active_categories: 0, categories: [] },
    data: [],
    meta: { total: 0, per_page: 100, current_page: 1, last_page: 1 },
  })
})

describe('OrdersPage — columna "Proyecto asignado" (REQ-140/146)', () => {
  it('muestra "Sin proyecto" cuando ninguna línea tiene proyecto asignado', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.table.projectNone')).toBeInTheDocument()
  })

  it('muestra el nombre del proyecto cuando todas las líneas comparten uno solo', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ sales_project_summary: 'Torre Norte', sales_project_count: 1 })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('Torre Norte')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.table.projectNone')).not.toBeInTheDocument()
  })

  it('muestra "N proyectos" cuando las líneas tienen 2+ proyectos distintos, sin listarlos inline', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        sales_project_summary: null, has_multiple_projects: true, sales_project_count: 3,
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.table.projectMultiple 3')).toBeInTheDocument()
  })

  it('el link de "N proyectos" abre el modal de desglose por línea, sin navegar al detalle', async () => {
    // SCRUM-203 (hallazgo de Daniela 2026-08-04) — antes este click reusaba el mismo destino
    // que el botón "Ver" y aterrizaba en el detalle general de la orden, sin foco en el
    // desglose por proyecto. Ahora abre ProjectBreakdownModal con las líneas reales.
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        id: 7, sales_project_summary: null, has_multiple_projects: true, sales_project_count: 2,
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue({
      ...makeSummary({ id: 7, sales_project_summary: null, has_multiple_projects: true, sales_project_count: 2 }),
      who_pays_shipping: null, liquidation_agency_id: null, liquidation_agency_name: null,
      actual_arrival_date: null, container_number: null, carrier: null, approved_at: null,
      pending_amount_change: null, amount_change_requested_by: null, notes: null,
      lines: [
        {
          id: 1, catalog_product_id: null, reference: 'REF-1', factory_reference: null,
          description: 'Producto A', quantity: 2, unit_cost: 10, subtotal: 20,
          additional_cost_percent: null, additional_cost_amount: null, additional_cost_type: null,
          sales_project_id: 10, sales_project_name: 'Torre Norte',
          received_quantity: 0, reception_status: 'pendiente',
        },
        {
          id: 2, catalog_product_id: null, reference: 'REF-2', factory_reference: null,
          description: 'Producto B', quantity: 1, unit_cost: 5, subtotal: 5,
          additional_cost_percent: null, additional_cost_amount: null, additional_cost_type: null,
          sales_project_id: 11, sales_project_name: 'Torre Sur',
          received_quantity: 0, reception_status: 'pendiente',
        },
      ],
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:orders.table.projectMultiple 2'))

    expect(mockNavigate).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument())
    expect(screen.getByText('Torre Norte')).toBeInTheDocument()
    expect(screen.getByText('Torre Sur')).toBeInTheDocument()
  })
})

describe('OrdersPage — columnas faltantes de REQ-140 (SCRUM-203)', () => {
  // Confirmadas ausentes vs. mockup 2A/Excel de requerimientos (captura real + comentario del
  // usuario que reportó SCRUM-203): Tipo de envío, Fecha de orden, Fecha de pago, Costo de envío,
  // Responsable. "Responsable"/"Fecha de orden" ya venían en el payload (created_by_name/
  // created_at) para otras pantallas — este test los fija como columnas visibles acá también.
  it('renderiza tipo de envío, fecha de orden, fecha de pago, costo de envío y responsable', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        created_by_name: 'María G.',
        shipping_type: 'aereo',
        shipping_cost: 850,
        last_payment_date: '2026-07-15',
        created_at: '2026-07-01T00:00:00Z',
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:newOrder.shipping.typeAereo')).toBeInTheDocument()
    expect(screen.getByText('María G.')).toBeInTheDocument()
    expect(screen.getByText('$850.00')).toBeInTheDocument()
    expect(screen.getByText('2026-07-15')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-07-01T00:00:00Z').toLocaleDateString())).toBeInTheDocument()
  })

  it('muestra "—" cuando tipo de envío, costo de envío, fecha de pago o responsable no existen', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        created_by_name: null, shipping_type: null, shipping_cost: null, last_payment_date: null,
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    // 4 columnas nullable en esta orden (tipo de envío, costo de envío, fecha de pago,
    // responsable) — todas caen al mismo placeholder "—", consistente con el mockup.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
})

// Pre-QA 2026-08-13 (Servicios, REQ-274 RN3, SCRUM-344) — gap real encontrado en vivo: el backend
// ya guardaba origin_module='servicios' desde que existe InsumoService::requestPurchase(), pero
// nunca se exponía en la respuesta ni se pintaba acá — Yirena no tenía forma real de distinguir
// una solicitud de Servicios del resto (RN3 explícita del ticket, "visible en Compras con Origen:
// Servicios"). Corregido en el mismo dispatch: PurchaseOrderController::formatSummary() ahora
// expone `origin_module`, y esta tabla lo pinta con OriginBadge.
describe('OrdersPage — badge de Origen: Servicios (Pre-QA REQ-274 RN3, SCRUM-344)', () => {
  it('muestra "Origen: Servicios" cuando origin_module es servicios', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ origin_module: 'servicios' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.originServicios')).toBeInTheDocument()
  })

  it('no muestra ningún badge de origen para una orden creada a mano (origin_module null)', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ origin_module: null })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.originServicios')).not.toBeInTheDocument()
  })
})

describe('OrdersPage — deep-link ?chip= desde Inicio de Compras (REQ-112)', () => {
  it('llega con ?chip=critical ya aplicado, no en "Todas" por defecto', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [], filters: { creators: [] },
      meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/compras/ordenes?chip=critical'])

    await waitFor(() => expect(mockedComprasApi.orders.list).toHaveBeenCalled())
    const lastCallArgs = mockedComprasApi.orders.list.mock.calls[mockedComprasApi.orders.list.mock.calls.length - 1]?.[0]
    expect(lastCallArgs).toMatchObject({ chip: 'critical' })
  })

  it('un valor de chip desconocido en la URL cae a "Todas"', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [], filters: { creators: [] },
      meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage(['/compras/ordenes?chip=algo-invalido'])

    await waitFor(() => expect(mockedComprasApi.orders.list).toHaveBeenCalled())
    const lastCallArgs = mockedComprasApi.orders.list.mock.calls[mockedComprasApi.orders.list.mock.calls.length - 1]?.[0]
    expect(lastCallArgs?.chip).toBeUndefined()
  })
})

// SCRUM-204 (REQ-141, 2026-08-06 — hallazgo Daniela Amaya): "Pendiente/Por liquidar" es un único
// estado interno, pero la columna Estado debe mostrar un texto distinto según la modalidad.
describe('OrdersPage — etiqueta de estado por modalidad (SCRUM-204)', () => {
  it('pendiente_liquidar en modalidad directo muestra "Pendiente", no el texto combinado', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ status: 'pendiente_liquidar', modality: 'directo' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    // El <select> de filtro sigue usando el texto genérico para "todos los estados posibles" —
    // solo la celda de la fila (una orden puntual, con modality real) debe usar la etiqueta
    // derivada. queryAllByText en vez de getByText porque la clave genérica también existe como
    // <option> del filtro.
    expect(screen.getByText('compras:orders.status.pendienteLiquidarDirecto')).toBeInTheDocument()
  })

  it('pendiente_liquidar en modalidad zona_libre muestra "Por liquidar"', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ status: 'pendiente_liquidar', modality: 'zona_libre' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.status.pendienteLiquidarZonaLibre')).toBeInTheDocument()
  })
})

describe('OrdersPage — "+ Nueva orden" exige compras.write (SCRUM-773 CA1)', () => {
  it('sin compras.write (ej. Líder de Operaciones), el botón no aparece', async () => {
    mockAuthState(['compras.read', 'compras.limited.view'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.create')).not.toBeInTheDocument()
  })

  it('con compras.write, el botón aparece y navega a /compras/ordenes/nueva', async () => {
    mockAuthState(['compras.read', 'compras.write'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()

    const button = await screen.findByText('compras:orders.actions.create')
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/compras/ordenes/nueva')
  })
})
