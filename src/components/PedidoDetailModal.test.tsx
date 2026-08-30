import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PedidoDetailModal from './PedidoDetailModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { OrderDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { orders: { get: vi.fn() } },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 1, folio: 'COT-1007',
    master_client: { id: 1, name: 'Banco Nacional de Panamá' },
    sales_project: { id: 1, name: 'Oficinas Banco Nacional' },
    amount: 54300, approved_at: '2026-01-15T00:00:00Z',
    quoted_margin: 40, invoiced_margin: 33, invoiced_partial: false, estado: 'bajo',
    owner: { id: 1, name: 'Laura Fábrega' },
    items: [
      {
        reference: 'IL-DEC-1420B', brand: '770 LIGHTS', description: 'Colgante decorativo',
        quantity: 27, unit_price: 1985, quoted_cost: 1191, quoted_margin: 40,
        invoiced_cost: 1238.5, invoiced_margin: 37.6, margin_diff_pts: -2.4, pending_purchase: false,
      },
    ],
    quoted_cost_total: 32157, invoiced_cost_total: 33439.5, pending_count: 0, item_count: 1,
    ...overrides,
  }
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PedidoDetailModal orderId={1} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PedidoDetailModal', () => {
  it('muestra folio y cliente en el encabezado', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail())
    renderModal()

    expect(await screen.findByText('COT-1007 — Banco Nacional de Panamá')).toBeInTheDocument()
  })

  it('estado "bajo" muestra la alerta roja con el cambio de margen', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail({ estado: 'bajo', quoted_margin: 40, invoiced_margin: 33 }))
    renderModal()

    await screen.findByText(/COT-1007/)
    expect(screen.getByText(/ventasDiseno:orders\.detail\.alertDrop/)).toBeInTheDocument()
  })

  it('estado "mejoro" muestra la confirmación verde', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail({ estado: 'mejoro', quoted_margin: 40, invoiced_margin: 42 }))
    renderModal()

    await screen.findByText(/COT-1007/)
    expect(screen.getByText(/ventasDiseno:orders\.detail\.alertImprove/)).toBeInTheDocument()
  })

  it('estado "igual" no muestra ninguna alerta', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail({ estado: 'igual', quoted_margin: 40, invoiced_margin: 40 }))
    renderModal()

    await screen.findByText(/COT-1007/)
    expect(screen.queryByText(/ventasDiseno:orders\.detail\.alertDrop/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ventasDiseno:orders\.detail\.alertImprove/)).not.toBeInTheDocument()
  })

  it('producto pendiente de compra muestra — y "Pendiente de compra" en la diferencia', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail({
      estado: 'pendiente', invoiced_margin: null, pending_count: 1,
      items: [{
        reference: 'IL-DEC-1420B', brand: '770 LIGHTS', description: 'Colgante decorativo',
        quantity: 8, unit_price: 1985, quoted_cost: 1191, quoted_margin: 40,
        invoiced_cost: null, invoiced_margin: null, margin_diff_pts: null, pending_purchase: true,
      }],
    }))
    renderModal()

    await screen.findByText(/COT-1007/)
    expect(screen.getByText('ventasDiseno:orders.detail.table.pending')).toBeInTheDocument()
  })

  it('diferencia de margen por producto se muestra en puntos porcentuales', async () => {
    mockedApi.orders.get.mockResolvedValue(makeDetail())
    renderModal()

    expect(await screen.findByText('-2.4 pts')).toBeInTheDocument()
  })
})
