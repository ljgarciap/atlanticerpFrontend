import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SecurityLevelFormModal from './SecurityLevelFormModal'
import { levelsApi } from '@/api/levelsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/levelsApi', () => ({ levelsApi: { catalog: vi.fn(), update: vi.fn() } }))

const api = vi.mocked(levelsApi, true)
const LEVEL = { id: 4, level: 4, name: 'Nivel cuatro', description: null, permissions: [], is_active: true }

describe('SecurityLevelFormModal — nombre repetido (Fase 27b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.catalog.mockResolvedValue({ catalog: {} } as never)
  })

  it('muestra el mensaje del servidor junto al nombre y no cierra el modal', async () => {
    api.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'invalid', errors: { name: ['Ya existe un nivel de seguridad con ese nombre.'] } } },
    })
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><SecurityLevelFormModal level={LEVEL} onClose={onClose} /></QueryClientProvider>)

    fireEvent.change(screen.getByDisplayValue('Nivel cuatro'), { target: { value: 'Nivel tres' } })
    fireEvent.submit(document.getElementById('level-form')!)

    expect(await screen.findByText('Ya existe un nivel de seguridad con ese nombre.')).toBeInTheDocument()
    await waitFor(() => expect(api.update).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
