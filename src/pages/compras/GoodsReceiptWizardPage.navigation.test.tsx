import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GoodsReceiptWizardPage from './GoodsReceiptWizardPage'
import { comprasApi } from '@/api/comprasApi'
import type { GoodsReceiptOrderProducts, GoodsReceiptDetail, GoodsReceiptEligibleOrder } from '@/types/compras'

/**
 * Hallazgo de Pre-QA en vivo (2026-07-20): al navegar desde la pantalla de éxito hacia "Corregir
 * ingreso", ambas rutas (/compras/ingresos/nuevo y /compras/ingresos/:id/editar) renderizan el
 * MISMO componente — React Router no lo remonta, así que el estado local (`savedId`) sobrevivía
 * y la pantalla de éxito quedaba pegada para siempre en vez de mostrar el formulario de edición.
 * Este test, a propósito, NO mockea useNavigate (a diferencia de GoodsReceiptWizardPage.test.tsx)
 * — necesita la navegación real de react-router para poder reproducir el bug.
 */

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
    warehouses: { list: vi.fn() },
    goodsReceipts: {
      eligibleOrders: vi.fn(), orderProducts: vi.fn(), list: vi.fn(), get: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeOrderProducts(overrides: Partial<GoodsReceiptOrderProducts> = {}): GoodsReceiptOrderProducts {
  return {
    id: 10, provider_id: 1, provider_name: 'LightCorp', provider_origin: 'internacional',
    status: 'en_aduana',
    products: [
      { catalog_product_id: 5, reference: 'REF-1', description: 'Bombillo E27', unit_cost: 10, expected_quantity: 10, remaining: 10 },
    ],
    ...overrides,
  }
}

function makeReceipt(overrides: Partial<GoodsReceiptDetail> = {}): GoodsReceiptDetail {
  return {
    id: 1, purchase_order_id: 10, provider_name: 'LightCorp', order_status: 'en_aduana',
    lines_count: 1, total_units: 10, editable: true, created_at: '2026-07-19T00:00:00Z',
    invoice_storage_key: null, invoice_original_filename: null,
    import_cost_total: null, freight_total: null, handling_total: null, other_costs_total: null,
    lines: [{
      id: 1, catalog_product_id: 5, reference: 'REF-1', description: 'Bombillo E27',
      quantity: 10, unit_cost: 10, itbms_amount: null, import_cost_share: null, freight_cost_share: null, handling_cost_share: null, other_cost_share: null, cost_total: 100, warehouse_id: 1, warehouse_name: 'Illuminations',
      is_pending: true,
    }],
    ...overrides,
  }
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/compras/ingresos/nuevo']}>
        <Routes>
          <Route path="/compras/ingresos/nuevo" element={<GoodsReceiptWizardPage />} />
          <Route path="/compras/ingresos/:id/editar" element={<GoodsReceiptWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.warehouses.list.mockResolvedValue({ data: [{ id: 1, name: 'Illuminations' }] })
})

describe('GoodsReceiptWizardPage — navegación real éxito → corregir (regresión Pre-QA 2026-07-20)', () => {
  it('clic en "Corregir ingreso" navega a /editar y muestra el formulario, no se queda pegado en la pantalla de éxito', async () => {
    const eligible: GoodsReceiptEligibleOrder[] = [{ id: 10, provider_name: 'LightCorp', status: 'en_aduana' }]
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({ data: eligible })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.create.mockResolvedValue(makeReceipt({ id: 42 }))
    mockedComprasApi.goodsReceipts.get.mockResolvedValue(makeReceipt({ id: 42 }))

    renderApp()

    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText(/#10 — LightCorp/))
    await screen.findByText('Bombillo E27')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.actions.save'))

    expect(await screen.findByText('compras:goodsReceipts.wizard.success.title')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.success.correct'))

    // Antes del fix: seguía mostrando la pantalla de éxito para siempre (savedId nunca se reseteaba).
    await waitFor(() => expect(screen.queryByText('compras:goodsReceipts.wizard.success.title')).not.toBeInTheDocument())
    expect(await screen.findByText('compras:goodsReceipts.wizard.editTitle')).toBeInTheDocument()
    expect(mockedComprasApi.goodsReceipts.get).toHaveBeenCalledWith(42)
  })
})
