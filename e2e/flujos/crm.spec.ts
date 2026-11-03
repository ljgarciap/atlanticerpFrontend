import { test, expect, type APIRequestContext } from '@playwright/test'
import { API, BASE, data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable del CRM propio (catálogo: atlanticerp-backend/docs/flujos/crm.md): proyectos y sus etapas, actividades, recordatorios, contactos,
// documentos con versiones y enlaces públicos, tablero, reportes y ajustes. Por la API real y con la cuenta de cada rol. Los proyectos que crea los
// borra Gerencia al terminar (único rol con `crm.projects.delete`); los contactos se borran en el mismo paso. Correr con UN worker (npm run e2e:flujos).

const ROLES = ['vendedor', 'vendedor2', 'gerencia', 'contabilidad', 'lidercompras', 'tecnico', 'superadmin'] as const
type Rol = (typeof ROLES)[number]
const STAMP = String(Date.now())
const CRM = '/crm'
const ctx: Record<string, any> = { proyectos: [] as number[] }
let tokens: Tokens
let req: APIRequestContext

const api = (rol: Rol, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

async function subir(rol: Rol, path: string, campos: Record<string, string>, nombre = 'flujo.pdf', tipo = 'application/pdf') {
  const r = await req.post(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tokens[rol]}`, Accept: 'application/json' },
    multipart: { ...campos, file: { name: nombre, mimeType: tipo, buffer: Buffer.from('%PDF-1.4\n%flujo-crm\n') } },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo del CRM', () => {
  test.beforeAll(async ({ playwright }) => {
    req = await playwright.request.newContext()
    tokens = await iniciarSesion(req, ROLES)
    ctx.vendedorId = (data((await api('superadmin', 'GET', `/users?search=vendedor@`)).body) as { id: number; email: string }[]).find(u => u.email === 'vendedor@test.com')!.id
  })
  test.afterAll(async () => {
    for (const id of ctx.proyectos as number[]) await api('gerencia', 'DELETE', `${CRM}/projects/${id}`)
    await req.dispose()
  })

  test('1. matriz de acceso: quién entra a cada pantalla del CRM', async () => {
    // [ruta, vendedor, gerencia, contabilidad, lidercompras, tecnico, superadmin]
    const matriz: [string, ...number[]][] = [
      ['/projects', 200, 200, 200, 200, 200, 200],
      ['/contacts', 200, 200, 200, 200, 200, 200],
      ['/dashboard/kpis', 200, 200, 200, 200, 200, 200],
      ['/dashboard/reminders', 200, 200, 200, 200, 200, 200],
      ['/reports/monthly', 200, 200, 200, 403, 200, 200],
      ['/reports/team', 403, 200, 200, 403, 403, 200],
      ['/settings', 403, 403, 403, 403, 403, 200],
      ['/directory?type=encargado', 200, 200, 200, 200, 200, 200],
    ]
    const orden = ['vendedor', 'gerencia', 'contabilidad', 'lidercompras', 'tecnico', 'superadmin'] as const
    for (const [ruta, ...esperados] of matriz) {
      for (let i = 0; i < orden.length; i++) expect((await api(orden[i], 'GET', `${CRM}${ruta}`)).status, `${orden[i]} GET ${ruta}`).toBe(esperados[i])
    }
    expect((await api('vendedor', 'GET', `${CRM}/directory`)).status, 'el directorio exige el tipo').toBe(422)
  })

  test('2. proyecto: alta, validaciones y quién lo ve (el acceso es por asignación, no por autoría)', async () => {
    expect((await api('vendedor', 'POST', `${CRM}/projects`, { nombre: 'x', tipo: 'zzz' })).status).toBe(422)
    expect((await api('vendedor', 'POST', `${CRM}/projects`, { tipo: 'diseno' })).status, 'el nombre es obligatorio').toBe(422)

    const sin = await api('vendedor', 'POST', `${CRM}/projects`, { nombre: `[F11CRM] Sin asignar ${STAMP}`, tipo: 'diseno', valor: 1000 })
    expect(sin.status).toBe(201)
    ctx.proyectos.push(sin.body.id)
    expect(sin.body.etapa, 'nace en Lead').toBe('lead')
    expect(sin.body.created_by).toBe(ctx.vendedorId)
    expect(sin.body.assignees).toEqual([])
    expect((await api('vendedor', 'GET', `${CRM}/projects/${sin.body.id}`)).status, 'quien lo crea sin asignarse NO lo puede abrir').toBe(403)
    expect((await api('gerencia', 'GET', `${CRM}/projects/${sin.body.id}`)).status, 'Gerencia (equipo) sí').toBe(200)

    const asignado = await api('vendedor', 'POST', `${CRM}/projects`, { nombre: `[F11CRM] Asignado ${STAMP}`, tipo: 'ambos', assignee_ids: [ctx.vendedorId], valor: 900 })
    expect(asignado.status).toBe(201)
    ctx.p = asignado.body.id
    ctx.proyectos.push(ctx.p)
    expect((await api('vendedor', 'GET', `${CRM}/projects/${ctx.p}`)).status).toBe(200)
    expect((await api('vendedor2', 'GET', `${CRM}/projects/${ctx.p}`)).status, 'otro vendedor no').toBe(403)
    expect((await api('tecnico', 'GET', `${CRM}/projects/${ctx.p}`)).status).toBe(403)
    expect((await api('contabilidad', 'GET', `${CRM}/projects/${ctx.p}`)).status, 'Contabilidad ve al equipo').toBe(200)

    const mios = (data((await api('vendedor', 'GET', `${CRM}/projects?search=${encodeURIComponent(`F11CRM] Asignado ${STAMP}`)}`)).body) as { id: number }[]).map(p => p.id)
    expect(mios).toEqual([ctx.p])
    expect(data((await api('vendedor2', 'GET', `${CRM}/projects?search=F11CRM`)).body), 'la lista de otro vendedor no la trae').toEqual([])
    expect((await api('vendedor2', 'PUT', `${CRM}/projects/${ctx.p}`, { notas: 'ajena' })).status).toBe(403)
    expect((await api('gerencia', 'PUT', `${CRM}/projects/${ctx.p}`, { notas: 'de gerencia' })).status, 'Gerencia edita el de cualquiera').toBe(200)
  })

  test('3. etapas: libres (sin compuertas) y reabribles', async () => {
    const mover = (rol: Rol, etapa: string) => api(rol, 'PATCH', `${CRM}/projects/${ctx.p}/stage`, { etapa })
    expect((await mover('vendedor', 'zzz')).status).toBe(422)
    expect((await mover('vendedor', 'cerrado')).body.etapa, 'de Lead a Cerrado sin pasar por nada').toBe('cerrado')
    expect((await mover('vendedor', 'perdido')).body.etapa).toBe('perdido')
    expect((await mover('vendedor', 'lead')).body.etapa, 'un proyecto perdido o cerrado se reabre sin aprobación').toBe('lead')
    expect((await mover('vendedor2', 'diseno')).status).toBe(403)
    expect((await mover('gerencia', 'diseno')).body.etapa).toBe('diseno')
  })

  test('4. actividades y recordatorios', async () => {
    const act = `${CRM}/projects/${ctx.p}/activities`
    expect((await api('vendedor', 'POST', act, { tipo: 'zzz', fecha: '2026-11-03' })).status).toBe(422)
    expect((await api('vendedor', 'POST', act, { tipo: 'llamada', fecha: '2026-11-03', siguiente: '2020-01-01' })).status, 'el próximo contacto no puede ser pasado').toBe(422)
    const a = await api('vendedor', 'POST', act, { tipo: 'llamada', fecha: '2020-01-15', notas: `Llamada ${STAMP}` })
    expect(a.status, 'la fecha de la actividad sí puede ser pasada').toBe(201)
    expect(a.body.user.id).toBe(ctx.vendedorId)
    expect((data((await api('vendedor', 'GET', act)).body) as { id: number }[]).map(x => x.id)).toContain(a.body.id)
    expect((await api('vendedor2', 'GET', act)).status).toBe(403)
    expect((await api('vendedor2', 'POST', act, { tipo: 'llamada', fecha: '2026-11-03' })).status).toBe(403)

    const rem = `${CRM}/projects/${ctx.p}/reminders`
    expect((await api('vendedor', 'POST', rem, { tipo: 'zzz', fecha: '2026-11-20' })).status).toBe(422)
    const r = await api('vendedor', 'POST', rem, { tipo: 'visita', fecha: '2026-11-20', nota: 'Recordar' })
    expect(r.status).toBe(201)
    expect(r.body.completado).toBe(false)
    expect((await api('vendedor', 'PATCH', `${rem}/${r.body.id}/toggle`)).body.completado).toBe(true)
    expect((await api('vendedor', 'PATCH', `${rem}/${r.body.id}/toggle`)).body.completado, 'alternar vuelve a abrirlo').toBe(false)
    expect((await api('vendedor', 'DELETE', `${rem}/${r.body.id}`)).status).toBe(204)
    expect((await api('vendedor', 'DELETE', `${rem}/99999999`)).status).toBe(404)
  })

  test('5. contactos: directorio global compartido por todos, sin dueño', async () => {
    expect((await api('vendedor', 'POST', `${CRM}/contacts`, {})).status).toBe(422)
    expect((await api('vendedor', 'GET', `${CRM}/contacts?type=zzz`)).status).toBe(422)
    const c = await api('vendedor', 'POST', `${CRM}/contacts`, { nombre: `[F11CRM] Contacto ${STAMP}`, tipo: 'encargado', email: `c.${STAMP}@example.test`, empresa: 'Empresa' })
    expect(c.status).toBe(201)
    ctx.contacto = c.body.id
    expect((await api('vendedor', 'PUT', `${CRM}/contacts/${ctx.contacto}`, { nombre: `[F11CRM] Editado ${STAMP}`, tipo: 'encargado' })).status).toBe(200)
    for (const rol of ['vendedor', 'vendedor2', 'gerencia'] as const) {
      expect(((await api(rol, 'GET', `${CRM}/contacts?q=${encodeURIComponent(`F11CRM] Editado ${STAMP}`)}`)).body.entries as unknown[]).length, `${rol} lo ve`).toBe(1)
    }
    // Cualquier rol con `crm.delete` (hoy también el Técnico) borra cualquier contacto, sea o no suyo.
    expect((await api('tecnico', 'DELETE', `${CRM}/contacts/${ctx.contacto}`)).status, 'un contacto lo borra otro rol, incluido uno sin módulo CRM').toBe(204)
    expect((await api('vendedor', 'DELETE', `${CRM}/contacts/${ctx.contacto}`)).status).toBe(404)
  })

  test('6. documentos: categoría obligatoria, versiones, enlace público y revocación', async () => {
    const docs = `${CRM}/projects/${ctx.p}/documents`
    expect((await subir('vendedor', docs, {})).status, 'la categoría es obligatoria').toBe(422)
    expect((await subir('vendedor', docs, { categoria: 'zzz' })).status).toBe(422)
    expect((await subir('vendedor', docs, { categoria: 'otro' }, 'virus.exe', 'application/octet-stream')).status, 'solo extensiones permitidas').toBe(422)
    expect((await subir('vendedor2', docs, { categoria: 'otro' })).status, 'sin acceso al proyecto').toBe(403)

    const v1 = await subir('vendedor', docs, { categoria: 'cotizacion' })
    expect(v1.status).toBe(201)
    expect(v1.body.version).toBe(1)
    expect(v1.body.storage_zone).toBe('private')
    const v2 = await subir('vendedor', docs, { categoria: 'cotizacion' })
    expect(v2.body.version, 'subir otra vez la misma categoría crea la versión 2').toBe(2)
    const vigentes = (await api('vendedor', 'GET', docs)).body as { version: number; is_current: boolean }[]
    expect(vigentes.map(d => d.version), 'el listado trae solo la vigente').toEqual([2])
    expect((await api('vendedor', 'GET', `${docs}/history`)).body.length, 'el historial trae todas').toBeGreaterThanOrEqual(2)

    expect((await api('vendedor', 'GET', `${CRM}/documents/${v2.body.id}/url`)).body.url).toMatch(/signature=/)
    expect((await api('vendedor2', 'GET', `${CRM}/documents/${v2.body.id}/url`)).status).toBe(403)

    const enlace = await api('vendedor', 'POST', `${docs}/${v2.body.id}/share-links`, {})
    expect(enlace.status).toBe(201)
    expect(enlace.body.url).toContain('/public/share/')
    const publico = await fetch(enlace.body.url, { redirect: 'manual' })
    expect(publico.status, 'el enlace público no pide sesión y redirige al archivo firmado').toBe(302)
    expect((await fetch(`${BASE}/public/share/token-falso`, { redirect: 'manual' })).status).toBe(404)
    const listado = (await api('vendedor', 'GET', `${docs}/${v2.body.id}/share-links`)).body
    expect(JSON.stringify(listado), 'el token solo se ve al crearlo').not.toContain(enlace.body.url.split('/').pop())
    expect((await api('vendedor', 'DELETE', `${CRM}/share-links/${enlace.body.id}`)).status).toBe(204)
    expect((await fetch(enlace.body.url, { redirect: 'manual' })).status, 'revocado deja de funcionar').toBe(404)

    expect((await api('vendedor', 'DELETE', `${CRM}/documents/${v1.body.id}`)).status).toBe(204)
    expect((await api('vendedor', 'DELETE', `${CRM}/documents/${v2.body.id}`)).status).toBe(204)
  })

  test('7. tablero, reportes, directorio y autocompletar', async () => {
    const kpis = (await api('vendedor', 'GET', `${CRM}/dashboard/kpis`)).body
    expect(Object.keys(kpis.counts_by_stage)).toEqual(expect.arrayContaining(['lead', 'diseno', 'cotizacion', 'propuesta', 'cerrado', 'perdido']))
    expect(kpis).toHaveProperty('pipeline_activo')
    expect(Array.isArray(data((await api('vendedor', 'GET', `${CRM}/dashboard/reminders`)).body))).toBe(true)

    const mensual = (await api('vendedor', 'GET', `${CRM}/reports/monthly`)).body
    expect(mensual.kpis).toHaveProperty('tasa_cierre')
    expect(mensual.month).toMatch(/^\d{4}-\d{2}$/)
    const csv = await fetch(`${API}${CRM}/reports/monthly/export`, { headers: { Authorization: `Bearer ${tokens.gerencia}` } })
    expect([200, 403]).toContain(csv.status)

    const equipo = data((await api('gerencia', 'GET', `${CRM}/reports/team`)).body) as { user_id: number; counts: Record<string, number> }[]
    expect(equipo.length).toBeGreaterThan(0)
    expect(Object.keys(equipo[0].counts)).toContain('cerrado')

    const dir = (await api('vendedor', 'GET', `${CRM}/directory?type=encargado`)).body
    expect(Object.keys(dir.stats)).toEqual(expect.arrayContaining(['total_entries', 'total_projects', 'total_valor']))
    expect((await api('vendedor', 'GET', `${CRM}/directory?type=zzz`)).status).toBe(422)

    expect(data((await api('vendedor', 'GET', `${CRM}/autocomplete/users?q=vend`)).body).length).toBeGreaterThan(0)
    expect((await api('vendedor', 'GET', `${CRM}/autocomplete/fields?field=encargado&q=Enc`)).status).toBe(200)
  })

  test('8. ajustes (solo superadmin) y baja de proyectos (solo Gerencia)', async () => {
    const ajustes = (await api('superadmin', 'GET', `${CRM}/settings`)).body
    expect(Object.keys(ajustes)).toEqual(expect.arrayContaining(['entrega_proxima_dias', 'pipeline_estancado_dias', 'cliente_contacto_obsoleto_dias']))
    expect((await api('gerencia', 'GET', `${CRM}/settings`)).status).toBe(403)

    expect((await api('vendedor', 'DELETE', `${CRM}/projects/${ctx.p}`)).status, 'ni el dueño borra su proyecto').toBe(403)
    expect((await api('tecnico', 'DELETE', `${CRM}/projects/${ctx.p}`)).status).toBe(403)
    const aBorrar = ctx.proyectos.pop() as number
    expect((await api('gerencia', 'DELETE', `${CRM}/projects/${aBorrar}`)).status, 'Gerencia sí').toBe(204)
    expect((await api('gerencia', 'GET', `${CRM}/projects/${aBorrar}`)).status).toBe(404)
  })
})
