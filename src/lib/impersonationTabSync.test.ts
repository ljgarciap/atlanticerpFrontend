import { describe, expect, it, vi, beforeEach } from 'vitest'
import { impersonationIdFromStored, impersonationChangedByOtherTab, installImpersonationTabSync } from './impersonationTabSync'
import { AUTH_PERSIST_KEY, useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

// SCRUM-1158 (Pre-QA UI-C) — la pestaña que NO originó el cambio se recarga al entrar/salir de «Ver como»; el refresh silencioso y los
// login/logout normales no recargan nada.

const actor: UserInfo = { id: 1, first_name: 'Super', last_name: 'Admin', email: 's@x.test', role: 'superadmin', permissions: [] }
const observed = (id = 'imp-1'): UserInfo => ({
  ...actor, id: 77, role: 'vendedor',
  impersonation: { id, actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera', expires_at: '2099-01-01T00:00:00Z' },
})
const stored = (user: UserInfo | null, refreshToken: string | null = 'r') => JSON.stringify({ state: { user, refreshToken }, version: 0 })

function dispatch(init: { key?: string | null; oldValue?: string | null; newValue?: string | null; storageArea?: Storage | null }) {
  window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }))
}

beforeEach(() => {
  useAuthStore.getState().clearAuth()
  sessionStorage.clear(); localStorage.clear()
})

describe('impersonationIdFromStored', () => {
  it('lee el id de la sesión observada de la sesión persistida', () => {
    expect(impersonationIdFromStored(stored(observed('abc')))).toBe('abc')
  })
  it('null sin sesión observada, sin valor o con valor ilegible', () => {
    expect(impersonationIdFromStored(stored(actor))).toBeNull()
    expect(impersonationIdFromStored(stored(null))).toBeNull()
    expect(impersonationIdFromStored(null)).toBeNull()
    expect(impersonationIdFromStored('{no es json')).toBeNull()
    expect(impersonationIdFromStored(JSON.stringify({ state: { user: { impersonation: null } } }))).toBeNull()
  })
})

describe('impersonationChangedByOtherTab', () => {
  const ev = (oldValue: string | null, newValue: string | null, key: string | null = AUTH_PERSIST_KEY, storageArea: Storage | null = localStorage) =>
    ({ key, oldValue, newValue, storageArea })

  it('inicio de Ver como en otra pestaña → recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored(observed())), true)).toBe(true)
  })
  it('fin de Ver como en otra pestaña → recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(observed()), stored(actor)), true)).toBe(true)
  })
  it('cierre de sesión estando en Ver como (la sesión observada desaparece) → recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(observed()), stored(null, null)), true)).toBe(true)
  })
  it('otra sesión observada distinta → recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(observed('imp-1')), stored(observed('imp-2'))), true)).toBe(true)
  })

  it('refresh silencioso (mismo usuario, cambia el refresh token) → NO recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor, 'r1'), stored(actor, 'r2')), true)).toBe(false)
  })
  it('refresh silencioso dentro de Ver como (mismo id) → NO recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(observed(), null), stored(observed(), null)), true)).toBe(false)
  })
  it('login normal (sin sesión → sesión) → NO recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(null, null), stored(actor)), true)).toBe(false)
    expect(impersonationChangedByOtherTab(ev(null, stored(actor)), true)).toBe(false)
  })
  it('logout normal (sesión → sin sesión) → NO recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored(null, null)), true)).toBe(false)
  })
  it('cambio de perfil o de idioma (mismo usuario) → NO recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored({ ...actor, language: 'en' })), true)).toBe(false)
  })
  it('el `accessToken` solo, aunque cambie, NO recarga (el refresh silencioso lo reescribe)', () => {
    expect(impersonationChangedByOtherTab(ev('old-token', 'new-token', 'accessToken'), true)).toBe(false)
  })
  it('otras claves y sessionStorage se ignoran', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored(observed()), 'otra-clave'), true)).toBe(false)
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored(observed()), AUTH_PERSIST_KEY, sessionStorage), true)).toBe(false)
  })
  it('una pestaña sin sesión (en el login) no se recarga', () => {
    expect(impersonationChangedByOtherTab(ev(stored(actor), stored(observed())), false)).toBe(false)
  })
})

describe('installImpersonationTabSync — con eventos reales', () => {
  it('recarga al iniciar y al salir de Ver como en otra pestaña, y no en el resto', () => {
    const reload = vi.fn()
    const uninstall = installImpersonationTabSync(window, reload)
    useAuthStore.setState({ user: actor })

    // refresh silencioso: no recarga
    dispatch({ key: 'accessToken', oldValue: 'a', newValue: 'b' })
    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(actor, 'r1'), newValue: stored(actor, 'r2') })
    // login/logout sin impersonación: no recarga
    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(null, null), newValue: stored(actor) })
    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(actor), newValue: stored(null, null) })
    expect(reload).not.toHaveBeenCalled()

    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(actor), newValue: stored(observed()) })   // inicio
    expect(reload).toHaveBeenCalledTimes(1)
    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(observed()), newValue: stored(actor) })   // fin
    expect(reload).toHaveBeenCalledTimes(2)

    uninstall()
  })

  it('una pestaña sin sesión no se recarga aunque otra inicie Ver como', () => {
    const reload = vi.fn()
    const uninstall = installImpersonationTabSync(window, reload)

    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(actor), newValue: stored(observed()) })

    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })

  it('al desinstalar deja de escuchar', () => {
    const reload = vi.fn()
    const uninstall = installImpersonationTabSync(window, reload)
    useAuthStore.setState({ user: actor })
    uninstall()

    dispatch({ key: AUTH_PERSIST_KEY, oldValue: stored(actor), newValue: stored(observed()) })

    expect(reload).not.toHaveBeenCalled()
  })

  it('la propia pestaña escribiendo el store no se recarga a sí misma (el evento storage no se dispara en quien escribe)', () => {
    const reload = vi.fn()
    const uninstall = installImpersonationTabSync(window, reload)
    useAuthStore.getState().setAuth(actor, 'a', 'r')

    useAuthStore.getState().startImpersonation(observed(), 'imp')
    useAuthStore.getState().restoreOrigin()

    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })
})
