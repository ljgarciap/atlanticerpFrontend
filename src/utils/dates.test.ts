import { describe, it, expect } from 'vitest'
import { parseDateOnly, formatDateShort, formatTimeShort, formatDateTimeShort } from './dates'

// SCRUM-787 — verificación directa del bug real (ver docblock de dates.ts): antes de este helper,
// `new Date("2026-08-24")` renderizaba "23 ago 2026" en cualquier timezone con offset negativo
// (América/Panamá, UTC-5). Este test corre bajo el timezone real del proceso de test (no fuerza
// UTC), así que si `parseDateOnly` alguna vez vuelve a delegar un string date-only a `new Date()`
// directo, este test lo detecta en cualquier máquina con offset negativo — no solo en producción.
describe('parseDateOnly / formatDateShort (SCRUM-787)', () => {
  it('un string date-only puro se parsea como el día correcto, sin off-by-one', () => {
    const d = parseDateOnly('2026-08-24')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // agosto, 0-indexed
    expect(d.getDate()).toBe(24)
  })

  it('formatDateShort no corre un día hacia atrás para un string date-only', () => {
    expect(formatDateShort('2026-08-24')).toContain('24')
    expect(formatDateShort('2026-08-24')).not.toContain('23')
  })

  it('un string con hora/timezone completo (Carbon::toIso8601String) se deja pasar sin tocar', () => {
    const d = parseDateOnly('2026-08-24T03:15:00-05:00')
    // No debe reinterpretarse como date-only — new Date() ya lo resuelve bien.
    expect(d.toISOString()).toBe(new Date('2026-08-24T03:15:00-05:00').toISOString())
  })
})

// SCRUM-883 — la hora mostrada debe ser siempre la de Panamá (GMT-5), sin importar el timezone
// del proceso que corre el test/navegador. Un mismo instante UTC debe verse igual acá que en
// cualquier otra máquina, a diferencia del bug que este ticket corrige (antes dependía del reloj
// del sistema operativo del viewer).
describe('formatTimeShort / formatDateTimeShort (SCRUM-883, timezone Panamá explícito)', () => {
  it('muestra la hora de Panamá para un instante UTC, sin importar el timezone del proceso', () => {
    // 2026-09-12T19:30:00Z = 2:30 p.m. en America/Panama (GMT-5, sin horario de verano)
    expect(formatTimeShort('2026-09-12T19:30:00Z')).toContain('2:30')
  })

  it('formatDateTimeShort combina fecha y hora, ambas en America/Panama', () => {
    const result = formatDateTimeShort('2026-09-12T19:30:00Z')
    expect(result).toContain('12')
    expect(result).toContain('sept')
    expect(result).toContain('2:30')
  })
})
