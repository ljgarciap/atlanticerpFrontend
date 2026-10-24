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
  useAuthStore.setState({ lastUserId: null })   // clearAuth() conserva el id (idempotencia ante 401 en paralelo): se reinicia entre tests
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

// SCRUM-1159 (Pre-QA N-1/N-2) — se recuerda quién tenía la sesión que se cerró, para que RequireAuth ligue el destino a esa persona.
describe('authStore — lastUserId (destino ligado a la persona)', () => {
  it('clearAuth() guarda el id de la persona que tenía la sesión', () => {
    useAuthStore.getState().setAuth(makeUser({ id: 35 }), 'a', 'r')
    useAuthStore.getState().clearAuth()
    expect(useAuthStore.getState().lastUserId).toBe(35)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clearAuth() sin sesión previa no inventa un id', () => {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearAuth()
    expect(useAuthStore.getState().lastUserId).toBeNull()
  })

  // Verificado en el navegador real: al expirar la sesión llegan varios 401 en paralelo y cada uno llama a clearAuth().
  it('varias llamadas seguidas a clearAuth() (401 en paralelo) NO pisan el id con null', () => {
    useAuthStore.getState().setAuth(makeUser({ id: 35 }), 'a', 'r')
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearAuth()
    expect(useAuthStore.getState().lastUserId).toBe(35)
  })

  it('setAuth() lo reinicia (quien entra deja de heredar el rastro de la anterior)', () => {
    useAuthStore.getState().setAuth(makeUser({ id: 35 }), 'a', 'r')
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().setAuth(makeUser({ id: 6 }), 'a2', 'r2')
    expect(useAuthStore.getState().lastUserId).toBeNull()
  })

  it('no se persiste (solo vive en memoria)', () => {
    useAuthStore.getState().setAuth(makeUser({ id: 35 }), 'a', 'r')
    useAuthStore.getState().clearAuth()
    expect(localStorage.getItem('atlanticerp-auth-v3') ?? '').not.toContain('lastUserId')
  })
})

// SCRUM-746 — refreshTokens() es lo que usa el mecanismo de refresh silencioso
// (src/lib/silentTokenRefresh.ts vía src/api/authApi.ts) para rotar el par de tokens en segundo
// plano, sin que se note como un evento de sesión nueva.
describe('authStore — refreshTokens() (SCRUM-746 silent refresh)', () => {
  it('actualiza accessToken y refreshToken sin tocar user', () => {
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
