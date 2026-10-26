import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_REGION, getRegion, setRegion } from './region'
import { formatDateTimeShort, formatTimeShort } from '@/utils/dates'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

afterEach(() => setRegion(null))

describe('lib/region (Fase 6a)', () => {
  it('sin sesión rige el contexto de Panamá', () => {
    expect(getRegion()).toEqual(DEFAULT_REGION)
    expect(getRegion()).toMatchObject({ country: 'PA', currency: 'USD', timezone: 'America/Panama', locale: 'es-PA' })
  })

  it('setRegion completa lo que falte con el contexto por omisión y null lo restablece', () => {
    setRegion({ country: 'CO', currency: 'COP' })
    expect(getRegion()).toEqual({ ...DEFAULT_REGION, country: 'CO', currency: 'COP' })
    setRegion(null)
    expect(getRegion()).toEqual(DEFAULT_REGION)
  })

  it('la hora se muestra en la zona de la empresa, no en la de Panamá', () => {
    const iso = '2026-10-26T15:00:00Z' // 10:00 en Panamá, 10:00 en Bogotá (UTC-5), 11:00 en Nueva York (UTC-4 en octubre)
    setRegion({ timezone: 'America/New_York' })
    expect(formatTimeShort(iso)).toMatch(/11:00/)
    setRegion({ timezone: 'America/Panama' })
    expect(formatTimeShort(iso)).toMatch(/10:00/)
    setRegion({ timezone: 'America/New_York' })
    expect(formatDateTimeShort(iso)).toMatch(/11:00/)
  })

  it('el store publica la región del usuario y la quita al cerrar sesión', () => {
    const user = { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.test', role: 'management', permissions: [], region: { country: 'CO', currency: 'COP', timezone: 'America/Bogota', locale: 'es-CO' } } as UserInfo
    useAuthStore.getState().setAuth(user, 'tok', 'ref')
    expect(getRegion()).toMatchObject({ country: 'CO', currency: 'COP', timezone: 'America/Bogota', locale: 'es-CO' })

    useAuthStore.getState().clearAuth()
    expect(getRegion()).toEqual(DEFAULT_REGION)
  })
})
