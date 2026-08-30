import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * SCRUM-747 — Reestructurar navegación de Compras en 3 submenús desplegables. Cubre los 7
 * escenarios Dado/Cuando/Entonces del ticket contra el patrón NavDropdown/isDropdown() de
 * `src/components/Sidebar.tsx` (mismo mecanismo ya usado en 'bodega-inventario-menu',
 * SCRUM-363 — RN8 del ticket pide explícitamente "mismo principio").
 *
 * Estructura objetivo (7 accesos de nivel superior):
 *   Inicio
 *   Órdenes ▾        → Ver Órdenes | Nueva Orden | Logística & Envío
 *   Catálogo y Stock ▾ → Inventario | Ver registros de ingreso | Comparación de Referencias
 *   Pagos ▾          → Pagos a Proveedores | Agencias de Liquidación
 *   Proveedores
 *   Garantías & Reclamos
 *   Reportes
 *
 * Ver spec Analista/diseño técnico: atlanticerp-backend/docs/specs/scrum742-743-746-747-748-analista-
 * spec.md y atlanticerp/docs/architecture/scrum742-743-746-747-748-diseno.md (sección SCRUM-747).
 *
 * Cuenta real (password = email, ver memory/feedback_testing_uses_real_users_not_demo.md):
 *  - gerencia2@illuminations.com.pa (Yirena Teng, lider_compras — también con bodega.read, que
 *    trae su PROPIO dropdown "Inventario" en la sección Bodega. Todas las verificaciones de acá
 *    se scopean al contenedor de la sección "Compras · Inventario" (ver getComprasGroup) para no
 *    confundir ese "Inventario" de Bodega con el que ahora vive dentro de "Catálogo y Stock").
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'

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

// SCRUM-711/713 — cualquier login fresco (localStorage limpio) arranca con el sidebar en modo
// "riel de íconos" (ancho colapsado). En ese modo ni los headers de sección ni los hijos de un
// dropdown se renderizan (ver navContent()/isCollapsed en Sidebar.tsx) — hay que expandir el
// ANCHO primero, o el resto de las interacciones no encuentra nada que clickear.
async function ensureSidebarExpanded(page: Page) {
  const expandBtn = page.getByTitle('Expandir menú')
  if (await expandBtn.count() > 0) {
    await expandBtn.click()
    await page.waitForTimeout(300)
  }
}

// La sección "Compras · Inventario" (acordeón, SCRUM-711) nace colapsada — hay que abrirla antes
// de poder ver/interactuar con sus ítems. Devuelve el contenedor <div> de la sección para scopear
// el resto de las queries y no cruzarse con la sección "Bodega" (mismo usuario real tiene
// bodega.read, y Bodega trae su propio dropdown "Inventario" — ver nota de cabecera).
async function openComprasSection(page: Page): Promise<Locator> {
  await ensureSidebarExpanded(page)
  const header = page.getByText('Compras · Inventario', { exact: true }).first()
  await header.click()
  await page.waitForTimeout(300)
  return header.locator('xpath=ancestor::div[1]')
}

test('1. Escenario 1 — estructura principal: exactamente 7 accesos de nivel superior, en orden', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/inicio`)
  await page.waitForTimeout(1500)
  const comprasGroup = await openComprasSection(page)

  const topLevelLabels = ['Inicio', 'Órdenes', 'Catálogo y Stock', 'Pagos', 'Proveedores', 'Garantías & Reclamos', 'Reportes']
  for (const label of topLevelLabels) {
    await expect(comprasGroup.getByText(label, { exact: true }).first()).toBeVisible()
  }

  await page.screenshot({ path: 'e2e/.tmp/scrum747/01-estructura-principal.png', fullPage: true })
})

test('2. Escenario 2 — dropdown "Órdenes" despliega exactamente 3 hijos: Ver Órdenes, Nueva Orden, Logística & Envío', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/inicio`)
  await page.waitForTimeout(1500)
  const comprasGroup = await openComprasSection(page)

  await comprasGroup.getByText('Órdenes', { exact: true }).first().click()
  await page.waitForTimeout(300)

  await expect(comprasGroup.getByText('Ver Órdenes', { exact: true })).toBeVisible()
  await expect(comprasGroup.getByText('Nueva Orden', { exact: true })).toBeVisible()
  await expect(comprasGroup.getByText('Logística & Envío', { exact: true })).toBeVisible()

  await page.screenshot({ path: 'e2e/.tmp/scrum747/02-dropdown-ordenes.png', fullPage: true })
})

test('3. Escenario 3 — dropdown "Catálogo y Stock" despliega exactamente 3 hijos: Inventario, Ver registros de ingreso, Comparación de Referencias', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/inicio`)
  await page.waitForTimeout(1500)
  const comprasGroup = await openComprasSection(page)

  await comprasGroup.getByText('Catálogo y Stock', { exact: true }).first().click()
  await page.waitForTimeout(300)

  // "Inventario" también existe como dropdown propio de la sección Bodega para este mismo usuario
  // (bodega.read) — se scopea a comprasGroup a propósito para verificar el de Compras, no el de
  // Bodega (ver nota de cabecera del archivo).
  await expect(comprasGroup.getByText('Inventario', { exact: true })).toBeVisible()
  await expect(comprasGroup.getByText('Ver registros de ingreso', { exact: true })).toBeVisible()
  await expect(comprasGroup.getByText('Comparación de Referencias', { exact: true })).toBeVisible()

  await page.screenshot({ path: 'e2e/.tmp/scrum747/03-dropdown-catalogo-stock.png', fullPage: true })
})

test('4. Escenario 4 — dropdown "Pagos" despliega exactamente 2 hijos: Pagos a Proveedores, Agencias de Liquidación', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/inicio`)
  await page.waitForTimeout(1500)
  const comprasGroup = await openComprasSection(page)

  await comprasGroup.getByText('Pagos', { exact: true }).first().click()
  await page.waitForTimeout(300)

  await expect(comprasGroup.getByText('Pagos a Proveedores', { exact: true })).toBeVisible()
  await expect(comprasGroup.getByText('Agencias de Liquidación', { exact: true })).toBeVisible()

  await page.screenshot({ path: 'e2e/.tmp/scrum747/04-dropdown-pagos.png', fullPage: true })
})

test('5. Escenario 5 (RN6) — en pantalla de un hijo, el dropdown padre queda marcado activo y el hijo resaltado dentro', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/ordenes/nueva`)
  await page.waitForTimeout(1500)
  // No hace falta scopear a comprasGroup acá: "Órdenes"/"Ver Órdenes"/"Nueva Orden"/"Logística &
  // Envío" no colisionan con ningún label de la sección Bodega (a diferencia de "Inventario",
  // ver nota de cabecera) — se descarta el valor de retorno a propósito.
  await openComprasSection(page)

  // NewPurchaseOrderPage (contenido principal) tiene su PROPIO <h1>Nueva Orden</h1> — mismo texto
  // literal que el ítem del sidebar. Sin scopear a <aside>, getByText('Nueva Orden') matchea ambos
  // y .first() puede resolver al heading (sin ancestor::button), no al ítem del menú. Se scopea al
  // sidebar para desambiguar.
  const sidebar = page.locator('aside').first()

  // El dropdown "Órdenes" debe auto-expandirse porque uno de sus hijos (Nueva Orden) está activo
  // (mismo mecanismo que 'bodega-inventario-menu': anyChildActive => open, sin clic manual en el
  // dropdown en sí — solo hizo falta abrir el acordeón de la sección "Compras · Inventario").
  const ordenesButton = sidebar.getByText('Órdenes', { exact: true }).first().locator('xpath=ancestor-or-self::button[1]')
  await expect(ordenesButton).toHaveClass(/bg-\[#d1ede9\]/)

  const nuevaOrdenButton = sidebar.getByText('Nueva Orden', { exact: true }).first().locator('xpath=ancestor-or-self::button[1]')
  await expect(nuevaOrdenButton).toHaveClass(/bg-\[#d1ede9\]/)

  // "Ver Órdenes" (hermano dentro del mismo dropdown) NO debe quedar resaltado a la vez.
  const verOrdenesButton = sidebar.getByText('Ver Órdenes', { exact: true }).first().locator('xpath=ancestor-or-self::button[1]')
  await expect(verOrdenesButton).not.toHaveClass(/bg-\[#d1ede9\]/)

  await page.screenshot({ path: 'e2e/.tmp/scrum747/05-estado-activo-dropdown-hijo.png', fullPage: true })
})

test('6. Escenario 6 (RN5) — ningún ítem hijo de un dropdown aparece duplicado como acceso independiente de nivel superior', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')
  await page.goto(`${BASE}/compras/inicio`)
  await page.waitForTimeout(1500)
  const comprasGroup = await openComprasSection(page)

  // Expandir los 3 dropdowns para que sus hijos estén en el DOM.
  await comprasGroup.getByText('Órdenes', { exact: true }).first().click()
  await page.waitForTimeout(200)
  await comprasGroup.getByText('Catálogo y Stock', { exact: true }).first().click()
  await page.waitForTimeout(200)
  await comprasGroup.getByText('Pagos', { exact: true }).first().click()
  await page.waitForTimeout(200)

  // Los 8 hijos (3+3+2) deben aparecer exactamente 1 vez cada uno DENTRO de la sección Compras —
  // nunca 2 veces (una como hijo del dropdown, otra como acceso plano de nivel superior). Scopeado
  // a comprasGroup para no contar el "Inventario" propio de la sección Bodega (ver cabecera).
  const childLabels = [
    'Ver Órdenes', 'Nueva Orden', 'Logística & Envío',
    'Inventario', 'Ver registros de ingreso', 'Comparación de Referencias',
    'Pagos a Proveedores', 'Agencias de Liquidación',
  ]
  for (const label of childLabels) {
    await expect(comprasGroup.getByText(label, { exact: true })).toHaveCount(1)
  }

  await page.screenshot({ path: 'e2e/.tmp/scrum747/06-sin-duplicacion.png', fullPage: true })
})

test('7. Escenario 7 (RN8) — la estructura de 7 accesos es idéntica entre distintas pantallas de Compras', async ({ page }) => {
  await login(page, 'gerencia2@illuminations.com.pa')

  const topLevelLabels = ['Inicio', 'Órdenes', 'Catálogo y Stock', 'Pagos', 'Proveedores', 'Garantías & Reclamos', 'Reportes']
  const screens = ['/compras/inicio', '/compras/proveedores', '/compras/reportes']

  for (const screen of screens) {
    await page.goto(`${BASE}${screen}`)
    await page.waitForTimeout(1200)
    const comprasGroup = await openComprasSection(page)
    for (const label of topLevelLabels) {
      await expect(comprasGroup.getByText(label, { exact: true }).first()).toBeVisible()
    }
  }

  await page.screenshot({ path: 'e2e/.tmp/scrum747/07-consistencia-entre-pantallas.png', fullPage: true })
})
