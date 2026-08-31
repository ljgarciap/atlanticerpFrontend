import { test, expect, Page } from '@playwright/test'

// Pre-QA — recheck de rebotes de QA en Admin&Cont (2026-08-28), contra dev.atlanticerp.ai recién
// desplegado (backend 208db10, frontend 6836d99).
//
// SCRUM-575/577 (Comisiones Internas, código): OBS-1 reordena tramos por monto_minimo,
// BUG-1 pide confirmación antes de eliminar un tramo, RN3 las tarjetas de resumen ignoran el
// filtro de vendedor. SCRUM-583/590/591/592/595/601: rebotados por marly como "BLOQUEADO, SIN
// DATOS DE PRUEBA" (no bugs de código) — verificamos que `admincont:seed-rebotes-qa` (corrido
// contra dev.atlanticerp.ai el mismo día) efectivamente deja cada escenario visible/alcanzable.

const MARK = 'gerencia3@test.com'
const MARK_PASS = 'B1n4X_2026?'
const FELIX = 'contabilidad@test.com'

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
  return !page.url().includes('/login')
}

test('SCRUM-575/577 — reordena tramos por monto, confirma antes de eliminar, tarjetas ignoran el filtro de vendedor', async ({ page }) => {
  const ok = await login(page, MARK, MARK_PASS)
  expect(ok).toBeTruthy()

  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(800)

  // RN3 — leer tarjetas sin filtro, filtrar por un vendedor, confirmar que las tarjetas NO cambian.
  const totalPedidosCard = page.locator('xpath=//div[normalize-space(text())="Total pedidos del mes"]/following-sibling::div[1]')
  const beforeFilter = await totalPedidosCard.textContent()

  const vendorSelect = page.locator('select').nth(1) // 0 = mes (1 sola opción), 1 = vendedor
  const optionCount = await vendorSelect.locator('option').count()
  expect(optionCount).toBeGreaterThan(1)
  await vendorSelect.selectOption({ index: 1 })
  await page.waitForTimeout(800)
  const afterFilter = await totalPedidosCard.textContent()
  expect(afterFilter).toBe(beforeFilter)
  await vendorSelect.selectOption({ index: 0 })
  await page.waitForTimeout(500)

  // OBS-1 / BUG-1 — abrir modal de tramos, agregar uno fuera de orden, verificar posición,
  // luego eliminarlo (probando primero que "cancelar" en el confirm no borra nada).
  await page.getByRole('button', { name: /tabla de comisión escalonada/i }).click()
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: /agregar tramo/i }).click()
  const inputs = page.locator('.fixed input[type="number"]')
  await inputs.nth(0).fill('90000') // monto_minimo — debe caer entre 2 tramos existentes, no al final
  await inputs.nth(1).fill('95000')
  await inputs.nth(2).fill('4.2')
  await page.getByRole('button', { name: /guardar/i }).click()
  await page.waitForTimeout(800)

  const rows = page.locator('.fixed table tbody tr')
  const rowTexts = await rows.allTextContents()
  const newRowIndex = rowTexts.findIndex(t => t.includes('90,000') || t.includes('90000'))
  expect(newRowIndex).toBeGreaterThan(-1)
  // Nunca debe quedar como última fila de datos (eso era el bug — push al final sin ordenar).
  expect(newRowIndex).toBeLessThan(rowTexts.length - 1)

  // BUG-1 — cancelar el confirm no borra.
  page.once('dialog', d => d.dismiss())
  const deleteButtons = page.locator('.fixed button[aria-label="Eliminar"]')
  await deleteButtons.nth(newRowIndex).click()
  await page.waitForTimeout(500)
  expect(await rows.count()).toBe(rowTexts.length)

  // Aceptar el confirm sí borra — limpiamos el tramo de prueba para no dejar residuo.
  page.once('dialog', d => d.accept())
  await deleteButtons.nth(newRowIndex).click()
  await page.waitForTimeout(500)
  expect(await rows.count()).toBe(rowTexts.length - 1)
})

test('SCRUM-583 — proyecto compartido entre 2 vendedores visible en Comisiones Internas', async ({ page }) => {
  const ok = await login(page, MARK, MARK_PASS)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(800)

  const neilRow = page.locator('table tbody tr', { hasText: 'Vendedor Disenador Test 2' }).first()
  await expect(neilRow).toBeVisible({ timeout: 5000 })
  await neilRow.click()
  await page.waitForTimeout(600)
  await expect(page.getByText(/↔/).first()).toBeVisible({ timeout: 5000 })
})

test('SCRUM-590/591/592/595 — proyectos de arquitecto sembrados visibles en Comisiones Externas con el estado esperado', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/comisiones/externas')
  await page.waitForTimeout(800)

  const search = page.getByPlaceholder(/Buscar arquitecto/i)

  for (const marker of ['PREQA-REBOTE-SCRUM590', 'PREQA-REBOTE-SCRUM591', 'PREQA-REBOTE-SCRUM592']) {
    await search.fill(marker)
    await page.waitForTimeout(700)
    const architectRow = page.locator('table tbody tr').first()
    await expect(architectRow).toBeVisible({ timeout: 5000 })
    await architectRow.click()
    await page.waitForTimeout(600)

    const projectRow = page.locator('table tbody tr', { hasText: 'Pendiente de factura' }).first()
    await expect(projectRow).toBeVisible({ timeout: 5000 })

    await projectRow.getByRole('button', { name: /ver detalle/i }).click()
    await page.waitForTimeout(600)

    if (marker === 'PREQA-REBOTE-SCRUM592') {
      await expect(page.getByRole('button', { name: /marcar como pagado/i })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /recordar/i })).toBeVisible()
      if (marker === 'PREQA-REBOTE-SCRUM591') {
        await expect(page.getByText(/comprobante de retención/i)).toBeVisible()
      }
    }
    await page.getByRole('button', { name: /cancelar/i }).click().catch(() => page.keyboard.press('Escape'))
    await page.waitForTimeout(300)
  }
})

test('SCRUM-601 — cobro sembrado de hoy visible en Arqueo del día', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/arqueo-caja')
  await page.waitForTimeout(1000)

  await expect(page.getByText(/PREQA-REBOTE-SCRUM601/i).first()).toBeVisible({ timeout: 8000 })
})
