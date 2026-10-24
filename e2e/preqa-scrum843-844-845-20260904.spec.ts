import { test, expect, Page } from '@playwright/test'

// Pre-QA formal — SCRUM-843 (KPI sin decimales en Inventario), SCRUM-844 (fotos/logo/footer del
// PDF de Catálogo) y SCRUM-845 (campos de rotación/proveedor/stock mínimo/bodega en Inventario),
// batch pedido por Luis 2026-09-04 "para el demo". Corrido en LOCAL contra el Vite dev server
// (http://localhost:5173) — el stack local no tiene las 15 referencias reales de SCRUM-845 (esas
// solo existen en dev/test.atlanticerp.ai, verificadas dato-por-dato por consulta directa a cada BD en
// la sesión de implementación), así que se sembraron 4 fixtures propias vía tinker antes de esta
// corrida (referencias PREQA-843-A, PREQA-844-CONFOTO, PREQA-844-SINFOTO, PREQA-845-CAMPOS) —
// no vía este spec.
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:5173'

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('Password123!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

test('SCRUM-843 — Valor total del inventario sin decimales, sobrevive filtro y reload', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(800)

  // Camino feliz: el KPI existe y no tiene decimales.
  const kpiLocator = page.getByText(/^\$[\d,]+$/)
  await expect(kpiLocator.first()).toBeVisible({ timeout: 8000 })
  const kpiTextInitial = await kpiLocator.first().textContent()
  expect(kpiTextInitial).not.toMatch(/\.\d\d$/)

  // Camino de ruptura del propio ticket: "validar que el formato no vuelva a mostrar decimales
  // al actualizar filtros, recargar la página".
  await page.getByPlaceholder(/buscar/i).first().fill('PREQA-843-A')
  await page.waitForTimeout(800)
  const kpiAfterFilter = await page.getByText(/^\$[\d,]+(\.\d\d)?$/).first().textContent()
  expect(kpiAfterFilter).not.toMatch(/\.\d\d$/)

  await page.reload()
  await page.waitForTimeout(800)
  const kpiAfterReload = await page.getByText(/^\$[\d,]+(\.\d\d)?$/).first().textContent()
  expect(kpiAfterReload).not.toMatch(/\.\d\d$/)

  // Regresión: el resto de la fila del producto (precio) SÍ debe seguir mostrando decimales —
  // el ticket pide NO tocar otros campos/KPIs.
  await expect(page.getByText('$10.33')).toBeVisible()
})

test('SCRUM-845 (capa UI) — rotación/proveedor/stock mínimo/bodega se muestran correctamente', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(800)

  await page.getByPlaceholder(/buscar/i).first().fill('PREQA-845-CAMPOS')
  await page.waitForTimeout(800)

  await expect(page.getByText('PREQA-845-CAMPOS')).toBeVisible()
  // Rotación traducida (no el string crudo "alta").
  await expect(page.getByRole('row', { name: /PREQA-845-CAMPOS/ })).toContainText(/Alta/i)
  await expect(page.getByRole('row', { name: /PREQA-845-CAMPOS/ })).toContainText('Zona Libre de Colón')
  await expect(page.getByRole('row', { name: /PREQA-845-CAMPOS/ })).toContainText('18') // reorder_point

  // "1 Bodega" (count singular, i18n) → abre el modal y confirma Bodega Central.
  await page.getByText(/1 Bodega/).click()
  await page.waitForTimeout(400)
  await expect(page.getByText('Bodega Central')).toBeVisible()
})

test('SCRUM-844 — Enviar seleccionados genera un PDF con fotos, logo y sin errores', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/ventas-diseno/catalog`)
  await page.waitForTimeout(800)

  await page.getByPlaceholder(/buscar/i).first().fill('PREQA-844')
  await page.waitForTimeout(800)

  // Selecciona ambos productos (con foto y sin foto) — camino de ruptura: mezclar ambos casos en
  // el mismo documento no debe romper el layout. "Seleccionar todo" dispara un fetch aparte
  // (per_page=all) antes de marcar checked=true, por eso click() + esperar el contador en vez de
  // check() (que exige que el estado cambie de forma síncrona al click).
  await page.locator('label', { hasText: 'Seleccionar todo' }).locator('input[type="checkbox"]').click()
  await expect(page.getByText(/^\d+ seleccionados?$/)).toHaveText('2 seleccionados', { timeout: 8000 })

  const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
  await page.getByText('Enviar seleccionados', { exact: true }).click()
  const download = await downloadPromise

  const path = await download.path()
  expect(path).not.toBeNull()

  const fs = await import('fs')
  const bytes = fs.readFileSync(path as string)
  expect(bytes.length).toBeGreaterThan(1000)

  const asString = bytes.toString('latin1')
  expect(asString.startsWith('%PDF')).toBe(true)
  // Header con logo + foto del producto con photo_url = al menos 2 objetos /Image embebidos
  // (antes de este fix, dompdf nunca cargaba ninguna imagen remota: 0 siempre).
  const imageObjectCount = (asString.match(/\/Subtype\s*\/Image/g) ?? []).length
  expect(imageObjectCount).toBeGreaterThanOrEqual(2)
})
