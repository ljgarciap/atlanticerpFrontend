import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de la comisión de Contabilidad por gestión de cartera +90 días (catálogo:
// atlanticerp-backend/docs/flujos/admin-contab-comision-cartera.md): quién ve el reporte y los tramos, quién los edita (solo el aprobador
// configurado), validaciones del CRUD y coherencia del reporte. Por la API real y con la cuenta de cada rol; cualquier tramo que cree lo borra
// al terminar. El cálculo del atraso (>90 días) no se puede ejercitar por la API —las facturas nacen con la fecha de hoy— y se verificó aparte
// (ver el catálogo). Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api/admin-contab`
const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'contabilidad', 'asistenteadministrativa'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
type Res = { status: number; body: any }

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* cuerpo no JSON (204) */ }
  return { status: r.status(), body }
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de la comisión de cartera', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${BASE}/api/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
  })

  test('1. lectura: el reporte de comisión es de Contabilidad y Gerencia; la cartera y los tramos, también de la Asistente', async ({ request }) => {
    for (const rol of ['contabilidad', 'gerencia', 'gerencia3'] as const) {
      expect((await api(request, rol, 'GET', '/reports/commission-tiers')).status, `${rol} ve la comisión`).toBe(200)
    }
    expect((await api(request, 'asistenteadministrativa', 'GET', '/reports/commission-tiers')).status, 'la Asistente no ve la comisión (SCRUM-881)').toBe(403)
    expect((await api(request, 'vendedor', 'GET', '/reports/commission-tiers')).status).toBe(403)

    expect((await api(request, 'asistenteadministrativa', 'GET', '/reports/cartera')).status, 'la Asistente sí ve la cartera').toBe(200)
    expect((await api(request, 'asistenteadministrativa', 'GET', '/commissions/cartera/tiers')).status, 'y los tramos').toBe(200)
    expect((await api(request, 'vendedor', 'GET', '/reports/cartera')).status).toBe(403)
    expect((await api(request, 'vendedor', 'GET', '/commissions/cartera/tiers')).status).toBe(403)
  })

  test('2. el reporte: un solo tramo vigente y comisión = cobrado del mes × porcentaje', async ({ request }) => {
    const rep = (await api(request, 'contabilidad', 'GET', '/reports/commission-tiers')).body
    const tiers = rep.tiers as { monto_minimo: number; monto_maximo: number | null; porcentaje: number; es_actual: boolean }[]
    expect(tiers.length).toBeGreaterThan(0)
    expect(tiers.filter(t => t.es_actual), 'exactamente un tramo vigente').toHaveLength(1)
    const actual = tiers.find(t => t.es_actual)!
    expect(rep.porcentaje).toBe(actual.porcentaje)
    expect(rep.comision).toBeCloseTo(rep.cobrado_mes * rep.porcentaje / 100, 2)
    expect(actual.monto_minimo).toBeLessThanOrEqual(rep.cobrado_mes)

    const cartera = (await api(request, 'contabilidad', 'GET', '/reports/cartera')).body
    expect(cartera.aging.ranges.map((r: { desde_dias: number }) => r.desde_dias)).toEqual([0, 31, 61, 91])
    expect(cartera.cobrado_90.cobrado_mes, 'la cartera y el reporte de comisión cuentan el mismo cobrado').toBeCloseTo(rep.cobrado_mes, 2)
  })

  test('3. tramos: solo el aprobador configurado los edita; validaciones y borrado', async ({ request }) => {
    const nuevo = { monto_minimo: 900000, monto_maximo: 900100, porcentaje: 7, orden: 99 }
    let id: number | undefined
    try {
      for (const rol of ['vendedor', 'contabilidad', 'asistenteadministrativa', 'gerencia'] as const) {
        expect((await api(request, rol, 'POST', '/commissions/cartera/tiers', nuevo)).status, `${rol} no crea tramos`).toBe(403)
      }
      expect((await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', { ...nuevo, monto_maximo: 100 })).status, 'el máximo debe superar al mínimo').toBe(422)
      expect((await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', { ...nuevo, porcentaje: 101 })).status).toBe(422)
      expect((await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', { ...nuevo, orden: 0 })).status).toBe(422)
      expect((await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', { ...nuevo, monto_minimo: -1 })).status).toBe(422)

      const ok = await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', nuevo)
      expect(ok.status).toBe(201)
      id = ok.body.id as number
      expect((await api(request, 'contabilidad', 'PUT', `/commissions/cartera/tiers/${id}`, { porcentaje: 8 })).status).toBe(403)
      const upd = await api(request, 'gerencia3', 'PUT', `/commissions/cartera/tiers/${id}`, { porcentaje: 8 })
      expect(upd.status).toBe(200)
      expect(upd.body.porcentaje).toBe(8)
      expect((await api(request, 'gerencia3', 'PUT', '/commissions/cartera/tiers/99999999', { porcentaje: 8 })).status).toBe(404)

      // El reporte lista el tramo nuevo.
      const rep = (await api(request, 'contabilidad', 'GET', '/reports/commission-tiers')).body
      expect((rep.tiers as { monto_minimo: number }[]).some(t => t.monto_minimo === 900000)).toBe(true)

      // No se valida el solapamiento ni el orden repetido: un tramo que cubre lo mismo que otro se acepta.
      const solapado = await api(request, 'gerencia3', 'POST', '/commissions/cartera/tiers', { monto_minimo: 900050, monto_maximo: 900060, porcentaje: 9, orden: 99 })
      expect(solapado.status, 'tramos solapados y con el mismo orden se aceptan').toBe(201)
      expect((await api(request, 'gerencia3', 'DELETE', `/commissions/cartera/tiers/${solapado.body.id}`)).status).toBe(204)

      expect((await api(request, 'contabilidad', 'DELETE', `/commissions/cartera/tiers/${id}`)).status).toBe(403)
    } finally {
      if (id !== undefined) {
        expect((await api(request, 'gerencia3', 'DELETE', `/commissions/cartera/tiers/${id}`)).status).toBe(204)
        expect((await api(request, 'gerencia3', 'DELETE', `/commissions/cartera/tiers/${id}`)).status, 'borrar dos veces → 404').toBe(404)
      }
    }
    const rep = (await api(request, 'contabilidad', 'GET', '/reports/commission-tiers')).body
    expect((rep.tiers as { monto_minimo: number }[]).some(t => t.monto_minimo >= 900000), 'el flujo no deja tramos de prueba').toBe(false)
  })
})
