import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserFormDrawer from './UserFormDrawer'
import { usersApi, type UserListItem } from '@/api/usersApi'
import { rolesApi } from '@/api/rolesApi'
import { levelsApi } from '@/api/levelsApi'
import { departmentsApi } from '@/api/departmentsApi'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'string' ? opts : (opts as { defaultValue?: string })?.defaultValue ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { create: vi.fn(), update: vi.fn(), updateFlags: vi.fn(), list: vi.fn() } }
})
vi.mock('@/api/rolesApi', () => ({ rolesApi: { list: vi.fn() } }))
vi.mock('@/api/levelsApi', () => ({ levelsApi: { listAll: vi.fn(), catalog: vi.fn() } }))
vi.mock('@/api/departmentsApi', () => ({ departmentsApi: { listAll: vi.fn() } }))

const mockedUsersApi = vi.mocked(usersApi, true)
const mockedRolesApi = vi.mocked(rolesApi, true)
const mockedLevelsApi = vi.mocked(levelsApi, true)
const mockedDepartmentsApi = vi.mocked(departmentsApi, true)

const ROLES = [
  { id: 1, key: 'vendedor', name: 'Vendedor/Diseñador', is_superadmin: false, is_system: true, is_active: true, default_security_level_id: 3 },
  { id: 2, key: 'lider_servicios', name: 'Líder de Servicios', is_superadmin: false, is_system: true, is_active: true, default_security_level_id: 4 },
  { id: 3, key: 'superadmin', name: 'Superadmin', is_superadmin: true, is_system: true, is_active: true, default_security_level_id: null },
]

const LEVELS = [
  { id: 1, level: 1, name: 'Nivel 1', description: null, permissions: [], is_active: true },
  { id: 3, level: 3, name: 'Nivel 3', description: null, permissions: [], is_active: true },
]

function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return { id: 1, first_name: 'Actor', last_name: 'Demo', email: 'actor@atlantic.test', permissions: [], security_level: 9, role: 'management', ...overrides }
}

function makeUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 5, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

function renderDrawer(user: UserListItem | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <UserFormDrawer user={user} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: baseUser() })
  mockedRolesApi.list.mockResolvedValue(ROLES)
  mockedLevelsApi.listAll.mockResolvedValue(LEVELS)
  mockedLevelsApi.catalog.mockResolvedValue({
    catalog: {
      crm: [{ key: 'crm.read', label: 'CRM — Ver', description: null }],
      admin_contab: [
        { key: 'admin_contab.edit.receptor_fiscal', label: 'Corregir el RUC y la razón social del cliente al facturar', description: null },
        { key: 'admin_contab.edit.receptor_consumidor_final', label: 'Facturar a Consumidor final', description: null },
      ],
    },
  })
  mockedDepartmentsApi.listAll.mockResolvedValue([])
  mockedUsersApi.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 100, current_page: 1, last_page: 1 } })
})

describe('UserFormDrawer — rol base único (ADR-006, Fase D)', () => {
  it('muestra el select de rol base poblado desde /api/roles', async () => {
    renderDrawer(null)
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    expect(screen.getByText('Líder de Servicios')).toBeInTheDocument()
  })

  it('no muestra roles adicionales si el actor no es superadmin', async () => {
    useAuthStore.setState({ user: baseUser({ permissions: [] }) })
    renderDrawer(null)
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    expect(screen.queryByText('security:users.form.additionalRoles')).not.toBeInTheDocument()
  })

  it('excluye el rol Superadmin del select de rol base si el actor no es superadmin (Senior Review 2026-07-13)', async () => {
    useAuthStore.setState({ user: baseUser({ permissions: [] }) })
    const { container } = renderDrawer(null)
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())

    const roleSelect = container.querySelectorAll('select')[1]
    expect(within(roleSelect).queryByText('Superadmin')).not.toBeInTheDocument()
  })

  it('incluye el rol Superadmin en el select de rol base si el actor sí es superadmin', async () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['superadmin.all'] }) })
    const { container } = renderDrawer(null)
    // Con actor superadmin, "Vendedor/Diseñador" aparece dos veces (select de rol base +
    // botones de roles adicionales) — esperar por count en vez de un único match.
    await waitFor(() => expect(screen.getAllByText('Vendedor/Diseñador').length).toBeGreaterThan(0))

    const roleSelect = container.querySelectorAll('select')[1]
    expect(within(roleSelect).getByText('Superadmin')).toBeInTheDocument()
  })

  it('crea un usuario nuevo enviando role_id, sin el campo roles legado', async () => {
    mockedUsersApi.create.mockResolvedValue(makeUser())
    const { container } = renderDrawer(null)

    fireEvent.change(container.querySelector('input[name="first_name"]')!, { target: { value: 'Nueva' } })
    fireEvent.change(container.querySelector('input[name="last_name"]')!, { target: { value: 'Persona' } })
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: 'nueva@atlantic.test' } })

    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    const roleSelect = screen.getByDisplayValue('security:users.form.noRole')
    fireEvent.change(roleSelect, { target: { value: '1' } })

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedUsersApi.create).toHaveBeenCalled())
    const payload = mockedUsersApi.create.mock.calls[0][0]
    expect(payload.role_id).toBe(1)
    expect(payload).not.toHaveProperty('roles')
  })

  it('en modo edición muestra el resumen de rol base y excepciones', async () => {
    renderDrawer(makeUser({ role_id: 1, approve_large_amounts: true, manage_users: false }))

    expect(screen.getByText(/security:users.form.summary.baseRole/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Vendedor/Diseñador').length).toBeGreaterThan(0))
  })

  it('SCRUM-822 — al crear, el payload incluye is_active=true por defecto', async () => {
    mockedUsersApi.create.mockResolvedValue(makeUser())
    const { container } = renderDrawer(null)

    fireEvent.change(container.querySelector('input[name="first_name"]')!, { target: { value: 'Nueva' } })
    fireEvent.change(container.querySelector('input[name="last_name"]')!, { target: { value: 'Persona' } })
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: 'nueva@atlantic.test' } })

    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    fireEvent.change(screen.getByDisplayValue('security:users.form.noRole'), { target: { value: '1' } })

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedUsersApi.create).toHaveBeenCalled())
    const payload = mockedUsersApi.create.mock.calls[0][0]
    expect(payload.is_active).toBe(true)
  })

  it('SCRUM-822 — el select de jefe directo excluye al propio usuario en edición', async () => {
    mockedUsersApi.list.mockResolvedValue({
      data: [makeUser({ id: 5, first_name: 'Juan' }), makeUser({ id: 9, first_name: 'Otro', last_name: 'Jefe' })],
      meta: { total: 2, per_page: 100, current_page: 1, last_page: 1 },
    })
    const { container } = renderDrawer(makeUser({ id: 5 }))

    await waitFor(() => expect(screen.getByText('Otro Jefe')).toBeInTheDocument())
    const managerSelect = container.querySelectorAll('select')[0]
    expect(within(managerSelect).queryByText('Juan García')).not.toBeInTheDocument()
  })

  it('SCRUM-822 — al editar, el payload no incluye is_active (RN3 solo aplica al crear)', async () => {
    mockedUsersApi.update.mockResolvedValue(makeUser({ job_title: 'Coordinador' }))
    renderDrawer(makeUser())

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedUsersApi.update).toHaveBeenCalled())
    const [, payload] = mockedUsersApi.update.mock.calls[0]
    expect(payload).not.toHaveProperty('is_active')
  })

  it('togglear un flag llama a usersApi.updateFlags', async () => {
    mockedUsersApi.updateFlags.mockResolvedValue(makeUser({ approve_large_amounts: true }))
    renderDrawer(makeUser({ approve_large_amounts: false }))

    await waitFor(() => expect(screen.getAllByText('security:users.form.flags.approveLargeAmounts').length).toBeGreaterThan(0))
    const buttons = screen.getAllByText('security:users.form.flags.approveLargeAmounts')
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(mockedUsersApi.updateFlags).toHaveBeenCalledWith(5, { approve_large_amounts: true }))
  })
})

describe('UserFormDrawer — permisos adicionales desde el catálogo (SCRUM-1140)', () => {
  it('un superadmin ve los permisos del catálogo real, incluidos los angostos de quien factura', async () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['superadmin.all'] }) })
    renderDrawer(null)

    const bloque = await screen.findByTestId('extra-permissions')
    await waitFor(() => expect(bloque).toHaveTextContent('admin_contab'))
    expect(bloque).toHaveTextContent('Corregir el RUC y la razón social del cliente al facturar')
    expect(bloque).toHaveTextContent('Facturar a Consumidor final')
    expect(mockedLevelsApi.catalog).toHaveBeenCalled()
  })

  it('quien no es superadmin no ve los permisos adicionales ni consulta el catálogo', async () => {
    renderDrawer(null)

    await screen.findByText('Vendedor/Diseñador')
    expect(screen.queryByTestId('extra-permissions')).not.toBeInTheDocument()
    expect(mockedLevelsApi.catalog).not.toHaveBeenCalled()
  })
})

