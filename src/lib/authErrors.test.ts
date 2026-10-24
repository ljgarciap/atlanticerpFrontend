import { describe, expect, it } from 'vitest'
import { parseAuthError, isTooManyAttempts } from './authErrors'

describe('parseAuthError', () => {
  it('reconoce password_reset_expired y devuelve el mensaje del backend', () => {
    const r = parseAuthError({ response: { status: 401, data: { code: 'password_reset_expired', message: 'Venció' } } })
    expect(r).toMatchObject({ status: 401, code: 'password_reset_expired', rawCode: 'password_reset_expired', message: 'Venció' })
    expect(isTooManyAttempts(r)).toBe(false)
  })

  it('lee retry_after del cuerpo en segundos', () => {
    const r = parseAuthError({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 120 } } })
    expect(r.code).toBe('too_many_attempts')
    expect(r.retryAfter).toBe(120)
    expect(isTooManyAttempts(r)).toBe(true)
  })

  it('acepta retry_after como texto y redondea hacia arriba', () => {
    expect(parseAuthError({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: '30.2' } } }).retryAfter).toBe(31)
  })

  it('usa la cabecera Retry-After si el cuerpo no la trae', () => {
    const r = parseAuthError({ response: { status: 429, data: {}, headers: { 'retry-after': '45' } } })
    expect(r.retryAfter).toBe(45)
    expect(isTooManyAttempts(r)).toBe(true) // 429 aunque no traiga `code`
  })

  it('un 429 sin ninguna espera indicada asume 60 s (nunca 0: no permite reintentos inmediatos)', () => {
    expect(parseAuthError({ response: { status: 429 } }).retryAfter).toBe(60)
    expect(parseAuthError({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 0 } } }).retryAfter).toBe(60)
    expect(parseAuthError({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: -5 } } }).retryAfter).toBe(60)
  })

  it('un 401 normal no inventa code ni retryAfter', () => {
    const r = parseAuthError({ response: { status: 401, data: { message: 'Credenciales inválidas' } } })
    expect(r.code).toBeUndefined()
    expect(r.retryAfter).toBeUndefined()
    expect(r.message).toBe('Credenciales inválidas')
  })

  it('conserva el code crudo de los errores del reset (operator_*, password_reset_disabled) sin tratarlos como auth', () => {
    const r = parseAuthError({ response: { status: 422, data: { code: 'operator_reauth_failed' } } })
    expect(r.rawCode).toBe('operator_reauth_failed')
    expect(r.code).toBeUndefined()
  })

  it('tolera errores sin respuesta (red caída) y valores raros', () => {
    expect(parseAuthError(new Error('Network Error'))).toMatchObject({ status: undefined, code: undefined })
    expect(parseAuthError(null)).toEqual({ status: undefined, code: undefined, rawCode: undefined, message: undefined, retryAfter: undefined })
    expect(parseAuthError({ response: { status: 500, data: { message: 42, code: 7 } } })).toMatchObject({ message: undefined, rawCode: undefined })
  })
})
