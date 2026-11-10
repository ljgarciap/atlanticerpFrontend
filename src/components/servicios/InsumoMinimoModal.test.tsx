import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InsumoMinimoModal from './InsumoMinimoModal'
import ConfirmModal from '@/components/ConfirmModal'
import { serviciosApi } from '@/api/serviciosApi'
import type { Insumo } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/serviciosApi', () => ({ serviciosApi: { insumos: { updateMinimo: vi.fn() } } }))

const api = vi.mocked(serviciosApi, true)
const insumo = { id: 3, nombre: 'Cinta', minimo: 5 } as Insumo

function renderModal(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><InsumoMinimoModal insumo={insumo} onClose={() => {}} onSaved={onSaved} /></QueryClientProvider>)
  return onSaved
}

beforeEach(() => { vi.clearAllMocks(); api.insumos.updateMinimo.mockResolvedValue(insumo) })

describe('InsumoMinimoModal', () => {
  it('guarda el nuevo mínimo y avisa', async () => {
    const onSaved = renderModal()
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '12' } })
    fireEvent.click(screen.getByText('insumos.minimoModal.save'))
    await waitFor(() => expect(api.insumos.updateMinimo).toHaveBeenCalledWith(3, 12))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('no deja guardar un mínimo negativo o decimal', () => {
    renderModal()
    const save = screen.getByText('insumos.minimoModal.save').closest('button') as HTMLButtonElement
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '-1' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByDisplayValue('-1'), { target: { value: '2.5' } })
    expect(save).toBeDisabled()
  })
})

describe('ConfirmModal', () => {
  it('muestra el error del servidor y confirma/cancela por separado', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn()
    render(<ConfirmModal title="t" message="¿Seguro?" confirmLabel="Sí" cancelLabel="No" error="Asignada a un técnico" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByTestId('confirm-modal-error')).toHaveTextContent('Asignada a un técnico')
    fireEvent.click(screen.getByTestId('confirm-modal-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('No'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
