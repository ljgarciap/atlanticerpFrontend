import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import OrderStatusDetailModal from './OrderStatusDetailModal'
import { useOrderStatusDetail, useOrderStatusDocument } from '@/hooks/useBodega'
import type { OrderStatusDetail } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderStatusDetail: vi.fn(),
  useOrderStatusDocument: vi.fn(),
}))

const mockedUseOrderStatusDetail = vi.mocked(useOrderStatusDetail)
const mockedUseOrderStatusDocument = vi.mocked(useOrderStatusDocument)

function detail(overrides: Partial<OrderStatusDetail> = {}): OrderStatusDetail {
  return {
    order_id:      42,
    order_number:  'PED-2026-000123',
    quote_number:  'COT-2026-0001',
    proyecto:      'Torre Marina - Lobby',
    disenador:     'Juan Pérez',
    cliente:       'Interiores Bahía S.A.',
    contacto:      'Cliente Contacto',
    telefono:      '6000-1234',
    fecha_estatus: '2026-07-23',
    items: [
      { catalog_product_id: 7, reference: 'REF-100', factory_reference: 'FAB-9001', description: 'Lámpara colgante', imagen: 'https://example.com/photo.jpg', solicitada: 10, entregado: 4, pendiente: 6 },
    ],
    ...overrides,
  }
}

let mutateMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mutateMock = vi.fn()
  mockedUseOrderStatusDocument.mockReturnValue({ mutate: mutateMock, isPending: false } as unknown as ReturnType<typeof useOrderStatusDocument>)
})

describe('OrderStatusDetailModal', () => {
  it('muestra los datos generales del pedido (proyecto/diseñador/cliente/contacto/teléfono/fecha de estatus)', () => {
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    expect(screen.getByText('Torre Marina - Lobby')).toBeInTheDocument()
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('Interiores Bahía S.A.')).toBeInTheDocument()
    expect(screen.getByText('Cliente Contacto')).toBeInTheDocument()
    expect(screen.getByText('6000-1234')).toBeInTheDocument()
    expect(screen.getByText('2026-07-23')).toBeInTheDocument()
  })

  it('la tabla de productos muestra solicitada/entregado/pendiente ya consolidados, sin recalcular', () => {
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    const row = screen.getByTestId('order-status-item-row')
    expect(row).toHaveTextContent('REF-100')
    expect(row).toHaveTextContent('Lámpara colgante')
    expect(row).toHaveTextContent('10')
    expect(row).toHaveTextContent('4')
    expect(screen.getByTestId('order-status-item-pending')).toHaveTextContent('6')
  })

  it('pedido completo → pendiente 0 en todas las líneas, sin ningún estado visual especial', () => {
    mockedUseOrderStatusDetail.mockReturnValue({
      data: detail({
        items: [
          { catalog_product_id: 7, reference: 'REF-100', factory_reference: 'FAB-9001', description: 'Lámpara colgante', imagen: null, solicitada: 10, entregado: 10, pendiente: 0 },
          { catalog_product_id: 8, reference: 'REF-200', factory_reference: 'FAB-9002', description: 'Riel LED', imagen: null, solicitada: 5, entregado: 5, pendiente: 0 },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    const pendingCells = screen.getAllByTestId('order-status-item-pending')
    expect(pendingCells).toHaveLength(2)
    pendingCells.forEach(cell => expect(cell).toHaveTextContent('0'))
  })

  it('sin imagen muestra el ícono de fallback en vez de un <img> roto', () => {
    mockedUseOrderStatusDetail.mockReturnValue({
      data: detail({ items: [{ catalog_product_id: 7, reference: 'REF-100', factory_reference: null, description: 'Lámpara colgante', imagen: null, solicitada: 10, entregado: 4, pendiente: 6 }] }),
      isLoading: false,
    } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('con imagen, la renderiza como <img> con el src del backend', () => {
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo.jpg')
  })

  it('el botón Ver/Descargar dispara la generación del documento con el order_id correcto y abre la URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    mutateMock.mockImplementation((_orderId, { onSuccess }) => {
      onSuccess({ document_id: 15, order_id: 42, url: 'https://s3.example.com/estatus-pedido.pdf' })
    })
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('view-document-button'))

    expect(mutateMock).toHaveBeenCalledWith(42, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(openSpy).toHaveBeenCalledWith('https://s3.example.com/estatus-pedido.pdf', '_blank', 'noopener,noreferrer')
    openSpy.mockRestore()
  })

  it('no muestra ningún control de edición (solo lectura para todos los perfiles)', () => {
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    render(<OrderStatusDetailModal orderId={42} onClose={vi.fn()} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/guardar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/editar/i)).not.toBeInTheDocument()
  })
})
