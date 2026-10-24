import { describe, expect, it } from 'vitest'
import { impersonationBlock } from './impersonationEligibility'
import type { UserListItem } from '@/api/usersApi'

function makeUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 5, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

describe('impersonationBlock', () => {
  it('una persona activa común se puede observar', () => {
    expect(impersonationBlock(makeUser(), 1)).toBeNull()
  })
  it('uno mismo no', () => {
    expect(impersonationBlock(makeUser({ id: 1 }), 1)).toBe('self')
  })
  it('superadmin por rol, por nivel 10 o por superadmin.all no', () => {
    expect(impersonationBlock(makeUser({ roles: ['superadmin'] }), 1)).toBe('superadmin')
    expect(impersonationBlock(makeUser({ security_level: { id: 10, level: 10, name: 'Super' } }), 1)).toBe('superadmin')
    expect(impersonationBlock(makeUser({ extra_permissions: ['superadmin.all'] }), 1)).toBe('superadmin')
  })
  it('inactivo no', () => {
    expect(impersonationBlock(makeUser({ is_active: false }), 1)).toBe('inactive')
  })
  it('invitado no', () => {
    expect(impersonationBlock(makeUser({ roles: ['guest'] }), 1)).toBe('guest')
  })
  it('sin id de actor solo aplica el resto de reglas', () => {
    expect(impersonationBlock(makeUser({ id: 1 }), undefined)).toBeNull()
  })
})
