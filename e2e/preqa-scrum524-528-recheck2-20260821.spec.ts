import { test, expect, Page } from '@playwright/test'

// Re-check COMPLETO tras el fix del hallazgo MAYOR de Pre-QA (InvoiceService::list() no
// proyectaba incobrable_pendiente/anulada_at). Fixtures nuevos sembrados por tinker/API en esta
// misma sesión de re-check (el ambiente local había sido revertido a 0 filas al cerrar la corrida
// anterior, ver docs/pre-qa/scrum524-528-facturacion-batch4-20260821.md sección 0):
//   P (order 372, F-0001) -> incobrable PENDIENTE (Felix propuso via API)
//   N (order 373, F-0002) -> facturada normal, sin flags (control)
//   A (order 374, F-0003) -> anulada_at seteado manualmente (sin flujo real todavía)
// bank_account_id 18 "Banco PreQA Recheck ****9911" creada porque el ambiente volvía a estar en 0
// cuentas bancarias tras el cierre de la corrida anterior.

test.describe.configure({ mode: 'serial' })

const FELIX = 'contabilidad@test.com'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

test('tabla principal (Vista plana) muestra la pastilla "Pendiente de aprobación" para P, no "Facturada"', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck P')
  await page.waitForTimeout(700)

  const row = page.locator('div.cursor-pointer').filter({ hasText: 'Recheck P' }).first()
  await expect(row).toBeVisible()
  // Pastilla renderizada como "Pend. aprobación" (abreviada) en la tabla real -- confirmado
  // visualmente en error-context de una corrida previa de este mismo spec.
  await expect(row.getByText(/pend\.?\s*aprobaci[oó]n/i)).toBeVisible()
  await expect(row.getByText(/^Facturada$/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum524-528-recheck2-pastilla-pendiente-tabla.png', fullPage: true })
})

test('tabla principal muestra "Facturada" lisa para N (control) y estado tachado para A (anulada)', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck N')
  await page.waitForTimeout(700)
  const rowN = page.locator('div.cursor-pointer').filter({ hasText: 'Recheck N' }).first()
  await expect(rowN.getByText(/^Facturada$/)).toBeVisible()

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck A')
  await page.waitForTimeout(700)
  const rowA = page.locator('div.cursor-pointer').filter({ hasText: 'Recheck A' }).first()
  await expect(rowA.getByText(/anulada/i)).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-recheck2-pastillas-control-anulada.png', fullPage: true })
})

test('P sigue en la pestaña "Cartera cobrable" (RN3 REQ-448 — pendiente no se mueve a incobrable)', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck P')
  await page.waitForTimeout(700)
  await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Recheck P' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Cartera incobrable' }).click()
  await page.waitForTimeout(700)
  await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Recheck P' })).toHaveCount(0)
})

test('filtro por estado (dropdown UI) sigue funcionando para facturada -- incluye P y N, no rompió nada existente', async ({ page }) => {
  // NOTA (hallazgo menor, no bloqueante -- ver documento de Pre-QA): el <select> de este filtro en
  // FacturacionPage.tsx (línea ~219) solo ofrece ['pendiente-facturar', 'facturada'] como
  // <option> -- 'anulada' nunca se agregó a esa lista pese a que list() ya lo devuelve y el AC de
  // ningún ticket de este batch exige un filtro de UI para "anulada" explícitamente (mismo
  // criterio ya aceptado para el MENOR original: no hay flujo real que genere anuladas todavía).
  // El filtro `estado=anulada` SÍ funciona correctamente a nivel API (verificado por curl directo
  // en esta misma sesión de re-check) -- solo no es alcanzable desde este dropdown de la UI.
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck')
  await page.waitForTimeout(700)

  const estadoSelect = page.locator('select').filter({ has: page.locator('option[value="facturada"]') }).first()
  await estadoSelect.selectOption('facturada')
  await page.waitForTimeout(700)
  await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Recheck N' })).toHaveCount(1)
  await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Recheck P' })).toHaveCount(1)
  await expect(page.locator('div.cursor-pointer').filter({ hasText: 'Recheck A' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum524-528-recheck2-filtro-estado.png', fullPage: true })
})

test('bloque de pago (Cuenta número/Responsable) sigue en el PDF real -- confirmación de e91c09a', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="Buscar por cliente"]').fill('Recheck N')
  await page.waitForTimeout(700)
  await page.locator('div.cursor-pointer').filter({ hasText: 'Recheck N' }).first().click()
  await expect(page.getByRole('heading', { name: 'Detalle' })).toBeVisible()
  await page.waitForTimeout(500)

  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Detalle' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /Ver \/ Imprimir PDF/i }).click(),
  ])
  const pdfPath = 'test-results/scrum524-528-recheck2-pdf-n.pdf'
  await download.saveAs(pdfPath)
  const { execSync } = await import('child_process')
  const text = execSync(`pdftotext -layout "${pdfPath}" -`).toString('utf-8')
  expect(text).toContain('Cuenta número')
  expect(text).toContain('Banco PreQA Recheck ****9911')
  expect(text).toContain('Responsable')
  expect(text).toContain('Felix')
})
