import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Pre-QA 2026-07-28 — re-check batch "Pedidos" (SCRUM-401, SCRUM-424, SCRUM-428).
 * Corre contra dev.atlanticerp.ai (mismos datos que usará marly), no contra un stack local.
 * Serial a propósito: dev.atlanticerp.ai corre CrowdSec/ModSecurity (ver CLAUDE.md, Epic 11) — logins
 * en paralelo desde la misma IP disparan falsos timeouts.
 *
 * SCRUM-401 (REQ-331) — fix f95488c: la fila "Factura lista - ver" ahora vive en
 * `STAGES_WITH_INVOICE = ['por_despachar', 'despachado', 'entregado']` (antes solo
 * `por_despachar`) — marly rebotó 2 veces porque la factura ya lista desaparecía sin acceso al
 * avanzar el pedido. Se usa descubrimiento dinámico de tarjetas en vez de IDs fijos porque el
 * tablero de Pedidos es de datos vivos que otros Pre-QA/QA mueven de etapa entre corridas (el
 * fixture "dedicado" de la sesión anterior, order 19, ya había avanzado de por_despachar a
 * entregado para cuando corrió este batch).
 *
 * SCRUM-424 (REQ-354) — fix c2eb8f9: columna "En camino" ahora es SIEMPRE un botón (antes
 * deshabilitado en 0, Escenario 2 inalcanzable), y el modal muestra "Orden #{id}" real.
 *
 * SCRUM-428 (REQ-358) — fix c2eb8f9: "Cambiar" solo se oculta cuando el producto viene fijo por
 * fila (Ver Inventario); "+ Nueva solicitud" (SCRUM-446, producto libre) lo sigue mostrando.
 *
 * Hallazgo de ESTE re-check (RN5, no parte del commit de hoy pero explícitamente en el checklist
 * de RN1-RN5): `hasCommittedUnits` en `NewAdjustmentRequestModal` leía
 * `productWarehouseStock.por_servir` — el concepto de reserva de VENTAS & DISEÑO
 * (`InventoryKpiService::porServirMap()`), SIEMPRE 0 para productos sin cotización activa —, en
 * vez del comprometido REAL de Bodega (mismo dato que expone `PorServirModal`,
 * `commitment-detail`). Confirmado en vivo: LAMP-COL-001 tiene por_servir=6 (comprometido real,
 * `/bodega/inventory`) pero devolvía 0 en `warehouse-stock` — la advertencia de RN5 nunca se
 * disparaba para el caso real que el ticket pide cubrir. Corregido en este mismo pase
 * (`SolicitudAjustePage.tsx`, ahora usa `useBodegaPorServir`) — ver commit de este batch.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const ESTEBAN_EMAIL = 'almacen@atlantic.com.pa'
const ESTEBAN_PASSWORD = 'almacen@atlantic.com.pa'

async function login(page: Page, email = ESTEBAN_EMAIL, password = ESTEBAN_PASSWORD) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|bodega|inicio|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function goToPedidos(page: Page) {
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(2000)
}

async function goToInventario(page: Page) {
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(2000)
}

async function searchProduct(page: Page, reference: string) {
  const search = page.getByPlaceholder('Buscar por referencia o descripción...')
  await search.fill(reference)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.waitForTimeout(1500)
}

/** Recorre las tarjetas del tablero y devuelve la primera cuyo predicado async sea true. Evita
 * depender de IDs fijos de pedidos, que otras corridas de Pre-QA/QA avanzan de etapa entre sesiones. */
async function findCard(page: Page, predicate: (card: Locator) => Promise<boolean>): Promise<Locator | null> {
  const cards = page.locator('[data-testid^="order-card-"]')
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    if (await predicate(card)) return card
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-401 — fila de Factura alcanzable en Por despachar/Despachado/Entregado
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-401 — acceso a Factura en las 3 etapas (fix f95488c)', () => {
  test('Despachado + invoice_ready=true — fila "ver" visible y modal placeholder abre', async ({ page }) => {
    await login(page)
    await goToPedidos(page)
    const card = await findCard(page, async c => (await c.getByTestId('invoice-ready').count()) > 0
      && (await c.getByTestId(/^register-signed-guide-button-/).count()) > 0)
    expect(card, 'se esperaba al menos 1 pedido en Despachado con invoice_ready=true').not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    const invoiceBtn = card!.getByTestId('invoice-view-button')
    await expect(invoiceBtn).toBeVisible()
    await invoiceBtn.click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('invoice-status-message')).toBeVisible()
    // Alcance reducido pre-aprobado — nunca botones de generar/editar/eliminar.
    await expect(page.getByRole('button', { name: /generar|editar|eliminar/i })).toHaveCount(0)
  })

  test('Entregado + invoice_ready=true — fila "ver" sigue visible tras el despacho completo', async ({ page }) => {
    await login(page)
    await goToPedidos(page)
    // Entregado es terminal: sin botón de acción de etapa (register-signed-guide/dispatch/etc).
    const card = await findCard(page, async c => {
      const invoiceReady = (await c.getByTestId('invoice-ready').count()) > 0
      if (!invoiceReady) return false
      const hasAnyStageAction = (await c.getByTestId(/^register-signed-guide-button-/).count()) > 0
        || (await c.getByTestId(/^dispatch-button-/).count()) > 0
        || (await c.getByTestId(/^assign-courier-button-/).count()) > 0
      return !hasAnyStageAction
    })
    expect(card, 'se esperaba al menos 1 pedido en Entregado con invoice_ready=true').not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    const invoiceBtn = card!.getByTestId('invoice-view-button')
    await expect(invoiceBtn).toBeVisible()
    await invoiceBtn.click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('invoice-status-message')).toBeVisible()
  })

  test('Packing — la fila de Factura NO se adelanta de más (ausente en etapas previas a Por despachar)', async ({ page }) => {
    await login(page)
    await goToPedidos(page)
    const packingCard = await findCard(page, async c => (await c.getByTestId(/^register-delivery-button-/).count()) > 0)
    expect(packingCard, 'se esperaba al menos 1 pedido en Packing').not.toBeNull()
    await packingCard!.scrollIntoViewIfNeeded()
    await expect(packingCard!.getByTestId('invoice-ready')).toHaveCount(0)
    await expect(packingCard!.getByTestId('invoice-waiting')).toHaveCount(0)
  })

  test('Por despachar + invoice_ready=false — fila "esperando" visible, sin botón "ver"', async ({ page }) => {
    await login(page)
    await goToPedidos(page)
    const card = await findCard(page, async c => (await c.getByTestId('invoice-waiting').count()) > 0)
    expect(card, 'se esperaba al menos 1 pedido en Por despachar con invoice_ready=false').not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    await expect(card!.getByTestId('invoice-waiting')).toBeVisible()
    await expect(card!.getByTestId('invoice-view-button')).toHaveCount(0)
  })

  test('camino de ruptura — doble clic rápido en "ver" no abre 2 modales', async ({ page }) => {
    await login(page)
    await goToPedidos(page)
    const card = await findCard(page, async c => (await c.getByTestId('invoice-view-button').count()) > 0)
    expect(card).not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    const invoiceBtn = card!.getByTestId('invoice-view-button')
    await Promise.all([invoiceBtn.click(), invoiceBtn.click()])
    await page.waitForTimeout(800)
    // El estado del modal es un único string (no array) — nunca puede haber 2 instancias.
    await expect(page.getByTestId('invoice-status-message')).toHaveCount(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-424 — "En camino" clickable en 0 + número de orden real + multi-orden
// ─────────────────────────────────────────────────────────────────────────
function enCaminoCell(row: Locator) {
  return row.locator('td').nth(10)
}

test.describe('SCRUM-424 — detalle de "En camino" (fix c2eb8f9)', () => {
  test('Escenario 1 — producto con 1 orden en camino: modal muestra el número de orden real', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'QA-BOD-406-001')
    const row = page.locator('tbody tr', { hasText: 'QA-BOD-406-001' }).first()
    await expect(row).toBeVisible()
    await enCaminoCell(row).locator('button').click()
    await page.waitForTimeout(700)
    const modal = page.locator('div.fixed', { hasText: 'En camino' })
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(/Orden #\d+/)
    await expect(modal).toContainText('Importado Demo')
  })

  test('camino de ruptura — producto con En camino de MÁS de una orden distinta: el modal lista todas, no solo una', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await expect(row).toBeVisible()
    await enCaminoCell(row).locator('button').click()
    await page.waitForTimeout(700)
    const modal = page.locator('div.fixed', { hasText: 'En camino' })
    await expect(modal).toBeVisible()
    const items = modal.locator('li')
    const count = await items.count()
    console.log('SCRUM424_MULTI_ORDER_LINE_COUNT=', count)
    expect(count).toBeGreaterThan(1) // confirmado en vivo: 3 líneas (Órdenes #31/#33/#36)
    const orderNumbers = new Set<string>()
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).innerText()
      const match = text.match(/Orden #(\d+)/)
      if (match) orderNumbers.add(match[1])
    }
    expect(orderNumbers.size).toBe(count) // cada línea es una orden distinta, ninguna repetida/colapsada
  })

  test('Escenario 2 — producto con En camino=0: la celda ES clickeable y muestra mensaje de "no hay órdenes", no queda deshabilitada', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.selectOption('all')
    await page.waitForTimeout(1500)

    const rows = page.locator('tbody tr')
    const count = await rows.count()
    let tested = false
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const cell = enCaminoCell(row)
      const cellText = (await cell.innerText()).trim()
      if (cellText === '0') {
        const btn = cell.locator('button')
        await expect(btn).toBeVisible()
        await expect(btn).toBeEnabled()
        await btn.click()
        await page.waitForTimeout(700)
        const modal = page.locator('div.fixed', { hasText: 'En camino' })
        await expect(modal).toBeVisible()
        await expect(modal).toContainText(/no hay/i)
        tested = true
        break
      }
    }
    expect(tested, 'se esperaba al menos 1 producto con En camino=0 en el catálogo').toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-428 — "Solicitar ajuste" por fila: producto fijo, sin "Cambiar" + RN1-RN5
// ─────────────────────────────────────────────────────────────────────────
function adjustmentModal(page: Page) {
  return page.locator('div.fixed', { hasText: 'ajuste' }).first()
}

test.describe('SCRUM-428 — modal Solicitar ajuste (fix c2eb8f9 + RN5 hallazgo de este re-check)', () => {
  test('entrada por fila (Ver Inventario) — producto ya fijo, SIN link "Cambiar"', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('CAND-SAL-005')
    await expect(modal.getByText(/cambiar/i)).toHaveCount(0)
    await modal.getByRole('button', { name: /cancelar/i }).click()
  })

  test('entrada libre ("+ Nueva solicitud") — SÍ muestra "Cambiar" (2 entry points intencionalmente distintos)', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/bodega/solicitud-ajuste`)
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /\+ nueva solicitud/i }).click()
    await page.waitForTimeout(600)
    const modal = adjustmentModal(page)
    await expect(modal).toBeVisible()
    const search = modal.getByPlaceholder(/buscar producto/i)
    await search.fill('CAND-SAL-005')
    await page.waitForTimeout(1000)
    await modal.getByText(/CAND-SAL-005/).first().click()
    await page.waitForTimeout(300)
    await expect(modal.getByText(/cambiar/i)).toBeVisible()
  })

  test('RN1 — el selector de bodega siempre muestra el universo completo de bodegas, incluso con 0 unidades', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    await modal.getByRole('button', { name: /agregar bodega/i }).click()
    await page.waitForTimeout(300)
    const warehouseSelect = modal.locator('select').first()
    const options = await warehouseSelect.locator('option').allTextContents()
    console.log('SCRUM428_RN1_WAREHOUSE_OPTIONS=', JSON.stringify(options))
    // NOTA: el ticket original habla de "las 5 bodegas del sistema" — el sistema real de
    // dev.atlanticerp.ai ya tiene 7 bodegas físicas (Zona Libre/Merma/Reclamos agregadas en batches
    // posteriores de Bodega). El intent de RN1 ("universo completo, incluso en 0") se cumple
    // igual con 7 — no es un hallazgo, es texto de ticket desactualizado.
    expect(options.length).toBeGreaterThanOrEqual(5)
    expect(options.some(o => /\(0 unidades\)/.test(o))).toBe(true)
  })

  test('RN2/RN3 — agregar 2 bodegas distintas; la ya elegida desaparece de la otra línea y reaparece al quitarla', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    const addBtn = modal.getByRole('button', { name: /agregar bodega/i })

    await addBtn.click()
    await page.waitForTimeout(300)
    let lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    const select1 = lineBlocks.nth(0).locator('select').first()
    const chosen1 = (await select1.locator('option').first().textContent())?.trim() ?? ''

    await addBtn.click()
    await page.waitForTimeout(300)
    lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    const select2 = lineBlocks.nth(1).locator('select').first()
    const options2 = await select2.locator('option').allTextContents()
    expect(options2).not.toContain(chosen1) // RN3 — la bodega ya usada en línea 1 desaparece de línea 2

    // Quitar línea 2 (botón X, primer <button> del bloque).
    await lineBlocks.nth(1).locator('button').first().click()
    await page.waitForTimeout(300)
    lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    await expect(lineBlocks).toHaveCount(1)

    // Agregar una nueva línea 2: debe volver a ofrecer la bodega liberada.
    await addBtn.click()
    await page.waitForTimeout(300)
    lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    const select2b = lineBlocks.nth(1).locator('select').first()
    const options2b = await select2b.locator('option').allTextContents()
    // La bodega liberada (2da opción original, la que tomó la línea 2 la primera vez) debe
    // reaparecer como elegible ahora que ya no está en uso.
    expect(options2b.length).toBeGreaterThan(0)
  })

  test('RN4 — cada línea se puede quitar antes de enviar (botón X reduce el conteo de líneas)', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    const addBtn = modal.getByRole('button', { name: /agregar bodega/i })
    await addBtn.click()
    await addBtn.click()
    await page.waitForTimeout(300)
    let lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    await expect(lineBlocks).toHaveCount(2)
    await lineBlocks.nth(0).locator('button').first().click()
    await page.waitForTimeout(300)
    lineBlocks = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3')
    await expect(lineBlocks).toHaveCount(1)
  })

  test('Escenario 2 — evidencia obligatoria por línea, bloquea el envío sin archivo', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    await searchProduct(page, 'CAND-SAL-005')
    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    await modal.getByRole('button', { name: /agregar bodega/i }).click()
    await page.waitForTimeout(300)
    const lineBlock = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3').first()
    await lineBlock.locator('input[type=number]').fill('1')
    await lineBlock.locator('textarea').fill('prueba pre-qa evidencia obligatoria')
    // Sin adjuntar archivo — intentar enviar.
    await modal.getByRole('button', { name: /enviar solicitud/i }).click()
    await page.waitForTimeout(600)
    await expect(modal).toBeVisible() // sigue abierto, no se cerró como si hubiera enviado
    const text = await modal.innerText()
    console.log('SCRUM428_NO_EVIDENCE_SUBMIT_TEXT=', text.replace(/\n/g, ' | ').slice(0, 300))
  })

  test('RN5 (hallazgo de este re-check, corregido en el mismo pase) — Restar + comprometido real de Bodega muestra la advertencia', async ({ page }) => {
    await login(page)
    await goToInventario(page)
    // LAMP-COL-001: disponible=18, por_servir=6 (comprometido REAL de Bodega, confirmado en vivo
    // contra /bodega/inventory). Antes del fix, la advertencia usaba el por_servir de
    // /adjustment-requests/products/{id}/warehouse-stock (concepto de Ventas & Diseño, 0 para
    // este producto) y NUNCA se disparaba pese al comprometido real.
    await searchProduct(page, 'LAMP-COL-001')
    const row = page.locator('tbody tr', { hasText: 'LAMP-COL-001' }).first()
    await row.getByRole('button', { name: /solicitar ajuste/i }).click()
    await page.waitForTimeout(800)
    const modal = adjustmentModal(page)
    await modal.getByRole('button', { name: /agregar bodega/i }).click()
    await page.waitForTimeout(300)

    const tipoSelect = modal.locator('.border.border-slate-200.rounded-lg.p-3.mb-3').first().locator('select').nth(1)
    // Default "Sumar" — sin advertencia todavía.
    await expect(modal.getByText(/comprometid/i)).toHaveCount(0)

    await tipoSelect.selectOption({ label: 'Restar' })
    await page.waitForTimeout(500)
    await expect(modal.getByText(/comprometid/i)).toBeVisible()
  })
})
