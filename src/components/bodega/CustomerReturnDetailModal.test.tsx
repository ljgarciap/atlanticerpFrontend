import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CustomerReturnDetailModal from './CustomerReturnDetailModal'
import { bodegaApi } from '@/api/bodegaApi'
import type { CustomerReturnDetail } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: { returns: { detail: vi.fn() } },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerReturnDetailModal id={1} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('CustomerReturnDetailModal', () => {
  it('muestra el texto libre del motivo cuando reason es "otra" y trae reason_detail', async () => {
    const detail: CustomerReturnDetail = {
      id: 1, return_number: 'DEV-1', order_id: 10, order_number: '2201', customer_name: 'Hotel Riu Panamá', project: 'Torre Marina Bahía',
      status: 'pendiente', has_signed_document: true, contact_name: 'Camila Rojas', contact_phone: '+507 6000-0000',
      destination_warehouse: null, created_at: '2026-07-09T10:00:00Z', received_at: null, finalized_at: null,
      rejected_at: null, rejection_reason: null,
      products: [
        { id: 200, order_item_id: 950, reference: 'AMBAR-E27', description: 'Bombillo decorativo E27 Ámbar', qty_requested: 2, qty_received: null, reason: 'otra', reason_detail: 'Cliente pidió color distinto al catálogo.' },
      ],
      history: [{ step: 'created', label: 'Devolución solicitada', at: '2026-07-09T10:00:00Z', by: 'Jorge P.' }],
    }
    mockedApi.returns.detail.mockResolvedValue(detail)
    renderModal()

    expect(await screen.findByText('Cliente pidió color distinto al catálogo.')).toBeInTheDocument()
    expect(screen.getByText(/Jorge P\./)).toBeInTheDocument()
    expect(screen.getByText(/Torre Marina Bahía/)).toBeInTheDocument()
  })

  it('el historial muestra la bodega destino y el motivo de rechazo cuando el backend los envía', async () => {
    const detail: CustomerReturnDetail = {
      id: 1, return_number: 'DEV-1', order_id: 10, order_number: '2201', customer_name: 'Hotel Riu Panamá', project: null,
      status: 'rechazada', has_signed_document: true, contact_name: 'Camila Rojas', contact_phone: '+507 6000-0000',
      destination_warehouse: null, created_at: '2026-07-09T10:00:00Z', received_at: '2026-07-10T10:00:00Z', finalized_at: null,
      rejected_at: '2026-07-11T10:00:00Z', rejection_reason: 'Producto llegó dañado más allá de lo aceptable', products: [],
      history: [
        { step: 'received', label: 'Recepción física confirmada', at: '2026-07-10T10:00:00Z', by: 'Esteban C.', destination_warehouse: 'Merma, Reclamos y Devoluciones' },
        { step: 'rejected', label: 'Rechazada', at: '2026-07-11T10:00:00Z', by: 'Esteban C.', reason: 'Producto llegó dañado más allá de lo aceptable' },
      ],
    }
    mockedApi.returns.detail.mockResolvedValue(detail)
    renderModal()

    expect(await screen.findByText(/Merma, Reclamos y Devoluciones/)).toBeInTheDocument()
    expect(screen.getByText(/Producto llegó dañado más allá de lo aceptable/)).toBeInTheDocument()
  })

  it('sin historial muestra el mensaje "sin historial"', async () => {
    const detail: CustomerReturnDetail = {
      id: 1, return_number: 'DEV-1', order_id: 10, order_number: '2201', customer_name: 'Hotel Riu Panamá', project: null,
      status: 'pendiente', has_signed_document: false, contact_name: 'Camila Rojas', contact_phone: '+507 6000-0000',
      destination_warehouse: null, created_at: '2026-07-09T10:00:00Z', received_at: null, finalized_at: null,
      rejected_at: null, rejection_reason: null, products: [], history: [],
    }
    mockedApi.returns.detail.mockResolvedValue(detail)
    renderModal()

    expect(await screen.findByText('bodega:returns.detailModal.noHistory')).toBeInTheDocument()
  })
})
