import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as axiosModule from 'axios'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type { UserInfo } from '@/types/auth'

// SCRUM-746 — verifica que src/api/authApi.ts efectivamente engancha el mecanismo de refresh
// silencioso (src/lib/silentTokenRefresh.ts) en su interceptor de respuesta real, no solo que la
// lógica extraída funcione en aislamiento (eso ya lo cubre silentTokenRefresh.test.ts). Mockea
// axios completo -- no hay axios-mock-adapter/msw en este repo -- capturando la instancia real que
// `api = axios.create(...)` termina usando, para poder disparar sus interceptores a mano.
vi.mock('axios', () => {
  const interceptors = {
    request:  { use: vi.fn() },
    response: { use: vi.fn() },
  }
  const instance = {
    interceptors,
    post:  vi.fn(),
    get:   vi.fn(),
    patch: vi.fn(),
    put:   vi.fn(),
  }
  return {
    default: { create: vi.fn(() => instance) },
    __mockInstance: instance,
  }
})

const mockInstance = (
  axiosModule as unknown as {
    __mockInstance: {
      interceptors: { response: { use: ReturnType<typeof vi.fn> } }
      post: ReturnType<typeof vi.fn>
    }
  }
).__mockInstance

// Importado DESPUÉS del mock -- dispara `axios.create()` y registra los interceptores reales de
// authApi.ts (incluido el wiring del refresh silencioso) contra la instancia falsa de arriba. Solo
// hace falta el efecto de lado del import, no se llama a authApi.* directamente en este archivo.
await import('./authApi')

function getResponseHandlers() {
  const call = mockInstance.interceptors.response.use.mock.calls[0] as [
    (res: unknown) => unknown,
    (err: unknown) => unknown,
  ]
  return { onSuccess: call[0], onError: call[1] }
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Original', last_name: 'User', email: 'test@atlantic.test',
    phone: null, notes: null, department_id: null, language: 'es', security_level: 4,
    role: 'designer', role_id: 1, permissions: [], modules: {} as UserInfo['modules'],
    flags: { approve_large_amounts: false, manage_users: false },
    ...overrides,
  }
}

function makeJwt(expSeconds: number): string {
  const toB64Url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${toB64Url({ alg: 'HS256', typ: 'JWT' })}.${toB64Url({ sub: 1, exp: expSeconds })}.stub-signature`
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

beforeEach(() => {
  queryClient.clear()
  useAuthStore.getState().clearAuth()
  mockInstance.post.mockReset()
})

describe('authApi response interceptor — SCRUM-746 silent refresh wiring', () => {
  it('refreshes the token in the background on a real authenticated response close to expiry, without touching `user`', async () => {
    const { onSuccess } = getResponseHandlers()
    const soonToExpire = makeJwt(nowSeconds() + 60) // 60s left -- dentro del buffer de 3 min
    useAuthStore.getState().setAuth(makeUser(), soonToExpire, 'refresh-abc')

    mockInstance.post.mockResolvedValueOnce({
      data: { token: 'new-access', token_type: 'Bearer', expires_in_ms: 900000, refresh_token: 'new-refresh' },
    })

    onSuccess({ config: { url: '/crm/projects' }, data: {} })

    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBe('new-access'))
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh')
    expect(mockInstance.post).toHaveBeenCalledWith('/auth/refresh', { refresh_token: 'refresh-abc' })
    // Distinto de setAuth(): el refresh silencioso nunca debe pisar al usuario logueado.
    expect(useAuthStore.getState().user?.first_name).toBe('Original')
  })

  it('does not call /auth/refresh when the access token still has plenty of time left (no real activity signal needed yet)', async () => {
    const { onSuccess } = getResponseHandlers()
    const farFromExpiry = makeJwt(nowSeconds() + 60 * 60) // 1h
    useAuthStore.getState().setAuth(makeUser(), farFromExpiry, 'refresh-abc')

    onSuccess({ config: { url: '/crm/projects' }, data: {} })
    await new Promise(r => setTimeout(r, 0))

    expect(mockInstance.post).not.toHaveBeenCalled()
  })

  it('logs the user out via the same flow as any other 401 when the silent refresh call itself fails (inactivity gate / 30-day ceiling)', async () => {
    const { onSuccess } = getResponseHandlers()
    const soonToExpire = makeJwt(nowSeconds() + 60)
    useAuthStore.getState().setAuth(makeUser(), soonToExpire, 'refresh-abc')

    mockInstance.post.mockRejectedValueOnce({ response: { status: 401, data: { message: 'auth.token_invalid' } } })

    onSuccess({ config: { url: '/crm/projects' }, data: {} })

    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull())
    expect(useAuthStore.getState().sessionExpired).toBe(true)
  })

  it('the existing reactive 401 flow (unrelated to silent refresh) still logs the user out', async () => {
    const { onError } = getResponseHandlers()
    const farFromExpiry = makeJwt(nowSeconds() + 60 * 60)
    useAuthStore.getState().setAuth(makeUser(), farFromExpiry, 'refresh-abc')

    await expect(
      onError({ response: { status: 401 }, config: { url: '/crm/projects' } })
    ).rejects.toBeDefined()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().sessionExpired).toBe(true)
  })
})
