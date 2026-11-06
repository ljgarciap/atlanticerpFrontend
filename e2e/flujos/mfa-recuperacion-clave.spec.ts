import { execSync } from 'node:child_process'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { API, data, iniciarSesion, llamar, type Tokens } from './apoyo/venta-cobrada'

// Flujo ejecutable de MFA y recuperación de clave (catálogo: atlanticerp-backend/docs/flujos/mfa-recuperacion-clave.md): «olvidé mi contraseña»,
// activar / usar / reiniciar el segundo factor, el modo global (opcional / obligatorio) y los topes de intentos. Por la API real; el usuario es propio
// (se crea en cada corrida, así los topes por correo y por usuario no se arrastran). Correr con UN worker (npm run e2e:flujos).
//
// En local los correos solo quedan en el log del contenedor: el código MFA y el enlace de restablecimiento se leen de ahí. `E2E_MAIL_LOG_CMD`
// reemplaza el comando que imprime el log; `E2E_THROTTLE_RESET_CMD`, el que limpia los topes (cache) para que la prueba se pueda repetir.

const COMANDO_LOG = process.env.E2E_MAIL_LOG_CMD
  ?? "docker compose -f ../atlanticerp-backend/infra/docker-compose.yml exec -T laravel sh -c 'tail -c 80000 storage/logs/laravel.log'"
const COMANDO_TOPES = process.env.E2E_THROTTLE_RESET_CMD
  ?? 'docker compose -f ../atlanticerp-backend/infra/docker-compose.yml exec -T laravel php artisan cache:clear'

const STAMP = String(Date.now())
const email = `flujo-mfa-${STAMP}@example.test`
const CLAVE = 'Flujo-Valida-1'
const ctx: Record<string, any> = {}
let tokens: Tokens

const log = () => execSync(COMANDO_LOG, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const ultimos = (patron: RegExp) => [...log().matchAll(patron)].map(m => m[1])

/** Espera (el correo viaja por la cola) a que aparezca un valor que no estaba antes del paso (se compara el valor, no la cantidad: el log se lee por cola y las entradas viejas salen de la ventana). */
async function esperarNuevo(patron: RegExp, antes: string[]): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const ultimo = ultimos(patron).at(-1)
    if (ultimo !== undefined && !antes.includes(ultimo)) return ultimo
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`No apareció el correo esperado en el log (${patron})`)
}
const CODIGO = /class="code">(\d{6})/g
const ENLACE = /reset-password#token=([0-9a-f]{64})/g

async function publico(request: APIRequestContext, method: string, path: string, payload?: unknown) {
  const r = await request.fetch(`${API}${path}`, { method, headers: { Accept: 'application/json' }, ...(payload !== undefined ? { data: payload } : {}) })
  const text = await r.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* no JSON */ }
  return { status: r.status(), body }
}
const conToken = (request: APIRequestContext, token: string, method: string, path: string, payload?: unknown) =>
  request.fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, ...(payload !== undefined ? { data: payload } : {}) })
    .then(async r => ({ status: r.status(), body: await r.json().catch(() => null) }))
const entrar = (request: APIRequestContext, correo: string, password: string) => publico(request, 'POST', '/auth/login', { email: correo, password })

/** Pide un código MFA nuevo con la sesión `token` (activación) y lo lee del correo. */
async function pedirCodigoDeActivacion(request: APIRequestContext, token: string) {
  const antes = ultimos(CODIGO)
  const r = await conToken(request, token, 'POST', '/auth/mfa/enable', { password: CLAVE })
  expect(r.status).toBe(200)
  return { retoId: r.body.mfa_challenge_id as string, codigo: await esperarNuevo(CODIGO, antes) }
}

test.describe.configure({ mode: 'serial' })

test.describe('Flujo: MFA y recuperación de clave', () => {
  test.beforeAll(async ({ request }) => {
    try { execSync(COMANDO_TOPES, { stdio: 'pipe' }) } catch (e) { console.warn('No se pudieron limpiar los topes; la prueba puede toparse con un 429 de una corrida anterior.', String(e).slice(0, 120)) }
    tokens = await iniciarSesion(request, ['gerencia', 'superadmin', 'vendedor'])
    const modo = (await llamar(request, tokens, 'superadmin', 'GET', '/settings/system')).body
    ctx.modoOriginal = modo.mfa_mode
    const roles = data((await llamar(request, tokens, 'gerencia', 'GET', '/roles')).body) as { id: number; key: string }[]
    const alta = await llamar(request, tokens, 'gerencia', 'POST', '/users', {
      first_name: 'Usuario', last_name: `Flujo MFA ${STAMP.slice(-4)}`, email, role_id: roles.find(x => x.key === 'vendedor')!.id, security_level_id: 6,
    })
    expect(alta.status).toBe(201)
    ctx.userId = data(alta.body).id
  })

  test.afterAll(async ({ request }) => {
    // Pase lo que pase, el modo global vuelve a su valor y el usuario de prueba queda inactivo.
    if (ctx.modoOriginal) await llamar(request, tokens, 'superadmin', 'PATCH', '/settings/system', { mfa_mode: ctx.modoOriginal })
    if (ctx.userId) await llamar(request, tokens, 'gerencia', 'PATCH', `/users/${ctx.userId}/status`, { is_active: false })
  })

  test('1. «olvidé mi contraseña»: misma respuesta exista o no el correo, enlace de un solo uso y reglas de la clave nueva', async ({ request }) => {
    // La cuenta nueva está pendiente de activación: su clave no es utilizable.
    expect((await entrar(request, email, email)).status, 'la clave inicial no sirve').toBe(401)

    const desconocido = await publico(request, 'POST', '/auth/forgot-password', { email: `nadie-${STAMP}@example.test` })
    const antes1 = ultimos(ENLACE)
    const real = await publico(request, 'POST', '/auth/forgot-password', { email })
    expect(desconocido.status).toBe(200)
    expect(real.status).toBe(200)
    expect(real.body.message, 'no revela si el correo existe').toBe(desconocido.body.message)
    expect((await publico(request, 'POST', '/auth/forgot-password', { email: 'no-es-correo' })).status, 'el formato se valida').toBe(422)
    const t1 = await esperarNuevo(ENLACE, antes1)

    // Un segundo pedido anula el enlace anterior.
    const antes2 = ultimos(ENLACE)
    expect((await publico(request, 'POST', '/auth/forgot-password', { email })).status).toBe(200)
    const t2 = await esperarNuevo(ENLACE, antes2)
    expect(t2).not.toBe(t1)
    const restablecer = (token: string, password: string, confirmacion = password) =>
      publico(request, 'POST', '/auth/reset-password', { token, password, password_confirmation: confirmacion })
    expect((await restablecer(t1, CLAVE)).status, 'el enlace anterior quedó anulado').toBe(422)

    // Reglas de la clave: 8 caracteres, mayúscula, minúscula, número, confirmación igual.
    expect((await restablecer(t2, 'abc')).status).toBe(422)
    expect((await restablecer(t2, 'nueva-clave-1')).status, 'sin mayúscula').toBe(422)
    expect((await restablecer(t2, CLAVE, 'Otra-Clave-1')).status, 'confirmación distinta').toBe(422)
    expect((await restablecer('x'.repeat(64), CLAVE)).status, 'enlace inventado').toBe(422)

    const ok = await restablecer(t2, CLAVE)
    expect(ok.status).toBe(200)
    expect((await restablecer(t2, 'Otra-Clave-1x')).status, 'el enlace sirve una sola vez').toBe(422)
    expect((await entrar(request, email, email)).status).toBe(401)
    const sesion = await entrar(request, email, CLAVE)
    expect(sesion.status).toBe(200)
    expect(sesion.body.user.must_change_password ?? false, 'elegir la clave propia cierra el cambio obligatorio').toBe(false)
    ctx.token = sesion.body.token as string
  })

  test('2. activar el segundo factor: pide la clave, confirma con el código del correo y el código sirve una sola vez', async ({ request }) => {
    expect((await conToken(request, ctx.token, 'GET', '/auth/mfa/status')).body).toMatchObject({ mfa_enabled: false })
    expect((await conToken(request, ctx.token, 'POST', '/auth/mfa/enable', { password: 'Equivocada-1' })).status, 'sin la clave vigente no hay código').toBe(422)

    const antes = ultimos(CODIGO)
    const reto = await conToken(request, ctx.token, 'POST', '/auth/mfa/enable', { password: CLAVE })
    expect(reto.status).toBe(200)
    const confirmar = (codigo: string) => conToken(request, ctx.token, 'POST', '/auth/mfa/enable/confirm', { mfa_challenge_id: reto.body.mfa_challenge_id, code: codigo })
    expect((await confirmar('12')).status, 'el código son 6 dígitos').toBe(422)
    expect((await confirmar('000000')).status, 'código equivocado').toBe(422)
    const codigo = await esperarNuevo(CODIGO, antes)

    // Un reto ajeno no se confirma con otra sesión.
    const ajeno = await pedirCodigoDeActivacion(request, ctx.token)
    const intento = await conToken(request, tokens.vendedor!, 'POST', '/auth/mfa/enable/confirm', { mfa_challenge_id: ajeno.retoId, code: ajeno.codigo })
    expect(intento.status, 'el reto es de otra persona').toBe(403)

    expect((await confirmar(codigo)).body).toMatchObject({ mfa_enabled: true })
    expect((await confirmar(codigo)).status, 'el código se usa una sola vez').toBe(422)
    expect((await conToken(request, ctx.token, 'GET', '/auth/mfa/status')).body).toMatchObject({ mfa_enabled: true })
  })

  test('3. ingresar con MFA: el login pide el código, reenviar anula el reto anterior, el código sirve una vez y se puede desactivar', async ({ request }) => {
    const antes = ultimos(CODIGO)
    const login = await entrar(request, email, CLAVE)
    expect(login.status).toBe(200)
    expect(login.body.requires_mfa).toBe(true)
    expect(login.body.token, 'sin el código no hay sesión').toBeUndefined()
    await esperarNuevo(CODIGO, antes)

    const antes2 = ultimos(CODIGO)
    const reenvio = await publico(request, 'POST', '/auth/mfa/resend', { mfa_challenge_id: login.body.mfa_challenge_id })
    expect(reenvio.status).toBe(200)
    expect(reenvio.body.mfa_challenge_id).not.toBe(login.body.mfa_challenge_id)
    const codigo = await esperarNuevo(CODIGO, antes2)
    expect((await publico(request, 'POST', '/auth/mfa/verify', { mfa_challenge_id: login.body.mfa_challenge_id, code: codigo })).status, 'el reto anterior quedó anulado').toBe(422)
    expect((await publico(request, 'POST', '/auth/mfa/verify', { mfa_challenge_id: reenvio.body.mfa_challenge_id, code: '000000' })).status).toBe(422)

    const ok = await publico(request, 'POST', '/auth/mfa/verify', { mfa_challenge_id: reenvio.body.mfa_challenge_id, code: codigo })
    expect(ok.status).toBe(200)
    expect(Object.keys(ok.body)).toEqual(expect.arrayContaining(['token', 'refresh_token', 'user']))
    expect((await publico(request, 'POST', '/auth/mfa/verify', { mfa_challenge_id: reenvio.body.mfa_challenge_id, code: codigo })).status, 'un código usado no vuelve a servir').toBe(422)
    ctx.token = ok.body.token as string

    // Desactivarlo uno mismo pide la clave y un código del correo (Fase 27a): la sesión sola no basta; se vuelve a activar para el paso siguiente.
    expect((await conToken(request, ctx.token, 'POST', '/auth/mfa/disable')).status, 'sin clave').toBe(422)
    expect((await conToken(request, ctx.token, 'POST', '/auth/mfa/disable', { password: 'Incorrecta1!' })).status, 'clave incorrecta').toBe(422)
    const antesBaja = ultimos(CODIGO)
    const pedirBaja = await conToken(request, ctx.token, 'POST', '/auth/mfa/disable', { password: CLAVE })
    expect(pedirBaja.status).toBe(200)
    const codigoBaja = await esperarNuevo(CODIGO, antesBaja)
    expect((await conToken(request, ctx.token, 'POST', '/auth/mfa/disable/confirm', { mfa_challenge_id: pedirBaja.body.mfa_challenge_id, code: '000000' })).status, 'código incorrecto').toBe(422)
    const baja = await conToken(request, ctx.token, 'POST', '/auth/mfa/disable/confirm', { mfa_challenge_id: pedirBaja.body.mfa_challenge_id, code: codigoBaja })
    expect(baja.status).toBe(200)
    expect(baja.body).toMatchObject({ mfa_enabled: false })
    const nuevo = await pedirCodigoDeActivacion(request, ctx.token)
    expect((await conToken(request, ctx.token, 'POST', '/auth/mfa/enable/confirm', { mfa_challenge_id: nuevo.retoId, code: nuevo.codigo })).body).toMatchObject({ mfa_enabled: true })
  })

  test('4. cinco códigos equivocados agotan el reto: hay que pedir uno nuevo', async ({ request }) => {
    const login = await entrar(request, email, CLAVE)
    expect(login.body.requires_mfa).toBe(true)
    const reto = login.body.mfa_challenge_id as string
    const respuestas: { status: number; body: any }[] = []
    for (let i = 0; i < 6; i++) respuestas.push(await publico(request, 'POST', '/auth/mfa/verify', { mfa_challenge_id: reto, code: '000000' }))
    expect(respuestas.slice(0, 4).every(r => r.status === 422 && r.body.message === 'Código incorrecto.')).toBe(true)
    expect(respuestas[4].body.message, 'el quinto fallo agota el reto').toMatch(/Demasiados intentos/)
    expect(respuestas[5].status).toBe(422)
    // Reenviar da un reto nuevo (el tope por usuario de la ventana sigue contando los fallos).
    expect((await publico(request, 'POST', '/auth/mfa/resend', { mfa_challenge_id: reto })).status).toBe(200)
  })

  test('5. reiniciar el MFA de otra persona: Gerencia y superadmin; el reinicio limpia los topes', async ({ request }) => {
    // Fase 27a: Gerencia también reinicia (no el de un superadmin ni el suyo) y la cuenta puede volver a activar de inmediato.
    expect((await llamar(request, tokens, 'vendedor', 'POST', `/admin/security/users/${ctx.userId}/mfa/reset`)).status, 'el vendedor no reinicia el MFA').toBe(403)
    expect((await llamar(request, tokens, 'gerencia', 'POST', `/admin/security/users/${ctx.userId}/mfa/reset`)).status, 'Gerencia sí reinicia').toBe(200)
    expect((await llamar(request, tokens, 'superadmin', 'POST', `/admin/security/users/${ctx.userId}/mfa/reset`)).status, 'ya no tiene MFA').toBe(422)
    expect((await llamar(request, tokens, 'superadmin', 'POST', '/admin/security/users/99999999/mfa/reset')).status).toBe(404)
    const sesion = await entrar(request, email, CLAVE)
    expect(sesion.status).toBe(200)
    expect(sesion.body.requires_mfa, 'sin MFA vuelve a entrar directo').toBeUndefined()
    ctx.token = sesion.body.token as string

    // El reinicio limpia el tope por usuario del paso anterior: volver a activar el MFA ya no se bloquea.
    const nuevo = await pedirCodigoDeActivacion(request, ctx.token)
    const reactivado = await conToken(request, ctx.token, 'POST', '/auth/mfa/enable/confirm', { mfa_challenge_id: nuevo.retoId, code: nuevo.codigo })
    expect(reactivado.status, 'el tope no sobrevive al reinicio').toBe(200)
    expect((await llamar(request, tokens, 'superadmin', 'POST', `/admin/security/users/${ctx.userId}/mfa/reset`)).status).toBe(200)
  })

  test('6. modo global: «obligatorio» exige código a quien no lo activó; solo Gerencia y superadmin lo cambian', async ({ request }) => {
    expect((await llamar(request, tokens, 'vendedor', 'PATCH', '/settings/system', { mfa_mode: 'required' })).status, 'el vendedor no cambia la política').toBe(403)
    expect((await llamar(request, tokens, 'superadmin', 'PATCH', '/settings/system', { mfa_mode: 'siempre' })).status, 'valor inválido').toBe(422)

    const antes = ultimos(CODIGO)
    expect((await llamar(request, tokens, 'superadmin', 'PATCH', '/settings/system', { mfa_mode: 'required' })).status).toBe(200)
    const login = await entrar(request, email, CLAVE)
    expect(login.status).toBe(200)
    expect(login.body.requires_mfa, 'en modo obligatorio todos reciben código').toBe(true)
    await esperarNuevo(CODIGO, antes)
    expect((await conToken(request, ctx.token, 'GET', '/auth/mfa/status')).body).toMatchObject({ mfa_enabled: false, mfa_mode: 'required' })

    expect((await llamar(request, tokens, 'superadmin', 'PATCH', '/settings/system', { mfa_mode: ctx.modoOriginal })).status).toBe(200)
    expect((await entrar(request, email, CLAVE)).body.requires_mfa, 'al volver a opcional, entra directo').toBeUndefined()
  })

  test('7. tope de solicitudes de «olvidé mi contraseña»: por correo, con 429 y sin revelar nada', async ({ request }) => {
    // Ya van 3 solicitudes de este correo en la corrida (paso 1): la siguiente agota el tope por correo (3 por hora).
    let tope: { status: number; body: any } | null = null
    for (let i = 0; i < 3 && !tope; i++) {
      const r = await publico(request, 'POST', '/auth/forgot-password', { email })
      if (r.status === 429) tope = r
    }
    expect(tope, 'el tope llega').not.toBeNull()
    expect(tope!.body).toMatchObject({ code: 'too_many_attempts' })
    expect(tope!.body.retry_after).toBeGreaterThan(0)
  })
})
