import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de Compras (catálogo: atlanticerp-backend/docs/flujos/compras-ordenes.md): aprobación de órdenes por tipo de envío,
// pagos a proveedor, cambio de monto y reclamos. Por la API real y con la cuenta de cada rol; crea sus propios datos.
// Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
// `gerencia3` es el aprobador primario configurado en el demo; `gerencia` no lo es.
const ROLES = ['lidercompras', 'gerencia', 'gerencia3', 'vendedor'] as const
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

async function pagar(request: APIRequestContext, rol: Rol, orderId: number, amount: number): Promise<Res> {
  const r = await request.post(`${API}/compras/orders/${orderId}/payments`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { amount: String(amount), proof: { name: 'pago.pdf', mimeType: 'application/pdf', buffer: PDF } },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const data = (b: any) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Compras', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
    const prov = data((await api(request, 'lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    ctx.provider = prov[0].id
    const prods = data((await api(request, 'lidercompras', 'GET', '/compras/inventory?per_page=5')).body) as { id: number }[]
    ctx.product = prods[0].id
  })

  const crearOrden = (request: APIRequestContext, extra: Record<string, unknown> = {}, cantidad = 5, costo = 20) =>
    api(request, 'lidercompras', 'POST', '/compras/orders', { provider_id: ctx.provider, modality: 'directo', lines: [{ catalog_product_id: ctx.product, quantity: cantidad, unit_cost: costo }], ...extra })

  test('1. aprobación: depende del envío, no del monto; solo decide el aprobador configurado', async ({ request }) => {
    const grande = await crearOrden(request, {}, 200, 40)
    expect(grande.status).toBe(201)
    expect(Number(grande.body.total_amount)).toBe(8000)
    expect(grande.body.status, 'un monto alto no exige aprobación').toBe('pendiente_liquidar')

    const clientePaga = await crearOrden(request, { shipping_type: 'aereo', who_pays_shipping: 'cliente', shipping_cost: 120 })
    expect(clientePaga.body.status, 'aéreo pagado por el cliente tampoco').toBe('pendiente_liquidar')

    const aerea = await crearOrden(request, { shipping_type: 'aereo', who_pays_shipping: 'atlantic', shipping_cost: 120 })
    expect(aerea.status).toBe(201)
    expect(aerea.body.status, 'aéreo pagado por la empresa espera aprobación').toBe('por_aprobar')
    expect(aerea.body.requires_primary_approval).toBe(true)
    const id = aerea.body.id as number
    ctx.aerea = id

    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/advance`)).status, 'no avanza sin aprobar').toBe(422)
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/approve`)).status, 'compras no aprueba').toBe(403)
    expect((await api(request, 'gerencia', 'PATCH', `/compras/orders/${id}/approve`)).status, 'otra cuenta de Gerencia no es el aprobador').toBe(403)
    expect((await api(request, 'gerencia3', 'PATCH', `/compras/orders/${id}/approve`)).status).toBe(200)

    const adv = await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/advance`)
    expect(adv.status).toBe(200)
    expect(adv.body.status).toBe('pendiente_liquidar')
  })

  test('2. pagos a proveedor: tope = total + envío, estado parcial y liquidación solo de Zona Libre', async ({ request }) => {
    const id = ctx.aerea
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/liquidate`)).status, 'liquidar es solo de Zona Libre').toBe(422)
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/request-payment`)).status).toBe(200)

    const orden = (await api(request, 'lidercompras', 'GET', `/compras/orders/${id}`)).body
    const pagable = Number(orden.total_amount) + 120
    const exceso = await pagar(request, 'lidercompras', id, pagable + 1)
    expect(exceso.status, 'no se paga más que total + envío').toBe(422)
    expect(JSON.stringify(exceso.body)).toContain(pagable.toFixed(2))

    expect((await pagar(request, 'lidercompras', id, 8)).status).toBe(201)
    expect((await api(request, 'lidercompras', 'GET', `/compras/orders/${id}`)).body.payment_status).toBe('parcial')
    const pagos = data((await api(request, 'lidercompras', 'GET', `/compras/orders/${id}/payments`)).body) as { amount: number; proof_url: string }[]
    expect(pagos).toHaveLength(1)
    expect(pagos[0].proof_url, 'el comprobante se descarga con URL firmada').toContain('signature=')
  })

  test('3. cambio de monto: lo pide Compras, lo aprueba el aprobador y se bloquea con pagos', async ({ request }) => {
    const sinPagos = await crearOrden(request)
    const id = sinPagos.body.id as number
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/request-amount-change`, { new_amount: 0 })).status).toBe(422)
    const pedido = await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/request-amount-change`, { new_amount: 120 })
    expect(pedido.status).toBe(200)
    expect(Number(pedido.body.pending_amount_change)).toBe(120)
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/approve-amount-change`)).status, 'solo el aprobador').toBe(403)
    const ok = await api(request, 'gerencia3', 'PATCH', `/compras/orders/${id}/approve-amount-change`)
    expect(ok.status).toBe(200)
    expect(Number(ok.body.total_amount)).toBe(120)

    // con un pago registrado el monto ya no se puede cambiar
    expect((await pagar(request, 'lidercompras', ctx.aerea, 1)).status).toBe(201)
    const bloqueado = await api(request, 'lidercompras', 'PATCH', `/compras/orders/${ctx.aerea}/request-amount-change`, { new_amount: 999 })
    expect(bloqueado.status).toBe(422)
    expect(JSON.stringify(bloqueado.body)).toMatch(/pagos registrados/)
  })

  test('4. reclamos a proveedor: tope por línea, línea de la propia orden y resolución del catálogo', async ({ request }) => {
    // una orden recibida: avanzar, ingreso de mercancía y confirmar la línea
    const orden = await crearOrden(request, {}, 10, 50)
    const id = orden.body.id as number
    for (let i = 0; i < 4; i++) expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/advance`)).status).toBe(200)
    const stock = (await api(request, 'lidercompras', 'GET', `/bodega/adjustment-requests/products/${ctx.product}/warehouse-stock`)).body
    const central = (stock.warehouses as { warehouse_id: number; name: string }[]).find(w => w.name === 'Bodega Central')!.warehouse_id
    const ingreso = await api(request, 'lidercompras', 'POST', '/compras/goods-receipts', { purchase_order_id: id, lines: [{ catalog_product_id: ctx.product, quantity: 10, unit_cost: 50, warehouse_id: central }] })
    expect(ingreso.status).toBe(201)
    expect((await api(request, 'lidercompras', 'POST', `/compras/goods-receipts/lines/${ingreso.body.lines[0].id}/confirm`)).status).toBe(200)
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${id}/advance`)).body.status).toBe('recibido')
    const detalle = (await api(request, 'lidercompras', 'GET', `/compras/orders/${id}`)).body
    const linea = detalle.lines[0].id as number

    const base = { purchase_order_id: id, description: 'Piezas dañadas en el envío', expected_resolution: 'reposicion' }
    expect((await api(request, 'vendedor', 'POST', '/compras/claims', { ...base, lines: [{ purchase_order_line_id: linea, affected_quantity: 3 }] })).status, 'el vendedor no reclama').toBe(403)
    expect((await api(request, 'lidercompras', 'POST', '/compras/claims', { ...base, lines: [{ purchase_order_line_id: linea, affected_quantity: 11 }] })).status, 'no más de lo pedido').toBe(422)

    const otra = await crearOrden(request)
    const lineaAjena = (await api(request, 'lidercompras', 'GET', `/compras/orders/${otra.body.id}`)).body.lines[0].id as number
    expect((await api(request, 'lidercompras', 'POST', '/compras/claims', { ...base, lines: [{ purchase_order_line_id: lineaAjena, affected_quantity: 1 }] })).status, 'la línea debe ser de la orden reclamada').toBe(422)

    const ok = await api(request, 'lidercompras', 'POST', '/compras/claims', { ...base, lines: [{ purchase_order_line_id: linea, affected_quantity: 3 }] })
    expect(ok.status).toBe(201)
    expect(ok.body.code).toMatch(/^R-\d+$/)
    expect(ok.body.status).toBe('en_revision')
    const cid = ok.body.id as number
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/claims/${cid}/resolution`, { expected_resolution: 'otra' })).status).toBe(422)
    expect((await api(request, 'lidercompras', 'PATCH', `/compras/claims/${cid}/resolution`, { expected_resolution: 'nota_credito_reembolso' })).status).toBe(200)
    const resuelto = await api(request, 'lidercompras', 'PATCH', `/compras/claims/${cid}/status`, { status: 'resuelto' })
    expect(resuelto.status).toBe(200)
    expect(resuelto.body.status).toBe('resuelto')
  })
})
