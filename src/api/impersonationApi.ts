import api from './authApi'
import type { UserInfo } from '@/types/auth'

/**
 * SCRUM-1158 — «Ver como usuario». Contrato (docs/architecture/scrum-1158-ver-como-usuario-diseno.md §3):
 *  - `POST /users/{id}/impersonate` → 201 con el token de la sesión observada y el `user` con su bloque `impersonation`. NUNCA trae
 *    `refresh_token` (C8): aunque llegara, este módulo no lo lee.
 *  - `POST /auth/impersonation/stop` → 204.
 *  - Administración (solo superadmin): listado paginado y revocación de sesiones.
 */
export interface StartImpersonationPayload {
  reason:           string
  operatorPassword: string
}

export interface StartImpersonationResult {
  accessToken: string
  expiresInMs: number
  user:        UserInfo
}

export type ImpersonationSessionStatus = 'active' | 'ended' | 'expired'

export interface ImpersonationSession {
  id:           string
  actor:        { id: number; name: string }
  target:       { id: number; name: string }
  reason:       string
  started_at:   string
  expires_at:   string
  ended_at:     string | null
  /** manual | expired | revoked | target_blocked (el backend puede sumar causas: se muestran con un fallback). */
  ended_reason: string | null
  status:       ImpersonationSessionStatus
}

export interface ImpersonationSessionsMeta {
  total:        number
  per_page:     number
  current_page: number
  last_page:    number
}

export interface ImpersonationSessionsResponse {
  data: ImpersonationSession[]
  meta: ImpersonationSessionsMeta
}

export interface ImpersonationSessionsQuery {
  status?:   ImpersonationSessionStatus
  page?:     number
  per_page?: number
}

export const impersonationApi = {
  start: (userId: number, { reason, operatorPassword }: StartImpersonationPayload): Promise<StartImpersonationResult> =>
    api.post(`/users/${userId}/impersonate`, { reason, operator_password: operatorPassword }).then(r => {
      const data = r.data as { token: string; expires_in_ms: number; user: UserInfo }
      return { accessToken: data.token, expiresInMs: data.expires_in_ms, user: data.user }
    }),

  stop: (): Promise<void> =>
    api.post('/auth/impersonation/stop').then(() => undefined),

  listSessions: (query: ImpersonationSessionsQuery = {}): Promise<ImpersonationSessionsResponse> =>
    api.get('/admin/security/impersonations', { params: query }).then(r => r.data as ImpersonationSessionsResponse),

  revoke: (id: string): Promise<void> =>
    api.post(`/admin/security/impersonations/${id}/revoke`).then(() => undefined),
}
