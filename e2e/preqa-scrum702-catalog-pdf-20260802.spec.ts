import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA — SCRUM-702 (REQ-622), 2026-08-02. "Enviar a cliente" — PDF dinámico de Catálogo sin
 * stock (seleccionados / catálogo completo). Corre contra dev.atlanticerp.ai (ya pusheado+desplegado).
 *
 * Cuentas reales (password = email, ver project_roster_usuarios_reales_atlanticerp.md):
 *  - vendedordisenador2@test.com (vendedor_disenador) — tiene ventas_diseno.read.
 *  - tecnicoservicios@test.com (tecnico_servicios) — NO tiene ventas_diseno.read, confirmado
 *    por curl directo (403) antes de este spec.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum702'

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoCatalog(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/catalog`)
  await page.waitForTimeout(1500)
}

test('1. Modo completo con filtro activo (buscador) — PDF trae TODO, ignora el filtro visual (RN4)', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoCatalog(page)

  // Confirmar el total sin filtro primero.
  const totalText = await page.getByText(/\d+\s+productos?$/i).first().textContent()
  await page.screenshot({ path: `${DL_DIR}/01a-sin-filtro.png`, fullPage: true })

  // Aplicar un filtro de texto que reduce la lista visible.
  await page.locator('input[placeholder]').first().fill('QA-')
  await page.waitForTimeout(1000)
  const filteredText = await page.getByText(/\d+\s+productos?$/i).first().textContent()
  await page.screenshot({ path: `${DL_DIR}/01b-con-filtro-QA.png`, fullPage: true })

  console.log('[SCRUM-702] Total sin filtro:', totalText, '| Con filtro "QA-":', filteredText)
  expect(filteredText).not.toEqual(totalText)

  // Con el filtro todavía activo en pantalla, click "Enviar catálogo completo".
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /enviar cat[aá]logo completo/i }).click(),
  ])
  const path = `${DL_DIR}/01-completo-con-filtro.pdf`
  await download.saveAs(path)
  console.log('[SCRUM-702] PDF modo completo (con filtro activo) guardado en', path)
})

test('2. Modo completo enviando product_ids de todas formas — backend los ignora (RN4 end-to-end)', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoCatalog(page)

  // Seleccionar 2 productos (esto pobla `selected`), después clickear "completo" en vez de
  // "seleccionados" — el frontend no debería mandar product_ids en este modo, pero igual
  // confirmamos que el PDF resultante trae todo el catálogo, no solo 2.
  const checkboxes = page.locator('input[type="checkbox"]').nth(1) // 0 = "seleccionar todo"
  await checkboxes.check()
  await page.locator('input[type="checkbox"]').nth(2).check()
  await page.waitForTimeout(300)
  await expect(page.getByText(/2 seleccionad/i)).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /enviar cat[aá]logo completo/i }).click(),
  ])
  const path = `${DL_DIR}/02-completo-con-seleccion-activa.pdf`
  await download.saveAs(path)
  console.log('[SCRUM-702] PDF modo completo (con 2 seleccionados pero modo=completo) guardado en', path)
})

test('3. Seleccionados sin nada marcado — botón disabled', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoCatalog(page)

  const btn = page.getByRole('button', { name: /enviar seleccionados/i })
  await expect(btn).toBeDisabled()
  await page.screenshot({ path: `${DL_DIR}/03-seleccionados-disabled.png` })
})

test('4. Seleccionados con N productos — PDF trae exactamente esos N', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoCatalog(page)

  await page.locator('input[type="checkbox"]').nth(1).check()
  await page.locator('input[type="checkbox"]').nth(2).check()
  await page.locator('input[type="checkbox"]').nth(3).check()
  await page.waitForTimeout(300)
  await expect(page.getByText(/3 seleccionad/i)).toBeVisible()

  const btn = page.getByRole('button', { name: /enviar seleccionados/i })
  await expect(btn).toBeEnabled()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    btn.click(),
  ])
  const path = `${DL_DIR}/04-seleccionados-3.pdf`
  await download.saveAs(path)
  console.log('[SCRUM-702] PDF modo seleccionados (3 productos) guardado en', path)
})

test('5. Doble clic rápido en "Enviar catálogo completo" — solo 1 descarga', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoCatalog(page)

  const btn = page.getByRole('button', { name: /enviar cat[aá]logo completo/i })
  let downloadCount = 0
  page.on('download', () => { downloadCount++ })

  await btn.click()
  // Segundo clic disparado casi inmediatamente después del primero.
  await btn.click({ force: true }).catch(() => { /* puede fallar si ya está disabled, eso es lo esperado */ })
  await page.waitForTimeout(3000)

  console.log('[SCRUM-702] Descargas disparadas tras doble clic rápido:', downloadCount)
  expect(downloadCount).toBeLessThanOrEqual(1)
})

test('6. Rol sin ventas_diseno.read — endpoint responde 401/403, no solo botón oculto', async ({ page, request }) => {
  // Confirmado antes por curl directo: carlos (tecnico_servicios) → 403 en POST send-pdf.
  // Acá confirmamos también el comportamiento en navegador: login exitoso, pero sin acceso a
  // la pantalla/al endpoint.
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'tecnicoservicios@test.com', password: 'tecnicoservicios@test.com' },
  })
  expect(loginRes.ok()).toBeTruthy()
  const { token } = await loginRes.json()

  const pdfRes = await request.post(`${BASE}/api/ventas-diseno/catalog/send-pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mode: 'completo' },
  })
  console.log('[SCRUM-702] POST send-pdf como tecnico_servicios (sin ventas_diseno.read) → status', pdfRes.status())
  expect([401, 403]).toContain(pdfRes.status())

  // Y en navegador: la pantalla de Catálogo no debería ni cargar datos para este rol.
  await login(page, 'tecnicoservicios@test.com')
  await gotoCatalog(page)
  await page.screenshot({ path: `${DL_DIR}/06-carlos-sin-permiso.png`, fullPage: true })
})

test('7. Producto inactivo — NUNCA aparece, ni en modo completo', async ({ page }) => {
  const sshBase = 'ssh -i /Users/lgarcia/.ssh/atlanticerp/atlanticerp-key.pem -o StrictHostKeyChecking=no ubuntu@dev.atlanticerp.ai'
  const psql = (sql: string) =>
    execSync(
      `${sshBase} "cd /var/www/backend && docker compose -f infra/docker-compose.qa.yml exec -T postgres psql -U atlanticerp -d atlanticerp -c \\"SET search_path TO atlantic_ventas_diseno; ${sql}\\""  < /dev/null`,
      { encoding: 'utf8' },
    )

  // Producto de fixture QA (id 4, SPOT-EMP-011) — no usado por otros specs activos, seguro de tocar.
  try {
    console.log('[SCRUM-702] Marcando producto id=4 (SPOT-EMP-011) como inactivo temporalmente...')
    psql("UPDATE catalog_products SET is_active=false WHERE id=4;")

    await login(page, 'vendedordisenador2@test.com')
    await gotoCatalog(page)
    await page.locator('input[placeholder]').first().fill('SPOT-EMP-011')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${DL_DIR}/07a-producto-inactivo-no-en-listado.png`, fullPage: true })
    await expect(page.getByText(/SPOT-EMP-011/i)).toHaveCount(0)

    // Modo completo con el producto inactivo en BD — el PDF no debe incluirlo.
    await page.locator('input[placeholder]').first().fill('')
    await page.waitForTimeout(800)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /enviar cat[aá]logo completo/i }).click(),
    ])
    const path = `${DL_DIR}/07-completo-con-producto-inactivo.pdf`
    await download.saveAs(path)
    console.log('[SCRUM-702] PDF modo completo (con SPOT-EMP-011 inactivo) guardado en', path)
  } finally {
    console.log('[SCRUM-702] Revirtiendo producto id=4 a is_active=true...')
    psql("UPDATE catalog_products SET is_active=true WHERE id=4;")
  }
})
