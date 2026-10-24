import { test, expect, Page } from '@playwright/test'

// Pre-QA — "Vista ICG" (SCRUM-749, 2026-09-03), pantalla propia bajo Migración con una pestaña
// por entidad, sin partir de un Subcliente puntual. Corrido en LOCAL contra
// http://localhost:8090 (nginx + build fresco de React), mismo criterio que el resto de specs de
// Pre-QA del proyecto. Datos sembrados vía tinker antes de esta corrida (SubClient "PreQA Vista
// Legacy Sub" con 1 Cliente ICG matcheado + 1 contacto, 1 Cotización+ítem, 1 Pedido+ítem, 1
// Albarán+ítem, 1 Factura sin líneas, 1 Proveedor, 1 Producto con 1 precio + 1 costo) — no vía
// este spec.
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

function tabStrip(page: Page) {
  return page.locator('div.flex.gap-2.flex-wrap').first()
}

// "Pagos ICG" ya no tiene ítem propio en el Sidebar (sacado 2026-09-03, a pedido de Luis —
// quedaba redundante con la pestaña "Pagos" de esta misma pantalla). Sigue viva por URL directa,
// ver el test de la pestaña Pagos más abajo.
test('superadmin ve el ítem "Vista ICG" en el Sidebar, sin "Pagos ICG" aparte', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await expect(page.getByRole('button', { name: 'Vista ICG' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pagos ICG' })).toHaveCount(0)
})

test('management NO ve "Vista ICG" en el Sidebar, y la URL directa la bloquea', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vista ICG' })).toHaveCount(0)

  await page.goto(`${BASE}/migracion/vista`)
  await page.waitForTimeout(800)
  await expect(page.getByRole('heading', { name: 'Vista ICG' })).toHaveCount(0)
})

test('Cotizaciones — lista global (sin partir de un cliente), busca por cliente y abre la ficha', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await expect(page.getByRole('heading', { name: 'Vista ICG' })).toBeVisible()
  await expect(page.getByText('PV-1001')).toBeVisible()
  await expect(page.getByText('PreQA Vista Cliente')).toBeVisible()

  await page.getByLabel('Buscar').fill('PreQA Vista Cliente')
  await page.waitForTimeout(500)
  await expect(page.getByText('PV-1001')).toBeVisible()

  await page.getByText('PV-1001').click()
  await page.waitForTimeout(400)
  await expect(page.getByText('PV-1001-1-1')).toBeVisible()
  await expect(page.getByText('VW-LMP')).toBeVisible()

  await page.getByRole('button', { name: 'Volver a la lista' }).click()
  await expect(page.getByText('PV-1001')).toBeVisible()
})

test('Pedidos — cambia de pestaña y abre la ficha', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Pedidos', { exact: true }).click()
  await page.waitForTimeout(500)
  await expect(page.getByText('PV-1002')).toBeVisible()

  await page.getByText('PV-1002').click()
  await page.waitForTimeout(400)
  await expect(page.getByText('VW-SPT')).toBeVisible()
})

test('Albaranes — Facturado se ve como Sí', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Albaranes', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByText('PV-1003').click()
  await page.waitForTimeout(400)

  const ficha = page.getByTestId('legacy-documento-ficha')
  await expect(ficha.getByText('Sí', { exact: true })).toBeVisible()
})

test('Facturas — nunca muestra tabla de líneas', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Facturas', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByText('PV-1004').click()
  await page.waitForTimeout(400)

  await expect(page.getByText(/no tiene líneas en el origen/i)).toBeVisible()
})

test('Pagos — la pestaña reusa la misma pantalla standalone, sin romperla', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Pagos', { exact: true }).click()
  await page.waitForTimeout(600)
  await expect(page.getByLabel('Estado')).toBeVisible()
  await expect(page.getByText(/NO confirmadas/)).toBeVisible()

  // La pantalla standalone /migracion/pagos sigue funcionando igual, sin romperse.
  await page.goto(`${BASE}/migracion/pagos`)
  await expect(page.getByRole('heading', { name: 'Pagos ICG' })).toBeVisible()
})

test('Clientes — busca, abre la ficha y ve el contacto', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Clientes', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByLabel('Buscar').fill('PreQA Vista Cliente')
  await page.waitForTimeout(500)
  await expect(page.getByText('PreQA Vista Cliente').first()).toBeVisible()

  await page.getByText('PreQA Vista Cliente').first().click()
  await page.waitForTimeout(400)
  await expect(page.getByText('Ana Gómez')).toBeVisible()
  await expect(page.getByText('Gerente de Compras')).toBeVisible()
})

test('Proveedores — busca y abre la ficha, sin ninguna tabla de líneas', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Proveedores', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByLabel('Buscar').fill('Vista Proveedor')
  await page.waitForTimeout(500)
  await page.getByText('Vista Proveedor SA').click()
  await page.waitForTimeout(400)

  await expect(page.getByText('PV666101')).toBeVisible()
})

test('Productos — busca y abre la ficha con precios por tarifa y costos por proveedor', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/vista`)

  await tabStrip(page).getByText('Productos', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByLabel('Buscar').fill('Vista Lámpara Deluxe')
  await page.waitForTimeout(500)
  await page.getByText('PreQA Vista Lámpara Deluxe').click()
  await page.waitForTimeout(400)

  await expect(page.getByText('public')).toBeVisible()
  await expect(page.getByText('$250')).toBeVisible()
  await expect(page.getByText('666101')).toBeVisible()
  await expect(page.getByText('$120')).toBeVisible()
})
