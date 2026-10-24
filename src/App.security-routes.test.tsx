import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

// SCRUM-1012 — /security/users y /security/levels solo para Gerencia (management) + superadmin,
// aunque el usuario tenga security.users/levels por permiso individual.
vi.mock('@/pages/security/UsersPage', () => ({ default: () => <div>USERS_PAGE</div> }))
vi.mock('@/pages/security/SecurityLevelsPage', () => ({ default: () => <div>LEVELS_PAGE</div> }))
vi.mock('@/pages/ventas-diseno/CotizaYaPage', () => ({ default: () => <div>COTIZAYA_LIST</div> }))
vi.mock('@/pages/ventas-diseno/CotizaYaFormPage', () => ({ default: () => <div>COTIZAYA_FORM</div> }))
vi.mock('@/pages/ventas-diseno/CotizaYaDetailPage', () => ({ default: () => <div>COTIZAYA_DETAIL</div> }))
vi.mock('@/pages/ventas-diseno/PedidosPage', () => ({ default: () => <div>PEDIDOS_PAGE</div> }))
vi.mock('@/pages/admin-contab/CompanyProfilePage', () => ({ default: () => <div>EMPRESA_PAGE</div> }))
vi.mock('@/pages/admin-contab/FiscalConfigPage', () => ({ default: () => <div>FISCAL_PAGE</div> }))
vi.mock('@/components/AppShell', async () => {
  const { Outlet } = await import('react-router-dom')
  return { default: () => <Outlet /> }
})
vi.mock('@/pages/security/SecurityLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

function user(role: string, permissions: string[]): UserInfo {
  return { id: 1, first_name: 'T', last_name: 'U', email: 't@t.com', role, permissions, modules: {} } as unknown as UserInfo
}

beforeEach(() => { vi.stubGlobal('scrollTo', () => {}) })
afterEach(() => cleanup())

describe('Rutas de Seguridad restringidas a Gerencia (SCRUM-1012)', () => {
  it.each([['/security/users', 'USERS_PAGE'], ['/security/levels', 'LEVELS_PAGE']])(
    '%s es accesible para management y superadmin', (path, marker) => {
      for (const role of ['management', 'superadmin']) {
        window.history.pushState({}, '', path)
        useAuthStore.setState({ user: user(role, ['security.users', 'security.levels']) })
        render(<App />)
        expect(screen.getByText(marker)).toBeInTheDocument()
        cleanup()
      }
    })

  it.each([['/security/users', 'USERS_PAGE'], ['/security/levels', 'LEVELS_PAGE']])(
    '%s redirige a roles no Gerencia con el permiso individual', (path, marker) => {
      for (const role of ['vendedor_disenador', 'lider_compras', 'lider_bodega', 'lider_servicios', 'tecnico_servicios', 'lider_admin_contab']) {
        window.history.pushState({}, '', path)
        useAuthStore.setState({ user: user(role, ['security.users', 'security.levels']) })
        render(<App />)
        expect(screen.queryByText(marker)).not.toBeInTheDocument()
        expect(window.location.pathname).not.toBe(path)
        cleanup()
      }
    })
})

// Pre-QA 1012 — Empresa/Fiscal no se abren por URL para quien tiene admin_contab.view solo por Comisiones.
describe('Rutas Empresa/Fiscal restringidas al roster completo de Admin&Cont (SCRUM-1012)', () => {
  it.each([['/admin-contab/empresa', 'EMPRESA_PAGE'], ['/admin-contab/fiscal', 'FISCAL_PAGE']])(
    '%s es accesible para el roster de Admin&Cont y Gerencia', (path, marker) => {
      for (const role of ['lider_admin_contab', 'asistente_administrativa', 'lider_operaciones', 'management', 'superadmin']) {
        window.history.pushState({}, '', path)
        useAuthStore.setState({ user: user(role, ['admin_contab.view']) })
        render(<App />)
        expect(screen.getByText(marker)).toBeInTheDocument()
        cleanup()
      }
    })

  it.each([['/admin-contab/empresa', 'EMPRESA_PAGE'], ['/admin-contab/fiscal', 'FISCAL_PAGE']])(
    '%s redirige a Vendedor/Diseñador aunque tenga admin_contab.view', (path, marker) => {
      window.history.pushState({}, '', path)
      useAuthStore.setState({ user: user('vendedor_disenador', ['admin_contab.view']) })
      render(<App />)
      expect(screen.queryByText(marker)).not.toBeInTheDocument()
      expect(window.location.pathname).not.toBe(path)
    })
})

// SCRUM-1119 — Pedidos muestra márgenes y montos: solo Compras, Gerencia y superadmin, aunque el usuario
// tenga ventas_diseno.read (que todo vendedor necesita para el Pipeline). Compras entra sin ese permiso.
describe('Ruta /ventas-diseno/pedidos restringida a Compras y Gerencia (SCRUM-1119)', () => {
  const path = '/ventas-diseno/pedidos'

  it.each([['lider_compras', []], ['management', ['ventas_diseno.read']], ['superadmin', ['superadmin.all']]] as [string, string[]][])(
    'es accesible para %s', (role, permissions) => {
      window.history.pushState({}, '', path)
      useAuthStore.setState({ user: user(role, permissions) })
      render(<App />)
      expect(screen.getByText('PEDIDOS_PAGE')).toBeInTheDocument()
    })

  it.each(['vendedor_disenador', 'lider_operaciones', 'lider_bodega', 'lider_servicios', 'lider_admin_contab', 'asistente_compras', 'asistente_administrativa'])(
    'redirige a %s aunque tenga ventas_diseno.read', role => {
      window.history.pushState({}, '', path)
      useAuthStore.setState({ user: user(role, ['ventas_diseno.read']) })
      render(<App />)
      expect(screen.queryByText('PEDIDOS_PAGE')).not.toBeInTheDocument()
      expect(window.location.pathname).not.toBe(path)
    })
})

// SCRUM-1120 — CotizaYA: mismos permisos que Cotizaciones (leer para ver y abrir el detalle, escribir para crear).
describe('Rutas de CotizaYA (SCRUM-1120)', () => {
  it.each([
    ['/ventas-diseno/cotizaya', 'COTIZAYA_LIST', 'ventas_diseno.read'],
    ['/ventas-diseno/cotizaya/12', 'COTIZAYA_DETAIL', 'ventas_diseno.read'],
    ['/ventas-diseno/cotizaya/nueva', 'COTIZAYA_FORM', 'ventas_diseno.write'],
  ])('%s es accesible con %s', (path, marker, permission) => {
    window.history.pushState({}, '', path)
    useAuthStore.setState({ user: user('vendedor_disenador', [permission]) })
    render(<App />)
    expect(screen.getByText(marker)).toBeInTheDocument()
  })

  it.each([
    ['/ventas-diseno/cotizaya', 'COTIZAYA_LIST'],
    ['/ventas-diseno/cotizaya/12', 'COTIZAYA_DETAIL'],
    ['/ventas-diseno/cotizaya/nueva', 'COTIZAYA_FORM'],
  ])('%s redirige a quien no tiene permisos de Ventas y Diseño', (path, marker) => {
    window.history.pushState({}, '', path)
    useAuthStore.setState({ user: user('lider_compras', []) })
    render(<App />)
    expect(screen.queryByText(marker)).not.toBeInTheDocument()
    expect(window.location.pathname).not.toBe(path)
  })

  it('crear exige escribir: con solo lectura redirige', () => {
    window.history.pushState({}, '', '/ventas-diseno/cotizaya/nueva')
    useAuthStore.setState({ user: user('vendedor_disenador', ['ventas_diseno.read']) })
    render(<App />)
    expect(screen.queryByText('COTIZAYA_FORM')).not.toBeInTheDocument()
  })
})
