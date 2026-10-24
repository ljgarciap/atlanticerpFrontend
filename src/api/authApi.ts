import axios from 'axios'
import type { AnyLoginResponse, LoginResponse } from '@/types/auth'
import { isMfaRequiredResponse } from '@/types/auth'
import { useAuthStore, restoredFromImpersonationWithin } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import i18n from '@/i18n'
import { createSilentRefreshHandler } from '@/lib/silentTokenRefresh'
import { SERVER_BUSY_MAX_RETRIES, isRetryableMethod, isServerBusy, serverBusyDelay } from '@/lib/serverBusyRetry'

const currentPath = (): string => (typeof window !== 'undefined' ? window.location.pathname : '')

const api = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // SCRUM-29 BUG-06/09: el backend traduce sus mensajes (ej. "Credenciales
  // inválidas") según este header — no depende de sesión/JWT, por lo que
  // también cubre login fallido sin sesión activa.
  config.headers['Accept-Language'] = localStorage.getItem('atlanticerp_lang') ?? 'es'
  return config
})

// Auth routes that legitimately return 401 and should not trigger the session-expired modal
// SCRUM-1158: `/auth/impersonation/stop` también — un 401 ahí solo dice que la sesión observada ya terminó, no que la del superadmin expiró.
const AUTH_PATHS = ['/auth/login', '/auth/mfa/verify', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password', '/auth/impersonation/stop']

// SCRUM-1158 — ventana en la que se ignoran los 401 rezagados tras volver a la sesión real (ver restoredFromImpersonationWithin).
const IMPERSONATION_STALE_401_MS = 5000
// Varias peticiones fallan a la vez con el mismo 403: un solo aviso, no una ráfaga de toasts.
let lastReadOnlyNoticeAt = 0
const READ_ONLY_NOTICE_GAP_MS = 3000

// SCRUM-746 — silent refresh: refresca el access token en segundo plano mientras haya actividad
// real (cualquier request autenticado exitoso), antes de que expire por su propio `session_timeout_min`.
// `deps.refresh` referencia `authApi.refresh` más abajo en este mismo archivo -- resuelve bien
// pese al orden porque solo se invoca en runtime, después de que el módulo terminó de cargar (ver
// docblock de src/lib/silentTokenRefresh.ts para el detalle completo del mecanismo).
// Reset de contraseñas — el refresh token con el que se lanzó el último refresh silencioso. Si cuando
// ese refresh falla el store ya tiene OTRO refresh token (la pantalla obligatoria de cambio de
// contraseña acaba de volver a iniciar sesión y reemplazó los tokens), el fallo es del token viejo
// ya revocado y NO debe cerrar la sesión nueva.
let lastSilentRefreshToken: string | null = null

const handleSilentRefresh = createSilentRefreshHandler({
  isExcludedPath: url => AUTH_PATHS.some(p => url.includes(p)),
  getTokens: () => {
    const { accessToken, refreshToken } = useAuthStore.getState()
    return { accessToken, refreshToken }
  },
  applyTokens: (accessToken, refreshToken) => {
    useAuthStore.getState().refreshTokens(accessToken, refreshToken)
  },
  onRefreshFailed: () => {
    const current = useAuthStore.getState().refreshToken
    if (lastSilentRefreshToken !== null && current !== null && current !== lastSilentRefreshToken) return
    // Mismo flujo que cualquier 401 reactivo de abajo -- el refresh silencioso falló (ej. ya se
    // cumplió el gate de inactividad de 10h o el techo de 30 días desde el login original).
    const { clearAuth, setSessionExpired } = useAuthStore.getState()
    clearAuth()
    setSessionExpired(true)
  },
  refresh: refreshToken => { lastSilentRefreshToken = refreshToken; return authApi.refresh(refreshToken) },
})

api.interceptors.response.use(
  res => {
    handleSilentRefresh(res.config?.url ?? '')
    return res
  },
  async err => {
    // 503 `server_busy` de nginx (CAP-02): se reintenta la lectura con espera variable antes de mostrar un error (ver serverBusyRetry.ts).
    const cfg = err.config as (typeof err.config & { __busyRetries?: number; __busyOrigin?: string }) | undefined
    const busyRetries = cfg?.__busyRetries ?? 0
    const busyOrigin = cfg?.__busyOrigin ?? currentPath()
    if (cfg && busyRetries < SERVER_BUSY_MAX_RETRIES && isRetryableMethod(cfg.method) && !cfg.signal?.aborted && await isServerBusy(err)) {
      // Se reintenta solo mientras la persona siga en la pantalla que hizo la llamada: al navegar a otra, la respuesta ya no le sirve a nadie.
      cfg.__busyOrigin = busyOrigin
      cfg.__busyRetries = busyRetries + 1
      await new Promise(resolve => setTimeout(resolve, serverBusyDelay(busyRetries)))
      if (currentPath() === busyOrigin) return api.request(cfg)
      return Promise.reject(err)
    }

    const status = err.response?.status
    const url: string = err.config?.url ?? ''
    const isAuthRoute = AUTH_PATHS.some(p => url.includes(p))

    if (status === 401 && !isAuthRoute && restoredFromImpersonationWithin(IMPERSONATION_STALE_401_MS)) {
      // Petición de la sesión observada que respondió tarde: la sesión real del superadmin sigue vigente.
      return Promise.reject(err)
    }

    if (status === 401 && !isAuthRoute && useAuthStore.getState().user?.impersonation) {
      // SCRUM-1158 — la sesión observada terminó (venció, la cerró el actor u otro superadmin, o se bloqueó a alguien): se vuelve a la
      // sesión real en vez de mandar al login. Si ya no existe, restoreOrigin() la cierra y se avisa como una expiración normal.
      if (useAuthStore.getState().restoreOrigin()) {
        useToastStore.getState().show(i18n.t('common:impersonation.endedToast'), 'error')
      } else {
        useAuthStore.getState().setSessionExpired(true)
      }
      return Promise.reject(err)
    }

    if (status === 401 && !isAuthRoute) {
      const { clearAuth, setSessionExpired, setPasswordResetExpired } = useAuthStore.getState()
      clearAuth()
      // Cierre de H2 — la contraseña temporal de un reset administrativo venció con la sesión viva: se
      // vuelve al login con su propio mensaje (no el modal genérico de "sesión expirada"). Sin refresh
      // ni redirección acá, así que no puede haber bucle: RequireAuth ve `user === null` y lleva a /login.
      if (err.response?.data?.code === 'password_reset_expired') setPasswordResetExpired(true)
      else setSessionExpired(true)
    }

    // Reset de contraseñas — el backend bloquea con 403 `password_change_required` todo salvo
    // GET /auth/me y PUT /auth/password mientras la cuenta tiene el cambio pendiente. Solo se
    // marca el flag en el store (idempotente): RequireAuth re-renderiza y muestra la pantalla
    // obligatoria. No hay redirección ni refresh de token acá, así que no puede haber bucle.
    if (status === 403 && err.response?.data?.code === 'password_change_required') {
      useAuthStore.getState().markPasswordChangeRequired()
    }

    // SCRUM-1158 — «Ver como usuario» es de solo lectura: el backend responde 403 `impersonation_read_only` a toda escritura. Los botones
    // de guardar NO se ocultan (la pantalla debe ser idéntica a la de la persona observada); acá solo se explica por qué no se guardó.
    if (status === 403 && err.response?.data?.code === 'impersonation_read_only') {
      const now = Date.now()
      if (now - lastReadOnlyNoticeAt > READ_ONLY_NOTICE_GAP_MS) {
        lastReadOnlyNoticeAt = now
        useToastStore.getState().show(i18n.t('common:impersonation.readOnlyToast'), 'error')
      }
    }

    return Promise.reject(err)
  }
)

const mapLoginResponse = (data: Record<string, unknown>): LoginResponse => ({
  accessToken:  data.token as string,
  tokenType:    data.token_type as string,
  expiresIn:    data.expires_in_ms as number,
  refreshToken: data.refresh_token as string,
  user:         data.user as LoginResponse['user'],
})

export const authApi = {
  login: (email: string, password: string): Promise<AnyLoginResponse> =>
    api.post('/auth/login', { email, password }).then(r => {
      if (isMfaRequiredResponse(r.data)) return r.data
      return mapLoginResponse(r.data as Record<string, unknown>)
    }),

  mfaVerify: (challengeId: string, code: string): Promise<LoginResponse> =>
    api.post('/auth/mfa/verify', { mfa_challenge_id: challengeId, code })
      .then(r => mapLoginResponse(r.data as Record<string, unknown>)),

  mfaResend: (challengeId: string): Promise<{ mfa_challenge_id: string }> =>
    api.post('/auth/mfa/resend', { mfa_challenge_id: challengeId })
      .then(r => r.data as { mfa_challenge_id: string }),

  changePassword: (currentPassword: string, newPassword: string, newPasswordConfirmation: string) =>
    api.put('/auth/password', {
      current_password:           currentPassword,
      new_password:               newPassword,
      new_password_confirmation:  newPasswordConfirmation,
    }),

  updateProfile: (data: { first_name?: string; last_name?: string; phone?: string | null; notes?: string | null; department_id?: number | null; language?: string }): Promise<{ id: number; first_name: string; last_name: string; email: string; phone: string | null; notes: string | null; department_id: number | null; language: string }> =>
    api.patch('/auth/profile', data).then(r => r.data as { id: number; first_name: string; last_name: string; email: string; phone: string | null; notes: string | null; department_id: number | null; language: string }),

  me: () =>
    api.get('/auth/me').then(r => r.data),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {}),

  refresh: (refreshToken: string): Promise<LoginResponse> =>
    api.post('/auth/refresh', { refresh_token: refreshToken })
      .then(r => mapLoginResponse(r.data as Record<string, unknown>)),

  forgotPassword: (email: string): Promise<{ message: string }> =>
    api.post('/auth/forgot-password', { email }).then(r => r.data as { message: string }),

  resetPassword: (token: string, password: string, passwordConfirmation: string): Promise<{ message: string }> =>
    api.post('/auth/reset-password', {
      token,
      password,
      password_confirmation: passwordConfirmation,
    }).then(r => r.data as { message: string }),

  getDepartments: (): Promise<{ data: { id: number; name: string }[] }> =>
    api.get('/auth/departments').then(r => r.data as { data: { id: number; name: string }[] }),

  mfaStatus: (): Promise<{ mfa_enabled: boolean; mfa_mode: string }> =>
    api.get('/auth/mfa/status').then(r => r.data as { mfa_enabled: boolean; mfa_mode: string }),

  mfaEnable: (password: string): Promise<{ mfa_challenge_id: string }> =>
    api.post('/auth/mfa/enable', { password }).then(r => r.data as { mfa_challenge_id: string }),

  mfaConfirmEnable: (challengeId: string, code: string): Promise<{ mfa_enabled: boolean }> =>
    api.post('/auth/mfa/enable/confirm', { mfa_challenge_id: challengeId, code })
      .then(r => r.data as { mfa_enabled: boolean }),

  mfaDisable: (): Promise<{ mfa_enabled: boolean }> =>
    api.post('/auth/mfa/disable').then(r => r.data as { mfa_enabled: boolean }),
}

export default api
