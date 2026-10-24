import { test, expect, Page } from '@playwright/test'

// Pre-QA — SCRUM-816 (dashboard de migración ICG, épica SCRUM-749). Corrido en LOCAL contra
// http://localhost:8090 (nginx + build fresco de React), no dev.atlanticerp.ai — mismo criterio que el
// resto de specs de Pre-QA del proyecto. Datos sembrados vía tinker antes de esta corrida (26
// legacy.sync_runs — 25 de "productos" para forzar 2 páginas + 1 "facturas" parcial con 3
// legacy.sync_run_details de distinto status/motivo; 2 Producto/2 Cliente/1 CatalogProduct para
// el bloque de conteos; 25 legacy.pagos reales, del seed de SCRUM-827, para confirmar que
// "pagos" aparece en el bloque de conteos con datos reales, no solo 0).
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:8090'

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('Password123!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

test('management ve el ítem "Migración ICG" en el Sidebar', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toBeVisible()
})

test('superadmin también ve el ítem "Migración ICG" en el Sidebar', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toBeVisible()
})

test('designer no ve el ítem ni puede entrar por URL directa', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toHaveCount(0)

  await page.goto(`${BASE}/migracion/dashboard`)
  await page.waitForTimeout(800)
  await expect(page.getByRole('heading', { name: 'Migración ICG' })).toHaveCount(0)
})

test('Bloque 2 — conteos staging vs destino, incluye "pagos" con datos reales sin destino', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/migracion/dashboard`)

  await expect(page.getByRole('heading', { name: 'Migración ICG' })).toBeVisible()

  const conteosCard = page.locator('div', { has: page.getByRole('heading', { name: 'Comparación de conteos' }) })
  const pagosCard = conteosCard.locator('div.bg-slate-50', { hasText: 'Pagos' })
  await expect(pagosCard).toContainText('25')
  await expect(pagosCard).toContainText('sin destino/matching')

  const productosCard = conteosCard.locator('div.bg-slate-50', { hasText: 'Productos' })
  await expect(productosCard).toContainText('1 resueltos')
})

test('Bloque 1 — resumen histórico paginado (26 filas → 2 páginas) y filtrable por entidad', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/migracion/dashboard`)

  await expect(page.getByText('Cada fila es una corrida real de legacy:sync-*')).toBeVisible()
  await expect(page.locator('main table').first().locator('tbody tr')).toHaveCount(20)

  const siguiente = page.getByRole('button', { name: 'Siguiente' }).first()
  await expect(siguiente).toBeEnabled()
  await siguiente.click()
  await page.waitForTimeout(500)
  await expect(page.locator('main table').first().locator('tbody tr')).toHaveCount(6)

  // Filtrar por "facturas" — 1 sola corrida sembrada, y es la única "parcial".
  await page.locator('main select').first().selectOption('facturas')
  await page.waitForTimeout(500)
  await expect(page.locator('main table').first().locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('main table').first().locator('tbody tr').first()).toContainText('parcial')
})

test('Bloque 3 — muestra de excluidos con motivo, filtrable por entidad y status, con estado vacío', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/migracion/dashboard`)
  await page.waitForTimeout(500)

  // Las 3 filas de detalle sembradas (orphan/error/ambiguous) de la corrida "facturas".
  await expect(page.getByText('F-1001')).toBeVisible()
  await expect(page.getByText('F-1002')).toBeVisible()
  await expect(page.getByText('F-1003')).toBeVisible()
  await expect(page.getByText('icg_codcliente 555 sin match en legacy.clientes')).toBeVisible()

  // Filtrar por status "error" — solo F-1002 debe quedar visible.
  const selects = page.locator('main select')
  const count = await selects.count()
  // El select de status vive en el bloque 3 (el último con la opción "Error").
  const statusSelect = selects.nth(count - 1)
  await statusSelect.selectOption('error')
  await page.waitForTimeout(500)
  await expect(page.getByText('F-1002')).toBeVisible()
  await expect(page.getByText('F-1001')).toHaveCount(0)

  // Filtrar por una entidad sin excluidos sembrados → estado vacío positivo, no error.
  await statusSelect.selectOption('')
  const entidadSelectBloque3 = selects.nth(count - 2)
  await entidadSelectBloque3.selectOption('pedidos')
  await page.waitForTimeout(500)
  await expect(page.getByText('Sin registros excluidos')).toBeVisible()
})

test('la pantalla es de solo lectura — sin ningún control de crear/editar/eliminar', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/migracion/dashboard`)
  await page.waitForTimeout(500)

  for (const label of [/^nuevo$/i, /^crear$/i, /^editar$/i, /^eliminar$/i, /^guardar$/i]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  }
})
