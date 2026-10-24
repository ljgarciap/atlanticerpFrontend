import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  settingsApi: {
    getPreferences: vi.fn(), updatePreferences: vi.fn(),
    // docs/specs/demo-mode.md — useDemoModeActive() (usado por el toggle personal del header)
    // consulta esto también; sin el mock, la queryFn real llamaría a axios en el test.
    getDemoModeStatus: vi.fn(),
  },
}))
vi.mock('@/hooks/useTheme', () => ({ applyTheme: vi.fn() }))
vi.mock('./AppLogo', () => ({ default: () => <div /> }))
vi.mock('./LanguageSelector', () => ({ default: () => <div /> }))
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
  mockedSettingsApi.getPreferences.mockResolvedValue({
    theme: 'light', language: 'es', session_timeout_min: 30, demo_mode_enabled: false,
  })
  // Default: gate global apagado -> el toggle de Modo Demo no debe aparecer salvo que un test lo
  // encienda explícitamente (ver docs/specs/demo-mode.md, criterio "oculto por completo").
  mockedSettingsApi.getDemoModeStatus.mockResolvedValue({ enabled: false })
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

// docs/specs/demo-mode.md (F2) — el toggle personal debe estar oculto por completo (no
// deshabilitado) cuando el gate global está apagado, y visible/funcional cuando está encendido.
describe('TopBar — toggle personal de Modo Demo', () => {
  it('no aparece si el gate global (system_settings.demo_mode_enabled) está apagado', async () => {
    renderTopBar('Catálogo')
    await waitFor(() => expect(mockedSettingsApi.getDemoModeStatus).toHaveBeenCalled())
    expect(screen.queryByRole('switch', { name: /demoMode.toggleLabel|Modo Demo/i })).not.toBeInTheDocument()
  })

  it('aparece y llama updatePreferences al activarlo cuando el gate global está encendido', async () => {
    mockedSettingsApi.getDemoModeStatus.mockResolvedValue({ enabled: true })
    mockedSettingsApi.updatePreferences.mockResolvedValue({
      theme: 'light', language: 'es', session_timeout_min: 30, demo_mode_enabled: true,
    })

    renderTopBar('Catálogo')

    const toggle = await screen.findByRole('switch', { name: /demoMode.toggleLabel|Modo Demo/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(toggle)

    await waitFor(() => {
      expect(mockedSettingsApi.updatePreferences).toHaveBeenCalledWith({ demo_mode_enabled: true })
    })
  })
})
