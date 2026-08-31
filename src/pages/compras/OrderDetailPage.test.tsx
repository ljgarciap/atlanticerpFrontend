import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrderDetailPage from './OrderDetailPage'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { PurchaseOrderDetail, PurchaseOrderSummary } from '@/types/compras'

// SCRUM-208 (REQ-145) — hallazgo MEDIO de Pre-QA 2026-07-16: OrderDetailPage es la página con
// más superficie de interacción del módulo Compras (avanzar estado, aprobar, editar, ver PDF,
// enviar por correo, recepción por línea) y era la única de las 3 páginas de Compras marcadas
// por el Senior Review sin ningún test automatizado (OrdersPage/LogisticsPage ya se corrigieron
// el mismo día). Este archivo no existía antes de este fix. Prioriza los flujos que Pre-QA ya
// verificó en vivo como funcionando (REQ-142/143/144), no casos nuevos.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'object' && opts && 'id' in opts ? `${key} ${(opts as { id: number }).id}` : key,
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
    orders: {
      get: vi.fn(), advance: vi.fn(), advanceRemainder: vi.fn(), confirmPendingReceipts: vi.fn(), approve: vi.fn(), update: vi.fn(),
      pdf: vi.fn(), sendEmail: vi.fn(), liquidate: vi.fn(),
      requestPayment: vi.fn(), requestAmountChange: vi.fn(), approveAmountChange: vi.fn(),
    },
    liquidationAgencies: { search: vi.fn(), create: vi.fn() },
    payments: { list: vi.fn().mockResolvedValue({ data: [] }), register: vi.fn() },
    documents: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      validate: vi.fn(),
      getValidation: vi.fn().mockResolvedValue({ status: null }),
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedComprasApi = vi.mocked(comprasApi, true)
const mockedStore = vi.mocked(useAuthStore)

// useAuthStore se usa con selector dentro de usePermission (S5, Senior Review sprint2
// 2026-07-16: el botón "Aprobar orden" se mostraba sin chequear compras.approve) — el mock
// tiene que invocar el selector, no solo devolver un objeto fijo.
function mockAuthState(permissions: string[]) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

function makeSummary(overrides: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary {
  return {
    id: 42, provider_id: 1, provider_name: 'LightCorp', provider_origin: null, origin_module: null, created_by_name: 'Ana',
    status: 'ordenado', next_status: 'en_transito', is_critical: false, modality: 'directo',
    shipping_type: 'maritimo', shipping_cost: null,
    estimated_arrival_date: '2026-08-01', requires_primary_approval: false,
    blocked_by_primary_approval: false, approved_by: null, approved_by_name: null, total_amount: 500, currency: 'USD',
    sales_project_summary: null, has_multiple_projects: false, sales_project_count: 0,
    created_at: '2026-07-01T00:00:00Z', status_changed_at: '2026-07-05T00:00:00Z',
    payment_status: 'pendiente', paid_amount: 0, payment_requested_at: null, last_payment_date: null,
    reception_status: 'pendiente', shows_goods_receipt_link: false, pending_remainder_status: null,
    // REQ-154 (SCRUM-217) — timeline de Logística.
    ordenado_at: null, en_transito_at: null, en_aduana_at: null, en_transito_local_at: null,
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
    pending_amount_change: null, amount_change_requested_by: null, notes: null,
    lines: [{
      id: 1, catalog_product_id: 5, reference: 'REF-1', factory_reference: null, description: 'Lámpara LED',
      quantity: 2, unit_cost: 150, subtotal: 300, additional_cost_percent: null,
      additional_cost_amount: null, additional_cost_type: null,
      sales_project_id: null, sales_project_name: null,
      received_quantity: 0, reception_status: 'pendiente',
    }],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/compras/ordenes/42']}>
        <Routes>
          <Route path="/compras/ordenes/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // SCRUM-771 — compras.edit gatea Avanzar/Editar/Confirmar recepción pendiente/Liquidar
  // (ver canManageOrder); default de la suite asume el perfil habitual con acceso de escritura,
  // el caso de solo-lectura (compras.read sin .edit) se cubre en el test dedicado más abajo.
  mockAuthState(['compras.approve', 'compras.edit'])
})

describe('OrderDetailPage', () => {
  it('renderiza el estado, el total y las líneas de la orden', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:orders.detail.title 42')).toBeInTheDocument())
    // SCRUM-736 — el Estado ahora vive en el "resumen de información".
    expect(screen.getByText('compras:orders.status.ordenado')).toBeInTheDocument()
    // SCRUM-736 — el total de la orden bajó junto a la tabla de líneas, en la misma línea que su
    // label ("Total: $500.00"), antes vivía solo en el grid superior junto a "Pagos a
    // Proveedores", ahora ese panel está detrás de un modal.
    expect(screen.getByText((_, el) => el?.tagName === 'DIV' && el.textContent === 'compras:newOrder.lines.total: $500.00')).toBeInTheDocument()
    expect(screen.getByText('$300.00')).toBeInTheDocument() // subtotal de la línea
    expect(screen.getByText('Lámpara LED')).toBeInTheDocument()

    // SCRUM-736 — "Pagos a Proveedores" ahora es un modal separado; al abrirlo, el mismo saldo
    // pendiente ($500.00, sin pagos registrados) aparece dentro del panel.
    fireEvent.click(screen.getByText('compras:orders.detail.payments.title'))
    await waitFor(() => expect(screen.getByText('compras:orders.detail.payments.balance')).toBeInTheDocument())
    expect(screen.getByText('$500.00')).toBeInTheDocument()
  })

  // Pre-QA 2026-08-13 (Servicios, REQ-274 RN3, SCRUM-344) — mismo gap que OrdersPage.test.tsx:
  // el detalle tampoco pintaba origin_module. Ver OriginBadge.tsx.
  it('Pre-QA REQ-274 RN3 — muestra "Origen: Servicios" en el header cuando origin_module es servicios', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ origin_module: 'servicios' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:orders.detail.title 42')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.originServicios')).toBeInTheDocument()
  })

  it('Pre-QA REQ-274 RN3 — sin badge de origen para una orden creada a mano (origin_module null)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ origin_module: null }))
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:orders.detail.title 42')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.originServicios')).not.toBeInTheDocument()
  })

  // SCRUM-736 (task 7) — regresión permanente del mismo gap que SCRUM-194 ya había corregido en
  // OrderLinesEditor.tsx (edb3edd) pero nunca en esta tabla de solo lectura: "Referencia" era una
  // sola columna combinando factory_reference/reference. Se repite acá para que un futuro cambio
  // que vuelva a fusionar las columnas rompa este test, no solo el de OrderLinesEditor.
  it('SCRUM-736 — la tabla de solo lectura separa Ref. fábrica de Referencia pública', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      lines: [{
        id: 1, catalog_product_id: 5, reference: 'PUB-REF-1', factory_reference: 'FAB-REF-1',
        description: 'Lámpara LED', quantity: 2, unit_cost: 150, subtotal: 300,
        additional_cost_percent: null, additional_cost_amount: null, additional_cost_type: null,
        sales_project_id: null, sales_project_name: null,
        received_quantity: 0, reception_status: 'pendiente',
      }],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:newOrder.lines.factoryRef')).toBeInTheDocument()
    expect(screen.getByText('compras:newOrder.lines.publicRef')).toBeInTheDocument()
    expect(screen.getByText('FAB-REF-1')).toBeInTheDocument()
    expect(screen.getByText('PUB-REF-1')).toBeInTheDocument()
  })

  it('SCRUM-736 — factory_reference null en la tabla de solo lectura muestra "—", no la referencia pública', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      lines: [{
        id: 1, catalog_product_id: 5, reference: 'PUB-REF-2', factory_reference: null,
        description: 'Lámpara LED', quantity: 2, unit_cost: 150, subtotal: 300,
        additional_cost_percent: null, additional_cost_amount: null, additional_cost_type: null,
        sales_project_id: null, sales_project_name: null,
        received_quantity: 0, reception_status: 'pendiente',
      }],
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    // "—" también aparece en "Fecha de pago" (last_payment_date null en el fixture) — se acota la
    // aserción a la fila de la línea para confirmar que la celda de Ref. fábrica específicamente
    // (no cualquier "—" del DOM) muestra el placeholder.
    const row = screen.getByText('PUB-REF-2').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('—')).toBeInTheDocument()
  })

  it('avanzar estado llama a la mutación con el id de la orden (REQ-142)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.orders.advance.mockResolvedValue(makeDetail({ status: 'en_transito' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:orders.actions.advanceTo'))

    await waitFor(() => expect(mockedComprasApi.orders.advance).toHaveBeenCalledWith(42))
  })

  it('el botón Editar solo se renderiza mientras la orden está "Por aprobar" (REQ-144)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'ordenado', next_status: 'en_transito',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.edit')).not.toBeInTheDocument()
  })

  it('el botón Editar se renderiza cuando la orden está "Por aprobar" (REQ-144)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.edit')).toBeInTheDocument()
  })

  it('muestra el botón de aprobación de Mark cuando la orden lo requiere y bloquea Avanzar (REQ-143)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado',
      requires_primary_approval: true, blocked_by_primary_approval: true, approved_by: null,
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:newOrder.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('compras:orders.actions.advanceTo').closest('button')).toBeDisabled()
  })

  it('aprobar la orden llama a la mutación de aprobación (REQ-143)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado',
      requires_primary_approval: true, blocked_by_primary_approval: true, approved_by: null,
    }))
    mockedComprasApi.orders.approve.mockResolvedValue(makeDetail({ approved_by: 9 }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:newOrder.actions.approve'))

    await waitFor(() => expect(mockedComprasApi.orders.approve).toHaveBeenCalledWith(42))
  })

  it('SCRUM-208 — sin compras.approve no se muestra el botón de aprobación (S5, Senior Review sprint2)', async () => {
    mockAuthState(['compras.read'])
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado',
      requires_primary_approval: true, blocked_by_primary_approval: true, approved_by: null,
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:newOrder.actions.approve')).not.toBeInTheDocument()
  })

  it('SCRUM-771 — sin compras.edit no se muestra ningún botón de acción (Avanzar/Editar/Confirmar recepción/Liquidar), solo lectura', async () => {
    mockAuthState(['compras.read'])
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado', pending_remainder_status: 'ordenado',
      modality: 'zona_libre',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.advanceTo')).toBeNull()
    expect(screen.queryByText('compras:orders.actions.edit')).toBeNull()
    expect(screen.queryByText('compras:orders.actions.confirmPendingReceiptsCta')).toBeNull()
    expect(screen.queryByText('compras:orders.actions.advanceRemainderCta')).toBeNull()
    expect(screen.queryByText('compras:orders.actions.liquidate')).toBeNull()
  })

  it('muestra el mensaje real del backend si rechaza el avance de estado', async () => {
    // SCRUM-208 (2026-08-06): antes se mostraba siempre el genérico, aunque el backend ya
    // mandara una razón concreta (ej. remanente pendiente, aprobación de Mark) — mismo criterio
    // que ya usaba el error de "Aprobar orden".
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.orders.advance.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Esta orden requiere la aprobación del aprobador configurado antes de avanzar.' } },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:orders.actions.advanceTo'))

    expect(await screen.findByText('Esta orden requiere la aprobación del aprobador configurado antes de avanzar.')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.errors.advanceGeneric')).toBeNull()
  })

  it('muestra el genérico si el error del backend no trae mensaje', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.orders.advance.mockRejectedValue(new Error('network down'))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:orders.actions.advanceTo'))

    expect(await screen.findByText('compras:orders.errors.advanceGeneric')).toBeInTheDocument()
  })

  // SCRUM-208 (REQ-145, 2026-08-06 — hallazgo Gerencia Test): `pending_remainder_status` existía
  // en la API pero nunca se renderizaba — la orden se veía "completa" aunque quedara mercancía
  // pendiente en otra etapa.
  it('muestra el aviso de remanente pendiente cuando pending_remainder_status no es null', async () => {
    // El mock de t() de este archivo no interpola opts (solo el título usa {{id}}) — se verifica
    // que la clave del aviso se renderiza, la sustitución real de {{stage}} vive en el JSON de i18n.
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'en_aduana' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.detail.pendingRemainder')).toBeInTheDocument()
  })

  it('no muestra el aviso de remanente cuando pending_remainder_status es null', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: null }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.detail.pendingRemainder')).toBeNull()
  })

  // SCRUM-208 (2026-08-07, segundo hallazgo de Gerencia Test sobre el fix del 2026-08-06): el
  // gate de negocio en sí (bloquear el paso final a "Recibido" hasta que el remanente se reciba)
  // es correcto y está pedido en su propio AC — el problema real era que el botón "Avanzar a:
  // Recibido" seguía clickeable en ese caso, así que el usuario disparaba un 422 ya sabido y
  // terminaba viendo 2 carteles (ámbar + rojo) apilados, dando la impresión de bloqueo total
  // cuando en realidad solo ese paso puntual lo está.
  it('deshabilita "Avanzar a: Recibido" cuando hay remanente pendiente, sin disparar el 422', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'en_transito_local', next_status: 'recibido', pending_remainder_status: 'ordenado',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    const advanceButton = screen.getByText('compras:orders.actions.advanceTo').closest('button')!
    expect(advanceButton).toBeDisabled()

    fireEvent.click(advanceButton)
    expect(mockedComprasApi.orders.advance).not.toHaveBeenCalled()
  })

  it('no deshabilita el avance a un estado intermedio (no "Recibido") aunque haya remanente pendiente', async () => {
    // El gate de `pending_remainder_status` (backend Y este disable) solo aplica al paso FINAL a
    // "Recibido" — cualquier etapa intermedia nunca estuvo bloqueada por esto.
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'ordenado', next_status: 'en_transito', pending_remainder_status: 'ordenado',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.advanceTo').closest('button')).not.toBeDisabled()
  })

  it('si igual llega un 422 de remanente pendiente del backend, no duplica el cartel rojo genérico', async () => {
    // Caso defensivo (ej. condición de carrera): aunque el botón esté deshabilitado en el caso
    // normal, si el backend rechaza igual con este mensaje puntual no debe apilarse un segundo
    // cartel rojo sobre el aviso ámbar ya visible — mismo criterio narrado en el comentario del
    // componente.
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'en_transito_local', next_status: 'recibido', pending_remainder_status: 'ordenado',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.errors.advanceGeneric')).toBeNull()
  })
})

// SCRUM-208 (rediseño 2026-08-15, docs/architecture/scrum208-recepcion-parcial-rediseno.md) —
// el aviso ámbar de remanente pendiente deja de ser puramente informativo: agrega un botón para
// avanzar el remanente por sus propias etapas. Endpoint `advance-remainder` todavía sin
// contraparte real en el backend al momento de este commit — estos tests cubren solo el
// contrato/comportamiento del frontend (mock de comprasApi), no una integración real.
describe('OrderDetailPage — avance del remanente (SCRUM-208, rediseño 2026-08-15)', () => {
  it('sin remanente pendiente, no muestra el botón de avanzar remanente', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: null }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.advanceRemainderCta')).toBeNull()
    expect(screen.queryByText(/compras:orders.actions.advanceRemainderTo/)).toBeNull()
  })

  it('con remanente pendiente pero sin next_remainder_status del backend, usa la etiqueta genérica', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.advanceRemainderCta')).toBeInTheDocument()
  })

  it('con next_remainder_status del backend, muestra la etiqueta específica de la próxima etapa', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      pending_remainder_status: 'ordenado', next_remainder_status: 'salio_de_origen',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.advanceRemainderTo')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.actions.advanceRemainderCta')).toBeNull()
  })

  it('clic en el botón dispara advanceRemainder con el id de la orden', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.advanceRemainder.mockResolvedValue(makeDetail({ pending_remainder_status: 'salio_de_origen' }))
    renderPage()

    const button = await screen.findByText('compras:orders.actions.advanceRemainderCta')
    fireEvent.click(button)

    await waitFor(() => expect(mockedComprasApi.orders.advanceRemainder).toHaveBeenCalledWith(42))
  })

  it('si advanceRemainder falla, muestra el mensaje de error dentro del propio aviso ámbar', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.advanceRemainder.mockRejectedValue(new Error('network error'))
    renderPage()

    const button = await screen.findByText('compras:orders.actions.advanceRemainderCta')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('compras:orders.errors.advanceRemainderGeneric')).toBeInTheDocument())
  })
})

// SCRUM-208 (rediseño 2026-08-15, backend ya implementado) — "Ingresar a Inventario" acotado a
// esta orden, root cause real del reporte de Daniela: la parte ya recibida no aparecía en
// Inventario porque nada la confirmaba sin esperar a que la orden llegara a Recibido.
describe('OrderDetailPage — confirmar pendientes a Inventario (SCRUM-208, rediseño 2026-08-15)', () => {
  it('sin remanente pendiente, no muestra el botón de Ingresar a Inventario', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: null }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.actions.confirmPendingReceiptsCta')).toBeNull()
  })

  it('con remanente pendiente, muestra el botón de Ingresar a Inventario junto al de avanzar remanente', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.actions.confirmPendingReceiptsCta')).toBeInTheDocument()
    expect(screen.getByText('compras:orders.actions.advanceRemainderCta')).toBeInTheDocument()
  })

  it('clic en el botón dispara confirmPendingReceipts con el id de la orden', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.confirmPendingReceipts.mockResolvedValue(makeDetail({ pending_remainder_status: null }))
    renderPage()

    const button = await screen.findByText('compras:orders.actions.confirmPendingReceiptsCta')
    fireEvent.click(button)

    await waitFor(() => expect(mockedComprasApi.orders.confirmPendingReceipts).toHaveBeenCalledWith(42))
  })

  it('si confirmPendingReceipts falla, muestra el mensaje de error dentro del propio aviso ámbar', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ pending_remainder_status: 'ordenado' }))
    mockedComprasApi.orders.confirmPendingReceipts.mockRejectedValue(new Error('network error'))
    renderPage()

    const button = await screen.findByText('compras:orders.actions.confirmPendingReceiptsCta')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('compras:orders.errors.confirmPendingReceiptsGeneric')).toBeInTheDocument())
  })
})

describe('OrderDetailPage', () => {
  // SCRUM-204 (REQ-141, 2026-08-06 — hallazgo Gerencia Test): "Pendiente/Por liquidar" es un
  // único estado interno, pero el texto mostrado depende de la modalidad de la orden.
  it('estado pendiente_liquidar en modalidad directo muestra la etiqueta "Pendiente"', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'pendiente_liquidar', next_status: 'ordenado', modality: 'directo',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.status.pendienteLiquidarDirecto')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.status.pendiente_liquidar')).toBeNull()
  })

  it('estado pendiente_liquidar en modalidad zona_libre muestra la etiqueta "Por liquidar"', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'pendiente_liquidar', next_status: 'ordenado', modality: 'zona_libre',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.status.pendienteLiquidarZonaLibre')).toBeInTheDocument()
  })

  /**
   * Pre-QA en vivo (2026-07-17): al probar el gate de SCRUM-206 contra dev.atlanticerp.ai con un
   * usuario que no es Mark, el backend devolvió 403 correcto pero la UI no mostraba nada — se
   * corrigió mostrando el mensaje real del backend, mismo patrón que "advance".
   */
  it('muestra el mensaje real del backend si el 403 de aprobación indica que no soy Mark', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      status: 'por_aprobar', next_status: 'ordenado',
      requires_primary_approval: true, blocked_by_primary_approval: true, approved_by: null,
    }))
    mockedComprasApi.orders.approve.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: 'Solo el aprobador configurado puede aprobar esta orden.' } },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:newOrder.actions.approve'))

    expect(await screen.findByText('Solo el aprobador configurado puede aprobar esta orden.')).toBeInTheDocument()
  })

  // ── SCRUM-210 (REQ-147, alcance reducido) ────────────────────────────────────────────────

  it('no muestra la sección de liquidación para órdenes que no son Zona Libre', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({ modality: 'directo' }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.queryByText('compras:orders.detail.liquidationAgency')).not.toBeInTheDocument()
  })

  it('permite buscar y asignar una agencia de liquidación en una orden Zona Libre', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      modality: 'zona_libre', liquidation_agency_id: null, liquidation_agency_name: null,
    }))
    mockedComprasApi.liquidationAgencies.search.mockResolvedValue({
      data: [{
        id: 5, name: 'Agencia Aduanal Istmo', contact_name: null, phone: null, email: null, notes: null,
        pending_payment_amount: 0, paid_amount: 0, last_payment_date: null, next_payment_date: null,
      }],
    })
    mockedComprasApi.orders.liquidate.mockResolvedValue(makeDetail({
      modality: 'zona_libre', liquidation_agency_id: 5, liquidation_agency_name: 'Agencia Aduanal Istmo',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(screen.getByText('compras:orders.detail.liquidationAgencyNone')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:orders.actions.liquidate'))
    fireEvent.change(screen.getByPlaceholderText('compras:orders.detail.agencySearchPlaceholder'), { target: { value: 'Istmo' } })
    fireEvent.click(await screen.findByText('Agencia Aduanal Istmo'))

    await waitFor(() => expect(mockedComprasApi.orders.liquidate).toHaveBeenCalledWith(42, 5))
  })

  it('permite registrar una agencia nueva desde el picker de liquidación', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail({
      modality: 'zona_libre', liquidation_agency_id: null, liquidation_agency_name: null,
    }))
    mockedComprasApi.liquidationAgencies.create.mockResolvedValue({
      id: 9, name: 'Agencia Nueva', contact_name: null, phone: null, email: null, notes: null,
      pending_payment_amount: 0, paid_amount: 0, last_payment_date: null, next_payment_date: null,
    })
    mockedComprasApi.orders.liquidate.mockResolvedValue(makeDetail({
      modality: 'zona_libre', liquidation_agency_id: 9, liquidation_agency_name: 'Agencia Nueva',
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:orders.actions.liquidate'))
    fireEvent.click(screen.getByText('compras:orders.detail.newAgency'))
    fireEvent.change(screen.getByPlaceholderText('compras:orders.detail.newAgencyPlaceholder'), { target: { value: 'Agencia Nueva' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedComprasApi.liquidationAgencies.create).toHaveBeenCalledWith({ name: 'Agencia Nueva' }))
    await waitFor(() => expect(mockedComprasApi.orders.liquidate).toHaveBeenCalledWith(42, 9))
  })

  // ── SCRUM-218 (REQ-148) — Confirmación del proveedor, solo lectura en Ver Órdenes ──────────

  it('muestra el estado vacío de Confirmación del proveedor si no se subió ningún documento', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({ data: [] })
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    expect(await screen.findByText('compras:orders.detail.providerConfirmation.empty')).toBeInTheDocument()
    expect(screen.queryByText('compras:orders.detail.providerConfirmation.viewDocument')).not.toBeInTheDocument()
  })

  it('muestra el documento y el panel de validación cuando ya existe una confirmación subida (duplicado de Logística, sin UI de subida)', async () => {
    mockedComprasApi.orders.get.mockResolvedValue(makeDetail())
    mockedComprasApi.documents.list.mockResolvedValue({
      data: [{ id: 7, category: 'confirmacion_proveedor', original_filename: 'confirmacion.pdf', url: 'https://s3/confirmacion.pdf', created_at: '2026-08-01T00:00:00Z' }],
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Lámpara LED')).toBeInTheDocument())
    const link = await screen.findByText('compras:orders.detail.providerConfirmation.viewDocument')
    expect(link.closest('a')).toHaveAttribute('href', 'https://s3/confirmacion.pdf')
    expect(screen.getByText('compras:logistics.providerConfirmation.validate')).toBeInTheDocument()
    // No hay ningún control de subida (input file / selector de categoría) en este card — la
    // subida sigue siendo exclusiva del checklist de Logística (decisión de Luis 2026-08-06).
    expect(screen.queryByText('compras:logistics.documents.upload')).not.toBeInTheDocument()
  })
})
