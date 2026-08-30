import { describe, expect, it } from 'vitest'
import { getHomeRoute, UNIVERSAL_FALLBACK_ROUTE } from './homeRoute'
import type { UserInfo } from '@/types/auth'

const EMPTY_MODULES: UserInfo['modules'] = {
  ventas_diseno: { view: false, view_team: false, edit: false, approve: false },
  compras:       { view: false, view_team: false, edit: false, approve: false },
  bodega:        { view: false, view_team: false, edit: false, approve: false },
  servicios:     { view: false, view_team: false, edit: false, approve: false },
  admin_contab:  { view: false, view_team: false, edit: false, approve: false },
  gerencia:      { view: false, view_team: false, edit: false, approve: false },
  operaciones:   { view: false, view_team: false, edit: false, approve: false },
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 'test@atlantic.test',
    phone: null, notes: null, department_id: null, language: 'es', security_level: 4,
    role: 'lider_compras', role_id: 1, permissions: [],
    modules: EMPTY_MODULES,
    flags: { approve_large_amounts: false, manage_users: false },
    ...overrides,
  }
}

// SCRUM-175 — regresión de Daniela (2026-08-04): Yirena (lider_compras) solo tiene
// role_module_visibility para 'compras', nunca para 'ventas_diseno' (comportamiento de backend
// correcto, ver role_module_visibility seed en atlanticerp-backend). El viejo fallback fijo a
// '/ventas-diseno/home' la mandaba a un loop infinito de <Navigate> (pantalla en blanco) porque
// esa ruta exige permission:ventas_diseno.read. getHomeRoute() debe resolver su Inicio real.
describe('getHomeRoute (SCRUM-175)', () => {
  it('sin usuario autenticado, manda a /login', () => {
    expect(getHomeRoute(null)).toBe('/login')
  })

  it('superadmin.all siempre resuelve a Ventas & Diseño (primer módulo del catálogo)', () => {
    const user = makeUser({ permissions: ['superadmin.all'], modules: EMPTY_MODULES })
    expect(getHomeRoute(user)).toBe('/ventas-diseno/home')
  })

  it('un usuario con ventas_diseno.view resuelve a /ventas-diseno/home', () => {
    const user = makeUser({
      modules: { ...EMPTY_MODULES, ventas_diseno: { view: true, view_team: false, edit: false, approve: false } },
    })
    expect(getHomeRoute(user)).toBe('/ventas-diseno/home')
  })

  it('Yirena (lider_compras, solo compras.view=true) resuelve a /compras/inicio, no a Ventas & Diseño', () => {
    const yirena = makeUser({
      modules: { ...EMPTY_MODULES, compras: { view: true, view_team: false, edit: true, approve: false } },
    })
    expect(getHomeRoute(yirena)).toBe('/compras/inicio')
  })

  it('permiso legado <modulo>.read sin visibilidad de rol también resuelve (extra_permissions puntual)', () => {
    const user = makeUser({ permissions: ['bodega.read'], modules: EMPTY_MODULES })
    expect(getHomeRoute(user)).toBe('/bodega/home')
  })

  it('respeta el orden de prioridad ventas_diseno > compras > bodega > servicios > admin_contab > gerencia > operaciones', () => {
    const user = makeUser({
      modules: {
        ...EMPTY_MODULES,
        bodega:    { view: true, view_team: false, edit: false, approve: false },
        servicios: { view: true, view_team: false, edit: false, approve: false },
      },
    })
    expect(getHomeRoute(user)).toBe('/bodega/home')
  })

  it('sin ningún módulo visible, cae al fallback universal (/settings, sin gate)', () => {
    const user = makeUser({ modules: EMPTY_MODULES, permissions: [] })
    expect(getHomeRoute(user)).toBe(UNIVERSAL_FALLBACK_ROUTE)
  })
})
