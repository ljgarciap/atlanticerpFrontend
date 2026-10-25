import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ApproveUserModal from './ApproveUserModal'
import { rolesApi, type RoleItem } from '@/api/rolesApi'
import { levelsApi } from '@/api/levelsApi'
import { usersApi, type UserListItem } from '@/api/usersApi'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: {} }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/rolesApi', () => ({ rolesApi: { list: vi.fn() } }))
vi.mock('@/api/levelsApi', () => ({ levelsApi: { listAll: vi.fn() } }))
vi.mock('@/api/usersApi', () => ({ usersApi: { approve: vi.fn() } }))

const role = (id: number, key: string, name: string, extra: Partial<RoleItem> = {}): RoleItem =>
  ({ id, key, name, is_superadmin: false, is_system: true, is_active: true, default_security_level_id: null, ...extra })

// Fase 2: `guest` (registro pendiente) existe en la tabla pero INACTIVO; superadmin solo lo asigna un superadmin.
const ROLES = [
  role(1, 'superadmin', 'Superadmin', { is_superadmin: true }),
  role(2, 'vendedor_disenador', 'Vendedor/Diseñador'),
  role(3, 'lider_bodega', 'Líder de Bodega'),
  role(99, 'guest', 'Invitado (registro pendiente)', { is_active: false }),
]

const PENDING = { id: 7, first_name: 'Persona', last_name: 'Pendiente', email: 'p@x.test' } as unknown as UserListItem

function actor(permissions: string[]) {
  useAuthStore.setState({ user: { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.test', role: 'management', permissions, modules: {} } as unknown as UserInfo })
}

function renderModal(onApproved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><ApproveUserModal user={PENDING} onClose={vi.fn()} onApproved={onApproved} /></QueryClientProvider>)
  return onApproved
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rolesApi.list).mockResolvedValue(ROLES)
  vi.mocked(levelsApi.listAll).mockResolvedValue([{ id: 5, level: 3, name: 'Nivel 3', is_active: true }] as never)
  vi.mocked(usersApi.approve).mockResolvedValue({} as UserListItem)
})

describe('ApproveUserModal (Fase 2 — roles reales de la tabla, no el enum legado)', () => {
  it('lista los roles activos de la tabla y no ofrece el rol de sistema guest', async () => {
    actor(['security.users'])
    renderModal()

    expect(await screen.findByRole('option', { name: 'Vendedor/Diseñador' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Líder de Bodega' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Invitado/ })).not.toBeInTheDocument()
  })

  it('quien no es superadmin no puede elegir el rol Superadmin; un superadmin sí', async () => {
    actor(['security.users'])
    renderModal()
    await screen.findByRole('option', { name: 'Vendedor/Diseñador' })
    expect(screen.queryByRole('option', { name: 'Superadmin' })).not.toBeInTheDocument()
  })

  it('un superadmin ve el rol Superadmin', async () => {
    actor(['superadmin.all'])
    renderModal()
    expect(await screen.findByRole('option', { name: 'Superadmin' })).toBeInTheDocument()
  })

  it('aprobar manda role_id (no un string de rol) y el nivel elegido', async () => {
    actor(['security.users'])
    const onApproved = renderModal()
    await screen.findByRole('option', { name: 'Líder de Bodega' })

    const [roleSelect, levelSelect] = screen.getAllByRole('combobox')
    fireEvent.change(roleSelect, { target: { value: '3' } })
    fireEvent.change(levelSelect, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'security:users.pending.confirmApprove' }))

    await waitFor(() => expect(usersApi.approve).toHaveBeenCalledWith(7, 3, 5))
    await waitFor(() => expect(onApproved).toHaveBeenCalled())
  })
})
