import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RolesPage from './RolesPage'
import { rolesApi } from '@/api/rolesApi'
import { levelsApi } from '@/api/levelsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'object' && opts && 'name' in opts ? `${key} ${(opts as { name: string }).name}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/rolesApi', () => ({
  rolesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), visibility: vi.fn(), updateVisibility: vi.fn() },
}))
vi.mock('@/api/levelsApi', () => ({ levelsApi: { listAll: vi.fn() } }))

const mockedRolesApi = vi.mocked(rolesApi, true)
const mockedLevelsApi = vi.mocked(levelsApi, true)

const ROLES = [
  { id: 1, key: 'vendedor_disenador', name: 'Vendedor/Diseñador', is_superadmin: false, is_system: true, is_active: true, default_security_level_id: 3 },
  { id: 2, key: 'ad_hoc_role', name: 'Rol Ad Hoc', is_superadmin: false, is_system: false, is_active: true, default_security_level_id: null },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RolesPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRolesApi.list.mockResolvedValue(ROLES)
  mockedLevelsApi.listAll.mockResolvedValue([{ id: 3, level: 3, name: 'Nivel 3', description: null, permissions: [], is_active: true }])
})

describe('RolesPage', () => {
  it('lista los roles con su badge de sistema', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    expect(screen.getByText('Rol Ad Hoc')).toBeInTheDocument()
    expect(screen.getByText('security:roles.system')).toBeInTheDocument()
  })

  it('no muestra el botón de borrar para roles de sistema', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())
    const deleteButtons = screen.getAllByText('common:actions.delete')
    expect(deleteButtons).toHaveLength(1)
  })

  it('borra un rol no-sistema tras confirmar', async () => {
    mockedRolesApi.remove.mockResolvedValue(undefined)
    renderPage()
    await waitFor(() => expect(screen.getByText('Rol Ad Hoc')).toBeInTheDocument())

    fireEvent.click(screen.getByText('common:actions.delete'))
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedRolesApi.remove).toHaveBeenCalledWith(2))
  })

  it('abre el modal de creación al hacer clic en "+ Nuevo rol"', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument())

    fireEvent.click(screen.getByText('security:roles.actions.create'))
    expect(screen.getByText('security:roles.form.titleCreate')).toBeInTheDocument()
  })
})
