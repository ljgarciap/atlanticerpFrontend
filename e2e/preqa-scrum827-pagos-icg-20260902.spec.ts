import { test, expect, Page } from '@playwright/test'

// Pre-QA — SCRUM-827 (legacy.pagos, catálogo standalone). Corrido en LOCAL contra
// http://localhost:8090 (nginx + build fresco de React), no dev.atlanticerp.ai — mismo criterio que el
// resto de specs de Pre-QA del proyecto. Datos sembrados vía tinker antes de esta corrida (25
// filas legacy.pagos con los 4 estados/3 orígenes/4 tipos de documento reales, un importe
// negativo, y la fecha centinela real 9202-04-02 documentada en el ticket) — no vía este spec,
// porque legacy.pagos es staging de solo lectura sin endpoint de escritura.
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

// "Pagos ICG" ya no tiene ítem propio en el Sidebar (sacado 2026-09-03, épica SCRUM-749, a pedido
// de Luis — quedaba redundante con la pestaña "Pagos" de "Vista ICG", mismo componente exacto:
// TESORERIA nunca tuvo scoping por cliente, a diferencia de las 4 entidades con Historial ICG
// scoped). La ruta /migracion/pagos sigue viva por URL directa (ver el resto de este archivo),
// solo se retiró el botón del menú — verificado también desde VistaIcgPage.tsx.
test('superadmin ya NO ve un ítem "Pagos ICG" aparte en el Sidebar (ver "Vista ICG")', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await expect(page.getByRole('button', { name: 'Pagos ICG' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Vista ICG' })).toBeVisible()
  // El ítem de SCRUM-816 sigue ahí — la sección Migración muestra ambos para superadmin.
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toBeVisible()
})

test('superadmin — listado real, paginación, filtros y datos crudos sin traducir', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/pagos`)

  await expect(page.getByRole('heading', { name: 'Pagos ICG' })).toBeVisible()
  // Nota de "sin confirmar" visible — criterio explícito de Luis, no una traducción definitiva.
  await expect(page.getByText(/NO confirmadas/)).toBeVisible()

  // 25 filas sembradas, default 20/página → página 1 llena, botón Siguiente habilitado.
  await expect(page.locator('tbody tr')).toHaveCount(20)
  const siguiente = page.getByRole('button', { name: 'Siguiente' })
  await expect(siguiente).toBeEnabled()
  await siguiente.click()
  await page.waitForTimeout(500)
  await expect(page.locator('tbody tr')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Anterior' })).toBeEnabled()
  await page.getByRole('button', { name: 'Anterior' }).click()
  await page.waitForTimeout(500)

  // Filtro por estado — solo 1 fila sembrada con X.
  await page.getByLabel('Estado').selectOption('X')
  await page.waitForTimeout(500)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr').first()).toContainText('X')
  // Código crudo, nunca la hipótesis como texto de celda.
  await expect(page.locator('tbody tr').first()).not.toContainText('Anulado')

  // Combinar filtro de origen+tipo — 1 fila sembrada con P+A.
  await page.getByLabel('Estado').selectOption('')
  await page.getByLabel('Origen').selectOption('P')
  await page.getByLabel('Tipo de documento').selectOption('A')
  await page.waitForTimeout(500)
  await expect(page.locator('tbody tr')).toHaveCount(1)

  // Importe negativo se muestra tal cual, no crashea ni se oculta.
  await page.getByLabel('Origen').selectOption('')
  await page.getByLabel('Tipo de documento').selectOption('')
  await page.getByLabel('Estado').selectOption('P')
  await page.waitForTimeout(500)
  await expect(page.locator('tbody tr').filter({ hasText: '-120.50' })).toHaveCount(1)

  // Filtro sin resultados → estado vacío explícito, no error ni pantalla en blanco.
  // 9300-01-01 a propósito (no 2099) — una de las filas sembradas tiene la fecha centinela real
  // 2202-12-12, que un filtro "futuro" ingenuo como 2099 no descartaría (hallazgo de esta misma
  // pasada: confirma que el filtro SÍ compara la fecha centinela como fecha real, no la ignora).
  await page.getByLabel('Estado').selectOption('')
  await page.getByLabel('Fecha desde').fill('9300-01-01')
  await page.waitForTimeout(500)
  await expect(page.getByText('Sin registros para este filtro.')).toBeVisible()
})

test('la fecha centinela real (9202-04-02) se marca visualmente, sin ocultarse', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/pagos`)
  await page.getByLabel('Origen').selectOption('E')
  await page.waitForTimeout(500)

  const fila = page.locator('tbody tr').filter({ hasText: '9202-04-02' })
  await expect(fila).toHaveCount(1)
  await expect(fila.locator('[title*="centinela"]')).toBeVisible()
})

test('la pantalla es de solo lectura — sin ningún control de crear/editar/eliminar', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')
  await page.goto(`${BASE}/migracion/pagos`)
  await page.waitForTimeout(500)

  for (const label of [/^nuevo$/i, /^crear$/i, /^editar$/i, /^eliminar$/i, /^guardar$/i]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  }
})

test('management NO ve "Pagos ICG" en el Sidebar (pero sí "Migración ICG"), y la URL directa la bloquea', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pagos ICG' })).toHaveCount(0)

  await page.goto(`${BASE}/migracion/pagos`)
  await page.waitForTimeout(800)
  // RequireRole bloquea — no debe quedar en la pantalla protegida ni mostrar sus datos.
  await expect(page.getByRole('heading', { name: 'Pagos ICG' })).toHaveCount(0)
})

test('designer no ve la sección Migración en absoluto, y la URL directa la bloquea', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await expect(page.getByRole('button', { name: 'Migración ICG' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pagos ICG' })).toHaveCount(0)

  await page.goto(`${BASE}/migracion/pagos`)
  await page.waitForTimeout(800)
  await expect(page.getByRole('heading', { name: 'Pagos ICG' })).toHaveCount(0)
})
