import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-908 (Aprobaciones Pendientes) + SCRUM-938 (ClientPicker race condition),
 * 2026-09-21, contra stack local (Docker + Vite dev server, NUNCA dev.atlanticerp.ai en este batch).
 * Fixtures reales sembrados vía tinker en la sesión (ver docs/pre-qa/scrum908-938-20260921.md).
 */

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 20000, navigationTimeout: 30000 })

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(800)
}

// ============================================================
// SCRUM-908 — fix del CRÍTICO: RequirePermission de /compras/inicio ampliado (re-check 2026-09-21)
// ============================================================
test('FIX VERIFICADO — designer (ventas_diseno.edit) ahora llega a /compras/inicio y ve su aprobación real', async ({ page }) => {
  await login(page, 'vendedor@atlantic.test', 'Password123!')
  await page.goto('/compras/inicio')
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(/\/compras\/inicio/)
  const card = page.locator('text=Aprobaciones Pendientes').first().locator('xpath=ancestor::*[contains(@class,"p-4")]').last()
  const text = await card.textContent() ?? ''
  expect(text).toContain('sustitución')
})

test('regresión — un usuario SIN ningún permiso relevante de Compras sigue bloqueado de /compras/inicio', async ({ page }) => {
  // almacen (lider_bodega): bodega.* únicamente, nada de compras/ventas_diseno — no debería colarse
  // por la ampliación del permiso de ruta.
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto('/compras/inicio')
  await page.waitForTimeout(1000)
  await expect(page).not.toHaveURL(/\/compras\/inicio/)
})

// ============================================================
// SCRUM-908 — Compras (Gerencia): purchase_order respeta requires_primary_approval
// ============================================================
test('Gerencia ve la OC que requiere su aprobación, no la que no la requiere', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto('/compras/inicio')
  const card = page.locator('text=Aprobaciones Pendientes').first().locator('xpath=ancestor::*[contains(@class,"p-4")]').last()
  await expect(page.getByText('Aprobaciones Pendientes')).toBeVisible()
  const cardText = await card.textContent().catch(() => '') ?? ''
  expect(cardText).toContain('900')
  expect(cardText).not.toContain('80.00')
})

// ============================================================
// SCRUM-908 — Bodega: negativo (no-Mark no ve relocation) y positivo (Gerencia ve + max5 + Ver más)
// ============================================================
test('almacen (lider_bodega, no es Gerencia) NO ve las reubicaciones pendientes', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto('/bodega/home')
  await page.waitForTimeout(1000)
  await expect(page.getByText('Aprobaciones Pendientes')).toHaveCount(0)
})

test('FIX VERIFICADO — Bodega Home de Gerencia aterriza directo en "Inicio" (no "Equipo") porque tiene aprobaciones reales pendientes', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto('/bodega/home')
  await page.waitForTimeout(1200)
  // Sin tocar nada: la card ya está visible (el toggle switcheó solo a 'own').
  await expect(page.getByText(/Aprobaciones Pendientes/)).toBeVisible()
  const inicioBtn = page.locator('main').getByRole('button', { name: 'Inicio' })
  await expect(inicioBtn).toHaveClass(/primary|active/)
})

test('Gerencia ve las 6 reubicaciones: máx 5 + "Ver más" + modal con las 6', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto('/bodega/home')
  await page.waitForTimeout(1200)
  const card = page.locator('text=Aprobaciones Pendientes').first().locator('xpath=ancestor::*[contains(@class,"p-4")]').last()
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Ver', exact: true })).toHaveCount(5)
  const verMas = card.getByRole('button', { name: /ver más/i })
  await expect(verMas).toBeVisible()
  await verMas.click()
  const modal = page.locator('.fixed.inset-0').last()
  await expect(modal.getByRole('button', { name: 'Ver', exact: true })).toHaveCount(6)
})

// ============================================================
// SCRUM-908 — Gerencia: panel existente + card cross-módulo nueva, ambos visibles y distintos
// ============================================================
test('Gerencia muestra el panel existente Y la card cross-módulo nueva, sin fusionarse', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto('/gerencia')
  await expect(page.getByText('Aprobaciones por validar')).toBeVisible()
  await expect(page.getByText('Aprobaciones Pendientes — Todos los módulos')).toBeVisible()
})

// ============================================================
// SCRUM-908 — sin iconografía de emoji en la card (regla dura de cliente, SCRUM-56)
// ============================================================
test('la card de Aprobaciones Pendientes no usa emoji', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto('/bodega/home')
  await page.waitForTimeout(1000)
  await page.locator('main').getByRole('button', { name: 'Inicio' }).click()
  const card = page.locator('text=Aprobaciones Pendientes').first().locator('xpath=ancestor::*[contains(@class,"p-4")]').last()
  const text = await card.textContent() ?? ''
  // eslint-disable-next-line no-control-regex
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(text)).toBe(false)
})

// ============================================================
// SCRUM-938 — ClientPicker en el navegador real: DV field + búsqueda no se cae con tipeo rápido
// ============================================================
test('DV field (Subcliente, modal Nuevo Proyecto): solo dígitos, trunca a 2, sin maxlength', async ({ page }) => {
  await login(page, 'vendedor@atlantic.test', 'Password123!')
  await page.goto('/ventas-diseno/pipeline')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /nuevo proyecto/i }).first().click()
  await page.getByRole('button', { name: 'Diseño', exact: true }).click()

  const masterInput = page.getByLabel('Cliente Master').or(page.locator('label:has-text("Cliente Master") + input'))
  await masterInput.fill('PreQA Master ' + Date.now())
  await page.waitForTimeout(600)
  // Cliente Master no pasa extraFieldLabel a ClientPicker — "+ Crear" crea directo, sin mini-form.
  await page.getByText(/\+ crear/i).first().click()
  await page.waitForTimeout(800)

  const subInput = page.locator('label:has-text("Subcliente") + input')
  await subInput.fill('PreQA Sub ' + Date.now())
  await page.waitForTimeout(600)
  await page.getByText(/\+ crear/i).first().click()

  const dvInput = page.getByPlaceholder('DV')
  await expect(dvInput).toBeVisible()
  await expect(dvInput).not.toHaveAttribute('maxlength', /.+/)

  await dvInput.fill('9a8b7')
  await expect(dvInput).toHaveValue('98')
})
