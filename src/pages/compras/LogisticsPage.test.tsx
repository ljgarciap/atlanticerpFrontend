import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LogisticsPage from './LogisticsPage'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { PurchaseOrderDetail, PurchaseOrderSummary, PurchaseOrderDocument } from '@/types/compras'

// B3 (Senior Review 2026-07-16): los 2 campos editables inline (contenedor/naviera) arrancaban
// siempre vacíos porque el listado de Logística (PurchaseOrderSummary) nunca traía esos campos —
// solo el detalle los expone. Un blur sin editar mandaba `null`, pisando silenciosamente un valor
// ya guardado. Este archivo no existía antes de este fix (S3 del mismo review). "Llegada real"
// dejó de ser un campo editable acá (REQ-153 RN3/RN4, SCRUM-216, corrección 2026-08-05) — ver el
// describe de REQ-154 más abajo.

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))
const mockedStore = vi.mocked(useAuthStore)

// usePermission('compras.edit') gatea el botón de avance (REQ-154 RN7) — mismo patrón que
// OrderDetailPage.test.tsx. Default: sin usuario logueado (permissions null) => canAdvance false,
// consistente con lo que ya asumían los tests existentes de este archivo (ninguno afirmaba sobre
// el botón de avance).
function mockAuthState(permissions: string[] | null = null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: permissions === null ? null : { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'object' && opts && 'count' in opts ? `${key} ${(opts as { count: number }).count}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { list: vi.fn() },
    orders: { list: vi.fn(), get: vi.fn(), updateShippingInfo: vi.fn(), advance: vi.fn(), advanceRemainder: vi.fn(), confirmPendingReceipts: vi.fn() },
    documents: { list: vi.fn(), upload: vi.fn(), validate: vi.fn(), getValidation: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeSummary(overrides: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary {
  return {
    id: 42, provider_id: 1, provider_name: 'LightCorp', provider_origin: 'internacional', origin_module: null, created_by_name: 'Ana',
    status: 'en_transito', next_status: 'en_aduana', is_critical: false, modality: 'directo',
    shipping_type: 'maritimo', shipping_cost: null,
    estimated_arrival_date: '2026-08-01', requires_mark_approval: false,
    blocked_by_mark_approval: false, approved_by: null, approved_by_name: null, total_amount: 1000, currency: 'USD',
    sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
    created_at: '2026-07-01T00:00:00Z', status_changed_at: '2026-07-05T00:00:00Z',
    payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null, last_payment_date: null,
    reception_status: 'pendiente', shows_goods_receipt_link: false, pending_remainder_status: null,
    // REQ-154 (SCRUM-217) — timeline de Logística.
    ordenado_at: '2026-07-05', en_transito_at: '2026-07-10', en_aduana_at: null, en_transito_local_at: null,
    actual_arrival_date: null,
    ...overrides,
  }
}

function makeDetail(overrides: Partial<PurchaseOrderDetail> = {}): PurchaseOrderDetail {
  return {
    ...makeSummary(),
    who_pays_shipping: 'atlantic',
    liquidation_agency_id: null, liquidation_agency_name: null,
    container_number: null, carrier: null, approved_at: null,
    pending_amount_change: null, amount_change_requested_by: null,
    notes: null, lines: [],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LogisticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthState(null)
  mockedComprasApi.providers.list.mockResolvedValue({
    fuzzy: false,
    kpis: { total_providers: 0, average_rating: null, low_rating_count: 0, active_categories: 0, categories: [] },
    data: [],
    meta: { total: 0, per_page: 100, current_page: 1, last_page: 1 },
  })
  mockedComprasApi.documents.list.mockResolvedValue({ data: [] })
  mockedComprasApi.documents.getValidation.mockResolvedValue({ id: null, status: null, result: null, error: null })
})

function makeDocument(overrides: Partial<PurchaseOrderDocument> = {}): PurchaseOrderDocument {
  return {
    id: 7, category: 'confirmacion_proveedor', original_filename: 'confirmacion.pdf',
    url: 'https://s3.example/confirmacion.pdf', created_at: '2026-07-17T00:00:00Z',
    ...overrides,
  }
}

describe('LogisticsPage — sincronización de contenedor/naviera (B3)', () => {
  it('carga con los valores ya guardados en el backend, no en blanco', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ actual_arrival_date: '2026-07-20' })], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      container_number: 'CONT-123', carrier: 'Maersk', actual_arrival_date: '2026-07-20',
    }))

    renderPage()

    await waitFor(() => expect(screen.getByDisplayValue('CONT-123')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Maersk')).toBeInTheDocument()
    // REQ-153 RN3/RN4 — "Llegada real" es texto de solo lectura, no un <input> (ver describe
    // dedicado más abajo para la cobertura completa de este comportamiento).
    expect(screen.getByText('2026-07-20')).toBeInTheDocument()
  })

  it('un blur sin cambios NO dispara ninguna actualización', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      container_number: 'CONT-123', carrier: 'Maersk', actual_arrival_date: '2026-07-20',
    }))

    renderPage()

    const containerInput = await screen.findByDisplayValue('CONT-123')
    fireEvent.focus(containerInput)
    fireEvent.blur(containerInput)

    // Le damos tiempo a un posible (indebido) disparo async antes de afirmar que no pasó.
    await waitFor(() => expect(mockedComprasApi.orders.get).toHaveBeenCalled())
    expect(mockedComprasApi.orders.updateShippingInfo).not.toHaveBeenCalled()
  })

  it('un blur con un cambio real sí actualiza el campo correspondiente', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      container_number: 'CONT-123', carrier: null, actual_arrival_date: null,
    }))
    mockedComprasApi.orders.updateShippingInfo.mockResolvedValue(makeDetail({
      container_number: 'CONT-999', carrier: null, actual_arrival_date: null,
    }))

    renderPage()

    const containerInput = await screen.findByDisplayValue('CONT-123')
    fireEvent.change(containerInput, { target: { value: 'CONT-999' } })
    fireEvent.blur(containerInput)

    await waitFor(() => expect(mockedComprasApi.orders.updateShippingInfo).toHaveBeenCalledWith(
      42, expect.objectContaining({ container_number: 'CONT-999' }),
    ))
  })

  it('un blur en un campo vacío que sigue vacío NO manda null pisando otro campo', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      container_number: null, carrier: 'Maersk', actual_arrival_date: null,
    }))

    renderPage()

    await screen.findByDisplayValue('Maersk')
    const carrierInput = screen.getByDisplayValue('Maersk')
    fireEvent.focus(carrierInput)
    fireEvent.blur(carrierInput)

    await waitFor(() => expect(mockedComprasApi.orders.get).toHaveBeenCalled())
    expect(mockedComprasApi.orders.updateShippingInfo).not.toHaveBeenCalled()
  })
})

describe('LogisticsPage — validación con IA del documento de confirmación (SCRUM-211)', () => {
  it('un documento de otra categoría no muestra el botón Validar', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument({ category: 'factura_comercial' })] })

    renderPage()

    await screen.findByText('compras:logistics.documents.category.factura_comercial')
    expect(screen.queryByText('compras:logistics.providerConfirmation.validate')).not.toBeInTheDocument()
  })

  it('un documento de confirmación de proveedor sin validar muestra el botón Validar', async () => {
    // SCRUM-773 — ProviderConfirmationPanel ahora exige compras.edit.
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument()] })

    renderPage()

    expect(await screen.findByText('compras:logistics.providerConfirmation.validate')).toBeInTheDocument()
  })

  it('click en Validar dispara la mutación con la orden y el documento correctos', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument()] })
    mockedComprasApi.documents.validate.mockResolvedValue({ job_id: 'job-1' })

    renderPage()

    fireEvent.click(await screen.findByText('compras:logistics.providerConfirmation.validate'))

    await waitFor(() => expect(mockedComprasApi.documents.validate).toHaveBeenCalledWith(42, 7))
  })

  it('cuando la validación completa y coincide, muestra el mensaje de coincidencia', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument()] })
    mockedComprasApi.documents.getValidation.mockResolvedValue({
      id: 'job-1', status: 'completed', error: null,
      result: { matches_order: true, discrepancies: [], confidence: 'alta' },
    })

    renderPage()

    expect(await screen.findByText('compras:logistics.providerConfirmation.matches')).toBeInTheDocument()
  })

  it('cuando la validación completa con discrepancias, las lista', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument()] })
    mockedComprasApi.documents.getValidation.mockResolvedValue({
      id: 'job-1', status: 'completed', error: null,
      result: {
        matches_order: false,
        discrepancies: [{ campo: 'cantidad', esperado: '10', encontrado: '8' }],
        confidence: 'media',
      },
    })

    renderPage()

    expect(await screen.findByText('compras:logistics.providerConfirmation.discrepanciesTitle')).toBeInTheDocument()
    expect(screen.getByText('compras:logistics.providerConfirmation.field.cantidad:')).toBeInTheDocument()
  })

  it('SCRUM-773 — sin compras.edit, el documento se ve pero no aparece el botón Validar', async () => {
    mockAuthState(['compras.read', 'compras.limited.view'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [makeDocument()] })

    renderPage()

    await screen.findByText('compras:logistics.documents.category.confirmacion_proveedor')
    expect(screen.queryByText('compras:logistics.providerConfirmation.validate')).not.toBeInTheDocument()
  })
})

describe('LogisticsPage — subir documento exige compras.edit (SCRUM-773)', () => {
  it('sin compras.edit, no aparecen los controles para subir un documento', async () => {
    mockAuthState(['compras.read', 'compras.limited.view'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })

    renderPage()

    await screen.findByText('LightCorp')
    expect(screen.queryByText('compras:logistics.documents.upload')).not.toBeInTheDocument()
  })

  it('con compras.edit, aparecen los controles para subir un documento', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary()], filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })

    renderPage()

    expect(await screen.findByText('compras:logistics.documents.upload')).toBeInTheDocument()
  })
})

describe('LogisticsPage — Recepción y enlace a Ingreso de Mercancía (REQ-157/158)', () => {
  it('muestra la etiqueta de Recepción de la orden', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ reception_status: 'parcial' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ reception_status: 'parcial' }))

    renderPage()

    expect(await screen.findByText('compras:reception.status.parcial')).toBeInTheDocument()
  })

  it('el enlace "Ingreso de mercancía" solo aparece cuando shows_goods_receipt_link es true', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ shows_goods_receipt_link: false })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ shows_goods_receipt_link: false }))

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:logistics.card.goodsReceiptLink')).not.toBeInTheDocument()
  })

  it('click en el enlace navega a Ingreso de Mercancía con la orden preseleccionada', async () => {
    // SCRUM-773 (CA2) — el enlace ahora exige compras.edit (antes no tenía ningún check propio).
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, shows_goods_receipt_link: true })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, shows_goods_receipt_link: true }))

    renderPage()

    const link = await screen.findByText('compras:logistics.card.goodsReceiptLink')
    fireEvent.click(link)

    expect(navigateMock).toHaveBeenCalledWith('/compras/ingresos/nuevo', { state: { orderId: 42 } })
  })
})

describe('LogisticsPage — línea de tiempo del envío (REQ-154)', () => {
  it('proveedor normal dibuja los 5 pasos, con "Salió de origen" como primer paso', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ provider_origin: 'internacional', status: 'en_transito' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ provider_origin: 'internacional', status: 'en_transito' }))

    renderPage()

    await waitFor(() => expect(screen.getByTestId('shipment-timeline')).toBeInTheDocument())
    expect(screen.getByTestId('timeline-step-ordenado')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-en_transito')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-en_aduana')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-en_transito_local')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-recibido')).toBeInTheDocument()
    expect(screen.getByText('compras:logistics.timeline.stepLabel.salioDeOrigen')).toBeInTheDocument()
  })

  it('proveedor local dibuja solo 3 pasos (salta en_transito/en_aduana), primer paso "Ordenado"', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ provider_origin: 'local', status: 'ordenado', next_status: 'en_transito_local' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      provider_origin: 'local', status: 'ordenado', next_status: 'en_transito_local',
    }))

    renderPage()

    await waitFor(() => expect(screen.getByTestId('shipment-timeline')).toBeInTheDocument())
    expect(screen.getByTestId('timeline-step-ordenado')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-en_transito_local')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-step-recibido')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-step-en_transito')).not.toBeInTheDocument()
    expect(screen.queryByTestId('timeline-step-en_aduana')).not.toBeInTheDocument()
    // El primer paso de la secuencia local se llama "Ordenado" (mismo status, etiqueta reusada de
    // compras:orders.status.ordenado), NO "Salió de origen".
    expect(screen.queryByText('compras:logistics.timeline.stepLabel.salioDeOrigen')).not.toBeInTheDocument()
  })

  it('el paso actual queda marcado "current" y los pasos ya completados "done"', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        provider_origin: 'internacional', status: 'en_aduana', next_status: 'en_transito_local',
        ordenado_at: '2026-07-01', en_transito_at: '2026-07-05', en_aduana_at: '2026-07-10',
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      provider_origin: 'internacional', status: 'en_aduana', next_status: 'en_transito_local',
      ordenado_at: '2026-07-01', en_transito_at: '2026-07-05', en_aduana_at: '2026-07-10',
    }))

    renderPage()

    await waitFor(() => expect(screen.getByTestId('timeline-step-en_aduana')).toBeInTheDocument())
    expect(screen.getByTestId('timeline-step-ordenado')).toHaveAttribute('data-state', 'done')
    expect(screen.getByTestId('timeline-step-en_transito')).toHaveAttribute('data-state', 'done')
    expect(screen.getByTestId('timeline-step-en_aduana')).toHaveAttribute('data-state', 'current')
    expect(screen.getByTestId('timeline-step-en_transito_local')).toHaveAttribute('data-state', 'pending')
    expect(screen.getByTestId('timeline-step-recibido')).toHaveAttribute('data-state', 'pending')
  })

  /**
   * Senior Review (batch fusionado SCRUM-216/217, 2026-08-05) — edge case explícito: una orden
   * sembrada directo con status='recibido' sin haber pasado nunca por advance() (ej. fixture
   * vieja, dato migrado a mano) tiene las 4 columnas nuevas en null. El timeline no debe romper
   * visualmente — muestra lo que tiene (el paso "Recibido" como completado, el resto con "—") y ya.
   */
  it('una orden vieja en "recibido" sin fechas de etapa no rompe el timeline', async () => {
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({
        provider_origin: 'internacional', status: 'recibido', next_status: null,
        ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
        actual_arrival_date: null,
      })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      provider_origin: 'internacional', status: 'recibido', next_status: null,
      ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
      actual_arrival_date: null,
    }))

    renderPage()

    await waitFor(() => expect(screen.getByTestId('shipment-timeline')).toBeInTheDocument())
    expect(screen.getByTestId('timeline-step-recibido')).toHaveAttribute('data-state', 'done')
    expect(screen.getByText('compras:logistics.card.noNextStage')).toBeInTheDocument()
  })
})

describe('LogisticsPage — botón de avance solo para Compras (REQ-154 RN7)', () => {
  it('sin permiso compras.edit, el botón de avance no está en el DOM', async () => {
    mockAuthState(['compras.read'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ next_status: 'en_aduana' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ next_status: 'en_aduana' }))

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText(/compras:logistics.card.completeStage/)).not.toBeInTheDocument()
  })

  it('con permiso compras.edit, el botón de avance se muestra y dispara la mutación', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, next_status: 'en_aduana' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, next_status: 'en_aduana' }))
    mockedComprasApi.orders.advance.mockResolvedValue(makeDetail({ id: 42, status: 'en_aduana', next_status: 'en_transito_local' }))

    renderPage()

    const button = await screen.findByText(/compras:logistics.card.completeStage/)
    fireEvent.click(button)

    await waitFor(() => expect(mockedComprasApi.orders.advance).toHaveBeenCalledWith(42))
  })

  it('sin siguiente etapa (Recibido), el botón no aparece ni con permiso', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ status: 'recibido', next_status: null })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ status: 'recibido', next_status: null }))

    renderPage()

    await waitFor(() => expect(screen.getByText('compras:logistics.card.noNextStage')).toBeInTheDocument())
    expect(screen.queryByText(/compras:logistics.card.completeStage/)).not.toBeInTheDocument()
  })
})

// SCRUM-208 (rediseño 2026-08-15, docs/architecture/scrum208-recepcion-parcial-rediseno.md) —
// antes de este fix, esta pantalla nunca deshabilitaba "Completar etapa" cuando el paso final era
// "Recibido" con remanente pendiente, ni mostraba el error del 422 resultante — el botón quedaba
// clickeable "sin generar ninguna acción" (reporte real de Daniela Amaya, con video adjunto en
// SCRUM-208). Endpoint `advance-remainder` todavía sin contraparte real en el backend al momento
// de este commit — estos tests cubren solo el contrato/comportamiento del frontend.
describe('LogisticsPage — remanente pendiente (SCRUM-208, rediseño 2026-08-15)', () => {
  it('con remanente pendiente pero next_status intermedio, el botón de avance NO se deshabilita', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ next_status: 'en_transito', pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ next_status: 'en_transito', pending_remainder_status: 'ordenado' }))

    renderPage()

    const button = await screen.findByText(/compras:logistics.card.completeStage/)
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('con remanente pendiente y next_status=recibido, el botón de avance se deshabilita y no dispara la mutación', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ next_status: 'recibido', pending_remainder_status: 'en_transito_local' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ next_status: 'recibido', pending_remainder_status: 'en_transito_local' }))

    renderPage()

    const button = await screen.findByText(/compras:logistics.card.completeStage/)
    expect(button.closest('button')).toBeDisabled()

    fireEvent.click(button)
    expect(mockedComprasApi.orders.advance).not.toHaveBeenCalled()
  })

  it('sin remanente pendiente, no muestra el aviso ni el botón de avanzar remanente', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ pending_remainder_status: null })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: null }))

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.advanceRemainderCta')).toBeNull()
  })

  it('SCRUM-773 (CA3) — sin compras.edit, con remanente pendiente, no muestra "Ingresar a Inventario" ni "Completar etapa del remanente"', async () => {
    mockAuthState(['compras.read', 'compras.limited.view'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.confirmPendingReceiptsCta')).toBeNull()
    expect(screen.queryByText('compras:orders.actions.advanceRemainderCta')).toBeNull()
  })

  it('con remanente pendiente, el botón de avanzar remanente dispara advanceRemainder con el id de la orden', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.advanceRemainder.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: 'salio_de_origen' }))

    renderPage()

    const button = await screen.findByText('compras:orders.actions.advanceRemainderCta')
    fireEvent.click(button)

    await waitFor(() => expect(mockedComprasApi.orders.advanceRemainder).toHaveBeenCalledWith(42))
  })

  it('si advanceRemainder falla, muestra el mensaje de error dentro del propio aviso ámbar', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.advanceRemainder.mockRejectedValue(new Error('network error'))

    renderPage()

    const button = await screen.findByText('compras:orders.actions.advanceRemainderCta')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('compras:orders.errors.advanceRemainderGeneric')).toBeInTheDocument())
  })
})

// SCRUM-208 (rediseño 2026-08-15, backend ya implementado) — "Ingresar a Inventario" acotado a
// esta orden, root cause real del reporte de Daniela.
describe('LogisticsPage — confirmar pendientes a Inventario (SCRUM-208, rediseño 2026-08-15)', () => {
  it('con remanente pendiente, muestra el botón de Ingresar a Inventario junto al de avanzar remanente', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))

    renderPage()

    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.confirmPendingReceiptsCta')).toBeInTheDocument()
    expect(screen.getByText('compras:orders.actions.advanceRemainderCta')).toBeInTheDocument()
  })

  it('clic en el botón dispara confirmPendingReceipts con el id de la orden', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.confirmPendingReceipts.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: null }))

    renderPage()

    const button = await screen.findByText('compras:orders.actions.confirmPendingReceiptsCta')
    fireEvent.click(button)

    await waitFor(() => expect(mockedComprasApi.orders.confirmPendingReceipts).toHaveBeenCalledWith(42))
  })

  it('si confirmPendingReceipts falla, muestra el mensaje de error dentro del propio aviso ámbar', async () => {
    mockAuthState(['compras.read', 'compras.edit'])
    mockedComprasApi.orders.list.mockResolvedValue({
      data: [makeSummary({ id: 42, pending_remainder_status: 'ordenado' })],
      filters: { creators: [] },
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ id: 42, pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.confirmPendingReceipts.mockRejectedValue(new Error('network error'))

    renderPage()

    const button = await screen.findByText('compras:orders.actions.confirmPendingReceiptsCta')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('compras:orders.errors.confirmPendingReceiptsGeneric')).toBeInTheDocument())
  })
})
