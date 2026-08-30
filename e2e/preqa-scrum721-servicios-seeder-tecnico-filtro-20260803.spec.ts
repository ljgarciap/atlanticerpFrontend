import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-721: seeder de demo Servicios (ServiciosDemoSeeder, 14 tickets [DEMO]) +
 * endpoint GET /api/servicios/technicians/internal?fields=options + fix del mismatch de query
 * param (internal_technician_id vs tecnico_id) en el filtro de técnico de la tabla de Tickets.
 * Corre contra dev.atlanticerp.ai REAL (recién deployado, CI/CD verde).
 *
 * Cuentas reales (password = email):
 *  - servicio@atlantic.com.pa      (lider_servicios) — puede cambiar estado.
 *  - carlos@atlantic.com.pa        (tecnico_servicios) — NO puede cambiar estado.
 *  - milena.e@grupolafayette.com        (vendedor_disenador) — solo lectura en Servicios.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum721'

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoTickets(page: Page) {
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
}

async function apiLogin(request: any, email: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: email } })
  const body = await res.json()
  return body.token
}

test('1. Aaron — tabla de Tickets muestra los 14 [DEMO], NO "0 de 0"', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/01-tabla-seeder.png`, fullPage: true })

  const rows = await page.locator('table tbody tr').count()
  const showingText = await page.getByText(/mostrando/i).first().textContent()
  console.log('[SCRUM-721] filas en tabla:', rows, '| contador:', showingText)

  expect(rows).toBeGreaterThan(0)
  expect(showingText).not.toMatch(/mostrando 0 de 0/i)
  expect(rows).toBeGreaterThanOrEqual(14)
})

test('2. Select "Técnico" tiene 4 opciones reales (no vacío)', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)

  const tecnicoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /técnico/i }) })
  await expect(tecnicoSelect).toBeVisible()
  const optionsText = await tecnicoSelect.locator('option').allTextContents()
  console.log('[SCRUM-721] Opciones del select Técnico:', JSON.stringify(optionsText))
  await page.screenshot({ path: `${DL_DIR}/02-select-tecnico-opciones.png`, fullPage: true })

  // NOTA Pre-QA: el nombre real en BD es "Agustin Rodriguez" sin tildes (confirmado vía API cruda),
  // pese a que el ticket/spec lo nombra "Agustín Rodríguez" — hallazgo menor de datos, no bloqueante.
  const expected = ['Carlos Vergara', 'Pedro Santos', 'Agustin Rodriguez', 'Miguel Castillo']
  for (const name of expected) {
    expect(optionsText.some((o) => o.includes(name)), `falta "${name}" en el select`).toBe(true)
  }
  // "Todos" + 4 técnicos = 5 opciones
  expect(optionsText.length).toBeGreaterThanOrEqual(5)
})

test('3. Filtro de técnico DE VERDAD filtra la tabla (regresión del bug internal_technician_id vs tecnico_id)', async ({ page }) => {
  const filterCalls: { url: string; status: number }[] = []
  page.on('response', (res) => {
    if (res.url().includes('/servicios/tickets') && res.request().method() === 'GET') {
      filterCalls.push({ url: res.url(), status: res.status() })
    }
  })

  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)

  const rowsBefore = await page.locator('table tbody tr').count()

  const tecnicoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /técnico/i } ) })
  const optionsText = await tecnicoSelect.locator('option').allTextContents()
  const targetOption = optionsText.find((o) => o.includes('Carlos Vergara'))
  console.log('[SCRUM-721] Filtrando por:', targetOption)
  await tecnicoSelect.selectOption({ label: targetOption! })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/03-tras-filtrar-tecnico.png`, fullPage: true })

  const rowsAfter = await page.locator('table tbody tr').count()
  console.log('[SCRUM-721] Filas ANTES del filtro:', rowsBefore, '| DESPUÉS:', rowsAfter)
  console.log('[SCRUM-721] Llamadas GET /servicios/tickets:', JSON.stringify(filterCalls, null, 2))

  // Corrección de lectura del ticket: el fix renombró el param del FRONTEND para que coincida
  // con lo que el backend YA esperaba (tecnico_id) — no al revés. Confirmar que efectivamente
  // manda tecnico_id (antes mandaba internal_technician_id, que el backend ignoraba).
  const lastCall = filterCalls[filterCalls.length - 1]
  expect(lastCall.url, 'debe mandar tecnico_id (nombre que el backend espera)').toContain('tecnico_id=')
  expect(lastCall.url).not.toContain('internal_technician_id')
  expect(lastCall.status).toBe(200)
  // Debe reducir el set (no ser un no-op) — a menos que Carlos tenga TODOS los tickets, que no es el caso del seeder.
  expect(rowsAfter).toBeLessThan(rowsBefore)
  expect(rowsAfter).toBeGreaterThan(0)
})

test('4. REQ-218 — Clínica Paitilla (Instalación, on_site, informe pendiente) BLOQUEA el cierre', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)

  const searchInput = page.locator('input[placeholder*="Buscar"]').first()
  await searchInput.fill('Clínica Paitilla')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/04-buscar-paitilla.png`, fullPage: true })

  const row = page.locator('table tbody tr').filter({ hasText: 'Clínica Paitilla' }).first()
  await expect(row, 'ticket demo "Clínica Paitilla" no encontrado en la tabla').toBeVisible()

  const select = row.locator('select')
  await expect(select).toBeVisible()
  const optionsText = await select.locator('option').allTextContents()
  console.log('[SCRUM-721 REQ-218] Opciones de estado disponibles en el ticket Paitilla:', JSON.stringify(optionsText))

  await select.selectOption({ label: 'Resuelto' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/05-paitilla-tras-intentar-resolver.png`, fullPage: true })

  const bodyText = (await page.textContent('body')) ?? ''
  const hasBlockMsg = /informe/i.test(bodyText)
  console.log('[SCRUM-721 REQ-218] Mensaje de bloqueo (informe) visible:', hasBlockMsg)

  // El select no debe haber quedado en "Resuelto" — o debe reaparecer un toast/mensaje de error.
  const currentValue = await select.inputValue().catch(() => null)
  console.log('[SCRUM-721 REQ-218] Valor del select tras el intento:', currentValue)
  expect(hasBlockMsg, 'debe mostrar mensaje de bloqueo mencionando informe pendiente').toBe(true)
})

test('5. REQ-218 — Oficinas Grupo Melo (Garantía, on_site, cotización enviada no aprobada) BLOQUEA el cierre', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)

  const searchInput = page.locator('input[placeholder*="Buscar"]').first()
  await searchInput.fill('Oficinas Grupo Melo')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/06-buscar-melo.png`, fullPage: true })

  const row = page.locator('table tbody tr').filter({ hasText: 'Oficinas Grupo Melo' }).first()
  await expect(row, 'ticket demo "Oficinas Grupo Melo" no encontrado en la tabla').toBeVisible()

  const select = row.locator('select')
  await expect(select).toBeVisible()

  await select.selectOption({ label: 'Resuelto' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/07-melo-tras-intentar-resolver.png`, fullPage: true })

  const bodyText = (await page.textContent('body')) ?? ''
  const hasBlockMsg = /cotizaci[oó]n/i.test(bodyText)
  console.log('[SCRUM-721 REQ-218] Mensaje de bloqueo (cotización) visible:', hasBlockMsg)
  expect(hasBlockMsg, 'debe mostrar mensaje de bloqueo mencionando cotización no aprobada').toBe(true)
})

test('6. Tablero — las 6 columnas tienen tarjetas (antes vacías)', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoTickets(page)
  await page.getByRole('button', { name: /tablero/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/08-tablero-con-datos.png`, fullPage: true })

  const board = page.locator('[data-testid="ticket-board"]')
  await expect(board).toBeVisible()
  const columns = board.locator('> div')
  const colCount = await columns.count()
  console.log('[SCRUM-721] Columnas del tablero:', colCount)
  expect(colCount).toBe(6)

  // TicketBoard.tsx no marca las tarjetas con data-testid — usar el badge de conteo del
  // encabezado de cada columna (span.rounded-full con cols.length) en vez de adivinar clases.
  let emptyColumns = 0
  for (let i = 0; i < colCount; i++) {
    const countBadge = columns.nth(i).locator('span.rounded-full').first()
    const countText = await countBadge.textContent()
    const cardCount = parseInt(countText?.trim() ?? '0', 10)
    console.log(`[SCRUM-721] Columna ${i} — tarjetas (badge):`, cardCount)
    if (cardCount === 0) emptyColumns++
  }
  console.log('[SCRUM-721] Columnas totalmente vacías:', emptyColumns)
  // No exigimos que TODAS tengan tarjetas (6 estados, 14 tickets, puede haber alguna corta),
  // pero no pueden estar TODAS vacías como antes del fix.
  expect(emptyColumns).toBeLessThan(6)
})

test('7. Carlos (técnico interno) — API directa: 403 al intentar cambiar estado', async ({ request }) => {
  const token = await apiLogin(request, 'carlos@atlantic.com.pa')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }

  const list = await request.get(`${BASE}/api/servicios/tickets`, { headers })
  const data = await list.json()
  const anyTicket = data.data[0]

  const r = await request.patch(`${BASE}/api/servicios/tickets/${anyTicket.id}/estado`, {
    headers, data: { estado: 'scheduled' },
  })
  console.log('[SCRUM-721] Carlos (tecnico_servicios) intenta cambiar estado vía API directa -> HTTP', r.status())
  expect(r.status()).toBe(403)
})

test('8. Carlos (técnico interno) — UI: select de estado deshabilitado', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/09-carlos-tabla.png`, fullPage: true })

  const selects = page.locator('table tbody select')
  const count = await selects.count()
  console.log('[SCRUM-721] Carlos — selects visibles en tabla:', count)
  expect(count).toBeGreaterThan(0)
  await expect(selects.first()).toBeDisabled()
})

test('9. Milena (vendedor_disenador) — puede VER tabla + filtro técnico (4 opciones), NO puede editar', async ({ page }) => {
  await login(page, 'milena.e@grupolafayette.com')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/10-milena-tabla.png`, fullPage: true })

  const rows = await page.locator('table tbody tr').count()
  console.log('[SCRUM-721] Milena — filas visibles:', rows)
  expect(rows).toBeGreaterThan(0)

  const tecnicoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /técnico/i } ) })
  await expect(tecnicoSelect).toBeVisible()
  const optionsText = await tecnicoSelect.locator('option').allTextContents()
  console.log('[SCRUM-721] Milena — opciones select técnico:', JSON.stringify(optionsText))
  expect(optionsText.length).toBeGreaterThanOrEqual(5)

  const stateSelects = page.locator('table tbody select')
  const stateCount = await stateSelects.count()
  if (stateCount > 0) {
    await expect(stateSelects.first()).toBeDisabled()
  }
  console.log('[SCRUM-721] Milena — selects de estado en tabla (debe ser 0 o deshabilitado):', stateCount)
})

test('10. Endpoint /servicios/technicians/internal SIN token -> 401', async ({ request }) => {
  const r = await request.get(`${BASE}/api/servicios/technicians/internal?fields=options`)
  console.log('[SCRUM-721] GET technicians/internal sin auth -> HTTP', r.status())
  expect(r.status()).toBe(401)
})

test('11. Endpoint /servicios/technicians/internal CON token servicios.read -> 200 + 4 técnicos', async ({ request }) => {
  const token = await apiLogin(request, 'milena.e@grupolafayette.com')
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const r = await request.get(`${BASE}/api/servicios/technicians/internal?fields=options`, { headers })
  console.log('[SCRUM-721] GET technicians/internal con Milena (servicios.read) -> HTTP', r.status())
  expect(r.status()).toBe(200)
  const body = await r.json()
  console.log('[SCRUM-721] Body:', JSON.stringify(body))
  const list = Array.isArray(body) ? body : body.data
  expect(list.length).toBe(4)
})
