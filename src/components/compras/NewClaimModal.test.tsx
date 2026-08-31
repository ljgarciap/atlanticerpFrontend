import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewClaimModal from './NewClaimModal'
import { comprasApi } from '@/api/comprasApi'
import type { PurchaseOrderDetail } from '@/types/compras'

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
    orders: { list: vi.fn(), get: vi.fn() },
    claims: { create: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeOrder(overrides: Partial<PurchaseOrderDetail> = {}): PurchaseOrderDetail {
  return {
    id: 13, provider_id: 1, provider_name: 'LightCorp', status: 'recibido',
    modality: 'directo', requires_primary_approval: false, currency: 'USD',
    total_amount: 100, created_by: 1, created_at: '2026-08-01T00:00:00Z',
    shipping_type: null, shipping_cost: null, estimated_arrival_date: null,
    actual_arrival_date: null, who_pays_shipping: null,
    liquidation_agency_id: null, liquidation_agency_name: null,
    container_number: null, carrier: null, approved_at: null,
    pending_amount_change: null, amount_change_requested_by: null, notes: null,
    lines: [
      { id: 501, catalog_product_id: 1, description: 'Candelabro Cristal Imperial', quantity: 5, unit_cost: 45, subtotal: 225, project_id: null, project_name: null },
    ],
    ...overrides,
  } as unknown as PurchaseOrderDetail
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NewClaimModal onClose={vi.fn()} onCreated={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NewClaimModal (SCRUM-260)', () => {
  it('muestra "De X unidades pedidas" y calcula el Monto en disputa al declarar unidades afectadas', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [{ id: 13, provider_name: 'LightCorp' }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    } as never)
    mockedComprasApi.orders.get.mockResolvedValue(makeOrder())

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('compras:claims.new.searchOrder'), { target: { value: '13' } })
    await waitFor(() => expect(screen.getByText(/LightCorp/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/LightCorp/))

    await waitFor(() => expect(screen.getByText('Candelabro Cristal Imperial')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))

    // Default affected quantity is '1' as soon as the checkbox is checked.
    expect(screen.getByText('compras:claims.new.unitsOrderedNote qty=5')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument() // 1 unit x $45

    const qtyInput = screen.getByDisplayValue('1')
    fireEvent.change(qtyInput, { target: { value: '2' } })
    expect(screen.getByText('$90.00')).toBeInTheDocument() // 2 units x $45
  })

  it('"Tipo de resolución" es un desplegable con las 5 opciones fijas, no texto libre', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [{ id: 13, provider_name: 'LightCorp' }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    } as never)
    mockedComprasApi.orders.get.mockResolvedValue(makeOrder())
    mockedComprasApi.claims.create.mockResolvedValue({ id: 1 } as never)

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('compras:claims.new.searchOrder'), { target: { value: '13' } })
    await waitFor(() => expect(screen.getByText(/LightCorp/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/LightCorp/))
    await waitFor(() => expect(screen.getByText('Candelabro Cristal Imperial')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))

    const select = screen.getByText('compras:claims.new.expectedResolutionPlaceholder').closest('select')
    expect(select).not.toBeNull()
    const optionValues = Array.from(select!.querySelectorAll('option')).map(o => o.getAttribute('value'))
    expect(optionValues).toEqual(['', 'reposicion', 'nota_credito_favor', 'nota_credito_reembolso', 'envio_repuestos', 'negado'])

    fireEvent.change(select!, { target: { value: 'nota_credito_reembolso' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedComprasApi.claims.create).toHaveBeenCalledWith(
      expect.objectContaining({ expected_resolution: 'nota_credito_reembolso' }),
    ))
  })

  // SCRUM-260 (rebote de Gerencia Test 2026-08-12) — "Unidades afectadas" volvía a permitir
  // superar la cantidad pedida (max={} del <input> no bloquea un valor tecleado a mano, y
  // canSubmit solo chequeaba > 0). Ahora debe bloquear el guardado y mostrar el mensaje real.
  it('rebote 2026-08-12 — no permite guardar con unidades afectadas por encima de lo pedido', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [{ id: 13, provider_name: 'LightCorp' }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    } as never)
    mockedComprasApi.orders.get.mockResolvedValue(makeOrder())

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('compras:claims.new.searchOrder'), { target: { value: '13' } })
    await waitFor(() => expect(screen.getByText(/LightCorp/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/LightCorp/))
    await waitFor(() => expect(screen.getByText('Candelabro Cristal Imperial')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))

    const qtyInput = screen.getByDisplayValue('1')
    // La orden pidió 5 unidades (ver makeOrder) — 6 debe quedar bloqueado, no solo "> 0".
    fireEvent.change(qtyInput, { target: { value: '6' } })

    expect(screen.getByText('compras:claims.new.maxExceeded max=5')).toBeInTheDocument()
    expect(screen.getByText('common:actions.save').closest('button')).toBeDisabled()
  })

  it('rebote 2026-08-12 — una cantidad dentro del máximo permite guardar con normalidad', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [{ id: 13, provider_name: 'LightCorp' }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    } as never)
    mockedComprasApi.orders.get.mockResolvedValue(makeOrder())

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('compras:claims.new.searchOrder'), { target: { value: '13' } })
    await waitFor(() => expect(screen.getByText(/LightCorp/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/LightCorp/))
    await waitFor(() => expect(screen.getByText('Candelabro Cristal Imperial')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))

    const qtyInput = screen.getByDisplayValue('1')
    fireEvent.change(qtyInput, { target: { value: '5' } })

    expect(screen.queryByText(/compras:claims.new.maxExceeded/)).not.toBeInTheDocument()
    expect(screen.getByText('common:actions.save').closest('button')).not.toBeDisabled()
  })

  // SCRUM-260 (rebote de Gerencia Test 2026-08-12) — el modal era muy chico para el buscador de
  // productos; el listado de resultados usaba overflow-hidden (recortaba resultados en vez de
  // permitir scroll).
  it('rebote 2026-08-12 — el listado de resultados de la búsqueda de orden permite scroll en vez de recortarse', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [
        { id: 13, provider_name: 'LightCorp' },
        { id: 14, provider_name: 'QA Prov Beta' },
      ],
      meta: { total: 2, per_page: 5, current_page: 1, last_page: 1 },
    } as never)

    renderModal()

    fireEvent.change(screen.getByPlaceholderText('compras:claims.new.searchOrder'), { target: { value: 'a' } })
    await waitFor(() => expect(screen.getByText(/LightCorp/)).toBeInTheDocument())

    const list = screen.getByText(/LightCorp/).closest('ul')
    expect(list).not.toBeNull()
    expect(list?.className).toMatch(/overflow-y-auto/)
    expect(list?.className).not.toMatch(/overflow-hidden/)
  })
})
