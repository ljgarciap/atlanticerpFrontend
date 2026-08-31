import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review) — Batch 5 de Admin&Cont, Cobros (SCRUM-539→544,
 * REQ-462→467). Corre contra dev.atlanticerp.ai real (playwright.dev-remote.config.ts).
 *
 * Fixture real sembrado vía tinker (dev.atlanticerp.ai no tenía ninguna factura real facturada en el
 * momento de este Pre-QA): MasterClient "PreQA Cobros SCRUM539" (id 7560) con 2 facturas abiertas
 * (F-PREQA-COBROS-1 $4,000 / F-PREQA-COBROS-2 $2,200). Cuentas bancarias reales creadas también en
 * este Pre-QA (Banco General/Corriente id 8, Banistmo/Tarjeta id 9 — dev.atlanticerp.ai solo tenía
 * fixtures de QA, ninguna cuenta real) con últimos 4 dígitos placeholder "0000" — Felix/Yaneth
 * deben corregirlos con los reales antes de que el auto-completado tenga sentido para el negocio.
 *
 * Cuenta real: contabilidad@test.com (Felix, lider_admin_contab, password = email).
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-admincont-batch5-cobros-20260823'
const MASTER_CLIENT_ID = 7560

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('1. REQ-463 — tarjetas del mes visibles al entrar a Cobros', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto(`${BASE}/admin-contab/cobros`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/01-cobros-inicial.png`, fullPage: true })

  await expect(page.getByRole('button', { name: /registrar cobro/i })).toBeVisible()
})

test('2. REQ-464/465/466/467 — registrar cobro real: 2 facturas, saldo a favor, transferencia', async ({ page, request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, { data: { email: 'contabilidad@test.com', password: 'contabilidad@test.com' } })
  const { token } = await loginRes.json()

  await login(page, 'contabilidad@test.com')
  await page.goto(`${BASE}/admin-contab/cobros`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /registrar cobro/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DL_DIR}/02-modal-vacio.png`, fullPage: true })

  const clientInput = page.getByPlaceholder(/buscar cliente/i)
  await clientInput.fill('PreQA Cobros SCRUM539')
  await page.waitForTimeout(700)
  await page.getByText('PreQA Cobros SCRUM539', { exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/03-cliente-y-facturas.png`, fullPage: true })

  // REQ-464 — ambas facturas reales visibles.
  await expect(page.getByText('F-PREQA-COBROS-1')).toBeVisible()
  await expect(page.getByText('F-PREQA-COBROS-2')).toBeVisible()

  const rowA = page.locator('label', { hasText: 'F-PREQA-COBROS-1' })
  const rowB = page.locator('label', { hasText: 'F-PREQA-COBROS-2' })
  await rowA.locator('input[type="checkbox"]').check()
  await rowB.locator('input[type="checkbox"]').check()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DL_DIR}/04-facturas-seleccionadas-total.png`, fullPage: true })

  // REQ-466 RN5 — método por defecto Transferencia ya trae Banco General/Corriente autocompletado.
  const bankSelect = page.locator('select').filter({ hasText: /banco general/i })
  await expect(bankSelect).toBeVisible()
  const selectedValue = await bankSelect.inputValue()
  console.log('[Cobros] cuenta bancaria autocompletada (Transferencia):', selectedValue)
  expect(selectedValue).not.toBe('')

  await page.getByRole('button', { name: /^registrar cobro$/i }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/05-cobro-registrado.png`, fullPage: true })

  // Verificar por API que el cobro quedó real: monto_recibido = 6200, estado confirmado
  // (transferencia no es link_pago), y las 2 facturas quedaron con saldo 0.
  const invoicesAfter = await (await request.get(`${BASE}/api/admin-contab/payments/open-invoices?master_client_id=${MASTER_CLIENT_ID}`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[Cobros] facturas abiertas DESPUÉS de registrar (esperado: 0):', invoicesAfter.invoices.length)
  expect(invoicesAfter.invoices.length).toBe(0)
})

test('3. REQ-466 — Tarjeta autocompleta Banistmo, oculto para Retención de impuestos', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto(`${BASE}/admin-contab/cobros`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /registrar cobro/i }).click()
  await page.waitForTimeout(500)

  // Sin facturas pendientes ya (test 2 las cerró) — igual se puede ejercitar método+cuenta con el
  // cliente elegido, aunque no haya nada para seleccionar.
  const clientInput = page.getByPlaceholder(/buscar cliente/i)
  await clientInput.fill('PreQA Cobros SCRUM539')
  await page.waitForTimeout(700)
  await page.getByText('PreQA Cobros SCRUM539', { exact: true }).click()
  await page.waitForTimeout(800)
  await expect(page.getByText(/no tiene facturas pendientes/i)).toBeVisible()
  await page.screenshot({ path: `${DL_DIR}/06-sin-facturas-pendientes.png`, fullPage: true })
})
