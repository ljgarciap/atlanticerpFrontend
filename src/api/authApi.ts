import axios from 'axios'
import type { AnyLoginResponse, LoginResponse, MultiRoleLoginResponse } from '@/types/auth'
import { isMultiRoleResponse, isMfaRequiredResponse } from '@/types/auth'
import { useAuthStore } from '@/store/authStore'
import { createSilentRefreshHandler } from '@/lib/silentTokenRefresh'

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
const AUTH_PATHS = ['/auth/login', '/auth/mfa/verify', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password']

// SCRUM-746 — silent refresh: refresca el access token en segundo plano mientras haya actividad
// real (cualquier request autenticado exitoso), antes de que expire por su propio `session_timeout_min`.
// `deps.refresh` referencia `authApi.refresh` más abajo en este mismo archivo -- resuelve bien
// pese al orden porque solo se invoca en runtime, después de que el módulo terminó de cargar (ver
// docblock de src/lib/silentTokenRefresh.ts para el detalle completo del mecanismo).
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
    // Mismo flujo que cualquier 401 reactivo de abajo -- el refresh silencioso falló (ej. ya se
    // cumplió el gate de inactividad de 10h o el techo de 30 días desde el login original).
    const { clearAuth, setSessionExpired } = useAuthStore.getState()
    clearAuth()
    setSessionExpired(true)
  },
  refresh: refreshToken => authApi.refresh(refreshToken),
})

api.interceptors.response.use(
  res => {
    handleSilentRefresh(res.config?.url ?? '')
    return res
  },
  err => {
    const status = err.response?.status
    const url: string = err.config?.url ?? ''
    const isAuthRoute = AUTH_PATHS.some(p => url.includes(p))

    if (status === 401 && !isAuthRoute) {
      const { clearAuth, setSessionExpired } = useAuthStore.getState()
      clearAuth()
      setSessionExpired(true)
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
      if (isMultiRoleResponse(r.data)) return r.data
      if (isMfaRequiredResponse(r.data)) return r.data
      return mapLoginResponse(r.data as Record<string, unknown>)
    }),

  mfaVerify: (challengeId: string, code: string): Promise<LoginResponse | MultiRoleLoginResponse> =>
    api.post('/auth/mfa/verify', { mfa_challenge_id: challengeId, code }).then(r => {
      if (isMultiRoleResponse(r.data)) return r.data
      return mapLoginResponse(r.data as Record<string, unknown>)
    }),

  mfaResend: (challengeId: string): Promise<{ mfa_challenge_id: string }> =>
    api.post('/auth/mfa/resend', { mfa_challenge_id: challengeId })
      .then(r => r.data as { mfa_challenge_id: string }),

  selectRole: (selectionToken: string, role: string): Promise<LoginResponse> =>
    api.post('/auth/select-role', { selection_token: selectionToken, role })
      .then(r => mapLoginResponse(r.data as Record<string, unknown>)),

  switchRole: (role: string): Promise<LoginResponse> =>
    api.post('/auth/switch-role', { role })
      .then(r => mapLoginResponse(r.data as Record<string, unknown>)),

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

  register: (data: { first_name: string; last_name: string; email: string; department_id: number }): Promise<{ message: string }> =>
    api.post('/auth/register', data).then(r => r.data as { message: string }),

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
