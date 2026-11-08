import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProcessApproversPanel from './ProcessApproversPanel'
import { processApproversApi, type ProcessApprovers } from '@/api/approverSubstitutesApi'
import { usersApi } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/approverSubstitutesApi', () => ({ processApproversApi: { get: vi.fn(), save: vi.fn() } }))
vi.mock('@/api/usersApi', () => ({ usersApi: { list: vi.fn() } }))

const api = vi.mocked(processApproversApi, true)
const users = vi.mocked(usersApi, true)
const user = (id: number, first: string) => ({ id, first_name: first, last_name: 'Test', email: `${first.toLowerCase()}@test.com`, is_active: true })

function estado(over: Partial<ProcessApprovers['processes']> = {}): ProcessApprovers {
  const vacio = { user_ids: [] as number[], sigue_al_primario: true }
  return { processes: { caja_chica: vacio, arqueo: vacio, anulacion_cobro: vacio, nota_credito: vacio, ...over } }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ProcessApproversPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  users.list.mockResolvedValue({ data: [user(1, 'Ana'), user(2, 'Beto')], meta: {} } as never)
})

describe('ProcessApproversPanel (Fase 28)', () => {
  it('lista los 4 procesos y, sin aprobadores propios, indica que siguen al primario', async () => {
    api.get.mockResolvedValue(estado())
    renderPanel()

    expect(await screen.findAllByText('processApprovers.followsPrimary')).toHaveLength(4)
    for (const p of ['caja_chica', 'arqueo', 'anulacion_cobro', 'nota_credito']) {
      expect(screen.getByRole('region', { name: `processApprovers.processes.${p}` })).toBeInTheDocument()
    }
  })

  it('agrega un aprobador propio a un proceso y envía la lista completa de ese proceso', async () => {
    api.get.mockResolvedValue(estado({ arqueo: { user_ids: [1], sigue_al_primario: false } }))
    api.save.mockResolvedValue(estado({ arqueo: { user_ids: [1, 2], sigue_al_primario: false } }))
    renderPanel()

    const arqueo = await screen.findByRole('region', { name: 'processApprovers.processes.arqueo' })
    await waitFor(() => expect(within(arqueo).getByText('Ana Test')).toBeInTheDocument())
    fireEvent.change(within(arqueo).getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(within(arqueo).getByText('processApprovers.add'))

    await waitFor(() => expect(api.save).toHaveBeenCalledWith('arqueo', [1, 2]))
  })

  it('quitar al último aprobador envía lista vacía (el proceso vuelve al primario)', async () => {
    api.get.mockResolvedValue(estado({ caja_chica: { user_ids: [1], sigue_al_primario: false } }))
    api.save.mockResolvedValue(estado())
    renderPanel()

    const caja = await screen.findByRole('region', { name: 'processApprovers.processes.caja_chica' })
    fireEvent.click(await within(caja).findByText('processApprovers.remove'))

    await waitFor(() => expect(api.save).toHaveBeenCalledWith('caja_chica', []))
  })
})
