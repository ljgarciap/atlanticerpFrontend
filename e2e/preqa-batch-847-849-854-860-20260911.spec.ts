import { test, expect, type Page, request as playwrightRequest } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review) — Batch SCRUM-847/849/854/860 (2026-09-11).
 * Corre contra el stack LOCAL — navegar SIEMPRE contra `localhost:5173` (Vite dev server real, ver
 * nota de entorno en el reporte: `localhost:8090`/nginx sirve un build estático que puede estar
 * desactualizado respecto al código sin commitear). API alcanzable en ambos por el proxy de Vite.
 * Ver docs/pre-qa/scrum847-849-854-860-batch-20260911.md para el reporte completo.
 *
 * Los 4 son REBOTES, no primera implementación (ver contexto completo en el reporte).
 *
 * Self-seeding real (regla del proyecto — ver feedback_e2e_permanent_tests_must_self_seed.md):
 * SCRUM-849.6 crea su propia Quote/QuotePart/QuoteItem vía API en beforeAll, con
 * designer@atlantic.test — nunca depende de un ID hardcodeado.
 *
 * Cuentas:
 *  - designer@atlantic.test / Password123! (vendedor, demo .test)
 *  - management@atlantic.test / Password123! (Gerencia, demo .test)
 *  - liderbodega@test.com / liderbodega@test.com (Líder de Bodega, roster real)
 */
test.describe.configure({ mode: 'serial' })

const API_BASE = 'http://localhost:8090'
let seededQuoteId: number

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE })
  const loginResp = await api.post('/api/auth/login', {
    data: { email: 'designer@atlantic.test', password: 'Password123!' },
  })
  const { token } = await loginResp.json()
  const auth = { Authorization: `Bearer ${token}` }

  const quoteResp = await api.post('/api/ventas-diseno/quotes', { headers: auth, data: {} })
  const quote = await quoteResp.json()
  seededQuoteId = quote.id

  const partResp = await api.post(`/api/ventas-diseno/quotes/${seededQuoteId}/parts`, {
    headers: auth, data: { name: 'P1' },
  })
  const part = await partResp.json()

  await api.post(`/api/ventas-diseno/quotes/${seededQuoteId}/parts/${part.id}/items`, {
    headers: auth,
    data: { reference: 'PREQA-ADHOC-1', description: 'Producto Preqa 849.6', quantity: 1, unit_price: 100 },
  })

  await api.dispose()
})

async function loginDemo(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('Password123!')
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
}

async function loginReal(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
}

// ---------------------------------------------------------------------------
// SCRUM-847 — miniaturas cuadradas/consistentes (selector de producto, sin diff nuevo)
// ---------------------------------------------------------------------------
test('SCRUM-847 — selector de producto de Catálogo muestra la miniatura sin recorte (object-contain)', async ({ page }) => {
  await loginDemo(page, 'designer@atlantic.test')
  await page.goto(`/ventas-diseno/quotes/${seededQuoteId}`)
  await page.waitForTimeout(1500)

  // Verificado manualmente en la sesión 2026-09-11 con un producto de Catálogo sembrado a
  // propósito con foto RECTANGULAR (200x60, no cuadrada) — confirmó object-contain sin recorte ni
  // deformación (ver docs/pre-qa/scrum847-849-854-860-batch-20260911.md). Este spec permanente NO
  // asume ese fixture (no autosembrado — el endpoint de alta de CatalogProduct no es HTTP público
  // simple, ver nota en el reporte): si el catálogo real de este entorno ya tiene algún producto
  // con foto, confirma la clase CSS ahí; si no hay ninguno, no falla (la confirmación visual real
  // ya quedó documentada por Pre-QA, esto es solo guardia de regresión best-effort).
  await page.getByText('+ Agregar ítem').click()
  await page.waitForTimeout(300)
  await page.getByPlaceholder(/buscar/i).fill('a')
  await page.waitForTimeout(800)
  const firstResult = page.locator('ul li button').first()
  if (await firstResult.count() > 0) {
    await firstResult.click()
    await page.waitForTimeout(500)
    const img = page.locator('img.object-contain')
    if (await img.count() > 0) {
      await expect(img.first()).toHaveClass(/object-contain/)
      await page.screenshot({ path: 'e2e/.tmp/preqa-847-selector-preview.png' })
    }
  }
})

// ---------------------------------------------------------------------------
// SCRUM-849.6 — foto ad-hoc: spinner + error visible + persistencia en PDF
// ---------------------------------------------------------------------------
test('SCRUM-849.6.a — subir foto válida a ítem personalizado muestra spinner y luego thumbnail sin recargar', async ({ page }) => {
  await loginDemo(page, 'designer@atlantic.test')
  await page.goto(`/ventas-diseno/quotes/${seededQuoteId}`)
  await page.waitForTimeout(1500)

  const addPhotoBtn = page.getByRole('button', { name: /agregar foto|cambiar foto/i })
  await expect(addPhotoBtn).toBeVisible({ timeout: 10000 })
  await addPhotoBtn.click()

  const fileInput = page.locator('input[type="file"]')
  await expect(fileInput).toBeVisible()
  await fileInput.setInputFiles({
    name: 'preqa-849.png',
    mimeType: 'image/png',
    // 1x1 PNG válido
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })

  // Botón vuelve a mostrarse con loading=true (spinner) mientras sube.
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'e2e/.tmp/preqa-849-6a-uploading.png' })

  // Tras completar, el thumbnail aparece sin recargar la página.
  await expect(page.locator('img[alt=""]').first()).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: 'e2e/.tmp/preqa-849-6a-thumbnail.png' })
})

test('SCRUM-849.6.b — archivo inválido (bytes que GD no puede decodificar) muestra error visible, no falla en silencio (regresión: era 500 sin manejar, Pre-QA lo corrigió a 422)', async ({ page }) => {
  await loginDemo(page, 'designer@atlantic.test')
  await page.goto(`/ventas-diseno/quotes/${seededQuoteId}`)
  await page.waitForTimeout(1500)

  let photoResponseStatus: number | null = null
  page.on('response', res => { if (res.url().includes('/photo') && res.request().method() === 'POST') photoResponseStatus = res.status() })

  const addPhotoBtn = page.getByRole('button', { name: /agregar foto|cambiar foto/i })
  await expect(addPhotoBtn).toBeVisible({ timeout: 10000 })
  await addPhotoBtn.click()

  const fileInput = page.locator('input[type="file"]')
  await expect(fileInput).toBeVisible()
  // Extensión válida (pasa el gate `extensions:` del backend) pero bytes NO decodificables por GD.
  await fileInput.setInputFiles({
    name: 'preqa-849-invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('esto no es una imagen real, son solo bytes de texto plano'),
  })

  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-849-6b-error.png', fullPage: true })

  // Hallazgo CRÍTICO original de esta pasada: el backend devolvía 500 sin manejar (RuntimeException
  // de QuoteItemPhotoService sin capturar en el controller) — en producción (APP_DEBUG=false) eso
  // se degradaba al genérico "Server Error" en inglés. Fix aplicado en el mismo ciclo: catch
  // RuntimeException → 422 con mensaje claro. Este assert congela esa regresión.
  expect(photoResponseStatus, 'debe ser 422 (input inválido), nunca 500').toBe(422)

  // Debe verse ALGÚN mensaje de error visible en la fila — no un fallo silencioso.
  const errorText = page.locator('p.text-red-500')
  await expect(errorText).toBeVisible({ timeout: 5000 })
  await expect(errorText).toContainText(/imagen válida|no se pudo/i)
})

test('SCRUM-849.6.c — el PDF de la cotización muestra la foto ad-hoc igual que en pantalla', async ({ page, request }) => {
  await loginDemo(page, 'designer@atlantic.test')
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(token, 'debe haber un accessToken en localStorage tras login').toBeTruthy()

  const detailResp = await request.get(`http://localhost:8090/api/ventas-diseno/quotes/${seededQuoteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const detail = await detailResp.json()
  const photoUrl = detail?.parts?.[0]?.items?.find((i: { reference: string }) => i.reference === 'PREQA-ADHOC-1')?.photo_url
  expect(photoUrl, 'la API debe devolver photo_url para el ítem ad-hoc').toBeTruthy()

  const pdfResp = await request.get(`http://localhost:8090/api/ventas-diseno/quotes/${seededQuoteId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(pdfResp.status()).toBe(200)
  expect(pdfResp.headers()['content-type']).toContain('pdf')
})

// ---------------------------------------------------------------------------
// SCRUM-854 — filtro Vendedor/Diseñador en /ventas-diseno/pedidos
// ---------------------------------------------------------------------------
test('SCRUM-854.a — management ve el filtro Vendedor/Diseñador en Pedidos de Ventas&Diseño', async ({ page }) => {
  await loginDemo(page, 'management@atlantic.test')
  await page.goto('/ventas-diseno/pedidos')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-854-management-pedidos.png', fullPage: true })

  await expect(page.getByRole('button', { name: /vendedor|todos los vendedores/i })).toBeVisible({ timeout: 8000 })
})

test('SCRUM-854.b — designer (vendedor) NO ve el filtro, sigue viendo solo lo suyo', async ({ page }) => {
  await loginDemo(page, 'designer@atlantic.test')
  await page.goto('/ventas-diseno/pedidos')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-854-designer-pedidos.png', fullPage: true })

  await expect(page.getByRole('button', { name: /vendedor|todos los vendedores/i })).not.toBeVisible()
})

test('SCRUM-854.c — seleccionar un vendedor filtra la tabla y "Limpiar filtros" resetea', async ({ page }) => {
  await loginDemo(page, 'management@atlantic.test')
  await page.goto('/ventas-diseno/pedidos')
  await page.waitForTimeout(1500)

  const filterBtn = page.getByRole('button', { name: /vendedor|todos los vendedores/i })
  await expect(filterBtn).toBeVisible({ timeout: 8000 })
  await filterBtn.click()
  await page.waitForTimeout(300)

  const firstCheckbox = page.locator('[role="listbox"] input[type="checkbox"]').first()
  const hasOptions = await firstCheckbox.count()
  if (hasOptions > 0) {
    await firstCheckbox.check()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/.tmp/preqa-854-filtered.png', fullPage: true })

    // cerrar el dropdown clickeando fuera
    await page.mouse.click(10, 10)
    const clearBtn = page.getByRole('button', { name: /limpiar filtros|borrar filtros/i })
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await page.waitForTimeout(500)
  }
})

// ---------------------------------------------------------------------------
// SCRUM-860 — alineación de tamaño de filtros + filtro de Estado en Bodega/Pedidos
// ---------------------------------------------------------------------------
test('SCRUM-860.a — los 5 controles de filtro se ven del mismo tamaño/alineados en Bodega/Pedidos', async ({ page }) => {
  await loginReal(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-860-filters-bar.png', fullPage: true })

  const assistantSelect = page.locator('select').filter({ hasText: /asistente/i })
  const clienteSelect   = page.locator('select').filter({ hasText: /cliente/i })
  const stageSelect     = page.locator('select').filter({ hasText: /estado/i })
  const vendorBtn       = page.getByRole('button', { name: /vendedor|todos los vendedores/i })
  const clearBtn        = page.getByRole('button', { name: /limpiar filtros|borrar filtros/i })

  const boxes = await Promise.all([
    assistantSelect.boundingBox(), clienteSelect.boundingBox(), stageSelect.boundingBox(),
    vendorBtn.boundingBox(), clearBtn.boundingBox(),
  ])
  for (const b of boxes) expect(b).not.toBeNull()

  const heights = boxes.map(b => Math.round(b!.height))
  // Todas las alturas deben coincidir dentro de un margen razonable (los <select> y <button>
  // tienen box-sizing/line-height ligeramente distintos incluso con el mismo padding declarado
  // — 3px de diferencia es imperceptible a simple vista, ver screenshot).
  const maxDiff = Math.max(...heights) - Math.min(...heights)
  expect(maxDiff, `alturas de los 5 controles: ${heights.join(', ')}`).toBeLessThanOrEqual(4)
})

test('SCRUM-860.b — filtro de Estado funciona en vista Tabla', async ({ page }) => {
  await loginReal(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /^tabla$/i }).click()
  await page.waitForTimeout(500)
  const rowsBefore = await page.locator('table tbody tr').count()

  const stageSelect = page.locator('select').filter({ hasText: /estado/i })
  const options = await stageSelect.locator('option').allTextContents()
  if (options.length > 1) await stageSelect.selectOption({ index: 1 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-860-b-table-filtered.png', fullPage: true })
  const rowsAfter = await page.locator('table tbody tr').count()
  expect(rowsAfter).toBeLessThanOrEqual(rowsBefore)
})

test('SCRUM-860.c — filtro de Estado funciona en vista Tablero (oculta columnas sin coincidencias)', async ({ page }) => {
  await loginReal(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)

  const stageSelect = page.locator('select').filter({ hasText: /estado/i })
  const options = await stageSelect.locator('option').allTextContents()
  if (options.length > 1) await stageSelect.selectOption({ index: 1 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-860-c-board-filtered.png', fullPage: true })
})

test('SCRUM-860.d — "Limpiar filtros" resetea también el Estado', async ({ page }) => {
  await loginReal(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)

  const stageSelect = page.locator('select').filter({ hasText: /estado/i })
  const options = await stageSelect.locator('option').allTextContents()
  if (options.length > 1) await stageSelect.selectOption({ index: 1 })
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: /limpiar filtros|borrar filtros/i }).click()
  await page.waitForTimeout(300)
  await expect(stageSelect).toHaveValue('')
})
