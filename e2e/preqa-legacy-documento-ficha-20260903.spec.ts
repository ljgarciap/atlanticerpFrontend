import { test, expect, Page } from '@playwright/test'

// Pre-QA — vista "gemela" tipo documento (cabecera + líneas) de Historial ICG y ficha de Pagos
// ICG, a pedido de Luis 2026-09-03 (sin ticket Jira formal, feature acordada en chat). Corrido en
// LOCAL contra http://localhost:8090 (nginx + build fresco de React), mismo criterio que el resto
// de specs de Pre-QA del proyecto. Datos sembrados vía tinker antes de esta corrida (SubClient
// "PreQA Ficha Legacy Sub" con 1 Cliente ICG matcheado, 1 Cotización+ítem, 1 Pedido+ítem, 1
// Albarán+ítem con enlace a Factura, 1 Factura sin líneas, 1 Pago) — no vía este spec.
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:8090'

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

async function openPreQaSubClientHistory(page: Page): Promise<void> {
  await page.goto(`${BASE}/ventas-diseno/clients`)
  await page.getByPlaceholder(/buscar/i).fill('PreQA Ficha Legacy')
  await page.waitForTimeout(600)
  await page.getByText('PreQA Ficha Legacy', { exact: true }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Historial ICG' }).click()
  await page.waitForTimeout(400)
}

// La franja de tabs de la ficha comparte texto con la navegación lateral ("Pedidos", "Cotizaciones"
// también son ítems del Sidebar) — escopar siempre al modal, nunca buscar el botón por texto solo.
function tabStrip(page: Page) {
  return page.locator('div.px-5.pt-3.flex.gap-2.flex-wrap')
}

test('Cotizaciones — clic en la fila abre cabecera + líneas con el cliente resuelto', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await openPreQaSubClientHistory(page)

  await expect(page.getByText('PQ-9001')).toBeVisible()
  await page.getByText('PQ-9001').click()
  await page.waitForTimeout(400)

  // Cabecera: folio completo (4 segmentos), cliente resuelto por nombre (no el código crudo), total.
  const ficha = page.getByTestId('legacy-documento-ficha')
  await expect(ficha.getByText('PQ-9001-1-1')).toBeVisible()
  await expect(ficha.getByText('PreQA Cliente Legacy')).toBeVisible()
  await expect(ficha.getByText('$1,500')).toBeVisible()

  // Líneas: el ítem sembrado, con descuento (columna condicional visible).
  await expect(page.getByText('LMP-100')).toBeVisible()
  await expect(page.getByText('Lámpara colgante LED')).toBeVisible()

  // Nunca ningún control de edición sobre dato importado.
  for (const label of [/^guardar$/i, /^editar$/i, /^eliminar$/i, /^crear$/i]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  }
})

test('Pedidos — cabecera muestra el albarán relacionado', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await openPreQaSubClientHistory(page)

  await tabStrip(page).getByRole('button', { name: 'Pedidos' }).click()
  await page.waitForTimeout(400)
  await page.getByText('PQ-9002').click()
  await page.waitForTimeout(400)

  const ficha = page.getByTestId('legacy-documento-ficha')
  await expect(ficha.getByText('PQ-9003')).toBeVisible() // albarán relacionado (icg_seriealbaran-icg_numeroalbaran)
  await expect(ficha.getByText('$800')).toBeVisible()
  await expect(page.getByText('SPT-200')).toBeVisible()
})

test('Albaranes — cabecera muestra Facturado=Sí y la factura relacionada', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await openPreQaSubClientHistory(page)

  await tabStrip(page).getByRole('button', { name: 'Albaranes' }).click()
  await page.waitForTimeout(400)
  await page.getByText('PQ-9003').click()
  await page.waitForTimeout(400)

  const ficha = page.getByTestId('legacy-documento-ficha')
  await expect(ficha.getByText('Sí', { exact: true })).toBeVisible()
  await expect(ficha.getByText('PQ-9004')).toBeVisible() // factura relacionada
})

test('Facturas — nunca muestra una tabla de líneas, se ve la nota explicando por qué', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await openPreQaSubClientHistory(page)

  await tabStrip(page).getByRole('button', { name: 'Facturas' }).click()
  await page.waitForTimeout(400)
  await page.getByText('PQ-9004').click()
  await page.waitForTimeout(400)

  await expect(page.getByTestId('legacy-documento-ficha').getByText('$856')).toBeVisible() // total bruto
  await expect(page.getByText(/no tiene líneas en el origen/i)).toBeVisible()
  // Ninguna tabla de ítems dentro del modal (el Clients list de fondo sí tiene su propia tabla).
  await expect(page.locator('.max-w-2xl').locator('table')).toHaveCount(0)
})

test('"Volver a la lista" regresa sin perder el tab activo, y Cerrar cierra el modal', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await openPreQaSubClientHistory(page)

  await tabStrip(page).getByRole('button', { name: 'Pedidos' }).click()
  await page.waitForTimeout(400)
  await page.getByText('PQ-9002').click()
  await page.waitForTimeout(400)
  await expect(page.getByText('SPT-200')).toBeVisible()

  await page.getByRole('button', { name: 'Volver a la lista' }).click()
  await page.waitForTimeout(300)
  await expect(page.getByText('PQ-9002')).toBeVisible()
  await expect(tabStrip(page).getByRole('button', { name: 'Pedidos' })).toBeVisible()

  // 2 modales apilados (ClientDetailModal detrás + Historial ICG encima), cada uno con su propio
  // botón "Cerrar" — escopar por testid, nunca por texto/clase (ambos comparten clase de ancho, y
  // el filtro por texto matchea a ambos porque el modal externo contiene al interno en el DOM).
  await page.getByTestId('historial-icg-modal').getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)
  // El botón "Historial ICG" del ClientDetailModal de fondo sigue visible (nunca se cerró ese) —
  // lo que debe desaparecer es el modal en sí, no el texto "Historial ICG" en la página.
  await expect(page.getByTestId('historial-icg-modal')).toHaveCount(0)
})

test('Pagos ICG — clic en una fila abre la ficha con los campos del movimiento, sin líneas', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/pagos`)
  await page.waitForTimeout(500)

  await page.getByLabel('Origen').selectOption('C')
  await page.waitForTimeout(400)
  const fila = page.locator('tbody tr').filter({ hasText: 'PQ-9005' })
  await expect(fila).toHaveCount(1)
  await fila.click()
  await page.waitForTimeout(400)

  await expect(page.getByTestId('pago-ficha').getByText('C — hipótesis: Cobro')).toBeVisible()
  await expect(page.getByTestId('pago-ficha').getByText('F — hipótesis: Factura')).toBeVisible()
  await expect(page.getByTestId('pago-ficha').getByText('$856')).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('pago-ficha')).toHaveCount(0)
})
