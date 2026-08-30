import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-138 (daily 2026-07-30, Bloque C): Daniela pidió que el texto de
 * Condiciones (REQ-046) se pueda cambiar una vez y aplique a toda cotización NUEVA
 * desde ese momento, en vez de editarse cotización por cotización. Reemplaza el
 * textarea editable por-cotización (gateado por `ventas_diseno.edit.conditions`) por
 * un default global (QuoteConditionsSettings, panel "Configurar condiciones") — las
 * cotizaciones ya generadas conservan su propio texto congelado.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const MARK_EMAIL = 'mbekhar@illuminations.com.pa'
const MARK_PASS  = 'B1n4X_2026?'
const DANIELA_EMAIL = 'daniela@illuminations.com.pa'
const DANIELA_PASS  = 'B1n4X_2026?'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('sin el permiso edit.conditions no se ve el botón Configurar condiciones, y el texto es de solo lectura', async ({ page }) => {
  await login(page, DANIELA_EMAIL, DANIELA_PASS)
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await page.waitForTimeout(2000)

  await expect(page.getByRole('button', { name: 'Configurar condiciones' })).toHaveCount(0)
  await expect(page.locator('textarea[disabled]').last()).toBeVisible()
})

test('con el permiso, cambiar el default global aplica solo a cotizaciones nuevas', async ({ page }) => {
  await login(page, MARK_EMAIL, MARK_PASS)
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await page.waitForTimeout(2000)

  const toggle = page.getByRole('button', { name: 'Configurar condiciones' })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await page.waitForTimeout(500)

  const marker = `PRE-QA SCRUM-138 ${Date.now()}`
  const configTextarea = page.locator('textarea:not([disabled])').first()
  await configTextarea.fill(marker)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.waitForTimeout(1500)

  // Cotización nueva — debe traer el marcador recién guardado, de solo lectura.
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await page.waitForTimeout(2000)
  await expect(page.locator('textarea[disabled]').last()).toHaveValue(marker)
})
