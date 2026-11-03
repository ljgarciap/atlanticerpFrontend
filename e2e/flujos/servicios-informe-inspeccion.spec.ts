import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { API, data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Servicios, tercera parte (catálogo: atlanticerp-backend/docs/flujos/servicios-informe-inspeccion.md): el informe de inspección completo
// (campos dinámicos, guardado, regla de seguimiento, fotos, modo «archivo subido», informe móvil con firma gráfica, PDF) y los documentos de la cotización.
// Por la API real y con la cuenta de cada rol; crea sus propios tickets «[FLUJO]». UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['liderservicios', 'tecnico', 'tecnicogarantias', 'vendedor', 'gerencia'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 19)
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

// PNG real de 1x1 (la firma gráfica se valida por tipo de archivo).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n%flujo\n')

async function subir(rol: string, path: string, multipart: Record<string, any>) {
  const r = await req.post(`${API}${path}`, { headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' }, multipart })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* no JSON */ }
  return { status: r.status(), body }
}

async function nuevoTicket(tipo: 'installation' | 'warranty', subtipo: string, etiqueta: string, tecnicoUser?: number) {
  const base = { tipo, subtipo, tipo_instalacion: 'internal', descripcion: `[FLUJO] ${etiqueta} ${STAMP}`, contacto: 'Contacto Flujo', telefono: '6000-0000', direccion: 'Dirección de flujo' }
  const t = await api('liderservicios', 'POST', '/servicios/tickets', base)
  expect(t.status).toBe(201)
  if (tecnicoUser) expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${t.body.id}/agendar`, { internal_technician_id: tecnicoUser, scheduled_at: enDias(2) })).status).toBe(200)
  return t.body.id as number
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Servicios: informe de inspección y documentos de la cotización', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    const lista = data((await api('liderservicios', 'GET', '/servicios/internal-technicians')).body) as { user_id: number; email: string }[]
    ctx.tecnicoUser = lista.find(t => t.email === 'tecnico@test.com')!.user_id
    ctx.garantiasUser = lista.find(t => t.email === 'tecnicogarantias@test.com')!.user_id
  })

  test.afterAll(async () => { await req.dispose() })

  test('1. campos dinámicos: un reclamo no genera informe y cada tipo trae su formulario', async () => {
    const reclamo = await api('vendedor', 'POST', '/servicios/tickets', { tipo: 'claim', tipo_instalacion: 'internal', descripcion: `[FLUJO] Reclamo ${STAMP}`, contacto: 'Contacto Flujo', telefono: '6000-0000', direccion: 'Dirección de flujo' })
    for (const ruta of ['fields', '', 'pdf/blank']) {
      expect((await api('liderservicios', 'GET', `/servicios/tickets/${reclamo.body.id}/inspection-report/${ruta}`)).status, `un reclamo no genera informe (${ruta || 'show'})`).toBeGreaterThanOrEqual(404)
    }
    expect((await api('liderservicios', 'PUT', `/servicios/tickets/${reclamo.body.id}/inspection-report`, { conclusion: 'x' })).status).toBe(422)
    expect((await api('liderservicios', 'GET', '/servicios/tickets/99999999/inspection-report/fields')).status).toBe(404)

    ctx.inst = await nuevoTicket('installation', 'inspection', 'Inspección', ctx.tecnicoUser)
    const campos = await api('vendedor', 'GET', `/servicios/tickets/${ctx.inst}/inspection-report/fields`)
    expect(campos.status, 'cualquiera que vea Servicios lee el formulario').toBe(200)
    expect(data(campos.body).length).toBeGreaterThan(0)
    expect(data(campos.body)[0]).toEqual(expect.objectContaining({ key: expect.any(String), label: expect.any(String), type: expect.any(String) }))
    ctx.campos = data(campos.body) as { key: string; label: string }[]

    const garantia = await nuevoTicket('warranty', 'replacement_inspection', 'Garantía', ctx.garantiasUser)
    const otros = data((await api('liderservicios', 'GET', `/servicios/tickets/${garantia}/inspection-report/fields`)).body) as { key: string }[]
    expect(otros.map(c => c.key).sort(), 'cada tipo/subtipo tiene su propio formulario').not.toEqual(ctx.campos.map(c => c.key).sort())
    ctx.garantia = garantia

    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ctx.inst}/inspection-report`)).status, 'sin informe todavía').toBe(404)
  })

  test('2. guardar el informe: conclusión obligatoria, técnico apto, seguimiento, materiales y folio estable', async () => {
    const url = `/servicios/tickets/${ctx.inst}/inspection-report`
    const informe = {
      fecha_inspeccion: '2026-11-01', hora_inicio: '09:00', hora_fin: '10:30',
      findings: ctx.campos.slice(0, 2).map(c => ({ label: c.label, value: 'Observado' })),
      materiales: [{ nombre_material: 'Cable de prueba', cantidad: '3' }, { nombre_material: '', cantidad: '' }],
      conclusion: 'Todo en orden; se recomienda seguimiento.', requiere_seguimiento: false, proximos_pasos: 'No debería guardarse',
      firma_tecnico_nombre: 'Tecnico Test', firma_cliente_nombre: 'Cliente Flujo',
    }
    expect((await api('tecnico', 'PUT', url, { ...informe, conclusion: '   ' })).status, 'la conclusión no puede ser solo espacios').toBe(422)
    expect((await api('tecnico', 'PUT', url, { ...informe, materiales: [{ nombre_material: 'X', cantidad: '1', catalog_product_id: 99999999 }] })).status, 'el producto del material debe existir').toBe(422)
    expect((await api('tecnico', 'PUT', url, { ...informe, internal_technician_id: ctx.garantiasUser })).status, 'el técnico elegido debe atender este tipo').toBe(422)
    for (const rol of ['vendedor', 'gerencia', 'tecnicogarantias']) expect((await api(rol, 'PUT', url, informe)).status, `${rol} no escribe el informe`).toBe(403)

    const ok = await api('tecnico', 'PUT', url, informe)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ estado: 'completed', modo: 'formulario', conclusion: informe.conclusion })
    expect(ok.body.numero).toMatch(/^INF-\d{4}-\d{4}$/)
    expect(ok.body.proximos_pasos, 'sin seguimiento no se guardan próximos pasos').toBeNull()
    expect(ok.body.materiales, 'una fila de material vacía se descarta').toHaveLength(1)
    expect(ok.body.findings).toHaveLength(2)
    ctx.folio = ok.body.numero
    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ctx.inst}`)).body.inspection_report_status).toBe('completed')

    const seg = await api('liderservicios', 'PUT', url, { ...informe, requiere_seguimiento: true, proximos_pasos: 'Volver en una semana' })
    expect(seg.status, 'el Líder también puede reeditarlo').toBe(200)
    expect(seg.body.numero, 'el folio no cambia al reeditar').toBe(ctx.folio)
    expect(seg.body.proximos_pasos).toBe('Volver en una semana')
    expect((await api('vendedor', 'GET', url)).body.numero, 'lo lee cualquiera que vea Servicios').toBe(ctx.folio)
  })

  test('3. fotos «antes/después»: solo con informe, categoría y tipo de archivo válidos', async () => {
    const sinInforme = await nuevoTicket('installation', 'inspection', 'Sin informe', ctx.tecnicoUser)
    expect((await subir('tecnico', `/servicios/tickets/${sinInforme}/inspection-report/photos`, { categoria: 'antes', file: { name: 'f.png', mimeType: 'image/png', buffer: PNG } })).status, 'primero el informe').toBe(422)

    const url = `/servicios/tickets/${ctx.inst}/inspection-report/photos`
    const foto = (extra: Record<string, any> = {}) => ({ categoria: 'antes', file: { name: 'f.png', mimeType: 'image/png', buffer: PNG }, ...extra })
    expect((await subir('tecnico', url, foto({ categoria: 'durante' }))).status, 'solo antes o después').toBe(422)
    expect((await subir('tecnico', url, foto({ file: { name: 'f.pdf', mimeType: 'application/pdf', buffer: PDF } }))).status, 'solo imágenes').toBe(422)
    expect((await subir('tecnicogarantias', url, foto())).status, 'otro técnico no adjunta').toBe(403)
    expect((await subir('vendedor', url, foto())).status).toBe(403)

    const antes = await subir('tecnico', url, foto())
    expect(antes.status).toBe(201)
    expect(antes.body).toMatchObject({ categoria: 'antes' })
    const despues = await subir('liderservicios', url, foto({ categoria: 'despues' }))
    expect(despues.status).toBe(201)

    const informe = (await api('vendedor', 'GET', `/servicios/tickets/${ctx.inst}/inspection-report`)).body
    expect(informe.fotos.map((f: any) => f.categoria).sort()).toEqual(['antes', 'despues'])
    const descarga = await req.fetch(antes.body.url)
    expect(descarga.status(), 'la URL de la foto se puede abrir').toBe(200)
    expect(descarga.headers()['content-type']).toMatch(/image\/png/)
  })

  test('4. modo «archivo subido»: exige el archivo la primera vez y reemplaza el formulario', async () => {
    ctx.archivo = await nuevoTicket('installation', 'inspection', 'Archivo', ctx.tecnicoUser)
    const url = `/servicios/tickets/${ctx.archivo}/inspection-report/upload`
    expect((await subir('tecnico', url, { firma_tecnico_nombre: 'Tecnico Test' })).status, 'la primera vez sin archivo no hay nada que completar').toBe(422)
    expect((await subir('tecnico', url, { archivo: { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } })).status, 'tipo de archivo no permitido').toBe(422)
    expect((await subir('vendedor', url, { archivo: { name: 'i.pdf', mimeType: 'application/pdf', buffer: PDF } })).status).toBe(403)

    const ok = await subir('tecnico', url, { archivo: { name: 'informe.pdf', mimeType: 'application/pdf', buffer: PDF }, firma_tecnico_nombre: 'Tecnico Test', firma_cliente_nombre: 'Cliente Flujo' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ modo: 'archivo_subido', estado: 'completed', conclusion: null })
    expect(ok.body.numero).toMatch(/^INF-/)
    expect(ok.body.archivo_adjunto_url).toBeTruthy()
    expect((await req.fetch(ok.body.archivo_adjunto_url)).status(), 'el adjunto se puede abrir').toBe(200)
    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ctx.archivo}`)).body.inspection_report_status).toBe('completed')

    const solo = await subir('tecnico', url, { firma_cliente_nombre: 'Otro Nombre' })
    expect(solo.status, 'reeditar sin archivo conserva el anterior').toBe(200)
    expect(solo.body.archivo_adjunto_url).toBeTruthy()
  })

  test('5. informe móvil: nombre y conclusión obligatorios, firma gráfica una sola vez', async () => {
    ctx.movil = await nuevoTicket('installation', 'inspection', 'Móvil', ctx.tecnicoUser)
    const url = `/servicios/tickets/${ctx.movil}/inspection-report/mobile`
    const payload = (o: Record<string, unknown> = {}) => JSON.stringify({ conclusion: 'Revisión móvil completa.', firma_cliente_nombre: 'Cliente Móvil', findings: [], ...o })
    const firma = { name: 'firma.png', mimeType: 'image/png', buffer: PNG }

    expect((await subir('tecnico', url, { payload: payload() })).status, 'la firma gráfica es obligatoria').toBe(422)
    expect((await subir('tecnico', url, { payload: payload(), firma_cliente_imagen: { name: 'f.pdf', mimeType: 'application/pdf', buffer: PDF } })).status, 'la firma es una imagen').toBe(422)
    expect((await subir('tecnico', url, { payload: payload({ conclusion: '' }), firma_cliente_imagen: firma })).status).toBe(422)
    expect((await subir('tecnico', url, { payload: payload({ firma_cliente_nombre: '' }), firma_cliente_imagen: firma })).status, 'quien firma debe tener nombre').toBe(422)
    expect((await subir('tecnico', url, { payload: 'no es json', firma_cliente_imagen: firma })).status).toBe(422)
    expect((await subir('tecnicogarantias', url, { payload: payload(), firma_cliente_imagen: firma })).status).toBe(403)
    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ctx.movil}/inspection-report`)).status, 'nada se guarda hasta confirmar la firma').toBe(404)

    const ok = await subir('tecnico', url, { payload: payload(), firma_cliente_imagen: firma })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ estado: 'completed', firma_cliente_nombre: 'Cliente Móvil' })
    expect(ok.body.firma_cliente_imagen_url).toBeTruthy()
    expect((await req.fetch(ok.body.firma_cliente_imagen_url)).status(), 'la firma se puede abrir').toBe(200)

    const otra = await subir('liderservicios', url, { payload: payload(), firma_cliente_imagen: firma })
    expect(otra.status, 'una firma confirmada no se reemplaza, ni el Líder').toBe(409)
  })

  test('6. PDF del informe (lleno y en blanco) y documentos de la cotización', async () => {
    const pdf = (rol: string, ruta: string) => fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${tokens[rol]}` } })
    const lleno = await pdf('vendedor', `/servicios/tickets/${ctx.inst}/inspection-report/pdf`)
    expect(lleno.status).toBe(200)
    expect(lleno.headers.get('content-type')).toBe('application/pdf')
    expect((await pdf('vendedor', `/servicios/tickets/${ctx.garantia}/inspection-report/pdf`)).status, 'sin informe no hay PDF').toBe(404)

    for (const rol of ['liderservicios', 'tecnico']) expect((await pdf(rol, `/servicios/tickets/${ctx.garantia}/inspection-report/pdf/blank`)).status, `plantilla en blanco para ${rol}`).toBe(200)
    for (const rol of ['vendedor', 'gerencia', 'tecnicogarantias']) expect((await pdf(rol, `/servicios/tickets/${ctx.garantia}/inspection-report/pdf/blank`)).status, `${rol} no baja la plantilla`).toBe(403)

    const id = ctx.garantia
    const bloqueada = await api('tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote`, {})
    expect(bloqueada.status, 'sin informe completado no se genera la cotización').toBe(422)
    expect(JSON.stringify(bloqueada.body)).toMatch(/Informe de Inspección/)
    expect((await api('tecnicogarantias', 'PUT', `/servicios/tickets/${id}/inspection-report`, { conclusion: 'Pieza defectuosa.', findings: [] })).status).toBe(200)
    expect((await pdf('vendedor', `/servicios/tickets/${id}/inspection-report/pdf`)).status, 'con informe ya hay PDF').toBe(200)

    expect((await api('tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote`, {})).status).toBe(201)
    expect((await api('tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote/items`, { tipo: 'labor', description: 'Mano de obra', quantity: 2, unit_price: 40 })).status).toBe(201)
    expect((await api('tecnicogarantias', 'PATCH', `/servicios/tickets/${id}/quote/enviar`)).status).toBe(200)
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/quote/decidir`, { estado: 'rejected' })).status).toBe(200)

    const hist = data((await api('vendedor', 'GET', `/servicios/tickets/${id}/quotes`)).body) as { id: number; estado: string; numero: string }[]
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ estado: 'rejected' })
    const doc = await pdf('vendedor', `/servicios/tickets/${id}/quote/${hist[0].id}/document`)
    expect(doc.status, 'el documento formal lo ve quien lee Servicios').toBe(200)
    expect(doc.headers.get('content-type')).toBe('application/pdf')
    expect((await pdf('vendedor', `/servicios/tickets/${id}/quote/99999999/document`)).status).toBe(404)
  })
})
