import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AssistantMappingPanel from './AssistantMappingPanel'
import { bodegaApi } from '@/api/bodegaApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${Object.values(opts).join(',')}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    assistantMapping: { list: vi.fn(), set: vi.fn(), remove: vi.fn(), reassignPending: vi.fn() },
    teamMembers: { byRole: vi.fn() },
  },
}))

const api = vi.mocked(bodegaApi, true)

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><AssistantMappingPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.assistantMapping.list.mockResolvedValue([{ id: 7, seller_id: 1, seller_name: 'Vendedor Test', assistant_id: 2, assistant_name: 'Asistente Test' }])
  api.teamMembers.byRole.mockImplementation(async (role) => ({
    data: role === 'vendedor' ? [{ id: 1, name: 'Vendedor Test' }, { id: 3, name: 'Vendedor Test 2' }] : [{ id: 2, name: 'Asistente Test' }],
  }))
})

describe('AssistantMappingPanel', () => {
  it('lista el mapeo actual', async () => {
    renderPanel()
    expect(await screen.findByTestId('mapping-row-7')).toHaveTextContent('Vendedor Test')
    expect(screen.getByTestId('mapping-row-7')).toHaveTextContent('Asistente Test')
  })

  it('guarda un mapeo nuevo con el vendedor y el asistente elegidos', async () => {
    api.assistantMapping.set.mockResolvedValue({ id: 8 })
    renderPanel()
    await screen.findByTestId('mapping-row-7')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Vendedor Test 2' })).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('mapping-seller'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('mapping-assistant'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('mapping-save'))
    await waitFor(() => expect(api.assistantMapping.set).toHaveBeenCalledWith(3, 2))
  })

  it('reasignar pendientes es una acción explícita y muestra cuántos pedidos pasó', async () => {
    api.assistantMapping.reassignPending.mockResolvedValue({ reasignados: 4, assistant_id: 2 })
    renderPanel()
    fireEvent.click(await screen.findByTestId('mapping-reassign-7'))
    await waitFor(() => expect(api.assistantMapping.reassignPending).toHaveBeenCalledWith(1))
    expect(await screen.findByTestId('mapping-reassigned')).toHaveTextContent('4')
  })

  it('quitar pide confirmación', async () => {
    api.assistantMapping.remove.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    fireEvent.click(await screen.findByTestId('mapping-remove-7'))
    await waitFor(() => expect(api.assistantMapping.remove).toHaveBeenCalledWith(7))
  })
})
