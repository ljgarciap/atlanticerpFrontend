import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore, IMPERSONATION_ORIGIN_KEY } from './authStore'
import { queryClient } from '@/lib/queryClient'
import type { UserInfo } from '@/types/auth'

// SCRUM-1158 — «Ver como usuario»: la sesión real del superadmin se guarda aparte (sessionStorage) y se restaura al salir; la sesión
// observada no tiene refresh token (C8).

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Super', last_name: 'Admin', email: 'super@atlantic.test',
    phone: null, notes: null, department_id: null, language: 'es', security_level: 10,
    role: 'superadmin', role_id: 1, permissions: ['superadmin.all'], modules: {} as UserInfo['modules'],
    flags: { approve_large_amounts: false, manage_users: false },
    ...overrides,
  }
}

const target = (): UserInfo => makeUser({
  id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'vera@atlantic.test', role: 'vendedor', security_level: 4, permissions: ['ventas_diseno.read'],
  impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera Vendedora', expires_at: '2099-01-01T00:00:00Z' },
})

beforeEach(() => {
  queryClient.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ lastUserId: null })
  sessionStorage.clear()
  localStorage.clear()
})

describe('authStore — startImpersonation', () => {
  it('guarda la sesión real en sessionStorage, entra con el token observado y deja refreshToken en null (C8)', () => {
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')

    expect(useAuthStore.getState().startImpersonation(target(), 'imp-access')).toBe(true)

    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(77)
    expect(state.user?.impersonation?.target_name).toBe('Vera Vendedora')
    expect(state.accessToken).toBe('imp-access')
    expect(state.refreshToken).toBeNull()
    expect(localStorage.getItem('accessToken')).toBe('imp-access')

    const origin = JSON.parse(sessionStorage.getItem(IMPERSONATION_ORIGIN_KEY) ?? '{}')
    expect(origin.user.id).toBe(1)
    expect(origin.accessToken).toBe('actor-access')
    expect(origin.refreshToken).toBe('actor-refresh')
  })

  it('no toca el idioma ni el sidebar de quien observa, pero sí vacía el cache de consultas', () => {
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')
    localStorage.setItem('atlanticerp_lang', 'en')
    localStorage.setItem('sidebar-collapsed', 'false')
    queryClient.setQueryData(['pipeline'], ['datos del superadmin'])

    useAuthStore.getState().startImpersonation(target(), 'imp-access')

    expect(localStorage.getItem('atlanticerp_lang')).toBe('en')
    expect(localStorage.getItem('sidebar-collapsed')).toBe('false')
    expect(queryClient.getQueryData(['pipeline'])).toBeUndefined()
  })

  it('no se encadena: con una sesión observada en curso se ignora (RN7) y no pisa la sesión real guardada', () => {
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')
    useAuthStore.getState().startImpersonation(target(), 'imp-access')

    const other = makeUser({ id: 88, impersonation: { id: 'imp-2', actor_id: 77, actor_name: 'x', target_name: 'y', expires_at: '2099-01-01T00:00:00Z' } })
    expect(useAuthStore.getState().startImpersonation(other, 'imp-access-2')).toBe(false)

    expect(useAuthStore.getState().user?.id).toBe(77)
    expect(JSON.parse(sessionStorage.getItem(IMPERSONATION_ORIGIN_KEY) ?? '{}').user.id).toBe(1)
  })

  it('sin sesión no entra', () => {
    expect(useAuthStore.getState().startImpersonation(target(), 'imp-access')).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('authStore — restoreOrigin', () => {
  it('devuelve usuario, tokens (incluido el refresh real) y limpia el origen y el cache', () => {
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')
    useAuthStore.getState().startImpersonation(target(), 'imp-access')
    queryClient.setQueryData(['pipeline'], ['datos de Vera'])

    expect(useAuthStore.getState().restoreOrigin()).toBe(true)

    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(1)
    expect(state.user?.impersonation).toBeUndefined()
    expect(state.accessToken).toBe('actor-access')
    expect(state.refreshToken).toBe('actor-refresh')
    expect(localStorage.getItem('accessToken')).toBe('actor-access')
    expect(sessionStorage.getItem(IMPERSONATION_ORIGIN_KEY)).toBeNull()
    expect(queryClient.getQueryData(['pipeline'])).toBeUndefined()
  })

  it('si la sesión real ya no existe (pestaña cerrada y reabierta) cierra la sesión y devuelve false', () => {
    useAuthStore.setState({ user: target(), accessToken: 'imp-access', refreshToken: null })
    localStorage.setItem('accessToken', 'imp-access')

    expect(useAuthStore.getState().restoreOrigin()).toBe(false)

    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('un origen corrupto en sessionStorage se trata como inexistente', () => {
    useAuthStore.setState({ user: target(), accessToken: 'imp-access', refreshToken: null })
    sessionStorage.setItem(IMPERSONATION_ORIGIN_KEY, '{no es json')

    expect(useAuthStore.getState().restoreOrigin()).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('authStore — clearAuth durante una sesión observada', () => {
  it('borra también la sesión real guardada: cerrar sesión no deja un origen vivo en sessionStorage', () => {
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')
    useAuthStore.getState().startImpersonation(target(), 'imp-access')

    useAuthStore.getState().clearAuth()

    expect(sessionStorage.getItem(IMPERSONATION_ORIGIN_KEY)).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
