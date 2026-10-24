import { test, expect, Page } from '@playwright/test'

// SCRUM-926 — smoke test post-despliegue de Admin&Cont a producción (v1.27.0.0, 2026-09-17).
// Corre SOLO contra atlanticerp.ai vía playwright.prod-smoke.config.ts (baseURL propio, no el default
// localhost:5173). Credenciales por variable de entorno — nunca hardcodeadas.
//
//   SMOKE_EMAIL=contabilidad@test.com SMOKE_PASSWORD=... \
//   NEGATIVE_EMAIL=asistentebodega@test.com NEGATIVE_PASSWORD=... \
//     npx playwright test --config=playwright.prod-smoke.config.ts e2e/scrum926-admincontab-prod-smoke-20260917.spec.ts
//
// Incluye caso negativo (asistente_bodega, sin admin_contab.view) — no alcanza con probar que el
// usuario permitido ve el módulo, hay que confirmar que uno sin permiso NO lo ve ni puede entrar
// por URL directa (hallazgo real del review de Luis, no estaba cubierto en la primera pasada).

test.describe.configure({ mode: 'serial' })

const SMOKE_EMAIL    = process.env.SMOKE_EMAIL    ?? ''
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? ''
const NEGATIVE_EMAIL    = process.env.NEGATIVE_EMAIL    ?? ''
const NEGATIVE_PASSWORD = process.env.NEGATIVE_PASSWORD ?? ''

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function login(page: Page) {
  await loginAs(page, SMOKE_EMAIL, SMOKE_PASSWORD)
}

test('login como Felix (lider_admin_contab, no-superadmin)', async ({ page }) => {
  await login(page)
  await expect(page).not.toHaveURL(/login/)
})

test('Felix aterriza en Admin&Cont con nav completo (rol scopeado a un solo módulo)', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: /bienvenido, felix/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Facturación', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tesorería', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reportes', exact: true })).toBeVisible()
})

test('Inicio de Admin&Cont carga sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page)
  await page.goto('/admin-contab/inicio')
  await expect(page).not.toHaveURL(/login/)
  await page.waitForTimeout(1500)
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([])
})

test('Facturación carga sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1500)
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([])
})

test('Arqueo de Caja carga sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page)
  await page.goto('/admin-contab/arqueo-caja')
  await page.waitForTimeout(1500)
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([])
})

test('Reportes carga sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await login(page)
  await page.goto('/admin-contab/reportes')
  await page.waitForTimeout(1500)
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([])
})

test('Caso negativo — usuario sin admin_contab.view NO ve el módulo en el sidebar', async ({ page }) => {
  await loginAs(page, NEGATIVE_EMAIL, NEGATIVE_PASSWORD)
  await expect(page).not.toHaveURL(/login/)
  await expect(page.getByRole('button', { name: 'Facturación', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tesorería', exact: true })).toHaveCount(0)
})

test('Caso negativo — URL directa a /admin-contab/inicio redirige, no muestra el módulo', async ({ page }) => {
  await loginAs(page, NEGATIVE_EMAIL, NEGATIVE_PASSWORD)
  await page.goto('/admin-contab/inicio')
  await page.waitForTimeout(1500)
  await expect(page).not.toHaveURL(/admin-contab/)
  await expect(page.getByText(/cartera por cobrar/i)).toHaveCount(0)
})

test('Caso negativo — API rechaza con 403 sin el permiso (no solo cosmético en el frontend)', async ({ request, baseURL }) => {
  const loginRes = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: NEGATIVE_EMAIL, password: NEGATIVE_PASSWORD },
  })
  expect(loginRes.ok()).toBeTruthy()
  const { token } = await loginRes.json()

  const apiRes = await request.get(`${baseURL}/api/admin-contab/bank-accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(apiRes.status()).toBe(403)
})
