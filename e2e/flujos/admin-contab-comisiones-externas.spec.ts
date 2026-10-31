import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de Comisiones Externas (catálogo: atlanticerp-backend/docs/flujos/admin-contab-comisiones-externas.md): un proyecto
// referido por un arquitecto genera comisión solo cuando está TOTALMENTE facturado y cobrado; luego datos fiscales, cuenta de cobro,
// retención, cambio de porcentaje (propone Contabilidad, decide el aprobador) y pago. Por la API real y con la cuenta de cada rol;
// crea su propio proyecto (cotización de una sola línea, entrega completa) con prefijo «[FLUJO]». Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
// `gerencia3` es el aprobador primario configurado en el demo; `gerencia` no lo es.
const ROLES = ['vendedor', 'gerencia', 'gerencia3', 'lidercompras', 'liderbodega', 'asistentebodega', 'auxiliarbodega', 'transporte', 'contabilidad', 'superadmin'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ids: Record<string, number> = {}
const ctx: Record<string, number | string> = {}
const STAMP = String(Date.now())
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

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de comisiones externas', () => {
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

  const filaDelProyecto = async (request: APIRequestContext) => {
    const resumen = (await api(request, 'contabilidad', 'GET', '/admin-contab/commissions/external')).body
    const arq = (resumen.arquitectos as { architect_id: number; proyectos: Record<string, any>[] }[]).find(a => a.architect_id === ctx.arq)
    return { resumen, arq, proyecto: arq?.proyectos.find(p => p.pipeline_card_id === ctx.card) }
  }

  test('1. un proyecto del arquitecto: cotización, pedido, entrega, factura completa y cobro', async ({ request }) => {
    const arq = await api(request, 'vendedor', 'POST', '/ventas-diseno/architects', { type: 'architect', name: `[FLUJO] Arquitecto ${STAMP}`, email: `arq.${STAMP}@example.test` })
    expect(arq.status).toBe(201)
    ctx.arq = arq.body.id

    const mc = await api(request, 'vendedor', 'POST', '/ventas-diseno/master-clients', { name: `[FLUJO] Cliente ${STAMP}` })
    ctx.mc = mc.body.id
    const sc = await api(request, 'vendedor', 'POST', '/ventas-diseno/sub-clients', { master_client_id: ctx.mc, business_name: `[FLUJO] Sub ${STAMP} S.A.`, tax_id: '155-123-4567', tax_id_dv: '12', receptor_tipo: '01' })
    expect(sc.status).toBe(201)
    ctx.sc = sc.body.id
    const ct = await api(request, 'vendedor', 'POST', `/ventas-diseno/sub-clients/${ctx.sc}/contacts`, { name: 'Contacto Flujo', role: 'client', email: 'contacto.flujo@example.test', phone: '6000-0000' })
    ctx.contacto = ct.body.id
    const card = await api(request, 'vendedor', 'POST', '/ventas-diseno/pipeline', { type: 'design', name: `[FLUJO] Proyecto ${STAMP}`, sub_client_id: ctx.sc })
    expect(card.status).toBe(201)
    ctx.card = card.body.id

    const prods = data((await api(request, 'vendedor', 'GET', '/ventas-diseno/catalog-products?per_page=5')).body) as { id: number }[]
    ctx.prod = prods[0].id
    const q = await api(request, 'vendedor', 'POST', '/ventas-diseno/quotes', { from_pipeline_card_id: ctx.card })
    ctx.q = q.body.id
    const parte = await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts`, { name: 'Única' })
    expect((await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/parts/${parte.body.id}/items`, { catalog_product_id: ctx.prod, quantity: 2 })).status).toBe(201)
    await api(request, 'vendedor', 'POST', `/ventas-diseno/quotes/${ctx.q}/contacts`, { sub_client_contact_id: ctx.contacto })
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

    // Existencias: se compra lo que falte en Bodega Central.
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

    // Bodega: picking completo y entrega firmada.
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

    // Antes de facturar y cobrar el arquitecto aparece, pero sin comisión generada.
    const antes = await filaDelProyecto(request)
    expect(antes.arq, 'el arquitecto aparece por la cotización').toBeTruthy()
    expect(antes.proyecto?.estado).toBe('aun_no_generada')
    ctx.sinGenerar = 1

    // Factura completa y cobro confirmado.
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

    const despues = await filaDelProyecto(request)
    expect(despues.proyecto?.estado, 'totalmente facturado y cobrado genera la comisión').toBe('pendiente_factura_arquitecto')
    expect(despues.proyecto?.estado_cobro_cliente).toBe('cobrado')
    expect(despues.proyecto?.porcentaje, 'el porcentaje por defecto sale de Configuración Fiscal').toBe(10)
    expect(despues.proyecto?.comision).toBeCloseTo(ctx.monto as number * 0.1, 2)
    expect(despues.proyecto?.impuesto, 'sin régimen fiscal no se calcula el impuesto (nunca se asume exento)').toBeNull()
  })

  test('1b. lectura: solo Administración y Gerencia ven las comisiones externas', async ({ request }) => {
    for (const rol of ['vendedor', 'lidercompras'] as const) {
      expect((await api(request, rol, 'GET', '/admin-contab/commissions/external')).status, `${rol} no las consulta`).toBe(403)
    }
    for (const rol of ['contabilidad', 'gerencia'] as const) {
      expect((await api(request, rol, 'GET', '/admin-contab/commissions/external')).status).toBe(200)
    }
    const opciones = (await api(request, 'contabilidad', 'GET', '/admin-contab/commissions/external/architects')).body as { id: number }[]
    expect(opciones.map(a => a.id)).toContain(ctx.arq)
  })

  test('2. datos fiscales: quién los edita y cómo cambia el impuesto según el régimen', async ({ request }) => {
    const ruta = `/admin-contab/commissions/external/architects/${ctx.arq}/fiscal-profile`
    const perfil = { empresa: `[FLUJO] Estudio ${STAMP}`, ruc: '8-123-456', regimen_fiscal: 'con_itbms' }

    expect((await api(request, 'vendedor', 'PUT', ruta, perfil)).status, 'el vendedor no edita datos fiscales').toBe(403)
    expect((await api(request, 'contabilidad', 'PUT', ruta, { ...perfil, regimen_fiscal: 'inventado' })).status).toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', ruta, { ...perfil, ruc: '' })).status).toBe(422)

    expect((await api(request, 'contabilidad', 'PUT', ruta, perfil)).status).toBe(200)
    const itbms = (await filaDelProyecto(request)).proyecto!
    expect(itbms.impuesto).toBeGreaterThan(0)
    expect(itbms.total).toBeCloseTo(itbms.comision + itbms.impuesto, 2)

    expect((await api(request, 'contabilidad', 'PUT', ruta, { ...perfil, regimen_fiscal: 'exento' })).status).toBe(200)
    expect((await filaDelProyecto(request)).proyecto!.impuesto, 'exento no paga impuesto').toBe(0)

    expect((await api(request, 'contabilidad', 'PUT', ruta, { ...perfil, regimen_fiscal: 'retencion_50' })).status).toBe(200)
    const ret = (await filaDelProyecto(request)).proyecto!
    expect(ret.impuesto, 'la retención del 50 % es la mitad del impuesto').toBeCloseTo(itbms.impuesto / 2, 2)
    const arq = (await filaDelProyecto(request)).arq as { datos_fiscales_completos: boolean; regimen_fiscal: string }
    expect(arq.datos_fiscales_completos).toBe(true)
    expect(arq.regimen_fiscal).toBe('retencion_50')
  })

  test('3. cambio de porcentaje: propone Contabilidad, decide solo el aprobador configurado', async ({ request }) => {
    const base = `/admin-contab/commissions/external/projects/${ctx.card}/percent`
    expect((await api(request, 'vendedor', 'POST', `${base}/propose`, { porcentaje: 12, motivo: 'Acuerdo' })).status).toBe(403)
    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 0, motivo: 'Acuerdo' })).status, 'el porcentaje debe ser mayor que 0').toBe(422)
    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 101, motivo: 'Acuerdo' })).status).toBe(422)
    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 12 })).status, 'el motivo es obligatorio').toBe(422)

    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 12, motivo: 'Acuerdo comercial' })).status).toBe(200)
    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 15, motivo: 'Otra' })).status, 'solo una propuesta pendiente').toBe(422)
    const pendiente = (await filaDelProyecto(request)).proyecto!
    expect(pendiente.porcentaje_pendiente).toBe(12)
    expect(pendiente.porcentaje, 'mientras no se decide, rige el porcentaje anterior').toBe(10)

    expect((await api(request, 'contabilidad', 'POST', `/admin-contab/commissions/external/projects/${ctx.card}/mark-paid`)).status, 'con un cambio pendiente no se paga').toBe(422)

    expect((await api(request, 'contabilidad', 'POST', `${base}/decide`, { approve: true })).status, 'contabilidad no decide').toBe(403)
    expect((await api(request, 'gerencia', 'POST', `${base}/decide`, { approve: true })).status, 'otra cuenta de Gerencia no es el aprobador').toBe(403)
    expect((await api(request, 'gerencia3', 'POST', `${base}/decide`, { approve: false })).status, 'rechazar exige motivo').toBe(422)
    expect((await api(request, 'gerencia3', 'POST', `${base}/decide`, { approve: false, motivo_rechazo: 'Fuera de política' })).status).toBe(200)
    expect((await filaDelProyecto(request)).proyecto!.porcentaje, 'rechazado: no cambia').toBe(10)

    expect((await api(request, 'contabilidad', 'POST', `${base}/propose`, { porcentaje: 12, motivo: 'Segunda propuesta' })).status).toBe(200)
    expect((await api(request, 'gerencia3', 'POST', `${base}/decide`, { approve: true })).status).toBe(200)
    const aprobado = (await filaDelProyecto(request)).proyecto!
    expect(aprobado.porcentaje).toBe(12)
    expect(aprobado.comision).toBeCloseTo((ctx.monto as number) * 0.12, 2)
    expect(aprobado.porcentaje_pendiente).toBeNull()
    expect((await api(request, 'gerencia3', 'POST', `${base}/decide`, { approve: true })).status, 'sin propuesta pendiente no hay nada que decidir').toBe(422)
  })

  test('4. pago: cuenta de cobro, comprobante de retención, cuenta de pago y marcar pagado', async ({ request }) => {
    const raiz = `/admin-contab/commissions/external/projects/${ctx.card}`
    const pagar = () => api(request, 'contabilidad', 'POST', `${raiz}/mark-paid`)

    expect((await api(request, 'vendedor', 'POST', `${raiz}/remind`)).status, 'el vendedor no envía recordatorios').toBe(403)
    expect((await api(request, 'contabilidad', 'POST', `${raiz}/remind`)).status, 'recordatorio al correo del arquitecto').toBe(200)

    expect((await pagar()).status, 'falta la cuenta de cobro').toBe(422)
    expect((await subir(request, 'vendedor', `${raiz}/cuenta-cobro`, {})).status, 'el vendedor no sube la cuenta de cobro').toBe(403)
    expect((await subir(request, 'contabilidad', `${raiz}/cuenta-cobro`, {})).status).toBe(201)
    const url = (await api(request, 'contabilidad', 'GET', `${raiz}/cuenta-cobro`)).body.url as string
    expect((await request.get(url)).status(), 'la cuenta de cobro se descarga con URL firmada').toBe(200)

    expect((await pagar()).status, 'con retención del 50 % falta el comprobante').toBe(422)
    expect((await subir(request, 'contabilidad', `${raiz}/comprobante-retencion`, {})).status).toBe(201)

    expect((await api(request, 'contabilidad', 'PUT', `${raiz}/cuenta-pago`, { bank_account_id: ctx.banco })).status).toBe(200)
    expect((await api(request, 'vendedor', 'POST', `${raiz}/mark-paid`)).status).toBe(403)

    const ok = await pagar()
    expect(ok.status, JSON.stringify(ok.body).slice(0, 200)).toBe(200)
    const pagada = (await filaDelProyecto(request)).proyecto!
    expect(pagada.estado).toBe('pagada')
    expect(pagada.fecha_pago).toBeTruthy()

    // El listado crece con cada corrida (y solo ordena por fecha): se recorren las páginas hasta dar con la salida de este arquitecto.
    type Mov = { tipo: string; direccion: string; concepto: string; monto: number; bank_account_id: number | null }
    let salida: Mov | undefined
    for (let pagina = 1; pagina <= 30 && !salida; pagina++) {
      const r = (await api(request, 'contabilidad', 'GET', `/admin-contab/bank-movements?per_page=100&page=${pagina}`)).body
      salida = (r.data as Mov[]).find(m => m.tipo === 'comision' && m.concepto.includes(`[FLUJO] Arquitecto ${STAMP}`))
      if (pagina >= (r.meta?.last_page ?? 1)) break
    }
    expect(salida, 'pagar registra la salida de caja').toBeTruthy()
    expect(salida!.direccion).toBe('salida')
    expect(salida!.bank_account_id, 'sale de la cuenta de pago fijada').toBe(ctx.banco)
    expect(salida!.monto, 'monto = comisión + impuesto (retención del 50 %)').toBeCloseTo(pagada.total, 2)

    expect((await pagar()).status, 'no se paga dos veces').toBe(422)
    expect((await api(request, 'contabilidad', 'POST', `${raiz}/remind`)).status, 'ya pagada: no hay nada que recordar').toBe(422)
    expect((await api(request, 'contabilidad', 'PUT', `${raiz}/cuenta-pago`, { bank_account_id: ctx.banco })).status, 'pagada: la cuenta de pago no cambia').toBe(422)
    expect((await api(request, 'contabilidad', 'POST', `${raiz}/percent/propose`, { porcentaje: 20, motivo: 'Tarde' })).status, 'pagada: el porcentaje no cambia').toBe(422)
    const arq = (await filaDelProyecto(request)).arq as { pagada: number }
    expect(arq.pagada, 'el total pagado del arquitecto suma la comisión').toBeGreaterThan(0)
  })
})
