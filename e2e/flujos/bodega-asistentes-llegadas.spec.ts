import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { crearPedido, data, iniciarSesion, idDeUsuario, llamar, type Pedido, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Bodega, tercera parte (catálogo: atlanticerp-backend/docs/flujos/bodega-asistentes-llegadas.md): el mapeo vendedor→asistente de Bodega
// (quién lo edita, un mapeo activo por vendedor, efecto en los pedidos nuevos y en la carga por asistente) y la confirmación de llegada física de mercancía
// (paso 1 de Bodega, paso 2 de Compras). Por la API real y con la cuenta de cada rol; crea sus propios datos «[FLUJO]». UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['superadmin', 'vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'asistentebodega2', 'auxiliarbodega'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Bodega: asistentes y llegada de mercancía', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    ctx.vendedor = await idDeUsuario(req, tokens, 'vendedor')
    ctx.asistente1 = await idDeUsuario(req, tokens, 'asistentebodega')
    ctx.asistente2 = await idDeUsuario(req, tokens, 'asistentebodega2')
  })

  test.afterAll(async () => {
    // deja el mapeo del vendedor como estaba al empezar
    if (ctx.mapeoOriginal) await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id: ctx.vendedor, assistant_id: ctx.mapeoOriginal })
    await req.dispose()
  })

  const mapeoDe = async (vendedor: number) => (data((await api('liderbodega', 'GET', '/bodega/warehouse-assistant-mapping')).body) as { id: number; seller_id: number; assistant_id: number }[]).filter(m => m.seller_id === vendedor)

  test('1. mapeo vendedor→asistente: lo lee Bodega, lo edita solo el Líder de Bodega', async () => {
    const lista = await api('liderbodega', 'GET', '/bodega/warehouse-assistant-mapping')
    expect(lista.status).toBe(200)
    const filas = data(lista.body) as { id: number; seller_id: number; seller_name: string; assistant_id: number; assistant_name: string }[]
    expect(filas.length, 'el demo trae mapeos').toBeGreaterThan(0)
    expect(filas[0]).toEqual(expect.objectContaining({ seller_name: expect.any(String), assistant_name: expect.any(String) }))
    for (const rol of ['asistentebodega', 'auxiliarbodega']) expect((await api(rol, 'GET', '/bodega/warehouse-assistant-mapping')).status, `${rol} lo lee`).toBe(200)
    expect((await api('vendedor', 'GET', '/bodega/warehouse-assistant-mapping')).status, 'Ventas no lo lee').toBe(403)

    const del = await mapeoDe(ctx.vendedor)
    expect(del, 'un solo mapeo activo por vendedor').toHaveLength(1)
    ctx.mapeoOriginal = del[0].assistant_id

    const cuerpo = { seller_id: ctx.vendedor, assistant_id: ctx.asistente1 }
    for (const rol of ['asistentebodega', 'gerencia', 'gerencia3', 'vendedor', 'lidercompras']) {
      const r = await api(rol, 'POST', '/bodega/warehouse-assistant-mapping', cuerpo)
      expect(r.status, `${rol} no edita el mapeo`).toBe(403)
    }
    const malo = await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id: 99999999, assistant_id: ctx.asistente1 })
    expect(malo.status, 'el vendedor debe existir').toBe(422)
    expect((await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id: ctx.vendedor })).status).toBe(422)
  })

  test('2. cambiar el mapeo reemplaza al anterior y solo afecta a los pedidos nuevos', async () => {
    ctx.pedido1 = await crearPedido(req, tokens, `Asistente A ${STAMP}`)
    // el detalle no expone al asistente; el tablero sí lo filtra por `assistant_id`
    const asignado = async (p: Pedido, etiqueta: string, asistente: number) => {
      const r = await api('liderbodega', 'GET', `/bodega/orders?per_page=50&assistant_id=${asistente}&search=${encodeURIComponent(`[FLUJO] Proyecto ${etiqueta}`)}`)
      return (r.body.cards as { id: number }[]).some(c => c.id === p.pedido)
    }
    ctx.asignado = asignado
    expect(await asignado(ctx.pedido1, `Asistente A ${STAMP}`, ctx.mapeoOriginal), 'el pedido nace con el asistente mapeado').toBe(true)

    const nuevo = ctx.mapeoOriginal === ctx.asistente1 ? ctx.asistente2 : ctx.asistente1
    const set = await api('liderbodega', 'POST', '/bodega/warehouse-assistant-mapping', { seller_id: ctx.vendedor, assistant_id: nuevo })
    expect(set.status).toBe(201)
    const tras = await mapeoDe(ctx.vendedor)
    expect(tras, 'el anterior queda inactivo: sigue habiendo uno solo').toHaveLength(1)
    expect(tras[0].assistant_id).toBe(nuevo)
    ctx.nuevoAsistente = nuevo

    ctx.pedido2 = await crearPedido(req, tokens, `Asistente B ${STAMP}`)
    expect(await asignado(ctx.pedido2, `Asistente B ${STAMP}`, nuevo), 'el pedido nuevo toma el asistente nuevo').toBe(true)
    expect(await asignado(ctx.pedido1, `Asistente A ${STAMP}`, ctx.mapeoOriginal), 'el pedido viejo conserva el suyo').toBe(true)
    expect(await asignado(ctx.pedido1, `Asistente A ${STAMP}`, nuevo)).toBe(false)
  })

  test('3. carga por asistente: cuenta pedidos y reparte el porcentaje', async () => {
    const carga = data((await api('liderbodega', 'GET', '/bodega/orders/assistant-load')).body) as { assistant_id: number; assistant_name: string; orders_count: number; percent_of_total: number }[]
    expect(carga.length).toBeGreaterThan(0)
    const suma = carga.reduce((s, c) => s + c.percent_of_total, 0)
    expect(suma, 'los porcentajes suman 100 (o 0 sin pedidos)').toBeGreaterThanOrEqual(0)
    expect(suma).toBeLessThanOrEqual(100.5)
    const del = (id: number) => carga.find(c => c.assistant_id === id)
    expect(del(ctx.nuevoAsistente)!.orders_count).toBeGreaterThanOrEqual(1)
    expect(del(ctx.mapeoOriginal)!.orders_count).toBeGreaterThanOrEqual(1)
    expect((await api('vendedor', 'GET', '/bodega/orders/assistant-load')).status, 'Ventas no ve la carga').toBe(403)

    const filtrado = data((await api('liderbodega', 'GET', `/bodega/orders?assistant_id=${ctx.nuevoAsistente}&per_page=50&search=${encodeURIComponent(`Asistente B ${STAMP}`)}`)).body)
    expect(JSON.stringify(filtrado)).toContain(`Asistente B ${STAMP}`)
  })

  test('4. llegada física: Bodega cuenta, Compras factura solo lo contado y el resto queda por llegar', async () => {
    const prod = ctx.pedido1.prod as number
    const stock = async () => ((await api('liderbodega', 'GET', `/bodega/adjustment-requests/products/${prod}/warehouse-stock`)).body.warehouses as { warehouse_id: number; quantity: number }[]).find(w => w.warehouse_id === ctx.pedido1.bodegaCentral)!.quantity
    ctx.stockInicial = await stock()

    const prov = data((await api('lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    const oc = await api('lidercompras', 'POST', '/compras/orders', { provider_id: prov[0].id, modality: 'directo', lines: [{ catalog_product_id: prod, quantity: 10, unit_cost: 50 }] })
    expect(oc.status).toBe(201)
    for (let i = 0; i < 4; i++) expect((await api('lidercompras', 'PATCH', `/compras/orders/${oc.body.id}/advance`)).status).toBe(200)
    const ingreso = await api('lidercompras', 'POST', '/compras/goods-receipts', { purchase_order_id: oc.body.id, lines: [{ catalog_product_id: prod, quantity: 10, unit_cost: 50, warehouse_id: ctx.pedido1.bodegaCentral }] })
    expect(ingreso.status).toBe(201)
    ctx.linea = ingreso.body.lines[0].id
    expect(await stock(), 'registrar el ingreso no mueve el stock').toBe(ctx.stockInicial)

    const url = `/bodega/inventory/${prod}/confirm-arrival`
    expect((await api('liderbodega', 'POST', '/bodega/inventory/99999999/confirm-arrival', { cantidad_entregada: 1 })).status).toBe(404)
    for (const c of [0, -3]) expect((await api('liderbodega', 'POST', url, { cantidad_entregada: c })).status, `cantidad ${c}`).toBe(422)
    expect((await api('liderbodega', 'POST', url, {})).status).toBe(422)
    const exceso = await api('liderbodega', 'POST', url, { cantidad_entregada: 9999 })
    expect(exceso.status, 'no se puede reportar más de lo pedido').toBe(422)
    expect(exceso.body.message).toMatch(/no puede superar lo pedido pendiente/)
    for (const rol of ['vendedor', 'lidercompras']) expect((await api(rol, 'POST', url, { cantidad_entregada: 1 })).status, `${rol} no reporta llegadas`).toBe(403)

    const ok = await api('asistentebodega', 'POST', url, { cantidad_entregada: 6 })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ confirmed_quantity: 6 })
    expect(ok.body.confirmed_lines).toHaveLength(1)
    expect(await stock(), 'el aviso de Bodega tampoco mueve el stock').toBe(ctx.stockInicial)

    const fila = data((await api('liderbodega', 'GET', `/bodega/inventory/${prod}`)).body)
    ctx.fila = fila
    const estado = JSON.stringify(fila)
    expect(estado).toMatch(/"awaiting_compras":true/)
    expect(estado).toMatch(/"pending_bodega_action":false/)
    expect(estado).toMatch(/"confirmed_quantity":6/)

    const otra = await api('liderbodega', 'POST', url, { cantidad_entregada: 4 })
    expect(otra.status, 'antes de que Compras confirme, lo ya reportado no se vuelve a reportar').toBe(422)
    expect(otra.body.message).toMatch(/no tiene unidades "Por ingresar" pendientes de reportar/)

    // Fase 20c: dos confirmaciones simultáneas de Compras; solo una entra al inventario (la línea se bloquea) y entra lo que Bodega contó
    const confirmar = () => api('lidercompras', 'POST', `/compras/goods-receipts/lines/${ctx.linea}/confirm`)
    const resultados = await Promise.all([confirmar(), confirmar()])
    expect(resultados.map(r => r.status).sort(), 'una confirma y la otra ya la encuentra confirmada').toEqual([200, 422])
    expect(await stock() - ctx.stockInicial, 'entran las 6 unidades contadas, una sola vez').toBe(6)
    expect(JSON.stringify(data((await api('liderbodega', 'GET', `/bodega/inventory/${prod}`)).body))).toMatch(/"pending_bodega_action":true/)

    // el resto (4) queda «Por ingresar» y se puede reportar y confirmar cuando llegue
    const resto = await api('liderbodega', 'POST', url, { cantidad_entregada: 4 })
    expect(resto.status, 'las 4 unidades que faltaban ya se pueden reportar').toBe(200)
    expect(resto.body).toMatchObject({ confirmed_quantity: 4 })
    const lineaResto = resto.body.confirmed_lines[0] as number
    expect(lineaResto).not.toBe(ctx.linea)
    expect((await api('lidercompras', 'POST', `/compras/goods-receipts/lines/${lineaResto}/confirm`)).status).toBe(200)
    expect(await stock() - ctx.stockInicial, 'al final entran las 10, no más').toBe(10)
    expect(JSON.stringify(data((await api('liderbodega', 'GET', `/bodega/inventory/${prod}`)).body))).toMatch(/"awaiting_compras":false/)
  })
})
