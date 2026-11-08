import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de la Fase 28 (Contabilidad: cartera, tesorería, comisiones y reportes), por la API real y con la cuenta de cada rol.
// Cada paso deja la configuración como la encontró (días de crédito del cliente, aprobadores por proceso). Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
const ROLES = ['vendedor', 'gerencia', 'gerencia2', 'gerencia3', 'contabilidad', 'superadmin'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ids: Record<string, number> = {}
const STAMP = String(Date.now())
type Res = { status: number; body: any }

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* cuerpo no JSON */ }
  return { status: r.status(), body }
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de la Fase 28 (contabilidad)', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
    for (const rol of ['gerencia2', 'gerencia3'] as const) {
      const u = (await api(request, 'superadmin', 'GET', `/users?search=${rol}`)).body.data as { id: number; email: string }[]
      ids[rol] = u.find(x => x.email === `${rol}@test.com`)!.id
    }
  })

  test('1. reportes: filtros inválidos dan 422 y el libro concilia con ventas por medio de pago', async ({ request }) => {
    const base = '/admin-contab/reports'
    expect((await api(request, 'contabilidad', 'GET', `${base}/libro-facturas?tipo=boleta`)).status).toBe(422)
    expect((await api(request, 'contabilidad', 'GET', `${base}/libro-facturas?desde=2026-05-10&hasta=2026-05-01`)).status).toBe(422)
    expect((await api(request, 'contabilidad', 'GET', `${base}/ventas-medio-pago?desde=2026-05-10&hasta=2026-05-01`)).status).toBe(422)

    const q = '?desde=2020-01-01&hasta=2030-12-31'
    const libro = (await api(request, 'contabilidad', 'GET', `${base}/libro-facturas${q}`)).body.resumen
    const medio = (await api(request, 'contabilidad', 'GET', `${base}/ventas-medio-pago${q}`)).body.resumen
    expect(Math.abs(libro.total - medio.total_libro), 'cobradas + pendientes + notas = total del libro').toBeLessThan(0.011)
    expect(medio.notas_credito.total).toBeLessThanOrEqual(0)
  })

  test('2. tesorería: filtros, pendiente sin cuenta, reasignar pide motivo y solo Contabilidad/aprobador asignan', async ({ request }) => {
    const mov = '/admin-contab/bank-movements'
    expect((await api(request, 'contabilidad', 'GET', `${mov}?tipo=otro`)).status).toBe(422)
    const lista = await api(request, 'contabilidad', 'GET', `${mov}?sin_cuenta=1&tipo=comision`)
    expect(lista.status).toBe(200)
    expect(lista.body.pendientes_sin_cuenta).toEqual(expect.objectContaining({ cantidad: expect.any(Number), monto: expect.any(Number) }))

    // Un movimiento inexistente: el gate de identidad responde antes que la búsqueda.
    expect((await api(request, 'vendedor', 'PUT', `${mov}/999999/reassign-account`, { bank_account_id: 1, motivo: 'motivo suficiente' })).status).toBe(403)
    expect((await api(request, 'contabilidad', 'PUT', `${mov}/999999/reassign-account`, { bank_account_id: 1 })).status, 'sin motivo').toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', `${mov}/999999/reassign-account`, { bank_account_id: 1, motivo: 'motivo suficiente' })).status).not.toBe(403)
    // Gerencia que no es el aprobador ni tiene el permiso: 403 con mensaje claro. El aprobador (gerencia3) sí pasa el gate.
    expect((await api(request, 'gerencia2', 'PUT', `${mov}/999999/assign-account`, { bank_account_id: 1 })).status).toBe(403)
    expect((await api(request, 'gerencia3', 'PUT', `${mov}/999999/assign-account`, { bank_account_id: 1 })).status).not.toBe(403)
  })

  test('3. cartera: días de crédito por cliente (fijar, quitar, 422 y 403)', async ({ request }) => {
    const mc = (await api(request, 'vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente crédito ${STAMP}` })).body.id as number
    const url = `/admin-contab/clientes/${mc}/dias-credito`

    const global = (await api(request, 'gerencia3', 'GET', '/admin-contab/fiscal-settings')).body.dias_credito_factura as number
    const fijado = await api(request, 'contabilidad', 'PUT', url, { dias_credito: 75 })
    expect(fijado.status).toBe(200)
    expect(fijado.body).toEqual(expect.objectContaining({ dias_credito: 75, dias_credito_efectivo: 75 }))
    expect((await api(request, 'contabilidad', 'PUT', url, { dias_credito: 0 })).status).toBe(422)
    expect((await api(request, 'vendedor', 'PUT', url, { dias_credito: 10 })).status).toBe(403)

    const quitado = await api(request, 'contabilidad', 'PUT', url, { dias_credito: null })
    expect(quitado.body).toEqual(expect.objectContaining({ dias_credito: null, dias_credito_efectivo: global }))
  })

  test('4. tramos: un solape da 422 en cartera y en comisión interna', async ({ request }) => {
    const cartera = await api(request, 'gerencia3', 'POST', '/admin-contab/commissions/cartera/tiers', { monto_minimo: 100, monto_maximo: 200, porcentaje: 1, orden: 90 })
    expect(cartera.status, 'solapa con un tramo existente').toBe(422)
    const interna = await api(request, 'gerencia3', 'POST', '/admin-contab/commissions/internal/tiers', { monto_minimo: 100, monto_maximo: 200, porcentaje: 1, orden: 90 })
    expect(interna.status).toBe(422)
  })

  test('5. aprobadores por proceso: con aprobadores propios el titular global ya no decide ese proceso; vaciar lo devuelve', async ({ request }) => {
    const decidir = (rol: Rol) => api(request, rol, 'PUT', '/admin-contab/petty-cash/expenses/999999/reject')
    try {
      expect((await decidir('gerencia3')).status, 'sin configurar rige el aprobador primario').not.toBe(403)
      expect((await decidir('gerencia2')).status).toBe(403)

      const conf = await api(request, 'superadmin', 'PUT', '/admin/process-approvers/caja_chica', { user_ids: [ids.gerencia2] })
      expect(conf.status).toBe(200)
      expect(conf.body.processes.caja_chica.sigue_al_primario).toBe(false)
      expect((await decidir('gerencia2')).status).not.toBe(403)
      expect((await decidir('gerencia3')).status, 'el titular global no decide un proceso con aprobadores propios').toBe(403)
    } finally {
      const restaurado = await api(request, 'superadmin', 'PUT', '/admin/process-approvers/caja_chica', { user_ids: [] })
      expect(restaurado.status).toBe(200)
    }
    expect((await decidir('gerencia3')).status).not.toBe(403)
    expect((await api(request, 'gerencia3', 'PUT', '/admin/process-approvers/caja_chica', { user_ids: [] })).status, 'solo superadmin administra').toBe(403)
    expect((await api(request, 'superadmin', 'PUT', '/admin/process-approvers/inventado', { user_ids: [] })).status).toBe(404)
  })

  test('6. comisiones externas: la base configurable solo la cambia Gerencia (aprobador) y se restaura', async ({ request }) => {
    const actual = (await api(request, 'gerencia3', 'GET', '/admin-contab/fiscal-settings')).body.comision_externa_base as string
    expect(['total', 'base_imponible']).toContain(actual)
    expect((await api(request, 'gerencia3', 'PUT', '/admin-contab/fiscal-settings', { comision_externa_base: 'inventada' })).status).toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', '/admin-contab/fiscal-settings', { comision_externa_base: 'base_imponible' })).status).toBe(403)
    // Se cambia y se restaura: lo ya pagado no se toca y el valor por defecto sigue siendo el de siempre.
    const cambiado = await api(request, 'gerencia3', 'PUT', '/admin-contab/fiscal-settings', { comision_externa_base: 'base_imponible' })
    try { expect(cambiado.status).toBe(200) } finally {
      await api(request, 'gerencia3', 'PUT', '/admin-contab/fiscal-settings', { comision_externa_base: actual })
    }
    expect((await api(request, 'gerencia3', 'GET', '/admin-contab/fiscal-settings')).body.comision_externa_base).toBe(actual)
  })
})
