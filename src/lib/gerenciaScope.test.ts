import { describe, expect, it } from 'vitest'
import { hasGerenciaScope } from './gerenciaScope'

describe('hasGerenciaScope (SCRUM-1150, Fase 1b: por permiso, no por rol)', () => {
  it('Gerencia (platform.management) y superadmin (superadmin.all) lo tienen', () => {
    expect(hasGerenciaScope({ permissions: ['platform.management'] })).toBe(true)
    expect(hasGerenciaScope({ permissions: ['superadmin.all'] })).toBe(true)
  })

  it('una persona con el permiso por persona lo tiene aunque su rol sea otro', () => {
    expect(hasGerenciaScope({ permissions: ['ventas_diseno.gerencia_scope'] })).toBe(true)
  })

  it('sin permiso de Gerencia ni por persona no lo tiene (y sin usuario tampoco)', () => {
    expect(hasGerenciaScope({ permissions: ['ventas_diseno.read'] })).toBe(false)
    expect(hasGerenciaScope(null)).toBe(false)
    expect(hasGerenciaScope(undefined)).toBe(false)
  })
})
