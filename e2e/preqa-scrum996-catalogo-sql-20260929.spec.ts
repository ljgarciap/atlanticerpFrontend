import { test, expect, Page } from '@playwright/test'

// SCRUM-996 (auditoría SCRUM-995) — buscadores y Home de Bodega en SQL. Pre-QA 2026-09-29 contra `E2E_BASE_URL`
// (por defecto dev.atlanticerp.ai) con el usuario real `almacen@` (Líder de Bodega; password = correo en dev).
// Regresión permanente de tres pantallas que hidrataban el catálogo completo (~30K productos) en cada petición:
//   1. Home de Bodega "Artículos críticos": el total del botón debe coincidir con el Inventario al que enlaza (O1).
//   2. Bodegas: la búsqueda dentro de una bodega (autocompletado + Enter) no da 5xx y filtra.
//   3. Solicitud de ajuste: el buscador de producto del modal "Nueva solicitud" responde y tope de 10.
test.use({ baseURL: process.env.E2E_BASE_URL ?? 'https://dev.atlanticerp.ai' })
test.describe.configure({ mode: 'serial' })

async function login(page: Page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20_000 })
}

function track(page: Page) {
  const bad: string[] = []
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`) })
  return { bad, errors }
}

test('SCRUM-996 C — el total de "Artículos críticos" del Home coincide con el Inventario al que enlaza (O1)', async ({ page }) => {
  const t = track(page)
  const totals: Array<{ url: string; total?: number; status: number }> = []
  page.on('response', async r => {
    if (r.url().includes('/api/bodega/inventory?') && r.url().includes('chip=criticos')) {
      let total: number | undefined
      try { total = (await r.json())?.meta?.total } catch { /* sin cuerpo */ }
      totals.push({ url: r.url(), total, status: r.status() })
    }
  })

  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/home')
  const viewAll = page.getByRole('button', { name: /Ver los .*art[ií]culos/ }).last()
  await expect(page.locator('text=Cargando...')).toHaveCount(0, { timeout: 30_000 })
  await expect(viewAll).toBeVisible({ timeout: 30_000 })
  const homeCount = Number((await viewAll.innerText()).match(/\d[\d.,]*/)?.[0].replace(/[.,]/g, ''))
  expect(homeCount).toBeGreaterThan(20)
  await page.screenshot({ path: 'e2e/.tmp/s996-00-home.png', fullPage: true })

  await viewAll.click()
  await page.waitForURL(/\/bodega\/inventario/)
  await expect.poll(() => totals.length, { timeout: 20_000 }).toBeGreaterThan(0)
  expect(totals[0].status).toBe(200)
  expect(totals[0].total).toBe(homeCount)   // antes: Home 26282 vs Inventario 26285
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/s996-01-inventario-criticos.png', fullPage: true })
  expect(t.bad).toEqual([])
})

test('SCRUM-996 G — Bodegas: buscar dentro de una bodega grande no da 5xx y filtra', async ({ page }) => {
  const t = track(page)
  const searches: Array<{ url: string; status: number; total?: number }> = []
  page.on('response', async r => {
    if (/\/api\/bodega\/warehouses\/\d+\?/.test(r.url()) && r.url().includes('search=')) {
      let total: number | undefined
      try { total = (await r.json())?.meta?.total } catch { /* sin cuerpo */ }
      searches.push({ url: r.url(), status: r.status(), total })
    }
  })

  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/bodegas')
  await page.getByRole('button', { name: /zona libre/i }).first().click()
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })

  const input = page.getByPlaceholder(/Buscar producto o ubicación/i)
  await input.fill('led')
  await input.press('Enter')
  await expect.poll(() => searches.filter(s => s.url.includes('search=led')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  const led = searches.filter(s => s.url.includes('search=led')).pop()!
  expect(led.status).toBe(200)
  expect(led.total).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/.tmp/s996-02-bodegas-led.png', fullPage: true })

  await input.fill('zzzqqqxxx')
  await input.press('Enter')
  await expect.poll(() => searches.filter(s => s.url.includes('zzzqqqxxx')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  const none = searches.filter(s => s.url.includes('zzzqqqxxx')).pop()!
  expect(none.status).toBe(200)
  expect(none.total).toBe(0)
  expect(t.bad).toEqual([])
})

test('SCRUM-996 A — Solicitud de ajuste: el buscador de producto del modal responde con tope de 10', async ({ page }) => {
  const t = track(page)
  const calls: Array<{ url: string; status: number; rows?: number }> = []
  page.on('response', async r => {
    if (r.url().includes('/api/bodega/adjustment-requests/products/search')) {
      let rows: number | undefined
      try { rows = (await r.json())?.data?.length } catch { /* sin cuerpo */ }
      calls.push({ url: r.url(), status: r.status(), rows })
    }
  })

  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/solicitud-ajuste')
  await page.getByRole('button', { name: /Nueva solicitud/i }).first().click()
  const input = page.getByPlaceholder(/Buscar producto\.\.\./i)
  await expect(input).toBeVisible({ timeout: 20_000 })

  await input.fill('led')
  await expect.poll(() => calls.filter(c => c.url.includes('search=led')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  const led = calls.filter(c => c.url.includes('search=led')).pop()!
  expect(led.status).toBe(200)
  expect(led.rows).toBeLessThanOrEqual(10)
  expect(led.rows).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/.tmp/s996-03-ajuste-led.png', fullPage: true })

  await input.fill('zzzqqqxxx')
  await expect.poll(() => calls.filter(c => c.url.includes('zzzqqqxxx')).length, { timeout: 20_000 }).toBeGreaterThan(0)
  expect(calls.filter(c => c.url.includes('zzzqqqxxx')).pop()!.rows).toBe(0)
  expect(t.bad).toEqual([])
})
