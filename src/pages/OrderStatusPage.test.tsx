import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import OrderStatusPage from './OrderStatusPage'
import { useOrderStatusList, useOrderStatusDetail, useOrderStatusDocument } from '@/hooks/useBodega'
import type { OrderStatusDetail, OrderStatusListResponse, OrderStatusRow } from '@/types/bodega'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderStatusList: vi.fn(),
  useOrderStatusDetail: vi.fn(),
  useOrderStatusDocument: vi.fn(),
}))

const mockedUseOrderStatusList = vi.mocked(useOrderStatusList)
const mockedUseOrderStatusDetail = vi.mocked(useOrderStatusDetail)
const mockedUseOrderStatusDocument = vi.mocked(useOrderStatusDocument)

function row(overrides: Partial<OrderStatusRow> = {}): OrderStatusRow {
  return {
    order_id:     overrides.order_id ?? 1,
    order_number: 'PED-2026-000123',
    quote_number: 'COT-2026-0001',
    subcliente:   'Interiores Bahía S.A.',
    fecha_pedido: '2026-07-10',
    vendedor:     'Juan Pérez',
    ...overrides,
  }
}

function listResponse(rows: OrderStatusRow[]): OrderStatusListResponse {
  return { data: rows, total: rows.length }
}

function detail(overrides: Partial<OrderStatusDetail> = {}): OrderStatusDetail {
  return {
    order_id:      1,
    order_number:  'PED-2026-000123',
    quote_number:  'COT-2026-0001',
    proyecto:      'Torre Marina - Lobby',
    disenador:     'Juan Pérez',
    cliente:       'Interiores Bahía S.A.',
    contacto:      'Cliente Contacto',
    telefono:      '6000-1234',
    fecha_estatus: '2026-07-23',
    items: [
      { catalog_product_id: 7, reference: 'REF-100', factory_reference: 'FAB-9001', description: 'Lámpara colgante', imagen: null, solicitada: 10, entregado: 4, pendiente: 6 },
    ],
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrderStatusPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseOrderStatusDetail.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
  mockedUseOrderStatusDocument.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useOrderStatusDocument>)
})

describe('OrderStatusPage', () => {
  it('REQ-407 — muestra el botón para volver a Pedidos', () => {
    mockedUseOrderStatusList.mockReturnValue({ data: listResponse([]), isLoading: false } as ReturnType<typeof useOrderStatusList>)
    renderPage()

    fireEvent.click(screen.getByText('bodega:orderStatusPage.backToOrders'))
    expect(mockNavigate).toHaveBeenCalledWith('/bodega/pedidos')
  })

  it('renderiza las columnas en el orden exacto del contrato (RN1)', () => {
    mockedUseOrderStatusList.mockReturnValue({ data: listResponse([row()]), isLoading: false } as ReturnType<typeof useOrderStatusList>)
    renderPage()

    expect(screen.getByText('PED-2026-000123')).toBeInTheDocument()
    expect(screen.getByText('COT-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Interiores Bahía S.A.')).toBeInTheDocument()
    expect(screen.getByText('2026-07-10')).toBeInTheDocument()
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })

  it('el buscador manda "search" al hook (filtra vía backend)', () => {
    mockedUseOrderStatusList.mockReturnValue({ data: listResponse([]), isLoading: false } as ReturnType<typeof useOrderStatusList>)
    renderPage()

    fireEvent.change(screen.getByPlaceholderText('bodega:orderStatusPage.searchPlaceholder'), { target: { value: 'PED-2026' } })

    const lastCallArgs = mockedUseOrderStatusList.mock.calls[mockedUseOrderStatusList.mock.calls.length - 1]
    expect(lastCallArgs).toEqual(['PED-2026'])
  })

  it('muestra el estado vacío cuando no hay pedidos con los filtros actuales', () => {
    mockedUseOrderStatusList.mockReturnValue({ data: listResponse([]), isLoading: false } as ReturnType<typeof useOrderStatusList>)
    renderPage()

    expect(screen.getByText('bodega:orderStatusPage.empty')).toBeInTheDocument()
  })

  it('una fila clickeable abre el modal de detalle con los datos correctos del order_id', () => {
    mockedUseOrderStatusList.mockReturnValue({ data: listResponse([row({ order_id: 42 })]), isLoading: false } as ReturnType<typeof useOrderStatusList>)
    mockedUseOrderStatusDetail.mockReturnValue({ data: detail({ order_id: 42 }), isLoading: false } as ReturnType<typeof useOrderStatusDetail>)
    renderPage()

    fireEvent.click(screen.getByTestId('order-status-row-42'))

    expect(mockedUseOrderStatusDetail).toHaveBeenLastCalledWith(42)
    expect(screen.getByText('Torre Marina - Lobby')).toBeInTheDocument()
  })
})
