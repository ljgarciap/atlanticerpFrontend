import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import GoodsReceiptsPage from './GoodsReceiptsPage'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { GoodsReceiptSummary, GoodsReceiptDetail } from '@/types/compras'

// SCRUM-773 (CA5) — "+ Nuevo ingreso" pasa a exigir compras.edit (antes no tenía ningún check
// propio). Mismo patrón que LogisticsPage.test.tsx/OrdersPage.test.tsx.
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))
const mockedStore = vi.mocked(useAuthStore)
function mockAuthState(permissions: string[] | null = null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: permissions === null ? null : { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

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
    goodsReceipts: { list: vi.fn(), get: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeSummary(overrides: Partial<GoodsReceiptSummary> = {}): GoodsReceiptSummary {
  return {
    id: 1, purchase_order_id: 10, provider_name: 'LightCorp', order_status: 'en_aduana',
    lines_count: 2, total_units: 30, editable: true, created_at: '2026-07-19T00:00:00Z',
    ...overrides,
  }
}

function makeDetail(overrides: Partial<GoodsReceiptDetail> = {}): GoodsReceiptDetail {
  return {
    ...makeSummary(),
    invoice_storage_key: null, invoice_original_filename: null,
    import_cost_total: null, freight_total: null, handling_total: null, other_costs_total: null,
    lines: [{
      id: 1, catalog_product_id: 5, reference: 'REF-1', description: 'Bombillo E27',
      quantity: 10, unit_cost: 10, itbms_amount: null, import_cost_share: null, freight_cost_share: null, handling_cost_share: null, other_cost_share: null, cost_total: 100, warehouse_id: 1, warehouse_name: 'Atlantic',
      is_pending: true,
    }],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GoodsReceiptsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: sin usuario logueado (permissions null) => canCreate false, consistente con lo que
  // ya asumían los tests existentes de este archivo (ninguno afirmaba sobre "+ Nuevo ingreso").
  mockAuthState(null)
})

describe('GoodsReceiptsPage — Ver registros de ingreso (REQ-159)', () => {
  it('lista los ingresos registrados', async () => {
    mockedComprasApi.goodsReceipts.list.mockResolvedValue({ data: [makeSummary()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

    renderPage()

    expect(await screen.findByText('LightCorp')).toBeInTheDocument()
    expect(screen.getByText('#10')).toBeInTheDocument()
  })

  it('abrir el detalle de un ingreso editable muestra "Corregir este ingreso" y navega al hacer clic', async () => {
    mockedComprasApi.goodsReceipts.list.mockResolvedValue({ data: [makeSummary()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    mockedComprasApi.goodsReceipts.get.mockResolvedValue(makeDetail())

    renderPage()
    fireEvent.click(await screen.findByText('LightCorp'))

    fireEvent.click(await screen.findByText('compras:goodsReceipts.detail.edit'))

    expect(navigateMock).toHaveBeenCalledWith('/compras/ingresos/1/editar')
  })

  it('un ingreso de una orden ya "Recibida" muestra el aviso de bloqueo, no el botón de editar', async () => {
    mockedComprasApi.goodsReceipts.list.mockResolvedValue({ data: [makeSummary({ editable: false })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    mockedComprasApi.goodsReceipts.get.mockResolvedValue(makeDetail({ editable: false }))

    renderPage()
    fireEvent.click(await screen.findByText('LightCorp'))

    expect(await screen.findByText('compras:goodsReceipts.detail.locked')).toBeInTheDocument()
    expect(screen.queryByText('compras:goodsReceipts.detail.edit')).not.toBeInTheDocument()
  })
})

describe('GoodsReceiptsPage — "+ Nuevo ingreso" exige compras.edit (SCRUM-773 CA5)', () => {
  it('sin compras.edit (ej. Líder de Operaciones), el botón no aparece', async () => {
    mockAuthState(['compras.read', 'compras.limited.view'])
    mockedComprasApi.goodsReceipts.list.mockResolvedValue({ data: [makeSummary()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

    renderPage()

    await screen.findByText('LightCorp')
    expect(screen.queryByText('compras:goodsReceipts.actions.new')).not.toBeInTheDocument()
  })

  it('con compras.edit, el botón aparece y navega a /compras/ingresos/nuevo', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.goodsReceipts.list.mockResolvedValue({ data: [makeSummary()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

    renderPage()

    const button = await screen.findByText('compras:goodsReceipts.actions.new')
    fireEvent.click(button)
    expect(navigateMock).toHaveBeenCalledWith('/compras/ingresos/nuevo')
  })
})
