import { execSync } from 'node:child_process'
import { test, expect, type APIRequestContext } from '@playwright/test'

// Flujo ejecutable de los transversales (catálogo: atlanticerp-backend/docs/flujos/transversales.md): ciclo de vida de un usuario (alta, primer
// activación por enlace, permisos adicionales, desactivación, reinicio), «Ver como usuario», niveles de seguridad y
// notificaciones. Por la API real; crea sus propios datos (usuario y nivel «flujo») y los desactiva al terminar. UN worker (npm run e2e:flujos).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const API = `${BASE}/api`
const ROLES = ['superadmin', 'gerencia', 'vendedor', 'contabilidad'] as const
type Rol = (typeof ROLES)[number]

const tokens: Partial<Record<Rol, string>> = {}
const ctx: Record<string, number | string> = {}
const STAMP = String(Date.now())
type Res = { status: number; body: any }

// Fase 12c: una cuenta nueva o reiniciada no tiene clave utilizable; se activa con un enlace de un solo uso. En local el correo solo queda en el log,
// así que el e2e pide el enlace con el comando de soporte (`users:activation-link`). `E2E_ACTIVATION_CMD` lo reemplaza ({email} = la cuenta).
function tokenDeActivacion(email: string): string {
  const cmd = (process.env.E2E_ACTIVATION_CMD
    ?? 'docker compose -f ../atlanticerp-backend/infra/docker-compose.yml exec -T laravel php artisan users:activation-link atlantic {email}').replace('{email}', email)
  const salida = execSync(cmd, { encoding: 'utf8' })
  const token = salida.match(/#token=([0-9a-f]+)/)?.[1]
  if (!token) throw new Error(`El comando de activación no devolvió un enlace: ${salida.slice(0, 200)}`)
  return token
}

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

  test('2. activación: sin clave utilizable; el enlace deja elegirla una sola vez y vence con uno nuevo', async ({ request }) => {
    expect((await entrar(request, email, email)).status, 'la clave ya no es el propio correo').toBe(401)

    const enlace = tokenDeActivacion(email)
    const elegir = (token: string, nueva: string, confirmacion = nueva) =>
      request.post(`${API}/auth/reset-password`, { data: { token, password: nueva, password_confirmation: confirmacion }, headers: { Accept: 'application/json' } })
    expect((await elegir(enlace, 'Ab1!')).status(), 'mínimo 8 caracteres').toBe(422)
    expect((await elegir(enlace, 'soloMinusculasLargas')).status(), 'con mayúscula y número').toBe(422)
    expect((await elegir(enlace, clave, 'otra')).status(), 'la confirmación coincide').toBe(422)
    expect((await elegir(enlace, email)).status(), 'distinta del correo').toBe(422)
    expect((await elegir('0'.repeat(64), clave)).status(), 'un enlace inventado no sirve').toBe(422)

    // un enlace nuevo anula el anterior
    const nuevoEnlace = tokenDeActivacion(email)
    expect((await elegir(enlace, clave)).status(), 'el enlace anterior quedó anulado').toBe(422)
    expect((await elegir(nuevoEnlace, clave)).status()).toBe(200)
    expect((await elegir(nuevoEnlace, 'OtraClave99!x')).status(), 'el enlace sirve una sola vez').toBe(422)

    const nuevo = await entrar(request, email, clave)
    expect(nuevo.status).toBe(200)
    expect((await con(request, nuevo.body.token, 'GET', '/auth/me')).body.must_change_password, 'al elegir su clave ya no queda cambio pendiente').toBe(false)
    expect((await con(request, nuevo.body.token, 'GET', '/ventas-diseno/home/summary')).status, 'la API responde').toBe(200)
  })

  test('3. permisos adicionales: solo los asigna superadmin y viajan en el token', async ({ request }) => {
    const permiso = 'ventas_diseno.pricing.configure'
    const guardado = async () => ((await api(request, 'superadmin', 'GET', `/users/${ctx.userId}`)).body.extra_permissions ?? []) as string[]
    expect((await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: ['no.existe'] })).status, 'solo claves del catálogo').toBe(422)
    expect((await api(request, 'vendedor', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })).status).toBe(403)

    // gerencia puede editar usuarios pero NO asignar permisos adicionales: responde 403 (antes se descartaba en silencio; Fase 12a)
    expect((await api(request, 'gerencia', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })).status, 'una cuenta que no es superadmin recibe 403').toBe(403)
    expect(await guardado(), 'y no se guarda nada').toEqual([])

    expect((await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [permiso] })).status).toBe(200)
    expect(await guardado()).toEqual([permiso])
    const token = (await entrar(request, email, clave)).body.token as string
    expect(claims(token).permissions, 'el siguiente ingreso lo trae en el token').toContain(permiso)
    await api(request, 'superadmin', 'PUT', `/users/${ctx.userId}`, { extra_permissions: [] })
    expect(await guardado()).toEqual([])
  })

  test('4. desactivar invalida el acceso al instante; reiniciar deja la cuenta sin clave hasta usar el enlace', async ({ request }) => {
    const token = (await entrar(request, email, clave)).body.token as string
    expect((await con(request, token, 'GET', '/auth/me')).status).toBe(200)
    expect((await api(request, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: false })).status).toBe(200)
    expect((await con(request, token, 'GET', '/auth/me')).status, 'el token vigente deja de servir de inmediato').toBe(401)
    expect((await entrar(request, email, clave)).status, 'no se puede ingresar desactivado').toBe(401)
    expect((await api(request, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: true })).status).toBe(200)

    expect((await api(request, 'gerencia', 'POST', `/users/${ctx.userId}/reset-password`, {})).status, 'reiniciar es solo de superadmin').toBe(403)
    expect((await api(request, 'superadmin', 'POST', `/users/${ctx.userId}/reset-password`, {})).status).toBe(200)
    expect((await entrar(request, email, clave)).status, 'la clave anterior ya no sirve').toBe(401)
    expect((await entrar(request, email, email)).status, 'tampoco queda el correo como clave (Fase 12c)').toBe(401)
    const enlace = tokenDeActivacion(email)
    const elegida = await request.post(`${API}/auth/reset-password`, { data: { token: enlace, password: clave, password_confirmation: clave }, headers: { Accept: 'application/json' } })
    expect(elegida.status(), 'con el enlace elige su clave de nuevo').toBe(200)
    expect((await entrar(request, email, clave)).status).toBe(200)
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
