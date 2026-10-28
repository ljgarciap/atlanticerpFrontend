import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de los transversales (catálogo: atlanticerp-backend/docs/flujos/transversales.md): ciclo de vida de un usuario (alta, primer
// ingreso con cambio obligatorio de clave, permisos adicionales, desactivación, reinicio), «Ver como usuario», niveles de seguridad y
// notificaciones. Por la API real; crea sus propios datos (usuario y nivel «flujo») y los desactiva al terminar. UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
const ROLES = ['superadmin', 'gerencia', 'vendedor', 'contabilidad'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ctx: Record<string, number | string> = {}
const STAMP = String(Date.now())
type Res = { status: number; body: any }

const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))

async function api(request: APIRequestContext, rol: Rol, method: string, path: string, data?: unknown): Promise<Res> {
  return con(request, tokens[rol]!, method, path, data)
}

async function con(request: APIRequestContext, token: string, method: string, path: string, data?: unknown): Promise<Res> {
  const r = await request.fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, ...(data !== undefined ? { data } : {}) })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* no JSON */ }
  return { status: r.status(), body }
}

async function entrar(request: APIRequestContext, email: string, password: string): Promise<Res> {
  const r = await request.post(`${API}/auth/login`, { data: { email, password }, headers: { Accept: 'application/json' } })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const data = (b: any) => (b && typeof b === 'object' && 'data' in b ? b.data : b)

test.describe.configure({ mode: 'serial' })

test.describe('Flujo transversal: usuarios, acceso y observación', () => {
  const email = `flujo${STAMP}@example.test`
  const clave = 'Flujo-Valida-1!'

  test.beforeAll(async ({ request }) => {
    for (const rol of ROLES) {
      const e = `${rol}@test.com`
      const r = await entrar(request, e, process.env.E2E_DEMO_PASSWORD ?? e)
      expect(r.status, `login de ${e}`).toBe(200)
      tokens[rol] = r.body.token as string
    }
    const roles = data((await api(request, 'gerencia', 'GET', '/roles')).body) as { id: number; key: string }[]
    ctx.rolVendedor = roles.find(x => x.key === 'vendedor')!.id
  })

  test.afterAll(async ({ request }) => {
    if (ctx.userId) await api(request, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: false })
    if (ctx.levelId) await api(request, 'gerencia', 'PATCH', `/security-levels/${ctx.levelId}/status`, { is_active: false })
  })

  test('1. alta de usuario: permisos, correo único y nivel válido', async ({ request }) => {
    const cuerpo = { first_name: 'Usuario', last_name: `Flujo ${STAMP.slice(-4)}`, email, role_id: ctx.rolVendedor, security_level_id: 6 }
    expect((await api(request, 'vendedor', 'POST', '/users', cuerpo)).status, 'el vendedor no administra usuarios').toBe(403)
    expect((await api(request, 'gerencia', 'POST', '/users', { ...cuerpo, email: 'vendedor@test.com' })).status, 'correo único').toBe(422)
    expect((await api(request, 'gerencia', 'POST', '/users', { ...cuerpo, security_level_id: 99999 })).status, 'nivel existente').toBe(422)
    const ok = await api(request, 'gerencia', 'POST', '/users', cuerpo)
    expect(ok.status).toBe(201)
    expect(ok.body.is_active).toBe(true)
    ctx.userId = ok.body.id
  })

  test('2. primer ingreso: la clave inicial obliga a cambiarla antes de usar la API', async ({ request }) => {
    const r = await entrar(request, email, email)
    expect(r.status, 'la clave inicial es el propio correo').toBe(200)
    const token = r.body.token as string
    const bloqueado = await con(request, token, 'GET', '/ventas-diseno/home/summary')
    expect(bloqueado.status).toBe(403)
    expect(bloqueado.body.code).toBe('password_change_required')
    expect((await con(request, token, 'GET', '/auth/me')).body.must_change_password, 'el perfil sí se puede leer').toBe(true)

    const cambiar = (nueva: string, confirmacion = nueva, actual = email) => con(request, token, 'PUT', '/auth/password', { current_password: actual, new_password: nueva, new_password_confirmation: confirmacion })
    expect((await cambiar('Ab1!')).status, 'mínimo 8 caracteres').toBe(422)
    expect((await cambiar('soloMinusculasLargas')).status, 'con mayúscula y número').toBe(422)
    expect((await cambiar(clave, 'otra')).status, 'la confirmación coincide').toBe(422)
    expect((await cambiar(email)).status, 'distinta de la actual').toBe(422)
    expect((await cambiar(clave, clave, 'equivocada')).status, 'la actual debe ser correcta').toBe(422)
    expect((await cambiar(clave)).status).toBe(204)

    expect((await entrar(request, email, email)).status, 'la clave vieja deja de servir').toBe(401)
    const nuevo = await entrar(request, email, clave)
    expect(nuevo.status).toBe(200)
    expect((await con(request, nuevo.body.token, 'GET', '/ventas-diseno/home/summary')).status, 'con la clave cambiada la API responde').toBe(200)
  })

  test('3. permisos adicionales: solo los asigna superadmin y viajan en el token', async ({ request }) => {
    const permiso = 'ventas_diseno.pricing.configure'
    const guardado = async () => ((await api(request, 'superadmin', 'GET', `/users/${ctx.userId}`)).body.extra_permissions ?? []) as string[]
    expect((await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: ['no.existe'] })).status, 'solo claves del catálogo').toBe(422)
    expect((await api(request, 'vendedor', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })).status).toBe(403)

    // gerencia puede editar usuarios pero la asignación de permisos adicionales se descarta (protección contra escalada de privilegios)
    await api(request, 'gerencia', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })
    expect(await guardado(), 'lo asignado por una cuenta que no es superadmin no se guarda').toEqual([])

    expect((await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })).status).toBe(200)
    expect(await guardado()).toEqual([permiso])
    const token = (await entrar(request, email, clave)).body.token as string
    expect(claims(token).permissions, 'el siguiente ingreso lo trae en el token').toContain(permiso)
    await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [] })
    expect(await guardado()).toEqual([])
  })

  test('4. desactivar invalida el acceso al instante; reiniciar la clave la devuelve al correo', async ({ request }) => {
    const token = (await entrar(request, email, clave)).body.token as string
    expect((await con(request, token, 'GET', '/auth/me')).status).toBe(200)
    expect((await api(request, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: false })).status).toBe(200)
    expect((await con(request, token, 'GET', '/auth/me')).status, 'el token vigente deja de servir de inmediato').toBe(401)
    expect((await entrar(request, email, clave)).status, 'no se puede ingresar desactivado').toBe(401)
    expect((await api(request, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: true })).status).toBe(200)

    expect((await api(request, 'gerencia', 'POST', `/users/${ctx.userId}/reset-password`, {})).status, 'reiniciar es solo de superadmin').toBe(403)
    expect((await api(request, 'superadmin', 'POST', `/users/${ctx.userId}/reset-password`, {})).status).toBe(200)
    expect((await entrar(request, email, clave)).status, 'la clave anterior ya no sirve').toBe(401)
    expect((await entrar(request, email, email)).status, 'vuelve a la clave inicial').toBe(200)
  })

  test('5. «Ver como usuario»: solo lectura, con motivo y reautenticación, y queda auditado', async ({ request }) => {
    const ruta = `/users/${ctx.userId}/impersonate`
    expect((await api(request, 'gerencia', 'POST', ruta, { reason: 'Revisión de permisos de la cuenta nueva', operator_password: 'x' })).status, 'solo superadmin').toBe(403)
    expect((await api(request, 'superadmin', 'POST', ruta, { reason: 'corto', operator_password: 'superadmin@test.com' })).status, 'el motivo tiene al menos 10 caracteres').toBe(422)
    expect((await api(request, 'superadmin', 'POST', ruta, { reason: 'Revisión de permisos de la cuenta nueva' })).status, 'pide la contraseña del operador').toBe(422)
    expect((await api(request, 'superadmin', 'POST', ruta, { reason: 'Revisión de permisos de la cuenta nueva', operator_password: 'equivocada' })).status).toBe(422)

    const inicio = await api(request, 'superadmin', 'POST', ruta, { reason: 'Revisión de permisos de la cuenta nueva', operator_password: process.env.E2E_DEMO_PASSWORD ?? 'superadmin@test.com' })
    expect(inicio.status).toBe(201)
    expect(inicio.body.expires_in_ms).toBe(1_800_000)
    const token = inicio.body.token as string
    const yo = (await con(request, token, 'GET', '/auth/me')).body
    expect(yo.email).toBe(email)
    expect(yo.impersonation.actor_name).toBeTruthy()
    expect((await con(request, token, 'GET', '/ventas-diseno/home/summary')).status, 'puede leer').toBe(200)
    const escritura = await con(request, token, 'POST', '/ventas-diseno/master-clients', { name: '[FLUJO] no debe crearse' })
    expect(escritura.status, 'no puede escribir').toBe(403)
    expect(escritura.body.code).toBe('impersonation_read_only')
    expect((await con(request, token, 'POST', '/auth/impersonation/stop', {})).status).toBe(204)
    expect((await con(request, token, 'GET', '/auth/me')).status, 'detener invalida el token de observación').toBe(401)

    const auditoria = data((await api(request, 'superadmin', 'GET', '/admin/security/impersonations')).body) as { target: { id: number }; reason: string }[]
    expect(auditoria.some(s => s.target.id === ctx.userId && /Revisión de permisos/.test(s.reason)), 'la sesión queda registrada con su motivo').toBe(true)
  })

  test('6. niveles de seguridad y notificaciones', async ({ request }) => {
    const nivel = { name: `Nivel flujo ${STAMP.slice(-5)}`, level: 50 }
    expect((await api(request, 'vendedor', 'POST', '/security-levels', nivel)).status).toBe(403)
    const creado = await api(request, 'gerencia', 'POST', '/security-levels', nivel)
    expect(creado.status).toBe(201)
    ctx.levelId = creado.body.id
    expect((await api(request, 'gerencia', 'PATCH', `/security-levels/${ctx.levelId}/status`, { is_active: false })).status).toBe(200)

    const lista = await api(request, 'contabilidad', 'GET', '/notifications')
    expect(lista.status).toBe(200)
    expect((await api(request, 'contabilidad', 'POST', '/notifications/read-all', {})).status).toBe(200)
    expect((await api(request, 'contabilidad', 'POST', '/notifications/999999/read', {})).status, 'una notificación ajena o inexistente es 404').toBe(404)
  })
})
