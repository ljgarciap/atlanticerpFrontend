import { describe, expect, it } from 'vitest'
import { firstNameOnly } from './greeting'

describe('firstNameOnly', () => {
  it('devuelve el nombre tal cual cuando es una sola palabra', () => {
    expect(firstNameOnly('Contabilidad')).toBe('Contabilidad')
  })

  it('SCRUM-863 — recorta a la primera palabra cuando first_name trae un nombre compuesto', () => {
    expect(firstNameOnly('Ana Maria')).toBe('Ana')
    expect(firstNameOnly('Jose Luis Perez')).toBe('Jose')
    expect(firstNameOnly('Luis J')).toBe('Luis')
  })

  it('recorta espacios extra y espacios múltiples entre palabras', () => {
    expect(firstNameOnly('  María   López  ')).toBe('María')
  })

  it('devuelve string vacío para null/undefined/vacío', () => {
    expect(firstNameOnly(null)).toBe('')
    expect(firstNameOnly(undefined)).toBe('')
    expect(firstNameOnly('')).toBe('')
    expect(firstNameOnly('   ')).toBe('')
  })
})
