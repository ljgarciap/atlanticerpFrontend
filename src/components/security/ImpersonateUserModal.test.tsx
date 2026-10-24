import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ImpersonateUserModal from './ImpersonateUserModal'
import { impersonationApi } from '@/api/impersonationApi'
import { useAuthStore } from '@/store/authStore'
import type { UserListItem } from '@/api/usersApi'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/impersonationApi', () => ({ impersonationApi: { start: vi.fn() } }))

const start = vi.mocked(impersonationApi.start)

const PASSWORD = 'Operador-123'

function makeTarget(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'vera@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

const observedUser = (withBlock = true): UserInfo => ({
  id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'vera@atlantic.test', role: 'vendedor', permissions: [],
  modules: { ventas_diseno: { view: true, view_team: false, edit: true, approve: false } } as UserInfo['modules'],
  ...(withBlock ? { impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super', target_name: 'Vera Vendedora', expires_at: '2099-01-01T00:00:00Z' } } : {}),
})

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/security/users']}>
        <Routes>
          <Route path="/security/users" element={<ImpersonateUserModal user={makeTarget()} onClose={onClose} />} />
          <Route path="/ventas-diseno/home" element={<div>inicio-de-vera</div>} />
          <Route path="*" element={<div>otra-ruta</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose }
}

const reasonInput   = () => screen.getByLabelText('security:impersonate.reasonLabel')
const passwordInput = () => screen.getByLabelText('security:impersonate.passwordLabel') as HTMLInputElement
const confirmBtn    = () => screen.getByRole('button', { name: 'security:impersonate.confirm' })

function fill(reason = 'SCRUM-1200 no le aparece el pipeline', password = PASSWORD) {
  fireEvent.change(reasonInput(), { target: { value: reason } })
  fireEvent.change(passwordInput(), { target: { value: password } })
}

beforeEach(() => {
  start.mockReset()
  useAuthStore.getState().clearAuth()
  sessionStorage.clear(); localStorage.clear()
  useAuthStore.getState().setAuth(
    { id: 1, first_name: 'Super', last_name: 'Admin', email: 's@x.test', role: 'superadmin', permissions: ['superadmin.all'], language: 'es' },
    'actor-access', 'actor-refresh',
  )
})

describe('ImpersonateUserModal', () => {
  it('«Confirmar» queda deshabilitado hasta tener motivo y contraseña', () => {
    renderModal()
    expect(confirmBtn()).toBeDisabled()
    fireEvent.change(reasonInput(), { target: { value: 'motivo' } })
    expect(confirmBtn()).toBeDisabled()
    fireEvent.change(passwordInput(), { target: { value: PASSWORD } })
    expect(confirmBtn()).toBeEnabled()
  })

  it('un motivo solo de espacios no cuenta', () => {
    renderModal()
    fill('    ')
    expect(confirmBtn()).toBeDisabled()
  })

  it('envía motivo (sin espacios sobrantes) y contraseña, entra a la sesión observada y navega al inicio de esa persona', async () => {
    start.mockResolvedValueOnce({ accessToken: 'imp-access', expiresInMs: 1_800_000, user: observedUser() })
    const { onClose } = renderModal()

    fill('  SCRUM-1200 no le aparece el pipeline  ')
    fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByText('inicio-de-vera')).toBeInTheDocument())
    expect(start).toHaveBeenCalledWith(77, { reason: 'SCRUM-1200 no le aparece el pipeline', operatorPassword: PASSWORD })
    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(77)
    expect(state.user?.impersonation?.id).toBe('imp-1')
    expect(state.refreshToken).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('si la respuesta no trae el bloque `impersonation` NO entra: sin banner sería una cuenta ajena sin señal alguna', async () => {
    start.mockResolvedValueOnce({ accessToken: 'imp-access', expiresInMs: 1_800_000, user: observedUser(false) })
    renderModal()

    fill(); fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('security:impersonate.errors.generic'))
    expect(useAuthStore.getState().user?.id).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('contraseña incorrecta (422 operator_reauth_failed): error en el campo, contraseña limpiada y el motivo se conserva', async () => {
    start.mockRejectedValueOnce({ response: { status: 422, data: { code: 'operator_reauth_failed', message: 'x' } } })
    renderModal()

    fill(); fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByText('security:impersonate.errors.reauthFailed')).toBeInTheDocument())
    expect(passwordInput().value).toBe('')
    expect((reasonInput() as HTMLTextAreaElement).value).toBe('SCRUM-1200 no le aparece el pipeline')
    expect(useAuthStore.getState().user?.id).toBe(1)
  })

  it('motivo demasiado corto (422 con errors.reason): el mensaje del backend aparece junto al motivo', async () => {
    start.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 422, data: { message: 'invalid', errors: { reason: ['El motivo debe tener al menos 10 caracteres.'] } } },
    })
    renderModal()

    fill('corto'); fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByText('El motivo debe tener al menos 10 caracteres.')).toBeInTheDocument())
  })

  it('429: avisa con la espera cuando el backend la indica', async () => {
    start.mockRejectedValueOnce({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 120 } } })
    renderModal()

    fill(); fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('security:impersonate.errors.throttledWait'))
  })

  it('403: mensaje de sin permiso, sin cambiar de sesión', async () => {
    start.mockRejectedValueOnce({ response: { status: 403, data: {} } })
    renderModal()

    fill(); fireEvent.click(confirmBtn())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('security:impersonate.errors.forbidden'))
    expect(useAuthStore.getState().user?.id).toBe(1)
  })

  it('Escape cierra el modal', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
