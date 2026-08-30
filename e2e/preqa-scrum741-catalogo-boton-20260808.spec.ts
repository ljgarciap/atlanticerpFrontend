import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-741 (fix puntual: botón "Catálogo" deshabilitado por error en Inicio/
 * Cotizaciones/Reportes de Ventas & Diseño, remanente de SCRUM-711 nunca actualizado cuando
 * SCRUM-700 ya lo habilitó en Clientes/Pipeline). Corre contra el stack local
 * (localhost:5173 -> proxy /api -> localhost:8090), cambios sin commitear en dev.
 *
 * Cuenta real (password = email, ver project_roster_usuarios_reales_atlanticerp.md):
 *  - neil.quiel@atlantic.com.pa (vendedor_disenador) — tiene ventas_diseno.read.
 *  - carlos@atlantic.com.pa (tecnico_servicios) — NO tiene ventas_diseno.read, usado para
 *    el check negativo del punto 5.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('1. Inicio -> Catálogo navega y carga sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page, 'neil.quiel@atlantic.com.pa')
  await page.goto(`${BASE}/ventas-diseno/home`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/01-home-antes.png', fullPage: true })

  const catalogBtn = page.locator('main').getByRole('button', { name: /^cat[aá]logo$/i })
  await expect(catalogBtn).toBeVisible()
  await expect(catalogBtn).toBeEnabled()
  await catalogBtn.click()
  await page.waitForURL(/\/ventas-diseno\/catalog/, { timeout: 5000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/01-catalog-desde-home.png', fullPage: true })

  // No debe haber quedado en una pantalla de error/blanco.
  await expect(page.locator('body')).not.toContainText(/unexpected application error|something went wrong/i)
  expect(errors, `JS errors: ${errors.join(' | ')}`).toHaveLength(0)

  // Nueva cotización sigue funcionando desde Inicio (no se rompió nada alrededor).
  await page.goto(`${BASE}/ventas-diseno/home`)
  await page.waitForTimeout(1000)
  const newQuoteBtn = page.locator('main').getByRole('button', { name: /nueva cotizaci[oó]n/i })
  await expect(newQuoteBtn).toBeVisible()
  await expect(newQuoteBtn).toBeEnabled()
})

test('2. Cotizaciones -> Catálogo navega y carga sin error; Nueva cotización sigue viva', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page, 'neil.quiel@atlantic.com.pa')
  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/02-quotes-antes.png', fullPage: true })

  const catalogBtn = page.locator('main').getByRole('button', { name: /^cat[aá]logo$/i })
  await expect(catalogBtn).toBeVisible()
  await expect(catalogBtn).toBeEnabled()
  await catalogBtn.click()
  await page.waitForURL(/\/ventas-diseno\/catalog/, { timeout: 5000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/02-catalog-desde-quotes.png', fullPage: true })
  await expect(page.locator('body')).not.toContainText(/unexpected application error|something went wrong/i)
  expect(errors, `JS errors: ${errors.join(' | ')}`).toHaveLength(0)

  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(1000)
  const newQuoteBtn = page.locator('main').getByRole('button', { name: /nueva cotizaci[oó]n/i })
  await expect(newQuoteBtn).toBeVisible()
  await expect(newQuoteBtn).toBeEnabled()
})

test('3. Reportes -> Catálogo navega y carga sin error; toggle de configuración (si visible) sigue vivo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page, 'neil.quiel@atlantic.com.pa')
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/03-reports-antes.png', fullPage: true })

  const catalogBtn = page.locator('main').getByRole('button', { name: /^cat[aá]logo$/i })
  await expect(catalogBtn).toBeVisible()
  await expect(catalogBtn).toBeEnabled()
  await catalogBtn.click()
  await page.waitForURL(/\/ventas-diseno\/catalog/, { timeout: 5000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/03-catalog-desde-reports.png', fullPage: true })
  await expect(page.locator('body')).not.toContainText(/unexpected application error|something went wrong/i)
  expect(errors, `JS errors: ${errors.join(' | ')}`).toHaveLength(0)

  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(1000)
  const configToggle = page.locator('main').getByRole('button', { name: /configuraci[oó]n/i })
  if (await configToggle.count() > 0) {
    await expect(configToggle.first()).toBeEnabled()
    await configToggle.first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/03-reports-config-toggle.png', fullPage: true })
  } else {
    console.log('[SCRUM-741] Toggle de configuración no visible para neil.quiel (esperado si su rol no tiene ventas_diseno.reports.configure) — no bloquea.')
  }
})

test('4. /ventas-diseno/catalog sigue exigiendo ventas_diseno.read — cuenta sin el permiso no entra', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await page.goto(`${BASE}/ventas-diseno/catalog`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum741/04-catalog-sin-permiso.png', fullPage: true })

  const url = page.url()
  console.log('[SCRUM-741] URL final para carlos (sin ventas_diseno.read):', url)
  // No debe haber quedado renderizada la pantalla de Catálogo real (grid/lista de productos) —
  // esperado: redirect a otra ruta o mensaje de acceso denegado.
  expect(url).not.toMatch(/\/ventas-diseno\/catalog$/)
})
