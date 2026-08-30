import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-359 (REQ-289): vistas SECUNDARIAS de apoyo (Movimiento de Herramientas / Kardex,
 * Informe móvil) NO deben mostrar el menú de navegación general de las 5 pestañas. Rebote de QA
 * (Marly, 2026-08-20) sobre el Kardex mostrando el sidebar/topbar completo. Fix: FocusedViewShell
 * (sin Sidebar/TopBar) para estas 2 rutas, commit ffa921e, desplegado a dev.atlanticerp.ai.
 *
 * Cuenta real (password = email): servicio@illuminations.com.pa (Aaron Leis, lider_servicios).
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum359-focused-views-20260820'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('1. Kardex vía "Movimiento de herramientas" (pestaña nueva) — sin sidebar, con botón Cerrar', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /movimiento de herramientas/i }).click(),
  ])
  await popup.waitForLoadState('domcontentloaded')
  await popup.waitForTimeout(1200)
  await popup.screenshot({ path: `${DL_DIR}/01-kardex-sin-sidebar.png`, fullPage: true })

  await expect(popup.locator('nav')).toHaveCount(0)
  await expect(popup.getByRole('heading', { name: /movimiento de herramientas/i })).toBeVisible()
  await expect(popup.getByRole('button', { name: /cerrar/i })).toBeVisible()
  expect(errors, `Errores de página en Kardex: ${errors.join(' | ')}`).toEqual([])
})

test('2. Kardex vía URL directa — sin sidebar (mismo criterio, sin depender del origen de navegación)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tools/kardex`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/02-kardex-url-directa.png`, fullPage: true })

  await expect(page.locator('nav')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /cerrar/i })).toBeVisible()
  expect(errors, `Errores de página: ${errors.join(' | ')}`).toEqual([])
})

test('4. Informe móvil (ticket RET-2026-0001, id 12, on_site/pending) — sin sidebar, back propio de la página intacto', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets/12/inspection-report/movil`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/03-informe-movil-sin-sidebar.png`, fullPage: true })

  await expect(page.locator('nav')).toHaveCount(0)
  // Botón propio de la página (ya existía antes de este fix) — confirma que no se duplicó ni se
  // rompió al mover la ruta al nuevo shell.
  await expect(page.getByRole('button', { name: /volver al ticket/i })).toBeVisible()
  expect(errors, `Errores de página en Informe móvil: ${errors.join(' | ')}`).toEqual([])
})

test('3. Insumos y Herramientas (pantalla principal) — el sidebar SIGUE apareciendo, no se rompió el resto de la app', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)
  // Sidebar se monta 2 veces en el DOM (drawer móvil + columna desktop, una oculta por CSS según
  // breakpoint) — el punto de este smoke es "sigue existiendo", no un conteo exacto.
  expect(await page.locator('aside nav').count()).toBeGreaterThan(0)
})
