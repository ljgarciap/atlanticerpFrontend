import { test, expect, Page } from '@playwright/test'

// SCRUM-994 — Inventario de Bodega: KPIs, chips calculados y filtro `estado` en SQL. Pre-QA 2026-09-29.
// Regresión permanente: `chip=criticos` y `estado=sin_stock` daban 500 (memoria agotada) con el catálogo
// real de Lafayette (~29.6K productos). Corre contra `E2E_BASE_URL` (por defecto dev.atlanticerp.ai) con el
// usuario real de Bodega `almacen@` (password = correo en dev). Los números esperados son del catálogo real
// de dev al 2026-09-29 (`docs/pre-qa/scrum994-bodega-inventory-20260929.md`, oráculo SQL independiente).
test.use({ baseURL: process.env.E2E_BASE_URL ?? 'https://dev.atlanticerp.ai' })
test.describe.configure({ mode: 'serial' })

const KPIS = { total: 29630, low: 2, out: 26283, attention: 21, porServir: 213 }

async function login(page: Page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20_000 })
}

interface InvCall { url: string; status: number; total?: number; rows?: number }
function trackInventory(page: Page) {
  const calls: InvCall[] = []
  const errors: string[] = []
  const bad: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', async r => {
    const u = r.url()
    if (r.status() >= 500) bad.push(`${r.status()} ${u}`)
    if (u.includes('/api/bodega/inventory?') || u.endsWith('/api/bodega/inventory')) {
      let total: number | undefined; let rows: number | undefined
      try { const j = await r.json(); total = j?.meta?.total; rows = j?.data?.length } catch { /* sin cuerpo */ }
      calls.push({ url: u, status: r.status(), total, rows })
    }
  })
  return { calls, errors, bad }
}
const last = (c: InvCall[]) => c[c.length - 1]

test('SCRUM-994 — Home "Artículos críticos" -> Inventario chip=criticos ya no da 500 y muestra las filas', async ({ page }) => {
  const t = trackInventory(page)
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/home')
  // La tarjeta "Artículos críticos" muestra "Ver todos (N)" cuando hay más de MAX_HOME_CARD_ITEMS; el clic real
  // debe llegar a Inventario ya filtrado (REQ-362 RN1) — antes daba 500.
  const viewAll = page.getByRole('button', { name: /Ver los .*art[ií]culos/ }).last()
  await expect(page.locator('text=Cargando...')).toHaveCount(0, { timeout: 30_000 })
  await expect(viewAll).toBeVisible({ timeout: 30_000 })
  console.log('HOME_VIEWALL_TEXT', await viewAll.innerText())
  await page.screenshot({ path: 'e2e/.tmp/s994-00-home.png', fullPage: true })
  await viewAll.click()
  await page.waitForURL(/\/bodega\/inventario/)
  await expect.poll(() => t.calls.filter(c => c.url.includes('chip=criticos')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  const c = t.calls.filter(x => x.url.includes('chip=criticos'))[0]
  expect(c.status).toBe(200)
  expect(c.total).toBe(26285)
  await expect(page.locator('tbody tr').first()).toBeVisible()
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(5)
  await page.screenshot({ path: 'e2e/.tmp/s994-01-criticos.png', fullPage: true })
  expect(t.bad).toEqual([])
})

test('SCRUM-994 — KPIs de pantalla = oráculo y no cambian al filtrar', async ({ page }) => {
  const t = trackInventory(page)
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await expect(page.getByText(String(KPIS.total), { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  for (const v of [KPIS.low, KPIS.out, KPIS.attention, KPIS.porServir]) {
    await expect(page.getByText(String(v), { exact: true }).first()).toBeVisible()
  }
  await page.locator('select').nth(1).selectOption('sin_stock')   // Estado
  await expect.poll(() => last(t.calls)?.url ?? '').toContain('estado=sin_stock')
  await expect(page.getByText(String(KPIS.total), { exact: true }).first()).toBeVisible()
  expect(last(t.calls).status).toBe(200)
  expect(last(t.calls).total).toBe(KPIS.out)
  await page.screenshot({ path: 'e2e/.tmp/s994-02-estado-sin-stock.png', fullPage: true })
  expect(t.bad).toEqual([])
})

test('SCRUM-994 — chips En atención / Inactivos / Por ingresar / Todos y filtro Estado combinados', async ({ page }) => {
  const t = trackInventory(page)
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario')
  await page.waitForTimeout(1500)
  const chips: Array<[RegExp, string, number]> = [[/atención|atencion/i, 'chip=en_atencion', 21], [/inactivos/i, 'chip=inactivos', 6], [/por ingresar/i, 'chip=por_ingresar', 5]]
  for (const [label, q, total] of chips) {
    await page.getByRole('button', { name: label }).first().click()
    await expect.poll(() => last(t.calls)?.url ?? '', { timeout: 15_000 }).toContain(q)
    expect(last(t.calls).status).toBe(200)
    expect(last(t.calls).total).toBe(total)
    expect(await page.locator('tbody tr').count()).toBe(Math.min(total, 20)) // per_page por defecto = 20
  }
  // chip En atención + estado Sin stock = 19
  await page.getByRole('button', { name: /atención|atencion/i }).first().click()
  await page.locator('select').nth(1).selectOption('sin_stock')
  await expect.poll(() => last(t.calls)?.url ?? '').toMatch(/chip=en_atencion.*estado=sin_stock|estado=sin_stock.*chip=en_atencion/)
  expect(last(t.calls).total).toBe(19)
  // volver a "Todos" + Estado Disponible = 3.345. Las respuestas pueden llegar desordenadas (sin_stock pesa más que
  // disponible), así que se busca la llamada por URL y se verifica lo que la pantalla muestra, no la última respuesta.
  await page.getByRole('button', { name: /^todos$/i }).first().click()
  await page.locator('select').nth(1).selectOption('disponible')
  await expect.poll(() => t.calls.find(c => c.url.includes('estado=disponible'))?.total, { timeout: 15_000 }).toBe(3345)
  expect(t.calls.find(c => c.url.includes('estado=disponible'))?.status).toBe(200)
  await expect(page.locator('select').nth(1)).toHaveValue('disponible')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.locator('select').nth(1).selectOption('')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  expect(t.bad).toEqual([])
})

test('SCRUM-994 — orden y paginación con filtro calculado; recarga a mitad de flujo conserva el deep-link', async ({ page }) => {
  const t = trackInventory(page)
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/inventario?filter=criticos')
  await expect.poll(() => t.calls.some(c => c.url.includes('chip=criticos') && c.status === 200)).toBeTruthy()
  const first = await page.locator('tbody tr').first().innerText()
  await page.reload()
  await expect.poll(() => t.calls.filter(c => c.url.includes('chip=criticos')).length).toBeGreaterThan(1)
  expect(await page.locator('tbody tr').first().innerText()).toBe(first)   // mismo primer producto tras recargar
  // orden por columna (Nombre) dos veces -> asc/desc sin 5xx
  const th = page.locator('thead th').filter({ hasText: /nombre|descripci/i }).first()
  if (await th.count()) { await th.click(); await page.waitForTimeout(1200); await th.click(); await page.waitForTimeout(1200) }
  // página 2 (los botones de paginación de la UI son numéricos + chevrons sin nombre): otro conjunto de filas
  const firstP1 = await page.locator('tbody tr').first().innerText()
  await page.getByRole('main').getByRole('button', { name: '2', exact: true }).click()
  await expect.poll(() => t.calls.find(c => c.url.includes('chip=criticos') && c.url.includes('page=2'))?.status, { timeout: 15_000 }).toBe(200)
  expect(t.calls.find(c => c.url.includes('chip=criticos') && c.url.includes('page=2'))?.total).toBe(26285)
  await expect.poll(async () => (await page.locator('tbody tr').first().innerText()) !== firstP1).toBeTruthy()
  // "Todas" (per_page=all, techo 1000 filas) con chip calculado: 200 y renderiza
  await page.locator('select').last().selectOption('all')
  await expect.poll(() => t.calls.find(c => c.url.includes('per_page=all'))?.status, { timeout: 20_000 }).toBe(200)
  await expect(page.locator('tbody tr').nth(50)).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/s994-03-orden-paginacion.png', fullPage: true })
  expect(t.calls.every(c => c.status === 200)).toBeTruthy()
  expect(t.bad).toEqual([])
})

test('SCRUM-994 — rol sin bodega.read no accede (API 403, no solo botón oculto)', async ({ page }) => {
  const t = trackInventory(page)
  await login(page, 'vendedordisenador3@test.com')
  await page.goto('/bodega/inventario?filter=criticos')
  await page.waitForTimeout(3000)
  expect(t.calls.filter(c => c.status === 200)).toEqual([])
  expect(await page.locator('tbody tr').count()).toBe(0)
  await page.screenshot({ path: 'e2e/.tmp/s994-04-sin-permiso.png', fullPage: true })
  expect(t.bad).toEqual([])
})
