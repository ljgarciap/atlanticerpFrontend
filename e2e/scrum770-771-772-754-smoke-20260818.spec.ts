import { test, expect, Page } from '@playwright/test'

// Smoke de validación en servidor real tras el deploy del batch SCRUM-771/772/754
// (2026-08-18). Confirma que el componente de paginación (<Pagination>, selector con
// value="20" seleccionado por default) renderiza en las pantallas que se paginaron de
// cero, y que la Vista Lista de Catálogo muestra la columna Nombre. No es un Pre-QA
// completo — solo un smoke rápido post-deploy.
//
// Credenciales por variables de entorno, NUNCA hardcodeadas acá (el default sirve para
// dev.atlanticerp.ai, donde sí existen las cuentas demo *@atlantic.test — ver
// AuthUserSeeder/CrmDemoSeeder, gateadas a local/dev/testing, no a qa). Para correr contra
// test.atlanticerp.ai (APP_ENV=qa, sin cuentas demo) pasar una cuenta real:
//   SMOKE_EMAIL=... SMOKE_PASSWORD=... npx playwright test --config=playwright.test-remote.config.ts ...

test.describe.configure({ mode: 'serial' })

const SMOKE_EMAIL    = process.env.SMOKE_EMAIL    ?? 'management@atlantic.test'
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? 'Password123!'

async function login(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(SMOKE_EMAIL)
  await page.locator('input[type="password"]').fill(SMOKE_PASSWORD)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

async function expectPaginationDefault20(page: Page) {
  const select = page.locator('select').filter({ has: page.locator('option[value="20"]') }).last()
  await expect(select).toBeVisible({ timeout: 10000 })
  await expect(select).toHaveValue('20')
}

test('login', async ({ page }) => {
  await login(page)
  await expect(page).not.toHaveURL(/login/)
})

test('SCRUM-754 — Clientes pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/ventas-diseno/clients')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Cotizaciones pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/ventas-diseno/quotes-list')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Pedidos pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/ventas-diseno/pedidos')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 + SCRUM-772 — Catálogo pagina con default 20 y Vista Lista muestra columna Nombre', async ({ page }) => {
  await login(page)
  await page.goto('/ventas-diseno/catalog')
  await expectPaginationDefault20(page)

  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(page.getByRole('columnheader').filter({ hasText: /^Nombre$/i })).toBeVisible()
  await expect(page.getByRole('columnheader').filter({ hasText: /referencia de fábrica/i })).toBeVisible()
  await expect(page.getByRole('columnheader').filter({ hasText: /referencia pública/i })).toBeVisible()
})

test('SCRUM-754 — Garantías y Reclamos pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/compras/reclamos')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Ver Registros de Ingreso pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/compras/ingresos')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Agencias de Liquidación pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/compras/agencias')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Comparación de Referencias / Solicitudes pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/compras/sustitutos')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Inventario / Familias pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/inventario')
  await page.getByRole('button', { name: /familias/i }).click()
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Órdenes Zona Libre pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/bodega/ordenes-zona-libre')
  await expectPaginationDefault20(page)
})

test('SCRUM-754 — Devoluciones pagina con default 20', async ({ page }) => {
  await login(page)
  await page.goto('/bodega/devoluciones')
  await expectPaginationDefault20(page)
})
