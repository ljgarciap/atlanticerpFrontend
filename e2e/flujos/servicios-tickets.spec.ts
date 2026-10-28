import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de Servicios (catálogo: atlanticerp-backend/docs/flujos/servicios-tickets.md): tickets de instalación y de garantía,
// agenda por especialidad, compuertas de cierre (informe de inspección y cotización aprobada), cotización de servicio y cancelación con motivo.
// Por la API real y con la cuenta de cada rol; crea sus propios datos «[FLUJO]». Correr con UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
const ROLES = ['liderservicios', 'tecnico', 'tecnicogarantias', 'vendedor'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ctx: Record<string, number> = {}
const STAMP = String(Date.now())
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

const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 19)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo de Servicios', () => {
  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const email = `${rol}@test.com`
      const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_DEMO_PASSWORD ?? email }, headers: { Accept: 'application/json' } })
      expect(r.status(), `login de ${email}`).toBe(200)
      tokens[rol] = (await r.json()).token as string
    }
    // `internal_technician_id` de la agenda espera el id de USUARIO del técnico, no el de la ficha.
    const lista = (await api(request, 'liderservicios', 'GET', '/servicios/internal-technicians')).body
    const tecnicos = (Array.isArray(lista) ? lista : lista.data) as { user_id: number; email: string; especialidad: string }[]
    ctx.generalUser = tecnicos.find(t => t.email === 'tecnico@test.com')!.user_id
    ctx.garantiaUser = tecnicos.find(t => t.especialidad === 'warranty')!.user_id
  })

  test('1. ticket de instalación: subtipo obligatorio, folio por tipo y estado inicial', async ({ request }) => {
    const base = { tipo: 'installation', tipo_instalacion: 'internal', descripcion: `[FLUJO] Instalación ${STAMP}`, contacto: 'Contacto Flujo', telefono: '6000-0000', direccion: 'Dirección de flujo' }
    expect((await api(request, 'vendedor', 'POST', '/servicios/tickets', base)).status, 'el tipo exige un subtipo').toBe(422)
    const t = await api(request, 'vendedor', 'POST', '/servicios/tickets', { ...base, subtipo: 'installation' })
    expect(t.status, 'el vendedor puede reportar un ticket').toBe(201)
    expect(t.body.numero).toMatch(/^INS-\d{4}-\d{4}$/)
    expect(t.body.estado).toBe('reported')
    ctx.instalacion = t.body.id
  })

  test('2. agenda: la especialidad del técnico decide y reagendar exige motivo', async ({ request }) => {
    const id = ctx.instalacion
    const fecha = enDias(3)
    expect((await api(request, 'vendedor', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.generalUser, scheduled_at: fecha })).status, 'el vendedor no agenda').toBe(403)
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { scheduled_at: fecha })).status, 'falta el técnico').toBe(422)
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.garantiaUser, scheduled_at: fecha })).status, 'garantías no atiende instalaciones').toBe(422)

    const ok = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.generalUser, scheduled_at: fecha })
    expect(ok.status).toBe(200)
    expect(ok.body.estado, 'el primer agendamiento pasa a Agendado').toBe('scheduled')

    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.generalUser, scheduled_at: enDias(4) })).status, 'reagendar exige motivo').toBe(422)
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.generalUser, scheduled_at: enDias(4), motivo_reagendamiento: 'Cliente pidió otra fecha' })).status).toBe(200)
  })

  test('3. avance de estados de la instalación; el técnico no cambia estados', async ({ request }) => {
    const id = ctx.instalacion
    expect((await api(request, 'tecnico', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'on_site' })).status, 'solo el líder cambia el estado').toBe(403)
    for (const estado of ['on_site', 'resolved', 'closed']) {
      const r = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado })
      expect(r.status, `a ${estado}`).toBe(200)
      expect(r.body.estado).toBe(estado)
    }
    expect((await api(request, 'liderservicios', 'GET', `/servicios/tickets/${id}`)).body.estado).toBe('closed')
  })

  test('4. garantía: informe de inspección y cotización aprobada antes de resolver', async ({ request }) => {
    const base = { tipo: 'warranty', tipo_instalacion: 'internal', descripcion: `[FLUJO] Garantía ${STAMP}`, contacto: 'Contacto Flujo', telefono: '6000-0000', direccion: 'Dirección de flujo' }
    expect((await api(request, 'liderservicios', 'POST', '/servicios/tickets', { ...base, subtipo: 'installation' })).status, 'el subtipo debe ser de garantía').toBe(422)
    const t = await api(request, 'liderservicios', 'POST', '/servicios/tickets', { ...base, subtipo: 'replacement_inspection' })
    expect(t.status).toBe(201)
    expect(t.body.numero).toMatch(/^GAR-\d{4}-\d{4}$/)
    const id = t.body.id as number
    ctx.garantia = id
    expect((await api(request, 'liderservicios', 'GET', `/servicios/tickets/${id}`)).body.inspection_report_status).toBe('pending')

    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/agendar`, { internal_technician_id: ctx.garantiaUser, scheduled_at: enDias(2) })).status).toBe(200)
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'on_site' })).status).toBe(200)

    const sinInforme = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'resolved' })
    expect(sinInforme.status).toBe(422)
    expect(JSON.stringify(sinInforme.body)).toMatch(/informe de inspección/)

    const informe = { conclusion: 'Pieza defectuosa; se reemplaza.', requiere_seguimiento: false, findings: [{ label: 'Estado de la pieza', value: 'Defectuosa' }], firma_tecnico_nombre: 'Tecnico Garantias Test', firma_cliente_nombre: 'Cliente Flujo' }
    expect((await api(request, 'tecnicogarantias', 'PUT', `/servicios/tickets/${id}/inspection-report`, { ...informe, conclusion: '' })).status, 'la conclusión es obligatoria').toBe(422)
    expect((await api(request, 'vendedor', 'PUT', `/servicios/tickets/${id}/inspection-report`, informe)).status).toBe(403)
    expect((await api(request, 'tecnico', 'PUT', `/servicios/tickets/${id}/inspection-report`, informe)).status, 'solo el técnico asignado o el líder').toBe(403)
    const ok = await api(request, 'tecnicogarantias', 'PUT', `/servicios/tickets/${id}/inspection-report`, informe)
    expect(ok.status).toBe(200)
    expect(ok.body.numero).toMatch(/^INF-\d{4}-\d{4}$/)
    expect((await api(request, 'liderservicios', 'GET', `/servicios/tickets/${id}`)).body.inspection_report_status).toBe('completed')

    const sinCotizacion = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'resolved' })
    expect(sinCotizacion.status).toBe(422)
    expect(JSON.stringify(sinCotizacion.body)).toMatch(/aprobar la cotización/)

    expect((await api(request, 'tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote`, {})).status).toBe(201)
    expect((await api(request, 'tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote/items`, { tipo: 'mano_obra', quantity: 1 })).status, 'tipo de ítem inválido').toBe(422)
    expect((await api(request, 'tecnicogarantias', 'POST', `/servicios/tickets/${id}/quote/items`, { tipo: 'labor', description: 'Mano de obra', quantity: 2, unit_price: 40 })).status).toBe(201)
    expect((await api(request, 'tecnicogarantias', 'PATCH', `/servicios/tickets/${id}/quote/enviar`)).status).toBe(200)
    expect((await api(request, 'tecnicogarantias', 'PATCH', `/servicios/tickets/${id}/quote/decidir`, { estado: 'approved' })).status, 'un técnico nunca decide su propia cotización').toBe(403)
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/quote/decidir`, { estado: 'approved' })).status).toBe(200)

    for (const estado of ['resolved', 'closed']) {
      const r = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado })
      expect(r.status, `a ${estado}`).toBe(200)
    }
  })

  test('5. cancelar exige motivo y solo lo hace el líder; no hay atajo por el endpoint de estado', async ({ request }) => {
    const t = await api(request, 'liderservicios', 'POST', '/servicios/tickets', { tipo: 'installation', subtipo: 'installation', tipo_instalacion: 'internal', descripcion: `[FLUJO] Cancelable ${STAMP}` })
    expect(t.status).toBe(201)
    const id = t.body.id as number

    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/cancelar`, {})).status, 'sin motivo').toBe(422)
    expect((await api(request, 'tecnico', 'PATCH', `/servicios/tickets/${id}/cancelar`, { motivo: 'x' })).status).toBe(403)
    const porEstado = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/estado`, { estado: 'cancelled' })
    expect(porEstado.status, 'cancelar por /estado se saltaba el motivo (corregido en el backend)').toBe(422)
    expect((await api(request, 'liderservicios', 'GET', `/servicios/tickets/${id}`)).body.estado).toBe('reported')

    const ok = await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/cancelar`, { motivo: 'Cliente desistió' })
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('cancelled')
    expect(ok.body.cancellation_reason).toBe('Cliente desistió')
    expect((await api(request, 'liderservicios', 'PATCH', `/servicios/tickets/${id}/cancelar`, { motivo: 'otra vez' })).status, 'ya cancelado').toBe(422)
  })
})
