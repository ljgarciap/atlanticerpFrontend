import { test, expect } from '@playwright/test'

// Pre-QA SCRUM-973 (épica SCRUM-969) — 2026-09-26/27. Verifica que la carga real de Lafayette
// Lighting (25,816 productos, external_source='lafayette_lighting') es visible en
// Bodega > Bodegas > Zona Libre contra dev.atlanticerp.ai (los datos reales solo existen ahí, no en
// local — la fuente externa de Lafayette solo es alcanzable desde los 3 EC2 autorizados).
// Usa URL absoluta a dev.atlanticerp.ai (no baseURL de playwright.config.ts, que apunta a localhost).
//
// Historial (ver docs/pre-qa/lafayette-zona-libre-20260926.md en atlanticerp-backend):
// - Pasada 1 (2026-09-26): CRÍTICO — WarehouseController::show() filtraba quantity>0, 69% del
//   catálogo Lafayette invisible en esta pantalla.
// - Fix ca62647 (2026-09-26/27): agregó Warehouse.mostrar_sin_stock=true para Zona Libre.
// - Pasada 2 / RE-CHECK (2026-09-27): el fix introdujo un CRÍTICO NUEVO — la pantalla completa
//   (no solo la búsqueda) daba HTTP 500 al cargar ~25,822 filas con 3 relaciones eager antes de
//   paginar en PHP (peak ~212.5MB, excedía el memory_limit real de FPM de 128M).
// - Fix 5c3ab15 (2026-09-27): pagina en SQL (COUNT/SUM + paginate()) cuando no hay `search`,
//   sube memory_limit a 256M como red de seguridad para el candidate set de fuzzy search.
// - Pasada 3 / RE-CHECK (2026-09-27): CONFIRMADO OK — carga base 200, categoria/ubicacion/search
//   sin errores, stock=0 localizable. Tests activos (sin fixme).

const DEV_URL = 'https://dev.atlanticerp.ai'

// Los 3 tests pegan contra dev.atlanticerp.ai (no un stack local aislado por worker) con la misma
// cuenta y el mismo warehouse — corridos en paralelo (default de playwright.config.ts) se
// vuelven flaky por contención real del servidor compartido bajo 3 sesiones simultáneas
// (confirmado: aislados 1-by-1 pasan siempre; en paralelo, alguno ocasionalmente excede el
// timeout). Serial evita falsos negativos sin inventar un timeout arbitrariamente alto.
test.describe.configure({ mode: 'serial' })

async function login(page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${DEV_URL}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

// Confirmado corregido por el fix 5c3ab15 (paginación en SQL) — la pantalla carga sin 500 con el
// chip "Todos" por defecto, sin ningún filtro, sobre las ~25,833 filas reales de Zona Libre.
test('SCRUM-973: Bodega Zona Libre carga sin error 500 (regresión de mostrar_sin_stock)', async ({ page }) => {
  await login(page, 'liderbodega@test.com') // Lider Bodega Test, lider_bodega, Nivel 4

  await page.goto(`${DEV_URL}/bodega/bodegas`)
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/\/bodega\/bodegas/)

  const zonaLibreLink = page.getByText('Zona Libre', { exact: false }).first()
  await expect(zonaLibreLink).toBeVisible({ timeout: 10000 })
  await zonaLibreLink.click()
  await page.waitForTimeout(2000)

  await page.screenshot({ path: 'e2e/screenshots/preqa-scrum973-zona-libre-detail.png', fullPage: true })

  // Hoy: pantalla en blanco, sin KPIs, sin filas (HTTP 500 silencioso). Debería mostrar el KPI
  // "TOTAL DE PRODUCTOS" y al menos una fila.
  await expect(page.getByText('TOTAL DE PRODUCTOS')).toBeVisible()
})

// Producto Lafayette CON stock>0 (factory_reference LNP0000013, reference IL-DEC-1034BWH).
test('SCRUM-973: producto Lafayette con stock>0 localizable en Bodega > Bodegas > Zona Libre', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${DEV_URL}/bodega/bodegas`)
  await page.waitForTimeout(1500)
  const zonaLibreLink = page.getByText('Zona Libre', { exact: false }).first()
  await zonaLibreLink.click()
  await page.waitForTimeout(2000)

  const searchInput = page.locator('input[placeholder]').first()
  await searchInput.fill('IL-DEC-1034BWH')
  await searchInput.press('Enter')
  // Búsqueda con texto sigue cargando el candidate set completo en memoria (fuzzy search, no SQL)
  // — medido ~2.7-3.1s por API real tras el fix 5c3ab15, más lento que la carga paginada base.
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'e2e/screenshots/preqa-scrum973-search-instock.png', fullPage: true })
  await expect(page.getByRole('cell', { name: 'LNP0000013' })).toBeVisible({ timeout: 8000 })
})

// Producto Lafayette CON quantity=0 (la mayoría, 17,848/25,816) — el caso original de CRÍTICO 1,
// ahora confirmado localizable vía search (mostrar_sin_stock=true ya no filtra quantity>0).
test('SCRUM-973: producto Lafayette con quantity=0 es localizable en Zona Libre (fix de CRÍTICO 1)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${DEV_URL}/bodega/bodegas`)
  await page.waitForTimeout(1500)
  const zonaLibreLink = page.getByText('Zona Libre', { exact: false }).first()
  await zonaLibreLink.click()
  await page.waitForTimeout(2000)

  const searchInput = page.locator('input[placeholder]').first()
  await searchInput.fill('IL-DEC-1038BW') // reference con quantity=0 confirmado en BD 2026-09-26
  await searchInput.press('Enter')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'e2e/screenshots/preqa-scrum973-search-zerostock.png', fullPage: true })

  // getByText matchea también la sugerencia del autocomplete (<li>), no solo la celda de la
  // tabla — acotar a la celda real (<td>) para no depender de que el dropdown ya se haya cerrado.
  await expect(page.getByRole('cell', { name: 'IL-DEC-1038BW' })).toBeVisible({ timeout: 8000 })
})
