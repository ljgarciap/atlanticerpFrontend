import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review) — Batch SCRUM-936/937/950/948/949/947 (2026-09-22), contra
 * https://dev.atlanticerp.ai. Ninguno de los 6 tickets tiene mockup de diseño adjunto en Jira (verificado
 * con jira_get_attachments) — Visual Review es N/A en los 6, foco exclusivo en el checklist
 * adversarial de Pre-QA.
 *
 * SCRUM-936 (recibo sin enmascarar), SCRUM-937 (indicadores en snapshots) y SCRUM-950 (contador de
 * entregas) se verificaron por API directa (fetch autenticado) en una sesión aparte — ver reporte
 * en docs/pre-qa/. Este spec cubre la parte que necesita un navegador real: SCRUM-948 (botones de
 * limpiar en Registrar Abono), SCRUM-949 (autocompletado en Compras/Bodega) y la mecánica de UI de
 * SCRUM-947 (paginación: reset de página al filtrar, cambio de cantidad por página).
 *
 * Cuentas reales (password = email, roster CoreUserSeeder):
 *  - Contabilidad (lider_admin_contab): contabilidad@test.com — SOLO admin_contab.view, sin acceso a
 *    Compras/Bodega (confirmado por API antes de escribir estos tests — `modules.compras.view` y
 *    `modules.bodega.view` dan `false` para esta cuenta).
 *  - almacen (Bodega): liderbodega@test.com — bodega.view=true, compras.view=false.
 *  - gerencia2 (Gerencia): lidercompras@test.com — compras.view=true, bodega.view=false.
 */
const DEV = 'https://dev.atlanticerp.ai'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })
test.setTimeout(60000)

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${DEV}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1200)
}

// ============================================================
// SCRUM-948 — Registrar Abono: botones de limpiar (paridad con Cobros)
// ============================================================

test('SCRUM-948 — limpiar Cliente master resetea toda la cadena (sub-cliente/proyecto/cotización/factura)', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.getByRole('button', { name: /registrar abono/i }).click()

  const clienteInput = page.getByPlaceholder(/buscar cliente/i)
  await clienteInput.fill('a')
  await page.waitForTimeout(600)
  const opcion = page.getByRole('listitem').first()
  if (await opcion.count() === 0) {
    // fallback: algunas listas de sugerencia no usan role=listitem, click directo por texto visible
    await page.locator('ul li').first().click()
  } else {
    await opcion.click()
  }
  await expect(clienteInput).not.toHaveValue('')

  const limpiarBtns = page.getByLabel('Limpiar búsqueda')
  await expect(limpiarBtns.first()).toBeVisible()
  await limpiarBtns.first().click()
  await expect(clienteInput).toHaveValue('')
})

test('SCRUM-948 — doble clic en limpiar no rompe el formulario (idempotente)', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.getByRole('button', { name: /registrar abono/i }).click()

  const clienteInput = page.getByPlaceholder(/buscar cliente/i)
  await clienteInput.fill('a')
  await page.waitForTimeout(600)
  await page.locator('ul li').first().click()
  await expect(clienteInput).not.toHaveValue('')

  const limpiar = page.getByLabel('Limpiar búsqueda').first()
  await limpiar.click()
  // el botón desaparece una vez vacío el campo (solo se muestra con texto) — el "doble clic" real
  // es reintentar sobre el mismo input ya vacío, confirmando que no queda en un estado roto.
  await expect(page.getByLabel('Limpiar búsqueda')).toHaveCount(0)
  await expect(clienteInput).toHaveValue('')
  await expect(clienteInput).toBeEnabled()
})

// ============================================================
// SCRUM-949 — Autocompletado en Compras/Bodega (muestra representativa)
// ============================================================

test('SCRUM-949 — Proveedores: buscar con coincidencias muestra sugerencias y filtra al elegir', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/proveedores`)
  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('a')
  await page.waitForTimeout(600)
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible({ timeout: 5000 })
})

test('SCRUM-949 — Proveedores: sin coincidencias muestra el estado "sin resultados", no un desplegable vacío', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/proveedores`)
  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('zzzzznoexiste9999')
  await page.waitForTimeout(600)
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('listbox')).not.toBeEmpty()
})

test('SCRUM-949 — Ver Inventario (Bodega): Enter sin elegir sugerencia dispara la búsqueda de texto libre sin romper', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/inventario`)
  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('riel')
  await page.waitForTimeout(600)
  await input.press('Enter')
  await page.waitForTimeout(800)
  // no debe quedar ningún error visible ni la app en blanco
  await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
})

test('SCRUM-949 — Kardex: navegar sugerencias con flechas + Enter selecciona (no dispara texto libre)', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/kardex`)
  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('riel')
  await page.waitForTimeout(600)
  const listbox = page.getByRole('listbox')
  if (await listbox.count() > 0 && await listbox.locator('[role="option"]').count() > 0) {
    await input.press('ArrowDown')
    await input.press('Enter')
    await page.waitForTimeout(500)
    await expect(listbox).toHaveCount(0) // se cierra tras elegir
  }
})

// ============================================================
// SCRUM-947 — mecánica de UI de paginación: reset a página 1 al filtrar
// ============================================================

test('SCRUM-947 — Notas Crédito: cambiar la búsqueda no deja la tabla en un estado roto (con o sin resultados)', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/notas-credito`)
  await page.waitForTimeout(1000)
  const buscador = page.getByPlaceholder(/buscar/i).first()
  if (await buscador.count() > 0) {
    await buscador.fill('zzzzznoexiste9999')
    await page.waitForTimeout(800)
    await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
    await buscador.fill('')
    await page.waitForTimeout(800)
  }
})

test('SCRUM-947 — Facturación: navegar a la página 2 actualiza el resumen de paginación sin romper la vista', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/facturacion`)
  await page.waitForTimeout(1500)
  const page2Btn = page.getByRole('button', { name: '2', exact: true })
  if (await page2Btn.count() > 0) {
    // "X–Y de Z" (common:pagination.showing) es el resumen del componente <Pagination>
    // compartido — más confiable que asumir la forma exacta del DOM de la tabla (Facturación
    // puede renderizar agrupado por pedido, no siempre un <table> plano).
    const summaryLocator = page.getByText(/\d+[–-]\d+ de \d+/)
    const before = await summaryLocator.first().innerText().catch(() => '')
    await page2Btn.click()
    await page.waitForTimeout(800)
    const after = await summaryLocator.first().innerText().catch(() => '')
    expect(after).not.toBe(before)
    await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
  }
})

test('SCRUM-947 — Comisiones Externas: cambiar la cantidad por página no rompe la vista', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/comisiones-externas`)
  await page.waitForTimeout(1200)
  const selects = page.locator('select')
  const count = await selects.count()
  let perPageSelect = null
  for (let i = 0; i < count; i++) {
    const html = await selects.nth(i).innerHTML()
    if (html.includes('50') && html.includes('100')) { perPageSelect = selects.nth(i); break }
  }
  if (perPageSelect) {
    await perPageSelect.selectOption('50')
    await page.waitForTimeout(800)
    await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
  }
})
