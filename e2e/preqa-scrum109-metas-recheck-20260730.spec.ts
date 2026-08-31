import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-109 (daily 2026-07-30, Bloque B): Daniela reportó el 2026-07-27 que el panel
 * Metas seguía mostrando "Sin Meta configurada todavía" para todos los usuarios. Hipótesis:
 * ya resuelto por el fix de SCRUM-146 (2026-07-29/30, VentasDisenoSalesGoalsSeeder + goalsIndex()
 * corregido para usar HomeService::vendors()) — ese trabajo ya se cherry-pickeó a test.atlanticerp.ai.
 * Corre contra test.atlanticerp.ai (mismo entorno donde Daniela probó) con Vendedor Disenador Test 5, una de
 * las 9 vendedoras reales con Meta sembrada.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://test.atlanticerp.ai'
const PAOLA_EMAIL = 'vendedordisenador5@test.com'
const PAOLA_PASS  = 'vendedordisenador5@test.com'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('Paola (vendedora real con Meta sembrada) ve su Meta configurada en Reportes', async ({ page }) => {
  await login(page, PAOLA_EMAIL, PAOLA_PASS)
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/01-reportes-paola.png', fullPage: true })

  await expect(page.getByText(/sin meta configurada/i)).toHaveCount(0)
})
