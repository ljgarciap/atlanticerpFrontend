import { test, expect } from '@playwright/test'

// Pre-QA — SCRUM-752 (mejora nueva, Daniela Amaya 2026-08-13): columna "Unidades en [bodega]",
// tope real al reubicar, y exclusión total de Zona Libre (ni como destino ni con ninguna acción
// en su propia tabla).
const BASE = 'http://localhost:5173'
const REF = process.env.PREQA752_REF ?? ''

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test.describe.configure({ mode: 'serial' })

test('1. Escenario 3 — columna "Unidades en [bodega]" muestra el valor real de esa bodega, no el global', async ({ page }) => {
  test.skip(REF === '', 'Requiere PREQA752_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/bodegas`)
  await page.waitForTimeout(1200)
  // Bodega Central es la pestaña activa por defecto.
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'e2e/.tmp/preqa752-01-central-unidades.png', fullPage: true })

  const row = page.locator('tr', { hasText: REF })
  await expect(row).toContainText('6') // unidades reales en Central, distinto del stock global (11)
  await expect(page.getByText(/Unidades en Bodega Central/)).toBeVisible()
})

test('2. Escenario 1/2 — Zona Libre: sin acción propia y excluida como destino en otras bodegas', async ({ page }) => {
  test.skip(REF === '', 'Requiere PREQA752_REF')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/bodegas`)
  await page.waitForTimeout(1200)

  // Tabla de Zona Libre: sin ninguna acción para el producto.
  await page.getByRole('button', { name: 'Bodega Zona Libre' }).click()
  await page.waitForTimeout(900)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'e2e/.tmp/preqa752-02-zona-libre-sin-accion.png', fullPage: true })
  const zlRow = page.locator('tr', { hasText: REF })
  await expect(zlRow.getByRole('button')).toHaveCount(0)

  // Desde Bodega Central, el selector de destino de Reubicar nunca ofrece Zona Libre.
  await page.getByRole('button', { name: 'Bodega Central' }).click()
  await page.waitForTimeout(900)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Reubicar' }).click()
  await page.waitForTimeout(500)
  const select = page.locator('select').filter({ hasText: /destino|Showroom|Merma/i }).last()
  const options = await select.locator('option').allTextContents()
  console.log('OPCIONES DE DESTINO:', options)
  expect(options.some(o => o.includes('Zona Libre'))).toBeFalsy()
  await page.screenshot({ path: 'e2e/.tmp/preqa752-03-selector-sin-zona-libre.png', fullPage: true })
})

test('3. Escenario 4 — bloqueo al exceder el máximo real de la bodega de origen', async ({ page }) => {
  test.skip(REF === '', 'Requiere PREQA752_REF')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/bodegas`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Reubicar' }).click()
  await page.waitForTimeout(500)

  const modalTitle = await page.getByText('Reubicar producto').first()
  const modal = modalTitle.locator('xpath=ancestor::*[contains(@class,"rounded-2xl")][1]')
  await modal.locator('select').selectOption({ label: 'Merma' })
  await modal.locator('input[type="number"]').fill('99')
  await modal.locator('textarea').fill('Prueba Pre-QA de tope')
  await modal.getByRole('button', { name: 'Solicitar reubicación' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa752-04-bloqueo-maximo.png', fullPage: true })

  const modalText = await modal.innerText()
  console.log('MODAL TEXT TRAS EXCEDER:', modalText)
  expect(modalText).toMatch(/máxima es de 6 unidades/)
})

test('4. Escenario 5 — envío exitoso dentro del límite real', async ({ page }) => {
  test.skip(REF === '', 'Requiere PREQA752_REF')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/bodegas`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Reubicar' }).click()
  await page.waitForTimeout(500)

  const modalTitle = await page.getByText('Reubicar producto').first()
  const modal = modalTitle.locator('xpath=ancestor::*[contains(@class,"rounded-2xl")][1]')
  await modal.locator('select').selectOption({ label: 'Merma' })
  await modal.locator('input[type="number"]').fill('4')
  await modal.locator('textarea').fill('Prueba Pre-QA dentro del límite')
  await modal.getByRole('button', { name: 'Solicitar reubicación' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/preqa752-05-envio-exitoso.png', fullPage: true })

  // El modal se cierra al confirmar con éxito.
  await expect(page.getByText('Reubicar producto')).not.toBeVisible()
})
