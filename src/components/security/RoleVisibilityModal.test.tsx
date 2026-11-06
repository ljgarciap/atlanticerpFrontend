import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RoleVisibilityModal from './RoleVisibilityModal'
import { rolesApi } from '@/api/rolesApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/rolesApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/rolesApi')>('@/api/rolesApi')
  return { ...actual, rolesApi: { visibility: vi.fn(), updateVisibility: vi.fn() } }
})

const api = vi.mocked(rolesApi, true)
const ROLE = { id: 9, key: 'rol_propio', name: 'Rol propio', is_superadmin: false, is_system: false, is_active: true, default_security_level_id: null }

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><RoleVisibilityModal role={ROLE} onClose={onClose} /></QueryClientProvider>)
  return { onClose }
}

describe('RoleVisibilityModal — aviso de rol sin visibilidad (Fase 27b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.visibility.mockResolvedValue([])
  })

  it('si el backend avisa que el rol no ve ningún módulo, muestra el aviso y deja el modal abierto', async () => {
    api.updateVisibility.mockResolvedValue({ data: [], warnings: [{ code: 'rol_sin_visibilidad', message: 'Este rol no ve ningún módulo.' }] })
    const { onClose } = renderModal()
    await waitFor(() => expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }))

    expect(await screen.findByText('Este rol no ve ningún módulo.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sin avisos, guarda y cierra', async () => {
    api.updateVisibility.mockResolvedValue({ data: [], warnings: [] })
    const { onClose } = renderModal()
    await waitFor(() => expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
