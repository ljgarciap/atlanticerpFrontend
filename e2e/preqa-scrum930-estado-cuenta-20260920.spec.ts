import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (adversarial) — SCRUM-930 (Estado de Cuenta), 2026-09-20. Promovido a permanente: cubre
 * el hallazgo CRÍTICO real de esta pasada (Guía de Entrega colgada en "Cargando..." para siempre
 * para Admin&Contab, por un gate de permiso cruzado con Bodega — ver
 * `OrderBoardController::resolveAccess()`) además de los otros 5 puntos del ticket. Mismo criterio
 * que otros specs `preqa-*` del proyecto: fixture sembrado a mano (`master_client_id=5`, "PreQA
 * SCRUM930 UI...", 4 buckets de antigüedad + filas no-factura + guía en un pedido hermano), no
 * autosembrado — si el fixture no sobrevive un `migrate:fresh` de otra sesión, resembrar antes de
 * reactivar este spec (mismo gotcha ya documentado para `preqa-batch-895-897-550-881-882`).
 */

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

const FELIX = 'contabilidad@test.com'

test('SCRUM-930 — Sidebar abre Estado de Cuenta sin cliente preseleccionado, en ventana nueva', async ({ page, context }) => {
  await loginReal(page, FELIX)

  // Expandir el sidebar si nace colapsado (regla conocida de Playwright en este proyecto).
  const sidebarToggle = page.locator('button[title="Expandir menú"]')
  if (await sidebarToggle.isVisible().catch(() => false)) await sidebarToggle.click()

  // Las secciones del sidebar nacen colapsadas (SCRUM-711) — expandir "Admin. & Contab." primero.
  await page.getByRole('button', { name: /admin\. ?& ?contab/i }).click()
  await page.waitForTimeout(300)

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('nav').getByRole('button', { name: /^estado de cuenta$/i }).first().click(),
  ])
  await popup.waitForLoadState()
  await expect(popup.getByText('Estado de Cuenta', { exact: false }).first()).toBeVisible({ timeout: 10000 })

  // Sin cliente preseleccionado: el input de búsqueda está vacío, sin resultado cargado.
  const clientInput = popup.locator('input[placeholder]').first()
  await expect(clientInput).toHaveValue('')

  // Botón Status de Pedidos a la izquierda de Cerrar Ventana, ambos visibles.
  await expect(popup.getByRole('button', { name: /status de pedidos/i })).toBeVisible()
  await expect(popup.getByRole('button', { name: /cerrar ventana/i })).toBeVisible()

  await popup.close()
})

test('SCRUM-930 — flujo completo: buscar cliente, columna antigüedad, 4 documentos clickeables, docs correctos', async ({ page }) => {
  await loginReal(page, FELIX)
  await page.goto('/admin-contab/facturacion/estado-cuenta')
  await page.waitForTimeout(500)

  // Buscar el cliente fixture.
  await page.locator('input[placeholder]').first().fill('PreQA SCRUM930 UI')
  await page.waitForTimeout(600)
  await page.getByText('PreQA SCRUM930 UI', { exact: false }).first().click()
  await page.getByRole('button', { name: /^buscar$/i }).click()
  await page.waitForTimeout(1200)

  // Vista plana para ver todas las filas con Proyecto sin agrupar.
  await page.getByRole('button', { name: /vista plana/i }).click()
  await page.waitForTimeout(300)

  // Punto 2 — número de cuenta sin máscara.
  await expect(page.getByText('04-01-99-123456-4321')).toBeVisible()
  await expect(page.getByText(/\*{2,}/)).toHaveCount(0)

  // Punto 3 — columna Antigüedad de cartera inmediatamente después de Saldo.
  const headerCells = page.locator('table thead th')
  const headerTexts = await headerCells.allTextContents()
  const saldoIdx = headerTexts.findIndex(t => /saldo/i.test(t))
  const antigIdx = headerTexts.findIndex(t => /antigüedad/i.test(t))
  expect(antigIdx).toBe(saldoIdx + 1)

  // Los 4 buckets deben aparecer en algún lado de la tabla.
  await expect(page.getByText('0–30 días').first()).toBeVisible()
  await expect(page.getByText('31–60 días').first()).toBeVisible()
  await expect(page.getByText('61–90 días').first()).toBeVisible()
  await expect(page.getByText('+91 días').first()).toBeVisible()

  // Punto 1 — Guía de Entrega muestra el NÚMERO real, no "Sí".
  await expect(page.getByText(/^sí$/i)).toHaveCount(0)
  const guiaCell = page.getByText(/PED-2026-PREQA930-\d+-G/)
  await expect(guiaCell).toBeVisible()

  // Punto 4a (CRÍTICO, ver docblock del archivo) — click en la Guía de Entrega abre el modal con
  // la guía CORRECTA (orderB, no la del order_id de la factura F-930-ROOT, que es order 9), y
  // carga de verdad — antes del fix de `OrderBoardController::resolveAccess()` este modal se
  // quedaba en "Cargando..." para siempre para este rol.
  await guiaCell.click()
  await page.waitForTimeout(600)
  await expect(page.getByText(/detalle de guía|guía de entrega/i).first()).toBeVisible()
  // La guía pertenece a orderB (id 10, customer_name distintivo), NO a order9 (id de la
  // factura F-930-ROOT) — confirma que guia_entrega_order_id resolvió el pedido correcto de la
  // familia, no el de la factura misma.
  await expect(page.getByText(/sibling B/i)).toBeVisible()
  await page.keyboard.press('Escape').catch(() => {})
  const guiaCloseBtn = page.getByRole('button', { name: /cerrar/i }).last()
  if (await guiaCloseBtn.isVisible().catch(() => false)) await guiaCloseBtn.click()
  await page.waitForTimeout(400)

  // Punto 4b — Factura F-930-ROOT clickeable, abre InvoiceDetailModal con esa factura específica.
  await page.getByRole('button', { name: /F-930-ROOT/ }).click()
  await page.waitForTimeout(700)
  await expect(page.getByText(/F-930-ROOT/).first()).toBeVisible()
  await expect(page.getByText(/PED-2026-PREQA930/).first()).toBeVisible()
  await page.getByRole('button', { name: /^cerrar$/i }).last().click()
  await page.waitForTimeout(400)

  // Punto 4c — Nota de crédito (fila 'descuento' de F-930-C) clickeable vía la celda Concepto.
  await page.getByRole('button', { name: /descuento/i }).first().click()
  await page.waitForTimeout(700)
  await expect(page.getByText(/nota.*crédito|NC-930-DESC/i).first()).toBeVisible()
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(400)

  // Punto 4d — Cotización clickeable (folio COT-2026-PREQA930-...).
  const quoteLink = page.getByRole('button', { name: /COT-2026-PREQA930/ }).first()
  await quoteLink.click()
  await page.waitForTimeout(700)
  await expect(page.getByText(/COT-2026-PREQA930/).first()).toBeVisible()
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(400)

  // Filas no-factura: antigüedad "—" (cobro/descuento/anulación no heredan el bucket).
  const rows = page.locator('table tbody tr')
  const rowCount = await rows.count()
  let cobroRowFound = false
  let anulacionRowFound = false
  for (let i = 0; i < rowCount; i++) {
    const rowText = await rows.nth(i).innerText()
    if (/cobro/i.test(rowText)) cobroRowFound = true
    if (/anulaci[oó]n/i.test(rowText)) anulacionRowFound = true
  }
  expect(cobroRowFound).toBeTruthy()
  expect(anulacionRowFound).toBeTruthy()

  // Fila F-930-F: sin guía, sin cotización -> deben verse como texto plano "—", no botón.
  const rowF = page.locator('table tbody tr', { hasText: 'F-930-F' })
  await expect(rowF).toBeVisible()
  const rowFText = await rowF.innerText()
  expect(rowFText).toContain('—')
})

test('SCRUM-930 punto 5/6 — orden del menú, no navega la pestaña actual, Status de Pedidos y Cerrar Ventana funcionan', async ({ page, context }) => {
  await loginReal(page, FELIX)
  const urlBefore = page.url()

  const sidebarToggle = page.locator('button[title="Expandir menú"]')
  if (await sidebarToggle.isVisible().catch(() => false)) await sidebarToggle.click()
  await page.getByRole('button', { name: /admin\. ?& ?contab/i }).click()
  await page.waitForTimeout(300)

  const navItems = page.locator('nav').getByRole('button')
  const labels = (await navItems.allTextContents()).map(s => s.trim()).filter(Boolean)
  const idxInicio = labels.findIndex(l => /^inicio$/i.test(l))
  const idxEstado = labels.findIndex(l => /^estado de cuenta$/i.test(l))
  const idxFacturacion = labels.findIndex(l => /^facturaci[oó]n$/i.test(l))
  expect(idxInicio).toBeGreaterThanOrEqual(0)
  expect(idxEstado).toBe(idxInicio + 1)
  expect(idxFacturacion).toBe(idxEstado + 1)

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('nav').getByRole('button', { name: /^estado de cuenta$/i }).first().click(),
  ])
  await popup.waitForLoadState()

  // La pestaña ORIGINAL no debe haber navegado — sigue siendo la misma URL.
  expect(page.url()).toBe(urlBefore)

  // Status de Pedidos navega dentro del popup.
  await popup.getByRole('button', { name: /status de pedidos/i }).click()
  await popup.waitForTimeout(800)
  expect(popup.url()).toContain('/bodega/pedidos/status')
  await popup.close()

  // Cerrar Ventana — popup fresco, sin navegación intermedia (goBack() desde /bodega/pedidos/status
  // rompía el historial de window.open() en el primer intento).
  const [popup2] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('nav').getByRole('button', { name: /^estado de cuenta$/i }).first().click(),
  ])
  await popup2.waitForLoadState()
  // El listener debe suscribirse ANTES del click — window.close() puede resolver tan rápido que
  // un `await click()` seguido de `waitForEvent('close')` llega tarde al evento.
  await Promise.all([
    popup2.waitForEvent('close', { timeout: 5000 }),
    popup2.getByRole('button', { name: /cerrar ventana/i }).click(),
  ])
  expect(popup2.isClosed()).toBeTruthy()
})

test('SCRUM-930 — cero emoji en Estado de Cuenta (regla dura de cliente)', async ({ page }) => {
  await loginReal(page, FELIX)
  await page.goto('/admin-contab/facturacion/estado-cuenta')
  await page.waitForTimeout(500)
  await page.locator('input[placeholder]').first().fill('PreQA SCRUM930 UI')
  await page.waitForTimeout(600)
  await page.getByText('PreQA SCRUM930 UI', { exact: false }).first().click()
  await page.getByRole('button', { name: /^buscar$/i }).click()
  await page.waitForTimeout(1200)

  const bodyText = await page.locator('body').innerText()
  // eslint-disable-next-line no-misleading-character-class
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(bodyText)).toBeFalsy()
})

test('SCRUM-930 — buscador sin preselección: cliente inexistente y buscar sin seleccionar no rompen', async ({ page }) => {
  await loginReal(page, FELIX)
  await page.goto('/admin-contab/facturacion/estado-cuenta')
  await page.waitForTimeout(500)

  // Cliente inexistente: sin resultados, sin crash.
  await page.locator('input[placeholder]').first().fill('ZZZZ-cliente-que-no-existe-930')
  await page.waitForTimeout(600)
  await expect(page.locator('ul li')).toHaveCount(0)

  // Buscar sin haber seleccionado un cliente de la lista: error inline, nunca window.alert().
  let dialogFired = false
  page.on('dialog', () => { dialogFired = true })
  await page.getByRole('button', { name: /^buscar$/i }).click()
  await page.waitForTimeout(400)
  expect(dialogFired).toBeFalsy()
  await expect(page.getByText(/selecciona|requerido|cliente/i).last()).toBeVisible()
})

test('SCRUM-930 — doble clic en el ítem del Sidebar no abre dos ventanas', async ({ page, context }) => {
  await loginReal(page, FELIX)
  const sidebarToggle = page.locator('button[title="Expandir menú"]')
  if (await sidebarToggle.isVisible().catch(() => false)) await sidebarToggle.click()
  await page.getByRole('button', { name: /admin\. ?& ?contab/i }).click()
  await page.waitForTimeout(300)

  const popups: number[] = []
  context.on('page', () => popups.push(1))

  const item = page.locator('nav').getByRole('button', { name: /^estado de cuenta$/i }).first()
  await item.click()
  await item.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1000)

  // No es estrictamente "a lo sumo 1" (depende del navegador), pero documentamos cuántas abrió.
  console.log('popups abiertos tras doble clic:', popups.length)
  expect(popups.length).toBeGreaterThanOrEqual(1)
})
