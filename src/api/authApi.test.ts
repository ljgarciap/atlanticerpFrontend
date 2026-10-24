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


describe('authApi response interceptor — reset de contraseñas: 401 y carrera del refresh silencioso', () => {
  it('un 401 en una petición normal (token anterior a un reset) lleva a login una sola vez y NO intenta refrescar', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), makeJwt(nowSeconds() + 3600), 'refresh-abc')

    await expect(onError({ response: { status: 401 }, config: { url: '/crm/projects' } })).rejects.toBeDefined()
    await expect(onError({ response: { status: 401 }, config: { url: '/crm/projects' } })).rejects.toBeDefined()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().sessionExpired).toBe(true)
    expect(mockInstance.post).not.toHaveBeenCalled() // sin bucle de refresh
  })

  it('un 401 de /auth/login (credenciales) no cierra una sesión vigente', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), makeJwt(nowSeconds() + 3600), 'refresh-abc')

    await expect(onError({ response: { status: 401 }, config: { url: '/auth/login' } })).rejects.toBeDefined()

    expect(useAuthStore.getState().accessToken).not.toBeNull()
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })

  it('si el refresh silencioso (con el token VIEJO ya revocado) falla DESPUÉS de que la pantalla obligatoria reemplazó los tokens, no cierra la sesión nueva', async () => {
    const { onSuccess } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), makeJwt(nowSeconds() + 60), 'refresh-viejo')

    let rejectRefresh!: (e: unknown) => void
    mockInstance.post.mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject }))

    onSuccess({ config: { url: '/crm/projects' }, data: {} }) // dispara el refresh con 'refresh-viejo'
    await vi.waitFor(() => expect(mockInstance.post).toHaveBeenCalledTimes(1))

    // Mientras tanto, el cambio de contraseña volvió a iniciar sesión y reemplazó los tokens.
    useAuthStore.getState().setAuth(makeUser(), makeJwt(nowSeconds() + 3600), 'refresh-nuevo')

    rejectRefresh({ response: { status: 401 } }) // el refresh viejo falla (token revocado)
    await new Promise(r => setTimeout(r, 0))

    expect(useAuthStore.getState().accessToken).not.toBeNull()
    expect(useAuthStore.getState().refreshToken).toBe('refresh-nuevo')
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })
})

describe('authApi response interceptor — reset de contraseñas (403 password_change_required)', () => {
  it('marca must_change_password en el store ante un 403 password_change_required, sin tocar tokens ni cerrar sesión', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')

    await Promise.allSettled([onError({
      response: { status: 403, data: { message: 'x', code: 'password_change_required' } },
      config:   { url: '/crm/projects' },
    })])

    const state = useAuthStore.getState()
    expect(state.user?.must_change_password).toBe(true)
    expect(state.accessToken).toBe('access-1')
    expect(state.refreshToken).toBe('refresh-1')
    expect(state.sessionExpired).toBe(false)
  })

  it('es idempotente: varios 403 en paralelo cambian el estado UNA sola vez (sin re-render en bucle)', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')
    const listener = vi.fn()
    const unsubscribe = useAuthStore.subscribe(listener)

    const err = () => ({ response: { status: 403, data: { code: 'password_change_required' } }, config: { url: '/a' } })
    await Promise.allSettled([onError(err()), onError(err()), onError(err())])
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.must_change_password).toBe(true)
  })

  it('no hace nada con un 403 de permisos normal (sin ese code) ni inicia un refresh', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')

    await Promise.allSettled([onError({ response: { status: 403, data: { message: 'Forbidden' } }, config: { url: '/a' } })])

    expect(useAuthStore.getState().user?.must_change_password).toBeUndefined()
    expect(mockInstance.post).not.toHaveBeenCalled()
  })

  it('no inventa un usuario si no hay sesión', async () => {
    const { onError } = getResponseHandlers()
    await Promise.allSettled([onError({ response: { status: 403, data: { code: 'password_change_required' } }, config: { url: '/a' } })])
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clearPasswordChangeRequired limpia el flag y también es idempotente', () => {
    useAuthStore.getState().setAuth(makeUser({ must_change_password: true }), 'a', 'r')
    const listener = vi.fn()
    const unsubscribe = useAuthStore.subscribe(listener)

    useAuthStore.getState().clearPasswordChangeRequired()
    useAuthStore.getState().clearPasswordChangeRequired()
    unsubscribe()

    expect(useAuthStore.getState().user?.must_change_password).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('authApi response interceptor — contraseña temporal vencida (401 password_reset_expired, cierre de H2)', () => {
  const expired = (url = '/crm/projects') => ({
    response: { status: 401, data: { message: 'x', code: 'password_reset_expired' } },
    config:   { url },
  })

  beforeEach(() => { useAuthStore.getState().setPasswordResetExpired(false); useAuthStore.getState().setSessionExpired(false) })

  it('cierra la sesión y deja el flag propio, SIN el modal genérico de sesión expirada y sin pedir refresh', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')

    await Promise.allSettled([onError(expired())])

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.passwordResetExpired).toBe(true)
    expect(state.sessionExpired).toBe(false)
    expect(mockInstance.post).not.toHaveBeenCalled() // ningún /auth/refresh: no hay bucle
  })

  it('es idempotente: varios 401 en paralelo marcan el flag UNA sola vez', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')
    await Promise.allSettled([onError(expired('/a'))]) // el primero cierra la sesión
    const listener = vi.fn()
    const unsubscribe = useAuthStore.subscribe(listener)

    await Promise.allSettled([onError(expired('/b')), onError(expired('/c')), onError(expired('/d'))])
    unsubscribe()

    // clearAuth() puede notificar, pero el flag no vuelve a escribirse (sin re-render en bucle por el flag).
    expect(useAuthStore.getState().passwordResetExpired).toBe(true)
    expect(mockInstance.post).not.toHaveBeenCalled()
  })

  it('un 401 genérico (otro code o sin code) sigue mostrando el modal de sesión expirada y NO marca el flag', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')

    await Promise.allSettled([onError({ response: { status: 401, data: { message: 'No autenticado' } }, config: { url: '/crm/projects' } })])

    expect(useAuthStore.getState().sessionExpired).toBe(true)
    expect(useAuthStore.getState().passwordResetExpired).toBe(false)
  })

  it('en una ruta de auth (login) no cierra una sesión vigente ni marca el flag: lo maneja la propia pantalla', async () => {
    const { onError } = getResponseHandlers()
    useAuthStore.getState().setAuth(makeUser(), 'access-1', 'refresh-1')

    await Promise.allSettled([onError(expired('/auth/login'))])

    expect(useAuthStore.getState().user).not.toBeNull()
    expect(useAuthStore.getState().passwordResetExpired).toBe(false)
  })

  it('un login posterior (setAuth) limpia el flag', () => {
    useAuthStore.getState().setPasswordResetExpired(true)
    useAuthStore.getState().setAuth(makeUser(), 'a', 'r')
    expect(useAuthStore.getState().passwordResetExpired).toBe(false)
  })

  it('el flag solo vive en memoria: no se persiste', () => {
    useAuthStore.getState().setPasswordResetExpired(true)
    const persisted = JSON.parse(localStorage.getItem('atlanticerp-auth-v3') ?? '{}')
    expect(persisted.state ?? {}).not.toHaveProperty('passwordResetExpired')
  })
})
