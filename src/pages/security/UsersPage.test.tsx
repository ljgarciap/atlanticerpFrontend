import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UsersPage from './UsersPage'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import type { UserListItem } from '@/api/usersApi'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const hoisted = vi.hoisted(() => ({
  users: [] as UserListItem[],
  resetModalProps: null as null | { onClose: () => void; onDone: (u: UserListItem) => void },
}))

vi.mock('@/hooks/useUsers', () => ({
  useUsers:            () => ({ data: { data: hoisted.users, meta: { total: hoisted.users.length, per_page: 20, current_page: 1, last_page: 1 } }, isFetching: false }),
  useToggleUserStatus: () => ({ mutate: vi.fn() }),
  useResetUserMfa:     () => ({ mutate: vi.fn() }),
}))
vi.mock('@/api/rolesApi', () => ({ rolesApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/components/security/UserFormDrawer', () => ({ default: () => null }))
vi.mock('@/components/security/UserVisibilityModal', () => ({ default: () => null }))
vi.mock('@/components/security/BulkModuleVisibilityModal', () => ({ default: () => null }))
vi.mock('@/components/security/ResetPasswordModal', () => ({
  default: (props: { user: UserListItem; onClose: () => void; onDone: (u: UserListItem) => void }) => {
    hoisted.resetModalProps = props
    return <div>modal-individual:{props.user.email}</div>
  },
}))
vi.mock('@/components/security/ImpersonateUserModal', () => ({
  default: ({ user, onClose }: { user: UserListItem; onClose: () => void }) => <div>modal-ver-como:{user.email}<button onClick={onClose}>cerrar-ver-como</button></div>,
}))
vi.mock('@/components/security/BulkResetPasswordModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => <div>modal-masivo<button onClick={onClose}>cerrar-masivo</button></div>,
}))

function makeListUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 5, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

function setActor(permissions: string[], role: string = 'superadmin') {
  const user: UserInfo = { id: 1, first_name: 'Actor', last_name: 'X', email: 'a@x.test', role, security_level: 9, permissions }
  useAuthStore.setState({ user })
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><UsersPage /></QueryClientProvider>)
}

beforeEach(() => {
  hoisted.users = [makeListUser()]
  hoisted.resetModalProps = null
  useToastStore.setState({ toasts: [] })
})

describe('UsersPage — restablecer contraseñas', () => {
  it('un superadmin ve el botón masivo y la acción por fila', () => {
    setActor(['superadmin.all'])
    renderPage()
    expect(screen.getByText('security:users.actions.bulkResetPassword')).toBeInTheDocument()
    expect(screen.getByText('security:users.actions.resetPassword')).toBeInTheDocument()
  })

  it('quien tiene security.users pero no superadmin no ve ni el botón masivo ni la acción por fila', () => {
    setActor(['security.users'], 'management')
    renderPage()
    expect(screen.queryByText('security:users.actions.bulkResetPassword')).not.toBeInTheDocument()
    expect(screen.queryByText('security:users.actions.resetPassword')).not.toBeInTheDocument()
  })

  it('M1: quien tiene el permiso superadmin.all pero su rol base NO es superadmin no ve los botones (el backend lo rechazaría con 403)', () => {
    setActor(['superadmin.all', 'security.users'], 'management')
    renderPage()
    expect(screen.queryByText('security:users.actions.bulkResetPassword')).not.toBeInTheDocument()
    expect(screen.queryByText('security:users.actions.resetPassword')).not.toBeInTheDocument()
  })

  it('el botón masivo abre y cierra el modal masivo', () => {
    setActor(['superadmin.all'])
    renderPage()
    fireEvent.click(screen.getByText('security:users.actions.bulkResetPassword'))
    expect(screen.getByText('modal-masivo')).toBeInTheDocument()

    fireEvent.click(screen.getByText('cerrar-masivo'))
    expect(screen.queryByText('modal-masivo')).not.toBeInTheDocument()
  })

  it('la acción por fila abre el modal individual con ese usuario y, al terminar, cierra y avisa con un toast', () => {
    setActor(['superadmin.all'])
    renderPage()
    fireEvent.click(screen.getByText('security:users.actions.resetPassword'))
    expect(screen.getByText('modal-individual:juan@atlantic.test')).toBeInTheDocument()

    const props = hoisted.resetModalProps!
    act(() => props.onDone(makeListUser()))

    expect(screen.queryByText(/modal-individual/)).not.toBeInTheDocument()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].type).toBe('success')
    expect(toasts[0].message).toContain('security:users.resetPassword.success')
    expect(toasts[0].message).toContain('Juan García')
  })
})

// SCRUM-1158 — «Ver como usuario»: mismo criterio que el reset (rol base superadmin), nunca encadenado, deshabilitado para quien no se puede observar.
describe('UsersPage — Ver como usuario', () => {
  const impersonate = 'security:users.actions.impersonate'

  it('un superadmin ve la acción por fila y abre el modal con esa persona; cerrarlo lo desmonta', () => {
    setActor(['superadmin.all'])
    renderPage()
    fireEvent.click(screen.getByText(impersonate))
    expect(screen.getByText('modal-ver-como:juan@atlantic.test')).toBeInTheDocument()
    fireEvent.click(screen.getByText('cerrar-ver-como'))
    expect(screen.queryByText(/modal-ver-como/)).not.toBeInTheDocument()
  })

  it('quien gestiona usuarios pero no es superadmin por ROL no la ve (el backend respondería 403)', () => {
    setActor(['superadmin.all', 'security.users'], 'management')
    renderPage()
    expect(screen.queryByText(impersonate)).not.toBeInTheDocument()
  })

  it('quien ya está viendo como otra persona no la ve: no se encadena', () => {
    const user: UserInfo = {
      id: 77, first_name: 'Vera', last_name: 'V', email: 'v@x.test', role: 'superadmin', permissions: ['superadmin.all'],
      impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'S', target_name: 'V', expires_at: '2099-01-01T00:00:00Z' },
    }
    useAuthStore.setState({ user })
    renderPage()
    expect(screen.queryByText(impersonate)).not.toBeInTheDocument()
  })

  it('para otro superadmin, un inactivo y uno mismo está deshabilitada', () => {
    hoisted.users = [
      makeListUser({ id: 10, email: 'otro-super@x.test', roles: ['superadmin'] }),
      makeListUser({ id: 11, email: 'inactivo@x.test', is_active: false }),
      makeListUser({ id: 1,  email: 'yo@x.test' }),
    ]
    setActor(['superadmin.all'])
    renderPage()
    const buttons = screen.getAllByText(impersonate).map(el => el.closest('button')!)
    expect(buttons).toHaveLength(3)
    buttons.forEach(b => expect(b).toBeDisabled())
  })
})
