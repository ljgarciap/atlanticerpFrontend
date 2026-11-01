import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de Tesorería (catálogo: atlanticerp-backend/docs/flujos/admin-contab-tesoreria.md): una comisión externa pagada SIN cuenta de pago
// deja una salida de caja «Sin cuenta asignada»; quién la asigna, qué cuentas acepta, cómo afecta el saldo de bancos y qué pasa al desactivar la cuenta.
// Por la API real y con la cuenta de cada rol; crea su propio proyecto con prefijo «[FLUJO]». Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'asistenteadministrativa', 'superadmin'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ids: Record<string, number> = {}
const ctx: Record<string, number | string> = {}
const STAMP = String(Date.now())
const PDF = Buffer.from('%PDF-1.4\n%flujo\n')
type Res = { status: number; body: any }
type Mov = { id: number; tipo: string; direccion: string; concepto: string; monto: number; bank_account_id: number | null }

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* cuerpo no JSON */ }
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
const saldoBancos = async (request: APIRequestContext) => Number((await api(request, 'contabilidad', 'GET', '/admin-contab/cash-position')).body.saldo_bancos)

// El listado crece con cada corrida y solo ordena por fecha: se recorren las páginas hasta dar con el movimiento buscado.
async function buscarMovimiento(request: APIRequestContext, pred: (m: Mov) => boolean, query = ''): Promise<Mov | undefined> {
  for (let pagina = 1; pagina <= 30; pagina++) {
    const r = (await api(request, 'contabilidad', 'GET', `/admin-contab/bank-movements?per_page=100&page=${pagina}${query}`)).body
    const m = (r.data as Mov[]).find(pred)
    if (m) return m
    if (pagina >= (r.meta?.last_page ?? 1)) break
  }
  return undefined
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de tesorería (movimientos bancarios)', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
    for (const rol of ['auxiliarbodega', 'transporte'] as const) {
      const u = data((await api(request, 'superadmin', 'GET', `/users?search=${rol}`)).body) as { id: number; email: string }[]
      ids[rol] = u.find(x => x.email === `${rol}@test.com`)!.id
    }
  })

  test('1. una comisión pagada sin cuenta de pago: la salida de caja queda «Sin cuenta asignada»', async ({ request }) => {
    // Proyecto de un arquitecto, totalmente facturado y cobrado (misma cadena que el flujo de comisiones externas).
    const arq = await api(request, 'vendedor', 'POST', '/ventas-diseno/architects', { type: 'architect', name: `[FLUJO] Arquitecto ${STAMP}`, email: `arq.${STAMP}@example.test` })
    expect(arq.status).toBe(201)
    ctx.arq = arq.body.id
    const mc = await api(request, 'vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente ${STAMP}` })
    ctx.mc = mc.body.id
    const sc = await api(request, 'vendedor', 'POST', '/ventas-diseno/sub-clients', { master_client_id: ctx.mc, business_name: `[FLUJO] Sub ${STAMP} S.A.`, tax_id: '155-123-4567', tax_id_dv: '12', receptor_tipo: '01' })
    expect(sc.status).toBe(201)
    ctx.sc = sc.body.id
    const ct = await api(request, 'vendedor', 'POST', `/ventas-diseno/sub-clients/${ctx.sc}/contacts`, { name: 'Contacto Flujo', role: 'client', email: 'contacto.flujo@example.test', phone: '6000-0000' })
    const card = await api(request, 'vendedor', 'POST', '/ventas-diseno/pipeline', { type: 'design', name: `[FLUJO] Proyecto ${STAMP}`, sub_client_id: ctx.sc })
    expect(card.status).toBe(201)
    ctx.card = card.body.id

    const prods = data((await api(request, 'vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=5')).body) as { id: number }[]
    ctx.prod = prods[0].id
    const q = await api(request, 'vendedor', 'POST', '/ventas-diseno/quotes', { from_pipeline_card_id: ctx.card })
    ctx.q = q.body.id
    const parte = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts`, { name: 'Única' })
    expect((await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts/${parte.body.id}/items`, { catalog_product_id: ctx.prod, quantity: 2 })).status).toBe(201)
    await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/contacts`, { sub_client_contact_id: ct.body.id })
    const fecha = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    const up = await api(request, 'vendedor', 'PUT', `/ventas-diseno/quotes/${ctx.q}`, { description: 'Cotización con arquitecto', delivery_type: 'single', delivery_dates: [fecha], price_type: 'project', architect_id: ctx.arq })
    expect(up.status, JSON.stringify(up.body).slice(0, 200)).toBe(200)
    expect((await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/generate`)).status).toBe(200)
    expect((await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/confirm`)).status).toBe(200)
    const mover = (stage: string) => api(request, 'vendedor', 'PATCH', `/ventas-diseno/pipeline/${ctx.card}/stage`, { stage })
    await api(request, 'vendedor', 'PUT', `/ventas-diseno/pipeline/${ctx.card}`, { worked_area_m2: 80 })
    expect((await mover('proposal')).status).toBe(200)
    expect((await subir(request, 'vendedor', `/ventas-diseno/pipeline/${ctx.card}/files`, { type: 'signed_quote' })).status).toBe(201)
    expect((await subir(request, 'vendedor', `/ventas-diseno/pipeline/${ctx.card}/files`, { type: 'approval_proof' })).status).toBe(201)
    expect((await mover('approved')).status).toBe(200)
    expect((await api(request, 'gerencia', 'POST', `/ventas-diseno/pipeline/${ctx.card}/pass-to-order`)).status).toBe(200)

    const stock = (await api(request, 'lidercompras', 'GET', `/bodega/adjustment-requests/products/${ctx.prod}/warehouse-stock`)).body
    const central = (stock.warehouses as { name: string; warehouse_id: number; quantity: number }[]).find(w => w.name === 'Bodega Central')!
    ctx.central = central.warehouse_id
    if (central.quantity < 2) {
      const prov = data((await api(request, 'lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
      const oc = await api(request, 'lidercompras', 'POST', '/compras/orders', { provider_id: prov[0].id, modality: 'directo', lines: [{ catalog_product_id: ctx.prod, quantity: 10, unit_cost: 50 }] })
      for (let i = 0; i < 4; i++) expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${oc.body.id}/advance`)).status).toBe(200)
      const ingreso = await api(request, 'lidercompras', 'POST', '/compras/goods-receipts', { purchase_order_id: oc.body.id, lines: [{ catalog_product_id: ctx.prod, quantity: 10, unit_cost: 50, warehouse_id: ctx.central }] })
      expect((await api(request, 'lidercompras', 'POST', `/compras/goods-receipts/lines/${ingreso.body.lines[0].id}/confirm`)).status).toBe(200)
      expect((await api(request, 'lidercompras', 'PATCH', `/compras/orders/${oc.body.id}/advance`)).status).toBe(200)
    }

    const lista = (await api(request, 'liderbodega', 'GET', `/bodega/orders?per_page=50&search=${encodeURIComponent(`[FLUJO] Proyecto ${STAMP}`)}`)).body
    const pedido = (lista.cards as { id: number; order_type: string }[]).find(c => c.order_type === 'pedido')!
    ctx.pedido = pedido.id
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/assign-picker`, { picker_id: ids.auxiliarbodega })).status).toBe(200)
    expect((await api(request, 'auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/start-picking`)).status).toBe(200)
    const hoja = (await api(request, 'auxiliarbodega', 'GET', `/bodega/orders/${pedido.id}/picking-sheet`)).body
    const item = (hoja.items as { id: number; qty_requested: number }[])[0]
    const cant = item.qty_requested
    expect((await api(request, 'auxiliarbodega', 'PATCH', `/bodega/orders/${pedido.id}/picking-sheet`, { items: [{ order_item_id: item.id, qty_picked: cant, allocations: [{ warehouse_id: ctx.central, qty_picked: cant }] }] })).status).toBe(200)
    expect((await api(request, 'auxiliarbodega', 'POST', `/bodega/orders/${pedido.id}/complete-picking`, { items: [{ order_item_id: item.id, qty_picked: cant }] })).status).toBe(200)
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/register-delivery`, { items: [{ order_item_id: item.id, qty_delivered: cant }] })).status).toBe(200)
    expect((await api(request, 'liderbodega', 'POST', `/bodega/orders/${pedido.id}/assign-courier`, { courier_id: ids.transporte })).status).toBe(200)
    expect((await api(request, 'asistentebodega', 'POST', `/bodega/orders/${pedido.id}/dispatch`)).status).toBe(200)
    expect((await subir(request, 'transporte', `/bodega/orders/${pedido.id}/register-signed-guide`, { delivered_by_courier_id: String(ids.transporte), received_by_name: 'Recibe Flujo' })).status).toBe(200)

    const f = await api(request, 'contabilidad', 'POST', '/admin-contab/invoices', { order_ids: [ctx.pedido], modo: 'completo' })
    expect(f.status, JSON.stringify(f.body).slice(0, 200)).toBe(201)
    const factura = f.body.invoices[0]
    ctx.monto = Number(factura.monto)
    let cuentas = (await api(request, 'contabilidad', 'GET', '/admin-contab/bank-accounts')).body as { id: number }[]
    if (!cuentas.length) cuentas = [(await api(request, 'contabilidad', 'POST', '/admin-contab/bank-accounts', { banco: '[FLUJO] Banco Demo', ultimos_4_digitos: '0001' })).body]
    ctx.banco = cuentas[0].id
    const intento = await api(request, 'contabilidad', 'POST', '/admin-contab/payments/cobro', { master_client_id: ctx.mc, monto_recibido: ctx.monto, metodo_pago: 'transferencia', bank_account_id: ctx.banco, aplicaciones: [{ invoice_id: factura.id, monto: ctx.monto }] })
    expect(intento.status).toBe(201)
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/payments/${intento.body.id}/confirm`)).status).toBe(200)

    // Régimen exento (sin retención: no hace falta comprobante) y cuenta de cobro; NO se fija cuenta de pago.
    const raiz = `/admin-contab/commissions/external/projects/${ctx.card}`
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/commissions/external/architects/${ctx.arq}/fiscal-profile`, { empresa: `[FLUJO] Estudio ${STAMP}`, ruc: '8-123-456', regimen_fiscal: 'exento' })).status).toBe(200)
    expect((await subir(request, 'contabilidad', `${raiz}/cuenta-cobro`, {})).status).toBe(201)

    ctx.saldoAntes = await saldoBancos(request)
    const pago = await api(request, 'contabilidad', 'POST', `${raiz}/mark-paid`)
    expect(pago.status, JSON.stringify(pago.body).slice(0, 200)).toBe(200)
    ctx.comision = Number(ctx.monto) * 0.1

    const mov = await buscarMovimiento(request, m => m.tipo === 'comision' && m.concepto.includes(`[FLUJO] Arquitecto ${STAMP}`))
    expect(mov, 'pagar sin cuenta de pago igual registra la salida').toBeTruthy()
    expect(mov!.direccion).toBe('salida')
    expect(mov!.bank_account_id, 'queda «Sin cuenta asignada»').toBeNull()
    expect(mov!.monto).toBeCloseTo(ctx.comision as number, 2)
    ctx.mov = mov!.id

    expect(await saldoBancos(request), 'la salida sin cuenta ya reduce el saldo de bancos (el dinero salió)').toBeCloseTo((ctx.saldoAntes as number) - mov!.monto, 2)
  })

  test('2. lectura: quién ve los movimientos y las cuentas', async ({ request }) => {
    for (const rol of ['vendedor', 'lidercompras'] as const) {
      expect((await api(request, rol, 'GET', '/admin-contab/bank-movements')).status, `${rol} no ve movimientos`).toBe(403)
      expect((await api(request, rol, 'GET', '/admin-contab/bank-accounts')).status, `${rol} no ve cuentas`).toBe(403)
    }
    for (const rol of ['contabilidad', 'asistenteadministrativa', 'gerencia'] as const) {
      expect((await api(request, rol, 'GET', '/admin-contab/bank-movements')).status, `${rol} ve movimientos`).toBe(200)
    }
    // El filtro por cuenta no devuelve movimientos de otras cuentas, y la paginación expone meta.
    const filtrado = (await api(request, 'contabilidad', 'GET', `/admin-contab/bank-movements?bank_account_id=${ctx.banco}&per_page=5`)).body
    expect((filtrado.data as Mov[]).every(m => m.bank_account_id === ctx.banco)).toBe(true)
    expect(filtrado.meta).toBeTruthy()
  })

  test('3. asignar la cuenta: solo Contabilidad y la Asistente; solo comisiones sin cuenta; solo cuentas activas', async ({ request }) => {
    const ruta = `/admin-contab/bank-movements/${ctx.mov}/assign-account`
    const cuenta = { bank_account_id: ctx.banco }

    expect((await api(request, 'vendedor', 'PUT', ruta, cuenta)).status).toBe(403)
    expect((await api(request, 'gerencia', 'PUT', ruta, cuenta)).status, 'Gerencia no asigna (carve-out de REQ-534)').toBe(403)
    expect((await api(request, 'gerencia3', 'PUT', ruta, cuenta)).status, 'ni siquiera el aprobador primario').toBe(403)

    expect((await api(request, 'contabilidad', 'PUT', ruta, {})).status, 'la cuenta es obligatoria').toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', ruta, { bank_account_id: 99999999 })).status, 'cuenta inexistente').toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', '/admin-contab/bank-movements/99999999/assign-account', cuenta)).status, 'movimiento inexistente').toBe(404)

    // Una cuenta nueva que luego se desactiva: no se ofrece para asignar.
    const nueva = await api(request, 'contabilidad', 'POST', '/admin-contab/bank-accounts', { banco: `[FLUJO] Banco ${STAMP}`, ultimos_4_digitos: '7777' })
    expect(nueva.status).toBe(201)
    ctx.cuentaNueva = nueva.body.id
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/bank-accounts/${ctx.cuentaNueva}/deactivate`)).status).toBe(200)
    expect((await api(request, 'contabilidad', 'PUT', ruta, { bank_account_id: ctx.cuentaNueva })).status, 'cuenta inactiva').toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/bank-accounts/${ctx.cuentaNueva}/reactivate`)).status).toBe(200)

    // Un cobro ya tiene cuenta y no es comisión: no se reasigna.
    const cobro = await buscarMovimiento(request, m => m.tipo === 'cobro')
    expect(cobro, 'hay al menos un cobro en el ledger').toBeTruthy()
    const reasignar = await api(request, 'contabilidad', 'PUT', `/admin-contab/bank-movements/${cobro!.id}/assign-account`, { bank_account_id: ctx.cuentaNueva })
    expect(reasignar.status, 'solo comisiones sin cuenta').toBe(422)

    const saldo = await saldoBancos(request)
    const ok = await api(request, 'asistenteadministrativa', 'PUT', ruta, { bank_account_id: ctx.cuentaNueva })
    expect(ok.status, JSON.stringify(ok.body).slice(0, 200)).toBe(200)
    expect(ok.body.bank_account_id).toBe(ctx.cuentaNueva)
    expect(await saldoBancos(request), 'asignar la cuenta solo categoriza: el saldo no cambia').toBeCloseTo(saldo, 2)

    expect((await api(request, 'contabilidad', 'PUT', ruta, cuenta)).status, 'una vez asignada no se reasigna').toBe(422)
  })

  test('4. desactivar la cuenta de un movimiento: el saldo de bancos deja de contarlo y al reactivar vuelve', async ({ request }) => {
    const antes = await saldoBancos(request)
    const comision = ctx.comision as number
    expect((await api(request, 'vendedor', 'PUT', `/admin-contab/bank-accounts/${ctx.cuentaNueva}/deactivate`)).status).toBe(403)
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/bank-accounts/${ctx.cuentaNueva}/deactivate`)).status).toBe(200)
    expect(await saldoBancos(request), 'la salida de una cuenta inactiva deja de restar').toBeCloseTo(antes + comision, 2)
    expect((await api(request, 'contabilidad', 'PUT', `/admin-contab/bank-accounts/${ctx.cuentaNueva}/reactivate`)).status).toBe(200)
    expect(await saldoBancos(request)).toBeCloseTo(antes, 2)
    const lista = (await api(request, 'contabilidad', 'GET', '/admin-contab/bank-accounts?activa=true')).body as { id: number; movimientos_count: number }[]
    expect(lista.find(c => c.id === ctx.cuentaNueva)?.movimientos_count, 'la cuenta cuenta su movimiento').toBeGreaterThanOrEqual(1)
  })
})
