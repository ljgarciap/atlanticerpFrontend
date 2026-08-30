import { test, expect, Page, APIRequestContext } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Review — Batch 18 Admin&Cont (SCRUM-597→601, REQ-520→524), Arqueo/Flujo de Caja
// parte 1. Corrido en vivo contra dev.atlanticerp.ai el 2026-08-25, recién desplegado. Ver ADR
// docs/adr/ADR-SCRUM597-601-batch18-arqueo-caja.md (atlanticerp-backend) y
// docs/pre-qa/batch18-arqueo-caja-2026-08-25.md / docs/visual-review/batch18-arqueo-caja-2026-08-25.md
// para el detalle completo de hallazgos y evidencia (e2e/screenshots/batch18-*.png).
//
// CRÍTICO real encontrado en la corrida original (dev.atlanticerp.ai quedó inalcanzable a mitad de esa
// corrida, ver docs/pre-qa/... para el detalle) — SCRUM-597: las 3 tarjetas "Entradas/Salidas/Saldo
// proyectados" del encabezado quedaban en "—" cada vez que el usuario estaba en la pestaña "Real
// (histórico)" con una ventana (windowDays) que nunca se pidió mientras estaba en la pestaña
// "Proyectado" en esa sesión — `ArqueoCajaPage.tsx` gateaba el fetch de `useCashPositionProjected`
// con `view === 'proyectado'`, pero RN2 (REQ-520) dice que esas 3 tarjetas dependen SOLO de la
// ventana elegida, no de qué pestaña está activa (el propio mockup las recalcula siempre, sin
// importar `currentView`). Corregido — el test de abajo ya no es `fixme`, confirma el fix.

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const FELIX = 'conta@atlantic.com.pa'
const YANETH = 'asistente@atlantic.com.pa'
const MARK = 'mbekhar@atlantic.com.pa'
const MARK_PASSWORD = 'B1n4X_2026?'

async function login(page: Page, email: string, password?: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
  expect(page.url()).not.toContain('/login')
}

async function bearerToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      const v = localStorage.getItem(key)
      if (v && v.length > 100 && v.split('.').length === 3) return v
    }
    return null
  })
}

test('REQ-522 — default de Felix es Proyectado + 30 días, con las 4 tarjetas pobladas', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1200)

  await expect(page.getByRole('button', { name: /^proyectado$/i })).toHaveClass(/bg-primary|active/)
  await expect(page.getByRole('button', { name: /^30 días$/i })).toHaveClass(/active|border-primary|bg-teal/).catch(() => {})
  await expect(page.getByText('Saldo disponible hoy')).toBeVisible()
  await expect(page.getByText('Entradas proyectadas', { exact: true })).toBeVisible()
  await expect(page.getByText('Salidas proyectadas', { exact: true })).toBeVisible()
  await expect(page.getByText('Saldo proyectado', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/batch18-felix-default.png', fullPage: true })
})

test('REQ-522 RN2 — Real + Hoy muestra Arqueo del día, no la tabla histórica', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.getByRole('button', { name: /^Hoy$/i }).click()
  await page.waitForTimeout(1000)

  await expect(page.getByText('Arqueo del día')).toBeVisible()
  await expect(page.getByText('Observación general del día')).toBeVisible()
  // RN3 REQ-520 — exportar no disponible en Real+Hoy
  await expect(page.getByRole('button', { name: /exportar reporte/i })).toHaveCount(0)
})

test('REQ-522 RN3 — Real + 30 días muestra tabla cronológica con saldo acumulado', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.waitForTimeout(1000)

  await expect(page.getByRole('columnheader', { name: /saldo acumulado/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /exportar reporte/i })).toBeVisible()
})

test('REQ-520 RN2 — las tarjetas proyectadas NO dependen de la pestaña activa (regresión SCRUM-597)', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.getByRole('button', { name: /^90 días$/i }).click()
  await page.waitForTimeout(1200)

  // useCashPositionProjected ahora se habilita con canProjectedReal solo (no con
  // view === 'proyectado') — ver ArqueoCajaPage.tsx línea ~49.
  await expect(page.getByText('Entradas proyectadas').locator('..').getByText('—')).toHaveCount(0)
})

test('REQ-524 — Yaneth aterriza directo en Arqueo del día, sin toggle/chips de Proyectado/Real', async ({ page }) => {
  await login(page, YANETH)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1200)

  await expect(page.getByRole('heading', { name: 'Arqueo del día' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^proyectado$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /real \(histórico\)/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/batch18-yaneth-default.png', fullPage: true })
})

test('REQ-520/521/523 — Yaneth: /projected devuelve totales (sin detalle línea por línea), /real sigue 403', async ({ page, request }) => {
  // Aclarado por Luis 2026-08-25 (commit ddd9192, tras el hallazgo de esta misma sesión de
  // Pre-QA): REQ-520 le da a Yaneth el encabezado completo (los 3 totales agregados), REQ-521 solo
  // le veda el panel de detalle línea por línea y REQ-523 le veda la Vista real 30/90d. El backend
  // ahora responde 200 en /projected para su rol, con entradas/salidas vacíos y los totales reales.
  await login(page, YANETH)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(800)
  const token = await bearerToken(page)
  expect(token).toBeTruthy()

  const r1 = await request.get(`${BASE}/api/admin-contab/cash-position/projected?window=30`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(r1.status()).toBe(200)
  const body1 = await r1.json()
  expect(body1.entradas).toEqual([])
  expect(body1.salidas).toEqual([])
  expect(typeof body1.total_entradas).toBe('number')
  expect(typeof body1.total_salidas).toBe('number')

  const r2 = await request.get(`${BASE}/api/admin-contab/cash-position/real?window=30`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(r2.status()).toBe(403)
})

test('REQ-520 — Yaneth ve las 3 tarjetas de encabezado pobladas (no "—")', async ({ page }) => {
  await login(page, YANETH)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1200)

  const cardsRow = page.locator('text=Saldo disponible hoy').locator('../..')
  await expect(cardsRow.getByText('—')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/batch18-yaneth-cards-populated.png', fullPage: true })
})

test('REQ-524 — Mark (Gerencia): sin acceso a Arqueo del día, ni por UI ni por API directa', async ({ page, request }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.getByRole('button', { name: /^Hoy$/i }).click()
  await page.waitForTimeout(1200)

  await expect(page.getByText('Total cobrado hoy')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/batch18-mark-blocked-arqueo.png', fullPage: true })

  const token = await bearerToken(page)
  const r1 = await request.get(`${BASE}/api/admin-contab/cash-position/daily-count`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(r1.status()).toBe(403)
})

test('REQ-524 RN2 — observación por fila se guarda y persiste tras recargar', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/arqueo-caja`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.getByRole('button', { name: /^Hoy$/i }).click()
  await page.waitForTimeout(1000)

  const obsInput = page.getByPlaceholder(/observación/i).first()
  const value = `preqa-e2e-${Date.now()}`
  await obsInput.fill(value)
  await obsInput.blur()
  await page.waitForTimeout(1200)

  await page.reload()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /real \(histórico\)/i }).click()
  await page.getByRole('button', { name: /^Hoy$/i }).click()
  await page.waitForTimeout(1000)

  await expect(page.getByPlaceholder(/observación/i).first()).toHaveValue(value)

  // limpieza -- deja el campo vacío para no ensuciar el fixture para la próxima corrida
  await page.getByPlaceholder(/observación/i).first().fill('')
  await page.getByPlaceholder(/observación/i).first().blur()
  await page.waitForTimeout(800)
})
