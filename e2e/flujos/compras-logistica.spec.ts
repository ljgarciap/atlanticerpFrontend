import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Compras, logística y documentos de la orden (catálogo: atlanticerp-backend/docs/flujos/compras-logistica.md): quién entra a
// «Ver órdenes / Logística», qué ve cada rol (el vendedor nunca ve costos), datos de envío, filtros de envíos en movimiento, y el checklist de documentos.
// Por la API real y con la cuenta de cada rol; crea sus propias órdenes. UN worker (npm run e2e:flujos).

const ROLES = ['lidercompras', 'lideroperaciones', 'vendedor', 'liderbodega', 'contabilidad'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)
const PDF = Buffer.from('%PDF-1.4\n%flujo\n')

const subir = async (rol: string, orderId: number, category: string) => {
  const r = await req.post(`${process.env.E2E_BASE_URL ?? 'http://localhost:8092'}/api/compras/orders/${orderId}/documents`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { category, file: { name: 'doc.pdf', mimeType: 'application/pdf', buffer: PDF } },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Compras: logística y documentos', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    const prov = data((await api('lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    const prods = data((await api('lidercompras', 'GET', '/compras/inventory?per_page=5')).body) as { id: number }[]
    ctx.provider = prov[0].id
    ctx.product = prods[0].id
    const orden = await api('lidercompras', 'POST', '/compras/orders', { provider_id: ctx.provider, modality: 'directo', lines: [{ catalog_product_id: ctx.product, quantity: 6, unit_cost: 25 }] })
    expect(orden.status).toBe(201)
    ctx.orden = orden.body.id as number
  })

  test.afterAll(async () => { await req.dispose() })

  test('1. acceso: Compras, Operaciones y el vendedor entran; Bodega y Contabilidad no', async () => {
    for (const rol of ['lidercompras', 'lideroperaciones', 'vendedor']) expect((await api(rol, 'GET', '/compras/orders?per_page=5')).status, `${rol} lista las órdenes`).toBe(200)
    for (const rol of ['lidercompras', 'lideroperaciones', 'vendedor']) expect((await api(rol, 'GET', `/compras/orders/${ctx.orden}`)).status, `${rol} abre el detalle`).toBe(200)
    expect((await api('liderbodega', 'GET', `/compras/orders/${ctx.orden}`)).status, 'Bodega abre el detalle (solo lectura, panel «Por recibir»)').toBe(200)
    expect((await api('liderbodega', 'GET', '/compras/orders')).status, 'pero no el listado').toBe(403)
    expect((await api('contabilidad', 'GET', '/compras/orders')).status).toBe(403)
    expect((await api('contabilidad', 'GET', `/compras/orders/${ctx.orden}`)).status).toBe(403)
    expect((await api('lidercompras', 'GET', '/compras/orders/99999999')).status).toBe(404)
    expect((await api('lidercompras', 'GET', '/compras/orders/no-es-un-id')).status, 'un id no numérico es 404, no 500').toBe(404)
  })

  test('2. el vendedor y Operaciones nunca ven costos ni montos; Compras sí', async () => {
    const compras = (await api('lidercompras', 'GET', `/compras/orders/${ctx.orden}`)).body
    expect(Number(compras.total_amount)).toBe(150)
    expect(Number(compras.lines[0].unit_cost)).toBe(25)
    // Fase 24c: Operaciones ve la logística como el vendedor, sin montos
    const operaciones = (await api('lideroperaciones', 'GET', `/compras/orders/${ctx.orden}`)).body
    expect(operaciones.total_amount, 'Operaciones no ve los montos').toBeNull()
    expect(operaciones.lines[0].unit_cost).toBeNull()

    const vend = (await api('vendedor', 'GET', `/compras/orders/${ctx.orden}`)).body
    expect(vend.total_amount).toBeNull()
    expect(vend.payable_total).toBeNull()
    expect(vend.lines[0].unit_cost).toBeNull()
    expect(vend.lines[0].subtotal).toBeNull()
    const fila = (data((await api('vendedor', 'GET', `/compras/orders?per_page=100&search=${ctx.orden}`)).body) as any[]).find(o => o.id === ctx.orden)
    expect(fila, 'el vendedor ve la orden en el listado').toBeTruthy()
    expect(fila.total_amount).toBeNull()
    const kpis = await api('vendedor', 'GET', '/compras/orders?payment_pending=1&per_page=5')
    expect(kpis.body.payment_kpis?.total_pending_balance ?? null, 'ni el saldo pendiente').toBeNull()
  })

  test('3. solo Compras edita el envío: contenedor y transportista', async () => {
    const url = `/compras/orders/${ctx.orden}/shipping-info`
    for (const rol of ['vendedor', 'lideroperaciones', 'liderbodega', 'contabilidad']) expect((await api(rol, 'PATCH', url, { container_number: 'X' })).status, `${rol} no edita el envío`).toBe(403)
    expect((await api('lidercompras', 'PATCH', url, { container_number: 'x'.repeat(101) })).status, 'contenedor de más de 100 caracteres').toBe(422)
    // Fase 24b: formato ISO 6346 (4 letras + 7 números), transportista que no sea solo números
    expect((await api('lidercompras', 'PATCH', url, { container_number: 'CONT-FLUJO-1' })).status, 'contenedor con formato inválido').toBe(422)
    expect((await api('lidercompras', 'PATCH', url, { carrier: '12345' })).status, 'transportista solo con números').toBe(422)
    const ok = await api('lidercompras', 'PATCH', url, { container_number: 'msku-123 4567', carrier: 'Transportista Flujo' })
    expect(ok.status).toBe(200)
    expect(ok.body, 'el contenedor se normaliza').toMatchObject({ container_number: 'MSKU1234567', carrier: 'Transportista Flujo' })
    expect((await api('vendedor', 'GET', `/compras/orders/${ctx.orden}`)).body.container_number, 'el vendedor ve el dato de envío').toBe('MSKU1234567')
    expect((await api('lidercompras', 'PATCH', url, { container_number: 'TGHU7654321' })).status).toBe(200)
    // historial: quién, cuándo y el valor anterior; lo ve también el vendedor
    for (const rol of ['lidercompras', 'vendedor']) {
      const h = data((await api(rol, 'GET', `/compras/orders/${ctx.orden}/shipping-history`)).body) as { field: string; old: string | null; new: string | null; changed_by: string | null }[]
      const cambio = h.find(x => x.field === 'container_number' && x.new === 'TGHU7654321')
      expect(cambio, `${rol} ve el cambio de contenedor`).toBeTruthy()
      expect(cambio!.old).toBe('MSKU1234567')
      expect(cambio!.changed_by).toBeTruthy()
    }
    expect((await api('contabilidad', 'GET', `/compras/orders/${ctx.orden}/shipping-history`)).status).toBe(403)
  })

  test('4. envíos en movimiento: el filtro excluye lo que aún no se ordenó y el buscador de proyectos responde', async () => {
    const enMovimiento = async (rol: string) => (data((await api(rol, 'GET', `/compras/orders?active_shipments=1&per_page=100&search=${ctx.orden}`)).body) as any[]).map(o => o.id)
    expect(await enMovimiento('lidercompras'), 'pendiente de liquidar no es un envío').not.toContain(ctx.orden)
    expect((await api('lidercompras', 'PATCH', `/compras/orders/${ctx.orden}/advance`)).status).toBe(200)
    for (const rol of ['lidercompras', 'lideroperaciones', 'vendedor']) expect(await enMovimiento(rol), `${rol} ve el envío ya ordenado`).toContain(ctx.orden)
    const porEstado = data((await api('lideroperaciones', 'GET', `/compras/orders?status=ordenado&per_page=100`)).body) as any[]
    expect(porEstado.every(o => o.status === 'ordenado') && porEstado.some(o => o.id === ctx.orden)).toBe(true)
    for (const rol of ['lidercompras', 'lideroperaciones', 'vendedor']) {
      const r = await api(rol, 'GET', '/compras/orders/shipment-projects?active_shipments=1&search=zz-no-existe')
      expect(r.status, `${rol} usa el buscador de proyectos`).toBe(200)
      expect(data(r.body)).toEqual([])
    }
    expect((await api('contabilidad', 'GET', '/compras/orders/shipment-projects')).status).toBe(403)
  })

  test('5. orden por monto: se permite a quien ve costos; para el vendedor no revela el costo', async () => {
    const compras = await api('lidercompras', 'GET', '/compras/orders?sort_by=total_amount&sort_dir=desc&per_page=5')
    expect(compras.status).toBe(200)
    const montos = (data(compras.body) as any[]).map(o => Number(o.total_amount))
    expect(montos).toEqual([...montos].sort((a, b) => b - a))
    const vend = await api('vendedor', 'GET', '/compras/orders?sort_by=total_amount&sort_dir=desc&per_page=5')
    expect([200, 422], 'el vendedor no puede ordenar por monto: o se ignora o se rechaza').toContain(vend.status)
    if (vend.status === 200) expect((data(vend.body) as any[]).every(o => o.total_amount === null)).toBe(true)
  })

  test('6. documentos de la orden: categorías, extensiones, confirmación solo tras aprobar y visibilidad por rol', async () => {
    const url = `/compras/orders/${ctx.orden}/documents`
    expect((await subir('lidercompras', ctx.orden, 'categoria-inexistente')).status).toBe(422)
    for (const rol of ['vendedor', 'lideroperaciones', 'contabilidad']) expect((await subir(rol, ctx.orden, 'bl')).status, `${rol} no sube documentos`).toBe(403)

    const bl = await subir('lidercompras', ctx.orden, 'bl')
    expect(bl.status).toBe(201)
    const factura = await subir('lidercompras', ctx.orden, 'factura_comercial')
    expect(factura.status).toBe(201)

    const compras = data((await api('lidercompras', 'GET', url)).body) as { category: string }[]
    expect(compras.map(d => d.category).sort()).toEqual(['bl', 'factura_comercial'])
    const vend = data((await api('vendedor', 'GET', url)).body) as { category: string }[]
    expect(vend.map(d => d.category), 'el vendedor solo ve los documentos sin precios').toEqual(['bl'])
    expect((data((await api('lideroperaciones', 'GET', url)).body) as any[]).map(d => d.category), 'Operaciones, como el vendedor, solo ve los documentos sin precios').toEqual(['bl'])
    expect((await api('contabilidad', 'GET', url)).status).toBe(403)

    // Fase 24a: baja lógica con motivo; solo Compras; reemplazar = subir uno nuevo y quitar el anterior
    const docs = data((await api('lidercompras', 'GET', url)).body) as { id: number; category: string }[]
    const idFactura = docs.find(d => d.category === 'factura_comercial')!.id
    for (const rol of ['vendedor', 'lideroperaciones', 'contabilidad']) expect((await api(rol, 'DELETE', `${url}/${idFactura}`, { motivo: 'Motivo de prueba largo' })).status, `${rol} no quita documentos`).toBe(403)
    expect((await api('lidercompras', 'DELETE', `${url}/${idFactura}`, { motivo: 'corto' })).status, 'el motivo es obligatorio').toBe(422)
    expect((await api('lidercompras', 'DELETE', `${url}/${idFactura}`, { motivo: 'Se subió la factura equivocada' })).status).toBe(200)
    expect((data((await api('lidercompras', 'GET', url)).body) as any[]).map(d => d.category), 'ya no cuenta en el checklist').toEqual(['bl'])
    expect((await api('lidercompras', 'DELETE', `${url}/${idFactura}`, { motivo: 'Se subió la factura equivocada' })).status, 'quitar dos veces').toBe(404)
    expect((await subir('lidercompras', ctx.orden, 'factura_comercial')).status, 'la factura correcta se sube de nuevo').toBe(201)

    // la confirmación del proveedor no se adjunta mientras la orden espera aprobación
    const aerea = await api('lidercompras', 'POST', '/compras/orders', { provider_id: ctx.provider, modality: 'directo', shipping_type: 'aereo', who_pays_shipping: 'atlantic', shipping_cost: 50, lines: [{ catalog_product_id: ctx.product, quantity: 1, unit_cost: 10 }] })
    expect(aerea.body.status).toBe('por_aprobar')
    const bloqueada = await subir('lidercompras', aerea.body.id, 'confirmacion_proveedor')
    expect(bloqueada.status).toBe(422)
    expect(bloqueada.body.message).toMatch(/una vez la Orden de Compra haya sido aprobada/)
    expect((await subir('lidercompras', aerea.body.id, 'bl')).status, 'el resto de categorías sí se adjunta').toBe(201)
    expect((await subir('lidercompras', 99999999, 'bl')).status).toBe(404)
  })
})
