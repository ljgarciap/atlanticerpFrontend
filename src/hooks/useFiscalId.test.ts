import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { dvPattern, useFiscalId } from './useFiscalId'
import { DEFAULT_FISCAL_ID, fiscalIdText } from '@/lib/region'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

afterEach(() => useAuthStore.setState({ user: null }))

describe('useFiscalId (Fase 6c)', () => {
  it('sin sesión o con una sesión anterior a la 6c rige Panamá (RUC, DV de 2 dígitos)', () => {
    expect(renderHook(() => useFiscalId()).result.current).toEqual(DEFAULT_FISCAL_ID)

    useAuthStore.setState({ user: { id: 1, email: 'a@b.test', role: 'management', permissions: [] } as unknown as UserInfo })
    expect(renderHook(() => useFiscalId()).result.current).toEqual(DEFAULT_FISCAL_ID)
  })

  it('toma la identificación del país de la empresa que manda el backend', () => {
    const fiscal_id = { label: 'NIT', uses_dv: true, dv_max_length: 1 }
    useAuthStore.setState({ user: { id: 1, email: 'a@b.test', role: 'management', permissions: [], fiscal_id } as unknown as UserInfo })

    expect(renderHook(() => useFiscalId()).result.current).toEqual(fiscal_id)
  })

  it('el patrón del DV sigue el largo del país', () => {
    expect(dvPattern({ label: 'RUC', uses_dv: true, dv_max_length: 2 }).test('12')).toBe(true)
    expect(dvPattern({ label: 'RUC', uses_dv: true, dv_max_length: 2 }).test('123')).toBe(false)
    expect(dvPattern({ label: 'NIT', uses_dv: true, dv_max_length: 1 }).test('3')).toBe(true)
    expect(dvPattern({ label: 'NIT', uses_dv: true, dv_max_length: 1 }).test('33')).toBe(false)
  })

  it('en Panamá el texto de la pantalla no cambia; en otro país se usa el nombre de su identificación', () => {
    expect(fiscalIdText('RUC / Cédula', DEFAULT_FISCAL_ID)).toBe('RUC / Cédula')
    expect(fiscalIdText('RUC / Cédula', { label: 'NIT', uses_dv: true, dv_max_length: 1 })).toBe('NIT')
  })
})
