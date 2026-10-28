import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-948, contra https://dev.atlanticerp.ai (deploy manual, backend f7dcad6 / frontend
 * 532202a, 2026-09-23/24). Sin mockup adjunto en Jira — Visual Review = comparación directa
 * contra `/admin-contab/cobros` (Historial de cobros), que es el propio criterio de aceptación
 * del ticket ("Validar en Test comparando directamente Cobros vs. Registrar abono").
 *
 * Contexto: una 1ª pasada (2026-09-22) había dado por resuelto un ticket con el mismo número pero
 * un alcance más angosto (botón "limpiar" en la cascada de SCRUM-933). El texto vigente del
 * ticket (creado 2026-09-21) pide algo distinto — replicar en "Abonos registrados" los mismos
 * buscadores/filtros que "Historial de cobros" — que nunca se había construido. `AbonosPage.tsx`
 * no tenía ningún buscador antes de este batch. Ver docs/pre-qa/scrum948-abonos-buscadores-20260923.md.
 *
 * Datos de prueba: se fabricaron 2 abonos nuevos vía API (`[PREQA-SCRUM948-CHEQUE]`/`[-EFECTIVO]`,
 * ids 4/5) para tener diversidad de metodo_pago/estado — dev solo tenía 3 abonos preexistentes,
 * los 3 con el mismo método (transferencia) y estado (confirmado), insuficiente para ejercitar
 * combinaciones AND reales. Quedan en dev, identificables por el prefijo.
 *
 * Cuenta real (password = email, roster CoreUserSeeder): Contabilidad Test (lider_admin_contab):
 * contabilidad@test.com
 */
const DEV = (process.env.E2E_BASE_URL ?? 'http://localhost:8092')

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })
test.setTimeout(60000)

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${DEV}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1200)
}

test('SCRUM-948 — Registrar Abono: buscadores/filtros presentes, mismo patrón que Cobros', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.waitForTimeout(1200)

  await expect(page.getByPlaceholder(/buscar por cliente/i)).toBeVisible()
  const selects = page.locator('select')
  // Cliente, Método, Estado, + selector de cantidad por página (no es un filtro de búsqueda)
  await expect(selects).toHaveCount(4)
  await expect(page.locator('input[type="date"]')).toHaveCount(2)
  // Sin filtros activos, Limpiar no debe mostrarse (mismo comportamiento que Cobros).
  await expect(page.getByRole('button', { name: /limpiar/i })).toHaveCount(0)
})

test('SCRUM-948 — buscador de texto filtra la tabla y el botón Limpiar aparece/desaparece', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.waitForTimeout(1200)

  const totalRowsBefore = await page.locator('table tbody tr').count()
  expect(totalRowsBefore).toBeGreaterThanOrEqual(5) // 3 preexistentes + 2 fixtures de este batch

  const search = page.getByPlaceholder(/buscar por cliente/i)
  await search.fill('PREQA-SCRUM948-CHEQUE')
  await page.waitForTimeout(900)
  await expect(page.locator('table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /limpiar/i })).toBeVisible()

  await page.getByRole('button', { name: /limpiar/i }).click()
  await page.waitForTimeout(800)
  await expect(search).toHaveValue('')
  await expect(page.getByRole('button', { name: /limpiar/i })).toHaveCount(0)
  const rowsAfterClear = await page.locator('table tbody tr').count()
  expect(rowsAfterClear).toBe(totalRowsBefore)
})

test('SCRUM-948 — filtros Cliente/Método/Estado se combinan con lógica AND, no OR', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.waitForTimeout(1200)

  const selects = page.locator('select')
  const metodoSelect = selects.nth(1)
  const estadoSelect = selects.nth(2)

  // metodo=cheque solo -> 1 fila (fixture [PREQA-SCRUM948-CHEQUE])
  await metodoSelect.selectOption('cheque')
  await page.waitForTimeout(800)
  await expect(page.locator('table tbody tr')).toHaveCount(1)

  // reset metodo, estado=por_confirmar solo -> 2 filas (ambos fixtures, nacen por_confirmar)
  await metodoSelect.selectOption('')
  await page.waitForTimeout(500)
  await estadoSelect.selectOption('por_confirmar')
  await page.waitForTimeout(800)
  await expect(page.locator('table tbody tr')).toHaveCount(2)

  // combinado AND real: estado=por_confirmar + metodo=efectivo -> 1 fila (solo el fixture efectivo)
  await metodoSelect.selectOption('efectivo')
  await page.waitForTimeout(800)
  await expect(page.locator('table tbody tr')).toHaveCount(1)

  // combinación IMPOSIBLE (AND, no OR): confirmado + efectivo -> el fixture efectivo nace
  // por_confirmar, nunca confirmado -> 0 filas. Si esto devolviera >0 sería evidencia de que el
  // filtro combina con OR en vez de AND.
  await estadoSelect.selectOption('confirmado')
  await page.waitForTimeout(800)
  await expect(page.locator('table tbody tr')).toHaveCount(0)

  await page.getByRole('button', { name: /limpiar/i }).click()
  await page.waitForTimeout(800)
  const rowsAfterClear = await page.locator('table tbody tr').count()
  expect(rowsAfterClear).toBeGreaterThanOrEqual(5)
})

test('SCRUM-948 — el select de Cliente deriva sus opciones de las filas ya filtradas (mismo patrón que Cobros)', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.waitForTimeout(1200)

  const selects = page.locator('select')
  const clienteSelect = selects.nth(0)
  const metodoSelect = selects.nth(1)

  const optionsBefore = await clienteSelect.locator('option').count()
  await metodoSelect.selectOption('cheque')
  await page.waitForTimeout(800)
  const optionsAfter = await clienteSelect.locator('option').allTextContents()
  // Con metodo=cheque activo, el dropdown de Cliente se reduce a los clientes que SÍ tienen un
  // abono con ese método (más la opción "Todos los clientes") — no muestra el catálogo completo.
  expect(optionsAfter.length).toBeLessThan(optionsBefore)
  expect(optionsAfter.some(t => /todos los clientes/i.test(t))).toBe(true)
})

test('SCRUM-948 — rango de fechas desde/hasta es inclusive en el borde exacto', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/abonos`)
  await page.waitForTimeout(1200)

  // OJO: usar la fecha LOCAL del navegador/servidor, no `new Date().toISOString()` (UTC) — con
  // Panama en UTC-5, `toISOString().slice(0,10)` puede adelantarse un día y dar 0 resultados por
  // error de cálculo del test, no del producto (trampa real encontrada corriendo esto en vivo).
  const today = await page.evaluate(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })

  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill(today)
  await dateInputs.nth(1).fill(today)
  await page.waitForTimeout(1000)
  // Los 2 fixtures de este batch nacieron hoy -> desde=hasta=hoy debe incluirlos (inclusive).
  await expect(page.locator('table tbody tr')).toHaveCount(2)
})

test('SCRUM-948 — Historial de cobros (Cobros) sigue funcionando sin regresión', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/cobros`)
  await page.waitForTimeout(1200)

  await expect(page.getByPlaceholder(/buscar por cliente, factura/i)).toBeVisible()
  await expect(page.locator('select')).toHaveCount(4)
  await expect(page.locator('input[type="date"]')).toHaveCount(2)
  await expect(page.locator('body')).not.toContainText(/error 500|application error/i)
})
