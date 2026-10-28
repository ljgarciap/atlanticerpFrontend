import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de Bodega (catálogo: atlanticerp-backend/docs/flujos/bodega-inventario.md): ajustes de inventario, reubicaciones y conteo
// general, todos con aprobación del aprobador primario configurado, y su efecto en el stock y el kardex. Por la API real y con la cuenta de
// cada rol. Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
// `gerencia3` es el aprobador primario configurado en el demo; `gerencia` tiene bodega.approve pero NO es el aprobador.
const ROLES = ['asistentebodega', 'liderbodega', 'gerencia', 'gerencia3', 'vendedor'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ctx: Record<string, number> = {}
const PDF = Buffer.from('%PDF-1.4\n%flujo\n')
type Res = { status: number; body: any }

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* no JSON */ }
  return { status: r.status(), body }
}

async function ajuste(request: APIRequestContext, rol: Rol, campos: Record<string, string>, conEvidencia = true): Promise<Res> {
  const r = await request.post(`${API}/bodega/adjustment-requests`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { ...campos, ...(conEvidencia ? { 'lines[0][evidencia]': { name: 'evidencia.pdf', mimeType: 'application/pdf', buffer: PDF } } : {}) },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const data = (b: any) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Bodega: inventario', () => {
  const stock = async (request: APIRequestContext, almacen: number, producto = ctx.product) => {
    const r = (await api(request, 'liderbodega', 'GET', `/bodega/adjustment-requests/products/${producto}/warehouse-stock`)).body
    return (r.warehouses as { warehouse_id: number; quantity: number }[]).find(w => w.warehouse_id === almacen)!.quantity
  }

  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
    const inv = data((await api(request, 'liderbodega', 'GET', '/bodega/inventory?per_page=5')).body) as { id: number }[]
    ctx.product = inv[0].id
    const almacenes = (await api(request, 'liderbodega', 'GET', `/bodega/adjustment-requests/products/${ctx.product}/warehouse-stock`)).body.warehouses as { warehouse_id: number; name: string }[]
    ctx.central = almacenes.find(w => w.name === 'Bodega Central')!.warehouse_id
    ctx.exhibicion = almacenes.find(w => w.name === 'Sala de exhibición 1')!.warehouse_id
  })

  test('1. ajuste de inventario: evidencia obligatoria, solo el aprobador lo autoriza y recién ahí cambia el stock', async ({ request }) => {
    const campos = (extra: Record<string, string> = {}) => ({ catalog_product_id: String(ctx.product), 'lines[0][warehouse_id]': String(ctx.central), 'lines[0][tipo]': 'Sumar', 'lines[0][cantidad]': '5', 'lines[0][motivo]': 'CONTEO_FISICO_NO_COINCIDE', ...extra })

    expect((await ajuste(request, 'asistentebodega', campos(), false)).status, 'la evidencia es obligatoria').toBe(422)
    expect((await ajuste(request, 'asistentebodega', campos({ 'lines[0][motivo]': 'OTRO' }))).status, 'el motivo es del catálogo').toBe(422)
    expect((await ajuste(request, 'vendedor', campos())).status, 'el vendedor no ajusta inventario').toBe(403)

    const antes = await stock(request, ctx.central)
    const solicitud = await ajuste(request, 'asistentebodega', campos())
    expect(solicitud.status).toBe(201)
    const linea = solicitud.body.lines[0] as number
    expect(await stock(request, ctx.central), 'solicitar no mueve el stock').toBe(antes)
    expect((await ajuste(request, 'asistentebodega', campos())).status, 'un ajuste pendiente bloquea otro del mismo producto y almacén').toBe(409)

    expect((await api(request, 'liderbodega', 'POST', `/bodega/adjustment-requests/lines/${linea}/approve`)).status, 'el jefe de bodega no aprueba').toBe(403)
    expect((await api(request, 'gerencia', 'POST', `/bodega/adjustment-requests/lines/${linea}/approve`)).status, 'otra cuenta de Gerencia tampoco').toBe(403)
    const ok = await api(request, 'gerencia3', 'POST', `/bodega/adjustment-requests/lines/${linea}/approve`)
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('Aprobada')
    expect(await stock(request, ctx.central), 'al aprobar el stock sube').toBe(antes + 5)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/adjustment-requests/lines/${linea}/approve`)).status, 'se resuelve una sola vez').toBe(422)

    // un ajuste rechazado no toca el stock y libera al producto
    const resta = await ajuste(request, 'asistentebodega', campos({ 'lines[0][tipo]': 'Restar', 'lines[0][cantidad]': '3', 'lines[0][motivo]': 'ROBO_O_PERDIDA' }))
    expect(resta.status).toBe(201)
    const rechazo = await api(request, 'gerencia3', 'POST', `/bodega/adjustment-requests/lines/${resta.body.lines[0]}/reject`, { motivo_rechazo: 'No procede', reason: 'No procede' })
    expect(rechazo.status).toBe(200)
    expect(await stock(request, ctx.central), 'rechazar no cambia el stock').toBe(antes + 5)

    expect((await api(request, 'gerencia3', 'POST', '/bodega/adjustment-requests/lines/abc/approve')).status, 'un id no numérico es 404, no 500').toBe(404)
  })

  test('2. reubicación entre almacenes: la autoriza el aprobador y mueve el stock', async ({ request }) => {
    const base = { catalog_product_id: ctx.product, origin_warehouse_id: ctx.central, destination_warehouse_id: ctx.exhibicion, cantidad: 2, motivo: 'Exhibición' }
    expect((await api(request, 'asistentebodega', 'POST', '/bodega/relocations', { ...base, destination_warehouse_id: ctx.central })).status, 'origen y destino distintos').toBe(422)
    expect((await api(request, 'vendedor', 'POST', '/bodega/relocations', base)).status).toBe(403)

    const origenAntes = await stock(request, ctx.central)
    const destinoAntes = await stock(request, ctx.exhibicion)
    const sol = await api(request, 'asistentebodega', 'POST', '/bodega/relocations', base)
    expect(sol.status).toBe(201)
    const id = sol.body.id as number
    expect(await stock(request, ctx.central), 'solicitar no mueve nada').toBe(origenAntes)

    expect((await api(request, 'liderbodega', 'POST', `/bodega/relocations/${id}/approve`)).status).toBe(403)
    expect((await api(request, 'gerencia', 'POST', `/bodega/relocations/${id}/approve`)).status).toBe(403)
    const ok = await api(request, 'gerencia3', 'POST', `/bodega/relocations/${id}/approve`)
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('aprobada')
    expect(await stock(request, ctx.central)).toBe(origenAntes - 2)
    expect(await stock(request, ctx.exhibicion)).toBe(destinoAntes + 2)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/relocations/${id}/approve`)).status).toBe(422)

    expect((await api(request, 'asistentebodega', 'POST', '/bodega/relocations', { ...base, origin_warehouse_id: ctx.exhibicion, destination_warehouse_id: ctx.central, cantidad: 99999 })).status, 'no se mueve más de lo que hay').toBe(422)
    const otra = await api(request, 'asistentebodega', 'POST', '/bodega/relocations', { ...base, origin_warehouse_id: ctx.exhibicion, destination_warehouse_id: ctx.central, cantidad: 1 })
    expect(otra.status).toBe(201)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/relocations/${otra.body.id}/reject`, {})).status, 'rechazar exige motivo').toBe(422)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/relocations/${otra.body.id}/reject`, { motivo_rechazo: 'No procede' })).body.estado).toBe('rechazada')
    expect(await stock(request, ctx.exhibicion), 'rechazar no mueve el stock').toBe(destinoAntes + 2)
  })

  test('3. conteo general: la asistente cuenta, el aprobador autoriza y solo el jefe aplica', async ({ request }) => {
    const nuevo = await api(request, 'asistentebodega', 'POST', '/bodega/general-counts', { warehouse_id: ctx.central })
    expect(nuevo.status).toBe(201)
    const id = nuevo.body.id as number
    const lineas = (await api(request, 'asistentebodega', 'GET', `/bodega/general-counts/${id}`)).body.lines as { id: number; producto: { id: number }; cantidad_sistema: number }[]
    expect(lineas.length).toBeGreaterThan(1)

    // cuenta lo del sistema, con una diferencia de +3 en el primer producto
    const primero = lineas[0]
    const contado = lineas.map((l, i) => ({ id: l.id, cantidad_contada: l.cantidad_sistema + (i === 0 ? 3 : 0) }))
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/general-counts/${id}/submit`, {})).status, 'se evalúa antes de enviar').toBe(422)
    const eval_ = await api(request, 'asistentebodega', 'POST', `/bodega/general-counts/${id}/evaluate`, { lines: contado })
    expect(eval_.status).toBe(200)
    expect(eval_.body.estado).toBe('evaluado')
    expect(eval_.body.diferencias_encontradas).toBe(1)

    expect((await api(request, 'asistentebodega', 'POST', `/bodega/general-counts/${id}/submit`, {})).status).toBe(200)
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/general-counts/${id}/evaluate`, { lines: contado })).status, 'enviado no se vuelve a evaluar').toBe(422)

    expect((await api(request, 'liderbodega', 'POST', `/bodega/general-counts/${id}/approve`)).status).toBe(403)
    expect((await api(request, 'gerencia', 'POST', `/bodega/general-counts/${id}/approve`)).status).toBe(403)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/general-counts/${id}/reject`, {})).status, 'rechazar exige motivo').toBe(422)
    expect((await api(request, 'gerencia3', 'POST', `/bodega/general-counts/${id}/approve`)).status).toBe(200)

    const antes = await stock(request, ctx.central, primero.producto.id)
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/general-counts/${id}/apply`)).status, 'aplicar es solo del jefe de bodega').toBe(403)
    expect(await stock(request, ctx.central, primero.producto.id), 'aprobar no aplica todavía').toBe(antes)
    expect((await api(request, 'liderbodega', 'POST', `/bodega/general-counts/${id}/apply`)).status).toBe(200)
    expect(await stock(request, ctx.central, primero.producto.id), 'aplicar ajusta el stock a lo contado').toBe(primero.cantidad_sistema + 3)
    expect((await api(request, 'liderbodega', 'POST', `/bodega/general-counts/${id}/apply`)).status, 'se aplica una sola vez').toBe(422)

    const kardex = data((await api(request, 'liderbodega', 'GET', '/bodega/kardex?per_page=20')).body) as { tipo: string; cantidad: number }[]
    expect(kardex.some(m => m.tipo === 'Conteo' && m.cantidad === 3), 'el kardex registra el ajuste del conteo').toBe(true)
  })
})
