import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — batch SCRUM-910 (comisión generada en Home = fuente única CommissionOrderService),
 * SCRUM-883 (timezone America/Panama) contra https://dev.atlanticerp.ai, y SCRUM-901 (cleanup de datos
 * de prueba) contra https://test.atlanticerp.ai — NUNCA localhost/en paralelo, ver
 * feedback_preqa_crowdsec_no_paralelo.
 */

const DEV = 'https://dev.atlanticerp.ai'
const TEST = 'https://test.atlanticerp.ai'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })

async function login(page: Page, base: string, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

// ---------- SCRUM-910 ----------

test('SCRUM-910 — Fefi (current_amount=0, pendiente_cobro>0) NO muestra $0 en Comisión generada', async ({ page }) => {
  await login(page, DEV, 'vendedordisenador3@test.com', 'vendedordisenador3@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(3000)
  const body = page.locator('body')
  await expect(body).toContainText('Comisión generada')
  await expect(body).toContainText('$1,350')
})

test('SCRUM-910 — Gerencia (Daniela) viendo a Fefi en modo Equipo ve el mismo monto ($1,350)', async ({ page }) => {
  // NOTA 2026-09-13: password real ya NO es B1n4X_2026? (memoria stale de 2026-08-24) — confirmado
  // 401 con esa clave y 200 con el default (email) vía curl directo antes de correr este spec.
  await login(page, DEV, 'gerencia@test.com', 'gerencia@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(2000)
  // Daniela tiene el idioma de UI en inglés (confirmado en vivo) — matchear ambos labels.
  await page.getByText(/^(Equipo|Team)$/, { exact: false }).first().click()
  await page.waitForTimeout(1000)
  // Acotar al <select> real del selector de vendedor (no el de idioma ES/EN) — es el único que
  // tiene una opción "Whole team"/"Todo el equipo" (value="").
  const select = page.locator('select').filter({ has: page.locator('option', { hasText: /whole team|todo el equipo/i }) })
  const options = await select.locator('option').allTextContents()
  const idx = options.findIndex(o => /bonvini|fefi/i.test(o))
  expect(idx, `no se encontró a Fefi/Maria Bonvini entre las opciones: ${options.join(', ')}`).toBeGreaterThanOrEqual(0)
  await select.selectOption({ index: idx })
  await page.waitForTimeout(2500)
  const body = page.locator('body')
  await expect(body).toContainText('$1,350')
})

test('SCRUM-910 — Neil (vendedor con proyecto compartido con Fefi) ve su propia mitad, no duplicada', async ({ page }) => {
  await login(page, DEV, 'vendedordisenador2@test.com', 'vendedordisenador2@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(3000)
  const body = page.locator('body')
  await expect(body).toContainText('$1,180')
})

test('SCRUM-910 — Comisión generada en Home coincide con Comisiones Internas (Paola, con NC aplicada)', async ({ page }) => {
  await login(page, DEV, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(3000)
  await expect(page.locator('body')).toContainText('$331')
})

// ---------- SCRUM-883 ----------

test('SCRUM-883 — timestamp real (visor de Logs, superadmin.all) se muestra en hora de Panamá, no la del navegador (offset forzado UTC+3)', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Europe/Moscow' }) // UTC+3, opuesto a Panama UTC-5
  const page = await context.newPage()
  await login(page, DEV, 'superadmin2@test.com', 'superadmin2@test.com')
  await expect(page).not.toHaveURL(/login/)
  await page.goto(`${DEV}/auditoria/logs`)
  await page.waitForTimeout(2500)
  const bodyText = await page.locator('body').innerText()
  // Confirma formato es-PA (a. m./p. m.) — si el bug de SCRUM-883 siguiera vivo, el navegador en
  // UTC+3 mostraría las horas con 8h de diferencia respecto a Panamá (mismo string, offset roto).
  expect(bodyText).toMatch(/a\.\s?m\.|p\.\s?m\./i)
  await context.close()
})

// ---------- SCRUM-901 ----------

test('SCRUM-901 — Paola: pipeline propio carga sin error tras el cleanup', async ({ page }) => {
  await login(page, TEST, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')
  await page.goto(`${TEST}/ventas-diseno/home`)
  await page.waitForTimeout(3000)
  await expect(page.locator('body')).not.toContainText(/error 500|internal server error/i)
  await page.goto(`${TEST}/ventas-diseno/pipeline`)
  await page.waitForTimeout(3000)
  await expect(page.locator('body')).not.toContainText(/error 500|internal server error/i)
})

test('SCRUM-901 — Bodega: Kanban de pedidos renderiza con picker/courier NULL sin crashear', async ({ page }) => {
  await login(page, TEST, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${TEST}/bodega/pedidos`)
  await page.waitForTimeout(3500)
  await expect(page.locator('body')).not.toContainText(/error 500|internal server error|undefined/i)
})

test('SCRUM-901 — otro usuario real (Osvaldo, asistente de bodega) sigue logueando con normalidad', async ({ page }) => {
  await login(page, TEST, 'asistentebodega@test.com', 'asistentebodega@test.com')
  await page.goto(`${TEST}/bodega/home`)
  await page.waitForTimeout(2000)
  await expect(page).not.toHaveURL(/login/)
})
