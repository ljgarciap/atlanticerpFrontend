import { test, expect } from '@playwright/test'
import { iniciarSesion, llamar, crearPedido, data, type Tokens, type Pedido } from './apoyo/venta-cobrada'

// Flujo ejecutable de Compras: pendientes de reposición (un faltante de Bodega pide existencias, se asigna proveedor, se compra y se recibe),
// proveedores y agencias de liquidación (catálogo: atlanticerp-backend/docs/flujos/compras-reposicion-proveedores.md). Por la API real y con
// la cuenta de cada rol; los proveedores y agencias que crea llevan «[FLUJO]» y no se pueden borrar. Correr con UN worker.

const ROLES = ['vendedor', 'gerencia', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'superadmin'] as const
const STAMP = String(Date.now())
let tokens: Tokens
let pedido: Pedido

type Fila = { catalog_product_id: number; faltante: number; stock: number; orders: { order_id: number; order_number: string; qty: number }[]; providers: { id: number; name: string }[] }
type Grupo = { provider: { id: number; name: string } | null; products: Fila[] }

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Compras: reposición, proveedores y agencias', () => {
  test.beforeAll(async ({ request }) => {
    tokens = await iniciarSesion(request, ROLES)
  })

  const api = (request: Parameters<typeof llamar>[0], rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, `/compras${path}`, payload)
  const reposicion = async (request: Parameters<typeof llamar>[0]) => (await api(request, 'lidercompras', 'GET', '/replenishment')).body as { groups: Grupo[]; custom_items_count: number; total_products: number }
  const fila = (r: { groups: Grupo[] }) => r.groups.flatMap(g => g.products.map(p => ({ g, p }))).find(x => x.p.catalog_product_id === pedido.prod)

  test('1. un faltante de Bodega aparece en «Pendientes de reposición» agrupado por proveedor', async ({ request }) => {
    pedido = await crearPedido(request, tokens, STAMP, undefined, 1) // el segundo producto del demo no trae proveedor
    const bodega = (rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, `/bodega${path}`, payload)
    const auxiliar = data((await llamar(request, tokens, 'superadmin', 'GET', '/users?search=auxiliarbodega')).body) as { id: number; email: string }[]
    expect((await bodega('asistentebodega', 'POST', `/orders/${pedido.pedido}/assign-picker`, { picker_id: auxiliar.find(u => u.email === 'auxiliarbodega@test.com')!.id })).status).toBe(200)
    expect((await bodega('auxiliarbodega', 'POST', `/orders/${pedido.pedido}/start-picking`)).status).toBe(200)
    const hoja = (await bodega('auxiliarbodega', 'GET', `/orders/${pedido.pedido}/picking-sheet`)).body.items as { id: number }[]
    // El auxiliar no encuentra nada: lo pedido queda como faltante «sin stock».
    expect((await bodega('auxiliarbodega', 'PATCH', `/orders/${pedido.pedido}/picking-sheet`, { items: [{ order_item_id: hoja[0].id, qty_picked: 0 }] })).status).toBe(200)
    const completo = await bodega('auxiliarbodega', 'POST', `/orders/${pedido.pedido}/complete-picking`, { items: [{ order_item_id: hoja[0].id, qty_picked: 0 }] })
    expect(completo.status).toBe(200)
    const revision = completo.body.review.id as number
    const items = (await bodega('asistentebodega', 'GET', `/orders/${revision}`)).body.items as { id: number }[]
    const res = await bodega('asistentebodega', 'POST', `/orders/${revision}/resolve-inventory-review`, { decisions: items.map(i => ({ order_item_id: i.id, found: false })) })
    expect(res.status).toBe(200)
    expect(res.body.review.order_type).toBe('faltante')

    const r = await reposicion(request)
    const hallado = fila(r)
    expect(hallado, 'el producto del faltante está pendiente de reposición').toBeTruthy()
    // Puede haber otros faltantes del mismo producto de corridas anteriores: se identifica el propio por su id.
    const propio = hallado!.p.orders.find(o => o.order_id === res.body.review.id)
    expect(propio, 'el faltante propio figura entre los pedidos que esperan el producto').toBeTruthy()
    expect(propio!.qty).toBe(pedido.unidades)
    expect(hallado!.p.faltante).toBeGreaterThanOrEqual(pedido.unidades)
    expect(hallado!.p.faltante, 'el faltante consolidado suma lo de todos los pedidos').toBe(hallado!.p.orders.reduce((n, o) => n + o.qty, 0))
    expect(r.total_products).toBe(r.groups.reduce((n, g) => n + g.products.length, 0))
    expect(typeof r.custom_items_count, 'los artículos libres se cuentan aparte, sin reponerse').toBe('number')

    for (const rol of ['vendedor', 'asistentebodega', 'contabilidad'] as const) {
      expect((await api(request, rol, 'GET', '/replenishment')).status, `${rol} no ve la reposición`).toBe(403)
    }
    expect((await api(request, 'gerencia', 'GET', '/replenishment')).status).toBe(200)
  })

  test('2. asignar el proveedor del producto: solo a productos pendientes y sin pisar a otra persona', async ({ request }) => {
    const ruta = `/replenishment/products/${pedido.prod}/provider`
    const proveedores = data((await api(request, 'lidercompras', 'GET', '/providers?per_page=50')).body) as { id: number; is_active: boolean }[]
    const activo = proveedores.find(p => p.is_active)!
    expect((await api(request, 'vendedor', 'PUT', ruta, { provider_id: activo.id })).status).toBe(403)
    expect((await api(request, 'lidercompras', 'PUT', ruta, {})).status, 'el proveedor es obligatorio').toBe(422)
    expect((await api(request, 'lidercompras', 'PUT', ruta, { provider_id: 99999999 })).status, 'proveedor inexistente').toBe(422)

    // Un producto que NO espera reposición no se cambia desde esta pantalla.
    const otro = (data((await llamar(request, tokens, 'vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=5')).body) as { id: number }[]).find(p => p.id !== pedido.prod)!
    const fuera = await api(request, 'lidercompras', 'PUT', `/replenishment/products/${otro.id}/provider`, { provider_id: activo.id })
    expect(fuera.status).toBe(403)
    expect(fuera.body.code).toBe('replenishment_scope')

    const antes = fila(await reposicion(request))!
    if (antes.g.provider === null) {
      expect(antes.p.providers, 'sin proveedor no hay alternativas').toHaveLength(0)
      expect((await api(request, 'lidercompras', 'PUT', ruta, { provider_id: activo.id })).status, 'sin proveedor: se asigna').toBe(200)
      expect(fila(await reposicion(request))!.g.provider?.id, 'el producto cambia de grupo').toBe(activo.id)
      // La misma petición repetida (corte de red) no cambia nada.
      expect((await api(request, 'lidercompras', 'PUT', ruta, { provider_id: activo.id })).status).toBe(200)
    }
    // Desde aquí el producto ya tiene proveedor (el de esta corrida o el que dejó una anterior).
    const actual = fila(await reposicion(request))!.g.provider!.id
    const otroProv = proveedores.find(p => p.id !== actual && p.is_active)!
    // Una vista vieja que aún cree que no hay proveedor no pisa al que ya existe.
    const choque = await api(request, 'lidercompras', 'PUT', ruta, { provider_id: otroProv.id })
    expect(choque.status).toBe(409)
    expect(choque.body.code).toBe('provider_changed')
    expect(fila(await reposicion(request))!.g.provider?.id, 'el proveedor no cambió').toBe(actual)
    // Corregir la elección hecha en esta misma pantalla sí se permite (indicando cuál era)…
    expect((await api(request, 'lidercompras', 'PUT', ruta, { provider_id: otroProv.id, expected_provider_id: actual })).status).toBe(200)
    expect(fila(await reposicion(request))!.g.provider?.id).toBe(otroProv.id)
    // …pero no si el «esperado» no lo dejó esta pantalla.
    expect((await api(request, 'lidercompras', 'PUT', ruta, { provider_id: actual, expected_provider_id: 99999999 })).status).toBe(403)
  })

  test('3. comprar y recibir lo que falta libera el faltante y la fila desaparece', async ({ request }) => {
    const grupo = fila(await reposicion(request))!
    const proveedor = grupo.g.provider?.id ?? (data((await api(request, 'lidercompras', 'GET', '/providers?per_page=5')).body) as { id: number }[])[0].id
    const oc = await api(request, 'lidercompras', 'POST', '/orders', { provider_id: proveedor, modality: 'directo', lines: [{ catalog_product_id: pedido.prod, quantity: grupo.p.faltante, unit_cost: 50 }] })
    expect(oc.status, JSON.stringify(oc.body).slice(0, 200)).toBe(201)
    for (let i = 0; i < 4; i++) expect((await api(request, 'lidercompras', 'PATCH', `/orders/${oc.body.id}/advance`)).status).toBe(200)
    expect(fila(await reposicion(request)), 'comprado pero no recibido: sigue pendiente').toBeTruthy()

    const ingreso = await api(request, 'lidercompras', 'POST', '/goods-receipts', { purchase_order_id: oc.body.id, lines: [{ catalog_product_id: pedido.prod, quantity: grupo.p.faltante, unit_cost: 50, warehouse_id: pedido.bodegaCentral }] })
    expect((await api(request, 'lidercompras', 'POST', `/goods-receipts/lines/${ingreso.body.lines[0].id}/confirm`)).status).toBe(200)
    expect((await api(request, 'lidercompras', 'PATCH', `/orders/${oc.body.id}/advance`)).status).toBe(200)

    expect(fila(await reposicion(request)), 'recibida la mercancía, el faltante se libera y ya no se repone').toBeUndefined()
  })

  test('4. proveedores: alta con validaciones, nombre único sin distinguir mayúsculas y permisos', async ({ request }) => {
    const nombre = `[FLUJO] Proveedor ${STAMP}`
    const base = { name: nombre, category: 'locales', country: 'Panamá', whatsapp: '+507 6000-0000' }
    expect((await api(request, 'vendedor', 'POST', '/providers', base)).status).toBe(403)
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, name: '' })).status, 'el nombre es obligatorio').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, category: 'inventada' })).status, 'la categoría sale del catálogo').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, whatsapp: undefined })).status, 'hace falta un medio de contacto').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, whatsapp: 'abc' })).status, 'formato de teléfono').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, currency: 'US' })).status, 'moneda de 3 letras').toBe(422)

    const alta = await api(request, 'lidercompras', 'POST', '/providers', base)
    expect(alta.status, JSON.stringify(alta.body).slice(0, 200)).toBe(201)
    expect(alta.body.origin, 'el origen se deriva de la categoría, no se envía').toBe('local')
    expect(alta.body.currency, 'moneda por defecto').toBe('USD')
    const id = alta.body.id as number
    expect((await api(request, 'lidercompras', 'POST', '/providers', { ...base, name: nombre.toUpperCase() })).status, 'el nombre es único sin distinguir mayúsculas').toBe(422)

    // Una categoría de otro origen deriva otro origen.
    const categorias = (await llamar(request, tokens, 'lidercompras', 'GET', '/catalogs/provider_category')).body as { key: string; props: { origen: string } }[]
    const exterior = categorias.find(c => c.props.origen !== 'local' && c.key)
    if (exterior) {
      const ext = await api(request, 'lidercompras', 'POST', '/providers', { ...base, name: `${nombre} Ext`, category: exterior.key })
      expect(ext.status, JSON.stringify(ext.body).slice(0, 160)).toBe(201)
      expect(ext.body.origin).toBe('internacional')
    }

    expect((await api(request, 'vendedor', 'PUT', `/providers/${id}`, { name: nombre, phone: '6000-0001' })).status).toBe(403)
    const upd = await api(request, 'lidercompras', 'PUT', `/providers/${id}`, { ...base, contact_name: 'Contacto Flujo' })
    expect(upd.status, JSON.stringify(upd.body).slice(0, 160)).toBe(200)
    const det = (await api(request, 'lidercompras', 'GET', `/providers/${id}`)).body
    expect(det.contact_name ?? det.data?.contact_name).toBe('Contacto Flujo')
    const lista = (await api(request, 'lidercompras', 'GET', `/providers?search=${encodeURIComponent(STAMP)}`)).body
    expect((lista.data as { id: number }[]).map(p => p.id)).toContain(id)
    expect((await api(request, 'lidercompras', 'GET', '/providers/99999999')).status).toBe(404)
  })

  test('5. agencias de liquidación: alta, situación de pago, contactos y su regla del último contacto', async ({ request }) => {
    const nombre = `[FLUJO] Agencia ${STAMP}`
    expect((await api(request, 'vendedor', 'POST', '/liquidation-agencies', { name: nombre })).status).toBe(403)
    expect((await api(request, 'lidercompras', 'POST', '/liquidation-agencies', {})).status, 'el nombre es obligatorio').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre, email: 'no-es-correo' })).status).toBe(422)
    const alta = await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre, contact_name: 'Contacto Flujo', phone: '6000-0002', email: 'agencia.flujo@example.test' })
    expect(alta.status, JSON.stringify(alta.body).slice(0, 200)).toBe(201)
    const id = alta.body.id as number
    const repetida = await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre })
    expect(repetida.status, 'Fase 29b: el nombre de agencia es único (sin distinguir mayúsculas)').toBe(422)
    expect((await api(request, 'lidercompras', 'POST', '/liquidation-agencies', { name: nombre.toUpperCase() })).status).toBe(422)

    expect((await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${id}`, { pending_payment_amount: -1, paid_amount: 0 })).status, 'montos no negativos').toBe(422)
    const pago = await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${id}`, { pending_payment_amount: 120.5, paid_amount: 30 })
    expect(pago.status).toBe(200)
    const det = (await api(request, 'lidercompras', 'GET', `/liquidation-agencies/${id}`)).body
    expect(JSON.stringify(det)).toContain('120.5')
    const resumen = (await api(request, 'lidercompras', 'GET', '/liquidation-agencies/summary')).body
    expect(resumen.kpis.total_pending_amount).toBeGreaterThanOrEqual(120.5)

    const c1 = await api(request, 'lidercompras', 'POST', `/liquidation-agencies/${id}/contacts`, { name: 'Segundo contacto', phone: '6000-0003' })
    expect(c1.status).toBe(201)
    expect((await api(request, 'lidercompras', 'POST', `/liquidation-agencies/${id}/contacts`, { name: '' })).status).toBe(422)
    expect((await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${id}/contacts/${c1.body.id}`, { name: 'Renombrado' })).status).toBe(200)
    expect((await api(request, 'lidercompras', 'PUT', `/liquidation-agencies/${id}/contacts/99999999`, { name: 'X' })).status).toBe(404)
    // El contacto principal (nombre, teléfono, correo de la agencia) NO es parte de la lista `contacts`: esa solo trae los que se agregan aparte.
    const detalle = (await api(request, 'lidercompras', 'GET', `/liquidation-agencies/${id}`)).body
    expect(detalle.contact_name).toBe('Contacto Flujo')
    expect((detalle.contacts as { id: number }[]).map(c => c.id)).toEqual([c1.body.id])
    const c2 = await api(request, 'lidercompras', 'POST', `/liquidation-agencies/${id}/contacts`, { name: 'Tercer contacto', email: 'tercero@example.test' })
    expect(c2.status).toBe(201)
    expect((await api(request, 'lidercompras', 'DELETE', `/liquidation-agencies/${id}/contacts/${c1.body.id}`)).status, 'con otro contacto en la lista se puede quitar').toBeLessThan(300)
    expect((await api(request, 'lidercompras', 'DELETE', `/liquidation-agencies/${id}/contacts/${c2.body.id}`)).status, 'el único contacto de la lista no se quita').toBe(422)
  })
})
