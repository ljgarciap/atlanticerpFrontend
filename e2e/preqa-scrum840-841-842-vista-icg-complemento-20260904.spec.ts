import { test, expect } from '@playwright/test'

// Pre-QA — SCRUM-840/841/842 complemento en Vista ICG (2026-09-04): pestaña nueva Albaranes de
// Compra (vinculada por Proveedor) + campos nuevos (FE en Facturas, proyecto/promoción en
// Cotizaciones) visibles en la ficha compartida. Datos de prueba sembrados a mano en local
// (usuario preqa-scrum840@atlantic.test, ver sesión 2026-09-04) — descartable, no afecta
// dev/test/prod.
const BASE = 'http://localhost:5173'

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill('preqa-scrum840@atlantic.test')
  await page.locator('input[type="password"]').fill('Password123!')
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('1. Vista ICG muestra la pestaña Albaranes de Compra con ficha por Proveedor', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/migracion/vista`)
  await page.getByText('Albaranes de Compra', { exact: true }).click()
  await page.waitForTimeout(500)

  await expect(page.getByRole('columnheader', { name: 'Proveedor' })).toBeVisible()
  await page.getByText('Preqa Proveedor SCRUM840').click()
  await page.waitForTimeout(500)

  await expect(page.getByText('Preqa Proveedor SCRUM840').first()).toBeVisible()
  await expect(page.getByText('Item Pre-QA')).toBeVisible()
})

test('2. Ficha de Factura muestra el bloque de Facturación Electrónica', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/migracion/vista`)
  await page.getByText('Facturas', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByText('Preqa Cliente SCRUM841').click()
  await page.waitForTimeout(500)

  await expect(page.getByText('Facturación Electrónica')).toBeVisible()
  await expect(page.getByText('aceptado')).toBeVisible()
  await expect(page.getByText('AUTH-PREQA')).toBeVisible()
  await expect(page.getByText('https://dgi.gob.pa/qr/preqa-test')).toBeVisible()
})

test('3. Ficha de Cotización muestra Proyecto/Promoción', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/migracion/vista`)
  await page.getByText('Cotizaciones', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByText('Preqa Cliente SCRUM841').first().click()
  await page.waitForTimeout(500)

  await expect(page.getByText('Torre Preqa')).toBeVisible()
  await expect(page.getByText('Promo840')).toBeVisible()
})
