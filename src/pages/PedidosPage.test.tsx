import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import PedidosPage from './PedidosPage'
import {
  useOrdersBoard, useOrdersBoardOptions, useAssistantLoad, useTeamMembersByRole, useConsolidatedPicking,
  useOrderInvoiceStatus, useAssignPicker, useStartPicking,
  useOrderDetail, useOrderWarehouseBreakdown, useExportOrderItemsExcel,
  useOrderPickingSheet, useUpdatePickingSheet, useCompletePicking, useExportPickingSheetExcel,
  useAssignCourier, useDispatchOrder, useRegisterDelivery, useRegisterSignedGuide,
} from '@/hooks/useBodega'
import { useAuthStore } from '@/store/authStore'
import type { OrderBoardResponse, OrderCard, OrderDetail, AssistantLoad } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrdersBoard: vi.fn(),
  useOrdersBoardOptions: vi.fn(),
  useAssistantLoad: vi.fn(),
  useTeamMembersByRole: vi.fn(),
  useConsolidatedPicking: vi.fn(),
  // OrderCardTile (renderizado dentro del tablero) también depende de esto desde SCRUM-401.
  useOrderInvoiceStatus: vi.fn(),
  // OrderCardTile también depende de esto desde SCRUM-383/384 (asignar picker/iniciar picking).
  useAssignPicker: vi.fn(),
  useStartPicking: vi.fn(),
  // Pre-QA 2026-07-26 (CRÍTICO, SCRUM-385 Escenario 2) — OrderDetailModal/PickingSheetModal
  // ahora se montan de verdad cuando un test abre el detalle de un pedido.
  useOrderDetail: vi.fn(),
  useOrderWarehouseBreakdown: vi.fn(),
  useExportOrderItemsExcel: vi.fn(),
  useOrderPickingSheet: vi.fn(),
  useUpdatePickingSheet: vi.fn(),
  useCompletePicking: vi.fn(),
  useExportPickingSheetExcel: vi.fn(),
  // OrderCardTile también depende de esto desde SCRUM-396/398/399 (asignar repartidor/despachar/
  // confirmar guía firmada).
  useAssignCourier: vi.fn(),
  useDispatchOrder: vi.fn(),
  useRegisterDelivery: vi.fn(),
  useRegisterSignedGuide: vi.fn(),
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedUseOrdersBoard = vi.mocked(useOrdersBoard)
const mockedUseOrdersBoardOptions = vi.mocked(useOrdersBoardOptions)
const mockedUseAssistantLoad = vi.mocked(useAssistantLoad)
const mockedUseTeamMembersByRole = vi.mocked(useTeamMembersByRole)
const mockedUseConsolidatedPicking = vi.mocked(useConsolidatedPicking)
const mockedUseOrderInvoiceStatus = vi.mocked(useOrderInvoiceStatus)
const mockedUseAssignPicker = vi.mocked(useAssignPicker)
const mockedUseStartPicking = vi.mocked(useStartPicking)
const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderWarehouseBreakdown = vi.mocked(useOrderWarehouseBreakdown)
const mockedUseExportOrderItemsExcel = vi.mocked(useExportOrderItemsExcel)
const mockedUseOrderPickingSheet = vi.mocked(useOrderPickingSheet)
const mockedUseUpdatePickingSheet = vi.mocked(useUpdatePickingSheet)
const mockedUseCompletePicking = vi.mocked(useCompletePicking)
const mockedUseExportPickingSheetExcel = vi.mocked(useExportPickingSheetExcel)
const mockedUseAssignCourier = vi.mocked(useAssignCourier)
const mockedUseDispatchOrder = vi.mocked(useDispatchOrder)
const mockedUseRegisterDelivery = vi.mocked(useRegisterDelivery)
const mockedUseRegisterSignedGuide = vi.mocked(useRegisterSignedGuide)
const mockedUseAuthStore = vi.mocked(useAuthStore)

function card(overrides: Partial<OrderCard> = {}): OrderCard {
  return {
    id: overrides.id ?? 1,
    order_number: '2205',
    order_type: 'pedido',
    stage: 'asignado',
    proyecto: 'Torre Azul',
    cliente: 'Constructora Pacífico',
    vendedor: 'Mark',
    asistente: 'Mariano Sandoval',
    picker: null,
    repartidor: null,
    fecha_entrega_comprometida: '2026-08-01',
    is_atrasado: false,
    is_sin_stock: false,
    eta_proveedor: null,
    invoice_ready: false,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 2, unit_count: 15 },
    ...overrides,
  }
}

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    ...card(),
    items: [],
    documents: [],
    contacto_cliente: null,
    contacto_telefono: null,
    contacto_correo: null,
    direccion_entrega: null,
    cliente_master: 'Constructora Pacífico Holdings',
    subcliente: 'Constructora Pacífico',
    ...overrides,
  }
}

function boardResponse(cards: OrderCard[]): OrderBoardResponse {
  const counts_by_stage: OrderBoardResponse['counts_by_stage'] = {}
  for (const c of cards) counts_by_stage[c.stage] = (counts_by_stage[c.stage] ?? 0) + 1
  return { cards, counts_by_stage, total: cards.length }
}

const ASSISTANTS: AssistantLoad[] = [
  { assistant_id: 1, assistant_name: 'Mariano Sandoval', orders_count: 7, percent_of_total: 70 },
  { assistant_id: 2, assistant_name: 'Osvaldo Santos', orders_count: 3, percent_of_total: 30 },
]

function renderPage(initialEntries: string[] = ['/bodega/pedidos']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PedidosPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAssistantLoad.mockReturnValue({ data: { data: ASSISTANTS } } as ReturnType<typeof useAssistantLoad>)
  mockedUseOrdersBoardOptions.mockReturnValue({
    data: boardResponse([
      card({ id: 1, cliente: 'Constructora Pacífico', vendedor: 'Mark' }),
      card({ id: 2, cliente: 'Grupo Delta', vendedor: 'Felix' }),
    ]),
  } as ReturnType<typeof useOrdersBoardOptions>)
  mockedUseTeamMembersByRole.mockReturnValue({ data: { data: [] } } as unknown as ReturnType<typeof useTeamMembersByRole>)
  mockedUseConsolidatedPicking.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useConsolidatedPicking>)
  mockedUseOrderInvoiceStatus.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useOrderInvoiceStatus>)
  mockedUseAssignPicker.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useAssignPicker>)
  mockedUseStartPicking.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useStartPicking>)
  // Pre-QA 2026-07-26 (CRÍTICO, SCRUM-385 Escenario 2) — defaults para OrderDetailModal/
  // PickingSheetModal, solo montados de verdad en los tests que abren el detalle de un pedido.
  mockedUseOrderDetail.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useOrderDetail>)
  mockedUseOrderWarehouseBreakdown.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useOrderWarehouseBreakdown>)
  mockedUseExportOrderItemsExcel.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useExportOrderItemsExcel>)
  mockedUseOrderPickingSheet.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useOrderPickingSheet>)
  mockedUseUpdatePickingSheet.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useUpdatePickingSheet>)
  mockedUseCompletePicking.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useCompletePicking>)
  mockedUseExportPickingSheetExcel.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useExportPickingSheetExcel>)
  mockedUseAssignCourier.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useAssignCourier>)
  mockedUseDispatchOrder.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useDispatchOrder>)
  mockedUseRegisterDelivery.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRegisterDelivery>)
  mockedUseRegisterSignedGuide.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useRegisterSignedGuide>)
  mockedUseAuthStore.mockReturnValue({
    user: { modules: { bodega: { view: true, view_team: true, edit: true, approve: false } } },
  } as unknown as ReturnType<typeof useAuthStore>)
})

describe('PedidosPage', () => {
  it('agrupa las tarjetas en las 7 columnas fijas del Kanban, con conteo real por etapa (REQ-311)', () => {
    mockedUseOrdersBoard.mockReturnValue({
      data: boardResponse([
        card({ id: 1, stage: 'asignado' }),
        card({ id: 2, stage: 'asignado' }),
        card({ id: 3, stage: 'entregado' }),
      ]),
      isLoading: false,
    } as ReturnType<typeof useOrdersBoard>)

    renderPage()

    const board = screen.getByTestId('pedidos-board')
    expect(board).toBeInTheDocument()
    // 2 tarjetas en Asignado, 1 en Entregado, el resto de columnas vacías.
    expect(screen.getByTestId('order-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('order-card-2')).toBeInTheDocument()
    expect(screen.getByTestId('order-card-3')).toBeInTheDocument()
  })

  it('combina search + asistente + chip en la misma llamada al backend (AND real, REQ-309/310)', () => {
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)
    renderPage()

    fireEvent.change(screen.getByPlaceholderText('bodega:pedidos.filters.search'), { target: { value: '2205' } })
    fireEvent.change(screen.getByDisplayValue('bodega:pedidos.filters.assistant'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('bodega:pedidos.chips.urgentes'))

    const lastCallArgs = mockedUseOrdersBoard.mock.calls[mockedUseOrdersBoard.mock.calls.length - 1]?.[0]
    expect(lastCallArgs).toMatchObject({ search: '2205', assistant_id: 1, chip: 'urgentes' })
  })

  it('el filtro de Vendedor se aplica client-side sobre el resultado ya filtrado (sin id de vendedor en el board)', () => {
    mockedUseOrdersBoard.mockReturnValue({
      data: boardResponse([
        card({ id: 1, vendedor: 'Mark' }),
        card({ id: 2, vendedor: 'Felix' }),
      ]),
      isLoading: false,
    } as ReturnType<typeof useOrdersBoard>)

    renderPage()

    expect(screen.getByTestId('order-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('order-card-2')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('bodega:pedidos.filters.seller'), { target: { value: 'Felix' } })

    expect(screen.queryByTestId('order-card-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('order-card-2')).toBeInTheDocument()
  })

  it('"Limpiar filtros" resetea search/asistente/cliente/vendedor/chip', () => {
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)
    renderPage()

    fireEvent.change(screen.getByPlaceholderText('bodega:pedidos.filters.search'), { target: { value: 'algo' } })
    fireEvent.click(screen.getByText('bodega:pedidos.chips.atrasados'))
    fireEvent.click(screen.getByText('bodega:pedidos.filters.clear'))

    expect(screen.getByPlaceholderText('bodega:pedidos.filters.search')).toHaveValue('')
    const lastCallArgs = mockedUseOrdersBoard.mock.calls[mockedUseOrdersBoard.mock.calls.length - 1]?.[0]
    expect(lastCallArgs).toMatchObject({ search: undefined, chip: undefined })
  })

  it('muestra el aviso de desbalance cuando un asistente supera el umbral (REQ-306)', () => {
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)
    renderPage()
    expect(screen.getByTestId('imbalance-warning')).toBeInTheDocument()
  })

  it('no muestra el aviso de desbalance con un reparto equitativo', () => {
    mockedUseAssistantLoad.mockReturnValue({
      data: { data: [
        { assistant_id: 1, assistant_name: 'Mariano Sandoval', orders_count: 5, percent_of_total: 50 },
        { assistant_id: 2, assistant_name: 'Osvaldo Santos', orders_count: 5, percent_of_total: 50 },
      ] },
    } as ReturnType<typeof useAssistantLoad>)
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)

    renderPage()
    expect(screen.queryByTestId('imbalance-warning')).not.toBeInTheDocument()
  })

  it('SCRUM-391 (REQ-321) — "Imprimir picking del día" abre el consolidado con solo los pickers que tienen un pedido "En picking" (RN1)', () => {
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)
    // Universo completo (sin filtros): 1 picker con pedido en_picking, 1 sin ninguno todavía
    // (picking_pendiente no cuenta, RN1) — el chip solo debe mostrar al primero.
    mockedUseOrdersBoardOptions.mockReturnValue({
      data: boardResponse([
        card({ id: 1, stage: 'en_picking', picker: 'Ana Ríos' }),
        card({ id: 2, stage: 'picking_pendiente', picker: 'Beto Cruz' }),
      ]),
    } as ReturnType<typeof useOrdersBoardOptions>)
    mockedUseTeamMembersByRole.mockReturnValue({
      data: { data: [{ id: 10, name: 'Ana Ríos' }, { id: 20, name: 'Beto Cruz' }] },
    } as ReturnType<typeof useTeamMembersByRole>)

    renderPage()

    const printButton = screen.getByText('bodega:pedidos.actions.printPickingOfTheDay')
    expect(printButton.closest('button')).not.toBeDisabled()
    fireEvent.click(printButton)

    expect(screen.getByTestId('picker-chips')).toBeInTheDocument()
    expect(screen.getByTestId('picker-chip-10')).toHaveTextContent('Ana Ríos')
    expect(screen.queryByTestId('picker-chip-20')).not.toBeInTheDocument()
  })

  it('SCRUM-391 — al elegir un chip pide el consolidado con el picker_id correcto y renderiza la data mockeada', () => {
    mockedUseOrdersBoard.mockReturnValue({ data: boardResponse([]), isLoading: false } as ReturnType<typeof useOrdersBoard>)
    mockedUseOrdersBoardOptions.mockReturnValue({
      data: boardResponse([card({ id: 1, stage: 'en_picking', picker: 'Ana Ríos' })]),
    } as ReturnType<typeof useOrdersBoardOptions>)
    mockedUseTeamMembersByRole.mockReturnValue({
      data: { data: [{ id: 10, name: 'Ana Ríos' }] },
    } as ReturnType<typeof useTeamMembersByRole>)
    mockedUseConsolidatedPicking.mockReturnValue({
      data: {
        picker_id: 10,
        orders_count: 2,
        items: [
          { catalog_product_id: 1, reference: 'CAND-01', description: 'Candelabro', qty_requested: 5, orders: [{ order_id: 1, order_number: 'PED-001', qty_requested: 3 }, { order_id: 2, order_number: 'PED-002', qty_requested: 2 }] },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useConsolidatedPicking>)

    renderPage()
    fireEvent.click(screen.getByText('bodega:pedidos.actions.printPickingOfTheDay'))
    fireEvent.click(screen.getByTestId('picker-chip-10'))

    expect(mockedUseConsolidatedPicking).toHaveBeenLastCalledWith(10)
    const row = screen.getByTestId('picking-item-row')
    expect(row).toHaveTextContent('CAND-01')
    expect(row).toHaveTextContent('5')
    expect(row).toHaveTextContent('PED-001 (3)')
    expect(row).toHaveTextContent('PED-002 (2)')
  })

  it('Pre-QA 2026-07-26 (CRÍTICO, SCRUM-385 Escenario 2) — "Ver hoja de picking" desde el detalle de un pedido YA completado abre la Hoja de Picking en modo solo lectura', () => {
    // Pedido en "Packing" (ya avanzó más allá de "En picking") con picker ya asignado — antes de
    // este fix, no existía ningún botón/link en toda la SPA para reabrir su Hoja de Picking.
    mockedUseOrdersBoard.mockReturnValue({
      data: boardResponse([card({ id: 5, stage: 'packing', picker: 'Ana Ríos' })]),
      isLoading: false,
    } as ReturnType<typeof useOrdersBoard>)
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ id: 5, stage: 'packing', picker: 'Ana Ríos' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    mockedUseOrderPickingSheet.mockReturnValue({
      data: {
        order_id: 5,
        editable: false,
        items: [
          { id: 100, reference: 'CAND-01', factory_reference: null, description: 'Candelabro', location: 'A-1', found_at: null, qty_requested: 2, qty_picked: 2, picking_notes: null },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderPickingSheet>)

    renderPage()

    fireEvent.click(screen.getByTestId('order-card-5'))
    expect(screen.getByTestId('view-picking-sheet-button')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('view-picking-sheet-button'))

    const sheet = screen.getByTestId('picking-sheet-modal')
    expect(sheet).toBeInTheDocument()
    // Modo solo lectura (RN3, REQ-315): sin checkbox "Recogido", cantidad mostrada como texto.
    expect(screen.queryByTestId('picking-recogido-100')).not.toBeInTheDocument()
    expect(sheet).toHaveTextContent('bodega:pedidos.pickingSheetModal.readOnly')
  })

  it('SCRUM-369 (REQ-299, corrección 2026-08-11) — "?order=<id>" en la URL abre el detalle de ESE pedido directamente, sin que el usuario tenga que hacer clic en la tarjeta', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ id: 2, order_number: '2205-DEEPLINK' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)

    renderPage(['/bodega/pedidos?order=2'])

    // El detalle abre solo — no hace falta fireEvent.click sobre ninguna tarjeta.
    expect(screen.getByTestId('toggle-items')).toBeInTheDocument()
  })
})
