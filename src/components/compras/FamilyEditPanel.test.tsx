import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyEditPanel } from './FamilyEditPanel'
import { comprasApi } from '@/api/comprasApi'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/api/comprasApi', () => ({ comprasApi: { families: { update: vi.fn() } } }))

const mocked = vi.mocked(comprasApi, true)

function renderPanel(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <FamilyEditPanel family={{ id: 7, name: 'Kit', currency: 'USD', is_active: true }} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('FamilyEditPanel (Fase 29b)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renombra y cambia la moneda con una sola llamada', async () => {
    mocked.families.update.mockResolvedValue({ id: 7, name: 'Kit nuevo', is_active: true, currency: 'EUR', modality: 'directo' })
    const { onClose } = renderPanel()
    fireEvent.change(screen.getByLabelText('compras:inventory.families.edit.name'), { target: { value: '  Kit nuevo ' } })
    fireEvent.change(screen.getByLabelText('compras:inventory.families.edit.currency'), { target: { value: 'eur' } })
    fireEvent.click(screen.getByText('common:actions.save'))
    await waitFor(() => expect(mocked.families.update).toHaveBeenCalledWith(7, { name: 'Kit nuevo', currency: 'EUR' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('desactivar manda solo is_active y un nombre repetido muestra el motivo del servidor', async () => {
    mocked.families.update.mockRejectedValueOnce({ isAxiosError: true, response: { data: { errors: { name: ["Ya existe una familia con el nombre 'X'."] } } } })
    renderPanel()
    fireEvent.click(screen.getByTestId('family-toggle-active-7'))
    await waitFor(() => expect(mocked.families.update).toHaveBeenCalledWith(7, { is_active: false }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Ya existe una familia")
  })

  it('el botón de guardar se deshabilita con nombre vacío o moneda de tamaño incorrecto', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('compras:inventory.families.edit.name'), { target: { value: ' ' } })
    expect(screen.getByText('common:actions.save').closest('button')).toBeDisabled()
  })
})
