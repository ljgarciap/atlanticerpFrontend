import { describe, expect, it } from 'vitest'
import { hasGerenciaScope } from './gerenciaScope'

describe('hasGerenciaScope (SCRUM-1150)', () => {
  it('Gerencia y superadmin lo tienen por rol', () => {
    expect(hasGerenciaScope({ role: 'management', permissions: [] })).toBe(true)
    expect(hasGerenciaScope({ role: 'superadmin', permissions: [] })).toBe(true)
  })

  it('una persona con el permiso lo tiene aunque su rol sea otro', () => {
    expect(hasGerenciaScope({ role: 'lider_admin_contab', permissions: ['ventas_diseno.gerencia_scope'] })).toBe(true)
  })

  it('sin rol de Gerencia ni permiso no lo tiene (y sin usuario tampoco)', () => {
    expect(hasGerenciaScope({ role: 'lider_admin_contab', permissions: ['ventas_diseno.read'] })).toBe(false)
    expect(hasGerenciaScope(null)).toBe(false)
    expect(hasGerenciaScope(undefined)).toBe(false)
  })
})
