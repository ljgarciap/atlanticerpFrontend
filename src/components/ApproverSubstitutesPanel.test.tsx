import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ApproverSubstitutesPanel from './ApproverSubstitutesPanel'
import { approverSubstitutesApi } from '@/api/approverSubstitutesApi'
import { usersApi } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/approverSubstitutesApi', () => ({ approverSubstitutesApi: { get: vi.fn(), save: vi.fn() } }))
vi.mock('@/api/usersApi', () => ({ usersApi: { list: vi.fn() } }))

const api = vi.mocked(approverSubstitutesApi, true)
const users = vi.mocked(usersApi, true)

const user = (id: number, first: string) => ({ id, first_name: first, last_name: 'Test', email: `${first.toLowerCase()}@test.com`, is_active: true })

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ApproverSubstitutesPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  users.list.mockResolvedValue({ data: [user(1, 'Titular'), user(2, 'Suplente'), user(3, 'Otra')], meta: {} } as never)
})

describe('ApproverSubstitutesPanel (Fase 12b)', () => {
  it('muestra los titulares y la lista vacía; el titular no se ofrece como candidato', async () => {
    api.get.mockResolvedValue({ titular_compras: 1, titular_admin_contab: 1, suplentes: [] })
    renderPanel()

    expect(await screen.findByText('approversTab.empty')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Titular Test')).toHaveLength(2))
    const opciones = screen.getAllByRole('option').map(o => o.textContent)
    expect(opciones.some(o => o?.includes('titular@test.com'))).toBe(false)
    expect(opciones.some(o => o?.includes('suplente@test.com'))).toBe(true)
  })

  it('agregar envía la lista completa; quitar envía la lista sin esa persona', async () => {
    api.get.mockResolvedValue({ titular_compras: 1, titular_admin_contab: 1, suplentes: [{ id: 2, name: 'Suplente Test', email: 'suplente@test.com' }] })
    api.save.mockResolvedValueOnce({ titular_compras: 1, titular_admin_contab: 1, suplentes: [
      { id: 2, name: 'Suplente Test', email: 'suplente@test.com' }, { id: 3, name: 'Otra Test', email: 'otra@test.com' },
    ] })
    api.save.mockResolvedValueOnce({ titular_compras: 1, titular_admin_contab: 1, suplentes: [{ id: 3, name: 'Otra Test', email: 'otra@test.com' }] })
    renderPanel()

    await screen.findByText('Suplente Test', { exact: false })
    fireEvent.change(screen.getByLabelText('approversTab.addLabel'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('approversTab.add'))
    await waitFor(() => expect(api.save).toHaveBeenCalledWith([2, 3]))

    await waitFor(() => expect(screen.getAllByText('approversTab.remove')).toHaveLength(2))
    fireEvent.click(screen.getAllByText('approversTab.remove')[0])
    await waitFor(() => expect(api.save).toHaveBeenLastCalledWith([3]))
  })

  it('muestra el mensaje del backend si no se puede guardar', async () => {
    api.get.mockResolvedValue({ titular_compras: 1, titular_admin_contab: null, suplentes: [] })
    api.save.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'El aprobador titular no puede ser también suplente.' } } }))
    renderPanel()

    await screen.findByText('approversTab.empty')
    fireEvent.change(screen.getByLabelText('approversTab.addLabel'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('approversTab.add'))
    expect(await screen.findByText('El aprobador titular no puede ser también suplente.')).toBeInTheDocument()
  })
})
