import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { API, data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de la Fase 32 (spec: atlanticerp-backend/docs/specs/fase32-cierre-abiertos.md): contacto de soporte visible sin sesión, vendedores en el
// selector del mapeo, vínculo de la ficha de técnico con un usuario y Kardex por producto exacto. Por la API real; limpia lo que crea. UN worker.

const STAMP = String(Date.now())
const ROLES = ['superadmin', 'liderservicios', 'liderbodega', 'vendedor'] as const
let tokens: Tokens
let req: APIRequestContext
const ctx: Record<string, any> = {}
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Fase 32: cierre de abiertos', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
  })

  test.afterAll(async () => {
    if (ctx.soporteOriginal !== undefined) await api('superadmin', 'PUT', '/admin/global-settings/support_contact', { value: ctx.soporteOriginal })
    if (ctx.ficha) {
      await api('liderservicios', 'PATCH', `/servicios/internal-technicians/${ctx.ficha}`, { user_id: null })
      await api('liderservicios', 'DELETE', `/servicios/internal-technicians/${ctx.ficha}`)
    }
    if (ctx.restaurar) await api('liderservicios', 'PATCH', `/servicios/internal-technicians/${ctx.restaurar.ficha}`, { user_id: ctx.restaurar.user })
    await req.dispose()
  })

  test('1. el contacto de soporte lo fija Gerencia y se ve sin sesión', async () => {
    const antes = await req.get(`${API}/auth/support-contact`, { headers: { Accept: 'application/json' } })
    expect(antes.status()).toBe(200)
    ctx.soporteOriginal = (await antes.json()).data.support_contact as string

    const texto = `soporte-${STAMP}@example.test`
    expect((await api('superadmin', 'PUT', '/admin/global-settings/support_contact', { value: texto })).status).toBe(200)

    const despues = await req.get(`${API}/auth/support-contact`, { headers: { Accept: 'application/json' } })
    expect((await despues.json()).data.support_contact).toBe(texto)
    // solo ese dato sale sin sesión
    expect(Object.keys((await despues.json()).data)).toEqual(['support_contact'])
  })

  test('2. el selector del mapeo lista a los vendedores (y solo a ellos)', async () => {
    const r = await api('liderbodega', 'GET', '/bodega/team-members?role=vendedor')
    expect(r.status).toBe(200)
    const nombres = (data(r.body) as { id: number; name: string }[]).map(m => m.name)
    expect(nombres.length).toBeGreaterThan(0)
    const asistentes = (data((await api('liderbodega', 'GET', '/bodega/team-members?role=asistente_bodega')).body) as { name: string }[]).map(m => m.name)
    for (const a of asistentes) expect(nombres, 'ningún asistente aparece como vendedor').not.toContain(a)
  })

  test('3. vincular la ficha de un técnico con un usuario', async () => {
    const alta = await api('liderservicios', 'POST', '/servicios/internal-technicians', { nombre: `[FLUJO] Técnico ${STAMP}`, especialidad: 'general' })
    expect(alta.status).toBe(201)
    ctx.ficha = alta.body.id as number

    expect((await api('vendedor', 'GET', '/servicios/internal-technicians/linkable-users')).status, 'Ventas no gestiona técnicos').toBe(403)

    let ofrecidos = data((await api('liderservicios', 'GET', `/servicios/internal-technicians/linkable-users?ficha_id=${ctx.ficha}`)).body) as { id: number; name: string }[]
    if (ofrecidos.length === 0) {
      // El demo liga a todos los técnicos: se suelta una ficha ajena y se vuelve a ligar al terminar.
      const fichas = data((await api('liderservicios', 'GET', '/servicios/internal-technicians')).body) as { id: number; user_id: number | null }[]
      const ajena = fichas.find(f => f.user_id != null && f.id !== ctx.ficha)!
      ctx.restaurar = { ficha: ajena.id, user: ajena.user_id }
      expect((await api('liderservicios', 'PATCH', `/servicios/internal-technicians/${ajena.id}`, { user_id: null })).status).toBe(200)
      ofrecidos = data((await api('liderservicios', 'GET', `/servicios/internal-technicians/linkable-users?ficha_id=${ctx.ficha}`)).body) as { id: number; name: string }[]
    }
    expect(ofrecidos.length, 'hay un usuario con rol de técnico para ligar').toBeGreaterThan(0)
    const usuario = ofrecidos[0]

    const ligado = await api('liderservicios', 'PATCH', `/servicios/internal-technicians/${ctx.ficha}`, { user_id: usuario.id })
    expect(ligado.status).toBe(200)
    expect(ligado.body.user_id).toBe(usuario.id)

    // Ya ligado: no se ofrece a otra ficha, pero sí a la propia.
    const paraOtra = data((await api('liderservicios', 'GET', '/servicios/internal-technicians/linkable-users')).body) as { id: number }[]
    expect(paraOtra.map(u => u.id)).not.toContain(usuario.id)
    const paraLaPropia = data((await api('liderservicios', 'GET', `/servicios/internal-technicians/linkable-users?ficha_id=${ctx.ficha}`)).body) as { id: number }[]
    expect(paraLaPropia.map(u => u.id)).toContain(usuario.id)

    const libre = await api('liderservicios', 'PATCH', `/servicios/internal-technicians/${ctx.ficha}`, { user_id: null })
    expect(libre.status).toBe(200)
    expect(libre.body.user_id).toBeNull()
  })

  test('4. el Kardex filtra por producto exacto', async () => {
    const todos = await api('liderbodega', 'GET', '/bodega/kardex?per_page=50')
    expect(todos.status).toBe(200)
    const filas = (todos.body.data ?? []) as { producto: { id: number | null } }[]
    test.skip(filas.length === 0, 'sin movimientos en el Kardex local')
    const id = filas.find(f => f.producto.id != null)!.producto.id as number

    const uno = await api('liderbodega', 'GET', `/bodega/kardex?producto_id=${id}&per_page=50`)
    expect(uno.status).toBe(200)
    const productos = (uno.body.data as { producto: { id: number } }[]).map(f => f.producto.id)
    expect(productos.length).toBeGreaterThan(0)
    expect(new Set(productos)).toEqual(new Set([id]))
  })
})
