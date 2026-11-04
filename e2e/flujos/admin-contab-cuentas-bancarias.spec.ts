import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Complemento del flujo de Tesorería (catálogo: atlanticerp-backend/docs/flujos/admin-contab-tesoreria.md): el CRUD de cuentas bancarias (permisos,
// validaciones, desactivar y reactivar) y el listado de movimientos. La comisión sin cuenta y la asignación están en admin-contab-tesoreria.spec.ts.
// Crea cuentas «[FLUJO]» (no se pueden borrar: quedan desactivadas). UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['vendedor', 'gerencia', 'lidercompras', 'contabilidad', 'asistenteadministrativa'] as const
const BANCOS = '/admin-contab/bank-accounts'
const MOVS = '/admin-contab/bank-movements'
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

type Mov = { id: number; tipo: string; direccion: string; concepto: string; monto: number; bank_account_id: number | null; bank_account_label: string | null }

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Tesorería: cuentas bancarias y listado de movimientos', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
  })

  test.afterAll(async () => {
    // las cuentas no se borran: las de la prueba quedan desactivadas para no ofrecerse en los selectores
    for (const id of ctx.cuentas ?? []) await api('contabilidad', 'PUT', `${BANCOS}/${id}/deactivate`)
    await req.dispose()
  })

  test('1. cuentas bancarias: quién las ve, quién las edita, validaciones y desactivar/reactivar', async () => {
    for (const rol of ['contabilidad', 'asistenteadministrativa', 'gerencia']) expect((await api(rol, 'GET', BANCOS)).status, `${rol} ve las cuentas`).toBe(200)
    expect((await api('vendedor', 'GET', BANCOS)).status, 'el vendedor no ve las cuentas').toBe(403)
    expect((await api('vendedor', 'POST', BANCOS, { banco: '[FLUJO] X', ultimos_4_digitos: '1234' })).status).toBe(403)
    expect((await api('lidercompras', 'POST', BANCOS, { banco: '[FLUJO] X', ultimos_4_digitos: '1234' })).status).toBe(403)

    expect((await api('contabilidad', 'POST', BANCOS, { ultimos_4_digitos: '1234' })).status, 'el banco es obligatorio').toBe(422)
    for (const malo of ['12', '12345', 'abcd']) expect((await api('contabilidad', 'POST', BANCOS, { banco: '[FLUJO] X', ultimos_4_digitos: malo })).status, `últimos 4 «${malo}»`).toBe(422)
    expect((await api('contabilidad', 'POST', BANCOS, { banco: '[FLUJO] X', ultimos_4_digitos: '1234', tipo_cuenta: 'inventada' })).status).toBe(422)

    const nueva = await api('contabilidad', 'POST', BANCOS, { banco: `[FLUJO] Banco ${STAMP}`, ultimos_4_digitos: '4321', activa: false })
    expect(nueva.status).toBe(201)
    ctx.cuentas = [nueva.body.id]
    expect(nueva.body, 'nace siempre activa, con tipo corriente y moneda USD por defecto, sin importar lo que mande el cliente').toMatchObject({ activa: true, tipo_cuenta: 'corriente', moneda: 'USD' })

    const editada = await api('asistenteadministrativa', 'PUT', `${BANCOS}/${nueva.body.id}`, { banco: `[FLUJO] Banco ${STAMP} editado`, ultimos_4_digitos: '4321', tipo_cuenta: 'ahorro' })
    expect(editada.status, 'la Asistente también edita cuentas').toBe(200)
    expect(editada.body).toMatchObject({ tipo_cuenta: 'ahorro' })
    expect((await api('gerencia', 'PUT', `${BANCOS}/${nueva.body.id}`, { banco: `[FLUJO] Banco ${STAMP} editado`, ultimos_4_digitos: '4321', tipo_cuenta: 'ahorro' })).status, 'Gerencia también edita cuentas (a diferencia de asignar cuenta a un movimiento)').toBe(200)

    expect((await api('contabilidad', 'PUT', `${BANCOS}/${nueva.body.id}/deactivate`)).body.activa).toBe(false)
    const soloActivas = (await api('contabilidad', 'GET', `${BANCOS}?activa=true`)).body as { id: number }[]
    expect(soloActivas.map(c => c.id), 'una cuenta inactiva no se ofrece en los selectores').not.toContain(nueva.body.id)
    expect((await api('contabilidad', 'PUT', `${BANCOS}/${nueva.body.id}/reactivate`)).body.activa).toBe(true)
    expect(((await api('contabilidad', 'GET', `${BANCOS}?activa=true`)).body as { id: number }[]).map(c => c.id)).toContain(nueva.body.id)

    for (const accion of ['deactivate', 'reactivate']) expect((await api('contabilidad', 'PUT', `${BANCOS}/99999999/${accion}`)).status).toBe(404)
    expect((await api('contabilidad', 'PUT', `${BANCOS}/99999999`, { banco: 'X', ultimos_4_digitos: '1234' })).status).toBe(404)
    expect((await api('contabilidad', 'PUT', `${BANCOS}/abc/deactivate`)).status, 'un id no numérico es 404, no 500').toBe(404)
  })

  test('2. movimientos: entradas y salidas, filtro por cuenta y quién los ve', async () => {
    expect((await api('vendedor', 'GET', MOVS)).status).toBe(403)
    expect((await api('lidercompras', 'GET', MOVS)).status).toBe(403)
    for (const rol of ['contabilidad', 'asistenteadministrativa', 'gerencia']) expect((await api(rol, 'GET', MOVS)).status, `${rol} ve los movimientos`).toBe(200)

    const pagina = (await api('contabilidad', 'GET', `${MOVS}?per_page=50`)).body
    const movs = pagina.data as Mov[]
    expect(movs.length).toBeGreaterThan(0)
    expect(pagina.meta).toMatchObject({ current_page: 1 })
    const fechas = movs.map(m => m.concepto && (m as any).fecha)
    expect([...fechas].sort().reverse(), 'del más reciente al más antiguo').toEqual(fechas)
    for (const m of movs) {
      expect(m.direccion, `un ${m.tipo} es ${m.tipo === 'cobro' ? 'entrada' : 'salida'}`).toBe(m.tipo === 'cobro' ? 'entrada' : 'salida')
    }

    const conCuenta = movs.find(m => m.bank_account_id)!
    const filtrado = (await api('contabilidad', 'GET', `${MOVS}?bank_account_id=${conCuenta.bank_account_id}&per_page=100`)).body.data as Mov[]
    expect(filtrado.length).toBeGreaterThan(0)
    expect(filtrado.every(m => m.bank_account_id === conCuenta.bank_account_id), 'el filtro devuelve solo esa cuenta').toBe(true)
    expect(filtrado.find(m => m.id === conCuenta.id)?.bank_account_label, 'la etiqueta de la cuenta viaja con el movimiento').toBeTruthy()
  })
})
