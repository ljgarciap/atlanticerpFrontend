import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import ImpersonationBanner from './ImpersonationBanner'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

// SCRUM-1158 (Senior Review R1) — el cambio de contraseña obligatorio es de la persona observada: nunca debe taparle la app al superadmin
// que la mira. Sin sesión observada la pantalla obligatoria sigue exactamente igual (ver RequireAuth.test.tsx, sin cambios).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/pages/ForcePasswordChangePage', () => ({ default: () => <div>pantalla-obligatoria</div> }))
vi.mock('@/lib/impersonation', () => ({ endImpersonation: vi.fn() }))

const observed = (overrides: Partial<UserInfo> = {}): UserInfo => ({
  id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'v@x.test', role: 'vendedor', permissions: [],
  must_change_password: true,
  impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera Vendedora', expires_at: '2099-01-01T00:00:00Z' },
  ...overrides,
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>login</div>} />
        <Route path="/app" element={<RequireAuth><ImpersonationBanner /><div>contenido-de-la-app</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, lastUserId: null }) })

describe('RequireAuth — sesión observada con cambio de contraseña pendiente (R1)', () => {
  it('se renderiza la app normal con el banner y SIN la pantalla obligatoria', () => {
    useAuthStore.setState({ user: observed() })
    renderApp()

    expect(screen.getByText('contenido-de-la-app')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('impersonation.viewingAs')
    expect(screen.queryByText('pantalla-obligatoria')).not.toBeInTheDocument()
  })

  it('sin impersonación la pantalla obligatoria sigue tapando la app (comportamiento previo)', () => {
    useAuthStore.setState({ user: observed({ impersonation: undefined }) })
    renderApp()

    expect(screen.getByText('pantalla-obligatoria')).toBeInTheDocument()
    expect(screen.queryByText('contenido-de-la-app')).not.toBeInTheDocument()
  })

  it('con impersonation: null (sesión normal serializada) tampoco se salta la pantalla obligatoria', () => {
    useAuthStore.setState({ user: observed({ impersonation: null }) })
    renderApp()

    expect(screen.getByText('pantalla-obligatoria')).toBeInTheDocument()
  })
})

describe('authStore.markPasswordChangeRequired — sesión observada (R1)', () => {
  it('no marca el flag mientras hay impersonación', () => {
    useAuthStore.setState({ user: observed({ must_change_password: false }) })

    useAuthStore.getState().markPasswordChangeRequired()

    expect(useAuthStore.getState().user?.must_change_password).toBe(false)
  })

  it('sin impersonación lo marca como siempre', () => {
    useAuthStore.setState({ user: observed({ must_change_password: false, impersonation: undefined }) })

    useAuthStore.getState().markPasswordChangeRequired()

    expect(useAuthStore.getState().user?.must_change_password).toBe(true)
  })
})
