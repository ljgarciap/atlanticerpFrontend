import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { data, iniciarSesion, idDeUsuario, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de la Fase 29a (Bodega): validación de roles del mapeo vendedor→asistente, quitar un mapeo y reasignar lo pendiente,
// filtros del Kardex por fecha y producto, y la ruta del día. Catálogos: atlanticerp-backend/docs/flujos/bodega-asistentes-llegadas.md y
// bodega-ubicaciones-rutas-kardex.md. Por la API real; deja el mapeo del vendedor como estaba. UN worker (npm run e2e:flujos).

const ROLES = ['superadmin', 'vendedor', 'gerencia', 'liderbodega', 'asistentebodega', 'asistentebodega2', 'auxiliarbodega'] as const
let tokens: Tokens
let req: APIRequestContext
const ctx: Record<string, any> = {}
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Bodega, Fase 29a', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    ctx.vendedor = await idDeUsuario(req, tokens, 'vendedor')
    ctx.asistente1 = await idDeUsuario(req, tokens, 'asistentebodega')
    ctx.asistente2 = await idDeUsuario(req, tokens, 'asistentebodega2')
    ctx.gerencia = await idDeUsuario(req, tokens, 'gerencia')
    const actual = (data((await api('liderbodega', 'GET', '/bodega/warehouse-assistant-mapping')).body) as { seller_id: number; assistant_id: number }[]).find(m => m.seller_id === ctx.vendedor)
    ctx.mapeoOriginal = actual?.assistant_id
  })

  test.afterAll(async () => {
    if (ctx.mapeoOriginal) await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id: ctx.vendedor, assistant_id: ctx.mapeoOriginal })
    await req.dispose()
  })

  test('1. el mapeo solo acepta vendedor de ventas y asistente de Bodega; se quita y se reasigna lo pendiente', async () => {
    const mapear = (seller_id: number, assistant_id: number) => api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id, assistant_id })
    const malVendedor = await mapear(ctx.gerencia, ctx.asistente1)
    expect(malVendedor.status, 'Gerencia no es vendedor').toBe(422)
    expect(malVendedor.body.errors).toHaveProperty('seller_id')
    const malAsistente = await mapear(ctx.vendedor, ctx.vendedor)
    expect(malAsistente.status, 'un vendedor no es asistente de Bodega').toBe(422)
    expect(malAsistente.body.errors).toHaveProperty('assistant_id')

    const alta = await mapear(ctx.vendedor, ctx.asistente2)
    expect(alta.status).toBe(201)
    expect((await api('asistentebodega', 'DELETE', `/bodega/warehouse-assistant-mapping/${alta.body.id}`)).status, 'la asistente no quita mapeos').toBe(403)
    const reasignar = await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping/reassign-pending', { seller_id: ctx.vendedor })
    expect(reasignar.status).toBe(200)
    expect(reasignar.body.assistant_id).toBe(ctx.asistente2)
    expect(reasignar.body.reasignados).toEqual(expect.any(Number))

    expect((await api('liderbodega', 'DELETE', `/bodega/warehouse-assistant-mapping/${alta.body.id}`)).status).toBe(200)
    expect((await api('liderbodega', 'DELETE', `/bodega/warehouse-assistant-mapping/${alta.body.id}`)).status, 'ya no está activo').toBe(404)
    expect((await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping/reassign-pending', { seller_id: ctx.vendedor })).status, 'sin mapeo no hay a quién reasignar').toBe(422)
  })

  test('2. el Kardex filtra por producto exacto y por fechas', async () => {
    const todo = (await api('liderbodega', 'GET', '/bodega/kardex?per_page=100')).body.data as { fecha: string; producto: { id: number } }[]
    expect(todo.length, 'el demo y los flujos dejan movimientos').toBeGreaterThan(0)
    const producto = todo[0].producto.id
    const delProducto = (await api('liderbodega', 'GET', `/bodega/kardex?per_page=100&producto_id=${producto}`)).body.data as { producto: { id: number } }[]
    expect(delProducto.length).toBeGreaterThan(0)
    expect(delProducto.every(m => m.producto.id === producto)).toBe(true)

    const hoy = todo[0].fecha.slice(0, 10)
    const deHoy = (await api('liderbodega', 'GET', `/bodega/kardex?per_page=100&desde=${hoy}&hasta=${hoy}`)).body.data as { fecha: string }[]
    expect(deHoy.length).toBeGreaterThan(0)
    expect(deHoy.every(m => m.fecha.slice(0, 10) === hoy)).toBe(true)
    expect((await api('liderbodega', 'GET', '/bodega/kardex?desde=ayer')).status, 'una fecha inválida es 422').toBe(422)
    expect((await api('liderbodega', 'GET', `/bodega/kardex?desde=${hoy}&hasta=2000-01-01`)).status, 'hasta anterior a desde es 422').toBe(422)
  })

  test('3. la ruta del día marca lo atrasado y trae la fecha comprometida', async () => {
    const rutas = (await api('liderbodega', 'GET', '/bodega/home/rutas-dia')).body.data as { atrasado: boolean; fecha_compromiso: string | null }[]
    expect(Array.isArray(rutas)).toBe(true)
    for (const r of rutas) expect(typeof r.atrasado).toBe('boolean')
    const fechas = rutas.map(r => r.fecha_compromiso ?? '')
    expect([...fechas].sort(), 'lo atrasado (fecha anterior) va primero').toEqual(fechas)
  })
})
