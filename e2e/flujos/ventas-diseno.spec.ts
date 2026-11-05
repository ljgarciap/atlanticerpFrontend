import { test, expect, type APIRequestContext } from '@playwright/test'
import { API, data, iniciarSesion, llamar, rucUnico, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de Ventas & Diseño fuera de la cadena venta → cobro (catálogo: atlanticerp-backend/docs/flujos/ventas-diseno.md): quién ve qué,
// clientes y sus contactos, arquitectos y asociados, alcance «Mías / Equipo», catálogo (búsqueda, PDF, ficha técnica), calendario, Inicio, tablero,
// reportes, proyectos y ajustes. Por la API real y con la cuenta de cada rol. La cotización y las compuertas del pipeline ya las recorre
// `venta-a-cobro.spec.ts`. Los clientes, arquitectos y tarjetas que crea llevan «[F11A]» y NO se pueden borrar (la API no ofrece baja); solo el
// aislamiento por STAMP evita choques entre corridas. Correr con UN worker (npm run e2e:flujos).

const ROLES = ['vendedor', 'vendedor2', 'gerencia', 'gerencia3', 'contabilidad', 'lidercompras', 'tecnico', 'superadmin'] as const
const STAMP = String(Date.now())
const VD = '/ventas-diseno'
const ctx: Record<string, any> = {}
let tokens: Tokens
let req: APIRequestContext

const api = (rol: (typeof ROLES)[number], method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Ventas & Diseño', () => {
  test.beforeAll(async ({ playwright }) => {
    req = await playwright.request.newContext()
    tokens = await iniciarSesion(req, ROLES)
  })
  test.afterAll(async () => { await req.dispose() })

  test('1. matriz de acceso: qué rol entra a cada pantalla', async () => {
    // [ruta, vendedor, gerencia, contabilidad, lidercompras, tecnico, superadmin]. Fase 23: Gerencia lee los ajustes de precios, Pedidos, tramos y metas. Fase 21: Contabilidad solo crea y vincula (Pipeline y alta de clientes por sus rutas angostas), no lee el resto del módulo.
    const matriz: [string, ...number[]][] = [
      ['/clients', 200, 200, 403, 403, 403, 200],
      ['/architects', 200, 200, 403, 403, 403, 200],
      ['/catalog', 200, 200, 403, 403, 403, 200],
      ['/calendar', 200, 200, 403, 403, 403, 200],
      ['/home/summary', 200, 200, 403, 403, 403, 200],
      ['/reports/summary', 200, 200, 403, 403, 403, 200],
      ['/reports/commissions', 200, 200, 403, 403, 403, 200],
      ['/projects', 200, 200, 403, 403, 403, 200],
      ['/dashboard/summary', 403, 200, 403, 403, 403, 200],
      ['/orders', 403, 200, 403, 200, 403, 200],
      ['/audit-log', 403, 403, 403, 403, 403, 200],
      ['/pricing-settings', 403, 200, 403, 403, 403, 200],
      ['/orders-settings', 403, 200, 403, 403, 403, 200],
      ['/quote-conditions-settings', 403, 403, 403, 403, 403, 200],
      ['/sales-commission-tiers', 403, 200, 403, 403, 403, 200],
      ['/reports/goals', 403, 200, 403, 403, 403, 200],
    ]
    const orden = ['vendedor', 'gerencia', 'contabilidad', 'lidercompras', 'tecnico', 'superadmin'] as const
    for (const [ruta, ...esperados] of matriz) {
      for (let i = 0; i < orden.length; i++) {
        expect((await api(orden[i], 'GET', `${VD}${ruta}`)).status, `${orden[i]} GET ${ruta}`).toBe(esperados[i])
      }
    }
  })

  test('2. clientes: alta con contacto, validaciones, búsqueda y detalle', async () => {
    const vacio = await api('vendedor', 'POST', `${VD}/clients`, {})
    expect(vacio.status).toBe(422)
    expect(Object.keys(vacio.body.errors)).toEqual(expect.arrayContaining(['name', 'business_name', 'tax_id', 'contacts']))
    expect((await api('tecnico', 'POST', `${VD}/clients`, {})).status, 'sin acceso al módulo').toBe(403)

    const { tax_id: ruc } = rucUnico()
    const alta = await api('vendedor', 'POST', `${VD}/clients`, {
      name: `[F11A] Cliente ${STAMP}`, business_name: `[F11A] Sub ${STAMP} S.A.`, tax_id: ruc, tax_id_dv: '12', receptor_tipo: '01',
      contacts: [{ name: 'Contacto Uno', role: 'client', email: `uno.${STAMP}@example.test` }],
    })
    expect(alta.status, JSON.stringify(alta.body).slice(0, 200)).toBe(201)
    ctx.mc = alta.body.id
    ctx.sc = alta.body.sub_clients[0].id
    ctx.contacto = alta.body.sub_clients[0].contacts[0].id

    // Una identificación fiscal por tenant: el mismo número, con o sin formato, se rechaza con el cliente existente; con otro DV se acepta.
    const dup = await api('vendedor', 'POST', `${VD}/clients`, {
      name: `[F11A] Cliente dup ${STAMP}`, business_name: `[F11A] Dup ${STAMP} S.A.`, tax_id: ruc.replace(/-/g, ''), tax_id_dv: '12', receptor_tipo: '01',
      contacts: [{ name: 'Contacto Dup', role: 'client', email: `dup.${STAMP}@example.test` }],
    })
    expect(dup.status, 'la misma identificación se rechaza aunque cambie el formato').toBe(409)
    expect(dup.body.code).toBe('duplicate_tax_id')
    expect(dup.body.existing.sub_client_id).toBe(ctx.sc)
    expect(dup.body.existing.master_client_id).toBe(ctx.mc)
    const otroDv = await api('vendedor', 'POST', `${VD}/clients`, {
      name: `[F11A] Cliente dv ${STAMP}`, business_name: `[F11A] Dv ${STAMP} S.A.`, tax_id: ruc, tax_id_dv: '13', receptor_tipo: '01',
      contacts: [{ name: 'Contacto Dv', role: 'client', email: `dv.${STAMP}@example.test` }],
    })
    expect(otroDv.status, 'otro DV es otra identificación').toBe(201)
    ctx.scDv = otroDv.body.sub_clients[0].id

    const lista = await api('vendedor2', 'GET', `${VD}/clients?search=${encodeURIComponent(`[F11A] Cliente ${STAMP}`)}`)
    expect(lista.status).toBe(200)
    expect((data(lista.body) as { id: number }[]).map(c => c.id), 'los clientes son globales: otro vendedor lo ve').toContain(ctx.mc)
    expect(lista.body.meta.total).toBe(1)

    const det = await api('vendedor', 'GET', `${VD}/clients/${ctx.mc}`)
    expect(det.status).toBe(200)
    expect(det.body.sub_clients[0].tax_id).toBe(ruc)
    expect((await api('vendedor', 'GET', `${VD}/clients/${ctx.mc}/projects`)).status).toBe(200)
    expect((await api('vendedor', 'GET', `${VD}/clients/99999999`)).status).toBe(404)
    expect((await api('vendedor', 'GET', `${VD}/clients/abc`)).status, 'id no numérico').toBe(404)
  })

  test('3. subclientes: categoría, datos fiscales, contactos y directorio fiscal', async () => {
    const nuevo = await api('vendedor', 'POST', `${VD}/clients/${ctx.mc}/sub-clients`, { business_name: `[F11A] Sub2 ${STAMP}` })
    expect(nuevo.status, 'un subcliente también exige RUC y contacto').toBe(422)

    expect((await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/category`, { category: 'zzz' })).status).toBe(422)
    const cat = await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/category`, { category: 'b_architect_designer' })
    expect(cat.status).toBe(200)
    expect(cat.body.category).toBe('b_architect_designer')

    expect((await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/tax-data`, { delivery_address: 'Calle 1' })).status, 'los datos fiscales se envían completos').toBe(422)
    const lista = await api('vendedor', 'GET', `${VD}/clients/${ctx.mc}`)
    const sc = lista.body.sub_clients[0]
    const fiscal = await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/tax-data`, {
      business_name: `[F11A] Sub ${STAMP} Editada S.A.`, tax_id: sc.tax_id, tax_id_dv: sc.tax_id_dv, receptor_tipo: sc.receptor_tipo, delivery_address: 'Calle 1',
    })
    expect(fiscal.status, JSON.stringify(fiscal.body).slice(0, 200)).toBe(200)
    expect(fiscal.body.business_name).toContain('Editada')
    const choque = await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.scDv}/tax-data`, {
      business_name: `[F11A] Dv ${STAMP} S.A.`, tax_id: sc.tax_id, tax_id_dv: sc.tax_id_dv, receptor_tipo: '01',
    })
    expect(choque.status, 'editar los datos fiscales hacia una identificación ajena también se rechaza').toBe(409)
    expect(choque.body.existing.sub_client_id).toBe(ctx.sc)

    const validar = await api('vendedor', 'POST', `${VD}/clients/validate-tax-id`, { tax_id: sc.tax_id, tax_id_dv: sc.tax_id_dv })
    expect(validar.status).toBe(200)
    expect(validar.body, 'sin proveedor fiscal la consulta responde «no disponible», no falla').toHaveProperty('disponible')

    for (const rol of ['vendedor', 'contabilidad', 'gerencia'] as const) expect((await api(rol, 'GET', `${VD}/clients/fiscal-directory`)).status, `${rol} ve el directorio fiscal`).toBe(200)
    expect((await api('lidercompras', 'GET', `${VD}/clients/fiscal-directory`)).status).toBe(403)

    // Contactos propios del subcliente.
    expect((await api('vendedor', 'POST', `${VD}/sub-clients/${ctx.sc}/contacts`, { name: 'Rol malo', role: 'jefe', email: 'x@example.test' })).status).toBe(422)
    expect((await api('vendedor', 'POST', `${VD}/sub-clients/${ctx.sc}/contacts`, { name: 'Sin medio', role: 'other' })).status, 'exige correo o teléfono').toBe(422)
    const c2 = await api('vendedor', 'POST', `${VD}/sub-clients/${ctx.sc}/contacts`, { name: 'Contacto Dos', role: 'architect', phone: '6000-2222' })
    expect(c2.status).toBe(201)
    expect((await api('vendedor', 'PUT', `${VD}/sub-clients/${ctx.sc}/contacts/${c2.body.id}`, { name: 'Contacto Dos Editado' })).status, 'la edición reenvía todos los campos').toBe(422)
    const ed = await api('vendedor', 'PUT', `${VD}/sub-clients/${ctx.sc}/contacts/${c2.body.id}`, { name: 'Contacto Dos Editado', role: 'architect', phone: '6000-2222' })
    expect(ed.status, JSON.stringify(ed.body).slice(0, 200)).toBe(200)
    expect((await api('vendedor', 'DELETE', `${VD}/sub-clients/${ctx.sc}/contacts/${c2.body.id}`)).status).toBe(204)
    // Fase 23 (#2): el último contacto no se borra (el alta exige uno).
    const ultimo = await api('vendedor', 'DELETE', `${VD}/sub-clients/${ctx.sc}/contacts/${ctx.contacto}`)
    expect(ultimo.status).toBe(422)
    expect(ultimo.body.code).toBe('last_contact')
    expect(data((await api('vendedor', 'GET', `${VD}/sub-clients/${ctx.sc}/contacts`)).body)).toHaveLength(1)
    expect((await api('lidercompras', 'GET', `${VD}/sub-clients/${ctx.sc}/contacts`)).status).toBe(403)
  })

  test('4. arquitectos: alta, duplicado, edición y filtros', async () => {
    const vacio = await api('vendedor', 'POST', `${VD}/architects`, {})
    expect(vacio.status).toBe(422)
    expect((await api('vendedor', 'POST', `${VD}/architects`, { name: `[F11A] Mal ${STAMP}`, type: 'zzz', email: `mal.${STAMP}@example.test` })).status).toBe(422)

    const email = `arq.${STAMP}@example.test`
    const alta = await api('vendedor', 'POST', `${VD}/architects`, { name: `[F11A] Arq ${STAMP}`, type: 'architect', email, phone: `6${STAMP.slice(-6)}1` })
    expect(alta.status).toBe(201)
    ctx.arq = alta.body.id

    const dup = await api('vendedor', 'POST', `${VD}/architects`, { name: `[F11A] Arq otro ${STAMP}`, type: 'designer', email })
    expect(dup.status, 'mismo correo, teléfono o documento').toBe(409)
    expect(dup.body.code).toBe('duplicate_exact')
    expect(dup.body.duplicates[0].id).toBe(ctx.arq)

    const det = await api('vendedor', 'GET', `${VD}/architects/${ctx.arq}`)
    expect(det.status).toBe(200)
    expect(det.body.projects).toEqual([])
    expect((await api('vendedor', 'GET', `${VD}/architects/99999999`)).status).toBe(404)

    const ed = await api('vendedor', 'PUT', `${VD}/architects/${ctx.arq}`, { name: `[F11A] Arq ${STAMP} Editado`, phone: `6${STAMP.slice(-6)}2` })
    expect(ed.status).toBe(200)
    expect(ed.body.name).toContain('Editado')
    expect(ed.body.phone).toBe(`6${STAMP.slice(-6)}2`)

    expect(data((await api('vendedor', 'GET', `${VD}/architects?search=${encodeURIComponent(`F11A] Arq ${STAMP}`)}`)).body)).toHaveLength(1)
    expect(data((await api('vendedor', 'GET', `${VD}/architects?type=designer&search=${STAMP}`)).body), 'el filtro por tipo excluye al arquitecto').toHaveLength(0)
    expect((await api('contabilidad', 'POST', `${VD}/architects`, {})).status, 'Contabilidad ya no da de alta asociados (Fase 21)').toBe(403)
    expect((await api('tecnico', 'GET', `${VD}/architects`)).status).toBe(403)
  })

  test('5. tarjeta de pipeline: asociados, contactos, perdido, y quién puede tocarla', async () => {
    const tarjeta = await api('vendedor', 'POST', `${VD}/pipeline`, { type: 'lead', name: `[F11A] Lead ${STAMP}`, sub_client_id: ctx.sc })
    expect(tarjeta.status).toBe(201)
    ctx.card = tarjeta.body.id

    // Asociados: el mismo dos veces no duplica.
    expect((await api('vendedor', 'POST', `${VD}/pipeline/${ctx.card}/associates`, { architect_id: ctx.arq })).status).toBe(201)
    const otra = await api('vendedor', 'POST', `${VD}/pipeline/${ctx.card}/associates`, { architect_id: ctx.arq })
    expect(otra.status).toBe(201)
    expect(data(otra.body), 'asociar dos veces no duplica').toHaveLength(1)
    // El detalle del arquitecto lista solo los proyectos donde es el «arquitecto de comisión» de una cotización, no donde es un asociado.
    expect((await api('vendedor', 'GET', `${VD}/architects/${ctx.arq}`)).body.projects, 'un asociado no aparece en los proyectos del arquitecto').toEqual([])
    expect((await api('vendedor', 'DELETE', `${VD}/pipeline/${ctx.card}/associates/${ctx.arq}`)).status).toBe(200)

    // Salir de Lead exige al menos un contacto en la tarjeta (distinto de los contactos del subcliente).
    const sinContacto = await api('vendedor', 'PATCH', `${VD}/pipeline/${ctx.card}/stage`, { stage: 'design' })
    expect(sinContacto.status).toBe(422)
    expect(sinContacto.body.message).toMatch(/contacto/)
    const ct = await api('vendedor', 'POST', `${VD}/pipeline/${ctx.card}/contacts`, { name: 'Contacto Tarjeta', role: 'other', phone: '6000-3333' })
    expect(ct.status).toBe(201)
    const tmp = await api('vendedor', 'POST', `${VD}/pipeline/${ctx.card}/contacts`, { name: 'Contacto Temporal', role: 'client', email: `tmp.${STAMP}@example.test` })
    expect((await api('vendedor', 'DELETE', `${VD}/pipeline/${ctx.card}/contacts/${tmp.body.id}`)).status).toBe(204)

    // Pedir el pase a pedido solo vale desde «Aprobado».
    const pedir = await api('vendedor', 'POST', `${VD}/pipeline/${ctx.card}/request-pass-to-order`, { note: 'prueba' })
    expect(pedir.status).toBe(422)
    expect(pedir.body.message).toMatch(/Aprobado/)

    // «Perdido» exige un motivo (mínimo 10 caracteres) que queda guardado; reactivarlo lo decide el aprobador primario (o un suplente), también con motivo.
    const url = `${VD}/pipeline/${ctx.card}/stage`
    expect((await api('vendedor', 'PATCH', url, { stage: 'lost' })).status, 'perder sin motivo').toBe(422)
    expect((await api('vendedor', 'PATCH', url, { stage: 'lost', motivo: 'corto' })).status, 'motivo de menos de 10 caracteres').toBe(422)
    const perdida = await api('vendedor', 'PATCH', url, { stage: 'lost', motivo: 'Se fue con la competencia' })
    expect(perdida.body).toMatchObject({ stage: 'lost', lost_reason: 'Se fue con la competencia', can_reactivate: false })
    expect((await api('vendedor', 'PATCH', url, { stage: 'lead', motivo: 'Quiero retomarlo, por favor' })).status, 'el dueño de la tarjeta no la reactiva').toBe(403)
    expect((await api('gerencia', 'PATCH', url, { stage: 'lead', motivo: 'Gerencia sin ser el aprobador' })).status, 'Gerencia tampoco, si no es el aprobador configurado').toBe(403)
    expect((await api('gerencia3', 'PATCH', url, { stage: 'lead' })).status, 'el aprobador también debe dar un motivo').toBe(422)
    const reabierta = await api('gerencia3', 'PATCH', url, { stage: 'lead', motivo: 'El cliente volvió a escribir' })
    expect(reabierta.body).toMatchObject({ stage: 'lead', reopened_reason: 'El cliente volvió a escribir', lost_reason: 'Se fue con la competencia' })

    // Quién puede tocarla.
    expect((await api('vendedor2', 'PATCH', `${VD}/pipeline/${ctx.card}/stage`, { stage: 'design' })).status, 'otro vendedor no mueve la tarjeta').toBe(403)
    expect((await api('vendedor2', 'PUT', `${VD}/pipeline/${ctx.card}`, { name: 'ajena' })).status).toBe(403)
    expect((await api('vendedor2', 'GET', `${VD}/pipeline/${ctx.card}`)).status, 'ni la ve').toBe(403)
    expect((await api('contabilidad', 'GET', `${VD}/pipeline/${ctx.card}`)).status, 'Contabilidad la ve').toBe(200)
    // Fase 26b: Contabilidad ve todo el Pipeline (`pipeline.read_all`) en SOLO LECTURA: no crea, no edita ni mueve tarjetas (ni ajenas ni propias).
    expect((await api('contabilidad', 'GET', `${VD}/pipeline/${ctx.card}`)).body.can_edit, 'la tarjeta no es editable para Contabilidad').toBe(false)
    expect((await api('contabilidad', 'PATCH', `${VD}/pipeline/${ctx.card}/stage`, { stage: 'design' })).status, 'Contabilidad no mueve la tarjeta').toBe(403)
    expect((await api('contabilidad', 'PUT', `${VD}/pipeline/${ctx.card}`, { name: 'ajena' })).status).toBe(403)
    expect((await api('contabilidad', 'POST', `${VD}/pipeline`, { type: 'lead', name: `[F11A] Lead Contabilidad ${STAMP}`, sub_client_id: ctx.sc })).status, 'Contabilidad no crea proyectos').toBe(403)
    expect((await api('gerencia', 'PUT', `${VD}/pipeline/${ctx.card}`, { name: `[F11A] Lead ${STAMP} Gerencia` })).status, 'Gerencia sí edita la de otro').toBe(200)
  })

  test('6. alcance «Mías / Equipo»: cada rol ve solo lo suyo salvo los que ven al equipo', async () => {
    const total = async (rol: (typeof ROLES)[number], q: string) => (await api(rol, 'GET', `${VD}/pipeline?per_page=100&search=${encodeURIComponent(`F11A] Lead ${STAMP}`)}${q}`)).body
    const ids = (b: any) => (data(b) as { id: number }[]).map(c => c.id)
    expect(ids(await total('vendedor', '')), 'el dueño la ve').toContain(ctx.card)
    expect(ids(await total('vendedor2', '')), 'otro vendedor no').not.toContain(ctx.card)
    expect((await api('vendedor2', 'GET', `${VD}/pipeline?scope=team`)).status, 'pedir «equipo» sin permiso de equipo responde 403').toBe(403)
    expect(ids(await total('gerencia', '&scope=team'))).toContain(ctx.card)
    expect(ids(await total('gerencia', '')), 'Gerencia sin pedir equipo ve solo lo suyo').not.toContain(ctx.card)
    expect(ids(await total('contabilidad', '&scope=team')), 'Contabilidad lee el equipo').toContain(ctx.card)

    // Los reportes y el Inicio obedecen el mismo alcance.
    // Fase 23 (#8): en Inicio, Reportes, cotizaciones, proyectos, comisiones y calendario, pedir «equipo» sin verlo es 403 (antes se degradaba en silencio).
    for (const ruta of ['reports/summary', 'reports/commissions', 'home/summary', 'quotes', 'projects', 'calendar-events']) {
      const r = await api('vendedor2', 'GET', `${VD}/${ruta}?scope=team`)
      expect(r.status, ruta).toBe(403)
      expect(r.body.code).toBe('team_scope_forbidden')
    }
    const propio = (await api('vendedor2', 'GET', `${VD}/reports/summary`)).body
    expect(propio.scope).toBe('own')
    expect(propio).not.toHaveProperty('top_vendors')
    const equipo = (await api('gerencia', 'GET', `${VD}/reports/summary?scope=team`)).body
    expect(equipo.scope).toBe('team')
    expect(equipo).toHaveProperty('top_vendors')
    expect(equipo).toHaveProperty('forecast')
    expect(data((await api('vendedor', 'GET', `${VD}/home/vendors`)).body), 'la lista de vendedores es solo para quien ve al equipo').toEqual([])
    expect((data((await api('gerencia', 'GET', `${VD}/home/vendors`)).body) as unknown[]).length).toBeGreaterThan(0)
  })

  test('7. Inicio, tablero de Gerencia, comisiones de vendedor y lista de proyectos', async () => {
    const inicio = (await api('vendedor', 'GET', `${VD}/home/summary`)).body
    expect(Object.keys(inicio)).toEqual(expect.arrayContaining(['final_stage', 'pendientes', 'events_today_count', 'performance']))
    expect(data((await api('vendedor', 'GET', `${VD}/home/approvals-pending`)).body), 'la tarjeta de aprobaciones siempre está vacía').toEqual([])

    const tablero = (await api('gerencia', 'GET', `${VD}/dashboard/summary`)).body
    expect(Object.keys(tablero)).toEqual(expect.arrayContaining(['alerts', 'stage_counts', 'totals', 'by_tag']))
    expect(Object.keys(tablero.stage_counts)).toEqual(expect.arrayContaining(['lead', 'design', 'quote', 'proposal', 'approved', 'lost']))
    const recordar = await api('gerencia', 'POST', `${VD}/dashboard/remind`, {})
    expect([200, 422], 'recordar solo tiene sentido con propuestas vencidas').toContain(recordar.status)
    expect((await api('vendedor', 'POST', `${VD}/dashboard/remind`, {})).status).toBe(403)

    const com = (await api('vendedor', 'GET', `${VD}/reports/commissions`)).body
    expect(Object.keys(com)).toEqual(expect.arrayContaining(['paid', 'pending', 'final_stage', 'cohorts']))
    // Fase 23 (#10): pagar la comisión de vendedores es de Gerencia (por nivel de seguridad) y del superadmin.
    for (const rol of ['vendedor', 'contabilidad'] as const) expect((await api(rol, 'PATCH', `${VD}/reports/commissions/999999/mark-paid`, {})).status, `${rol} no paga comisiones`).toBe(403)
    for (const rol of ['gerencia', 'superadmin'] as const) expect((await api(rol, 'PATCH', `${VD}/reports/commissions/999999/mark-paid`, {})).status, `${rol} sí llega (cohorte inexistente)`).toBe(404)

    const proyectos = await api('vendedor', 'GET', `${VD}/projects?per_page=5`)
    expect(proyectos.status).toBe(200)
    expect(data(proyectos.body).length).toBeGreaterThan(0)
    const csv = await fetch(`${API}${VD}/projects/export`, { headers: { Authorization: `Bearer ${tokens.vendedor}` } })
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/)
    const cuerpo = await csv.text()
    expect(cuerpo.replace(/^﻿/, '').split('\n')[0]).toBe('Proyecto,Cliente,Etapa,Etiqueta,Responsable,Valor,"Superficie trabajada","Días en etapa","Fecha de entrega",Archivos')
    expect(cuerpo, 'la exportación trae la tarjeta propia').toContain(`[F11A] Lead ${STAMP}`)
  })

  test('8. catálogo: búsqueda, detalle, familias, PDF y ficha técnica', async () => {
    const lista = await api('vendedor', 'GET', `${VD}/catalog?per_page=5`)
    expect(lista.status).toBe(200)
    expect(lista.body).toHaveProperty('families')
    const prods = data(lista.body) as { id: number; reference: string; disponible: number; stock_aparte: number; en_camino: number }[]
    expect(prods.length).toBeGreaterThan(0)
    expect(Object.keys(prods[0])).toEqual(expect.arrayContaining(['reference', 'price_full', 'disponible', 'stock_aparte', 'en_camino', 'has_technical_sheet']))
    ctx.prod = prods[prods.length - 1].id

    expect(data((await api('vendedor', 'GET', `${VD}/catalog?search=zzzzzzzz`)).body)).toHaveLength(0)
    expect((await api('vendedor', 'GET', `${VD}/catalog/${prods[0].id}`)).body.reference).toBe(prods[0].reference)
    expect((await api('vendedor', 'GET', `${VD}/catalog/99999999`)).status).toBe(404)
    expect((await api('vendedor', 'GET', `${VD}/catalog/abc`)).status).toBe(404)

    const fam = await api('vendedor', 'GET', `${VD}/catalog-product-families`)
    expect(fam.status).toBe(200)
    expect((data(fam.body) as { products_count: number }[])[0]).toHaveProperty('products_count')
    expect((await api('lidercompras', 'GET', `${VD}/catalog-product-families`)).status, 'Compras lee las familias para su filtro').toBe(200)
    expect((await api('tecnico', 'GET', `${VD}/catalog-product-families`)).status).toBe(403)

    // PDF: «seleccionados» exige productos; «completo» no.
    const pdf = async (cuerpo: unknown) => fetch(`${API}${VD}/catalog/send-pdf`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.vendedor}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    expect((await pdf({})).status).toBe(422)
    expect((await pdf({ mode: 'seleccionados' })).status, 'sin productos').toBe(422)
    const ok = await pdf({ mode: 'seleccionados', product_ids: prods.slice(0, 2).map(p => p.id) })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toMatch(/pdf/)
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    expect((await pdf({ mode: 'completo' })).status).toBe(200)

    // Ficha técnica: la suben y la quitan quienes editan Ventas & Diseño (Fase 23, #7); la baja cualquiera que lea el catálogo.
    const prueba = await api('vendedor', 'POST', `${VD}/catalog/${ctx.prod}/technical-sheet`, {})
    expect(prueba.status, 'sin archivo').toBe(422)
    const sube = await fetch(`${API}${VD}/catalog/${ctx.prod}/technical-sheet`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokens.vendedor}`, Accept: 'application/json' },
      body: (() => { const f = new FormData(); f.append('file', new Blob(['%PDF-1.4\n%flujo\n'], { type: 'application/pdf' }), 'ficha-flujo.pdf'); return f })(),
    })
    expect(sube.status).toBe(200)
    expect((await sube.json()).has_technical_sheet).toBe(true)
    const url = await api('gerencia', 'GET', `${VD}/catalog/${ctx.prod}/technical-sheet`)
    expect(url.status, 'otro rol con acceso al catálogo la descarga').toBe(200)
    expect(url.body.url).toMatch(/signature=/)
    expect((await api('tecnico', 'GET', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status).toBe(403)
    expect((await api('contabilidad', 'GET', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status, 'Contabilidad ya no entra al catálogo (Fase 21)').toBe(403)

    // Quitarla: sin permiso de edición 403; con él 204; ya no queda ficha y repetir da 404. Se deja el producto como estaba.
    expect((await api('tecnico', 'DELETE', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status).toBe(403)
    expect((await api('vendedor', 'DELETE', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status).toBe(204)
    expect((await api('vendedor', 'DELETE', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status, 'ya no tiene').toBe(404)
    expect((await api('gerencia', 'GET', `${VD}/catalog/${ctx.prod}/technical-sheet`)).status).toBe(404)
  })

  test('9. calendario: sin Outlook configurado responde vacío y avisa; el CRUD interno no se usa', async () => {
    const cal = await api('vendedor', 'GET', `${VD}/calendar?from=2026-11-01&to=2026-11-30`)
    expect(cal.status).toBe(200)
    expect(Array.isArray(cal.body.data)).toBe(true)
    // Sin Outlook configurado la respuesta lo dice; con Outlook, `source_unavailable` no viene.
    if (cal.body.data.length === 0) expect(cal.body.source_unavailable).toBe(true)
    expect((await api('lidercompras', 'GET', `${VD}/calendar`)).status).toBe(403)

    // La tabla propia de eventos sigue expuesta aunque la pantalla ya no la lea.
    expect((await api('vendedor', 'POST', `${VD}/calendar-events`, { title: 'x' })).status).toBe(422)
    expect((await api('vendedor', 'GET', `${VD}/calendar-events`)).status).toBe(200)
  })

  test('10. ajustes: Gerencia y el superadmin, y con límites', async () => {
    // Fase 23 (#9): Gerencia ve y edita precios, margen de Pedidos, tramos y metas; el vendedor y Contabilidad no.
    for (const ruta of ['pricing-settings', 'orders-settings', 'sales-commission-tiers', 'reports/goals']) {
      expect((await api('gerencia', 'GET', `${VD}/${ruta}`)).status, `Gerencia lee ${ruta}`).toBe(200)
      for (const rol of ['vendedor', 'contabilidad'] as const) expect((await api(rol, 'GET', `${VD}/${ruta}`)).status, `${rol} no lee ${ruta}`).toBe(403)
    }
    expect((await api('gerencia', 'PUT', `${VD}/pricing-settings`, { project_discount_percent: 150 })).status, 'Gerencia edita, con los mismos límites').toBe(422)

    // Lecturas y validaciones; nada se modifica.
    const precios = (await api('superadmin', 'GET', `${VD}/pricing-settings`)).body
    expect(Object.keys(precios)).toEqual(expect.arrayContaining(['project_discount_percent', 'special_additional_discount_percent', 'partner_divisor', 'premium_divisor', 'min_margin_percent']))
    expect((await api('superadmin', 'PUT', `${VD}/pricing-settings`, { project_discount_percent: 150 })).status).toBe(422)

    const tramos = (await api('superadmin', 'GET', `${VD}/sales-commission-tiers`)).body as { monto_minimo: number; monto_maximo: number | null }[]
    expect(tramos[0].monto_minimo, 'el primer tramo empieza en 0').toBe(0)
    expect(tramos.at(-1)!.monto_maximo, 'el último es abierto').toBeNull()
    const mal = await api('superadmin', 'PUT', `${VD}/sales-commission-tiers`, { tiers: [{ monto_minimo: 100, monto_maximo: 50, porcentaje: 2 }] })
    expect(mal.status).toBe(422)

    expect((await api('superadmin', 'PUT', `${VD}/reports/settings`, { quote_probability_percent: 150 })).status).toBe(422)
    const ajustes = (await api('vendedor', 'GET', `${VD}/reports/settings`)).body
    expect(Object.keys(ajustes), 'las probabilidades del Forecast las lee cualquiera que vea Reportes').toEqual(expect.arrayContaining(['quote_probability_percent', 'proposal_probability_percent']))
    expect((await api('vendedor', 'PUT', `${VD}/reports/settings`, ajustes)).status, 'pero solo se editan con permiso').toBe(403)

    const auditoria = await api('superadmin', 'GET', `${VD}/audit-log`)
    expect(auditoria.status).toBe(200)
    expect((data(auditoria.body) as { action: string }[]).some(a => a.action === 'ventas_diseno.pipeline_card.created'), 'la creación de la tarjeta quedó auditada').toBe(true)
  })

  test('11. segmentos de cliente: catálogo por empresa, uno propio se asigna y se retira', async () => {
    const lista = (await api('vendedor', 'GET', '/catalogs/client_segment')).body
    const claves = (data(lista) as { key: string; label: string }[]).map(e => e.key)
    expect(claves).toEqual(expect.arrayContaining(['a_walkin', 'b_architect_designer', 'c_bidding', 'd_referred']))
    expect((data(lista) as { key: string; label: string }[]).find(e => e.key === 'b_architect_designer')!.label, 'las etiquetas de sistema ya no nombran un oficio').not.toMatch(/arquitecto/i)

    const clave = `flujo_${STAMP}`
    const alta = await api('superadmin', 'POST', '/admin/catalogs/client_segment', { key: clave, label: `Z · Flujo ${STAMP}` })
    expect(alta.status).toBe(201)
    expect((await api('vendedor', 'POST', '/admin/catalogs/client_segment', { key: `x_${STAMP}`, label: 'x' })).status, 'solo el superadmin edita el catálogo').toBe(403)

    expect((await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/category`, { category: clave })).body.category).toBe(clave)
    expect((await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/category`, { category: 'no_existe' })).status).toBe(422)
    const filtro = await api('vendedor', 'GET', `${VD}/clients?category[]=${clave}`)
    expect((data(filtro.body) as { id: number }[]).map(c => c.id), 'el filtro de la lista acepta el segmento propio').toContain(ctx.mc)

    // En uso no se borra; liberado, sí.
    expect((await api('superadmin', 'DELETE', `/admin/catalogs/client_segment/${alta.body.id}`)).status).toBe(422)
    expect((await api('vendedor', 'PATCH', `${VD}/clients/sub-clients/${ctx.sc}/category`, { category: null })).status).toBe(200)
    expect((await api('superadmin', 'DELETE', `/admin/catalogs/client_segment/${alta.body.id}`)).status).toBe(204)
  })
})
