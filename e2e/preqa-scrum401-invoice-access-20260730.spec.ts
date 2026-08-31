import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-401 (daily 2026-07-30): Marly (QA) reportó el 2026-07-26 no encontrar ningún
 * acceso al documento Factura desde el tablero de Bodega > Pedidos. Re-verificado en vivo contra
 * dev.atlanticerp.ai: el botón "Ver factura" SÍ existe y es visible hoy en pedidos con
 * invoice_ready=true (Despachado/Entregado) — ver hallazgo en el comentario de Jira. Este spec
 * queda como test permanente del acceso real, no solo de que el código lo contempla.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const ESTEBAN_EMAIL = 'liderbodega@test.com'
const ESTEBAN_PASS  = 'liderbodega@test.com'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('el botón "Ver factura" abre el modal con el mensaje de estado real', async ({ page }) => {
  await login(page, ESTEBAN_EMAIL, ESTEBAN_PASS)
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(2000)

  await expect(page.getByTestId('invoice-view-button').first()).toBeVisible({ timeout: 8000 })
  await page.getByTestId('invoice-view-button').first().click()
  await page.waitForTimeout(500)

  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum401/04-modal-factura.png' })
  await expect(page.getByRole('heading', { name: /^factura/i })).toBeVisible()
  await expect(page.getByText(/pendiente de generaci[oó]n real por administraci[oó]n/i)).toBeVisible()
})
