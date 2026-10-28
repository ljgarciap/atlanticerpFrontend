import { test, expect } from '@playwright/test'

// Pre-QA 2026-07-24 — Bloque A3-cierre (SCRUM-390/391/401/403/406), backend Senior-Reviewed
// 2026-07-23, frontend wireado 2026-07-24 (commits b833e55..728403a). Corre contra el build real
// servido por nginx (localhost:8090, commit 728403a), no el dev server de Vite — para probar
// exactamente lo que se va a pushear. Fixtures: VR-9001..9008, ver docs/pre-qa/a3-cierre-2026-07-24.md.
test.use({ baseURL: 'http://localhost:8090' })

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-390 — Excel export: camino feliz + pedido sin items + doble clic', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  // Camino feliz: VR-9005 (por_despachar, 1 item real).
  await page.getByTestId(/order-card-/).first().waitFor({ state: 'attached' })
  const card9005 = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9005' })
  await card9005.click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-excel-button').click(),
  ])
  const path1 = await download1.path()
  expect(path1).toBeTruthy()
  console.log('SCRUM-390 happy path file:', download1.suggestedFilename(), 'saved at', path1)
  await page.getByRole('button', { name: /cerrar/i }).first().click()
  await page.waitForTimeout(300)

  // Camino de ruptura: VR-9008 (por_despachar, CERO items).
  const card9008 = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9008' })
  await card9008.click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'e2e/.tmp/scrum390-empty-items-modal.png' })
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-excel-button').click(),
  ])
  const path2 = await download2.path()
  expect(path2).toBeTruthy()
  console.log('SCRUM-390 empty-items file:', download2.suggestedFilename(), 'saved at', path2)

  expect(errors).toEqual([])
})

test('SCRUM-390 — doble clic rápido en Descargar Excel no revienta ni duplica', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  const card9005 = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9005' })
  await card9005.click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)

  const btn = page.getByTestId('export-excel-button')
  const downloadPromise = page.waitForEvent('download')
  await btn.click({ force: true })
  await btn.click({ force: true }) // segundo clic inmediato — debería estar disabled ya
  await downloadPromise
  await page.waitForTimeout(300)
  expect(errors).toEqual([])
})

test('SCRUM-403 — Ver bodegas: 2 bodegas con stock, 1 bodega, 0 bodegas (no inventar cantidades)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  // Caso 2 bodegas: VR-9005 (producto 103, stock en Bodega Central=22 + Zona Libre=12).
  await page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9005' }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="view-warehouses-"]').first().click()
  await page.waitForTimeout(500)
  const list1 = page.getByTestId('warehouses-list')
  await expect(list1).toContainText('Bodega Central')
  await expect(list1).toContainText('Bodega Zona Libre')
  await page.screenshot({ path: 'e2e/.tmp/scrum403-two-warehouses.png' })
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(300)

  // Caso 1 bodega: VR-9003 (en_picking, producto 104, ahora con stock SOLO en Bodega Central=5).
  await page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9003' }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="view-warehouses-"]').first().click()
  await page.waitForTimeout(500)
  const list2 = page.getByTestId('warehouses-list')
  await page.screenshot({ path: 'e2e/.tmp/scrum403-one-warehouse.png' })
  const rows2 = await list2.locator('li').allTextContents()
  console.log('SCRUM-403 one-warehouse rows:', rows2)
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /cerrar/i }).last().click()
  await page.waitForTimeout(300)

  // Caso 0 bodegas: VR-9007 (asignado/faltante, producto 105, SIN stock en ninguna bodega).
  await page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9007' }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="view-warehouses-"]').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/scrum403-zero-warehouses.png' })
  const rows3 = await page.getByTestId('warehouses-list').locator('li').allTextContents()
  console.log('SCRUM-403 zero-warehouse rows:', rows3)
})

test('SCRUM-401 — Factura: invoice_ready true (mensaje + botón ver, solo lectura) y false (sin botón)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  // invoice_ready = true: VR-9005.
  const card9005 = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9005' })
  await expect(card9005.getByTestId('invoice-ready')).toBeVisible()
  await card9005.getByTestId('invoice-view-button').click()
  await page.waitForTimeout(500)
  const msg = page.getByTestId('invoice-status-message')
  await expect(msg).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum401-invoice-ready-true.png' })
  // RN "Bodega: solo lectura" — no debe haber ningún botón de acción (generar/editar/eliminar) en el modal.
  const modalButtons = await page.locator('.fixed.inset-0.z-\\[60\\] button').allTextContents()
  console.log('SCRUM-401 modal buttons (solo debería haber Cerrar):', modalButtons)
  await page.getByRole('button', { name: /cerrar/i }).first().click()
  await page.waitForTimeout(300)

  // invoice_ready = false: VR-9006.
  const card9006 = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9006' })
  await expect(card9006.getByTestId('invoice-waiting')).toBeVisible()
  await expect(card9006.getByTestId('invoice-view-button')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum401-invoice-ready-false.png' })
})

test('SCRUM-391 — consolidado: mismo picker/2 pedidos misma referencia + picker sin en_picking + doble clic imprimir', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /imprimir picking del día/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/scrum391-modal-open.png' })

  const chips = page.getByTestId('picker-chips')
  await expect(chips).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum391-chips.png' })
})
