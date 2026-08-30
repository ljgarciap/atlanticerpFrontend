import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-695→701 (REQ-615→621, Batch E del Epic CRM SCRUM-332) — pantalla "Catálogo".
 * Corre contra el stack local (Docker + Vite dev server). Serial a propósito, mismo patrón que
 * el resto de la suite Pre-QA (evita interferencia de estado compartido entre tests).
 */
test.describe.configure({ mode: 'serial' })

const SELLER_EMAIL = 'neil.quiel@illuminations.com.pa'

async function login(page: Page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function gotoCatalog(page: Page) {
  await page.goto('/ventas-diseno/catalog')
  await page.waitForTimeout(1200)
}

test('REQ-615 — vista comercial sin costos, en la UI (network + DOM)', async ({ page }) => {
  const leaked: string[] = []
  page.on('response', async (res) => {
    if (res.url().includes('/api/ventas-diseno/catalog') && res.request().method() === 'GET') {
      try {
        const body = await res.text()
        for (const forbidden of ['"cost"', '"import_cost"', '"freight_cost"', '"handling_cost',
          '"other_cost"', '"cost_total"', '"margin_percent"', '"por_servir"', '"por_ingresar"',
          '"estado"', '"rotation"', '"provider_id"', '"provider_name"', '"reorder_point"']) {
          if (body.includes(forbidden)) leaked.push(`${forbidden} in ${res.url()}`)
        }
      } catch { /* ignore non-text responses */ }
    }
  })

  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)
  await page.waitForTimeout(1000)

  expect(leaked, `Fuga de datos financieros/internos detectada: ${leaked.join(', ')}`).toEqual([])

  // Nota: no se agrega un chequeo de texto libre tipo /margen|costo total/i sobre el body —
  // primer intento de esta suite lo tuvo y dio falso positivo con fixtures demo reales
  // (`VentasDisenoDemoSeeder`, ids 95/96: "Bombillo LED... (demo sustitutos — margen alto)"),
  // texto de MARKETING del producto, no el campo financiero interno. El check de JSON de arriba
  // (claves exactas cost/margin_percent/etc.) es la fuente de verdad real de RN1/RN2.

  await page.screenshot({ path: 'e2e/.tmp/scrum695-vista-comercial.png', fullPage: true })
})

test('REQ-616 — toggle Cuadrícula/Lista no resetea filtros', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('Riel')
  await page.waitForTimeout(700)
  const countBefore = await page.getByText(/producto(s)?$/).first().innerText()

  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.waitForTimeout(500)
  expect(await page.locator('input[placeholder*="Buscar por referencia"]').inputValue()).toBe('Riel')
  const countAfterList = await page.getByText(/producto(s)?$/).first().innerText()
  expect(countAfterList).toBe(countBefore)
  await expect(page.locator('table')).toBeVisible()

  await page.getByRole('button', { name: 'Cuadrícula', exact: true }).click()
  await page.waitForTimeout(500)
  expect(await page.locator('input[placeholder*="Buscar por referencia"]').inputValue()).toBe('Riel')
  await page.screenshot({ path: 'e2e/.tmp/scrum696-toggle-preserva-filtro.png', fullPage: true })
})

test('REQ-617 Escenario 1 — buscar nombre de familia sin usar el filtro de Familia trae sus productos', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('Riel Direccionable')
  await page.waitForTimeout(700)
  const familySelect = page.locator('select').nth(1)
  expect(await familySelect.inputValue()).toBe('')

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toContain('RIEL-TRK-050')
  await page.screenshot({ path: 'e2e/.tmp/scrum697-busqueda-familia-por-texto.png', fullPage: true })
})

test('REQ-617 — filtro Categoría y Familia son independientes (producto de categoría sin familia sigue apareciendo)', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  const categorySelect = page.locator('select').nth(0)
  await categorySelect.selectOption({ label: /iluminación exterior|iluminacion exterior/i }).catch(async () => {
    // fallback: pick whatever option contains "exterior"
    const options = await categorySelect.locator('option').allTextContents()
    const match = options.find(o => /exterior/i.test(o))
    if (match) await categorySelect.selectOption({ label: match })
  })
  await page.waitForTimeout(700)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toContain('PREQA-NOFAM-001')
  await page.screenshot({ path: 'e2e/.tmp/scrum697-categoria-familia-independientes.png', fullPage: true })
})

test('REQ-619 — hallazgo: contador de seleccionados no se ajusta al cambiar de filtro (selección fantasma)', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  // Filtrar por una familia chica y seleccionar todo
  const familySelect = page.locator('select').nth(1)
  const familyOptions = await familySelect.locator('option').allTextContents()
  const bathFamily = familyOptions.find(o => /baño|espejo/i.test(o))
  test.skip(!bathFamily, 'No se encontró familia "Baño & Espejo" en fixtures')
  await familySelect.selectOption({ label: bathFamily! })
  await page.waitForTimeout(700)

  const selectAllCheckbox = page.locator('label', { hasText: 'Seleccionar todo' }).locator('input[type="checkbox"]')
  await selectAllCheckbox.check()
  await page.waitForTimeout(300)
  const selectedCountWithFilterA = await page.locator('span', { hasText: /seleccionado(s)?$/ }).innerText()

  // Cambiar a otra familia distinta con productos distintos
  const officeFamily = familyOptions.find(o => /oficina|comercial/i.test(o))
  test.skip(!officeFamily, 'No se encontró familia "Oficina & Comercial" en fixtures')
  await familySelect.selectOption({ label: officeFamily! })
  await page.waitForTimeout(700)

  const selectedCountWithFilterB = await page.locator('span', { hasText: /seleccionado(s)?$/ }).innerText()
  const selectAllCheckedAfter = await selectAllCheckbox.isChecked()

  console.log('SELECCION FANTASMA — count con filtro A:', selectedCountWithFilterA,
    '| count tras cambiar a filtro B:', selectedCountWithFilterB,
    '| "Seleccionar todo" marcado tras cambiar filtro:', selectAllCheckedAfter)

  await page.screenshot({ path: 'e2e/.tmp/scrum699-seleccion-fantasma.png', fullPage: true })

  // Documentamos el resultado observado — este assert es el criterio de ruptura real:
  // el contador NO debería seguir mostrando productos que ya no están visibles.
  expect(selectedCountWithFilterB).toBe('0 seleccionados')
})

test('REQ-620 — botones de navegación llevan a las pantallas reales', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  await page.getByRole('button', { name: 'Inventario de Compras' }).click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/inventario')
  await page.screenshot({ path: 'e2e/.tmp/scrum700-inventario-compras.png', fullPage: true })

  await gotoCatalog(page)
  await page.getByRole('button', { name: 'Inventario de Bodega' }).click()
  await page.waitForTimeout(1000)
  // neil.quiel no tiene bodega.read -> debe rebotar (RequirePermission -> FALLBACK_ROUTE), no romper nada
  expect(page.url()).not.toContain('/bodega/inventario')
  const bodyText = await page.locator('body').innerText()
  expect(bodyText.length).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum700-inventario-bodega-rebote.png', fullPage: true })
})

test('REQ-621 — descargar PDF de ejemplo dispara la descarga real', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF de ejemplo' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Catalogo_Ejemplo.pdf')
})

test('REQ-618 — ficha técnica: rechazo de tipo de archivo inválido es VISIBLE en la UI', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  await gotoCatalog(page)

  // Buscar un producto sabido sin ficha (id=67 sembrado por Pre-QA, referencia PREQA-NOFAM-001)
  await page.locator('input[placeholder*="Buscar por referencia"]').fill('PREQA-NOFAM-001')
  await page.waitForTimeout(700)
  await page.getByText('PREQA-NOFAM-001').first().click()
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: '+ Cargar ficha técnica' }).click()
  await page.waitForTimeout(300)

  const fs = await import('fs')
  const path = await import('path')
  const badFile = path.join('/tmp', 'preqa-bad.txt')
  fs.writeFileSync(badFile, 'not a valid technical sheet')

  const fileInput = page.locator('input[type="file"]')
  // El input tiene accept=".pdf,.png,.jpg,.jpeg" — probamos que el navegador o el backend
  // rechacen igual si se fuerza vía setInputFiles (bypassa el accept del picker nativo).
  await fileInput.setInputFiles(badFile)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1000)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toMatch(/no se pudo cargar la ficha técnica/i)
  await page.screenshot({ path: 'e2e/.tmp/scrum698-rechazo-archivo-invalido.png', fullPage: true })
})

test('Regresión — QuotePartCard (REQ-036/037, picker dentro de Cotización) sigue funcionando', async ({ page }) => {
  await login(page, SELLER_EMAIL)
  // Cotización + parte sembradas por Pre-QA vía tinker (owner_id=23=neil.quiel) puntualmente
  // para poder ejercitar el picker sin scriptear todo el flujo de creación de cotización —
  // Senior Review ya confirmó por código que Batch E no tocó este componente, esto confirma
  // que sigue funcionando en runtime. Id acoplado al estado sembrado en esta sesión local (ver
  // docs/pre-qa/scrum695-702-crm-catalogo-batche-20260731.md) — si se reseedea el entorno,
  // re-crear con el mismo tinker script y actualizar este id.
  await page.goto('/ventas-diseno/quotes/103')
  await page.waitForTimeout(1200)

  const addItemButton = page.getByRole('button', { name: '+ Agregar ítem' }).first()
  if (await addItemButton.isVisible().catch(() => false)) {
    await addItemButton.click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: 'Buscar en catálogo' }).first().click()
  await page.waitForTimeout(500)

  // Tab "Buscar" (REQ-036) — buscar un producto real por referencia
  const catalogSearchInput = page.getByPlaceholder(/buscar/i).first()
  await catalogSearchInput.fill('RIEL-TRK-050')
  await page.waitForTimeout(1000)
  const bodyTextSearch = await page.locator('body').innerText()
  expect(bodyTextSearch).toContain('RIEL-TRK-050')
  await page.screenshot({ path: 'e2e/.tmp/scrum695-regresion-quotepartcard-search.png', fullPage: true })

  // Tab "Familias" (REQ-037)
  const familiesTab = page.getByText('Familias', { exact: true }).first()
  if (await familiesTab.isVisible().catch(() => false)) {
    await familiesTab.click()
    await page.waitForTimeout(700)
    const bodyTextFamilies = await page.locator('body').innerText()
    expect(bodyTextFamilies.length).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/.tmp/scrum695-regresion-quotepartcard-families.png', fullPage: true })
  }
})
