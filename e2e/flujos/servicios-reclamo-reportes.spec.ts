import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { API, data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Servicios, segunda parte (catálogo: atlanticerp-backend/docs/flujos/servicios-reclamo-reportes.md): la hoja de reclamo de un ticket de
// reclamo (quién la escribe, diagnóstico, bloqueo al completarla, PDF, cierre del ticket) y la pantalla de reportes (permisos, periodos, coherencia con los
// tickets y la biblioteca de documentos). Por la API real y con la cuenta de cada rol; crea sus propios tickets «[FLUJO]». UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['liderservicios', 'tecnico', 'tecnicogarantias', 'vendedor', 'gerencia', 'contabilidad'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 19)
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Servicios: hoja de reclamo y reportes', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
    const lista = data((await api('liderservicios', 'GET', '/servicios/internal-technicians')).body) as { user_id: number; email: string }[]
    ctx.tecnicoUser = lista.find(t => t.email === 'tecnico@test.com')!.user_id
  })

  test.afterAll(async () => { await req.dispose() })

  test('1. hoja de reclamo: solo tickets de reclamo, precarga vacía y quién puede escribirla', async () => {
    const base = { tipo: 'claim', tipo_instalacion: 'internal', descripcion: `[FLUJO] Reclamo ${STAMP}`, contacto: 'Contacto Flujo', telefono: '6000-0000', direccion: 'Dirección de flujo' }
    const t = await api('vendedor', 'POST', '/servicios/tickets', base)
    expect(t.status).toBe(201)
    expect(t.body.numero).toMatch(/^REC-\d{4}-\d{4}$/)
    ctx.reclamo = t.body.id
    ctx.reclamoNumero = t.body.numero

    const ins = await api('vendedor', 'POST', '/servicios/tickets', { ...base, tipo: 'installation', subtipo: 'installation' })
    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ins.body.id}/claim-sheet`)).status, 'un ticket que no es reclamo no tiene hoja').toBe(422)
    expect((await api('liderservicios', 'GET', '/servicios/tickets/99999999/claim-sheet')).status).toBe(404)

    const vacia = await api('vendedor', 'GET', `/servicios/tickets/${ctx.reclamo}/claim-sheet`)
    expect(vacia.status, 'cualquiera que vea Servicios la lee').toBe(200)
    expect(vacia.body).toMatchObject({ estado: 'pending', id: null, diagnostico: null })
    expect(vacia.body.reclamante.contacto, 'el reclamante sale del ticket').toBe('Contacto Flujo')

    const hoja = { descripcion_problema: 'La luminaria parpadea', fecha_reclamo: '2026-11-01', diagnostico: 'defectuoso', firma_responsable: 'Firma Flujo' }
    ctx.hoja = hoja
    const url = `/servicios/tickets/${ctx.reclamo}/claim-sheet`
    expect((await api('vendedor', 'PUT', url, hoja)).status).toBe(403)
    expect((await api('tecnicogarantias', 'PUT', url, hoja)).status, 'garantías no atiende reclamos').toBe(403)
    expect((await api('gerencia', 'PUT', url, hoja)).status, 'Gerencia ve pero no escribe').toBe(403)
    const ajeno = await api('tecnico', 'PUT', url, hoja)
    expect(ajeno.status, 'el técnico solo escribe la hoja de su ticket').toBe(403)
    expect(ajeno.body.message).toMatch(/técnico interno asignado/)
  })

  test('2. guardar la hoja: diagnóstico de una lista, firma obligatoria, se completa de una vez y queda bloqueada', async () => {
    const url = `/servicios/tickets/${ctx.reclamo}/claim-sheet`
    expect((await api('liderservicios', 'PUT', url, { ...ctx.hoja, diagnostico: 'otro' })).status, 'el diagnóstico sale de una lista').toBe(422)
    expect((await api('liderservicios', 'PUT', url, { ...ctx.hoja, diagnostico: '' })).status).toBe(422)
    expect((await api('liderservicios', 'PUT', url, { ...ctx.hoja, firma_responsable: undefined })).status, 'la firma es obligatoria').toBe(422)
    expect((await api('liderservicios', 'GET', `${url}/pdf`)).status, 'sin hoja completada no hay PDF').toBe(404)

    const agenda = await api('liderservicios', 'PATCH', `/servicios/tickets/${ctx.reclamo}/agendar`, { internal_technician_id: ctx.tecnicoUser, scheduled_at: enDias(3) })
    expect(agenda.status).toBe(200)
    const ok = await api('tecnico', 'PUT', url, ctx.hoja)
    expect(ok.status, 'el técnico asignado la guarda').toBe(200)
    expect(ok.body).toMatchObject({ estado: 'completed', diagnostico: 'defectuoso', fecha_reclamo: '2026-11-01' })
    expect(ok.body.reclamante.responsable, 'el responsable es el técnico asignado').toBe('Tecnico Test')

    const otra = await api('liderservicios', 'PUT', url, ctx.hoja)
    expect(otra.status, 'una hoja completada no se edita, ni el Líder').toBe(409)
    expect(otra.body.message).toMatch(/ya fue completada/)

    const pdf = await fetch(`${API}${url}/pdf`, { headers: { Authorization: `Bearer ${tokens.vendedor}` } })
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
  })

  test('3. cerrar el reclamo: la hoja no es compuerta, la cotización aprobada sí', async () => {
    const id = ctx.reclamo
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'on_site' })).status).toBe(200)
    const sinCotizar = await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'resolved' })
    expect(sinCotizar.status, 'con la hoja completada igual exige cotización aprobada').toBe(422)
    expect(sinCotizar.body.message).toMatch(/aprobar la cotización/)

    expect((await api('liderservicios', 'POST', `/servicios/tickets/${id}/quote`, {})).status).toBe(201)
    expect((await api('liderservicios', 'POST', `/servicios/tickets/${id}/quote/items`, { tipo: 'labor', description: 'Reparación', quantity: 1, unit_price: 25 })).status).toBe(201)
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/quote/enviar`)).status).toBe(200)
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/quote/decidir`, { estado: 'approved' })).status).toBe(200)
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'resolved' })).status).toBe(200)
    expect((await api('liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'closed' })).status).toBe(200)
  })

  test('4. informe de inspección en blanco: el Líder y el técnico interno, no garantías ni Gerencia', async () => {
    const g = await api('liderservicios', 'POST', '/servicios/tickets', { tipo: 'warranty', subtipo: 'replacement_inspection', tipo_instalacion: 'internal', descripcion: `[FLUJO] Garantía en blanco ${STAMP}` })
    expect(g.status).toBe(201)
    const url = `/servicios/tickets/${g.body.id}/inspection-report/pdf/blank`
    expect((await api('vendedor', 'GET', url)).status).toBe(403)
    expect((await api('gerencia', 'GET', url)).status, 'Gerencia solo ve').toBe(403)
    expect((await api('tecnicogarantias', 'GET', url)).status, 'garantías queda fuera igual que en la hoja').toBe(403)
    expect((await api('tecnico', 'GET', url)).status, 'el técnico interno sí').toBe(200)
    const blanco = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${tokens.liderservicios}` } })
    expect(blanco.status).toBe(200)
    expect(blanco.headers.get('content-type')).toBe('application/pdf')
    expect((await api('liderservicios', 'GET', `/servicios/tickets/${ctx.reclamo}/inspection-report`)).status, 'un reclamo no tiene informe de inspección').toBe(404)
  })

  test('5. reportes: quién los ve, periodos y coherencia con los tickets', async () => {
    const lecturas = ['panorama-mes', 'instalaciones-cotizadas-vs-realizadas', 'distribucion-tipo', 'distribucion-tecnico', 'completados-anio', 'biblioteca']
    for (const r of lecturas) {
      for (const rol of ['liderservicios', 'gerencia', 'vendedor', 'tecnico']) expect((await api(rol, 'GET', `/servicios/reportes/${r}`)).status, `${rol} ve ${r}`).toBe(200)
      expect((await api('contabilidad', 'GET', `/servicios/reportes/${r}`)).status, `contabilidad no ve ${r}`).toBe(403)
    }
    // La comisión del técnico es más angosta: el propio técnico y Gerencia; ni el Líder ni el vendedor.
    expect((await api('tecnico', 'GET', '/servicios/reportes/comision-tecnico')).status).toBe(200)
    expect((await api('gerencia', 'GET', '/servicios/reportes/comision-tecnico')).status).toBe(200)
    expect((await api('liderservicios', 'GET', '/servicios/reportes/comision-tecnico')).status).toBe(403)
    expect((await api('vendedor', 'GET', '/servicios/reportes/comision-tecnico')).status).toBe(403)

    expect((await api('liderservicios', 'GET', '/servicios/reportes/panorama-mes?month=13&year=2026')).status).toBe(422)
    expect((await api('liderservicios', 'GET', '/servicios/reportes/completados-anio?year=1800')).status).toBe(422)
    const mes = (await api('liderservicios', 'GET', '/servicios/reportes/panorama-mes?month=11&year=2026')).body
    expect(Object.keys(mes)).toEqual(expect.arrayContaining(['servicios_completados', 'servicios_completados_total', 'resuelto_primera_visita_pct', 'informes_pendientes']))
    const anio = data((await api('liderservicios', 'GET', '/servicios/reportes/completados-anio')).body) as { mes: number; por_tipo: Record<string, number>; total: number }[]
    expect(anio.map(m => m.mes), 'el año en curso llega hasta el mes actual').toEqual(Array.from({ length: anio.length }, (_, i) => i + 1))
    expect(data((await api('liderservicios', 'GET', '/servicios/reportes/completados-anio?year=2024')).body), 'un año pasado trae los 12 meses').toHaveLength(12)
    expect(anio.every(m => Object.values(m.por_tipo).reduce((a, b) => a + b, 0) === m.total), 'cada mes suma sus tipos').toBe(true)

    // Un ticket nuevo suma 1 a su tipo en la distribución del mes.
    const cuenta = async () => (data((await api('liderservicios', 'GET', '/servicios/reportes/distribucion-tipo')).body) as { tipo: string; count: number }[]).find(x => x.tipo === 'claim')!.count
    const antes = await cuenta()
    expect((await api('vendedor', 'POST', '/servicios/tickets', { tipo: 'claim', tipo_instalacion: 'internal', descripcion: `[FLUJO] Reclamo suma ${STAMP}` })).status).toBe(201)
    expect(await cuenta()).toBe(antes + 1)
  })

  test('6. biblioteca de documentos: la hoja completada aparece y se filtra por tipo y por folio', async () => {
    const porFolio = await api('liderservicios', 'GET', `/servicios/reportes/biblioteca?search=${ctx.reclamoNumero}`)
    expect(porFolio.status).toBe(200)
    const fila = (data(porFolio.body) as any[]).find(d => d.ticket_numero === ctx.reclamoNumero)
    expect(fila, 'la hoja completada está en la biblioteca').toMatchObject({ tipo_documento: 'claim_sheet', estado: 'completed', tecnico: 'Tecnico Test' })
    const hojas = await api('liderservicios', 'GET', '/servicios/reportes/biblioteca?tipo_documento=claim_sheet')
    expect((data(hojas.body) as any[]).every(d => d.tipo_documento === 'claim_sheet')).toBe(true)
    const informes = await api('liderservicios', 'GET', '/servicios/reportes/biblioteca?tipo_documento=inspection_report')
    expect((data(informes.body) as any[]).every(d => d.tipo_documento === 'inspection_report')).toBe(true)
    expect(porFolio.body.meta).toMatchObject({ current_page: 1 })
    expect((await api('liderservicios', 'GET', '/servicios/reportes/biblioteca?search=NO-EXISTE-' + STAMP)).body.meta.total).toBe(0)
  })
})
