import { describe, expect, it } from 'vitest'
import { parseApiValidationError, summaryMessage } from './apiValidationError'

function axiosError(data: unknown, status = 422) {
  return { isAxiosError: true, response: { status, data } }
}

describe('parseApiValidationError', () => {
  it('extrae el mensaje general y TODOS los errores por campo', () => {
    const parsed = parseApiValidationError(axiosError({
      message: 'The given data was invalid.',
      errors: { entrega_proxima_dias: ['Debe ser al menos 1.', 'otro'], 'tiers.0.porcentaje': 'Máximo 100.' },
    }))

    expect(parsed).toEqual({
      message: 'The given data was invalid.',
      fields: { entrega_proxima_dias: ['Debe ser al menos 1.', 'otro'], 'tiers.0.porcentaje': ['Máximo 100.'] },
    })
  })

  it('devuelve null si no es un error de axios o no trae cuerpo útil', () => {
    expect(parseApiValidationError(new Error('boom'))).toBeNull()
    expect(parseApiValidationError(axiosError({}))).toBeNull()
    expect(parseApiValidationError(axiosError(undefined, 500))).toBeNull()
  })
})

describe('summaryMessage', () => {
  it('prioriza el mensaje general, luego el primer campo, luego el fallback', () => {
    expect(summaryMessage({ message: 'General', fields: { a: ['Campo'] } }, 'fb')).toBe('General')
    expect(summaryMessage({ message: null, fields: { a: ['Campo', 'Otro'] } }, 'fb')).toBe('Campo Otro')
    expect(summaryMessage(null, 'fb')).toBe('fb')
  })
})
