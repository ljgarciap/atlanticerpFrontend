import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { crearPedido, data, entregarYCobrar, iniciarSesion, llamar, subirArchivo, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Tesorería (catálogo: atlanticerp-backend/docs/flujos/admin-contab-tesoreria.md): cuentas bancarias (alta, edición, desactivar y
// reactivar), el listado de movimientos (entradas y salidas, filtro por cuenta) y la asignación de cuenta a una comisión pagada SIN cuenta de pago.
// Por la API real y con la cuenta de cada rol; crea sus propias cuentas «[FLUJO]» (no se pueden borrar: quedan desactivadas) y un proyecto con
// asociado propio. UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'asistenteadministrativa', 'superadmin'] as const
const BANCOS = '/admin-contab/bank-accounts'
const MOVS = '/admin-contab/bank-movements'
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

type Mov = { id: number; tipo: string; direccion: string; concepto: string; monto: number; bank_account_id: number | null; bank_account_label: string | null }

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Tesorería: cuentas bancarias y movimientos', () => {
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

  test('3. una comisión pagada sin cuenta de pago deja una salida «sin cuenta asignada»', async () => {
    const arq = await api('vendedor', 'POST', '/ventas-diseno/architects', { type: 'architect', name: `[FLUJO] Asociado Tesorería ${STAMP}`, email: `tesoreria.${STAMP}@example.test` })
    expect(arq.status).toBe(201)
    ctx.arq = arq.body.id
    const pedido = await crearPedido(req, tokens, `Tesorería ${STAMP}`, undefined, 0, ctx.arq)
    const venta = await entregarYCobrar(req, tokens, pedido)
    ctx.card = venta.card

    const raiz = `/admin-contab/commissions/external/projects/${ctx.card}`
    expect((await api('contabilidad', 'PUT', `/admin-contab/commissions/external/architects/${ctx.arq}/fiscal-profile`, { empresa: `[FLUJO] Estudio ${STAMP}`, ruc: '8-123-456', regimen_fiscal: 'exento' })).status).toBe(200)
    expect((await subirArchivo(req, tokens, 'contabilidad', `${raiz}/cuenta-cobro`, {})).status).toBe(201)

    const pagar = await api('contabilidad', 'POST', `${raiz}/mark-paid`)
    expect(pagar.status, JSON.stringify(pagar.body).slice(0, 200)).toBe(200)

    ctx.sinCuenta = await buscarMovimiento(m => m.tipo === 'comision' && m.concepto.includes(`[FLUJO] Asociado Tesorería ${STAMP}`))
    expect(ctx.sinCuenta, 'pagar registra la salida de caja aunque no haya cuenta de pago').toBeTruthy()
    expect(ctx.sinCuenta).toMatchObject({ direccion: 'salida', bank_account_id: null, bank_account_label: null })
  })

  test('4. asignar cuenta: solo Contabilidad y la Asistente, solo a una comisión sin cuenta, con una cuenta activa', async () => {
    const mov: Mov = ctx.sinCuenta
    const activa = ctx.cuentas[0]
    const ruta = (id: number | string) => `${MOVS}/${id}/assign-account`

    for (const rol of ['vendedor', 'gerencia', 'gerencia3', 'lidercompras']) expect((await api(rol, 'PUT', ruta(mov.id), { bank_account_id: activa })).status, `${rol} no asigna cuentas`).toBe(403)
    expect((await api('contabilidad', 'PUT', ruta(99999999), { bank_account_id: activa })).status).toBe(404)
    expect((await api('contabilidad', 'PUT', ruta('abc'), { bank_account_id: activa })).status, 'id no numérico: 404').toBe(404)
    expect((await api('contabilidad', 'PUT', ruta(mov.id), {})).status, 'la cuenta es obligatoria').toBe(422)
    expect((await api('contabilidad', 'PUT', ruta(mov.id), { bank_account_id: 99999999 })).status, 'una cuenta que no existe').toBe(422)

    // una cuenta desactivada no se puede asignar
    const inactiva = await api('contabilidad', 'POST', BANCOS, { banco: `[FLUJO] Banco inactivo ${STAMP}`, ultimos_4_digitos: '9999' })
    ctx.cuentas.push(inactiva.body.id)
    await api('contabilidad', 'PUT', `${BANCOS}/${inactiva.body.id}/deactivate`)
    expect((await api('contabilidad', 'PUT', ruta(mov.id), { bank_account_id: inactiva.body.id })).status, 'una cuenta inactiva no se ofrece ni se acepta').toBe(422)

    // solo las comisiones sin cuenta: un cobro (con cuenta) no admite el cambio
    const cobro = await buscarMovimiento(m => m.tipo === 'cobro')
    expect(cobro).toBeTruthy()
    const sobreCobro = await api('contabilidad', 'PUT', ruta(cobro!.id), { bank_account_id: activa })
    expect(sobreCobro.status, 'un cobro no se reasigna').toBe(422)
    expect(sobreCobro.body.message).toMatch(/comisión sin cuenta asignada/)

    const ok = await api('asistenteadministrativa', 'PUT', ruta(mov.id), { bank_account_id: activa })
    expect(ok.status, 'la Asistente asigna').toBe(200)
    expect(ok.body.bank_account_id).toBe(activa)
    const despues = await buscarMovimiento(m => m.id === mov.id)
    expect(despues).toMatchObject({ bank_account_id: activa })
    expect(despues!.bank_account_label).toBeTruthy()

    expect((await api('contabilidad', 'PUT', ruta(mov.id), { bank_account_id: activa })).status, 'ya tiene cuenta: no se reasigna').toBe(422)
    const delFiltro = (await api('contabilidad', 'GET', `${MOVS}?bank_account_id=${activa}&per_page=100`)).body.data as Mov[]
    expect(delFiltro.map(m => m.id), 'aparece en los movimientos de esa cuenta').toContain(mov.id)
  })
})

// El listado crece con cada corrida y solo ordena por fecha: se recorren las páginas hasta dar con el movimiento buscado.
async function buscarMovimiento(coincide: (m: Mov) => boolean): Promise<Mov | undefined> {
  for (let pagina = 1; pagina <= 40; pagina++) {
    const r = (await api('contabilidad', 'GET', `${MOVS}?per_page=100&page=${pagina}`)).body
    const hallado = (data(r) as Mov[]).find(coincide)
    if (hallado) return hallado
    if (pagina >= (r.meta?.last_page ?? 1)) break
  }
  return undefined
}
