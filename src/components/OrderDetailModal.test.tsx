import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import OrderDetailModal from './OrderDetailModal'
import { useOrderDetail, useOrderWarehouseBreakdown, useExportOrderItemsExcel } from '@/hooks/useBodega'
import type { OrderDetail, OrderWarehouseBreakdownResponse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderDetail: vi.fn(),
  useOrderWarehouseBreakdown: vi.fn(),
  useExportOrderItemsExcel: vi.fn(),
}))

const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderWarehouseBreakdown = vi.mocked(useOrderWarehouseBreakdown)
const mockedUseExportOrderItemsExcel = vi.mocked(useExportOrderItemsExcel)

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 1,
    order_number: '2205',
    order_type: 'pedido',
    stage: 'en_picking',
    proyecto: 'Torre Azul',
    cliente: 'Constructora Pacífico',
    vendedor: 'Mark',
    asistente: 'Mariano Sandoval',
    picker: null,
    repartidor: null,
    fecha_entrega_comprometida: '2026-08-01',
    is_atrasado: false,
    is_sin_stock: false,
    invoice_ready: false,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 1, unit_count: 2 },
    items: [
      { id: 10, catalog_product_id: 1, reference: 'CAND-01', factory_reference: null, description: 'Candelabro', location: 'A-1', qty_requested: 2, qty_reserved: 2, qty_picked: 0, qty_delivered: 0, shortage_reason: null },
    ],
    documents: [],
    eta_proveedor: null,
    contacto_cliente: null,
    contacto_telefono: null,
    contacto_correo: null,
    direccion_entrega: null,
    cliente_master: 'Constructora Pacífico Holdings',
    subcliente: 'Constructora Pacífico',
    ...overrides,
  }
}

function breakdown(overrides: Partial<OrderWarehouseBreakdownResponse> = {}): OrderWarehouseBreakdownResponse {
  return {
    order_id: 1,
    products: {
      1: { por_servir: 2, warehouses: [{ warehouse_id: 1, name: 'Bodega Central', quantity: 5 }, { warehouse_id: 2, name: 'Bodega Norte', quantity: 0 }] },
    },
    ...overrides,
  }
}

let exportMutateMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseOrderWarehouseBreakdown.mockReturnValue({ data: breakdown(), isLoading: false } as unknown as ReturnType<typeof useOrderWarehouseBreakdown>)
  exportMutateMock = vi.fn()
  mockedUseExportOrderItemsExcel.mockReturnValue({ mutate: exportMutateMock, isPending: false } as unknown as ReturnType<typeof useExportOrderItemsExcel>)
})

describe('OrderDetailModal', () => {
  it('RN1 — la tabla de artículos arranca colapsada y solo se expande con clic explícito', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    expect(screen.queryByText('CAND-01')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('toggle-items'))
    expect(screen.getByText('CAND-01')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('toggle-items'))
    expect(screen.queryByText('CAND-01')).not.toBeInTheDocument()
  })

  it('REQ-336 RN1 — el ETA de proveedor solo se muestra cuando el backend lo entrega (tarjetas "Sin stock")', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ eta_proveedor: null }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    const { rerender } = render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)
    expect(screen.queryByText('bodega:pedidos.detailModal.supplierEta')).not.toBeInTheDocument()

    mockedUseOrderDetail.mockReturnValue({
      data: detail({ eta_proveedor: '2026-08-10' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    rerender(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)
    expect(screen.getByText('bodega:pedidos.detailModal.supplierEta')).toBeInTheDocument()
  })

  it('REQ-332 — muestra contacto, dirección de entrega y referencia de fábrica cuando el backend los entrega', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        contacto_cliente: 'Juan Pérez (6000-1234)',
        direccion_entrega: 'Av. Balboa, Ciudad de Panamá',
        items: [
          { id: 10, catalog_product_id: 1, reference: 'CAND-01', factory_reference: 'FAB-9001', description: 'Candelabro', location: 'A-1', qty_requested: 2, qty_reserved: 2, qty_picked: 0, qty_delivered: 0, shortage_reason: null },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    expect(screen.getByText('Juan Pérez (6000-1234)')).toBeInTheDocument()
    expect(screen.getByText('Av. Balboa, Ciudad de Panamá')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('toggle-items'))
    expect(screen.getByText('FAB-9001')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-402) — título es el proyecto/cliente con la etapa como subtítulo, no "Pedido #N"', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ proyecto: 'Oficinas Aseguradora Mundial', stage: 'despachado' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Oficinas Aseguradora Mundial' })).toBeInTheDocument()
    expect(screen.getByText('bodega:pedidos.detailModal.stageSubtitle:{"stage":"bodega:pedidos.stages.despachado"}')).toBeInTheDocument()
    // el N° de pedido baja a ser una fila más del cuerpo, no el título.
    expect(screen.getByText('2205')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-402) — muestra teléfono/correo separados y el resumen como agregado de productos/unidades', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        contacto_telefono: '6000-1234',
        contacto_correo: 'juan.perez@example.com',
        items_summary: { product_count: 3, unit_count: 9 },
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    expect(screen.getByText('6000-1234')).toBeInTheDocument()
    expect(screen.getByText('juan.perez@example.com')).toBeInTheDocument()
    expect(screen.getByText('bodega:pedidos.detailModal.summaryAggregate:{"products":3,"units":9}')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-402) — la tabla de artículos expandida muestra el nombre del artículo', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    fireEvent.click(screen.getByTestId('toggle-items'))
    expect(screen.getByText('Candelabro')).toBeInTheDocument()
  })

  it('llama onClose al presionar Escape', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    const onClose = vi.fn()
    render(<OrderDetailModal orderId={1} onClose={onClose} onOpenPickingSheet={vi.fn()} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-403 (REQ-333) — RN1: "Ver bodegas" solo muestra las bodegas con stock registrado (quantity > 0), no todas', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    fireEvent.click(screen.getByTestId('toggle-items'))
    fireEvent.click(screen.getByTestId('view-warehouses-10'))

    const list = screen.getByTestId('warehouses-list')
    expect(list).toHaveTextContent('Bodega Central')
    expect(list).toHaveTextContent('5')
    expect(list).not.toHaveTextContent('Bodega Norte')
  })

  it('SCRUM-403 — deshabilita "Ver bodegas" para ítems personalizados sin catalog_product_id', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        items: [
          { id: 11, catalog_product_id: null, reference: null, factory_reference: null, description: 'Ítem personalizado', location: null, qty_requested: 1, qty_reserved: 0, qty_picked: 0, qty_delivered: 0, shortage_reason: null },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    fireEvent.click(screen.getByTestId('toggle-items'))
    expect(screen.getByTestId('view-warehouses-11')).toBeDisabled()
  })

  it('SCRUM-390 (REQ-320 RN1) — el botón de descarga Excel dispara useExportOrderItemsExcel con el order id', () => {
    const blob = new Blob(['xlsx-bytes'])
    exportMutateMock.mockImplementation((_orderId, { onSuccess }) => onSuccess(blob))
    // jsdom no implementa URL.createObjectURL/revokeObjectURL — se definen ad-hoc para el test.
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, configurable: true })

    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    fireEvent.click(screen.getByTestId('toggle-items'))
    fireEvent.click(screen.getByTestId('export-excel-button'))

    expect(exportMutateMock).toHaveBeenCalledWith(1, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(createObjectURLMock).toHaveBeenCalledWith(blob)
    expect(revokeObjectURLMock).toHaveBeenCalled()
  })

  it('Pre-QA 2026-07-26 (CRÍTICO, SCRUM-385 Escenario 2) — muestra "Ver hoja de picking" cuando el pedido ya tuvo un picker asignado y llama a onOpenPickingSheet con el orderId', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ picker: 'Ana Ríos', stage: 'packing' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    const onOpenPickingSheet = vi.fn()
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={onOpenPickingSheet} />)

    const button = screen.getByTestId('view-picking-sheet-button')
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onOpenPickingSheet).toHaveBeenCalledWith(1)
  })

  it('Pre-QA 2026-07-26 (CRÍTICO) — NO muestra "Ver hoja de picking" si nunca se asignó picker (picker null)', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ picker: null, stage: 'asignado' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<OrderDetailModal orderId={1} onClose={vi.fn()} onOpenPickingSheet={vi.fn()} />)

    expect(screen.queryByTestId('view-picking-sheet-button')).not.toBeInTheDocument()
  })
})
