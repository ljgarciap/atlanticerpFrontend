/**
 * Errores de autenticación con `code` propio del backend (cierre de H2/H4 del reset de contraseñas):
 *  - 401 `password_reset_expired`: la contraseña temporal de un reset administrativo venció.
 *  - 429 `too_many_attempts`: límite de intentos en login, MFA, reenvío de código y "olvidé mi contraseña".
 * `retry_after` (segundos) puede venir en el cuerpo o en la cabecera `Retry-After`.
 */
export type AuthErrorCode = 'password_reset_expired' | 'too_many_attempts'

export interface ParsedAuthError {
  status?:     number
  code?:       AuthErrorCode
  /** `code` tal como lo manda el backend (también los de reset: `operator_reauth_failed`, `password_reset_disabled`...). */
  rawCode?:    string
  message?:    string
  /** Segundos de espera hasta el próximo intento (solo 429). */
  retryAfter?: number
}

type RawError = {
  response?: {
    status?:  number
    data?:    { message?: string; code?: string; retry_after?: number | string }
    headers?: Record<string, string | number | undefined>
  }
}

const toSeconds = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined
}

export function parseAuthError(err: unknown): ParsedAuthError {
  const response = (err as RawError)?.response
  const data     = response?.data
  const code     = data?.code === 'password_reset_expired' || data?.code === 'too_many_attempts' ? data.code : undefined

  const header = response?.headers?.['retry-after'] ?? response?.headers?.['Retry-After']
  const retryAfter = toSeconds(data?.retry_after) ?? toSeconds(header)

  return {
    status:  response?.status,
    code,
    rawCode: typeof data?.code === 'string' ? data.code : undefined,
    message: typeof data?.message === 'string' && data.message !== '' ? data.message : undefined,
    // 429 sin `retry_after` explícito: se asume un minuto para no dejar el botón bloqueado para siempre
    // ni permitir reintentos inmediatos.
    retryAfter: code === 'too_many_attempts' || response?.status === 429 ? (retryAfter ?? 60) : retryAfter,
  }
}

/** 429 por límite de intentos (con o sin `code`). */
export const isTooManyAttempts = (e: ParsedAuthError): boolean => e.code === 'too_many_attempts' || e.status === 429
