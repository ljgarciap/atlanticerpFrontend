import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Compras, familias de producto (catálogo: atlanticerp-backend/docs/flujos/compras-familias.md): listado y detalle (con y sin costos según el
// rol), alta de una familia por nombre, asignar productos y «Generar compra» (una orden por proveedor, cantidad hasta el punto de reorden). Por la API real y con
// la cuenta de cada rol; crea sus propias familias «[FLUJO]» y deja los productos del demo como estaban. UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['lidercompras', 'liderbodega', 'vendedor', 'contabilidad'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Compras: familias de producto', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    // dos productos del demo CON proveedor y con proveedores distintos (los demás no tienen y la compra de familia los omite)
    const inv = data((await api('lidercompras', 'GET', '/compras/inventory?per_page=100')).body) as { id: number; provider_id: number | null; reorder_point: number | null; stock_quantity: number; family_id: number | null }[]
    const conProveedor = inv.filter(p => p.provider_id)
    const primero = conProveedor[0]
    const otro = conProveedor.find(p => p.provider_id !== primero.provider_id)!
    ctx.prods = [primero, otro].map(p => ({ id: p.id, proveedor: p.provider_id, reorden: p.reorder_point, stock: p.stock_quantity, familiaOriginal: p.family_id }))
  })

  test.afterAll(async () => {
    // devuelve los productos del demo a su familia y punto de reorden originales
    for (const p of [...(ctx.prods ?? []), ...(ctx.extras ?? [])]) await api('lidercompras', 'PUT', `/compras/inventory/${p.id}`, { family_id: p.familiaOriginal ?? null, reorder_point: p.reorden ?? 0 })
    await req.dispose()
  })

  test('1. alta de una familia por nombre: obligatorio, sin duplicados y solo Compras', async () => {
    const nombre = `[FLUJO] Familia ${STAMP}`
    expect((await api('lidercompras', 'POST', '/compras/families', { name: '   ' })).status, 'el nombre es obligatorio').toBe(422)
    for (const rol of ['vendedor', 'liderbodega', 'contabilidad']) expect((await api(rol, 'POST', '/compras/families', { name: nombre })).status, `${rol} no crea familias`).toBe(403)

    const nueva = await api('lidercompras', 'POST', '/compras/families', { name: nombre })
    expect(nueva.status).toBe(201)
    ctx.familia = nueva.body.id as number
    const repetida = await api('lidercompras', 'POST', '/compras/families', { name: nombre.toUpperCase() })
    expect(repetida.status, 'el mismo nombre (sin importar mayúsculas) devuelve la existente').toBe(200)
    expect(repetida.body.id).toBe(ctx.familia)
  })

  test('2. listado y detalle: Compras ve costos, Ventas y Contabilidad solo la estructura, Bodega no entra', async () => {
    const lista = await api('lidercompras', 'GET', '/compras/families?per_page=100')
    expect(lista.status).toBe(200)
    expect(lista.body).toMatchObject({ restricted: false, can_manage: true })
    const mia = (data(lista.body) as { id: number; product_count: number; total_value: number | null }[]).find(f => f.id === ctx.familia)!
    expect(mia, 'la familia nueva aparece').toBeTruthy()
    expect(mia.product_count).toBe(0)

    const ventas = await api('vendedor', 'GET', '/compras/families?per_page=100')
    expect(ventas.status, 'Ventas ve las familias').toBe(200)
    expect(ventas.body).toMatchObject({ restricted: true, can_manage: false })
    expect((data(ventas.body) as { total_value: number | null }[]).every(f => f.total_value === null), 'sin valores').toBe(true)
    const conta = await api('contabilidad', 'GET', '/compras/families?per_page=100')
    expect(conta.status, 'Contabilidad también ve la estructura').toBe(200)
    expect(conta.body).toMatchObject({ restricted: true, can_manage: false })
    expect((await api('liderbodega', 'GET', '/compras/families')).status, 'Bodega no entra').toBe(403)

    const detalle = await api('lidercompras', 'GET', `/compras/families/${ctx.familia}`)
    expect(detalle.status).toBe(200)
    expect(detalle.body).toMatchObject({ id: ctx.familia, product_count: 0, restricted: false })
    expect((await api('lidercompras', 'GET', '/compras/families/99999999')).status).toBe(404)
  })

  test('3. asignar productos: el detalle los lista y el valor sale de costo × existencias', async () => {
    for (const p of ctx.prods) {
      expect((await api('lidercompras', 'PUT', `/compras/inventory/${p.id}`, { family_id: ctx.familia })).status).toBe(200)
    }
    const detalle = (await api('lidercompras', 'GET', `/compras/families/${ctx.familia}`)).body
    expect(detalle.product_count).toBe(2)
    expect((detalle.products as { id: number }[]).map(p => p.id).sort()).toEqual(ctx.prods.map((p: any) => p.id).sort())
    expect(typeof detalle.total_value, 'Compras ve el valor').toBe('number')

    const ventas = (await api('vendedor', 'GET', `/compras/families/${ctx.familia}`)).body
    expect(ventas.total_value, 'Ventas no ve el valor').toBeNull()
    expect(ventas.can_manage).toBe(false)
    const fila = (await api('lidercompras', 'GET', '/compras/families?per_page=100')).body.data.find((f: any) => f.id === ctx.familia)
    expect(fila.product_count).toBe(2)
  })

  test('4. generar compra: solo la necesidad real, una orden por proveedor y lo omitido con su motivo', async () => {
    const url = `/compras/families/${ctx.familia}/generate-purchase`
    const vacia = (await api('lidercompras', 'POST', '/compras/families', { name: `[FLUJO] Vacía ${STAMP}` })).body.id
    const sinProductos = await api('lidercompras', 'POST', `/compras/families/${vacia}/generate-purchase`)
    expect(sinProductos.status, 'una familia sin productos con proveedor no genera nada').toBe(422)
    expect(sinProductos.body.message).toMatch(/no tiene productos activos con proveedor/)
    expect((await api('lidercompras', 'POST', '/compras/families/99999999/generate-purchase')).status).toBe(404)
    for (const rol of ['vendedor', 'liderbodega', 'contabilidad']) expect((await api(rol, 'POST', url)).status, `${rol} no genera compras`).toBe(403)

    // dos productos con proveedores distintos a los que les faltan 7 y 4 unidades (sumando lo que ya viene en camino de corridas anteriores),
    // uno con proveedor y sin necesidad (reorden 0) y uno sin proveedor
    const fila = async (id: number) => (await api('lidercompras', 'GET', `/compras/inventory/${id}`)).body as { stock_quantity: number; en_camino: number; por_ingresar: number }
    const [a, b] = ctx.prods
    const inv = data((await api('lidercompras', 'GET', '/compras/inventory?per_page=100')).body) as { id: number; provider_id: number | null; reorder_point: number | null; family_id: number | null }[]
    const ocupados = new Set([a.id, b.id])
    const c = inv.find(p => p.provider_id && !ocupados.has(p.id))!
    const d = inv.find(p => !p.provider_id && !ocupados.has(p.id) && p.id !== c.id)!
    ctx.extras = [c, d].map(p => ({ id: p.id, reorden: p.reorder_point, familiaOriginal: p.family_id }))
    for (const p of [c, d]) expect((await api('lidercompras', 'PUT', `/compras/inventory/${p.id}`, { family_id: ctx.familia })).status).toBe(200)
    expect((await api('lidercompras', 'PUT', `/compras/inventory/${c.id}`, { reorder_point: 0 })).status).toBe(200)
    expect((await api('lidercompras', 'PUT', `/compras/inventory/${d.id}`, { reorder_point: 999999 })).status).toBe(200)
    for (const [p, falta] of [[a, 7], [b, 4]] as const) {
      const f = await fila(p.id)
      expect((await api('lidercompras', 'PUT', `/compras/inventory/${p.id}`, { reorder_point: f.stock_quantity + f.en_camino + f.por_ingresar + falta })).status).toBe(200)
    }

    const generado = await api('lidercompras', 'POST', url)
    expect(generado.status).toBe(201)
    const ids = generado.body.order_ids as number[]
    expect(ids, 'una orden por proveedor distinto, solo con los productos que lo necesitan').toHaveLength(2)

    const lineas: { catalog_product_id: number; quantity: number }[] = []
    for (const id of ids) {
      const o = (await api('lidercompras', 'GET', `/compras/orders/${id}`)).body
      expect(o.modality).toBe('directo')
      expect(['pendiente_liquidar', 'por_aprobar']).toContain(o.status)
      lineas.push(...o.lines)
    }
    expect(lineas.map(l => l.catalog_product_id).sort(), 'ni el de reorden 0 ni el sin proveedor entran en una orden').toEqual([a.id, b.id].sort())
    expect(lineas.find(l => l.catalog_product_id === a.id)!.quantity, 'cantidad = reorden − existencias − en camino').toBe(7)
    expect(lineas.find(l => l.catalog_product_id === b.id)!.quantity).toBe(4)

    const omitidos = new Map((generado.body.omitidos as { product_id: number; motivo: string }[]).map(o => [o.product_id, o.motivo]))
    expect(omitidos.get(c.id), 'con proveedor y reorden 0: no necesita compra').toBe('sin_necesidad')
    expect(omitidos.get(d.id), 'sin proveedor se informa, ya no se omite en silencio').toBe('sin_proveedor')

    const otra = await api('lidercompras', 'POST', url)
    expect(otra.status, 'repetir no duplica: lo ya pedido está en camino').toBe(422)
    expect(otra.body.message).toMatch(/no necesita compra ahora/)
    const repetidos = new Map((otra.body.omitidos as { product_id: number; motivo: string }[]).map(o => [o.product_id, o.motivo]))
    expect(repetidos.get(a.id)).toBe('ya_en_camino')
    expect(repetidos.get(b.id)).toBe('ya_en_camino')
  })
})
