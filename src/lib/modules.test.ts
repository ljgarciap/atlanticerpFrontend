import { describe, expect, it } from 'vitest'
import { isModuleEnabled } from './modules'

describe('isModuleEnabled (Fase 5a)', () => {
  it('solo es true con la bandera explícita del backend', () => {
    expect(isModuleEnabled({ legacy_icg: true }, 'legacy_icg')).toBe(true)
    expect(isModuleEnabled({ lafayette: true }, 'lafayette')).toBe(true)
  })

  it('apagado, ausente o sin flags (sesión anterior al cambio) se trata como apagado', () => {
    expect(isModuleEnabled({ legacy_icg: false }, 'legacy_icg')).toBe(false)
    expect(isModuleEnabled({}, 'lafayette')).toBe(false)
    expect(isModuleEnabled(undefined, 'legacy_icg')).toBe(false)
    expect(isModuleEnabled(null, 'lafayette')).toBe(false)
  })

  it('cada bandera es independiente', () => {
    expect(isModuleEnabled({ legacy_icg: true }, 'lafayette')).toBe(false)
  })
})
