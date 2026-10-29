import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable «venta a cobro» (catálogo: atlanticerp-backend/docs/flujos/cadena-venta-a-cobro.md).
// Recorre por la API real y con la cuenta de cada rol: cliente → cotización → pipeline y compuertas → pase a pedido → compra y
// existencias → picking, despacho y entrega → factura interna → cobro → saldo a favor. Cada paso verifica el ESTADO resultante, y
// los permisos cruzados (el rol incorrecto recibe 403). Crea sus propios datos con prefijo «[FLUJO]» y no toca el demo.
//
// Correr con UN worker (npm run e2e:flujos): nginx limita la API a 10 conexiones simultáneas y en paralelo responde 503 por diseño.
//
// Prerrequisitos del entorno local (ver docs/flujos/README.md):
//   - STORAGE_DRIVER=local en el .env del backend (subida de archivos del pipeline y guía firmada);
//   - php artisan cobros:v2 on (concepto nuevo de cobros);
//   - cuentas demo con contraseña = su correo; la cuenta bancaria la crea el propio flujo si no hay ninguna.

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
// `gerencia3` es el aprobador primario configurado en el demo (decide notas de crédito y anulaciones); `gerencia` no lo es.
const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'superadmin'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ids: Record<string, number> = {}
const ctx: Record<string, number | string> = {}
// «Hoy» según la zona de la empresa (por defecto Panamá), no la del servidor de pruebas: pasada la medianoche UTC son días distintos.
const hoyEmpresa = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.E2E_TENANT_TZ ?? 'America/Panama' })

const STAMP = String(Date.now())
const PDF = Buffer.from('%PDF-1.4\n%flujo\n')

type Res = { status: number; body: any }

async function login(request: APIRequestContext, rol: Rol): Promise<string> {
  const email = `${rol}@test.com`
  const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
  expect(r.status(), `login de ${email}`).toBe(200)
  return (await r.json()).token as string
}

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* cuerpo no JSON (PDF, etc.) */ }
  return { status: r.status(), body }
}

async function subir(request: APIRequestContext, rol: Rol, path: string, campos: Record<string, string>, campoArchivo = 'file'): Promise<Res> {
  const r = await request.post(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { ...campos, [campoArchivo]: { name: 'flujo.pdf', mimeType: 'application/pdf', buffer: PDF } },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const data = (b: any) => (b && typeof b === 'object' && 'data' in b ? b.data : b)
const redondear = (n: number) => Math.round(n * 100) / 100

test.describe.configure({ mode: 'serial' })

test.describe('Flujo venta a cobro', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) tokens[rol] = await login(request, rol)
    for (const rol of ['auxiliarbodega', 'transporte'] as const) {
      const u = data((await api(request, 'superadmin', 'GET', `/users?search=${rol}`)).body) as { id: number; email: string }[]
      ids[rol] = u.find(x => x.email === `${rol}@test.com`)!.id
    }
  })

  test('1. cliente, subcliente, contacto y tarjeta de pipeline', async ({ request }) => {
    const mc = await api(request, 'vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente ${STAMP}` })
    expect(mc.status).toBe(201)
    ctx.mc = mc.body.id

    const sinRuc = await api(request, 'vendedor', 'POST', '/ventas-diseno/sub-clients', { master_client_id: ctx.mc, business_name: `[FLUJO] Sub ${STAMP} S.A.` })
    expect(sinRuc.status, 'sin RUC o cédula no se crea').toBe(422)

    const sc = await api(request, 'vendedor', 'POST', '/ventas-diseno/sub-clients', { master_client_id: ctx.mc, business_name: `[FLUJO] Sub ${STAMP} S.A.`, tax_id: '155-123-4567', tax_id_dv: '12', receptor_tipo: '01' })
    expect(sc.status).toBe(201)
    ctx.sc = sc.body.id

    const rolInvalido = await api(request, 'vendedor', 'POST', `/ventas-diseno/sub-clients/${ctx.sc}/contacts`, { name: 'Contacto Flujo', role: 'otro-rol', email: 'contacto.flujo@example.test' })
    expect(rolInvalido.status).toBe(422)
    const ct = await api(request, 'vendedor', 'POST', `/ventas-diseno/sub-clients/${ctx.sc}/contacts`, { name: 'Contacto Flujo', role: 'client', email: 'contacto.flujo@example.test', phone: '6000-0000' })
    expect(ct.status).toBe(201)
    ctx.contacto = ct.body.id

    const card = await api(request, 'vendedor', 'POST', '/ventas-diseno/pipeline', { type: 'design', name: `[FLUJO] Proyecto ${STAMP}`, sub_client_id: ctx.sc })
    expect(card.status).toBe(201)
    expect(card.body.stage).toBe('design')
    ctx.card = card.body.id
    ctx.spId = card.body.sales_project.id
  })

  test('2. cotización: líneas, validación, folio, confirmación y PDF', async ({ request }) => {
    const prods = data((await api(request, 'vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=5')).body) as { id: number; price_full: number }[]
    expect(prods.length, 'el catálogo demo tiene productos').toBeGreaterThan(0)
    ctx.prod = prods[0].id

    const q = await api(request, 'vendedor', 'POST', '/ventas-diseno/quotes', { from_pipeline_card_id: ctx.card })
    expect(q.status).toBe(201)
    expect(q.body.document_status).toBe('draft')
    ctx.q = q.body.id

    const vacia = (await api(request, 'vendedor', 'GET', `/ventas-diseno/quotes/${ctx.q}/validate`)).body
    expect(vacia.valid).toBe(false)
    expect(vacia.missing.join('|')).toMatch(/Ítems/)

    const parte = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts`, { name: 'Planta baja' })
    expect(parte.status).toBe(201)
    const it1 = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts/${parte.body.id}/items`, { catalog_product_id: ctx.prod, quantity: 3 })
    expect(it1.status).toBe(201)
    const it2 = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts/${parte.body.id}/items`, { reference: 'CUSTOM-1', description: 'Pieza a medida', quantity: 2, unit_price: 120, cost: 70 })
    expect(it2.status).toBe(201)

    await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/contacts`, { sub_client_contact_id: ctx.contacto })
    const fecha = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    const up = await api(request, 'vendedor', 'PUT', `/ventas-diseno/quotes/${ctx.q}`, { description: 'Cotización de flujo', delivery_type: 'single', delivery_dates: [fecha], price_type: 'project' })
    expect(up.status).toBe(200)
    ctx.fecha = fecha

    expect((await api(request, 'vendedor', 'GET', `/ventas-diseno/quotes/${ctx.q}/validate`)).body).toMatchObject({ valid: true, missing: [] })

    const gen = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/generate`)
    expect(gen.status).toBe(200)
    expect(gen.body.folio).toMatch(/^COT-\d{4}-\d{4}$/)

    const conf = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/confirm`)
    expect(conf.status).toBe(200)
    expect(conf.body.document_status).toBe('sent')
    expect(conf.body.confirmed_at).toBeTruthy()

    const q2 = (await api(request, 'vendedor', 'GET', `/ventas-diseno/quotes/${ctx.q}`)).body
    const esperado = redondear(Number(q2.subtotal) + Number(q2.itbms))
    ctx.total = esperado

    const tarjeta = data((await api(request, 'vendedor', 'GET', `/ventas-diseno/pipeline/${ctx.card}`)).body)
    expect(tarjeta.stage, 'confirmar mueve la tarjeta a Cotización').toBe('quote')
    expect(Number(tarjeta.amount)).toBeCloseTo(esperado, 2)

    const pdf = await request.get(`${API}/ventas-diseno/quotes/${ctx.q}/pdf`, { headers: { Authorization: `Bearer ${tokens.vendedor}` } })
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
  })

  test('3. pipeline: compuertas, archivos y pase a pedido (solo Gerencia)', async ({ request }) => {
    const mover = (rol: Rol, stage: string) => api(request, rol, 'PATCH', `/ventas-diseno/pipeline/${ctx.card}/stage`, { stage })

    expect((await mover('vendedor', 'approved')).status, 'no se saltan etapas').toBe(422)
    expect((await mover('vendedor', 'proposal')).status, 'Propuesta exige los m² trabajados').toBe(422)
    expect((await api(request, 'vendedor', 'PUT', `/ventas-diseno/pipeline/${ctx.card}`, { worked_area_m2: 120 })).status).toBe(200)
    expect((await mover('vendedor', 'proposal')).status).toBe(200)

    const sinArchivos = await mover('vendedor', 'approved')
    expect(sinArchivos.status, 'Aprobado exige la cotización firmada').toBe(422)

    const firmada = await subir(request, 'vendedor', `/ventas-diseno/pipeline/${ctx.card}/files`, { type: 'signed_quote' })
    expect(firmada.status, 'la subida funciona (STORAGE_DRIVER=local en el entorno local)').toBe(201)
    expect((await subir(request, 'vendedor', `/ventas-diseno/pipeline/${ctx.card}/files`, { type: 'approval_proof' })).status).toBe(201)
    expect((await mover('vendedor', 'approved')).status).toBe(200)

    const url = (await api(request, 'vendedor', 'GET', `/ventas-diseno/pipeline/${ctx.card}/files/${firmada.body.id}/url`)).body.url as string
    expect((await request.get(url)).status(), 'URL firmada válida').toBe(200)
    expect((await request.get(url.split('signature=')[0] + 'signature=alterada')).status(), 'firma alterada').toBe(403)

    expect((await api(request, 'vendedor', 'POST', `/ventas-diseno/pipeline/${ctx.card}/pass-to-order`)).status, 'el vendedor no pasa a pedido').toBe(403)
    expect((await api(request, 'gerencia', 'POST', `/ventas-diseno/pipeline/${ctx.card}/pass-to-order`)).status).toBe(200)
    expect((await api(request, 'gerencia', 'POST', `/ventas-diseno/pipeline/${ctx.card}/pass-to-order`)).status, 'no se pasa dos veces').toBe(409)
  })

  test('4. compras: la orden recibida sube las existencias', async ({ request }) => {
    const stock = async () => {
      const r = (await api(request, 'lidercompras', 'GET', `/bodega/adjustment-requests/products/${ctx.prod}/warehouse-stock`)).body
      const central = (r.warehouses as { name: string; warehouse_id: number; quantity: number }[]).find(w => w.name === 'Bodega Central')!
      ctx.central = central.warehouse_id
      return central.quantity
    }
    const antes = await stock()

    const prov = data((await api(request, 'lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    const oc = await api(request, 'lidercompras', 'POST', '/compras/orders', { provider_id: prov[0].id, modality: 'directo', lines: [{ catalog_product_id: ctx.prod, quantity: 10, unit_cost: 50 }] })
    expect(oc.status).toBe(201)
    expect(oc.body.status).toBe('pendiente_liquidar')
    ctx.oc = oc.body.id

    const recorrido: string[] = [oc.body.status]
    for (let i = 0; i < 4; i++) {
      const r = await api(request, 'lidercompras', 'PATCH', `/compras/orders/${ctx.oc}/advance`)
      expect(r.status).toBe(200)
      recorrido.push(r.body.status)
    }
    expect(recorrido).toEqual(['pendiente_liquidar', 'ordenado', 'en_transito', 'en_aduana', 'en_transito_local'])
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${ctx.oc}/advance`)).status, 'no se recibe sin ingreso de mercancía').toBe(422)

    const ingreso = await api(request, 'lidercompras', 'POST', '/compras/goods-receipts', { purchase_order_id: ctx.oc, lines: [{ catalog_product_id: ctx.prod, quantity: 10, unit_cost: 50, warehouse_id: ctx.central }] })
    expect(ingreso.status).toBe(201)
    expect(await stock(), 'registrar el ingreso aún no mueve el stock').toBe(antes)
    expect((await api(request, 'lidercompras', 'POST', `/compras/goods-receipts/lines/${ingreso.body.lines[0].id}/confirm`)).status).toBe(200)
    expect(await stock(), 'confirmar la línea suma 10').toBe(antes + 10)
    const recibido = await api(request, 'lidercompras', 'PATCH', `/compras/orders/${ctx.oc}/advance`)
    expect(recibido.body.status).toBe('recibido')
  })

  test('5. bodega: del pedido asignado a la entrega firmada', async ({ request }) => {
    const buscar = async () => {
      const r = (await api(request, 'liderbodega', 'GET', `/bodega/orders?per_page=50&search=${encodeURIComponent(`[FLUJO] Proyecto ${STAMP}`)}`)).body
      return (r.cards as { id: number; stage: string; order_type: string }[])
    }
    const tarjetas = await buscar()
    const pedido = tarjetas.find(c => c.order_type === 'pedido')!
    expect(pedido, 'el pase a pedido creó la tarjeta').toBeTruthy()
    expect(pedido.stage).toBe('asignado')
    ctx.pedido = pedido.id
    const stage = async (id = pedido.id) => (await api(request, 'asistentebodega', 'GET', `/bodega/orders/${id}`)).body.stage

    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/assign-picker`, { picker_id: ids.auxiliarbodega })).status).toBe(200)
    expect(await stage()).toBe('picking_pendiente')
    expect((await api(request, 'transporte', 'POST', `/bodega/orders/${pedido.id}/start-picking`)).status, 'el transporte no arma pedidos').toBe(403)
    expect((await api(request, 'auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/start-picking`)).status).toBe(200)
    expect(await stage()).toBe('en_picking')

    const hoja = (await api(request, 'auxiliarbodega', 'GET', `/bodega/orders/${pedido.id}/picking-sheet`)).body
    const items = hoja.items as { id: number; reference: string; qty_requested: number }[]
    const conCatalogo = items.find(i => i.reference !== 'CUSTOM-1')!
    const libre = items.find(i => i.reference === 'CUSTOM-1')!

    const demas = await api(request, 'auxiliarbodega', 'PATCH', `/bodega/orders/${pedido.id}/picking-sheet`, { items: [{ order_item_id: conCatalogo.id, qty_picked: 9999, allocations: [{ warehouse_id: ctx.central, qty_picked: 9999 }] }] })
    expect(demas.status, 'no se alista más de lo que hay').toBe(422)

    const cantidad = conCatalogo.qty_requested
    expect((await api(request, 'auxiliarbodega', 'PATCH', `/bodega/orders/${pedido.id}/picking-sheet`, { items: [{ order_item_id: conCatalogo.id, qty_picked: cantidad, allocations: [{ warehouse_id: ctx.central, qty_picked: cantidad }] }, { order_item_id: libre.id, qty_picked: 0 }] })).status).toBe(200)
    const completo = await api(request, 'auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/complete-picking`, { items: [{ order_item_id: conCatalogo.id, qty_picked: cantidad }, { order_item_id: libre.id, qty_picked: 0 }] })
    expect(completo.status).toBe(200)
    expect(completo.body.order.stage).toBe('packing')
    const revision = completo.body.review.id as number

    const res = await api(request, 'asistentebodega', 'POST', `/bodega/orders/${revision}/resolve-inventory-review`, { decisions: [{ order_item_id: (await api(request, 'asistentebodega', 'GET', `/bodega/orders/${revision}`)).body.items[0].id, found: false }] })
    expect(res.status).toBe(200)
    expect(res.body.review.order_type, 'lo no encontrado queda como faltante').toBe('faltante')

    const reg = await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/register-delivery`, { items: [{ order_item_id: conCatalogo.id, qty_delivered: cantidad }, { order_item_id: libre.id, qty_delivered: 0, motivo: 'sin_stock' }] })
    expect(reg.status).toBe(200)
    expect(await stage()).toBe('por_despachar')

    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/assign-courier`, { courier_id: ids.transporte })).status, 'solo el jefe asigna repartidor').toBe(403)
    expect((await api(request, 'liderbodega', 'POST', `/bodega/orders/${pedido.id}/assign-courier`, { courier_id: ids.transporte })).status).toBe(200)
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/dispatch`)).status).toBe(200)
    expect(await stage()).toBe('despachado')

    const guia = await subir(request, 'transporte', `/bodega/orders/${pedido.id}/register-signed-guide`, { delivered_by_courier_id: String(ids.transporte), received_by_name: 'Recibe Flujo' })
    expect(guia.status).toBe(200)
    expect(await stage()).toBe('entregado')
    ctx.entregado = cantidad
    ctx.itemCatalogo = conCatalogo.id
  })

  test('6. factura interna: completa o solo lo entregado', async ({ request }) => {
    const preview = async (modo: string) => (await api(request, 'contabilidad', 'POST', '/admin-contab/invoices/preview', { order_ids: [ctx.pedido], modo })).body.results[0]
    const completa = await preview('completo')
    const entrega = await preview('entrega')
    expect(Number(completa.total)).toBeCloseTo(Number(ctx.total), 2)
    expect(completa.cierra_pedido).toBe(true)
    expect(entrega.tipo).toBe('parcial')
    expect(entrega.cierra_pedido).toBe(false)
    expect(entrega.items).toHaveLength(1)
    expect(Number(entrega.total), 'solo lo entregado, menos que la cotización').toBeLessThan(Number(ctx.total))
    expect(redondear(Number(entrega.total) + Number(entrega.restante_despues))).toBeCloseTo(Number(ctx.total), 2)

    const sinPermiso = await api(request, 'vendedor', 'POST', '/admin-contab/invoices', { order_ids: [ctx.pedido], modo: 'entrega' })
    expect(sinPermiso.status, 'el vendedor no factura').toBe(403)

    const f = await api(request, 'contabilidad', 'POST', '/admin-contab/invoices', { order_ids: [ctx.pedido], modo: 'entrega' })
    expect(f.status, JSON.stringify(f.body).slice(0, 200)).toBe(201)
    const factura = f.body.invoices[0]
    expect(factura.numero).toMatch(/^F-\d{4}$/)
    expect(factura.tipo).toBe('parcial')
    expect(Number(factura.monto)).toBeCloseTo(Number(entrega.total), 2)
    ctx.factura = factura.id
    ctx.montoFactura = Number(factura.monto)
  })

  test('7. cobro: aplicado a la factura, confirmado, y saldo a favor del excedente', async ({ request }) => {
    let cuentas = (await api(request, 'contabilidad', 'GET', '/admin-contab/bank-accounts')).body as { id: number }[]
    if (!cuentas.length) {
      const c = await api(request, 'contabilidad', 'POST', '/admin-contab/bank-accounts', { banco: '[FLUJO] Banco Demo', ultimos_4_digitos: '0001' })
      expect(c.status).toBe(201)
      cuentas = [c.body]
    }
    const banco = cuentas[0].id
    ctx.banco = banco

    const abiertas = async () => (await api(request, 'contabilidad', 'GET', `/admin-contab/payments/open-invoices?master_client_id=${ctx.mc}`)).body
    expect((await abiertas()).invoices.map((i: { id: number }) => i.id)).toContain(ctx.factura)

    const intento = await api(request, 'contabilidad', 'POST', '/admin-contab/payments/cobro', { master_client_id: ctx.mc, monto_recibido: ctx.montoFactura, metodo_pago: 'transferencia', bank_account_id: banco, aplicaciones: [{ invoice_id: ctx.factura, monto: ctx.montoFactura }] })
    test.skip(intento.status === 422 && /todavía no está activo/.test(JSON.stringify(intento.body)), 'Falta encender el concepto nuevo de cobros: php artisan cobros:v2 on')
    expect(intento.status).toBe(201)
    ctx.cobro = intento.body.id
    expect(intento.body.estado).toBe('esperando_confirmacion')
    expect(Number(intento.body.total_facturas)).toBeCloseTo(Number(ctx.montoFactura), 2)

    const conf = await api(request, 'contabilidad', 'PUT', `/admin-contab/payments/${intento.body.id}/confirm`)
    expect(conf.status).toBe(200)
    expect(conf.body.estado).toBe('confirmado')
    expect((await abiertas()).invoices, 'la factura queda saldada').toEqual([])

    const extra = 50
    const aCuenta = await api(request, 'contabilidad', 'POST', '/admin-contab/payments/cobro', { master_client_id: ctx.mc, monto_recibido: extra, metodo_pago: 'transferencia', bank_account_id: banco })
    expect(aCuenta.status).toBe(201)
    expect(Number(aCuenta.body.saldo_sin_aplicar)).toBe(extra)
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/payments/${aCuenta.body.id}/confirm`)).status).toBe(200)

    const saldo = (await api(request, 'contabilidad', 'GET', '/admin-contab/saldo-favor')).body
    const fila = (saldo.rows as { master_client_id: number; saldo_disponible?: number }[]).find(r => r.master_client_id === ctx.mc)
    expect(fila, 'el excedente aparece como saldo a favor del cliente').toBeTruthy()
  })

  test('7b. devolución de un cliente: recepción en bodega acotada a lo entregado y nota de crédito vinculada', async ({ request }) => {
    const lineaDev = [{ order_item_id: ctx.itemCatalogo, qty_requested: 1, reason: 'danado_defectuoso' }]
    const base = { order_id: ctx.pedido, contact_name: 'Contacto Flujo', contact_phone: '6000-0000', items: lineaDev }

    expect((await api(request, 'vendedor', 'POST', '/bodega/returns', base)).status, 'el vendedor no registra devoluciones').toBe(403)
    expect((await api(request, 'asistentebodega', 'POST', '/bodega/returns', { ...base, items: [{ ...lineaDev[0], qty_requested: Number(ctx.entregado) + 1 }] })).status, 'no más de lo entregado').toBe(422)
    expect((await api(request, 'asistentebodega', 'POST', '/bodega/returns', { ...base, items: [{ ...lineaDev[0], reason: 'otro' }] })).status, 'motivo del catálogo').toBe(422)
    const dev = await api(request, 'asistentebodega', 'POST', '/bodega/returns', base)
    expect(dev.status).toBe(201)
    expect(dev.body.return_number).toMatch(/^DEV-\d{4}-\d{4}$/)
    const id = dev.body.id as number
    const lineaId = (await api(request, 'asistentebodega', 'GET', `/bodega/returns/${id}`)).body.products[0].id as number

    const enCentral = async () => {
      const r = (await api(request, 'asistentebodega', 'GET', `/bodega/adjustment-requests/products/${ctx.prod}/warehouse-stock`)).body
      return (r.warehouses as { warehouse_id: number; quantity: number }[]).find(w => w.warehouse_id === ctx.central)!.quantity
    }
    const recibir = (qty: number) => api(request, 'asistentebodega', 'POST', `/bodega/returns/${id}/confirm-reception`, { destination_warehouse_id: ctx.central, lines: [{ customer_return_line_id: lineaId, qty_received: qty }] })

    expect((await recibir(1)).status, 'sin documento firmado no se recibe').toBe(422)
    expect((await subir(request, 'asistentebodega', `/bodega/returns/${id}/signed-document`, {})).status).toBe(200)
    const antes = await enCentral()
    expect((await recibir(Number(ctx.entregado) + 1)).status, 'no se recibe más de lo entregado').toBe(422)
    expect(await enCentral(), 'el stock no cambió').toBe(antes)
    expect((await api(request, 'asistentebodega', 'GET', `/bodega/returns/${id}`)).body.status).toBe('pendiente')

    const ok = await recibir(1)
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('esperando_nota_credito')
    expect(await enCentral(), 'la mercancía devuelta vuelve al almacén').toBe(antes + 1)
    expect((await recibir(1)).status, 'una devolución se resuelve una sola vez').toBe(422)

    // la nota de crédito de devolución de mercancía se vincula a la devolución y la finaliza
    const nota = await subir(request, 'contabilidad', '/admin-contab/notas-credito', {
      master_client_id: String(ctx.mc), cliente: `[FLUJO] Cliente ${STAMP}`, factura_origen_id: String(ctx.factura), motivo: 'Devolución de mercancía',
      tipo: 'devolucion_mercancia', monto: '10', resultado: 'saldo_favor', mercancia_regresa_bodega: '1', devolucion_bodega_id: String(id),
    }, 'comprobante')
    expect(nota.status, JSON.stringify(nota.body).slice(0, 200)).toBe(201)
    const final = (await api(request, 'asistentebodega', 'GET', `/bodega/returns/${id}`)).body
    expect(final.status).toBe('finalizado')
    expect(final.credit_note_id).toBe(nota.body.id)
    ctx.acreditadoPorDevolucion = 10
    ctx.ncDevolucion = nota.body.id
  })

  test('8. notas de crédito: reglas de captura y aplicación inmediata bajo el umbral', async ({ request }) => {
    const nota = (campos: Record<string, string>) => subir(request, 'contabilidad', '/admin-contab/notas-credito', {
      master_client_id: String(ctx.mc), cliente: `[FLUJO] Cliente ${STAMP}`, factura_origen_id: String(ctx.factura), motivo: 'Nota de flujo', ...campos,
    }, 'comprobante')

    expect((await nota({ tipo: 'descuento_comercial', monto: '10' })).status, 'falta el resultado del excedente').toBe(422)
    expect((await nota({ tipo: 'descuento_comercial', monto: '10', resultado: 'devuelto' })).status, 'devolver dinero exige la cuenta de salida').toBe(422)
    expect((await nota({ tipo: 'descuento_comercial', monto: String(Number(ctx.montoFactura) + 100), resultado: 'saldo_favor' })).status, 'no se acredita más que la factura').toBe(422)

    const sinComprobante = await api(request, 'contabilidad', 'POST', '/admin-contab/notas-credito', { master_client_id: ctx.mc, cliente: 'x', factura_origen_id: ctx.factura, tipo: 'descuento_comercial', monto: 10, motivo: 'x', resultado: 'saldo_favor' })
    expect(sinComprobante.status, 'el comprobante es obligatorio').toBe(422)

    const ok = await nota({ tipo: 'descuento_comercial', monto: '10', resultado: 'saldo_favor' })
    expect(ok.status).toBe(201)
    expect(ok.body.numero).toMatch(/^NC-\d{4}$/)
    expect(ok.body.estado, 'por debajo del umbral se aplica sola').toBe('aplicada')
    expect(redondear(Number(ok.body.subtotal) + Number(ok.body.itbms))).toBeCloseTo(10, 2)
    ctx.ncDescuento = ok.body.id
  })

  test('9. anulación completa: siempre pendiente; solo el aprobador configurado decide', async ({ request }) => {
    const anulacion = await subir(request, 'contabilidad', '/admin-contab/notas-credito', {
      master_client_id: String(ctx.mc), cliente: `[FLUJO] Cliente ${STAMP}`, factura_origen_id: String(ctx.factura), motivo: 'Anulación de flujo',
      tipo: 'anulacion_completa', subtipo_anulacion: 'cancelado', monto: '0.01', resultado: 'saldo_favor',
    }, 'comprobante')
    expect(anulacion.status).toBe(201)
    expect(anulacion.body.estado, 'cualquier anulación completa espera la decisión del aprobador').toBe('pendiente_aprobacion')
    expect(Number(anulacion.body.monto), 'el monto enviado se ignora: se acredita lo que falta').toBeCloseTo(Number(ctx.montoFactura) - 10 - Number(ctx.acreditadoPorDevolucion), 2)
    const id = anulacion.body.id as number
    ctx.ncAnulacion = id

    for (const rol of ['contabilidad', 'gerencia'] as const) {
      expect((await api(request, rol, 'PUT', `/admin-contab/notas-credito/${id}/decision`, { approve: true })).status, `${rol} no es el aprobador`).toBe(403)
    }
    expect((await api(request, 'gerencia3', 'PUT', `/admin-contab/notas-credito/${id}/decision`, { approve: false })).status, 'rechazar exige motivo').toBe(422)
    const aprobada = await api(request, 'gerencia3', 'PUT', `/admin-contab/notas-credito/${id}/decision`, { approve: true })
    expect(aprobada.status).toBe(200)
    expect(aprobada.body.estado).not.toBe('pendiente_aprobacion')
    expect((await api(request, 'gerencia3', 'PUT', `/admin-contab/notas-credito/${id}/decision`, { approve: true })).status, 'no se decide dos veces').toBe(422)
  })

  test('10. anular un cobro: solicitud, decisión del aprobador y la factura se reabre', async ({ request }) => {
    expect((await api(request, 'contabilidad', 'POST', `/admin-contab/payments/${ctx.cobro}/anular`, {})).status, 'la anulación exige motivo').toBe(422)
    const solicitud = await api(request, 'contabilidad', 'POST', `/admin-contab/payments/${ctx.cobro}/anular`, { motivo: 'Cobro duplicado de flujo' })
    expect(solicitud.status).toBe(201)
    expect(solicitud.body.estado).toBe('solicitada')
    const id = solicitud.body.id as number

    const cobroAntes = (await api(request, 'contabilidad', 'GET', `/admin-contab/payments/${ctx.cobro}`)).body
    expect(cobroAntes.estado, 'solicitar no cambia el cobro').toBe('confirmado')

    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/reversal-requests/${id}/decision`, { aprobar: true })).status).toBe(403)
    expect((await api(request, 'gerencia3', 'PUT', `/admin-contab/reversal-requests/${id}/decision`, { aprobar: false })).status, 'rechazar exige motivo').toBe(422)
    const ejecutada = await api(request, 'gerencia3', 'PUT', `/admin-contab/reversal-requests/${id}/decision`, { aprobar: true })
    expect(ejecutada.status).toBe(200)
    expect(ejecutada.body.estado).toBe('ejecutada')

    const cobro = (await api(request, 'contabilidad', 'GET', `/admin-contab/payments/${ctx.cobro}`)).body
    expect(cobro.estado).toBe('anulado')
    const abiertas = (await api(request, 'contabilidad', 'GET', `/admin-contab/payments/open-invoices?master_client_id=${ctx.mc}`)).body
    const factura = (abiertas.invoices as { id: number; saldo_pendiente: number }[]).find(i => i.id === ctx.factura)
    expect(factura, 'la factura vuelve a estar abierta').toBeTruthy()
    expect(Number(factura!.saldo_pendiente)).toBeCloseTo(Number(ctx.montoFactura), 2)
    expect(Number(abiertas.credit_balance), 'las notas de crédito quedan como saldo a favor para compensar').toBeGreaterThan(0)
  })

  test('11. compensación: el saldo a favor de las notas de crédito salda la factura, y se puede reversar', async ({ request }) => {
    const abiertas = async () => ((await api(request, 'contabilidad', 'GET', `/admin-contab/payments/open-invoices?master_client_id=${ctx.mc}`)).body.invoices as { id: number; saldo_pendiente: number }[])
    const restante = Number(ctx.montoFactura) - 20
    const lineas = [
      { source_type: 'nota_credito', source_id: ctx.ncAnulacion, invoice_id: ctx.factura, monto: restante },
      { source_type: 'nota_credito', source_id: ctx.ncDescuento, invoice_id: ctx.factura, monto: 10 },
      { source_type: 'nota_credito', source_id: ctx.ncDevolucion, invoice_id: ctx.factura, monto: 10 },
    ]
    const cuerpo = { master_client_id: ctx.mc, lines: lineas }
    expect((await abiertas()).map(f => f.id), 'tras anular el cobro la factura está abierta').toContain(ctx.factura)

    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/compensaciones/preview', { master_client_id: ctx.mc, lines: [{ ...lineas[0], monto: restante + 100 }] })).status, 'no se usa más de lo disponible de una fuente').toBe(422)
    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/compensaciones/preview', { master_client_id: 1, lines: [lineas[0]] })).status, 'la fuente debe ser del cliente').toBe(422)
    const vista = await api(request, 'contabilidad', 'POST', '/admin-contab/compensaciones/preview', cuerpo)
    expect(vista.status).toBe(200)
    expect(Number(vista.body.total_aplicado)).toBeCloseTo(Number(ctx.montoFactura), 2)
    expect(Number(vista.body.facturas[0].pendiente_despues)).toBeCloseTo(0, 2)

    expect((await api(request, 'vendedor', 'POST', '/admin-contab/compensaciones', cuerpo)).status).toBe(403)
    const ok = await api(request, 'contabilidad', 'POST', '/admin-contab/compensaciones', cuerpo)
    expect(ok.status).toBe(201)
    expect(ok.body.estado).toBe('confirmado')
    expect((await abiertas()).map(f => f.id), 'la factura queda saldada').not.toContain(ctx.factura)
    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/compensaciones', cuerpo)).status, 'las fuentes ya no tienen saldo').toBe(422)

    const id = ok.body.id as number
    expect((await api(request, 'contabilidad', 'POST', `/admin-contab/compensaciones/${id}/reverse`, {})).status, 'reversar exige motivo').toBe(422)
    // Fase 13 (2.3): el reverso reabre deuda, así que se SOLICITA y lo decide el aprobador (como la anulación de un cobro).
    const solicitud = await api(request, 'contabilidad', 'POST', `/admin-contab/compensaciones/${id}/reverse`, { motivo: 'Compensación de prueba' })
    expect(solicitud.status).toBe(201)
    expect(solicitud.body.tipo).toBe('reverso_compensacion')
    expect((await abiertas()).map(f => f.id), 'solicitar no reabre nada todavía').not.toContain(ctx.factura)
    expect((await api(request, 'contabilidad', 'POST', `/admin-contab/compensaciones/${id}/reverse`, { motivo: 'otra vez' })).status, 'ya hay una solicitud pendiente').toBe(422)
    const decision = `/admin-contab/reversal-requests/${solicitud.body.id}/decision`
    expect((await api(request, 'gerencia', 'PUT', decision, { aprobar: true })).status, 'otra cuenta de Gerencia no decide').toBe(403)
    expect((await api(request, 'gerencia3', 'PUT', decision, { aprobar: true })).body.estado).toBe('ejecutada')
    expect((await abiertas()).map(f => f.id), 'la factura se reabre').toContain(ctx.factura)
    expect((await api(request, 'contabilidad', 'POST', `/admin-contab/compensaciones/${id}/reverse`, { motivo: 'ya reversada' })).status).toBe(422)
  })

  test('12. incobrable: se propone con motivo y solo lo decide el aprobador', async ({ request }) => {
    const ruta = `/admin-contab/invoices/${ctx.pedido}`
    expect((await api(request, 'contabilidad', 'POST', `${ruta}/mark-uncollectible`, {})).status, 'exige motivo').toBe(422)
    expect((await api(request, 'vendedor', 'POST', `${ruta}/mark-uncollectible`, { motivo: 'x' })).status).toBe(403)
    expect((await api(request, 'contabilidad', 'POST', `${ruta}/mark-uncollectible`, { motivo: 'Cliente en quiebra' })).status).toBe(200)
    expect((await api(request, 'contabilidad', 'GET', `${ruta}/detail`)).body.motivo_incobrable).toBe('Cliente en quiebra')

    for (const rol of ['contabilidad', 'gerencia'] as const) {
      expect((await api(request, rol, 'PUT', `${ruta}/uncollectible-decision`, { approve: true })).status, `${rol} no es el aprobador`).toBe(403)
    }
    expect((await api(request, 'gerencia3', 'PUT', `${ruta}/uncollectible-decision`, { approve: true })).status).toBe(200)
    const abiertas = (await api(request, 'contabilidad', 'GET', `/admin-contab/payments/open-invoices?master_client_id=${ctx.mc}`)).body.invoices as { id: number }[]
    expect(abiertas.map(f => f.id), 'una factura incobrable sale de las abiertas').not.toContain(ctx.factura)
    expect((await api(request, 'gerencia3', 'PUT', `${ruta}/uncollectible-decision`, { approve: true })).status, 'no hay propuesta pendiente').toBe(422)
  })

  test('13. los abonos heredados ya no se aceptan: se registran como cobros', async ({ request }) => {
    const r = await subir(request, 'contabilidad', '/admin-contab/abonos', {
      master_client_id: String(ctx.mc), monto_original: '100', metodo_pago: 'transferencia', cuenta_bancaria_id: String(ctx.banco), referencia: 'ABONO-FLUJO',
    }, 'comprobante')
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body)).toMatch(/se registran ahora como cobros/)
  })

  test('14. caja chica: gasto con foto, un solo reporte por gasto y aprobación del aprobador', async ({ request }) => {
    const usuarios = (await api(request, 'superadmin', 'GET', '/users?search=vendedor')).body
    const solicitante = ((usuarios.data ?? usuarios) as { id: number; email: string }[]).find(u => u.email === 'vendedor@test.com')!.id
    const gasto = (foto: boolean) => request.post(`${API}/admin-contab/petty-cash/expenses`, {
      headers: { Authorization: `Bearer ${tokens.contabilidad}`, Accept: 'application/json' },
      multipart: {
        'lineas[0][fecha]': hoyEmpresa(), 'lineas[0][solicitante_id]': String(solicitante), 'lineas[0][proveedor]': 'Ferretería Flujo',
        'lineas[0][descripcion]': 'Tornillos', 'lineas[0][monto_bruto]': '20', 'lineas[0][itbms]': '1.4',
        ...(foto ? { 'lineas[0][foto]': { name: 'factura.pdf', mimeType: 'application/pdf', buffer: PDF } } : {}),
      },
    })
    expect((await gasto(false)).status(), 'la foto del comprobante es obligatoria').toBe(422)
    const creado = await gasto(true)
    expect(creado.status()).toBe(201)
    const gastoId = ((await creado.json()).created as number[])[0]

    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/petty-cash/reports', { expense_ids: [gastoId] })).status, 'la forma de pago es obligatoria').toBe(422)
    const reporte = await api(request, 'contabilidad', 'POST', '/admin-contab/petty-cash/reports', { expense_ids: [gastoId], forma_pago: 'efectivo' })
    expect(reporte.status).toBe(201)
    const numero = reporte.body.numero as string
    expect(numero).toMatch(/^\d{4}-\d{4}$/)
    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/petty-cash/reports', { expense_ids: [gastoId], forma_pago: 'efectivo' })).status, 'un gasto va a un solo reporte').toBe(409)

    for (const rol of ['contabilidad', 'gerencia'] as const) {
      expect((await api(request, rol, 'PUT', `/admin-contab/petty-cash/reports/${numero}/approve`)).status, `${rol} no es el aprobador`).toBe(403)
    }
    expect((await api(request, 'gerencia3', 'PUT', `/admin-contab/petty-cash/reports/${numero}/reject`, {})).status, 'rechazar exige motivo').toBe(422)
    const ok = await api(request, 'gerencia3', 'PUT', `/admin-contab/petty-cash/reports/${numero}/approve`)
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('finalizado')
    expect((await api(request, 'gerencia3', 'PUT', `/admin-contab/petty-cash/reports/${numero}/approve`)).status, 'no se aprueba dos veces').toBe(409)
  })

  test('15. arqueo diario: se cierra una vez al día, queda inmutable y lo aprueba el aprobador', async ({ request }) => {
    const hoy = () => api(request, 'contabilidad', 'GET', '/admin-contab/cash-position/daily-count')
    let arqueo = (await hoy()).body
    expect(arqueo.fecha).toBe(hoyEmpresa())
    const mov = arqueo.cobros[0] as { movement_id: number }

    expect((await api(request, 'vendedor', 'PUT', '/admin-contab/cash-position/daily-count/entries', { movement_type: 'payment', movement_id: mov.movement_id, observacion: 'x' })).status).toBe(403)
    if (arqueo.estado === 'abierto') {
      // primera corrida del día: se anota, se cierra y queda pendiente de aprobación
      expect((await api(request, 'contabilidad', 'PUT', '/admin-contab/cash-position/daily-count/entries', { movement_type: 'payment', movement_id: mov.movement_id, observacion: 'Verificado' })).status).toBe(204)
      expect((await api(request, 'contabilidad', 'PUT', '/admin-contab/cash-position/daily-count/general-observation', { observacion: 'Cuadre del día' })).status).toBe(204)
      const cierre = await api(request, 'contabilidad', 'POST', '/admin-contab/cash-position/daily-count/close', {})
      expect(cierre.status).toBe(200)
      expect(cierre.body.estado).toBe('pendiente_aprobacion')
      arqueo = (await hoy()).body
    }
    expect(arqueo.estado, 'el arqueo de hoy ya no está abierto').not.toBe('abierto')
    expect((await api(request, 'contabilidad', 'POST', '/admin-contab/cash-position/daily-count/close', {})).status, 'se cierra una sola vez').toBe(409)
    expect((await api(request, 'contabilidad', 'PUT', '/admin-contab/cash-position/daily-count/entries', { movement_type: 'payment', movement_id: mov.movement_id, observacion: 'cambio' })).status, 'cerrado no se edita').toBe(422)
    expect(Number(arqueo.total_cobrado) - Number(arqueo.total_notas_credito) - Number(arqueo.total_reversos), 'el neto = cobrado − notas − reversos').toBeCloseTo(Number(arqueo.total_neto), 2)

    const id = arqueo.id as number
    for (const rol of ['contabilidad', 'gerencia'] as const) {
      expect((await api(request, rol, 'POST', `/admin-contab/cash-position/history/${id}/approve`)).status, `${rol} no es el aprobador`).toBe(403)
    }
    const aprobado = await api(request, 'gerencia3', 'POST', `/admin-contab/cash-position/history/${id}/approve`)
    expect([200, 409], 'aprobado ahora o en una corrida anterior del día').toContain(aprobado.status)
    expect((await api(request, 'contabilidad', 'GET', `/admin-contab/cash-position/history/${id}`)).body.estado).toBe('aprobado')
  })
})
