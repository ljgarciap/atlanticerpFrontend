import { test, expect } from '@playwright/test'

// Pre-QA — rebote SCRUM-427 (Daniela Amaya 2026-08-13): sincronización de estados/notificaciones
// entre Bodega y Compras al confirmar la llegada física de mercancía. Este flujo ya tuvo 1 CRITICO
// real (2026-07-23, RN2 — el modal no refrescaba tras confirmar) y este rebote agrega 2 reglas
// nuevas: la nota de Bodega debe traer cantidad+usuario, y el detalle de Compras debe reflejar el
// estado real de la confirmación de Bodega (antes y después). Se promueve a spec permanente por la
// misma razón que preqa-scrum425-426 — es un gate que ya se rompió una vez en esta pantalla.
//
// Fixture: el producto/orden/línea "Por ingresar" se siembra vía tinker (ver checkpoint de memoria
// de la sesión 2026-08-15) en vez de recrear todo el flujo de Compras por HTTP/UI — la referencia
// real la recibe este spec por env var PREQA427_REF (con fallback a un valor fijo documentado abajo
// para reruns manuales tras volver a sembrar la fixture).
const BASE = 'http://localhost:5173'
const REF = process.env.PREQA427_REF ?? 'PREQA427-FIXTURE-MISSING'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test.describe.configure({ mode: 'serial' })

test('1. Bodega — antes de confirmar, el detalle no muestra nota de espera', async ({ page }) => {
  test.skip(REF === 'PREQA427-FIXTURE-MISSING', 'Requiere PREQA427_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByText(REF, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa427-01-bodega-antes.png', fullPage: true })

  await expect(page.getByRole('button', { name: /confirmar llegada física/i })).toBeVisible()
  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  expect(modalText).not.toContain('esperando')
})

test('2. Bodega — confirma 5 de 8 y la nota enriquecida muestra cantidad + usuario (Esteban Cardenas / Management Demo)', async ({ page }) => {
  test.skip(REF === 'PREQA427-FIXTURE-MISSING', 'Requiere PREQA427_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/bodega/inventario`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByText(REF, { exact: true }).first().click()
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: /confirmar llegada física/i }).click()
  await page.locator('input[type="number"]').fill('5')
  await page.getByRole('button', { name: /confirmar y notificar/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa427-02-bodega-confirmado.png', fullPage: true })

  // RN2 (Fix Pre-QA 2026-07-23) — el botón desaparece de inmediato, SIN cerrar/reabrir el modal.
  await expect(page.getByRole('button', { name: /confirmar llegada física/i })).not.toBeVisible()
  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  console.log('BODEGA MODAL TEXT TRAS CONFIRMAR:', modalText)
  expect(modalText).toContain('5 unidad')
  // El nombre real del usuario "almacen@..." (Esteban Cardenas) no aplica acá porque logueamos
  // como management — el usuario mostrado debe ser el de la sesión que confirmó.
  expect(modalText).toMatch(/Management Demo|Esteban Cardenas/)
})

test('3. Compras — el detalle del mismo producto refleja lo que Bodega ya confirmó (cantidad + usuario), bloqueado de re-confirmar', async ({ page }) => {
  test.skip(REF === 'PREQA427-FIXTURE-MISSING', 'Requiere PREQA427_REF — ver checkpoint de memoria 2026-08-15')
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder*="Buscar" i]').first().fill(REF)
  await page.waitForTimeout(900)
  await page.getByText(REF, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa427-03-compras-detalle.png', fullPage: true })

  const modalText = await page.locator('.fixed.inset-0').first().innerText()
  console.log('COMPRAS MODAL TEXT:', modalText)
  // Debe mostrar el estado sincronizado de Bodega — cantidad + "pendiente ingreso al inventario".
  expect(modalText).toContain('5 unidad')
  expect(modalText.toLowerCase()).toContain('pendiente ingreso al inventario')
  // RN3 (ya vigente, re-chequeada acá) — Compras NUNCA tiene el botón exclusivo de Bodega.
  await expect(page.getByRole('button', { name: /confirmar llegada física/i })).not.toBeVisible()
  // Compras SÍ conserva su propia acción de finalizar el ingreso.
  await expect(page.getByRole('button', { name: /ingresar a inventario/i })).toBeVisible()
})
