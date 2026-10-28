import { test, expect, type Page, type Route } from '@playwright/test'

// SCRUM-1140 (Pre-QA, 2.ª pasada) — spec PERMANENTE de la asignación de los permisos de facturación desde
// Seguridad > Usuarios > "Permisos adicionales". La 1.ª pasada encontró que el drawer leía una lista fija de 11 permisos y
// `admin_contab.edit.receptor_fiscal` / `admin_contab.edit.receptor_consumidor_final` no se podían asignar desde la pantalla.
//
// Autosembrado: el listado de usuarios y el guardado (PUT) se responden con un usuario sintético (page.route), así que no
// toca ninguna fila real ni depende de IDs; el login, el JWT y el catálogo (`GET /api/permission-catalog`) son los REALES.
// Cuentas (por defecto las del entorno local/dev): superadmin demo y un usuario de rol `management` que NO es superadmin.
// BASE explícito: PREQA_BASE_URL (default localhost). Solo corre contra local, dev o test.

const BASE = process.env.PREQA_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const SUPERADMIN = process.env.E2E_SUPERADMIN_EMAIL ?? 'superadmin@atlantic.test'
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? 'Password123!'
const NO_SUPERADMIN = process.env.E2E_MANAGEMENT_EMAIL ?? 'gerencia@test.com'
const NO_SUPERADMIN_PASSWORD = process.env.E2E_MANAGEMENT_PASSWORD ?? NO_SUPERADMIN

const P_CF = 'admin_contab.edit.receptor_consumidor_final'
const P_FISCAL = 'admin_contab.edit.receptor_fiscal'
const SYNTH_EMAIL = 'sintetico.scrum1140@atlantic.test'
const L_CF = /Facturación — Facturar a Consumidor final/
const L_FISCAL = /Facturación — Corregir RUC y razón social del cliente/

test.use({ baseURL: BASE })

test.beforeAll(() => {
  const host = new URL(BASE).hostname
  if (!['localhost', '127.0.0.1', ...(process.env.E2E_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)].includes(host)) {
    throw new Error(`permisos-adicionales-receptor-facturacion solo corre contra local, dev o test (BASE=${BASE})`)
  }
})

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('atlanticerp_lang', 'es') })
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|sign in/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 })
}

/** Usuario sintético de rol base real (id 4 = Asistente Administrativa en el roster) y nivel 1; el PUT se captura, no se persiste. */
function usuarioSintetico(extra: string[]) {
  return {
    id: 987101, first_name: 'Sintetico', last_name: 'SCRUM1140', email: SYNTH_EMAIL, phone: null, job_title: null, hire_date: null,
    manager: null, is_active: true, mfa_enabled: false, notes: null, extra_permissions: extra, department: null,
    security_level: { id: 1, level: 1, name: 'Read Only' }, roles: [], role_id: 4, additional_role_ids: [],
    approve_large_amounts: false, manage_users: false,
  }
}

async function stubUsuarios(page: Page, extra: string[]): Promise<Record<string, unknown>[]> {
  const puts: Record<string, unknown>[] = []
  await page.route(url => /^\/api\/users(\/\d+)?$/.test(url.pathname), async (route: Route) => {
    const req = route.request()
    const pathname = new URL(req.url()).pathname
    if (req.method() === 'GET' && pathname === '/api/users') {
      return route.fulfill({ json: { data: [usuarioSintetico(extra)], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } } })
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON() as Record<string, unknown>
      puts.push(body)
      return route.fulfill({ json: { ...usuarioSintetico(extra), ...body } })
    }
    return route.continue()
  })
  return puts
}

async function abrirEdicion(page: Page) {
  await page.goto('/security/users')
  await page.getByPlaceholder('Buscar por nombre o email…').fill(SYNTH_EMAIL)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.locator('tr', { hasText: SYNTH_EMAIL }).getByRole('button', { name: 'Editar' }).click()
  // El formulario se re-hidrata cuando terminan de cargar niveles/roles (efecto `reset` con dependencia en `level1Id`): un clic
  // anterior se pierde. Se espera a que la red quede en reposo antes de tocar nada (ver hallazgo BAJO del Pre-QA, 2.ª pasada).
  await page.waitForLoadState('networkidle')
}

test('un superadmin ve los permisos de facturación en "Permisos adicionales", los asigna y se envían al guardar', async ({ page }) => {
  const puts = await stubUsuarios(page, [])
  await login(page, SUPERADMIN, SUPERADMIN_PASSWORD)
  await abrirEdicion(page)

  const caja = page.getByTestId('extra-permissions')
  await expect(caja.getByRole('button', { name: L_CF })).toBeVisible()
  await expect(caja.getByRole('button', { name: L_FISCAL })).toBeVisible()
  await caja.getByRole('button', { name: L_CF }).click()
  await caja.getByRole('button', { name: L_FISCAL }).click()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  await expect.poll(() => puts.length).toBe(1)
  expect(puts[0].extra_permissions).toEqual(expect.arrayContaining([P_CF, P_FISCAL]))
})

test('guardar sin tocar conserva los permisos que el usuario ya tenía, incluidos los que no figuran en el catálogo', async ({ page }) => {
  const previos = ['ventas_diseno.edit.client_tax_data', P_FISCAL]
  const puts = await stubUsuarios(page, previos)
  await login(page, SUPERADMIN, SUPERADMIN_PASSWORD)
  await abrirEdicion(page)
  await expect(page.getByTestId('extra-permissions')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  await expect.poll(() => puts.length).toBe(1)
  expect([...(puts[0].extra_permissions as string[])].sort()).toEqual([...previos].sort())
})

test('quien no es superadmin no ve el selector de permisos adicionales ni envía extra_permissions', async ({ page }) => {
  const puts = await stubUsuarios(page, [P_FISCAL])
  await login(page, NO_SUPERADMIN, NO_SUPERADMIN_PASSWORD)
  await abrirEdicion(page)
  await expect(page.getByTestId('extra-permissions')).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  await expect.poll(() => puts.length).toBe(1)
  expect(puts[0]).not.toHaveProperty('extra_permissions')
})
