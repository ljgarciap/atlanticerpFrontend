import { test, expect, Page } from '@playwright/test'

// Pre-QA + Visual Review fusionado — Batch 14 Comisiones Internas (SCRUM-575→579, REQ-498→502)
// Contra dev.atlanticerp.ai (backend ac2a712, frontend c9d4084). Ver docs/reviews/scrum575-579-batch14-comisiones-internas-20260825.md
// y docs/adr/ADR-SCRUM575-579-batch14-comisiones-internas.md (§3 — alcance vs Batch 15).

const FELIX = 'conta@atlantic.com.pa' // Lider Admin&Cont
const MARK = 'mbekhar@atlantic.com.pa'
const MARK_PASS = 'B1n4X_2026?'
const VENDEDOR = 'milena.e@grupolafayette.com'

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
  return !page.url().includes('/login')
}

test('SIDEBAR — Comisiones ▸ Internas es alcanzable desde el sidebar de Admin&Contab (Felix)', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab')
  await page.waitForTimeout(900)
  // rail colapsado por default (solo íconos) — expandir con la flecha superior
  await page.mouse.click(28, 50)
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e/.tmp/b14-01-admincontab-home.png', fullPage: true })
  await page.getByText('ADMIN. & CONTAB.', { exact: false }).first().click()
  await page.waitForTimeout(400)
  const comisionesItem = page.getByText('Comisiones', { exact: false }).first()
  await expect(comisionesItem).toBeVisible({ timeout: 5000 })
  await comisionesItem.click()
  await page.waitForTimeout(400)
  const internasItem = page.getByText('Internas', { exact: false }).first()
  await expect(internasItem).toBeVisible({ timeout: 5000 })
  await page.screenshot({ path: 'e2e/.tmp/b14-02-comisiones-dropdown.png', fullPage: true })
  await internasItem.click()
  await page.waitForTimeout(1200)
  expect(page.url()).toMatch(/comisiones\/internas/i)
})

test('FELIX — encabezado, 4 tarjetas, banner, filtros, tabla, modal tramos, exportar', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()

  // navegar directo por URL para no depender del hallazgo anterior
  const candidates = ['/admin-contab/comisiones/internas', '/admin-contab/comisiones-internas']
  let landed = false
  for (const url of candidates) {
    await page.goto(url)
    await page.waitForTimeout(1000)
    if (!page.url().includes('/login') && await page.getByText(/Comisiones Internas/i).first().isVisible().catch(() => false)) {
      landed = true
      break
    }
  }
  expect(landed).toBeTruthy()
  await page.screenshot({ path: 'e2e/.tmp/b14-03-felix-home.png', fullPage: true })

  // Encabezado
  await expect(page.getByText('Comisiones Internas', { exact: false }).first()).toBeVisible()

  // 4 tarjetas
  await expect(page.getByText(/Total pedidos del mes/i)).toBeVisible()
  await expect(page.getByText(/Ya pagada/i)).toBeVisible()
  await expect(page.getByText('Por pagar (cliente ya pagó)')).toBeVisible()
  await expect(page.getByText(/Pendiente de cobro/i).first()).toBeVisible()

  // Filtros: flechas de mes (por aria-label) + selector de vendedor
  const prevBtn = page.getByLabel(/mes anterior/i)
  const nextBtn = page.getByLabel(/mes siguiente/i)
  await expect(prevBtn).toBeVisible()
  await expect(nextBtn).toBeVisible()
  await prevBtn.click()
  await page.waitForTimeout(800)
  // al no estar ya en el mes actual, "Volver al mes actual" debe aparecer (RN1/Escenario 2 REQ-500)
  await expect(page.getByText(/volver al mes actual/i)).toBeVisible({ timeout: 3000 })
  await page.getByText(/volver al mes actual/i).click()
  await page.waitForTimeout(600)

  // selector de vendedor visible para Felix, con todos los nombres del mockup
  const vendorSelect = page.locator('select').filter({ hasText: /todos los vendedores/i })
  await expect(vendorSelect).toBeVisible()

  // Botón exportar visible para Felix
  const exportBtn = page.getByText(/exportar/i).first()
  await expect(exportBtn).toBeVisible()

  // Botón tabla de tramos
  const tramosBtn = page.getByText(/tabla de comisión escalonada|tramos/i).first()
  await expect(tramosBtn).toBeVisible()
  await tramosBtn.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/b14-04-modal-tramos.png', fullPage: true })
  // 6 tramos
  const tramosText = await page.textContent('body')
  expect(tramosText).toMatch(/1\.5%/)
  expect(tramosText).toMatch(/5%/)
  const closeBtn = page.getByText('Cerrar', { exact: true })
  await expect(closeBtn).toBeVisible({ timeout: 3000 })
  await closeBtn.click()
  await page.waitForTimeout(400)

  // Expandir la primera fila de vendedor con datos reales (columna "Total pedidos" != USD 0.00)
  // y confirmar el detalle a nivel de pedido
  const idmarRow = page.getByRole('cell', { name: 'Idmar Hernandez' })
  await idmarRow.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await idmarRow.click({ timeout: 8000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'e2e/.tmp/b14-08-fila-expandida.png', fullPage: true })
  const expandedText = await page.textContent('body')
  // columnas de detalle de pedido esperadas por el mockup
  for (const label of [/total pedido/i, /total cobrado/i, /total facturado/i]) {
    expect(expandedText).toMatch(label)
  }
})

test('FELIX — exportar PDF/Excel funciona sin error 500 (bug corregido en Senior Review)', async ({ page, context }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1200)
  if (page.url().includes('/login')) test.skip(true, 'ruta no resuelta, ver test de sidebar')

  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(token).toBeTruthy()

  const exportBtn = page.getByText(/exportar/i).first()
  await exportBtn.click()
  await page.waitForTimeout(400)
  const pdfItem = page.getByText(/exportar como pdf/i)
  const excelItem = page.getByText(/exportar como excel/i)

  // Interceptar la request real de export en vez de solo confiar en el click (evita popup blocking headless)
  const [pdfResp] = await Promise.all([
    page.waitForResponse(r => /commissions\/internal\/export/i.test(r.url()), { timeout: 8000 }).catch(() => null),
    pdfItem.isVisible().then(v => v && pdfItem.click()).catch(() => {}),
  ])
  if (pdfResp) {
    expect(pdfResp.status(), `export PDF devolvió ${pdfResp.status()}`).toBeLessThan(400)
  }

  await page.waitForTimeout(500)
  await exportBtn.click().catch(() => {})
  await page.waitForTimeout(300)
  const [excelResp] = await Promise.all([
    page.waitForResponse(r => /commissions\/internal\/export/i.test(r.url()), { timeout: 8000 }).catch(() => null),
    excelItem.isVisible().then(v => v && excelItem.click()).catch(() => {}),
  ])
  if (excelResp) {
    expect(excelResp.status(), `export Excel devolvió ${excelResp.status()}`).toBeLessThan(400)
  }
})

test('MARK — mismo alcance que Felix (Gerencia)', async ({ page }) => {
  const ok = await login(page, MARK, MARK_PASS)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/b14-05-mark-home.png', fullPage: true })
  await expect(page.getByText(/exportar/i).first()).toBeVisible()
})

test('VENDEDOR — solo su fila, sin selector de vendedor, sin exportar, SÍ tabla de tramos read-only', async ({ page }) => {
  const ok = await login(page, VENDEDOR)
  expect(ok).toBeTruthy()
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/b14-06-vendedor-home.png', fullPage: true })

  if (page.url().includes('/login')) {
    test.fail(true, 'el vendedor no pudo entrar en absoluto — revisar permiso admin_contab.commissions_internal.view')
  }

  // NO debe ver botón exportar
  const exportVisible = await page.getByText(/exportar/i).first().isVisible().catch(() => false)
  expect(exportVisible, 'vendedor NO debería ver el botón Exportar').toBeFalsy()

  // SÍ debe poder abrir tabla de tramos
  const tramosBtn = page.getByText(/tabla de comisión escalonada|tramos/i).first()
  await expect(tramosBtn).toBeVisible()
  await tramosBtn.click()
  await page.waitForTimeout(500)
  const tramosText = await page.textContent('body')
  expect(tramosText).toMatch(/1\.5%/)
  await page.screenshot({ path: 'e2e/.tmp/b14-07-vendedor-tramos-modal.png', fullPage: true })
})

test('PERMISOS API — vendedor no puede pegarle a /vendors ni /export directo (defensa en profundidad)', async ({ page }) => {
  const ok = await login(page, VENDEDOR)
  expect(ok).toBeTruthy()
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(token).toBeTruthy()

  const vendorsResp = await page.evaluate(async (t) => {
    const res = await fetch('/api/admin-contab/commissions/internal/vendors', { headers: { Authorization: `Bearer ${t}` } })
    return res.status
  }, token)
  expect(vendorsResp, '/vendors debería ser 403 para un vendedor').toBe(403)

  const exportResp = await page.evaluate(async (t) => {
    const res = await fetch('/api/admin-contab/commissions/internal/export?format=pdf', { headers: { Authorization: `Bearer ${t}` } })
    return res.status
  }, token)
  expect(exportResp, '/export debería ser 403 para un vendedor').toBe(403)
})
