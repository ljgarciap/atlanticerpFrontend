import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RegisterDeliveryModal from './RegisterDeliveryModal'
import { useOrderDetail, useOrderWarehouseBreakdown, useRegisterDelivery } from '@/hooks/useBodega'
import type { OrderDetail } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderDetail: vi.fn(),
  useOrderWarehouseBreakdown: vi.fn(),
  useRegisterDelivery: vi.fn(),
}))

const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderWarehouseBreakdown = vi.mocked(useOrderWarehouseBreakdown)
const mockedUseRegisterDelivery = vi.mocked(useRegisterDelivery)
let mutateMock: ReturnType<typeof vi.fn>

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 23, order_number: '2301', order_type: 'pedido', stage: 'packing',
    proyecto: 'Torre Azul', cliente: 'Constructora Pacífico', vendedor: 'Mark',
    asistente: 'Mariano Sandoval', picker: 'Apolonio Gonzalez', repartidor: null,
    fecha_entrega_comprometida: '2026-08-01', is_atrasado: false, is_sin_stock: false,
    eta_proveedor: null, invoice_ready: false,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 2, unit_count: 15 },
    items: [
      {
        id: 100, catalog_product_id: 5, reference: 'REF-1', factory_reference: 'FAB-1',
        description: 'Lámpara colgante', location: 'A1', qty_requested: 10, qty_reserved: 10,
        qty_picked: 10, qty_delivered: 0, shortage_reason: null,
      },
      {
        id: 101, catalog_product_id: 6, reference: 'REF-2', factory_reference: 'FAB-2',
        description: 'Foco LED', location: 'B2', qty_requested: 3, qty_reserved: 3,
        qty_picked: 3, qty_delivered: 0, shortage_reason: null,
      },
    ],
    documents: [], contacto_cliente: null, contacto_telefono: null, contacto_correo: null, direccion_entrega: null,
    cliente_master: 'Constructora Pacífico Holdings', subcliente: 'Constructora Pacífico',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mutateMock = vi.fn()
  mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as unknown as ReturnType<typeof useOrderDetail>)
  mockedUseOrderWarehouseBreakdown.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useOrderWarehouseBreakdown>)
  mockedUseRegisterDelivery.mockReturnValue({ mutate: mutateMock, isPending: false } as unknown as ReturnType<typeof useRegisterDelivery>)
})

describe('RegisterDeliveryModal', () => {
  it('RN1 (REQ-323) — "A entregar" arranca bloqueado en el tope real (qty_picked), no en qty_requested', () => {
    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    const item100 = screen.getByTestId('register-delivery-qty-100') as HTMLInputElement
    const item101 = screen.getByTestId('register-delivery-qty-101') as HTMLInputElement
    expect(item100.value).toBe('10')
    expect(item101.value).toBe('3')
    expect(item100).toBeDisabled()
  })

  it('guardar sin cambios (entrega completa en todos los ítems) manda el payload sin motivo, sin abrir ningún selector', () => {
    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    expect(screen.queryByTestId('register-delivery-motivo-100')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('register-delivery-save'))

    expect(mutateMock).toHaveBeenCalledWith(
      {
        orderId: 23,
        payload: {
          items: [
            { order_item_id: 100, qty_delivered: 10, motivo: undefined, motivo_detalle: undefined },
            { order_item_id: 101, qty_delivered: 3, motivo: undefined, motivo_detalle: undefined },
          ],
          observacion_general: undefined,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('RN2 (REQ-324) — bloquea el guardado si un ítem queda parcial sin motivo (campo en rojo)', () => {
    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('register-delivery-edit-100'))
    fireEvent.change(screen.getByTestId('register-delivery-qty-100'), { target: { value: '4' } })

    // El selector de motivo aparece apenas la cantidad queda por debajo del tope.
    expect(screen.getByTestId('register-delivery-motivo-100')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('register-delivery-save'))
    expect(screen.getByTestId('register-delivery-motivo-error-100')).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('RN1 (REQ-324) — "Otra" exige texto libre obligatorio', () => {
    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('register-delivery-edit-100'))
    fireEvent.change(screen.getByTestId('register-delivery-qty-100'), { target: { value: '4' } })
    fireEvent.change(screen.getByTestId('register-delivery-motivo-100'), { target: { value: 'otra' } })

    fireEvent.click(screen.getByTestId('register-delivery-save'))
    expect(screen.getByTestId('register-delivery-motivo-detalle-error-100')).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('register-delivery-motivo-detalle-100'), { target: { value: 'Llegó roto en tránsito' } })
    fireEvent.click(screen.getByTestId('register-delivery-save'))

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          items: expect.arrayContaining([
            { order_item_id: 100, qty_delivered: 4, motivo: 'otra', motivo_detalle: 'Llegó roto en tránsito' },
          ]),
        }),
      }),
      expect.anything(),
    )
  })

  it('no permite escribir por encima del tope real (input con max=qty_picked)', () => {
    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('register-delivery-edit-101'))
    const input = screen.getByTestId('register-delivery-qty-101') as HTMLInputElement
    expect(input.max).toBe('3')

    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByTestId('register-delivery-save'))
    expect(screen.getByTestId('register-delivery-qty-error-101')).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-393 (rebote 2026-08-17) — el selector de motivo aparece de entrada si el ítem ya llegó alistado por debajo de lo pedido, sin necesidad de editar a mano', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        items: [
          {
            id: 200, catalog_product_id: 7, reference: 'REF-3', factory_reference: 'FAB-3',
            description: 'Riel LED', location: 'C3', qty_requested: 8, qty_reserved: 6,
            qty_picked: 6, qty_delivered: 0, shortage_reason: null,
          },
        ],
      }),
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderDetail>)

    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    // Sin tocar nada: qty_picked (6) < qty_requested (8), el motivo ya debe pedirse.
    expect(screen.getByTestId('register-delivery-motivo-200')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('register-delivery-save'))
    expect(screen.getByTestId('register-delivery-motivo-error-200')).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('SCRUM-393 — columna "Disponible" muestra el stock total (por_servir) del warehouse breakdown ya cargado', () => {
    mockedUseOrderWarehouseBreakdown.mockReturnValue({
      data: { order_id: 23, products: { 5: { por_servir: 42, warehouses: [] }, 6: { por_servir: 0, warehouses: [] } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderWarehouseBreakdown>)

    render(<RegisterDeliveryModal orderId={23} onClose={vi.fn()} />)

    expect(screen.getByTestId('register-delivery-available-100')).toHaveTextContent('42')
    expect(screen.getByTestId('register-delivery-available-101')).toHaveTextContent('0')
  })

  it('SCRUM-393 (rebote de Daniela Amaya 2026-08-11) — se renderiza vía portal, fuera de un ancestro con transform (evita el bug de containing-block que hacía titilar/mover el modal)', () => {
    // Reproduce la estructura real: OrderCardTile envuelve este modal en una tarjeta con
    // `hover:-translate-y-px` (transform CSS) — cualquier ancestro con transform se vuelve el
    // containing block de sus descendientes `position: fixed`, así que sin portal el modal
    // quedaría posicionado/dimensionado contra esa tarjetita chica en vez del viewport.
    const { container } = render(
      <div data-testid="hover-transform-ancestor" className="hover:-translate-y-px">
        <RegisterDeliveryModal orderId={23} onClose={vi.fn()} />
      </div>,
    )

    const modal = screen.getByTestId('register-delivery-modal')
    const ancestor = container.querySelector('[data-testid="hover-transform-ancestor"]')

    expect(ancestor?.contains(modal)).toBe(false)
    expect(document.body.contains(modal)).toBe(true)
    expect(modal.parentElement).toBe(document.body)
  })
})
