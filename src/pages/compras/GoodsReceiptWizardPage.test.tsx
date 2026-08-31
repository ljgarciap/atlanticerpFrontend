import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GoodsReceiptWizardPage from './GoodsReceiptWizardPage'
import { comprasApi } from '@/api/comprasApi'
import type {
  GoodsReceiptOrderProducts, GoodsReceiptDetail, GoodsReceiptEligibleOrder,
} from '@/types/compras'

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
    warehouses: { list: vi.fn() },
    goodsReceipts: {
      eligibleOrders: vi.fn(), orderProducts: vi.fn(), list: vi.fn(), get: vi.fn(),
      create: vi.fn(), update: vi.fn(),
      uploadInvoice: vi.fn(), getInvoiceMatch: vi.fn(),
    },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeOrderProducts(overrides: Partial<GoodsReceiptOrderProducts> = {}): GoodsReceiptOrderProducts {
  return {
    id: 10, provider_id: 1, provider_name: 'LightCorp', provider_origin: 'internacional',
    status: 'en_aduana',
    products: [
      { catalog_product_id: 5, reference: 'REF-1', description: 'Bombillo E27', unit_cost: 10, expected_quantity: 120, remaining: 120 },
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
      quantity: 10, unit_cost: 10, itbms_amount: null, import_cost_share: null, freight_cost_share: null, handling_cost_share: null, other_cost_share: null, cost_total: 100, warehouse_id: 1, warehouse_name: 'Atlantic',
      is_pending: true,
    }],
    ...overrides,
  }
}

function renderCreate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/compras/ingresos/nuevo']}>
        <Routes>
          <Route path="/compras/ingresos/nuevo" element={<GoodsReceiptWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderEdit(id: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/compras/ingresos/${id}/editar`]}>
        <Routes>
          <Route path="/compras/ingresos/:id/editar" element={<GoodsReceiptWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.warehouses.list.mockResolvedValue({ data: [{ id: 1, name: 'Atlantic' }] })
})

describe('GoodsReceiptWizardPage — crear (SCRUM-220→230)', () => {
  it('al elegir una orden, precarga los productos esperados con su cantidad completa', async () => {
    const eligible: GoodsReceiptEligibleOrder[] = [{ id: 10, provider_name: 'LightCorp', status: 'en_aduana' }]
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({ data: eligible })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())

    renderCreate()

    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText(/#10 — LightCorp/))

    expect(await screen.findByText('Bombillo E27')).toBeInTheDocument()
    expect(screen.getByDisplayValue('120')).toBeInTheDocument()
  })

  it('proveedor no local muestra los 4 campos de desglose y los envía al guardar', async () => {
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({
      data: [{ id: 10, provider_name: 'LightCorp', status: 'en_aduana' }],
    })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.create.mockResolvedValue(makeReceipt())

    renderCreate()
    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText(/#10 — LightCorp/))
    await screen.findByText('Bombillo E27')

    fireEvent.change(screen.getByLabelText('compras:goodsReceipts.wizard.costing.freightTotal'), { target: { value: '300' } })
    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '20' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })

    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.actions.save'))

    await waitFor(() => expect(mockedComprasApi.goodsReceipts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        purchase_order_id: 10,
        freight_total: 300,
        lines: [{ catalog_product_id: 5, quantity: 20, unit_cost: 10, warehouse_id: 1 }],
      }),
    ))
  })

  it('proveedor local no muestra los campos de desglose, solo la nota de ITBMS', async () => {
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({
      data: [{ id: 11, provider_name: 'LocalCorp', status: 'en_transito_local' }],
    })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts({ id: 11, provider_origin: 'local', provider_name: 'LocalCorp' }))

    renderCreate()
    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '11' } })
    fireEvent.click(await screen.findByText(/#11 — LocalCorp/))

    expect(await screen.findByText('compras:goodsReceipts.wizard.costing.localNote')).toBeInTheDocument()
    expect(screen.queryByLabelText('compras:goodsReceipts.wizard.costing.freightTotal')).not.toBeInTheDocument()
  })

  it('REQ-165 — entrega parcial muestra el modal y reenvía con el remainder status elegido', async () => {
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({
      data: [{ id: 10, provider_name: 'LightCorp', status: 'en_aduana' }],
    })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.create
      .mockResolvedValueOnce({ requires_pending_status: true, partial: [{ catalog_product_id: 5, received: 10, expected: 120, missing: 110 }] })
      .mockResolvedValueOnce(makeReceipt())

    renderCreate()
    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText(/#10 — LightCorp/))
    await screen.findByText('Bombillo E27')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })

    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.actions.save'))

    expect(await screen.findByText('compras:goodsReceipts.wizard.partial.title')).toBeInTheDocument()
    expect(screen.getByText(/received=10,expected=120/)).toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[selects.length - 1], { target: { value: 'en_transito' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedComprasApi.goodsReceipts.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ pending_remainder_status: 'en_transito' }),
    ))
    expect(await screen.findByText('compras:goodsReceipts.wizard.success.title')).toBeInTheDocument()
  })

  it('REQ-165 (Pre-QA 2026-08-07, SCRUM-208) — el selector de remanente ofrece "ordenado" además de las 4 etapas de envío', async () => {
    // Hallazgo real del rebote de Gerencia Test (SCRUM-208, 2026-08-06): el AC pide que las
    // etapas de selección cubran "desde ordenado en adelante" — el selector solo tenía las 4
    // etapas de envío (salió de origen/en tránsito/en aduana/en tránsito local), sin ninguna
    // opción para un remanente que todavía no salió del proveedor.
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({
      data: [{ id: 10, provider_name: 'LightCorp', status: 'en_aduana' }],
    })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.create
      .mockResolvedValueOnce({ requires_pending_status: true, partial: [{ catalog_product_id: 5, received: 10, expected: 120, missing: 110 }] })
      .mockResolvedValueOnce(makeReceipt())

    renderCreate()
    fireEvent.change(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText(/#10 — LightCorp/))
    await screen.findByText('Bombillo E27')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.actions.save'))
    await screen.findByText('compras:goodsReceipts.wizard.partial.title')

    const selects = screen.getAllByRole('combobox')
    const remainderSelect = selects[selects.length - 1] as HTMLSelectElement
    const values = Array.from(remainderSelect.options).map(o => o.value).filter(Boolean)
    expect(values).toEqual(['ordenado', 'salio_de_origen', 'en_transito', 'en_aduana', 'en_transito_local'])

    fireEvent.change(remainderSelect, { target: { value: 'ordenado' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))
    await waitFor(() => expect(mockedComprasApi.goodsReceipts.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ pending_remainder_status: 'ordenado' }),
    ))
  })
})

describe('GoodsReceiptWizardPage — Paso 0, detección de factura (SCRUM-224)', () => {
  it('detecta la orden automáticamente, y "Cambiar" no la vuelve a auto-seleccionar (regresión Pre-QA 2026-07-20)', async () => {
    mockedComprasApi.goodsReceipts.eligibleOrders.mockResolvedValue({ data: [] })
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.uploadInvoice.mockResolvedValue({ job_id: 'job-1' })
    mockedComprasApi.goodsReceipts.getInvoiceMatch.mockResolvedValue({
      id: 'job-1', status: 'completed', error: null,
      result: {
        matched_order_id: 10, matched_provider_id: 1,
        lines: [{ catalog_product_id: 5, quantity: 120, unit_cost: 10 }],
        unmatched_count: 0, confidence: 'alta',
        detected_order_reference: '10', detected_provider_name: 'LightCorp',
      },
    })

    renderCreate()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['contenido'], 'factura.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.invoice.detectButton'))

    // La orden se auto-selecciona: sus productos precargan (mismo efecto que elegirla a mano).
    expect(await screen.findByText('Bombillo E27')).toBeInTheDocument()

    // El usuario decide que la detección se equivocó y presiona "Cambiar".
    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.order.change'))

    // Sin el guard por jobId, el efecto de auto-selección volvía a disparar apenas orderId
    // pasaba a null, dejando "Cambiar" sin efecto visible.
    expect(screen.queryByText('Bombillo E27')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('compras:goodsReceipts.wizard.order.searchPlaceholder')).toBeInTheDocument()
  })

  // SCRUM-224 (rebote de Gerencia Test 2026-08-12, con video) — al entrar desde Logística
  // (REQ-157, orden ya preseleccionada via location.state), el input de archivo y el botón
  // "Detectar automáticamente" desaparecían por completo (el branch `orderId === null` se volvía
  // falso de entrada) — el usuario solo podía adjuntar una factura si primero pulsaba "Cambiar"
  // para volver a poner la orden en null, exactamente al revés de lo que pide el requerimiento.
  it('rebote 2026-08-12 — con la orden ya preseleccionada (prefill de Logística), el input de adjuntar factura sigue disponible', async () => {
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/compras/ingresos/nuevo', state: { orderId: 10 } }]}>
          <Routes>
            <Route path="/compras/ingresos/nuevo" element={<GoodsReceiptWizardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // La orden ya está vinculada (viene de Logística) — sin necesidad de buscarla a mano.
    expect(await screen.findByText('Bombillo E27')).toBeInTheDocument()

    // El input de archivo y el botón de detección deben seguir visibles y funcionales, sin
    // depender de pulsar "Cambiar" primero.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(fileInput).not.toBeNull()
    expect(screen.getByText('compras:goodsReceipts.wizard.invoice.detectButton')).toBeInTheDocument()

    const file = new File(['contenido'], 'factura.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput!, { target: { files: [file] } })

    expect(screen.getByText('compras:goodsReceipts.wizard.invoice.detectButton').closest('button')).not.toBeDisabled()
  })
})

describe('GoodsReceiptWizardPage — corregir (REQ-167)', () => {
  it('precarga el registro existente y guarda con update en vez de create', async () => {
    mockedComprasApi.goodsReceipts.get.mockResolvedValue(makeReceipt())
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())
    mockedComprasApi.goodsReceipts.update.mockResolvedValue(makeReceipt())

    renderEdit(1)

    expect(await screen.findByText('Bombillo E27')).toBeInTheDocument()
    // quantity=10 y unit_cost=10 -> 2 inputs con el mismo valor mostrado.
    expect(screen.getAllByDisplayValue('10')).toHaveLength(2)

    fireEvent.click(screen.getByText('compras:goodsReceipts.wizard.actions.save'))

    await waitFor(() => expect(mockedComprasApi.goodsReceipts.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ lines: [{ catalog_product_id: 5, quantity: 10, unit_cost: 10, warehouse_id: 1 }] }),
    ))
  })

  it('bloquea el formulario si la orden ya llegó a "Recibido" (editable: false)', async () => {
    mockedComprasApi.goodsReceipts.get.mockResolvedValue(makeReceipt({ editable: false }))
    mockedComprasApi.goodsReceipts.orderProducts.mockResolvedValue(makeOrderProducts())

    renderEdit(1)

    expect(await screen.findByText('compras:goodsReceipts.wizard.notEditable')).toBeInTheDocument()
    expect(screen.queryByText('compras:goodsReceipts.wizard.actions.save')).not.toBeInTheDocument()
  })
})
