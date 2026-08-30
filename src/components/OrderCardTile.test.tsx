import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import OrderCardTile from './OrderCardTile'
import {
  useOrderInvoiceStatus, useAssignPicker, useStartPicking, useTeamMembersByRole,
  useAssignCourier, useDispatchOrder, useOrderDetail, useOrderWarehouseBreakdown,
  useRegisterDelivery, useRegisterSignedGuide,
} from '@/hooks/useBodega'
import { useAuthStore } from '@/store/authStore'
import type { OrderCard } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderInvoiceStatus: vi.fn(),
  useAssignPicker: vi.fn(),
  useStartPicking: vi.fn(),
  useTeamMembersByRole: vi.fn(),
  useAssignCourier: vi.fn(),
  useDispatchOrder: vi.fn(),
  // RegisterDeliveryModal/RegisterSignedGuideModal (montados condicionalmente desde
  // "Registrar Entrega"/"Confirmar Guía Firmada", SCRUM-393/399) dependen de estos.
  useOrderDetail: vi.fn(),
  useOrderWarehouseBreakdown: vi.fn(),
  useRegisterDelivery: vi.fn(),
  useRegisterSignedGuide: vi.fn(),
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedUseOrderInvoiceStatus = vi.mocked(useOrderInvoiceStatus)
const mockedUseAssignPicker = vi.mocked(useAssignPicker)
const mockedUseStartPicking = vi.mocked(useStartPicking)
const mockedUseTeamMembersByRole = vi.mocked(useTeamMembersByRole)
const mockedUseAssignCourier = vi.mocked(useAssignCourier)
const mockedUseDispatchOrder = vi.mocked(useDispatchOrder)
const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderWarehouseBreakdown = vi.mocked(useOrderWarehouseBreakdown)
const mockedUseRegisterDelivery = vi.mocked(useRegisterDelivery)
const mockedUseRegisterSignedGuide = vi.mocked(useRegisterSignedGuide)
const mockedUseAuthStore = vi.mocked(useAuthStore)
let invoiceMutateMock: ReturnType<typeof vi.fn>
let assignPickerMutateMock: ReturnType<typeof vi.fn>
let startPickingMutateMock: ReturnType<typeof vi.fn>
let assignCourierMutateMock: ReturnType<typeof vi.fn>
let dispatchOrderMutateMock: ReturnType<typeof vi.fn>
let registerDeliveryMutateMock: ReturnType<typeof vi.fn>
let registerSignedGuideMutateMock: ReturnType<typeof vi.fn>

/** Pre-QA 2026-07-26 (MEDIO) — `OrderCardTile` gatea "Asignar Picker" con
 * `user.modules.bodega.view_team`; por defecto simula un Jefe de Bodega/Asistente (view_team
 * true) para no romper el resto de los tests de este archivo, que no ejercitan ese gate. */
function mockAuthUser(overrides: { viewTeam?: boolean } = {}) {
  const { viewTeam = true } = overrides
  mockedUseAuthStore.mockReturnValue({
    user: { modules: { bodega: { view: true, view_team: viewTeam, edit: true, approve: false } } },
  } as unknown as ReturnType<typeof useAuthStore>)
}

beforeEach(() => {
  vi.clearAllMocks()
  invoiceMutateMock = vi.fn()
  assignPickerMutateMock = vi.fn()
  startPickingMutateMock = vi.fn()
  assignCourierMutateMock = vi.fn()
  dispatchOrderMutateMock = vi.fn()
  registerDeliveryMutateMock = vi.fn()
  registerSignedGuideMutateMock = vi.fn()
  mockedUseOrderInvoiceStatus.mockReturnValue({ mutate: invoiceMutateMock, isPending: false } as unknown as ReturnType<typeof useOrderInvoiceStatus>)
  mockedUseAssignPicker.mockReturnValue({ mutate: assignPickerMutateMock, isPending: false } as unknown as ReturnType<typeof useAssignPicker>)
  mockedUseStartPicking.mockReturnValue({ mutate: startPickingMutateMock, isPending: false } as unknown as ReturnType<typeof useStartPicking>)
  // Mismo mock para las dos etapas ('picker' del formulario "Asignar Picker" SCRUM-383, 'courier'
  // de "Asignar Repartidor" SCRUM-396) — este test no necesita distinguir el `role` pedido, solo
  // que `useTeamMembersByRole` resuelva la lista.
  mockedUseTeamMembersByRole.mockReturnValue({
    data: { data: [{ id: 10, name: 'Apolonio Gonzalez' }, { id: 20, name: 'Otro Miembro' }] },
  } as unknown as ReturnType<typeof useTeamMembersByRole>)
  mockedUseAssignCourier.mockReturnValue({ mutate: assignCourierMutateMock, isPending: false } as unknown as ReturnType<typeof useAssignCourier>)
  mockedUseDispatchOrder.mockReturnValue({ mutate: dispatchOrderMutateMock, isPending: false } as unknown as ReturnType<typeof useDispatchOrder>)
  mockedUseOrderDetail.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useOrderDetail>)
  mockedUseOrderWarehouseBreakdown.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useOrderWarehouseBreakdown>)
  mockedUseRegisterDelivery.mockReturnValue({ mutate: registerDeliveryMutateMock, isPending: false } as unknown as ReturnType<typeof useRegisterDelivery>)
  mockedUseRegisterSignedGuide.mockReturnValue({ mutate: registerSignedGuideMutateMock, isPending: false } as unknown as ReturnType<typeof useRegisterSignedGuide>)
  mockAuthUser()
})

function order(overrides: Partial<OrderCard> = {}): OrderCard {
  return {
    id: 1,
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

describe('OrderCardTile', () => {
  it('muestra el # de pedido y dispara onOpenDetail al hacer clic en la tarjeta (REQ-332/382)', () => {
    const onOpenDetail = vi.fn()
    render(<OrderCardTile order={order()} onOpenDetail={onOpenDetail} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.getByText('#2205')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('order-card-1'))
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
  })

  it('el botón de acción no dispara onOpenDetail (stopPropagation) — REQ-382', () => {
    const onOpenDetail = vi.fn()
    render(<OrderCardTile order={order({ stage: 'picking_pendiente' })} onOpenDetail={onOpenDetail} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.picking_pendiente'))
    expect(onOpenDetail).not.toHaveBeenCalled()
  })

  it('cambia la etiqueta del botón de acción según la etapa (REQ-382)', () => {
    const { rerender } = render(<OrderCardTile order={order({ stage: 'asignado' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByText('bodega:pedidos.actionButton.asignado')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'en_picking' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByText('bodega:pedidos.actionButton.en_picking')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'entregado' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByText(/actionButton\.entregado/)).not.toBeInTheDocument()
  })

  it('"Por despachar" usa "Asignar Repartidor" sin repartidor y "Despachar" con repartidor ya asignado', () => {
    const { rerender } = render(
      <OrderCardTile order={order({ stage: 'por_despachar', repartidor: null })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )
    expect(screen.getByText('bodega:pedidos.actionButton.assignCourier')).toBeInTheDocument()

    rerender(
      <OrderCardTile order={order({ stage: 'por_despachar', repartidor: 'Juan Pérez' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )
    expect(screen.getByText('bodega:pedidos.actionButton.dispatch')).toBeInTheDocument()
  })

  it('muestra el ícono de atrasado solo cuando is_atrasado es true (REQ-312/382)', () => {
    const { rerender } = render(<OrderCardTile order={order({ is_atrasado: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByTitle('bodega:pedidos.card.atrasado')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ is_atrasado: false })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.card.atrasado')).not.toBeInTheDocument()
  })

  it('muestra el badge "Sin stock" solo cuando is_sin_stock es true (REQ-310/380)', () => {
    render(<OrderCardTile order={order({ is_sin_stock: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByText('bodega:pedidos.card.sinStock')).toBeInTheDocument()
  })

  it('el botón "Ver guía" solo aparece desde Por despachar en adelante (REQ-330)', () => {
    const { rerender } = render(<OrderCardTile order={order({ stage: 'packing' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByText('bodega:pedidos.card.viewGuide')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'por_despachar' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByText('bodega:pedidos.card.viewGuide')).toBeInTheDocument()
  })

  it('la fila de factura se muestra en Por despachar/Despachado/Entregado, pasiva según invoice_ready (REQ-327/397/331, ampliado SCRUM-401 2026-07-28)', () => {
    const { rerender } = render(
      <OrderCardTile order={order({ stage: 'por_despachar', invoice_ready: false })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )
    expect(screen.getByTestId('invoice-waiting')).toBeInTheDocument()

    rerender(
      <OrderCardTile order={order({ stage: 'por_despachar', invoice_ready: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )
    expect(screen.getByTestId('invoice-ready')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'despachado', invoice_ready: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByTestId('invoice-ready')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'entregado', invoice_ready: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.getByTestId('invoice-ready')).toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'packing', invoice_ready: true })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTestId('invoice-ready')).not.toBeInTheDocument()
    expect(screen.queryByTestId('invoice-waiting')).not.toBeInTheDocument()
  })

  it('muestra el badge de familia (HU-335/REQ-319) cuando el pedido pertenece a una familia', () => {
    render(
      <OrderCardTile
        order={order({ family: { sequence_in_family: 1, total_in_family: 2, badge: 'pendiente_falta_parte' } })}
        onOpenDetail={vi.fn()}
        onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()}
      />,
    )
    expect(screen.getByText('bodega:pedidos.card.familyPending')).toBeInTheDocument()
  })

  it('SCRUM-382/388 (corrección 2026-08-11) — "Alertas del pedido" agrupa sin stock + badge de familia + numeración "ENTREGA X DE Y" bajo un mismo título, y no se muestra si no hay nada que alertar', () => {
    const { rerender } = render(
      <OrderCardTile
        order={order({
          is_sin_stock: true,
          family: { sequence_in_family: 1, total_in_family: 2, badge: 'pendiente_falta_parte' },
        })}
        onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()}
      />,
    )
    const alerts = screen.getByTestId('order-alerts')
    expect(alerts).toHaveTextContent('bodega:pedidos.card.alertsTitle')
    expect(screen.getByTestId('family-badge')).toHaveTextContent('bodega:pedidos.card.familyPending')
    expect(screen.getByTestId('family-sequence')).toBeInTheDocument()
    expect(alerts).toHaveTextContent('bodega:pedidos.card.sinStock')

    rerender(
      <OrderCardTile
        order={order({ is_sin_stock: false, family: { sequence_in_family: null, total_in_family: null, badge: null } })}
        onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('order-alerts')).not.toBeInTheDocument()
  })

  it('SCRUM-382 (corrección 2026-08-11) — resumen de productos y cantidades ("X productos y Y unidades")', () => {
    render(
      <OrderCardTile
        order={order({ items_summary: { product_count: 3, unit_count: 27 } })}
        onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()}
      />,
    )
    expect(screen.getByTestId('items-summary')).toHaveTextContent(
      'bodega:pedidos.card.itemsSummary:{"products":3,"units":27}',
    )
  })

  it('REQ-336 RN1 — muestra la ETA de proveedor directamente en la tarjeta solo cuando is_sin_stock es true y el backend la entrega', () => {
    const { rerender } = render(
      <OrderCardTile order={order({ is_sin_stock: true, eta_proveedor: '2026-08-10' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )
    expect(screen.getByTestId('supplier-eta')).toHaveTextContent('2026-08-10')

    rerender(<OrderCardTile order={order({ is_sin_stock: true, eta_proveedor: null })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTestId('supplier-eta')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ is_sin_stock: false, eta_proveedor: '2026-08-10' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTestId('supplier-eta')).not.toBeInTheDocument()
  })

  it('SCRUM-401 (REQ-331) — el link "ver" de factura dispara useOrderInvoiceStatus con el order.id y muestra el status_message en un modal, sin abrir el detalle', () => {
    const onOpenDetail = vi.fn()
    invoiceMutateMock.mockImplementation((_orderId, { onSuccess }) => {
      onSuccess({ order_id: 1, order_number: '2205', invoice_ready: true, status_message: 'Factura lista — pendiente de generación real por Administración & Contabilidad.' })
    })
    render(
      <OrderCardTile order={order({ stage: 'por_despachar', invoice_ready: true })} onOpenDetail={onOpenDetail} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )

    fireEvent.click(screen.getByTestId('invoice-view-button'))

    expect(invoiceMutateMock).toHaveBeenCalledWith(1, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(onOpenDetail).not.toHaveBeenCalled()
    expect(screen.getByTestId('invoice-status-message')).toHaveTextContent('Factura lista')
  })

  it('cierra el modal de estado de factura sin disparar onOpenDetail', async () => {
    invoiceMutateMock.mockImplementation((_orderId, { onSuccess }) => {
      onSuccess({ order_id: 1, order_number: '2205', invoice_ready: true, status_message: 'Esperando a Administración.' })
    })
    const onOpenDetail = vi.fn()
    render(
      <OrderCardTile order={order({ stage: 'por_despachar', invoice_ready: true })} onOpenDetail={onOpenDetail} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />,
    )

    fireEvent.click(screen.getByTestId('invoice-view-button'))
    expect(screen.getByTestId('invoice-status-message')).toBeInTheDocument()

    fireEvent.click(screen.getByText('common:actions.close'))
    await waitFor(() => expect(screen.queryByTestId('invoice-status-message')).not.toBeInTheDocument())
    expect(onOpenDetail).not.toHaveBeenCalled()
  })

  it('SCRUM-383/384/385/393/396/398/399 — ninguna etapa no-terminal muestra "Próximamente" (REQ-313/314/315/323/326/328/329)', () => {
    const { rerender } = render(<OrderCardTile order={order({ stage: 'asignado' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'picking_pendiente' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'en_picking' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()

    // SCRUM-393/396/398/399 (REQ-323/326/328/329) — Packing, Por despachar y Despachado ya no
    // están fuera de alcance.
    rerender(<OrderCardTile order={order({ stage: 'packing' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: null })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()

    rerender(<OrderCardTile order={order({ stage: 'despachado' })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()
  })

  it('SCRUM-383 (REQ-313 RN1) — abre el formulario en línea y no permite confirmar sin elegir picker (campo en rojo)', () => {
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.asignado'))
    const form = screen.getByTestId('assign-picker-form-7')
    expect(form).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('assign-picker-confirm-7'))
    expect(screen.getByTestId('assign-picker-required-error-7')).toBeInTheDocument()
    expect(assignPickerMutateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-383 — elegir un picker y confirmar dispara useAssignPicker con orderId/pickerId', () => {
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.asignado'))
    fireEvent.change(screen.getByTestId('assign-picker-select-7'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('assign-picker-confirm-7'))

    expect(assignPickerMutateMock).toHaveBeenCalledWith(
      { orderId: 7, pickerId: 10 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('SCRUM-383 RN3 — un 403 del backend (rol no autorizado) se muestra inline, sin inventarlo en el frontend', () => {
    assignPickerMutateMock.mockImplementation((_vars, { onError }) => {
      onError({ isAxiosError: true, response: { status: 403, data: { message: 'Solo el Jefe de Bodega o los Asistentes de Bodega pueden asignar el picking.', errors: { order: ['Solo el Jefe de Bodega o los Asistentes de Bodega pueden asignar el picking.'] } } } })
    })
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.asignado'))
    fireEvent.change(screen.getByTestId('assign-picker-select-7'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('assign-picker-confirm-7'))

    expect(screen.getByTestId('assign-picker-error-7')).toHaveTextContent('Solo el Jefe de Bodega')
  })

  it('SCRUM-384 — "Iniciar Picking" dispara useStartPicking y abre la Hoja de Picking al completar', () => {
    startPickingMutateMock.mockImplementation((_orderId, { onSuccess }) => onSuccess({ id: 7, stage: 'en_picking' }))
    const onOpenPickingSheet = vi.fn()
    render(<OrderCardTile order={order({ stage: 'picking_pendiente', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={onOpenPickingSheet} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.picking_pendiente'))

    expect(startPickingMutateMock).toHaveBeenCalledWith(7, expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }))
    expect(onOpenPickingSheet).toHaveBeenCalledWith(7)
  })

  it('SCRUM-384 — un error de "Iniciar Picking" se muestra inline, sin abrir la Hoja de Picking', () => {
    startPickingMutateMock.mockImplementation((_orderId, { onError }) => {
      onError({ isAxiosError: true, response: { status: 422, data: { message: 'El pedido no tiene un picker asignado.', errors: { order: ['El pedido no tiene un picker asignado.'] } } } })
    })
    const onOpenPickingSheet = vi.fn()
    render(<OrderCardTile order={order({ stage: 'picking_pendiente', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={onOpenPickingSheet} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.picking_pendiente'))

    expect(screen.getByTestId('start-picking-error-7')).toHaveTextContent('El pedido no tiene un picker asignado.')
    expect(onOpenPickingSheet).not.toHaveBeenCalled()
  })

  it('SCRUM-385 — "Continuar Picking" (en_picking) abre la Hoja de Picking directamente, sin mutación', () => {
    const onOpenPickingSheet = vi.fn()
    render(<OrderCardTile order={order({ stage: 'en_picking', id: 9 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={onOpenPickingSheet} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.en_picking'))

    expect(onOpenPickingSheet).toHaveBeenCalledWith(9)
    expect(startPickingMutateMock).not.toHaveBeenCalled()
    expect(assignPickerMutateMock).not.toHaveBeenCalled()
  })

  it('Pre-QA 2026-07-26 (MEDIO) — oculta por completo "Asignar Picker" para un actor sin modules.bodega.view_team (Picker/Repartidor)', () => {
    mockAuthUser({ viewTeam: false })
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.queryByText('bodega:pedidos.actionButton.asignado')).not.toBeInTheDocument()
    // Tampoco el placeholder "Próximamente" — "asignado" sigue siendo una etapa cableada de este
    // batch, solo que este actor puntual no puede operarla.
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()
  })

  it('Pre-QA 2026-07-26 (MEDIO) — muestra "Asignar Picker" para un Jefe de Bodega/Asistente (modules.bodega.view_team true)', () => {
    mockAuthUser({ viewTeam: true })
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.getByText('bodega:pedidos.actionButton.asignado')).toBeInTheDocument()
  })

  it('Pre-QA 2026-07-26 (MEDIO) — sin view_team, ni siquiera abrir el formulario en línea llega a montarse', () => {
    mockAuthUser({ viewTeam: false })
    render(<OrderCardTile order={order({ stage: 'asignado', id: 7 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.queryByTestId('assign-picker-form-7')).not.toBeInTheDocument()
  })

  it('SCRUM-387/388 — una tarjeta de Revisión de Inventario (picking_pendiente + order_type revision_inventario) muestra "Revisar Inventario" en vez de "Iniciar Picking"', () => {
    const onOpenPickingSheet = vi.fn()
    const onOpenInventoryReview = vi.fn()
    render(
      <OrderCardTile
        order={order({ stage: 'picking_pendiente', order_type: 'revision_inventario', id: 12 })}
        onOpenDetail={vi.fn()}
        onOpenGuide={vi.fn()}
        onOpenPickingSheet={onOpenPickingSheet}
        onOpenInventoryReview={onOpenInventoryReview}
      />,
    )

    expect(screen.queryByText('bodega:pedidos.actionButton.picking_pendiente')).not.toBeInTheDocument()
    expect(screen.getByText('bodega:pedidos.actionButton.reviewInventory')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('review-inventory-button-12'))

    expect(onOpenInventoryReview).toHaveBeenCalledWith(12)
    expect(onOpenPickingSheet).not.toHaveBeenCalled()
    expect(startPickingMutateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-387/388 — una tarjeta de picking_pendiente normal (order_type pedido) sigue disparando start-picking, sin cambios (regresión)', () => {
    const onOpenInventoryReview = vi.fn()
    render(
      <OrderCardTile
        order={order({ stage: 'picking_pendiente', order_type: 'pedido', id: 13 })}
        onOpenDetail={vi.fn()}
        onOpenGuide={vi.fn()}
        onOpenPickingSheet={vi.fn()}
        onOpenInventoryReview={onOpenInventoryReview}
      />,
    )

    expect(screen.getByText('bodega:pedidos.actionButton.picking_pendiente')).toBeInTheDocument()
    expect(screen.queryByText('bodega:pedidos.actionButton.reviewInventory')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('start-picking-button-13'))

    expect(startPickingMutateMock).toHaveBeenCalledWith(13, expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }))
    expect(onOpenInventoryReview).not.toHaveBeenCalled()
  })

  it('SCRUM-387/388 — sin modules.bodega.view_team (Picker/Repartidor), la tarjeta de Revisión de Inventario no muestra ningún botón', () => {
    mockAuthUser({ viewTeam: false })
    render(
      <OrderCardTile
        order={order({ stage: 'picking_pendiente', order_type: 'revision_inventario', id: 14 })}
        onOpenDetail={vi.fn()}
        onOpenGuide={vi.fn()}
        onOpenPickingSheet={vi.fn()}
        onOpenInventoryReview={vi.fn()}
      />,
    )

    expect(screen.queryByText('bodega:pedidos.actionButton.reviewInventory')).not.toBeInTheDocument()
    expect(screen.queryByTitle('bodega:pedidos.actions.comingSoon')).not.toBeInTheDocument()
  })

  it('SCRUM-396 (REQ-326 RN1) — abre el formulario en línea y no permite confirmar sin elegir repartidor (campo en rojo)', () => {
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: null, id: 21 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.assignCourier'))
    expect(screen.getByTestId('assign-courier-form-21')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('assign-courier-confirm-21'))
    expect(screen.getByTestId('assign-courier-required-error-21')).toBeInTheDocument()
    expect(assignCourierMutateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-396 — elegir un repartidor y confirmar dispara useAssignCourier con orderId/courierId', () => {
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: null, id: 21 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.assignCourier'))
    fireEvent.change(screen.getByTestId('assign-courier-select-21'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('assign-courier-confirm-21'))

    expect(assignCourierMutateMock).toHaveBeenCalledWith(
      { orderId: 21, courierId: 20 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('SCRUM-396 — un 403 del backend (solo Jefe de Bodega asigna repartidor) se muestra inline', () => {
    assignCourierMutateMock.mockImplementation((_vars, { onError }) => {
      onError({ isAxiosError: true, response: { status: 403, data: { message: 'Solo el Jefe de Bodega puede asignar el repartidor.', errors: { order: ['Solo el Jefe de Bodega puede asignar el repartidor.'] } } } })
    })
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: null, id: 21 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.assignCourier'))
    fireEvent.change(screen.getByTestId('assign-courier-select-21'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('assign-courier-confirm-21'))

    expect(screen.getByTestId('assign-courier-error-21')).toHaveTextContent('Solo el Jefe de Bodega')
  })

  it('SCRUM-398 (REQ-328) — "Despachar" dispara useDispatchOrder con el orderId, sin formulario', () => {
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: 'Gary Arrocha', id: 22 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByTestId('dispatch-button-22'))

    expect(dispatchOrderMutateMock).toHaveBeenCalledWith(22, expect.objectContaining({ onError: expect.any(Function) }))
  })

  it('Lote 4 (SCRUM-396) — con repartidor ya asignado, muestra "Cambiar repartidor" además de "Despachar"', () => {
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: 'Gary Arrocha', id: 22 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.getByTestId('dispatch-button-22')).toBeInTheDocument()
    expect(screen.getByTestId('change-courier-button-22')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-396) — "Cambiar repartidor" reabre el mismo formulario/mutation que "Asignar Repartidor" y oculta Despachar mientras está abierto', () => {
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: 'Gary Arrocha', id: 22 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    fireEvent.click(screen.getByTestId('change-courier-button-22'))

    expect(screen.getByTestId('assign-courier-form-22')).toBeInTheDocument()
    expect(screen.queryByTestId('dispatch-button-22')).not.toBeInTheDocument()
    expect(screen.queryByTestId('change-courier-button-22')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('assign-courier-select-22'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('assign-courier-confirm-22'))

    expect(assignCourierMutateMock).toHaveBeenCalledWith(
      { orderId: 22, courierId: 20 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('SCRUM-398 — el bloqueo REAL (422 del backend: falta repartidor o factura) se muestra inline, nunca un disabled precalculado', () => {
    dispatchOrderMutateMock.mockImplementation((_orderId, { onError }) => {
      onError({ isAxiosError: true, response: { status: 422, data: { message: 'Falta la factura de Administración.', errors: { order: ['Falta la factura de Administración.'] } } } })
    })
    render(<OrderCardTile order={order({ stage: 'por_despachar', repartidor: 'Gary Arrocha', invoice_ready: false, id: 22 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    // El botón "Despachar" está habilitado pese a `invoice_ready: false` — el bloqueo real
    // ocurre al recibir el 422 real del backend, no antes.
    expect(screen.getByTestId('dispatch-button-22')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('dispatch-button-22'))
    expect(screen.getByTestId('dispatch-error-22')).toHaveTextContent('Falta la factura de Administración.')
  })

  it('SCRUM-393 (REQ-323) — "Registrar Entrega" (Packing) abre el modal completo', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: {
        id: 23, order_number: '2301', stage: 'packing', items: [],
        documents: [], contacto_cliente: null, direccion_entrega: null,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderDetail>)

    render(<OrderCardTile order={order({ stage: 'packing', id: 23 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.queryByTestId('register-delivery-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.packing'))
    expect(screen.getByTestId('register-delivery-modal')).toBeInTheDocument()
  })

  it('SCRUM-399 (REQ-329) — "Confirmar Guía Firmada" (Despachado) abre el modal de subida', () => {
    render(<OrderCardTile order={order({ stage: 'despachado', repartidor: 'Gary Arrocha', id: 24 })} onOpenDetail={vi.fn()} onOpenGuide={vi.fn()} onOpenPickingSheet={vi.fn()} onOpenInventoryReview={vi.fn()} />)

    expect(screen.queryByTestId('signed-guide-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('bodega:pedidos.actionButton.despachado'))
    expect(screen.getByTestId('signed-guide-modal')).toBeInTheDocument()
  })
})
