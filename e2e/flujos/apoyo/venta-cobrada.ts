import { expect, type APIRequestContext } from '@playwright/test'

// Apoyo de los flujos ejecutables: login por rol, llamadas a la API real y la cadena corta «cliente → cotización → pedido → entrega →
// factura completa → cobro confirmado» con datos propios («[FLUJO]»). Los specs anteriores traen su propia copia en línea; los nuevos
// usan este módulo.

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
export const API = `${BASE}/api`
export type Res = { status: number; body: any }
export const data = (b: any) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

/** Fecha de hoy (AAAA-MM-DD) en la zona de la empresa, no en UTC: pasadas las 19:00 en Panamá la fecha UTC ya es la de mañana. `E2E_TZ` la cambia. */
export const hoyDeLaEmpresa = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.E2E_TZ ?? 'America/Panama' }).format(new Date())

export type Tokens = Record<string, string>

let secuenciaRuc = 0
/** Identificación fiscal única por llamada (el tenant no admite dos clientes con la misma, Fase 17a): `155-<marca>-<n>` y DV `12`. */
export function rucUnico(): { tax_id: string; tax_id_dv: string } {
  secuenciaRuc += 1
  return { tax_id: `155-${String(Date.now()).slice(-7)}-${secuenciaRuc}${Math.floor(Math.random() * 90 + 10)}`, tax_id_dv: '12' }
}

export async function iniciarSesion(request: APIRequestContext, roles: readonly string[]): Promise<Tokens> {
  const tokens: Tokens = {}
  for (const rol of roles) {
    const email = `${rol}@test.com`
    const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
    expect(r.status(), `login de ${email}`).toBe(200)
    tokens[rol] = (await r.json()).token as string
  }
  return tokens
}

export async function llamar(request: APIRequestContext, tokens: Tokens, rol: string, method: string, path: string, payload?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(payload !== undefined ? { data: payload } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* cuerpo no JSON */ }
  return { status: r.status(), body }
}

export async function subirArchivo(request: APIRequestContext, tokens: Tokens, rol: string, path: string, campos: Record<string, string>): Promise<Res> {
  const r = await request.post(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { ...campos, file: { name: 'flujo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%flujo\n') } },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

export type Pedido = { masterClient: number; subClient: number; card: number; pedido: number; pedidoNumero: string; prod: number; bodegaCentral: number; clienteNombre: string; unidades: number }
export type VentaCobrada = Pedido & { invoiceId: number; monto: number }

export async function idDeUsuario(request: APIRequestContext, tokens: Tokens, rol: string): Promise<number> {
  const u = data((await llamar(request, tokens, 'superadmin', 'GET', `/users?search=${rol}`)).body) as { id: number; email: string }[]
  return u.find(x => x.email === `${rol}@test.com`)!.id
}

/**
 * Cliente → cotización → proyecto aprobado → pedido, con existencias suficientes en Bodega Central. Roles: vendedor, gerencia, lidercompras, liderbodega.
 * `fechaEntrega` (AAAA-MM-DD) es la fecha comprometida del pedido; por defecto, dentro de 20 días. `indiceProducto` elige el producto del catálogo; `architectId` pone un asociado en la cotización (genera comisión externa).
 */
export async function crearPedido(request: APIRequestContext, tokens: Tokens, etiqueta: string, fechaEntrega?: string, indiceProducto = 0, architectId?: number): Promise<Pedido> {
  const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, path, payload)
  const clienteNombre = `[FLUJO] Sub ${etiqueta} S.A.`
  const mc = await api('vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente ${etiqueta}` })
  const sc = await api('vendedor', 'POST', '/ventas-diseno/sub-clients', { master_client_id: mc.body.id, business_name: clienteNombre, ...rucUnico(), receptor_tipo: '01' })
  expect(sc.status).toBe(201)
  const ct = await api('vendedor', 'POST', `/ventas-diseno/sub-clients/${sc.body.id}/contacts`, { name: 'Contacto Flujo', role: 'client', email: 'contacto.flujo@example.test', phone: '6000-0000' })
  const card = await api('vendedor', 'POST', '/ventas-diseno/pipeline', { type: 'design', name: `[FLUJO] Proyecto ${etiqueta}`, sub_client_id: sc.body.id })
  expect(card.status).toBe(201)

  const prods = data((await api('vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=5')).body) as { id: number }[]
  const prod = prods[indiceProducto].id
  const q = await api('vendedor', 'POST', '/ventas-diseno/quotes', { from_pipeline_card_id: card.body.id })
  const parte = await api('vendedor', 'POST', `/ventas-diseno/quotes/${q.body.id}/parts`, { name: 'Única' })
  expect((await api('vendedor', 'POST', `/ventas-diseno/quotes/${q.body.id}/parts/${parte.body.id}/items`, { catalog_product_id: prod, quantity: 2 })).status).toBe(201)
  await api('vendedor', 'POST', `/ventas-diseno/quotes/${q.body.id}/contacts`, { sub_client_contact_id: ct.body.id })
  const fecha = fechaEntrega ?? new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
  const up = await api('vendedor', 'PUT', `/ventas-diseno/quotes/${q.body.id}`, { description: 'Cotización de flujo', delivery_type: 'single', delivery_dates: [fecha], price_type: 'project', ...(architectId ? { architect_id: architectId } : {}) })
  expect(up.status, JSON.stringify(up.body).slice(0, 200)).toBe(200)
  expect((await api('vendedor', 'POST', `/ventas-diseno/quotes/${q.body.id}/generate`)).status).toBe(200)
  expect((await api('vendedor', 'POST', `/ventas-diseno/quotes/${q.body.id}/confirm`)).status).toBe(200)
  const mover = (stage: string) => api('vendedor', 'PATCH', `/ventas-diseno/pipeline/${card.body.id}/stage`, { stage })
  await api('vendedor', 'PUT', `/ventas-diseno/pipeline/${card.body.id}`, { worked_area_m2: 80 })
  expect((await mover('proposal')).status).toBe(200)
  expect((await subirArchivo(request, tokens, 'vendedor', `/ventas-diseno/pipeline/${card.body.id}/files`, { type: 'signed_quote' })).status).toBe(201)
  expect((await subirArchivo(request, tokens, 'vendedor', `/ventas-diseno/pipeline/${card.body.id}/files`, { type: 'approval_proof' })).status).toBe(201)
  expect((await mover('approved')).status).toBe(200)
  expect((await api('gerencia', 'POST', `/ventas-diseno/pipeline/${card.body.id}/pass-to-order`)).status).toBe(200)

  const stock = (await api('lidercompras', 'GET', `/bodega/adjustment-requests/products/${prod}/warehouse-stock`)).body
  const central = (stock.warehouses as { name: string; warehouse_id: number; quantity: number }[]).find(w => w.name === 'Bodega Central')!
  if (central.quantity < 2) {
    const prov = data((await api('lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    const oc = await api('lidercompras', 'POST', '/compras/orders', { provider_id: prov[0].id, modality: 'directo', lines: [{ catalog_product_id: prod, quantity: 10, unit_cost: 50 }] })
    for (let i = 0; i < 4; i++) expect((await api('lidercompras', 'PATCH', `/compras/orders/${oc.body.id}/advance`)).status).toBe(200)
    const ingreso = await api('lidercompras', 'POST', '/compras/goods-receipts', { purchase_order_id: oc.body.id, lines: [{ catalog_product_id: prod, quantity: 10, unit_cost: 50, warehouse_id: central.warehouse_id }] })
    expect((await api('lidercompras', 'POST', `/compras/goods-receipts/lines/${ingreso.body.lines[0].id}/confirm`)).status).toBe(200)
    expect((await api('lidercompras', 'PATCH', `/compras/orders/${oc.body.id}/advance`)).status).toBe(200)
  }

  const lista = (await api('liderbodega', 'GET', `/bodega/orders?per_page=50&search=${encodeURIComponent(`[FLUJO] Proyecto ${etiqueta}`)}`)).body
  const pedido = (lista.cards as { id: number; order_type: string; order_number: string }[]).find(c => c.order_type === 'pedido')!
  return { masterClient: mc.body.id, subClient: sc.body.id, card: card.body.id, pedido: pedido.id, pedidoNumero: pedido.order_number, prod, bodegaCentral: central.warehouse_id, clienteNombre, unidades: 2 }
}

/** Picking, entrega firmada, factura completa y cobro por transferencia de un pedido ya creado. Roles: asistentebodega, auxiliarbodega, liderbodega, transporte, contabilidad, superadmin. */
export async function entregarYCobrar(request: APIRequestContext, tokens: Tokens, p: Pedido): Promise<VentaCobrada> {
  const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(request, tokens, rol, method, path, payload)
  const ids = { auxiliarbodega: await idDeUsuario(request, tokens, 'auxiliarbodega'), transporte: await idDeUsuario(request, tokens, 'transporte') }
  const pedido = { id: p.pedido }
  const central = { warehouse_id: p.bodegaCentral }
  const mc = { body: { id: p.masterClient } }
  expect((await api('asistentebodega', 'POST', `/bodega/orders/${pedido.id}/assign-picker`, { picker_id: ids.auxiliarbodega })).status).toBe(200)
  expect((await api('auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/start-picking`)).status).toBe(200)
  const hoja = (await api('auxiliarbodega', 'GET', `/bodega/orders/${pedido.id}/picking-sheet`)).body
  const item = (hoja.items as { id: number; qty_requested: number }[])[0]
  const cant = item.qty_requested
  expect((await api('auxiliarbodega', 'PATCH', `/bodega/orders/${pedido.id}/picking-sheet`, { items: [{ order_item_id: item.id, qty_picked: cant, allocations: [{ warehouse_id: central.warehouse_id, qty_picked: cant }] }] })).status).toBe(200)
  expect((await api('auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/complete-picking`, { items: [{ order_item_id: item.id, qty_picked: cant }] })).status).toBe(200)
  expect((await api('asistentebodega', 'POST', `/bodega/orders/${pedido.id}/register-delivery`, { items: [{ order_item_id: item.id, qty_delivered: cant }] })).status).toBe(200)
  expect((await api('liderbodega', 'POST', `/bodega/orders/${pedido.id}/assign-courier`, { courier_id: ids.transporte })).status).toBe(200)
  expect((await api('asistentebodega', 'POST', `/bodega/orders/${pedido.id}/dispatch`)).status).toBe(200)
  expect((await subirArchivo(request, tokens, 'transporte', `/bodega/orders/${pedido.id}/register-signed-guide`, { delivered_by_courier_id: String(ids.transporte), received_by_name: 'Recibe Flujo' })).status).toBe(200)

  const f = await api('contabilidad', 'POST', '/admin-contab/invoices', { order_ids: [pedido.id], modo: 'completo' })
  expect(f.status, JSON.stringify(f.body).slice(0, 200)).toBe(201)
  const factura = f.body.invoices[0]
  const monto = Number(factura.monto)
  let cuentas = (await api('contabilidad', 'GET', '/admin-contab/bank-accounts')).body as { id: number }[]
  if (!cuentas.length) cuentas = [(await api('contabilidad', 'POST', '/admin-contab/bank-accounts', { banco: '[FLUJO] Banco Demo', ultimos_4_digitos: '0001' })).body]
  const intento = await api('contabilidad', 'POST', '/admin-contab/payments/cobro', { master_client_id: mc.body.id, monto_recibido: monto, metodo_pago: 'transferencia', bank_account_id: cuentas[0].id, aplicaciones: [{ invoice_id: factura.id, monto }] })
  expect(intento.status).toBe(201)
  expect((await api('contabilidad', 'PUT', `/admin-contab/payments/${intento.body.id}/confirm`)).status).toBe(200)

  return { ...p, invoiceId: factura.id, monto }
}

/** Roles que la cadena usa: vendedor, gerencia, lidercompras, liderbodega, asistentebodega, auxiliarbodega, transporte, contabilidad, superadmin. */
export async function crearVentaCobrada(request: APIRequestContext, tokens: Tokens, etiqueta: string): Promise<VentaCobrada> {
  return entregarYCobrar(request, tokens, await crearPedido(request, tokens, etiqueta))
}
