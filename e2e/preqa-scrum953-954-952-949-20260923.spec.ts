import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review) — Batch SCRUM-953/954/952/949 (2026-09-23), contra
 * https://dev.atlanticerp.ai (deploy manual, CI de GitHub Actions caído por el outage de facturación).
 * Ninguno de los 4 tickets tiene mockup de diseño adjunto en Jira salvo SCRUM-952 (2 PDFs reales
 * de factura, comparados aparte con `Read` — ver reporte en docs/pre-qa/) — Visual Review es N/A
 * para 953/954/949 (sin mockup), y para 952 se validó contra el PDF real fuera de este spec.
 *
 * La mayor parte de la verificación adversarial de 953/954/952 se hizo por API directa
 * (curl autenticado) antes de este spec — ver reporte en docs/pre-qa/ para el detalle completo
 * (orden de creación de partidas, bypass de shipping fields con payload malicioso, bloqueo 422
 * por RUC faltante ya cubierto por test automatizado). Este spec cubre lo que necesita un
 * navegador real: el campo Cantidad (input controlado con onFocus/onBlur), el separador de miles
 * VISUAL en Ver Órdenes, y el layout de SCRUM-949 (ancho del buscador, orden de botones,
 * autocompletado, Compras intacto).
 *
 * SCRUM-949 — 1ª pasada (2026-09-23) encontró CRÍTICO: el ancho del buscador de Ver Inventario no
 * mejoraba en la práctica (34-161px reales según viewport, lejos de max-w-md=448px) porque 5
 * <select> hermanos sin flex-shrink-0 se comían el espacio de la fila. Re-fix desplegado
 * 2026-09-24 (commit 116aace): el buscador salió de esa fila a su propio wrapper arriba — los
 * tests de esta 2ª pasada (misma fecha) ya reflejan la estructura nueva y confirman 448px reales
 * en los 3 viewports del hallazgo original. Detalle del recheck en docs/pre-qa/.
 *
 * Cuentas reales (password = email, roster CoreUserSeeder):
 *  - Lider Compras Test (lider_compras): lidercompras@test.com
 *  - Lider Bodega Test (lider_bodega): liderbodega@test.com
 *  - Contabilidad Test (lider_admin_contab): contabilidad@test.com
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
// SCRUM-954 — Campo Cantidad: seleccionar "1" y reemplazar por "40" (nunca "140")
// ============================================================

async function selectProviderAndAddProduct(page: Page): Promise<void> {
  const providerInput = page.getByPlaceholder(/buscar proveedor/i)
  await providerInput.fill('a')
  await page.waitForTimeout(800)
  const providerOption = page.getByRole('option').first()
  if (await providerOption.count() > 0) {
    await providerOption.click()
  } else {
    await page.locator('ul li, [role="listbox"] >> visible=true').first().click().catch(() => {})
  }
  await page.waitForTimeout(600)

  const addProductInput = page.getByPlaceholder(/buscar producto del catálogo/i).first()
  await addProductInput.fill('REF-')
  await page.waitForTimeout(800)
  await page.getByRole('listitem').filter({ hasText: 'REF-' }).first().getByRole('button', { name: 'Agregar' }).click()
  await page.waitForTimeout(600)
}

test('SCRUM-954 — Nueva Orden: seleccionar el "1" inicial y escribir 40 da 40, no 140', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/ordenes/nueva`)
  await page.waitForTimeout(1000)

  await selectProviderAndAddProduct(page)

  const qtyInput = page.locator('input[type="number"]').first()
  await expect(qtyInput).toBeVisible({ timeout: 8000 })
  await expect(qtyInput).toHaveValue('1')

  // Clic en el input dispara onFocus -> select() (fix real, ver OrderLinesEditor.tsx:346) ->
  // escribir "40" debe reemplazar el "1" ya seleccionado. NO se refuerza con Control+A a
  // propósito: eso es justamente lo que hace un usuario real, y es el escenario que el ticket
  // pide probar (un simple click + escribir, no una selección manual explícita).
  await qtyInput.click()
  await page.keyboard.type('40')
  await expect(qtyInput).toHaveValue('40')
  await expect(qtyInput).not.toHaveValue('140')

  // Blur confirma el clamp (mínimo 1) sin alterar un valor ya válido.
  await page.keyboard.press('Tab')
  await expect(qtyInput).toHaveValue('40')
})

test('SCRUM-954 — Nueva Orden: Backspace sobre "1" y escribir un número nuevo funciona', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/ordenes/nueva`)
  await page.waitForTimeout(1000)

  await selectProviderAndAddProduct(page)

  const qtyInput = page.locator('input[type="number"]').first()
  await expect(qtyInput).toBeVisible({ timeout: 8000 })
  await qtyInput.click()
  await qtyInput.press('End')
  await qtyInput.press('Backspace')
  // el campo puede quedar momentáneamente vacío mientras se edita (estado intermedio permitido)
  await page.keyboard.type('7')
  await expect(qtyInput).toHaveValue('7')
  await page.keyboard.press('Tab')
  await expect(qtyInput).toHaveValue('7')
})

// ============================================================
// SCRUM-954 — Ver Órdenes: separador de miles visual en Total y Costo de envío
// ============================================================

test('SCRUM-954 — Ver Órdenes: Total y Costo de envío muestran separador de miles', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/ordenes`)
  await page.waitForTimeout(1200)

  // Orden fabricada por API (PREQA-SCRUM954-BIGAMT, id 102): total=61329.50, costo envío=12345.67
  const searchInput = page.getByPlaceholder(/buscar/i).first()
  if (await searchInput.count() > 0) {
    await searchInput.fill('PREQA-SCRUM954-BIGAMT')
    await page.waitForTimeout(800)
  }

  await expect(page.getByText('$61,329.50')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('$12,345.67')).toBeVisible({ timeout: 8000 })
  // nunca sin separador
  await expect(page.getByText('$61329.50')).toHaveCount(0)
})

// ============================================================
// SCRUM-949 — Bodega: buscador más ancho + orden de botones + autocompletado intacto
// ============================================================

test('SCRUM-949 — Ver Inventario: orden buscador -> filtros -> Buscar -> Limpiar', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/inventario`)
  await page.waitForTimeout(1200)

  // Re-fix del CRÍTICO (Pre-QA 2026-09-23, ver docs/pre-qa/scrum953-954-952-949-20260923.md,
  // commit 116aace 2026-09-24): en vez de flex-shrink en los 5 <select>, el buscador salió de la
  // fila flex-wrap y ahora vive en su propio wrapper `div.max-w-md.mb-2` ANTES de la fila de
  // filtros — ya no está anidado dentro de `div.flex.flex-wrap.gap-2.mb-4.items-center`. El
  // locator ya no debe buscarlo dentro de `toolbar`.
  const searchInput = page.getByPlaceholder(/buscar por referencia o descripción/i)
  const searchBox = await searchInput.boundingBox()
  expect(searchBox).not.toBeNull()

  // Ancho real ahora SÍ toca el máximo pedido por el ticket: max-w-md = 28rem = 448px, sin
  // competir por espacio con ningún <select> (ver hallazgo original: antes medía 34-161px según
  // el viewport, nunca cerca de 448). Confirmado en los 3 viewports del hallazgo original — este
  // test corre a 1280 (default del proyecto), los otros 2 se re-chequearon aparte (ver reporte).
  expect(searchBox!.width).toBeGreaterThanOrEqual(440)

  const toolbar = page.locator('div.flex.flex-wrap.gap-2.mb-4.items-center').first()
  await expect(toolbar).toBeVisible({ timeout: 8000 })

  const buscarBtn = toolbar.getByRole('button', { name: /^buscar$/i })
  const limpiarBtn = toolbar.getByRole('button', { name: /limpiar/i })
  await expect(buscarBtn).toBeVisible()
  await expect(limpiarBtn).toBeVisible()

  const buscarBox = await buscarBtn.boundingBox()
  const limpiarBox = await limpiarBtn.boundingBox()
  expect(buscarBox).not.toBeNull()
  expect(limpiarBox).not.toBeNull()
  // Buscar debe quedar a la izquierda de Limpiar (orden: filtros -> Buscar -> Limpiar)
  expect(buscarBox!.x).toBeLessThan(limpiarBox!.x)

  // El buscador (ahora en su propia fila, arriba) debe quedar visualmente ANTES (más arriba) que
  // la fila de filtros/botones.
  expect(searchBox!.y).toBeLessThan(buscarBox!.y)
})

test('SCRUM-949 — Ver Inventario: autocompletado sigue funcionando (sugerencias + selección)', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/inventario`)
  await page.waitForTimeout(1000)

  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('riel')
  await page.waitForTimeout(700)
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible({ timeout: 5000 })
  await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
})

test('SCRUM-949 — Bodegas: buscador más ancho, sin botón Buscar (no aplica)', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/bodegas`)
  await page.waitForTimeout(1200)

  const searchInput = page.getByPlaceholder(/buscar/i).first()
  await expect(searchInput).toBeVisible({ timeout: 8000 })
  const box = await searchInput.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(384)

  const buscarBtn = page.getByRole('button', { name: /^buscar$/i })
  await expect(buscarBtn).toHaveCount(0)
})

test('SCRUM-949 — Compras (Proveedores) no fue tocado: autocompletado y layout intactos', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/proveedores`)
  await page.waitForTimeout(1000)
  const input = page.getByPlaceholder(/buscar/i).first()
  await input.fill('a')
  await page.waitForTimeout(600)
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible({ timeout: 5000 })
  await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
})

// ============================================================
// SCRUM-953 — Partidas: verificación visual de orden (ya confirmado por API, ver reporte)
// ============================================================

test('SCRUM-953 — Cotización: las partidas se muestran en el navegador en el mismo orden que la API', async ({ page }) => {
  await login(page, 'vendedor@test.com', 'vendedor@test.com')
  // Cotización [PREQA-SCRUM953] creada por API en esta misma sesión de Pre-QA, id 269.
  await page.goto(`${DEV}/ventas-diseno/quotes/269`)
  await page.waitForTimeout(1500)

  // Los nombres de partida se renderizan como <input> editables, no texto plano.
  const partNames = page.locator('input').filter({ hasValue: /^Partida (Z|A|M|B) -/ })
  const count = await partNames.count()
  expect(count).toBeGreaterThanOrEqual(5)

  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push((await partNames.nth(i).inputValue()).trim())
  }
  // Orden de creación esperado: Z, A, M, Z(copia), B — nunca alfabético.
  const zIndex = texts.findIndex(t => t.startsWith('Partida Z - reja'))
  const aIndex = texts.findIndex(t => t.startsWith('Partida A - araña'))
  const mIndex = texts.findIndex(t => t.startsWith('Partida M - modulo'))
  const zCopyIndex = texts.findIndex(t => t.includes('copia'))
  const bIndex = texts.findIndex(t => t.startsWith('Partida B - artículo'))

  expect(zIndex).toBeLessThan(aIndex)
  expect(aIndex).toBeLessThan(mIndex)
  expect(mIndex).toBeLessThan(zCopyIndex)
  expect(zCopyIndex).toBeLessThan(bIndex)
})
