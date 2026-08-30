import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import InventoryReviewModal from './InventoryReviewModal'
import { useOrderDetail, useOrderPickingSheet, useResolveInventoryReview } from '@/hooks/useBodega'
import type { OrderDetail, OrderPickingSheetResponse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderDetail: vi.fn(),
  useOrderPickingSheet: vi.fn(),
  useResolveInventoryReview: vi.fn(),
}))

const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderPickingSheet = vi.mocked(useOrderPickingSheet)
const mockedUseResolveInventoryReview = vi.mocked(useResolveInventoryReview)

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 55,
    order_number: 'PED-2026-0007',
    order_type: 'revision_inventario',
    stage: 'picking_pendiente',
    proyecto: 'Torre Azul',
    cliente: 'Constructora Pacífico',
    vendedor: 'Mark',
    asistente: 'Mariano Sandoval',
    picker: 'Apolonio Gonzalez',
    repartidor: null,
    fecha_entrega_comprometida: '2026-08-01',
    is_atrasado: false,
    is_sin_stock: false,
    eta_proveedor: null,
    invoice_ready: false,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 2, unit_count: 3 },
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

function sheet(overrides: Partial<OrderPickingSheetResponse> = {}): OrderPickingSheetResponse {
  return {
    order_id: 55,
    editable: false,
    items: [
      { id: 200, reference: 'REF-001', factory_reference: null, description: 'Lampara colgante', location: 'A-01', found_at: null, found_location: null, found_note: null, qty_requested: 2, qty_picked: 0, picking_notes: null },
      { id: 201, reference: 'REF-002', factory_reference: null, description: 'Foco LED', location: 'B-02', found_at: null, found_location: null, found_note: null, qty_requested: 1, qty_picked: 0, picking_notes: null },
    ],
    ...overrides,
  }
}

let resolveMutateMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  resolveMutateMock = vi.fn()
  mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
  mockedUseOrderPickingSheet.mockReturnValue({ data: sheet(), isLoading: false } as unknown as ReturnType<typeof useOrderPickingSheet>)
  mockedUseResolveInventoryReview.mockReturnValue({ mutate: resolveMutateMock, isPending: false } as unknown as ReturnType<typeof useResolveInventoryReview>)
})

describe('InventoryReviewModal', () => {
  it('REQ-317/318 — renderiza los artículos de la hoja, cada fila arranca en "Pendiente"', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    const table = screen.getByTestId('inventory-review-table')
    expect(table).toHaveTextContent('Lampara colgante')
    expect(table).toHaveTextContent('Foco LED')
    expect(screen.getByTestId('inventory-review-status-200')).toHaveValue('pendiente')
    expect(screen.getByTestId('inventory-review-status-201')).toHaveValue('pendiente')
  })

  it('sin columna de ubicación editable — el input "¿Dónde se encontró?" solo aparece cuando la fila está en "Sí hay"', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    expect(screen.queryByTestId('inventory-review-location-200')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'si' } })
    expect(screen.getByTestId('inventory-review-location-200')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'no' } })
    expect(screen.queryByTestId('inventory-review-location-200')).not.toBeInTheDocument()
  })

  it('bloquea el submit con un error general si alguna fila queda "Pendiente"', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'no' } })
    // 201 se deja en "Pendiente".
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(screen.getByTestId('inventory-review-general-error')).toBeInTheDocument()
    expect(resolveMutateMock).not.toHaveBeenCalled()
  })

  it('bloquea el submit con un error por fila si "Sí hay" queda sin ubicación', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'si' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(screen.getByTestId('inventory-review-location-error-200')).toBeInTheDocument()
    expect(resolveMutateMock).not.toHaveBeenCalled()
  })

  it('desenlace "todo Sí hay" — arma el payload con found=true y location para cada ítem', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'si' } })
    fireEvent.change(screen.getByTestId('inventory-review-location-200'), { target: { value: 'A-02' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'si' } })
    fireEvent.change(screen.getByTestId('inventory-review-location-201'), { target: { value: 'B-03' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(resolveMutateMock).toHaveBeenCalledWith(
      {
        orderId: 55,
        decisions: [
          { order_item_id: 200, found: true, location: 'A-02' },
          { order_item_id: 201, found: true, location: 'B-03' },
        ],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('desenlace "todo No hay" — arma el payload con found=false, sin location', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'no' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(resolveMutateMock).toHaveBeenCalledWith(
      {
        orderId: 55,
        decisions: [
          { order_item_id: 200, found: false },
          { order_item_id: 201, found: false },
        ],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('desenlace mixto — un ítem "Sí hay" con ubicación y otro "No hay" arman el payload correcto', () => {
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'si' } })
    fireEvent.change(screen.getByTestId('inventory-review-location-200'), { target: { value: 'A-05' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(resolveMutateMock).toHaveBeenCalledWith(
      {
        orderId: 55,
        decisions: [
          { order_item_id: 200, found: true, location: 'A-05' },
          { order_item_id: 201, found: false },
        ],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('un 422 por ítem (decisions.N.location) se muestra debajo de la fila correspondiente', () => {
    resolveMutateMock.mockImplementation((_vars, { onError }) => {
      onError({
        isAxiosError: true,
        response: { status: 422, data: { message: 'genérico', errors: { 'decisions.0.location': ['La ubicación es obligatoria.'] } } },
      })
    })
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'si' } })
    fireEvent.change(screen.getByTestId('inventory-review-location-200'), { target: { value: 'A-05' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(screen.getByTestId('inventory-review-location-error-200')).toHaveTextContent('La ubicación es obligatoria.')
    expect(screen.queryByTestId('inventory-review-general-error')).not.toBeInTheDocument()
  })

  it('un error sin mapeo por ítem se muestra como error general', () => {
    resolveMutateMock.mockImplementation((_vars, { onError }) => {
      onError({ isAxiosError: true, response: { status: 500, data: { message: 'Error inesperado.' } } })
    })
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'no' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(screen.getByTestId('inventory-review-general-error')).toHaveTextContent('Error inesperado.')
  })

  it('al confirmar con éxito muestra el banner de confirmación', () => {
    resolveMutateMock.mockImplementation((_vars, { onSuccess }) => onSuccess({ id: 55, stage: 'packing' }))
    render(<InventoryReviewModal orderId={55} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('inventory-review-status-200'), { target: { value: 'no' } })
    fireEvent.change(screen.getByTestId('inventory-review-status-201'), { target: { value: 'no' } })
    fireEvent.click(screen.getByTestId('inventory-review-confirm'))

    expect(screen.getByTestId('inventory-review-confirmed-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('inventory-review-confirm')).not.toBeInTheDocument()
  })

  it('el botón "Cerrar" dispara onClose', () => {
    const onClose = vi.fn()
    render(<InventoryReviewModal orderId={55} onClose={onClose} />)
    fireEvent.click(screen.getByText('common:actions.close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
