import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ConfirmReturnReceptionModal from './ConfirmReturnReceptionModal'
import { bodegaApi } from '@/api/bodegaApi'
import type { CustomerReturnDetail, PhysicalWarehouse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    returns: { detail: vi.fn(), confirmReception: vi.fn(), reject: vi.fn() },
    warehouses: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente' },
  { id: 2, name: 'Merma', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente' },
]

function detailFixture(): CustomerReturnDetail {
  return {
    id: 1, return_number: 'DEV-1', order_id: 10, order_number: '2201', customer_name: 'Constructora Pacífico SA',
    project: null, status: 'pendiente', has_signed_document: true, contact_name: 'Ricardo Aguilar', contact_phone: '+507 6220-1145',
    destination_warehouse: null, created_at: '2026-07-11T10:00:00Z', received_at: null, finalized_at: null,
    rejected_at: null, rejection_reason: null, history: [],
    products: [
      { id: 100, order_item_id: 900, reference: 'NORDIC-40', description: 'Lámpara colgante Nordic 40cm', qty_requested: 3, qty_received: null, reason: 'danado_defectuoso', reason_detail: null },
    ],
  }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { onClose, ...render(
    <QueryClientProvider client={queryClient}>
      <ConfirmReturnReceptionModal id={1} onClose={onClose} />
    </QueryClientProvider>,
  ) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.returns.detail.mockResolvedValue(detailFixture())
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
})

describe('ConfirmReturnReceptionModal', () => {
  it('precarga la cantidad real recibida con la cantidad solicitada', async () => {
    renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    expect(screen.getByRole('spinbutton')).toHaveValue(3)
  })

  it('guardar confirma la recepción con las líneas y la bodega elegidas', async () => {
    mockedApi.returns.confirmReception.mockResolvedValue({} as CustomerReturnDetail)
    const { onClose } = renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.click(screen.getByText('bodega:returns.receptionModal.save'))

    await waitFor(() => expect(mockedApi.returns.confirmReception).toHaveBeenCalledWith(1, {
      destination_warehouse_id: 1,
      lines: [{ customer_return_line_id: 100, qty_received: 3 }],
    }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('REQ-411 RN2 — el primer clic en "Rechazar devolución" solo revela el motivo, sin enviar nada', async () => {
    renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.click(screen.getByText('bodega:returns.receptionModal.reject'))

    expect(screen.getByPlaceholderText('bodega:returns.receptionModal.rejectReasonPlaceholder')).toBeInTheDocument()
    expect(mockedApi.returns.reject).not.toHaveBeenCalled()
    expect(screen.getByText('bodega:returns.receptionModal.confirmReject')).toBeInTheDocument()
  })

  it('REQ-411 RN2 — el segundo clic sin motivo escrito no confirma el rechazo', async () => {
    renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.click(screen.getByText('bodega:returns.receptionModal.reject'))

    fireEvent.click(screen.getByText('bodega:returns.receptionModal.confirmReject'))

    expect(await screen.findByText('bodega:returns.receptionModal.errors.rejectReasonRequired')).toBeInTheDocument()
    expect(mockedApi.returns.reject).not.toHaveBeenCalled()
  })

  it('REQ-411 RN2 — el segundo clic con motivo escrito sí confirma el rechazo', async () => {
    mockedApi.returns.reject.mockResolvedValue({} as CustomerReturnDetail)
    const { onClose } = renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.click(screen.getByText('bodega:returns.receptionModal.reject'))

    fireEvent.change(screen.getByPlaceholderText('bodega:returns.receptionModal.rejectReasonPlaceholder'), {
      target: { value: 'El producto llegó en perfecto estado.' },
    })
    fireEvent.click(screen.getByText('bodega:returns.receptionModal.confirmReject'))

    await waitFor(() => expect(mockedApi.returns.reject).toHaveBeenCalledWith(1, {
      rejection_reason: 'El producto llegó en perfecto estado.',
    }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('guardar sin cantidad válida muestra error y no llama al backend', async () => {
    renderModal()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    fireEvent.click(screen.getByText('bodega:returns.receptionModal.save'))

    expect(await screen.findByText('bodega:returns.receptionModal.errors.invalidQuantity')).toBeInTheDocument()
    expect(mockedApi.returns.confirmReception).not.toHaveBeenCalled()
  })
})
