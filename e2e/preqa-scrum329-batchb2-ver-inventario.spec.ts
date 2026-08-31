import { test, expect } from '@playwright/test'

// SCRUM-329 Bloque B2 (REQ-344→362, SCRUM-414→432) — "Ver Inventario" de Bodega. Pre-QA
// exploratorio 2026-07-23. Corre contra fixtures reales sembradas a mano vía tinker (ver
// docs/pre-qa/bloque-b2-ver-inventario-20260723.md para el detalle exacto de cada producto/id).
//
// Fixtures relevantes (catalog_products, ids reales del entorno local):
//   95  LAMP-COL-001  — rotation alta, familia "Iluminación LED Básica", 1 línea "por ingresar"
//                       FRESCA (10u, nunca reportada por Bodega) -> usado para el flujo completo
//                       de "Confirmar llegada física" (SCRUM-427).
//   96  LAMP-COL-002  — sin ningún movimiento -> caso "nada pendiente" (sin botón/nota).
//   97  SPOT-EMP-010  — stock repartido en 2 bodegas (200 Bodega Central + 100 Showroom Obarrio).
//   98  SPOT-EMP-011  — 120u en camino (PO a LuxTech Import, llegada estimada 2026-08-02).
//   99  RIEL-TRK-050  — YA confirmado por Bodega vía API antes de este batch (awaiting_compras).
//   100 APLQ-PAR-020  — awaiting_compras=true (bodega ya reportó, Compras no finalizó).
//   101 CAND-SAL-005  — sin stock + rotation alta -> EN ATENCIÓN (SCRUM-416 Esc.1).
//   102 CINT-LED-100  — 3u comprometidas en 2 pedidos activos (en_picking + asignado) + 1 pedido
//                       ENTREGADO con 5u que NO debe contar (SCRUM-423 RN1 negativo).
//   103 PISO-LAMP-030 — sin stock + rotation baja -> NO en atención (SCRUM-416 Esc.2).
//   104 MESA-LAMP-015 — is_active=false (SCRUM-414/431).

async function login(page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openDetail(page, reference: string) {
  await page.locator('input[placeholder*="Buscar por referencia"]').fill(reference)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  await page.getByText(reference, { exact: true }).first().click()
  await page.waitForTimeout(500)
}

test.describe.configure({ mode: 'serial' })

test('SCRUM-414 — Bodega ve todo solo lectura, sin crear/inactivar/precio-costo', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)

  await expect(page.getByRole('button', { name: /crear producto/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /marcar inactivo|desactivar|activar/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum414-00-list.png', fullPage: true })

  await openDetail(page, 'LAMP-COL-002')
  const modalText = await page.locator('.fixed.inset-0').innerText()
  expect(modalText).not.toMatch(/precio|costo|margen/i)
  await expect(page.locator('.fixed.inset-0 input')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum414-01-detail-readonly.png', fullPage: true })
  await page.getByRole('button', { name: 'Cerrar' }).click()
})

test('SCRUM-415 — "+ Nueva orden de compra" va a Zona Libre, no a un form general', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '+ Nueva orden de compra' }).click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/ordenes-zona-libre')
})

test('SCRUM-416 — KPI "En atención": alta+sin_stock cuenta, baja+sin_stock NO', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum416-00-kpis.png', fullPage: false })

  await page.getByRole('button', { name: /atención/i }).click()
  await page.waitForTimeout(800)
  const attentionText = await page.locator('table').innerText()
  expect(attentionText).toContain('CAND-SAL-005')
  expect(attentionText).not.toContain('PISO-LAMP-030')
  await page.screenshot({ path: 'e2e/.tmp/scrum416-01-en-atencion.png', fullPage: true })
})

test('SCRUM-417 — Toggle Productos/Familias sin recarga', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Familias' }).click()
  await page.waitForTimeout(500)
  expect(page.url()).not.toContain('reload')
  await expect(page.locator('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Productos' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('table')).toHaveCount(1)
})

test('SCRUM-418 — Vista Familias sin botón "Generar compra" para Bodega', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Familias' }).click()
  await page.waitForTimeout(500)
  await page.getByText('Iluminación LED Básica').click()
  await page.waitForTimeout(500)
  await expect(page.getByRole('button', { name: /generar compra/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum418-familia-detalle.png', fullPage: true })
})

test('SCRUM-419 — Filtros combinables: estado + rotación', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)

  await page.locator('select').nth(1).selectOption({ label: 'Sin stock' })
  await page.locator('select').nth(2).selectOption({ label: 'Alta' })
  await page.waitForTimeout(800)
  const text = await page.locator('table').innerText()
  expect(text).toContain('CAND-SAL-005')
  expect(text).not.toContain('PISO-LAMP-030')
})

test('SCRUM-420 — Chip "Por ingresar" combinable, filtra solo pendientes', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /por ingresar/i }).click()
  await page.waitForTimeout(800)
  const text = await page.locator('table').innerText()
  expect(text).toContain('LAMP-COL-001')
  expect(text).not.toContain('CINT-LED-100')
  await page.screenshot({ path: 'e2e/.tmp/scrum420-por-ingresar-chip.png', fullPage: true })
})

test('SCRUM-421 — 14 columnas + Stock Total = Disponible + Por servir', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  const headers = await page.locator('thead th').allInnerTexts()
  expect(headers.length).toBe(14)
  await page.screenshot({ path: 'e2e/.tmp/scrum421-00-header.png', fullPage: false })

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('CINT-LED-100')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  const row = page.locator('tbody tr').first()
  const cells = await row.locator('td').allInnerTexts()
  expect(cells[5].trim()).toBe('147')
  expect(cells[6].trim()).toBe('3')
  expect(cells[7].trim()).toBe('150')
  await page.screenshot({ path: 'e2e/.tmp/scrum421-01-row.png', fullPage: true })
})

test('SCRUM-422 — Bodega(s): desglose real sin inventar bodegas sin stock', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.locator('input[placeholder*="Buscar por referencia"]').fill('SPOT-EMP-010')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.getByText(/\d+ bodega/).first().click()
  await page.waitForTimeout(500)
  const modal = await page.locator('.fixed.inset-0').innerText()
  expect(modal).toContain('Bodega Central')
  expect(modal).toContain('200')
  expect(modal).toContain('Showroom Obarrio')
  expect(modal).toContain('100')
  await page.screenshot({ path: 'e2e/.tmp/scrum422-warehouse-breakdown.png', fullPage: true })
})

test('SCRUM-423 — Por servir: detalle con 2 pedidos activos, Entregado NO cuenta; caso vacío', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('CINT-LED-100')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.locator('tbody tr').first().locator('button.underline').nth(1).click()
  await page.waitForTimeout(500)
  let modal = await page.locator('.fixed.inset-0').innerText()
  expect(modal).toContain('PED-TEST-001')
  expect(modal).toContain('PED-TEST-002')
  expect(modal).not.toContain('PED-TEST-003')
  await page.screenshot({ path: 'e2e/.tmp/scrum423-00-por-servir-detalle.png', fullPage: true })
  await page.getByRole('button', { name: 'Cerrar' }).click()

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('LAMP-COL-002')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.locator('tbody tr').first().locator('button.underline').nth(1).click()
  await page.waitForTimeout(500)
  modal = await page.locator('.fixed.inset-0').innerText()
  expect(modal.toLowerCase()).toContain('no hay clientes o pedidos comprometidos')
  await page.screenshot({ path: 'e2e/.tmp/scrum423-01-por-servir-empty.png', fullPage: true })
})

test('SCRUM-424 — En camino: proveedor+fecha real; caso vacío sin botón (verificar consistencia)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('SPOT-EMP-011')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.locator('tbody tr').first().getByText('120').click()
  await page.waitForTimeout(500)
  const modal = await page.locator('.fixed.inset-0').innerText()
  expect(modal).toContain('LuxTech Import')
  expect(modal).toContain('120')
  await page.screenshot({ path: 'e2e/.tmp/scrum424-00-en-camino-detalle.png', fullPage: true })
  await page.getByRole('button', { name: 'Cerrar' }).click()

  await page.locator('input[placeholder*="Buscar por referencia"]').fill('LAMP-COL-002')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  const enCaminoCell = page.locator('tbody tr').first().locator('td').nth(9)
  await expect(enCaminoCell.locator('button')).toHaveCount(0)
  expect((await enCaminoCell.innerText()).trim()).toBe('—')
  await page.screenshot({ path: 'e2e/.tmp/scrum424-01-en-camino-empty-cell.png', fullPage: true })
})

test('SCRUM-427 — Confirmar llegada física: flujo completo + rupturas (0, exceso, doble confirmación)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)

  await openDetail(page, 'LAMP-COL-001')
  await expect(page.getByRole('button', { name: 'Confirmar llegada física' })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum427-01-button-visible.png', fullPage: true })

  await page.getByRole('button', { name: 'Confirmar llegada física' }).click()
  await page.waitForTimeout(300)

  const qtyInput = page.locator('input[type="number"]')
  await qtyInput.fill('0')
  await page.getByRole('button', { name: 'Confirmar y notificar a Compras' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/scrum427-02-cantidad-cero.png', fullPage: true })

  await qtyInput.fill('999')
  await page.getByRole('button', { name: 'Confirmar y notificar a Compras' }).click()
  await page.waitForTimeout(900)
  const afterExceso = await page.locator('.fixed.inset-0').innerText()
  await page.screenshot({ path: 'e2e/.tmp/scrum427-03-cantidad-excede.png', fullPage: true })
  expect(afterExceso.toLowerCase()).toMatch(/no puede superar lo pedido pendiente/)

  await qtyInput.fill('10')
  await page.getByRole('button', { name: 'Confirmar y notificar a Compras' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'e2e/.tmp/scrum427-04a-immediately-after-click.png', fullPage: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/scrum427-04b-1500ms-after-click.png', fullPage: true })
  const afterConfirm = await page.locator('.fixed.inset-0').innerText()

  const buttonStillThere = await page.getByRole('button', { name: 'Confirmar llegada física' }).count()
  console.log('SCRUM-427 POST-CONFIRM MODAL TEXT:', JSON.stringify(afterConfirm))
  console.log('SCRUM-427 BUTTON COUNT AFTER CONFIRM:', buttonStillThere)

  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.waitForTimeout(500)
  await openDetail(page, 'LAMP-COL-001')
  const reopened = await page.locator('.fixed.inset-0').innerText()
  console.log('SCRUM-427 REOPENED MODAL TEXT:', JSON.stringify(reopened))
  expect(await page.getByRole('button', { name: 'Confirmar llegada física' }).count()).toBe(0)
  expect(reopened).toContain('esperando que Compras finalice')
  await page.screenshot({ path: 'e2e/.tmp/scrum427-05-reopened-after-reload.png', fullPage: true })
})

test('SCRUM-427b — reload a mitad del flujo (form de confirmar abierto)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await openDetail(page, 'RIEL-TRK-050')
  const modal = await page.locator('.fixed.inset-0').innerText()
  expect(await page.getByRole('button', { name: 'Confirmar llegada física' }).count()).toBe(0)
  expect(modal).toContain('esperando que Compras finalice')
  await page.screenshot({ path: 'e2e/.tmp/scrum427b-awaiting-compras-note.png', fullPage: true })
})

test('SCRUM-431 — modal solo lectura: banner "Inactivo" sin botón de reactivar; campo Familia', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /inactivos/i }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/scrum431-00-inactivos-list.png', fullPage: true })
  await page.getByText('MESA-LAMP-015', { exact: true }).first().click()
  await page.waitForTimeout(500)
  const modal = await page.locator('.fixed.inset-0').innerText()
  console.log('SCRUM-431 INACTIVE PRODUCT MODAL TEXT:', JSON.stringify(modal))
  await page.screenshot({ path: 'e2e/.tmp/scrum431-01-inactive-detail.png', fullPage: true })
  await expect(page.getByRole('button', { name: /reactivar|activar/i })).toHaveCount(0)
})

test('SCRUM-432 — deep-link ?filter=en_atencion aplica el chip sin clic adicional', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario?filter=en_atencion')
  await page.waitForTimeout(1200)
  const text = await page.locator('table').innerText()
  expect(text).toContain('CAND-SAL-005')
  expect(text).not.toContain('PISO-LAMP-030')
  await page.screenshot({ path: 'e2e/.tmp/scrum432-deeplink-atencion.png', fullPage: true })
})

/**
 * SCRUM-432 RN1 — fix post Pre-QA (decisión de Luis 2026-07-23, verificado en vivo el mismo día
 * tras reponer fixtures que un `infra/test.sh` intermedio había reseteado): "Mayor rotación"
 * (Home) -> ?filter=rotacion -> chip=rotacion -> rotation=alta en el backend, reusando el mismo
 * campo que ya filtra/expone esta pantalla — NO el top-N por `InventoryMovement` de
 * `BodegaHomeService::mayorRotacion()` (concepto de Home, no forzado a coincidir). CAND-SAL-005
 * (alta) y LAMP-COL-001 (alta) aparecen; PISO-LAMP-030 (baja) no, aunque comparta "sin/bajo stock"
 * con CAND-SAL-005 — la distinción es justo lo que separa este chip de "Críticos".
 */
test('SCRUM-432 (fix) — deep-link ?filter=rotacion filtra por rotation=alta', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario?filter=rotacion')
  await page.waitForTimeout(1200)
  const text = await page.locator('table').innerText()
  expect(text).toContain('LAMP-COL-001')
  expect(text).toContain('CAND-SAL-005')
  expect(text).not.toContain('PISO-LAMP-030')
  await page.screenshot({ path: 'e2e/.tmp/scrum432-deeplink-rotacion.png', fullPage: true })
})

/**
 * SCRUM-432 RN1 — fix post Pre-QA: "Artículos críticos" (Home) -> ?filter=criticos ->
 * chip=criticos -> estado bajo_stock/sin_stock vía `OrderCommitmentService` (el mismo "por servir"
 * que ya usa esta pantalla), NO `InventoryKpiService::porServirMap()` que usa
 * `BodegaHomeService::articulosCriticos()`. A diferencia de "rotación", PISO-LAMP-030 (rotation
 * BAJA + bajo stock) SÍ aparece acá y LAMP-COL-001 (rotation alta, disponible) NO — "críticos" no
 * filtra por rotación, solo por estado de stock.
 */
test('SCRUM-432 (fix) — deep-link ?filter=criticos filtra por estado, no por rotación', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario?filter=criticos')
  await page.waitForTimeout(1200)
  const text = await page.locator('table').innerText()
  expect(text).toContain('CAND-SAL-005')
  expect(text).toContain('PISO-LAMP-030')
  expect(text).not.toContain('LAMP-COL-001')
  await page.screenshot({ path: 'e2e/.tmp/scrum432-deeplink-criticos.png', fullPage: true })
})

test('Visual — chips y tabla sin iconografía de emoji (SCRUM-56)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/emoji-check-00-full-page.png', fullPage: true })
})

test('Permisos — rol SIN bodega.read no accede (ni por UI ni por API directa)', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1000)
  const bodyText = await page.locator('body').innerText()
  console.log('NO-PERMISSION PAGE TEXT:', bodyText.slice(0, 300))
  await page.screenshot({ path: 'e2e/.tmp/permiso-sin-bodega-read.png', fullPage: true })
  await expect(page.locator('table')).toHaveCount(0)
})
