import { test, expect, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Reviewer FUSIONADOS — RE-VERIFICACIÓN PUNTUAL SCRUM-168 (v9), 2026-08-26.
// Sigue a preqa-scrum-gerencia-10tickets-20260826-v8-recheck.spec.ts, que dejó SCRUM-168 como el
// único NO PASA de los 10 tickets de la épica Gerencia (SCRUM-325). Backend fix 68beeed (RN1,
// "Órdenes críticas") + frontend fix e1f66ab (RN2, "Bajo stock sin ordenar" navega a
// /inventario?chip=bajo_stock_sin_ordenar en vez de /bodega/inventario?filter=...). Corre contra
// dev.atlanticerp.ai — BASE explícito, no depende del default de playwright.config.ts (localhost:5173,
// ver memoria feedback_playwright_spec_default_baseurl_remote_gotcha).

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const WHIL = 'whil@illuminations.com.pa' // Gerencia Restringida, Nivel 8
const WHIL_PASSWORD = WHIL // default = email, confirmado en v7/v8

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  // Mismo patrón que preqa-scrum-gerencia-10tickets-20260826-v8-recheck.spec.ts (defensivo contra
  // CrowdSec, ver feedback_preqa_crowdsec_no_paralelo).
  try {
    await page.context().clearCookies()
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
    await page.locator('input[type="email"]').waitFor({ timeout: 20000 })
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password ?? email)
    await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
    await page.waitForTimeout(1200)
    return !page.url().includes('/login')
  } catch {
    return false
  }
}

test('SCRUM-168 RN2 — clic en "Bajo stock sin ordenar" navega a /inventario (Compras) y filtra', async ({ page }) => {
  const ok = await login(page, WHIL, WHIL_PASSWORD)
  expect(ok).toBeTruthy()

  await page.goto(`${BASE}/gerencia`)
  await page.waitForLoadState('networkidle')

  const metric = page.locator('text=Bajo stock sin ordenar').first()
  await expect(metric).toBeVisible({ timeout: 15000 })

  const inventoryResponse = page.waitForResponse((res) =>
    res.url().includes('/api/compras/inventory') && res.url().includes('chip=bajo_stock_sin_ordenar')
  )
  await metric.click()
  const resp = await inventoryResponse
  expect(resp.status()).toBe(200)

  // RN2 — debe navegar a /inventario (Compras), NO a /bodega/inventario
  expect(page.url()).toContain('/inventario')
  expect(page.url()).toContain('chip=bajo_stock_sin_ordenar')
  expect(page.url()).not.toContain('/bodega/inventario')

  // El endpoint real ya confirma el filtro por curl (meta.total=11623, < 11752 del catálogo
  // completo) — acá se confirma que la respuesta del clic real en pantalla usa el mismo endpoint
  // y chip, y que la tabla efectivamente renderiza filas (no queda vacía).
  const body = await resp.json()
  expect(body.meta?.total).toBeLessThan(11752)
  await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: 'docs/visual-review/screenshots/SCRUM-168-v9-inventario-filtrado.png', fullPage: true })
})

test('SCRUM-168 RN1 — "Órdenes críticas" de Gerencia coincide con /compras/ordenes?chip=critical', async ({ page }) => {
  const ok = await login(page, WHIL, WHIL_PASSWORD)
  expect(ok).toBeTruthy()

  await page.goto(`${BASE}/gerencia`)
  await page.waitForLoadState('networkidle')

  const metric = page.locator('text=Órdenes críticas').first()
  await expect(metric).toBeVisible({ timeout: 15000 })

  const ordersResponse = page.waitForResponse((res) =>
    res.url().includes('/api/compras/orders') && res.url().includes('chip=critical')
  )
  await metric.click()
  const resp = await ordersResponse
  expect(resp.status()).toBe(200)

  expect(page.url()).toContain('/compras/ordenes')
  expect(page.url()).toContain('chip=critical')

  const body = await resp.json()
  console.log('SCRUM-168 RN1 — /api/compras/orders?chip=critical meta.total =', body.meta?.total)
  await page.locator('table tbody tr').first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: 'docs/visual-review/screenshots/SCRUM-168-v9-ordenes-criticas.png', fullPage: true })
})
