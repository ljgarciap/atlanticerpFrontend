import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable transversal, segunda parte (catálogo: atlanticerp-backend/docs/flujos/transversales-administracion.md): departamentos, roles propios y su
// visibilidad, reglas de aprobación de órdenes de compra, reglas de notificación, ajustes globales y perfil de empresa, con quién puede tocar cada cosa. Por la
// API real y con la cuenta de cada rol; todo lo que crea lleva «[FLUJO]» y se borra o restaura al terminar. UN worker (npm run e2e:flujos).

const STAMP = String(Date.now())
const ROLES = ['superadmin', 'gerencia', 'gerencia3', 'vendedor', 'lidercompras'] as const
let tokens: Tokens
const ctx: Record<string, any> = {}
let req: APIRequestContext
const api = (rol: string, method: string, path: string, payload?: unknown) => llamar(req, tokens, rol, method, path, payload)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo transversal: administración de la plataforma', () => {
  test.beforeAll(async () => {
    req = await playwrightRequest.newContext()
    tokens = await iniciarSesion(req, ROLES)
  })

  test.afterAll(async () => {
    // limpia lo que el flujo dejó, aunque un paso haya fallado a medias
    if (ctx.rol) await api('superadmin', 'DELETE', `/roles/${ctx.rol}`)
    if (ctx.reglaAprobacion) await api('superadmin', 'DELETE', `/admin/purchase-approval-rules/${ctx.reglaAprobacion}`)
    if (ctx.reglaNotificacion) await api('superadmin', 'DELETE', `/admin/notification-rules/${ctx.reglaNotificacion}`)
    if (ctx.perfilOriginal) await api('gerencia3', 'PUT', '/admin-contab/company-profile', { descripcion_corta: ctx.perfilOriginal })
    if (ctx.departamento) await api('gerencia', 'PATCH', `/departments/${ctx.departamento}/status`, { is_active: false })
    await req.dispose()
  })

  test('1. departamentos: solo Gerencia los administra, nombre único, se desactivan sin borrarse', async () => {
    const nombre = `[FLUJO] Departamento ${STAMP}`
    for (const rol of ['vendedor', 'lidercompras']) expect((await api(rol, 'GET', '/departments')).status, `${rol} no administra departamentos`).toBe(403)
    expect((await api('gerencia', 'POST', '/departments', { name: '' })).status).toBe(422)
    const nuevo = await api('gerencia', 'POST', '/departments', { name: nombre })
    expect(nuevo.status).toBe(201)
    expect(nuevo.body).toMatchObject({ name: nombre, is_active: true })
    ctx.departamento = nuevo.body.id
    expect((await api('gerencia', 'POST', '/departments', { name: nombre })).status, 'el nombre es único').toBe(422)

    const nuevoNombre = `${nombre} (renombrado)`
    expect((await api('gerencia', 'PUT', `/departments/${ctx.departamento}`, { name: nuevoNombre })).body.name).toBe(nuevoNombre)
    const baja = await api('gerencia', 'PATCH', `/departments/${ctx.departamento}/status`, { is_active: false })
    expect(baja.body.is_active).toBe(false)
    const selector = (await api('gerencia', 'GET', '/departments?all=1')).body as { id: number }[]
    expect(selector.map(d => d.id), 'el selector (all=1) no ofrece los desactivados').not.toContain(ctx.departamento)
    const buscado = data((await api('gerencia', 'GET', `/departments?search=${encodeURIComponent(STAMP)}`)).body) as { id: number; is_active: boolean }[]
    expect(buscado.find(d => d.id === ctx.departamento), 'la pantalla de administración sí lo lista, desactivado, no borrado').toMatchObject({ is_active: false })
    expect((await api('gerencia', 'PUT', '/departments/99999999', { name: 'x' })).status).toBe(404)
  })

  test('2. roles propios: solo el superadmin, clave válida, visibilidad por módulo y borrado protegido', async () => {
    const clave = `flujo_${STAMP}`
    const lista = (await api('gerencia', 'GET', '/roles')).body as { id: number; key: string; is_system: boolean }[]
    expect(lista.length, 'el catálogo trae los roles de sistema').toBeGreaterThan(10)
    const sistema = lista.find(r => r.is_system && r.key !== 'superadmin')!

    expect((await api('gerencia', 'POST', '/admin/roles', { key: clave, name: 'Rol de flujo' })).status, 'Gerencia no crea roles').toBe(403)
    expect((await api('superadmin', 'POST', '/admin/roles', { key: 'Rol Con Espacios', name: 'x' })).status, 'la clave es minúscula y sin espacios').toBe(422)
    expect((await api('superadmin', 'POST', '/admin/roles', { key: sistema.key, name: 'Duplicado' })).status, 'la clave es única').toBe(422)
    const nuevo = await api('superadmin', 'POST', '/admin/roles', { key: clave, name: 'Rol de flujo' })
    expect(nuevo.status).toBe(201)
    expect(nuevo.body).toMatchObject({ key: clave, is_system: false, is_active: true })
    ctx.rol = nuevo.body.id

    expect((await api('superadmin', 'PUT', `/admin/roles/${ctx.rol}`, { name: 'Rol de flujo 2' })).body.name).toBe('Rol de flujo 2')
    expect((await api('superadmin', 'PUT', `/admin/roles/${sistema.id}`, { name: 'Cambiado' })).status, 'un rol de sistema no se edita').toBe(403)
    expect((await api('superadmin', 'DELETE', `/admin/roles/${sistema.id}`)).status, 'ni se borra').toBe(403)

    const vis = (await api('superadmin', 'GET', `/admin/roles/${ctx.rol}/visibility`)).body as { module: string }[]
    const modulos = (data((await api('gerencia', 'GET', '/modules')).body) as { key: string }[]).map(m => m.key)
    expect(modulos.length).toBeGreaterThan(0)
    expect(Array.isArray(vis)).toBe(true)
    expect((await api('superadmin', 'PUT', `/admin/roles/${ctx.rol}/visibility`, { rows: [{ module: 'modulo_inexistente', can_view: 1, can_view_team: false }] })).status).toBe(422)
    expect((await api('superadmin', 'PUT', `/admin/roles/${ctx.rol}/visibility`, { rows: [{ module: modulos[0], can_view: 7, can_view_team: false }] })).status, 'el nivel de vista es 0, 1 o 2').toBe(422)
    const guardada = await api('superadmin', 'PUT', `/admin/roles/${ctx.rol}/visibility`, { rows: [{ module: modulos[0], can_view: 2, can_view_team: true }] })
    expect(guardada.status).toBe(200)
    expect(((await api('superadmin', 'GET', `/admin/roles/${ctx.rol}/visibility`)).body as any[]).find(v => v.module === modulos[0])).toMatchObject({ can_view: 2, can_view_team: true })
    expect((await api('gerencia', 'PUT', `/admin/roles/${ctx.rol}/visibility`, { rows: [] })).status).toBe(403)

    expect((await api('superadmin', 'DELETE', `/admin/roles/${ctx.rol}`)).status, 'un rol propio sin usuarios se borra').toBe(204)
    ctx.rol = null
  })

  test('3. reglas de aprobación de órdenes de compra: se editan por datos y deciden de verdad', async () => {
    for (const rol of ['gerencia', 'lidercompras']) expect((await api(rol, 'GET', '/admin/purchase-approval-rules')).status, `${rol} no administra las reglas`).toBe(403)
    const regla = { name: `[FLUJO] Regla ${STAMP}`, sort_order: 0, is_active: true, shipping_type: 'maritimo', min_amount: 12345, max_amount: 12346, requires_approval: true }
    expect((await api('superadmin', 'POST', '/admin/purchase-approval-rules', { ...regla, name: '' })).status).toBe(422)
    expect((await api('superadmin', 'POST', '/admin/purchase-approval-rules', { ...regla, max_amount: 100 })).status, 'el máximo no puede ser menor al mínimo').toBe(422)
    const incoherente = await api('superadmin', 'POST', '/admin/purchase-approval-rules', { ...regla, who_pays_shipping: 'atlantic' })
    expect(incoherente.status, 'el pagador del envío solo aplica al aéreo').toBe(422)

    const creada = await api('superadmin', 'POST', '/admin/purchase-approval-rules', regla)
    expect(creada.status).toBe(201)
    ctx.reglaAprobacion = creada.body.id

    const vista = await api('superadmin', 'POST', '/admin/purchase-approval-rules/preview', { shipping_type: 'maritimo', amount: 12345.5 })
    expect(vista.body).toMatchObject({ requires_approval: true, rule: { id: ctx.reglaAprobacion } })
    const fuera = await api('superadmin', 'POST', '/admin/purchase-approval-rules/preview', { shipping_type: 'maritimo', amount: 50 })
    expect(fuera.body.rule?.id, 'fuera del rango no decide esta regla').not.toBe(ctx.reglaAprobacion)

    // la regla gobierna una orden real: marítimo de 12 345,50 pasa a «Por aprobar»
    const prov = data((await api('lidercompras', 'GET', '/compras/providers?per_page=5')).body) as { id: number }[]
    const prods = data((await api('lidercompras', 'GET', '/compras/inventory?per_page=5')).body) as { id: number }[]
    const orden = await api('lidercompras', 'POST', '/compras/orders', { provider_id: prov[0].id, modality: 'directo', shipping_type: 'maritimo', lines: [{ catalog_product_id: prods[0].id, quantity: 1, unit_cost: 12345.5 }] })
    expect(orden.status).toBe(201)
    expect(orden.body.status).toBe('por_aprobar')
    expect(orden.body.requires_primary_approval).toBe(true)

    expect((await api('superadmin', 'PUT', `/admin/purchase-approval-rules/${ctx.reglaAprobacion}`, { ...regla, is_active: false })).status).toBe(200)
    const apagada = await api('superadmin', 'POST', '/admin/purchase-approval-rules/preview', { shipping_type: 'maritimo', amount: 12345.5 })
    expect(apagada.body.rule?.id, 'una regla inactiva no decide').not.toBe(ctx.reglaAprobacion)
    expect((await api('superadmin', 'DELETE', `/admin/purchase-approval-rules/${ctx.reglaAprobacion}`)).status).toBe(200)
    ctx.reglaAprobacion = null
    expect((await api('superadmin', 'PUT', '/admin/purchase-approval-rules/99999999', regla)).status).toBe(404)
  })

  test('4. reglas de notificación: solo el superadmin, modelo y evento de una lista, destinatarios obligatorios', async () => {
    expect((await api('gerencia', 'GET', '/admin/notification-rules')).status).toBe(403)
    const regla = { name: `[FLUJO] Notificación ${STAMP}`, trigger_type: 'model_event', trigger_model: 'Project', trigger_event: 'updated', field: 'etapa', operator: 'changed_to', value: 'cerrado', channels: ['in_app'], recipient_type: 'role', recipient_value: ['gerencia'], is_active: false }
    for (const mala of [{ trigger_model: 'ModeloInexistente' }, { trigger_event: 'deleted' }, { channels: [] }, { channels: ['sms'] }, { recipient_value: [] }, { field: 'campo', operator: undefined }]) {
      const r = await api('superadmin', 'POST', '/admin/notification-rules', { ...regla, ...mala })
      expect(r.status, JSON.stringify(mala)).toBe(422)
    }
    const creada = await api('superadmin', 'POST', '/admin/notification-rules', regla)
    expect(creada.status, JSON.stringify(creada.body).slice(0, 200)).toBe(201)
    ctx.reglaNotificacion = creada.body.id ?? creada.body.data?.id
    const lista = data((await api('superadmin', 'GET', '/admin/notification-rules')).body) as { id: number; name: string }[]
    expect(lista.map(r => r.id)).toContain(ctx.reglaNotificacion)

    const edit = await api('superadmin', 'PUT', `/admin/notification-rules/${ctx.reglaNotificacion}`, { ...regla, name: `${regla.name} v2` })
    expect(edit.status).toBe(200)
    expect((await api('superadmin', 'DELETE', `/admin/notification-rules/${ctx.reglaNotificacion}`)).status).toBeLessThan(300)
    ctx.reglaNotificacion = null
  })

  test('5. ajustes globales: lista blanca con rango, auditados, y los sensibles piden la contraseña', async () => {
    expect((await api('gerencia', 'GET', '/admin/global-settings')).status).toBe(403)
    const todos = data((await api('superadmin', 'GET', '/admin/global-settings')).body) as { key: string; value: number; min: number; max: number; default: number }[]
    expect(todos.length).toBeGreaterThan(5)
    expect(todos.map(a => a.key), 'la clave de IA nunca está en la lista').not.toContain('anthropic_api_key')

    const clave = todos.find(a => !['password_reset_enabled', 'password_reset_expiration_hours'].includes(a.key) && !a.key.startsWith('impersonation_'))!
    ctx.claveAjuste = clave.key
    expect((await api('superadmin', 'PUT', '/admin/global-settings/clave_inventada', { value: 1 })).status, 'fuera de la lista blanca').toBe(404)
    expect((await api('superadmin', 'PUT', `/admin/global-settings/${clave.key}`, { value: clave.max + 1 })).status, 'sobre el máximo').toBe(422)
    expect((await api('superadmin', 'PUT', `/admin/global-settings/${clave.key}`, { value: 'abc' })).status).toBe(422)
    expect((await api('gerencia', 'PUT', `/admin/global-settings/${clave.key}`, { value: clave.min })).status).toBe(403)

    const nuevo = clave.value === clave.min ? clave.min + 1 : clave.min
    const ok = await api('superadmin', 'PUT', `/admin/global-settings/${clave.key}`, { value: nuevo })
    expect(ok.status).toBe(200)
    expect((data((await api('superadmin', 'GET', '/admin/global-settings')).body) as any[]).find(a => a.key === clave.key).value).toBe(nuevo)
    expect((await api('superadmin', 'PUT', `/admin/global-settings/${clave.key}`, { value: clave.value })).status, 'se restaura').toBe(200)

    const sensible = await api('superadmin', 'PUT', '/admin/global-settings/password_reset_expiration_hours', { value: 100 })
    expect(sensible.status, 'la caducidad del reinicio exige la contraseña del operador').toBeGreaterThanOrEqual(400)
  })

  test('6. perfil de empresa y consumo de IA: solo el aprobador primario edita el perfil, solo el superadmin ve la IA', async () => {
    const perfil = await api('gerencia3', 'GET', '/admin-contab/company-profile')
    expect(perfil.status).toBe(200)
    ctx.perfilOriginal = perfil.body.descripcion_corta ?? ''
    expect((await api('vendedor', 'GET', '/admin-contab/company-profile')).status).toBe(403)
    expect((await api('gerencia', 'GET', '/admin-contab/company-profile')).status, 'otra cuenta de Gerencia no es el aprobador primario').toBe(403)
    expect((await api('gerencia3', 'PUT', '/admin-contab/company-profile', { sitio_web: 'no es una url' })).status).toBe(422)
    expect((await api('gerencia3', 'PUT', '/admin-contab/company-profile', { pais: 'XX' })).status, 'el país sale del catálogo').toBe(422)
    expect((await api('gerencia3', 'PUT', '/admin-contab/company-profile', { zona_horaria: 'No/Existe' })).status).toBe(422)
    const texto = `Empresa de pruebas ${STAMP}`
    expect((await api('gerencia3', 'PUT', '/admin-contab/company-profile', { descripcion_corta: texto })).status).toBe(200)
    expect((await api('gerencia3', 'GET', '/admin-contab/company-profile')).body.descripcion_corta).toBe(texto)

    for (const ruta of ['/admin/ai/usage', '/admin/ai/pricing']) {
      expect((await api('superadmin', 'GET', ruta)).status, `superadmin ve ${ruta}`).toBe(200)
      expect((await api('gerencia', 'GET', ruta)).status, `Gerencia no ve ${ruta}`).toBe(403)
    }
  })
})
