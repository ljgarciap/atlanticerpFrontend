import { describe, expect, it } from 'vitest'
import { returnPathFor, safeReturnPath } from './returnPath'

describe('safeReturnPath (SCRUM-1159)', () => {
  it('acepta una ruta interna con query y hash', () => {
    expect(safeReturnPath('/bodega/pedidos/status?search=PED-2026-0009')).toBe('/bodega/pedidos/status?search=PED-2026-0009')
    expect(safeReturnPath('/inventario?search=ML-10097BWH-1#x')).toBe('/inventario?search=ML-10097BWH-1#x')
  })

  it.each([
    ['https://evil.example/x'],
    ['//evil.example/x'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['bodega/pedidos'],
    [''],
    [null],
    [undefined],
    [42],
    ['/ruta\nconsalto'],
    ['/ruta\u0000nula'],
  ])('rechaza %j', (valor) => {
    expect(safeReturnPath(valor)).toBeNull()
  })

  it.each([['/login'], ['/login?x=1'], ['/register'], ['/forgot-password'], ['/reset-password/abc']])('no vuelve a una pantalla de acceso (%s)', (ruta) => {
    expect(safeReturnPath(ruta)).toBeNull()
  })

  it('no confunde una ruta que solo empieza parecido (/login-info no es /login)', () => {
    expect(safeReturnPath('/loginfo')).toBe('/loginfo')
  })

  it('rechaza una ruta de más de 2000 caracteres', () => {
    expect(safeReturnPath(`/${'a'.repeat(2000)}`)).toBeNull()
  })
})

// SCRUM-1159 (Pre-QA N-1/N-2) — el destino solo lo hereda quien lo pidió, o cualquiera si nadie tenía sesión (enlace de un correo).
describe('returnPathFor (SCRUM-1159)', () => {
  const from = '/bodega/pedidos/status?search=PED-2026-0009'

  it('sin fromUserId (nadie tenía sesión: enlace de un correo) cualquiera usa el destino', () => {
    expect(returnPathFor({ from }, 7)).toBe(from)
    expect(returnPathFor({ from, fromUserId: null }, 7)).toBe(from)
  })

  it('con fromUserId lo usa solo esa misma persona', () => {
    expect(returnPathFor({ from, fromUserId: 7 }, 7)).toBe(from)
  })

  it('si entra OTRA persona no hereda el destino ni la búsqueda de la anterior', () => {
    expect(returnPathFor({ from, fromUserId: 7 }, 8)).toBeNull()
  })

  it.each([['7'], [true], [{}], [NaN]])('un fromUserId de tipo raro (%j) no concede el destino', (raro) => {
    expect(returnPathFor({ from, fromUserId: raro }, 7)).toBeNull()
  })

  it.each([[null], [undefined], ['texto'], [42], [{}], [{ from: 'https://evil.example' }], [{ from: '//evil.example' }], [{ from: '/login' }]])('estado inservible (%j) → null', (estado) => {
    expect(returnPathFor(estado, 7)).toBeNull()
  })
})
