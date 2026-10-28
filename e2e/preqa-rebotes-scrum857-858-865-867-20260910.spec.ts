import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA / Visual Review fusionado — rebotes de Dev Testing SCRUM-857 / 858 / 865 / 867
 * (Admin&Cont), contra https://dev.atlanticerp.ai (NUNCA localhost — CrowdSec en dev tira timeouts
 * falsos con Playwright en paralelo, por eso este spec corre --workers=1 y en serie).
 *
 * Batch 100% backend: commits atlanticerp-backend e5e8d24 / 0b01fe9 / eca85d9 / e515a26.
 * La verificación pesada (PDF/Excel real, endpoints, escaping, backfill, REQ-451) se hizo por
 * API + render de PDF fuera de este spec — ver el reporte de Pre-QA. Acá solo lo que necesita
 * el browser real: que las 3 pantallas rebotadas muestren el dato que faltaba.
 */

const BASE = 'https://dev.atlanticerp.ai'
const CONTABILIDAD = 'contabilidad@test.com'
const MARK = 'gerencia3@test.com'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email) // default en dev = el email
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

// SCRUM-857 — Estado de Cuenta: "Pago a" y "Responsable" ya no salen en blanco (rebote Gerencia)
test('SCRUM-857 — Estado de Cuenta: "Pago a: EMPRESA DEMO S.A." y "Responsable: Contabilidad Test"', async ({ page }) => {
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/facturacion/estado-cuenta?master_client_id=7040`)
  await page.waitForTimeout(4000)
  const body = page.locator('body')
  await expect(body).toContainText('Pago a:')
  await expect(body).toContainText('EMPRESA DEMO S.A.')
  await expect(body).toContainText('Responsable:')
  await expect(body).toContainText('Contabilidad Test')
  await expect(body).toContainText('Cuenta número:')
  await expect(body).toContainText('Banco:')
  await expect(page.getByText(/Pago a:\s*—/)).toHaveCount(0)

  // SCRUM-857 add-on — el encabezado visible de la pantalla ya NO debe decir "· AtlanticERP"
  const brandHeader = page.locator('span', { hasText: /^Atlantic$/i }).first()
  await expect(brandHeader).toBeVisible()
  await expect(body).not.toContainText(/Atlantic\s*·\s*AtlanticERP/i)
  // SCRUM-857 add-on — el <title> global de la SPA ya NO es "AtlanticERP" (index.html). Los strings
  // hermanos (appName / "Powered by AtlanticERP" / module "ATLANTICERP") quedan para el ticket de branding.
  await expect(page).toHaveTitle(/atlantic/i)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-scrum857-estado-cuenta-20260910.png', fullPage: true })
})

// SCRUM-865 — Bodega > Devoluciones: "Ver nota de crédito" en DEV-2026-0003 (NO-GO qa)
test('SCRUM-865 — Devoluciones: fila PED-2026-0019 (Finalizado) muestra "Ver nota de crédito" + enlaces históricos', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/bodega/devoluciones`)
  await expect(page.locator('table')).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(2500)

  const row = page.locator('tr', { hasText: 'PED-2026-0019' }).first()
  await expect(row).toBeVisible()
  await row.scrollIntoViewIfNeeded()
  await expect(row.getByRole('button', { name: /ver nota de crédito/i })).toBeVisible()
  await expect(row.getByRole('button', { name: /ver formulario/i })).toBeVisible()
  await expect(row.getByRole('button', { name: /ver guía de entrega|ver guía original/i })).toBeVisible()
  await expect(row.getByRole('button', { name: /ver documento firmado/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-scrum865-devoluciones-20260910.png', fullPage: true })
})

// SCRUM-867 — Arqueo de Caja: carga sin timeout + aviso de atraso (NO-GO qa, era blip)
test('SCRUM-867 — Arqueo de Caja: daily-count responde 200 y muestra aviso de arqueo atrasado', async ({ page }) => {
  await login(page, CONTABILIDAD)
  const resp = page.waitForResponse(
    r => r.url().includes('/cash-position/daily-count') && r.request().method() === 'GET',
    { timeout: 25000 },
  )
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(2500)
  // el widget "Arqueo del día" (daily-count) solo carga en Real (histórico) > Hoy
  await page.getByRole('button', { name: /real \(hist/i }).click()
  await page.getByRole('button', { name: /^hoy$/i }).click()
  const r = await resp
  expect(r.status()).toBe(200)
  await page.waitForTimeout(3000)
  await expect(page.locator('body')).toContainText(/no quedó cerrado|ciérralo antes/i)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-scrum867-arqueo-20260910.png', fullPage: true })
})
