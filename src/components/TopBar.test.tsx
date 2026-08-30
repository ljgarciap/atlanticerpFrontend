import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'
import { useAuthStore } from '@/store/authStore'
import { settingsApi } from '@/api/settingsApi'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'roles.superadmin': 'Super Admin',
  'roles.designer':   'Diseñador',
  'roles.vendedor_disenador': 'Vendedor/Diseñador',
  'roles.lider_compras': 'Líder de Compras',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => LABELS[key.replace('common:', '')] ?? opts?.defaultValue ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/authApi', () => ({ authApi: { logout: vi.fn() } }))
vi.mock('@/api/settingsApi', () => ({
  settingsApi: { getPreferences: vi.fn(), updatePreferences: vi.fn() },
}))
vi.mock('@/hooks/useTheme', () => ({ applyTheme: vi.fn() }))
vi.mock('./AppLogo', () => ({ default: () => <div /> }))
vi.mock('./LanguageSelector', () => ({ default: () => <div /> }))
vi.mock('./RoleSwitcher', () => ({ default: () => <div /> }))
vi.mock('./ChangePasswordModal', () => ({ default: () => <div /> }))
vi.mock('./UserAvatar', () => ({ default: () => <div /> }))
vi.mock('./EditProfileDrawer', () => ({ default: () => <div /> }))
vi.mock('./NotificationBell', () => ({ default: () => <div /> }))

const mockedSettingsApi = vi.mocked(settingsApi, true)

function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com',
    role: 'designer', permissions: [],
    ...overrides,
  }
}

function renderTopBar(moduleLabel: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TopBar moduleLabel={moduleLabel} tabs={[]} activeTab="" onTab={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettingsApi.getPreferences.mockResolvedValue({ theme: 'light', language: 'es', session_timeout_min: 30 })
  useAuthStore.setState({ user: baseUser() })
})

describe('TopBar — título del módulo (SCRUM-58)', () => {
  it('muestra el moduleLabel recibido, no un "CRM" fijo', () => {
    renderTopBar('Ventas & Diseño · Inicio')
    expect(screen.getByText('Ventas & Diseño · Inicio')).toBeInTheDocument()
  })
})

describe('TopBar — badge de rol legible (SCRUM-58)', () => {
  it('muestra el nombre legible para un rol del catálogo nuevo (vendedor_disenador)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor_disenador' }) })
    renderTopBar('Ventas & Diseño')
    expect(screen.getByText('Vendedor/Diseñador')).toBeInTheDocument()
    expect(screen.queryByText('vendedor_disenador')).not.toBeInTheDocument()
    expect(screen.queryByText('VENDEDOR_DISENADOR')).not.toBeInTheDocument()
  })

  it('muestra el nombre legible para un rol de negocio con guion bajo (lider_compras)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_compras' }) })
    renderTopBar('Compras')
    expect(screen.getByText('Líder de Compras')).toBeInTheDocument()
  })
})
