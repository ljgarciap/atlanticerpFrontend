import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review — SCRUM-175 (REQ-111), Inicio de Compras + getHomeRoute() (src/lib/homeRoute.ts).
 *
 * Este es un smoke test PERMANENTE (no descartable) — CLAUDE.md del proyecto pide promover a
 * e2e/ cualquier gate de routing/estado/permiso que ya se rompió una vez. El bug original
 * (CRÍTICO, reportado por Daniela 2026-08-04): lidercompras@test.com (Yirena,
 * lider_compras) quedaba en loop infinito de <Navigate> / pantalla en blanco al hacer login,
 * porque App.tsx tenía un FALLBACK_ROUTE fijo a '/ventas-diseno/home' (módulo al que ella no
 * tiene acceso). Fix: src/lib/homeRoute.ts resuelve el primer módulo real del usuario
 * (ventas_diseno > compras > bodega > servicios > admin_contab > gerencia > operaciones), con
 * '/settings' como red de seguridad final.
 *
 * Corre LOCAL (baseURL default de playwright.config.ts, http://localhost:5173).
 */
test.describe.configure({ mode: 'serial' })

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function logout(page: Page) {
  // TopBar user menu -> logout. Fallback: borrar storage y volver a /login si no se encuentra
  // el botón (no bloquea el smoke test por un selector de UI ajeno a este ticket).
  const userMenu = page.getByRole('button', { name: /usuario|cuenta|perfil/i }).first()
  if (await userMenu.isVisible().catch(() => false)) {
    await userMenu.click()
    const logoutBtn = page.getByRole('button', { name: /cerrar sesión|logout/i }).first()
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click()
      await page.waitForTimeout(800)
      return
    }
  }
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
}

test('CRÍTICO original — Yirena (lider_compras) aterriza directo en /compras/inicio, sin loop ni pantalla en blanco', async ({ page }) => {
  await login(page, 'lidercompras@test.com')
  await expect(page).toHaveURL(/\/compras\/inicio/, { timeout: 15000 })
  // Contenido real visible, no solo la URL correcta — el bug original era loop -> blanco aunque
  // la URL a veces parpadeaba correcta a mitad del loop.
  await expect(page.getByText(/Hola,/i)).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Resumen del mes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mi calendario' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Órdenes críticas' })).toBeVisible()

  // Layout REQ del fix — Resumen del mes y Mi calendario comparten la fila 1 (mismo
  // bounding-box top), Pendientes y Órdenes críticas comparten la fila 2 — ya no hay
  // lg:col-span-2 en "Resumen del mes" empujando todo una fila más abajo.
  const resumenBox = await page.getByRole('heading', { name: 'Resumen del mes' }).boundingBox()
  const calendarioBox = await page.getByRole('heading', { name: 'Mi calendario' }).boundingBox()
  const pendientesBox = await page.getByRole('heading', { name: 'Pendientes' }).boundingBox()
  const ordenesBox = await page.getByRole('heading', { name: 'Órdenes críticas' }).boundingBox()
  expect(resumenBox && calendarioBox && Math.abs(resumenBox.y - calendarioBox.y) < 20).toBeTruthy()
  expect(pendientesBox && ordenesBox && Math.abs(pendientesBox.y - ordenesBox.y) < 20).toBeTruthy()
  expect(resumenBox && pendientesBox && pendientesBox.y > resumenBox.y).toBeTruthy()

  await page.screenshot({ path: 'test-results/scrum175-compras-home-yirena.png', fullPage: true })
})

test('logout/login repetido — no es un fluke de caché, Yirena sigue aterrizando en /compras/inicio', async ({ page }) => {
  await login(page, 'lidercompras@test.com')
  await expect(page).toHaveURL(/\/compras\/inicio/, { timeout: 15000 })

  await logout(page)
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })

  await login(page, 'lidercompras@test.com')
  await expect(page).toHaveURL(/\/compras\/inicio/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Resumen del mes' })).toBeVisible()
})

test('regresión — Daniela (Gerencia Total, acceso a todo) sigue aterrizando en Ventas & Diseño primero', async ({ page }) => {
  await login(page, 'gerencia@test.com')
  await expect(page).toHaveURL(/\/ventas-diseno\/home/, { timeout: 15000 })
})

test('regresión — Esteban (lider_bodega, sin compras/ventas_diseno) aterriza en /bodega/home', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await expect(page).toHaveURL(/\/bodega\/home/, { timeout: 15000 })
})

test('catch-all — ruta vieja eliminada (/dashboard) resuelve al home real del usuario logueado, sin loop ni blanco', async ({ page }) => {
  await login(page, 'lidercompras@test.com')
  await expect(page).toHaveURL(/\/compras\/inicio/, { timeout: 15000 })

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/compras\/inicio/, { timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Resumen del mes' })).toBeVisible()
})

test('fallback universal — perfil más angosto del roster real (asistente_administrativa) aterriza sin loop ni blanco', async ({ page }) => {
  // Asistente Administrativa Test (asistente_administrativa, Nivel 1 Read Only) es el perfil más angosto que
  // existe hoy en el roster real de dev/test — confirmado en vivo que aterriza en
  // /admin-contab (tiene admin_contab.view=true), no en /settings: ningún usuario real del
  // roster tiene CERO módulos de negocio, así que UNIVERSAL_FALLBACK_ROUTE ('/settings') no se
  // puede ejercitar con una cuenta real hoy. Ese caso exacto (modules vacío) ya está cubierto
  // determinísticamente en src/lib/homeRoute.test.ts ("sin ningún módulo visible, cae al
  // fallback universal"). Acá el objetivo es más angosto pero igual de real: confirmar que el
  // perfil de MENOR acceso del sistema no cae en loop/blanco/login-roto.
  await login(page, 'asistenteadministrativa@test.com')
  await page.waitForTimeout(1000)
  const url = page.url()
  const landedOnSettingsOrModule =
    /\/settings/.test(url) ||
    /\/(ventas-diseno|compras|bodega|servicios|admin-contab|gerencia|operaciones)/.test(url)
  expect(landedOnSettingsOrModule).toBeTruthy()
  // Nunca debe quedar en /login (login exitoso pero redirect roto) ni en blanco.
  expect(/\/login/.test(url)).toBeFalsy()
  const bodyText = await page.locator('body').innerText()
  expect(bodyText.trim().length).toBeGreaterThan(0)
})
