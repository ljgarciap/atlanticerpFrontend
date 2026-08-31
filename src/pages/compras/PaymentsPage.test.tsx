import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PaymentsPage from './PaymentsPage'
import { comprasApi } from '@/api/comprasApi'
import type { PurchaseOrderListResponse, PurchaseOrderSummary } from '@/types/compras'

// SCRUM-250 (corrección de Gerencia Test, 2026-08-09) — la pantalla de "Pagos a Proveedores"
// nunca tuvo test dedicado (solo el panel de detalle de orden, PurchaseOrderPaymentsPanel.test.tsx,
// estaba cubierto). Cubre los 4 gaps reales que Daniela reportó: 5 KPIs dinámicos, búsqueda +
// filtro de proveedor + "Limpiar filtros", los 5 chips con la nomenclatura correcta
// (Sin enviar/Por pagar, no "Pago pendiente"), y las 9 columnas de la tabla en el orden definido.

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

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    orders: { list: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeSummary(overrides: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary {
  return {
    id: 12, provider_id: 1, provider_name: 'LightCorp', provider_origin: null, origin_module: null, created_by_name: 'Yirena',
    status: 'por_aprobar', next_status: 'ordenado', is_critical: false, modality: 'directo',
    shipping_type: null, shipping_cost: null,
    estimated_arrival_date: null, requires_primary_approval: false, blocked_by_primary_approval: false,
    approved_by: null, approved_by_name: null, total_amount: 100, currency: 'USD',
    sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
    created_at: '2026-07-01T00:00:00Z', status_changed_at: '2026-07-01T00:00:00Z',
    payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null, last_payment_date: null,
    reception_status: 'pendiente', shows_goods_receipt_link: false, pending_remainder_status: null,
    ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
    actual_arrival_date: null,
    ...overrides,
  }
}

function makeResponse(overrides: Partial<PurchaseOrderListResponse> = {}): PurchaseOrderListResponse {
  return {
    data: [makeSummary()],
    meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    filters: { creators: [], providers: [{ id: 1, name: 'LightCorp' }] },
    payment_kpis: { total_pending_balance: 100, sin_enviar: 1, por_pagar: 0, parcial: 0, completo: 0 },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PaymentsPage (SCRUM-250, corrección Gerencia Test)', () => {
  it('muestra los 5 KPIs dinámicos (no valores fijos)', async () => {
    mockedComprasApi.orders.list.mockResolvedValue(makeResponse({
      payment_kpis: { total_pending_balance: 63600, sin_enviar: 6, por_pagar: 2, parcial: 1, completo: 3 },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('$63,600.00')).toBeInTheDocument())
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.kpis.totalPending')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.kpis.sinEnviar')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.kpis.porPagar')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.kpis.parcial')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.kpis.completo')).toBeInTheDocument()
  })

  it('tiene búsqueda de texto libre, filtro de proveedor y los 5 chips con la nomenclatura correcta', async () => {
    mockedComprasApi.orders.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp', { selector: 'option' })).toBeInTheDocument())

    expect(screen.getByPlaceholderText('compras:payments.filters.searchPlaceholder')).toBeInTheDocument()

    // 5 chips exactos — nunca "Pago pendiente" (nomenclatura vieja que Daniela pidió corregir).
    expect(screen.getByText('compras:payments.filters.all')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.chips.sin_enviar')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.chips.por_pagar')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.chips.parcial')).toBeInTheDocument()
    expect(screen.getByText('compras:payments.chips.completo')).toBeInTheDocument()
    expect(screen.queryByText('compras:payments.chips.pendiente')).not.toBeInTheDocument()
  })

  it('la búsqueda, el proveedor y el chip se combinan en un solo request', async () => {
    mockedComprasApi.orders.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp', { selector: 'option' })).toBeInTheDocument())

    // Proveedor primero, mientras el <select> todavía tiene la opción cargada del fetch inicial
    // — cada cambio de filtro dispara un refetch con una queryKey nueva (React Query), así que
    // `filters.providers` queda transitoriamente vacío hasta que ESA respuesta puntual resuelve.
    fireEvent.change(screen.getByText('compras:payments.filters.allProviders').closest('select')!, { target: { value: '1' } })
    fireEvent.click(screen.getByText('compras:payments.chips.por_pagar'))
    fireEvent.change(screen.getByPlaceholderText('compras:payments.filters.searchPlaceholder'), { target: { value: '#12' } })
    fireEvent.click(screen.getByText('common:actions.search'))

    await waitFor(() => expect(mockedComprasApi.orders.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payment_pending: true, payment_status: 'por_pagar', search: '#12', provider_id: 1,
      }),
    ))
  })

  it('"Limpiar filtros" solo aparece con un filtro activo y resetea todo a la vez', async () => {
    mockedComprasApi.orders.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(mockedComprasApi.orders.list).toHaveBeenCalled())
    expect(screen.queryByText('compras:payments.filters.clear')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:payments.chips.parcial'))
    await waitFor(() => expect(screen.getByText('compras:payments.filters.clear')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:payments.filters.clear'))

    await waitFor(() => expect(mockedComprasApi.orders.list).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_pending: true, payment_status: undefined, search: undefined, provider_id: undefined,
      }),
    ))
    expect(screen.queryByText('compras:payments.filters.clear')).not.toBeInTheDocument()
  })

  it('la tabla contiene las 9 columnas del requerimiento, en el orden definido', async () => {
    mockedComprasApi.orders.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp', { selector: 'td' })).toBeInTheDocument())

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'compras:payments.table.id',
      'compras:orders.table.provider',
      'compras:payments.table.orderStatus',
      'compras:payments.table.orderAmount',
      'compras:payments.table.amountToPay',
      'compras:payments.table.paid',
      'compras:payments.table.balance',
      'compras:orders.detail.payments.status',
      'compras:payments.table.responsible',
      'compras:orders.table.actions',
    ])
  })
})
