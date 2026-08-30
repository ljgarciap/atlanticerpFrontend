import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'
import { queryClient } from '@/lib/queryClient'
import type { UserInfo } from '@/types/auth'

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 'test@atlantic.test',
    phone: null, notes: null, department_id: null, language: 'es', security_level: 4,
    role: 'designer', role_id: 1, permissions: [], modules: {} as UserInfo['modules'],
    flags: { approve_large_amounts: false, manage_users: false },
    ...overrides,
  }
}

beforeEach(() => {
  queryClient.clear()
  useAuthStore.getState().clearAuth()
})

describe('authStore — limpieza de cache entre sesiones', () => {
  it('clearAuth() limpia el cache de queries (logout / sesión expirada)', () => {
    queryClient.setQueryData(['ventas-diseno-pipeline', 'own'], ['stale-data-from-previous-user'])
    expect(queryClient.getQueryData(['ventas-diseno-pipeline', 'own'])).toBeDefined()

    useAuthStore.getState().clearAuth()

    expect(queryClient.getQueryData(['ventas-diseno-pipeline', 'own'])).toBeUndefined()
  })

  it('setAuth() tambien limpia el cache como red de seguridad adicional', () => {
    queryClient.setQueryData(['ventas-diseno-pipeline', 'own'], ['stale-data-from-previous-user'])

    useAuthStore.getState().setAuth(makeUser(), 'access-token', 'refresh-token')

    expect(queryClient.getQueryData(['ventas-diseno-pipeline', 'own'])).toBeUndefined()
  })
})

// SCRUM-746 — refreshTokens() es lo que usa el mecanismo de refresh silencioso
// (src/lib/silentTokenRefresh.ts vía src/api/authApi.ts) para rotar el par de tokens en segundo
// plano, sin que se note como un evento de sesión nueva.
describe('authStore — refreshTokens() (SCRUM-746 silent refresh)', () => {
  it('actualiza accessToken y refreshToken sin tocar user/pendingRoleSelection', () => {
    const user = makeUser()
    useAuthStore.getState().setAuth(user, 'old-access', 'old-refresh')

    useAuthStore.getState().refreshTokens('new-access', 'new-refresh')

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('new-access')
    expect(state.refreshToken).toBe('new-refresh')
    expect(state.user).toEqual(user)
    expect(localStorage.getItem('accessToken')).toBe('new-access')
  })

  it('a diferencia de setAuth(), no limpia el cache de queries (no es una sesión nueva)', () => {
    useAuthStore.getState().setAuth(makeUser(), 'old-access', 'old-refresh')
    queryClient.setQueryData(['ventas-diseno-pipeline', 'own'], ['data-still-valid'])

    useAuthStore.getState().refreshTokens('new-access', 'new-refresh')

    expect(queryClient.getQueryData(['ventas-diseno-pipeline', 'own'])).toEqual(['data-still-valid'])
  })
})
