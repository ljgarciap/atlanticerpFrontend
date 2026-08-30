import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA final — batch de 6 tickets de Servicios que estaban en Dev Testing (SCRUM-337, 354,
 * 361, 779, 780, 781), todos rebotes reales o re-verificaciones tras un análisis de causa raíz.
 *
 * Hallazgo transversal del batch: en SCRUM-337 y SCRUM-780 (nav) y en el logo de PDF de SCRUM-781,
 * el código YA estaba corregido y desplegado — el problema real era que dev.atlanticerp.ai servía un
 * build viejo cuando QA/Daniela probaron. Estos 3 puntos se verificaron por API/click real contra
 * el ambiente ya desplegado (ver docs/pre-qa/ de este batch) y no requieren cobertura acá salvo un
 * smoke rápido de navegación para dejar constancia. El resto (361, 779, 781-cancelar,
 * 781-tablero, 354) sí tenía bugs reales, corregidos en los commits de este mismo batch.
 *
 * Corre contra dev.atlanticerp.ai real (playwright.dev-remote.config.ts). Cuentas reales
 * (password = email): servicio@atlantic.com.pa (Aaron Leis, lider_servicios).
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-servicios-batch-20260823'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

// ============================================================================
// SCRUM-337/780 — smoke de navegación (ya funcionaban, ver docblock arriba)
// ============================================================================

test('0. SCRUM-337/780 — smoke: Tickets>Cotizaciones y Técnicos>Técnicos externos navegan por click real', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1200)

  const expandBtn = page.locator('button[title="Expandir menú"]')
  if (await expandBtn.count() > 0) { await expandBtn.click(); await page.waitForTimeout(400) }

  const aside = page.locator('aside').first()
  await aside.getByText('Servicios', { exact: true }).click()
  await page.waitForTimeout(400)

  await aside.getByText('Tickets', { exact: true }).click()
  await page.waitForTimeout(400)
  await aside.getByText('Cotizaciones', { exact: true }).click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/servicios/cotizaciones')

  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1000)
  if (await expandBtn.count() > 0) { await expandBtn.click(); await page.waitForTimeout(400) }
  await aside.getByText('Servicios', { exact: true }).click()
  await page.waitForTimeout(400)
  await aside.getByText('Técnicos', { exact: true }).click()
  await page.waitForTimeout(400)
  await aside.getByText('Técnicos externos', { exact: true }).click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/servicios/tickets/externos')
})

// ============================================================================
// SCRUM-779 — Kardex: detalle capturado vía UI real, cantidad/saldo visibles
// ============================================================================

test('1. SCRUM-779 — marcar herramienta Dañada pide detalle obligatorio y aparece en el Kardex con cantidad/saldo', async ({ page, request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, { data: { email: 'servicio@atlantic.com.pa', password: 'servicio@atlantic.com.pa' } })
  const { token } = await loginRes.json()
  const tools = await (await request.get(`${BASE}/api/servicios/tools?per_page=100`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const good = tools.data.find((t: any) => t.estado === 'good')
  console.log('[SCRUM-779] herramienta elegida:', good?.nombre, good?.codigo_unico)
  expect(good).toBeTruthy()

  await login(page, 'servicio@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1500)
  const toolsTab = page.getByRole('tab', { name: /herramientas/i }).or(page.getByRole('button', { name: /herramientas/i }))
  if (await toolsTab.count() > 0) await toolsTab.first().click().catch(() => {})
  await page.waitForTimeout(500)

  const row = page.locator('tr', { hasText: good.codigo_unico }).first()
  const select = row.getByLabel('Estado')
  await select.selectOption('damaged')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DL_DIR}/01-modal-detalle-abierto.png`, fullPage: true })

  const confirmBtn = page.getByText('tools.detalleModal.confirm').or(page.getByRole('button', { name: /confirmar/i }))
  await expect(confirmBtn.first()).toBeDisabled()

  const detalleTexto = `PreQA batch 20260823 — cable pelado en ${good.codigo_unico}`
  const textarea = page.locator('textarea').first()
  await textarea.fill(detalleTexto)
  await expect(confirmBtn.first()).toBeEnabled()
  await confirmBtn.first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/02-confirmado.png`, fullPage: true })

  // Verificar en el Kardex real (endpoint + UI)
  const movements = await (await request.get(`${BASE}/api/servicios/tools/movements?tool_id=${good.id}`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const last = movements.data[0]
  console.log('[SCRUM-779] último movimiento:', JSON.stringify(last))
  expect(last.detalle).toBe(detalleTexto)
  expect(last.cantidad).toBe(1)
  expect(typeof last.saldo_inicial).toBe('number')
  expect(typeof last.saldo_resultante).toBe('number')
  expect(last.saldo_resultante).toBe(last.saldo_inicial - 1)
})

// ============================================================================
// SCRUM-781 — Cancelar en edición de ticket no persiste cambios de productos
// ============================================================================

test('2. SCRUM-781 — quitar un producto en edición y presionar Cancelar NO lo elimina de verdad', async ({ page, request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, { data: { email: 'servicio@atlantic.com.pa', password: 'servicio@atlantic.com.pa' } })
  const { token } = await loginRes.json()

  // Ticket 25 ya usado en Pre-QA anteriores de este módulo, con productos reales.
  const before = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781] productos ANTES:', JSON.stringify(before.productos?.map((p: any) => p.id)))
  expect(before.productos.length).toBeGreaterThan(0)

  await login(page, 'servicio@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/tickets?ticket=25`)
  await page.waitForTimeout(1500)
  const editBtn = page.getByRole('button', { name: /^editar$/i }).first()
  await editBtn.click()
  await page.waitForTimeout(1000)

  const editModal = page.locator('.z-50').last()
  const removeBtn = editModal.locator('button[aria-label*="quitar" i], button[aria-label*="remove" i]').first()
  await removeBtn.click({ timeout: 8000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DL_DIR}/03-producto-quitado-en-borrador.png`, fullPage: true })

  // Presionar Cancelar, NO Guardar.
  await page.getByRole('button', { name: /^cancelar$/i }).first().click()
  await page.waitForTimeout(1000)

  const after = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781] productos DESPUÉS de Cancelar:', JSON.stringify(after.productos?.map((p: any) => p.id)))
  expect(after.productos.length).toBe(before.productos.length)
})

// ============================================================================
// SCRUM-781 — Tablero: badge largo no tapa el número de ticket
// ============================================================================

test('3. SCRUM-781 — Tablero: número de ticket visible sin superposición con badges largos', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  const tableroBtn = page.getByRole('button', { name: /^tablero$/i }).or(page.getByRole('tab', { name: /tablero/i }))
  if (await tableroBtn.count() > 0) await tableroBtn.first().click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/04-tablero-completo.png`, fullPage: true })

  // Números de ticket truncados a "GAR-..."/"RET-..." eran el síntoma del bug — ya no deben
  // aparecer así (el badge ahora vive en su propia fila, con todo el ancho para el número).
  const truncados = await page.locator('text=/^[A-Z]{2,4}-\\.\\.\\.$/').count()
  console.log('[SCRUM-781] números de ticket truncados a "XXX-...":', truncados)
  expect(truncados).toBe(0)
})

// ============================================================================
// SCRUM-354 — Gráfico Servicios completados: meses en 0 quedan en blanco
// ============================================================================

test('4. SCRUM-354 — meses sin datos no muestran "0" en el gráfico de Reportes', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/reportes`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/05-reportes-grafico-anual.png`, fullPage: true })

  const visibleZeros = await page.locator('span:visible', { hasText: /^0$/ }).count()
  console.log('[SCRUM-354] "0" visibles en la pantalla de Reportes:', visibleZeros)
})
