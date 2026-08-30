import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SecurityLayout from './SecurityLayout'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'security:nav.users': 'Usuarios',
  'security:nav.levels': 'Niveles de seguridad',
  'security:nav.departments': 'Departamentos',
  'security:nav.alerts': 'Alertas de seguridad',
  'security:nav.notificationRules': 'Reglas de notificación',
  'security:nav.roles': 'Roles',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => LABELS[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com',
    role: 'electrician', permissions: [],
    ...overrides,
  }
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/security/users']}>
      <SecurityLayout><div>content</div></SecurityLayout>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ user: null })
})

// Pre-QA 2026-07-28 (SCRUM-713): un usuario management sin security.levels ni
// superadmin.all veía los tabs Niveles/Alertas/Reglas de notificación/Roles como
// clickeables, pero las rutas reales los redirigían en silencio -- cada tab debe
// reflejar el permiso real de su ruta en App.tsx, no el bucket de rol isSuperAdmin.
describe('SecurityLayout — tabs reflejan el permiso real de cada ruta (SCRUM-713 Pre-QA)', () => {
  it('management sin security.levels ni superadmin.all solo ve Usuarios y Departamentos', () => {
    useAuthStore.setState({ user: baseUser({ role: 'management', permissions: ['security.users', 'settings.global'] }) })
    renderLayout()

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Departamentos')).toBeInTheDocument()
    expect(screen.queryByText('Niveles de seguridad')).not.toBeInTheDocument()
    expect(screen.queryByText('Alertas de seguridad')).not.toBeInTheDocument()
    expect(screen.queryByText('Reglas de notificación')).not.toBeInTheDocument()
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
  })

  it('usuario con security.levels ve el tab Niveles', () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['security.users', 'security.levels'] }) })
    renderLayout()
    expect(screen.getByText('Niveles de seguridad')).toBeInTheDocument()
  })

  it('superadmin.all ve Alertas, Reglas de notificación y Roles', () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['superadmin.all'] }) })
    renderLayout()
    expect(screen.getByText('Alertas de seguridad')).toBeInTheDocument()
    expect(screen.getByText('Reglas de notificación')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
  })

  it('rol no-management/superadmin no ve Departamentos aunque tenga otros permisos sueltos', () => {
    useAuthStore.setState({ user: baseUser({ role: 'electrician', permissions: ['security.users', 'security.levels'] }) })
    renderLayout()
    expect(screen.queryByText('Departamentos')).not.toBeInTheDocument()
  })
})
