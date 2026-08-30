import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PurchaseOrderPaymentsPanel from './PurchaseOrderPaymentsPanel'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { PurchaseOrderDetail, ComprasSettings } from '@/types/compras'

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
    payments: { list: vi.fn(), register: vi.fn() },
    orders: {
      requestPayment: vi.fn(), requestAmountChange: vi.fn(),
      approveAmountChange: vi.fn(), rejectAmountChange: vi.fn(),
    },
    settings: { get: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedComprasApi = vi.mocked(comprasApi, true)
const mockedUseAuthStore = vi.mocked(useAuthStore)

function makeOrder(overrides: Partial<PurchaseOrderDetail> = {}): PurchaseOrderDetail {
  return {
    id: 12, provider_id: 1, provider_name: 'LightCorp', status: 'ordenado',
    modality: 'directo', requires_mark_approval: false, approved_by: null, approved_by_name: null,
    total_amount: 100, currency: 'USD',
    sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
    created_at: '2026-08-01T00:00:00Z', status_changed_at: '2026-08-01T00:00:00Z',
    payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null,
    last_payment_date: null, reception_status: 'pendiente', shows_goods_receipt_link: false,
    pending_remainder_status: null,
    who_pays_shipping: null, liquidation_agency_id: null, liquidation_agency_name: null,
    container_number: null, carrier: null, approved_at: null,
    pending_amount_change: null, amount_change_requested_by: null, notes: null, lines: [],
    ...overrides,
  } as unknown as PurchaseOrderDetail
}

function makeSettings(overrides: Partial<ComprasSettings> = {}): ComprasSettings {
  return {
    low_rating_threshold: 3, claim_attention_days: 7, replacement_margin_threshold: 20,
    mark_approver_user_id: 99,
    ...overrides,
  } as unknown as ComprasSettings
}

function renderPanel(order = makeOrder()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseOrderPaymentsPanel order={order} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.payments.list.mockResolvedValue({ data: [] })
  mockedComprasApi.settings.get.mockResolvedValue(makeSettings())
  mockedUseAuthStore.mockReturnValue(1 as never)
})

describe('PurchaseOrderPaymentsPanel (SCRUM-252)', () => {
  it('valida en vivo: monto parcial muestra el saldo restante', async () => {
    renderPanel(makeOrder({ total_amount: 100, paid_amount: 0 }))
    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.registerPayment')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:orders.detail.payments.registerPayment'))
    fireEvent.change(screen.getByPlaceholderText('compras:orders.detail.payments.amount'), { target: { value: '40' } })

    expect(screen.getByText('compras:orders.detail.payments.livePreview.partial amount=40.00,remaining=60.00')).toBeInTheDocument()
  })

  it('valida en vivo: monto que cubre el saldo muestra pago completo', async () => {
    renderPanel(makeOrder({ total_amount: 100, paid_amount: 0 }))
    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.registerPayment')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:orders.detail.payments.registerPayment'))
    fireEvent.change(screen.getByPlaceholderText('compras:orders.detail.payments.amount'), { target: { value: '100' } })

    expect(screen.getByText('compras:orders.detail.payments.livePreview.complete')).toBeInTheDocument()
  })

  it('valida en vivo: monto que excede el saldo lo avisa y bloquea Guardar', async () => {
    renderPanel(makeOrder({ total_amount: 100, paid_amount: 0 }))
    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.registerPayment')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:orders.detail.payments.registerPayment'))
    fireEvent.change(screen.getByPlaceholderText('compras:orders.detail.payments.amount'), { target: { value: '150' } })

    expect(screen.getByText('compras:orders.detail.payments.livePreview.exceedsBalance balance=100.00')).toBeInTheDocument()
    expect(screen.getByText('common:actions.save').closest('button')).toBeDisabled()
  })

  it('mientras hay un cambio de monto pendiente, "Enviar a pago" y "Registrar pago" quedan deshabilitados', async () => {
    renderPanel(makeOrder({ pending_amount_change: 150, amount_change_requested_by: 2, payment_requested_at: null }))
    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.requestPayment')).toBeInTheDocument())

    expect(screen.getByText('compras:orders.detail.payments.requestPayment').closest('button')).toBeDisabled()
    expect(screen.getByText('compras:orders.detail.payments.registerPayment').closest('button')).toBeDisabled()
    expect(screen.getByText('compras:orders.detail.payments.pendingAmountChangeBlocksActions')).toBeInTheDocument()
  })

  it('"Aprobar cambio"/"Rechazar cambio" solo se muestran a Mark', async () => {
    mockedComprasApi.settings.get.mockResolvedValue(makeSettings({ mark_approver_user_id: 99 }))
    mockedUseAuthStore.mockReturnValue(1 as never) // usuario logueado (id 1) NO es Mark (99)

    renderPanel(makeOrder({ pending_amount_change: 150, amount_change_requested_by: 1 }))

    await waitFor(() => expect(screen.getByText(/pendingAmountChange amount/)).toBeInTheDocument())
    // Esperar a que compras/settings resuelva (isMark depende de mark_approver_user_id real, no
    // se evalúa antes de tener la respuesta) antes de confirmar la ausencia de los botones.
    await waitFor(() => expect(mockedComprasApi.settings.get).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('compras:orders.detail.payments.approveAmountChange')).not.toBeInTheDocument())
    expect(screen.queryByText('compras:orders.detail.payments.rejectAmountChange')).not.toBeInTheDocument()
  })

  it('Mark sí ve "Aprobar cambio"/"Rechazar cambio" y puede rechazar', async () => {
    mockedComprasApi.settings.get.mockResolvedValue(makeSettings({ mark_approver_user_id: 99 }))
    mockedUseAuthStore.mockReturnValue(99 as never) // usuario logueado ES Mark
    mockedComprasApi.orders.rejectAmountChange.mockResolvedValue({ total_amount: 100 })

    renderPanel(makeOrder({ pending_amount_change: 150, amount_change_requested_by: 1 }))

    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.approveAmountChange')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.detail.payments.rejectAmountChange')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:orders.detail.payments.rejectAmountChange'))
    await waitFor(() => expect(mockedComprasApi.orders.rejectAmountChange).toHaveBeenCalledWith(12))
  })
})
