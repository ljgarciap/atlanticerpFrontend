import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RegisterSignedGuideModal from './RegisterSignedGuideModal'
import { useTeamMembersByRole, useRegisterSignedGuide } from '@/hooks/useBodega'
import type { OrderCard } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useTeamMembersByRole: vi.fn(),
  useRegisterSignedGuide: vi.fn(),
}))

const mockedUseTeamMembersByRole = vi.mocked(useTeamMembersByRole)
const mockedUseRegisterSignedGuide = vi.mocked(useRegisterSignedGuide)
let mutateMock: ReturnType<typeof vi.fn>

function order(overrides: Partial<OrderCard> = {}): OrderCard {
  return {
    id: 24, order_number: '2401', order_type: 'pedido', stage: 'despachado',
    proyecto: 'Torre Azul', cliente: 'Constructora Pacífico', vendedor: 'Mark',
    asistente: 'Mariano Sandoval', picker: 'Apolonio Gonzalez', repartidor: 'Gary Arrocha',
    fecha_entrega_comprometida: '2026-08-01', is_atrasado: false, is_sin_stock: false,
    eta_proveedor: null, invoice_ready: true,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 2, unit_count: 15 },
    ...overrides,
  }
}

function makeFile(name: string, sizeBytes: number, type = 'image/png'): File {
  const file = new File(['x'.repeat(Math.min(sizeBytes, 10))], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  mutateMock = vi.fn()
  mockedUseTeamMembersByRole.mockReturnValue({
    data: { data: [{ id: 30, name: 'Gary Arrocha' }, { id: 31, name: 'Otro Repartidor' }] },
  } as unknown as ReturnType<typeof useTeamMembersByRole>)
  mockedUseRegisterSignedGuide.mockReturnValue({ mutate: mutateMock, isPending: false } as unknown as ReturnType<typeof useRegisterSignedGuide>)
})

describe('RegisterSignedGuideModal', () => {
  it('preselecciona "quién entregó" con el repartidor ya asignado al pedido (match por nombre)', () => {
    render(<RegisterSignedGuideModal order={order({ repartidor: 'Gary Arrocha' })} onClose={vi.fn()} />)

    const select = screen.getByTestId('signed-guide-courier-select') as HTMLSelectElement
    expect(select.value).toBe('30')
  })

  it('RN (REQ-329) — bloquea el guardado sin "quién recibió" ni archivo (campos en rojo)', () => {
    render(<RegisterSignedGuideModal order={order()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByTestId('signed-guide-confirm'))

    expect(screen.getByTestId('signed-guide-received-by-error')).toBeInTheDocument()
    expect(screen.getByTestId('signed-guide-file-error')).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('rechaza un archivo con extensión no permitida antes de intentar guardar', () => {
    render(<RegisterSignedGuideModal order={order()} onClose={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const badFile = makeFile('guia.docx', 1024, 'application/msword')
    fireEvent.change(input, { target: { files: [badFile] } })

    expect(screen.getByTestId('signed-guide-file-error')).toHaveTextContent('invalidType')
  })

  it('rechaza un archivo que supera 20MB', () => {
    render(<RegisterSignedGuideModal order={order()} onClose={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = makeFile('guia.pdf', 21 * 1024 * 1024, 'application/pdf')
    fireEvent.change(input, { target: { files: [bigFile] } })

    expect(screen.getByTestId('signed-guide-file-error')).toHaveTextContent('tooLarge')
  })

  it('con datos válidos, dispara useRegisterSignedGuide con delivered_by_courier_id/received_by_name/file', () => {
    render(<RegisterSignedGuideModal order={order({ repartidor: 'Gary Arrocha' })} onClose={vi.fn()} />)

    fireEvent.change(screen.getByTestId('signed-guide-received-by-input'), { target: { value: 'María Fernández' } })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('guia-firmada.pdf', 2048, 'application/pdf')
    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(screen.getByTestId('signed-guide-confirm'))

    expect(mutateMock).toHaveBeenCalledWith(
      {
        orderId: 24,
        payload: { delivered_by_courier_id: 30, received_by_name: 'María Fernández', file },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('un error real del backend se muestra inline', () => {
    mutateMock.mockImplementation((_vars, { onError }) => {
      onError({ isAxiosError: true, response: { status: 422, data: { message: 'El pedido no está en la etapa Despachado.', errors: { order: ['El pedido no está en la etapa Despachado.'] } } } })
    })
    render(<RegisterSignedGuideModal order={order({ repartidor: 'Gary Arrocha' })} onClose={vi.fn()} />)

    fireEvent.change(screen.getByTestId('signed-guide-received-by-input'), { target: { value: 'María Fernández' } })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('guia.pdf', 1024, 'application/pdf')] } })

    fireEvent.click(screen.getByTestId('signed-guide-confirm'))

    expect(screen.getByTestId('signed-guide-general-error')).toHaveTextContent('El pedido no está en la etapa Despachado.')
  })
})
