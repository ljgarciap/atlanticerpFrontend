import { test, expect } from '@playwright/test'

// Pre-QA — rebote SCRUM-431 (Daniela Amaya 2026-08-13): reescritura del modal "Detalle del
// producto" (Bodega > Ver Inventario) en 2 bloques exactos del mockup, con toda la fila
// clickeable. Esta pantalla ya tuvo hallazgos reales en el Pre-QA original (2026-07-23, RN1 —
// sin aviso de inactivo; RN2 — etiqueta "Familia" reusada de "Categoría") — se promueve a spec
// permanente por el mismo criterio que preqa-scrum427/425-426.
const BASE = 'http://localhost:5173'
const REF = process.env.PREQA431_REF ?? 'PREQA431-FIXTURE-MISSING'
const REF_INACTIVE = process.env.PREQA431_REF_INACTIVE ?? 'PREQA431-INACTIVE-FIXTURE-MISSING'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openDetail(page, ref: string) {
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(ref)
  await page.waitForTimeout(900)
}

test.describe.configure({ mode: 'serial' })

test('1. Escenario 1 — clic en cualquier parte de la fila (no solo el nombre) abre el detalle', async ({ page }) => {
  test.skip(REF === 'PREQA431-FIXTURE-MISSING', 'Requiere PREQA431_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@illuminations.test')
  await openDetail(page, REF)

  // Clic en la celda de Categoría/Familia (columna que antes NO abría el modal).
  const row = page.locator('tr', { hasText: REF })
  await row.locator('td').nth(3).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa431-01-row-click-opens.png', fullPage: true })
  await expect(page.getByText('Lámpara colgante Nordic 40cm')).toBeVisible()
})

test('2. Escenario 2/3/4 — encabezado nombre+categoría, indicadores en 4 columnas, Bloque 2 completo (barcode/descripción antes ausentes)', async ({ page }) => {
  test.skip(REF === 'PREQA431-FIXTURE-MISSING', 'Requiere PREQA431_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@illuminations.test')
  await openDetail(page, REF)
  await page.getByText(REF, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa431-02-detalle-2-bloques.png', fullPage: true })

  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  const modalTextUpper = modalText.toUpperCase()
  console.log('MODAL TEXT SCRUM-431:', modalText)

  // Encabezado: nombre grande + categoría debajo, NO el título genérico.
  expect(modalText).toContain('Lámpara colgante Nordic 40cm')
  expect(modalText).toContain('Candelabros y Colgantes')
  expect(modalText).not.toContain('Detalle del producto\n')

  // Bloque 1 — indicadores. Las etiquetas se renderizan en mayúscula por CSS (uppercase),
  // `innerText` de un browser real refleja ese text-transform — comparar en mayúscula.
  for (const label of ['ROTACIÓN', 'ESTADO', 'PROVEEDOR', 'STOCK MÍNIMO', 'DISPONIBLE', 'POR SERVIR', 'STOCK TOTAL', 'POR INGRESAR', 'EN CAMINO']) {
    expect(modalTextUpper).toContain(label)
  }

  // Bloque 2 — "Información del producto" con TODOS los campos, incluidos los 3 que faltaban.
  expect(modalText).toContain('Información del producto')
  expect(modalTextUpper).toContain('REF. FÁBRICA')
  expect(modalTextUpper).toContain('REF. PÚBLICA')
  expect(modalTextUpper).toContain('MARCA')
  expect(modalTextUpper).toMatch(/CÓDIGO DE BARRAS/)
  expect(modalText).toContain('NL-40C-001')
  expect(modalText).toMatch(/74192837/) // barcode sembrado
  expect(modalTextUpper).toContain('DESCRIPCIÓN')
  expect(modalText).toContain('Lámpara colgante estilo nórdico')
  expect(modalText).toContain('Ver ficha técnica')

  // Sin precio/costo, nunca (RN3, ya vigente).
  expect(modalText.toLowerCase()).not.toMatch(/costo|margen|precio de venta/)
})

test('3. RN1 — producto inactivo muestra el aviso, sin botón de reactivar, tras el rediseño', async ({ page }) => {
  test.skip(REF_INACTIVE === 'PREQA431-INACTIVE-FIXTURE-MISSING', 'Requiere PREQA431_REF_INACTIVE')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(1200)
  // Los inactivos solo se listan bajo el chip "Inactivos" (index() filtra is_active=true por
  // defecto) — sin esto la búsqueda nunca encuentra el producto.
  await page.getByRole('button', { name: 'Inactivos' }).click()
  await page.waitForTimeout(900)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF_INACTIVE)
  await page.waitForTimeout(900)
  await page.getByText(REF_INACTIVE, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa431-03-inactivo.png', fullPage: true })

  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  expect(modalText).toContain('Este producto está marcado como Inactivo por Compras')
  await expect(page.getByRole('button', { name: /reactivar/i })).not.toBeVisible()
})

test('4. RN4 — sin categoría/familia asignada muestra fallback, nunca "undefined"', async ({ page }) => {
  test.skip(REF_INACTIVE === 'PREQA431-INACTIVE-FIXTURE-MISSING', 'Requiere PREQA431_REF_INACTIVE')
  await login(page, 'management@illuminations.test')
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Inactivos' }).click()
  await page.waitForTimeout(900)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF_INACTIVE)
  await page.waitForTimeout(900)
  await page.getByText(REF_INACTIVE, { exact: true }).first().click()
  await page.waitForTimeout(600)

  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  expect(modalText).not.toMatch(/undefined|null/i)
  expect(modalText).toContain('Un producto puede no tener familia asignada.')
})

test('5. Sin iconografía de emoji en el modal rediseñado (SCRUM-56)', async ({ page }) => {
  test.skip(REF === 'PREQA431-FIXTURE-MISSING', 'Requiere PREQA431_REF')
  await login(page, 'management@illuminations.test')
  await openDetail(page, REF)
  await page.getByText(REF, { exact: true }).first().click()
  await page.waitForTimeout(600)

  const modalHtml = await page.locator('.fixed.inset-0').first().innerHTML()
  // eslint-disable-next-line no-misleading-character-class
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(modalHtml)).toBeFalsy()
})
