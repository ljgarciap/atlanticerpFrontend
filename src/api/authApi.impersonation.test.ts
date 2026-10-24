import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as axiosModule from 'axios'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { queryClient } from '@/lib/queryClient'
import type { UserInfo } from '@/types/auth'

// SCRUM-1158 — interceptores de authApi.ts ante «Ver como usuario»: 403 `impersonation_read_only` (aviso), 401 durante la sesión observada
// (se vuelve a la sesión real en vez de ir al login), 401 rezagados tras volver, y C8 (sin refresh token el refresh silencioso es inerte).
// Mismo arnés que authApi.test.ts: axios mockeado, se disparan a mano los interceptores reales.
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn(),
  }
  return { default: { create: vi.fn(() => instance) }, __mockInstance: instance }
})

const mockInstance = (axiosModule as unknown as {
  __mockInstance: { interceptors: { response: { use: ReturnType<typeof vi.fn> } }; post: ReturnType<typeof vi.fn> }
}).__mockInstance

await import('./authApi')

function handlers() {
  const call = mockInstance.interceptors.response.use.mock.calls[0] as [(res: unknown) => unknown, (err: unknown) => unknown]
  return { onSuccess: call[0], onError: call[1] }
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Super', last_name: 'Admin', email: 's@x.test', phone: null, notes: null, department_id: null,
    language: 'es', security_level: 10, role: 'superadmin', role_id: 1, permissions: ['superadmin.all'],
    modules: {} as UserInfo['modules'], flags: { approve_large_amounts: false, manage_users: false },
    ...overrides,
  }
}

const observed = (): UserInfo => makeUser({
  id: 77, role: 'vendedor',
  impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera', expires_at: '2099-01-01T00:00:00Z' },
})

function makeJwt(expSeconds: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 77, exp: expSeconds })}.sig`
}

function startObserved() {
  useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')
  useAuthStore.getState().startImpersonation(observed(), makeJwt(Math.floor(Date.now() / 1000) + 60))
}

// Las ventanas anti-rezago (5 s) y anti-ráfaga de avisos (3 s) son estado de módulo: cada test arranca 1 min después del anterior.
const T0 = Date.now()
let tick = 0

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0 + ++tick * 60_000)
  queryClient.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ lastUserId: null, sessionExpired: false })
  useToastStore.setState({ toasts: [] })
  sessionStorage.clear(); localStorage.clear()
  mockInstance.post.mockReset()
})

describe('403 impersonation_read_only', () => {
  it('muestra un aviso de solo lectura y deja pasar el error; ráfagas del mismo 403 no apilan avisos', async () => {
    const { onError } = handlers()
    startObserved()
    const err = { response: { status: 403, data: { code: 'impersonation_read_only' } }, config: { url: '/crm/projects' } }

    await expect(onError(err)).rejects.toBe(err)
    await expect(onError(err)).rejects.toBe(err)
    await expect(onError(err)).rejects.toBe(err)

    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].type).toBe('error')
    expect(useAuthStore.getState().user?.impersonation).toBeTruthy()   // no cierra nada
  })

  it('un 403 de otro tipo no dispara el aviso', async () => {
    const { onError } = handlers()
    startObserved()
    useToastStore.setState({ toasts: [] })

    await expect(onError({ response: { status: 403, data: { code: 'otra_cosa' } }, config: { url: '/crm/projects' } })).rejects.toBeDefined()

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

describe('401 durante la sesión observada', () => {
  it('vuelve a la sesión real con aviso, sin ir a login ni marcar sesión expirada', async () => {
    const { onError } = handlers()
    startObserved()

    await expect(onError({ response: { status: 401, data: { code: 'impersonation_ended' } }, config: { url: '/crm/projects' } })).rejects.toBeDefined()

    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(1)
    expect(state.refreshToken).toBe('actor-refresh')
    expect(state.sessionExpired).toBe(false)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('los 401 rezagados de peticiones en vuelo NO cierran la sesión real recién restaurada', async () => {
    const { onError } = handlers()
    startObserved()
    const err401 = { response: { status: 401 }, config: { url: '/crm/projects' } }

    await expect(onError(err401)).rejects.toBeDefined()   // la primera restaura
    await expect(onError(err401)).rejects.toBeDefined()   // llegan tarde con el token de la sesión observada
    await expect(onError(err401)).rejects.toBeDefined()

    expect(useAuthStore.getState().user?.id).toBe(1)
    expect(useAuthStore.getState().accessToken).toBe('actor-access')
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })

  it('si la sesión real ya no existe, se trata como sesión expirada normal', async () => {
    const { onError } = handlers()
    useAuthStore.setState({ user: observed(), accessToken: 'imp', refreshToken: null })   // sin origen en sessionStorage

    await expect(onError({ response: { status: 401 }, config: { url: '/crm/projects' } })).rejects.toBeDefined()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().sessionExpired).toBe(true)
  })

  it('un 401 de /auth/impersonation/stop no expira la sesión real ni restaura por su cuenta', async () => {
    const { onError } = handlers()
    startObserved()

    await expect(onError({ response: { status: 401 }, config: { url: '/auth/impersonation/stop' } })).rejects.toBeDefined()

    expect(useAuthStore.getState().user?.impersonation).toBeTruthy()   // lo restaura endImpersonation(), no el interceptor
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })
})

describe('C8 — sin refresh token el refresh silencioso queda inerte durante la sesión observada', () => {
  it('una respuesta exitosa con el token a punto de vencer NO llama a /auth/refresh', async () => {
    const { onSuccess } = handlers()
    startObserved()   // exp en 60 s: dentro del buffer de 3 min, justo cuando una sesión normal sí refrescaría
    expect(useAuthStore.getState().refreshToken).toBeNull()

    onSuccess({ config: { url: '/crm/projects' }, data: {} })
    await new Promise(r => setTimeout(r, 0))

    expect(mockInstance.post).not.toHaveBeenCalled()
  })
})

describe('403 password_change_required durante la sesión observada (Senior Review R1)', () => {
  it('NO marca el cambio obligatorio: no es del superadmin que mira', async () => {
    const { onError } = handlers()
    startObserved()
    const err = { response: { status: 403, data: { code: 'password_change_required' } }, config: { url: '/crm/projects' } }

    await expect(onError(err)).rejects.toBe(err)

    expect(useAuthStore.getState().user?.must_change_password).not.toBe(true)
    expect(useAuthStore.getState().user?.impersonation).toBeTruthy()
  })

  it('en una sesión normal sigue marcándolo (comportamiento previo)', async () => {
    const { onError } = handlers()
    useAuthStore.getState().setAuth(makeUser(), 'actor-access', 'actor-refresh')

    await expect(onError({ response: { status: 403, data: { code: 'password_change_required' } }, config: { url: '/crm/projects' } })).rejects.toBeDefined()

    expect(useAuthStore.getState().user?.must_change_password).toBe(true)
  })
})

