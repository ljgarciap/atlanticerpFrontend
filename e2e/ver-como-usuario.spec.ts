import { test, expect, type Page } from '@playwright/test'

// SCRUM-1158 — spec PERMANENTE de «Ver como usuario» (frontend).
//
// Por qué se queda: protege un gate de seguridad. Mientras un superadmin ve la app como otra persona:
//   - la franja «Viendo como …» (solo lectura, cuenta regresiva, «Salir») debe estar siempre visible;
//   - la sesión observada NO tiene refresh token (C8 del threat model) ni queda persistido ninguno;
//   - una escritura rechazada (403 `impersonation_read_only`) se explica, y un 401 devuelve a la sesión real, no al login;
//   - «Salir» restaura exactamente la sesión real (token y refresh token);
//   - la acción «Ver como» está deshabilitada para uno mismo y para otros superadmins.
//
// Autosembrado, sin depender de ningún entorno ni de IDs reales: la sesión se inyecta en localStorage y TODA la API (`/api/**`) se responde
// desde acá con page.route. No toca el backend ni datos de negocio; corre igual contra localhost, dev o test. NO ejecuta el contrato real
// del backend (eso lo cubre el Pre-QA contra el backend de SCRUM-1158): aquí el contrato es el acordado en el diseño §3.
// BASE explícito por VER_COMO_BASE_URL (default: localhost del dev server, nunca dev.atlanticerp.ai).

const BASE = process.env.VER_COMO_BASE_URL ?? 'http://localhost:5173'
test.use({ baseURL: BASE })

const ACTOR_TOKEN   = 'e2e-actor-access'
const ACTOR_REFRESH = 'e2e-actor-refresh'
const IMP_TOKEN     = 'e2e-impersonation-access'
const PASSWORD      = 'Operador-E2E-123'
const REASON        = 'SCRUM-1200 la vendedora no ve el pipeline'

// El backend siempre manda las 7 llaves de módulos (en false por defecto); con menos, el Sidebar real se rompe.
const NO_MODULES = Object.fromEntries(
  ['ventas_diseno', 'compras', 'bodega', 'servicios', 'admin_contab', 'gerencia', 'operaciones']
    .map(m => [m, { view: false, view_team: false, edit: false, approve: false }]),
)

const actor = {
  id: 1, first_name: 'Super', last_name: 'E2E', email: 'super-e2e@example.invalid', language: 'es',
  role: 'superadmin', role_id: 1, security_level: 10, permissions: ['superadmin.all', 'security.users'],
  modules: NO_MODULES, flags: { approve_large_amounts: false, manage_users: true },
}

function listUser(overrides: Record<string, unknown>) {
  return {
    phone: null, job_title: null, hire_date: null, manager: null, is_active: true, mfa_enabled: false, notes: null, department: null,
    extra_permissions: [], security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [], role_id: 2,
    additional_role_ids: [], approve_large_amounts: false, manage_users: false, ...overrides,
  }
}

const USERS = [
  listUser({ id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'vera-e2e@example.invalid' }),
  listUser({ id: 78, first_name: 'Otro', last_name: 'Superadmin', email: 'otro-super-e2e@example.invalid', roles: ['superadmin'] }),
  listUser({ id: 1, first_name: 'Super', last_name: 'E2E', email: 'super-e2e@example.invalid', roles: ['superadmin'] }),
]

const observedUser = {
  id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'vera-e2e@example.invalid', language: 'es',
  role: 'vendedor', role_id: 2, security_level: 3, permissions: [], flags: { approve_large_amounts: false, manage_users: false },
  // Sin ningún módulo visible: su pantalla de inicio es /settings (getHomeRoute), la única sin datos de negocio que simular. Con
  // Ventas & Diseño visible, su Inicio exige payloads reales de varios endpoints (resumen, pipeline, calendario) y no es lo que se prueba acá.
  modules: NO_MODULES,
  impersonation: {
    id: 'e2e-imp-1', actor_id: 1, actor_name: 'Super E2E', target_name: 'Vera Vendedora',
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
}

interface Captures { startBody?: Record<string, unknown>; stopCalls: number; revoked: string[] }

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(page: Page, captures: Captures, opts: { startStatus?: number; startBody?: unknown } = {}) {
  await page.addInitScript(([u, token, refresh]) => {
    // Solo en la primera carga: tras entrar a «Ver como» la app reescribe estos valores y una recarga NO debe pisarlos.
    if (sessionStorage.getItem('e2e-seeded') === '1') return
    sessionStorage.setItem('e2e-seeded', '1')
    localStorage.setItem('accessToken', token as string)
    localStorage.setItem('atlanticerp_lang', 'es')
    localStorage.setItem('atlanticerp-auth-v3', JSON.stringify({ state: { user: u, refreshToken: refresh }, version: 0 }))
  }, [actor, ACTOR_TOKEN, ACTOR_REFRESH])

  // Fallback (prioridad más baja). Predicado sobre /api/: el comodín '**/api/**' también atraparía los módulos de Vite (/src/api/*.ts).
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill(json([])))
  await page.route(url => url.pathname.startsWith('/api/auth/'), route => route.fulfill(json({ user: actor })))

  await page.route(url => url.pathname === '/api/users', route => route.fulfill(json({
    data: USERS, meta: { total: USERS.length, per_page: 20, current_page: 1, last_page: 1 },
  })))
  await page.route(url => url.pathname === '/api/roles', route => route.fulfill(json([])))

  await page.route('**/api/users/77/impersonate', route => {
    captures.startBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill(json(opts.startBody ?? {
      token: IMP_TOKEN, token_type: 'Bearer', expires_in_ms: 1_800_000, user: observedUser,
    }, opts.startStatus ?? 201))
  })
  await page.route('**/api/auth/impersonation/stop', route => {
    captures.stopCalls++
    return route.fulfill({ status: 204 })
  })
  await page.route(/\/api\/admin\/security\/impersonations\/[^/]+\/revoke$/, route => {
    captures.revoked.push(route.request().url().split('/').slice(-2)[0])
    return route.fulfill({ status: 204 })
  })
}

const newCaptures = (): Captures => ({ stopCalls: 0, revoked: [] })

async function openUsers(page: Page) {
  await page.goto('/security/users')
  await expect(page.getByText('Vera Vendedora')).toBeVisible()
}

async function startViewAsVera(page: Page) {
  await page.getByRole('row', { name: /Vera Vendedora/ }).getByRole('button', { name: 'Ver como' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Motivo').fill(REASON)
  await dialog.getByLabel('Tu contraseña').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Ver como esta persona' }).click()
}

const persisted = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('atlanticerp-auth-v3') ?? '{}').state)
const accessToken = (page: Page) => page.evaluate(() => localStorage.getItem('accessToken'))

test.describe('Ver como usuario — entrada', () => {
  test('la acción está deshabilitada para uno mismo y para otros superadmins, y habilitada para una persona común', async ({ page }) => {
    await setup(page, newCaptures())
    await openUsers(page)

    await expect(page.getByRole('row', { name: /Vera Vendedora/ }).getByRole('button', { name: 'Ver como' })).toBeEnabled()
    await expect(page.getByRole('row', { name: /Otro Superadmin/ }).getByRole('button', { name: 'Ver como' })).toBeDisabled()
    await expect(page.getByRole('row', { name: /Super E2E/ }).getByRole('button', { name: 'Ver como' })).toBeDisabled()
  })

  test('el botón de confirmar exige motivo y contraseña', async ({ page }) => {
    await setup(page, newCaptures())
    await openUsers(page)
    await page.getByRole('row', { name: /Vera Vendedora/ }).getByRole('button', { name: 'Ver como' }).click()

    const dialog = page.getByRole('dialog')
    const confirm = dialog.getByRole('button', { name: 'Ver como esta persona' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Motivo').fill(REASON)
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Tu contraseña').fill(PASSWORD)
    await expect(confirm).toBeEnabled()
  })

  test('una contraseña incorrecta no cambia de sesión y limpia el campo', async ({ page }) => {
    const captures = newCaptures()
    await setup(page, captures, { startStatus: 422, startBody: { message: 'x', code: 'operator_reauth_failed' } })
    await openUsers(page)
    await startViewAsVera(page)

    await expect(page.getByText('Contraseña incorrecta.')).toBeVisible()
    await expect(page.getByLabel('Tu contraseña')).toHaveValue('')
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como' })).toHaveCount(0)
    expect(await accessToken(page)).toBe(ACTOR_TOKEN)
  })
})

test.describe('Ver como usuario — sesión observada', () => {
  test('al iniciar: manda motivo y contraseña, aparece la franja y NO queda ningún refresh token', async ({ page }) => {
    const captures = newCaptures()
    await setup(page, captures)
    await openUsers(page)
    await startViewAsVera(page)

    const banner = page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Solo lectura')
    await expect(banner).toContainText('Super E2E')
    await expect(banner.getByRole('timer')).toContainText(/Tiempo restante: (29|30):\d\d/)
    await expect(page).toHaveURL(/\/settings/)

    expect(captures.startBody).toEqual({ reason: REASON, operator_password: PASSWORD })
    expect(await accessToken(page)).toBe(IMP_TOKEN)
    // C8: ni en memoria ni persistido hay refresh token de la sesión observada.
    expect((await persisted(page)).refreshToken).toBeNull()
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(ACTOR_REFRESH)
  })

  test('si la persona observada tiene el cambio de contraseña pendiente, el superadmin ve igual su app (no la pantalla obligatoria)', async ({ page }) => {
    await setup(page, newCaptures(), {
      startBody: { token: IMP_TOKEN, token_type: 'Bearer', expires_in_ms: 1_800_000, user: { ...observedUser, must_change_password: true } },
    })
    await openUsers(page)
    await startViewAsVera(page)

    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })).toBeVisible()
    await expect(page).toHaveURL(/\/settings/)
    // La pantalla obligatoria no lleva ni sidebar ni franja: si hubiera tapado la app, la franja de arriba no existiría.
    expect((await persisted(page)).user.must_change_password).toBe(true)
  })

  test('la franja sigue ahí al navegar y tras recargar la página', async ({ page }) => {
    await setup(page, newCaptures())
    await openUsers(page)
    await startViewAsVera(page)
    const banner = page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })
    await expect(banner).toBeVisible()

    await page.reload()

    await expect(banner).toBeVisible()
    expect(await accessToken(page)).toBe(IMP_TOKEN)
  })

  test('una escritura rechazada (403 impersonation_read_only) se explica con un aviso de solo lectura', async ({ page }) => {
    await setup(page, newCaptures())
    await page.route('**/api/e2e/escritura', route => route.fulfill(json({ message: 'ro', code: 'impersonation_read_only' }, 403)))
    await openUsers(page)
    await startViewAsVera(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como' })).toBeVisible()

    // Misma instancia de axios (con los interceptores reales) que usa la app: en dev, Vite sirve cada módulo por URL, una sola vez.
    const status = await page.evaluate(async () => {
      const mod = await import('/src/api/authApi.ts')
      return mod.default.put('/e2e/escritura', {}).then(() => 200, (e: { response?: { status: number } }) => e.response?.status)
    })

    expect(status).toBe(403)
    await expect(page.getByText('Modo solo lectura: no se guardan cambios')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })).toBeVisible()   // no se cierra nada
  })

  test('un 401 (sesión terminada) devuelve a la sesión real con aviso, no al login', async ({ page }) => {
    await setup(page, newCaptures())
    await page.route('**/api/e2e/ping', route => route.fulfill(json({ message: 'x', code: 'impersonation_ended' }, 401)))
    await openUsers(page)
    await startViewAsVera(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como' })).toBeVisible()

    await page.evaluate(async () => {
      const mod = await import('/src/api/authApi.ts')
      await mod.default.get('/e2e/ping').catch(() => undefined)
    })

    await expect(page.getByText('La sesión de Ver como terminó. Volviste a tu cuenta.')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como' })).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)
    expect(await accessToken(page)).toBe(ACTOR_TOKEN)
  })

  test('«Salir» avisa al backend, restaura token y refresh token reales y vuelve a Seguridad', async ({ page }) => {
    const captures = newCaptures()
    await setup(page, captures)
    await openUsers(page)
    await startViewAsVera(page)
    const banner = page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: 'Salir' }).click()

    await expect(page).toHaveURL(/\/security\/users/)
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como' })).toHaveCount(0)
    expect(captures.stopCalls).toBe(1)
    expect(await accessToken(page)).toBe(ACTOR_TOKEN)
    const state = await persisted(page)
    expect(state.refreshToken).toBe(ACTOR_REFRESH)
    expect(state.user.id).toBe(1)
  })
})

test.describe('Sesiones de soporte', () => {
  test('lista las sesiones y permite terminar una activa', async ({ page }) => {
    const captures = newCaptures()
    await setup(page, captures)
    await page.route(url => url.pathname === '/api/admin/security/impersonations', route => route.fulfill(json({
      data: [
        { id: 'e2e-imp-activa', actor: { id: 1, name: 'Super E2E' }, target: { id: 77, name: 'Vera Vendedora' }, reason: REASON,
          started_at: '2026-10-19T15:00:00Z', expires_at: '2026-10-19T15:30:00Z', ended_at: null, ended_reason: null, status: 'active' },
        { id: 'e2e-imp-cerrada', actor: { id: 1, name: 'Super E2E' }, target: { id: 80, name: 'Otra Persona' }, reason: 'Revisión de permisos',
          started_at: '2026-10-18T15:00:00Z', expires_at: '2026-10-18T15:30:00Z', ended_at: '2026-10-18T15:10:00Z', ended_reason: 'manual', status: 'ended' },
      ],
      meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
    })))

    await page.goto('/security/impersonations')
    await expect(page.getByRole('heading', { name: 'Sesiones de soporte' })).toBeVisible()
    await expect(page.getByRole('row', { name: /Vera Vendedora/ })).toContainText('Activa')
    await expect(page.getByRole('row', { name: /Otra Persona/ })).toContainText('El superadmin salió')
    await expect(page.getByRole('button', { name: 'Terminar' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Terminar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Terminar sesión' }).click()

    await expect.poll(() => captures.revoked).toEqual(['e2e-imp-activa'])
  })
})

// SCRUM-1158 (Pre-QA UI-C) — varias pestañas del mismo navegador comparten localStorage: la que NO originó el cambio debe recargarse al entrar o
// salir de «Ver como», para no mostrar la UI del superadmin (sin franja) mientras su API ya usa el token de la otra identidad.
test.describe('Ver como usuario — varias pestañas', () => {
  const MARK = '__sinRecarga'
  const marked = (p: Page) => p.evaluate(m => (window as unknown as Record<string, unknown>)[m] === true, MARK)

  test('iniciar y salir en una pestaña recarga la otra; un refresh silencioso no la recarga', async ({ page, context }) => {
    const captures = newCaptures()
    await setup(page, captures)
    await openUsers(page)

    const page2 = await context.newPage()
    await setup(page2, captures)
    await page2.goto('/security/users')
    await expect(page2.getByText('Vera Vendedora')).toBeVisible()
    // Marca en memoria: una recarga la borra.
    await page2.evaluate(m => { (window as unknown as Record<string, unknown>)[m] = true }, MARK)

    // Refresh silencioso en la pestaña 1: reescribe accessToken y refreshToken con el MISMO usuario. No debe recargar la pestaña 2.
    await page.evaluate(() => {
      const v = JSON.parse(localStorage.getItem('atlanticerp-auth-v3') ?? '{}')
      v.state.refreshToken = 'e2e-refresh-rotado'
      localStorage.setItem('accessToken', 'e2e-actor-access-rotado')
      localStorage.setItem('atlanticerp-auth-v3', JSON.stringify(v))
    })
    await page2.waitForTimeout(600)
    expect(await marked(page2)).toBe(true)

    // INICIAR en la pestaña 1 → la 2 se recarga y muestra la franja sin tocarla.
    await startViewAsVera(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })).toBeVisible()
    await expect(page2.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })).toBeVisible()
    expect(await marked(page2)).toBe(false)
    expect((await persisted(page2)).user.id).toBe(77)

    // SALIR en la pestaña 1 → la 2 vuelve a la identidad real.
    await page2.evaluate(m => { (window as unknown as Record<string, unknown>)[m] = true }, MARK)
    await page.getByRole('alert').filter({ hasText: 'Viendo como' }).getByRole('button', { name: 'Salir' }).click()
    await expect(page).toHaveURL(/\/security\/users/)
    await expect(page2.getByRole('alert').filter({ hasText: 'Viendo como' })).toHaveCount(0)
    expect(await marked(page2)).toBe(false)
    expect((await persisted(page2)).user.id).toBe(1)
    // El token real que se restaura es el vigente al iniciar (el rotado por el refresh silencioso), no el de la primera carga.
    expect(await accessToken(page2)).toBe('e2e-actor-access-rotado')
  })

  test('un login o cierre de sesión normal en otra pestaña no recarga nada', async ({ page, context }) => {
    await setup(page, newCaptures())
    await openUsers(page)
    const page2 = await context.newPage()
    await setup(page2, newCaptures())
    await page2.goto('/security/users')
    await expect(page2.getByText('Vera Vendedora')).toBeVisible()
    await page2.evaluate(m => { (window as unknown as Record<string, unknown>)[m] = true }, MARK)

    // Cambio de perfil/idioma en la pestaña 1 (mismo usuario, sin impersonación).
    await page.evaluate(() => {
      const v = JSON.parse(localStorage.getItem('atlanticerp-auth-v3') ?? '{}')
      v.state.user.language = 'en'
      localStorage.setItem('atlanticerp-auth-v3', JSON.stringify(v))
    })
    await page2.waitForTimeout(600)

    expect(await marked(page2)).toBe(true)
  })
})

// SCRUM-1158 (Pre-QA UI-C, "no verificado") — la franja y el modal se ven bien en un teléfono (390 px).
test.describe('Ver como usuario — móvil 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const inside = async (loc: ReturnType<Page['locator']>, width = 390) => {
    const box = await loc.boundingBox()
    expect(box, 'el elemento debe estar renderizado').not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5)
  }

  test('el modal cabe en la pantalla, sin desborde horizontal, y se puede completar', async ({ page }) => {
    await setup(page, newCaptures())
    await openUsers(page)
    await page.getByRole('row', { name: /Vera Vendedora/ }).getByRole('button', { name: 'Ver como' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await inside(dialog)
    await inside(dialog.getByLabel('Motivo'))
    await inside(dialog.getByLabel('Tu contraseña'))
    await dialog.getByLabel('Motivo').fill(REASON)
    await dialog.getByLabel('Tu contraseña').fill(PASSWORD)
    const confirm = dialog.getByRole('button', { name: 'Ver como esta persona' })
    await expect(confirm).toBeEnabled()
    await inside(confirm)
    await inside(dialog.getByRole('button', { name: 'Cancelar' }))
  })

  test('la franja cabe, muestra a quién se observa, la cuenta regresiva y «Salir» alcanzable', async ({ page }) => {
    await setup(page, newCaptures())
    await openUsers(page)
    await startViewAsVera(page)

    const banner = page.getByRole('alert').filter({ hasText: 'Viendo como Vera Vendedora' })
    await expect(banner).toBeVisible()
    await inside(banner)
    await expect(banner.getByRole('timer')).toBeVisible()
    await inside(banner.getByRole('timer'))
    const exit = banner.getByRole('button', { name: 'Salir' })
    await expect(exit).toBeInViewport()
    await inside(exit)
    // La franja no provoca scroll horizontal de la página.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await exit.click()
    await expect(page).toHaveURL(/\/security\/users/)
  })
})

