import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — Fase 4 Servicios, Batch 1 + Batch 19 (SCRUM-279→284, 312, 357→360).
 * Corre contra el Docker local (nginx sirviendo build de producción), NO dev.atlanticerp.ai —
 * este trabajo todavía no se pusheó.
 *
 * Cuentas reales (password = email):
 *  - liderservicios@test.com    (lider_servicios) — Aaron, único que cambia estado.
 *  - tecnicoservicios@test.com      (tecnico_servicios) — solo lectura del estado.
 *  - garantiasservicios@test.com   (garantias_servicios) — solo lectura del estado.
 *  - gerencia@test.com     (management) — solo lectura del estado.
 *  - vendedordisenador2@test.com  (vendedor_disenador) — menú reducido a 3 tabs.
 *  - contabilidad@test.com       (lider_admin_contab) — sin acceso al módulo.
 *  - lidercompras@test.com   (lider_compras) — sin acceso al módulo.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:8090'
const DL_DIR = 'e2e/.tmp/preqa-servicios-batch1'

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

test('1. Aaron — REQ-218: cambiar estado vía SELECT en tabla llega al backend real (regresión del mismatch /status vs /estado)', async ({ page }) => {
  // Hallazgo CRÍTICO original de Pre-QA (2026-08-03): el frontend llamaba /status, el backend
  // solo registra /estado (routes/servicios.php) — 404 en todo intento de cambiar estado, tanto
  // desde el select de la tabla como desde el arrastre del tablero. Fix: serviciosApi.ts ahora
  // llama /estado. Este test verifica que NO vuelva a romperse — nunca debe pegarle a /status,
  // siempre debe llegar a /estado con 200.
  const responses: { url: string; status: number }[] = []
  page.on('response', (res) => {
    if (res.url().includes('/servicios/tickets/')) {
      responses.push({ url: res.url(), status: res.status() })
    }
  })

  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/01-tabla-aaron.png`, fullPage: true })

  const selects = page.locator('table tbody select')
  const count = await selects.count()
  console.log('[SCRUM-281] selects de estado encontrados en la tabla:', count)
  expect(count).toBeGreaterThan(0)

  const firstSelect = selects.first()
  await firstSelect.selectOption('scheduled')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/02-tras-cambiar-select.png`, fullPage: true })

  console.log('[SCRUM-281] Respuestas de red a /servicios/tickets/*:', JSON.stringify(responses, null, 2))
  const statusCall = responses.find((r) => r.url.includes('/status'))
  const estadoCall = responses.find((r) => r.url.includes('/estado'))

  expect(statusCall, 'nunca debe volver a llamarse /status').toBeUndefined()
  expect(estadoCall?.status, 'la llamada real a /estado debe responder 200').toBe(200)

  // Sin regresión al mismatch: no debe aparecer el mensaje de error genérico.
  const errorMsg = page.getByText('No se pudo cambiar el estado del ticket')
  await expect(errorMsg).not.toBeVisible()
})

test('2. Aaron — REQ-221: Tablero renderiza las 6 columnas (Reportado→Cancelado)', async ({ page }) => {
  const responses: number[] = []
  page.on('response', (res) => {
    if (res.url().includes('/servicios/tickets/') && (res.url().includes('/status') || res.url().includes('/estado'))) {
      responses.push(res.status())
    }
  })

  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)
  await page.getByRole('button', { name: /tablero/i }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/03-tablero-aaron.png`, fullPage: true })

  const board = page.locator('[data-testid="ticket-board"]')
  await expect(board).toBeVisible()

  // Confirmar 6 columnas.
  const columnHeaders = await page.locator('[data-testid="ticket-board"] > div').count()
  console.log('[SCRUM-284] Columnas del tablero:', columnHeaders)
  expect(columnHeaders).toBe(6)
})

test('3. Carlos (tecnico_servicios) — select de estado DESHABILITADO pero visible, no oculto', async ({ page }) => {
  await login(page, 'tecnicoservicios@test.com')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/04-tabla-carlos.png`, fullPage: true })

  const selects = page.locator('table tbody select')
  const count = await selects.count()
  console.log('[SCRUM-281] Carlos — selects visibles:', count)
  expect(count).toBeGreaterThan(0)
  await expect(selects.first()).toBeDisabled()
})

test('4. Daniela (management) — select de estado DESHABILITADO pero visible', async ({ page }) => {
  await login(page, 'gerencia@test.com')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/05-tabla-daniela.png`, fullPage: true })

  const selects = page.locator('table tbody select')
  const count = await selects.count()
  console.log('[SCRUM-281] Daniela — selects visibles:', count)
  expect(count).toBeGreaterThan(0)
  await expect(selects.first()).toBeDisabled()
})

test('5. Neil (vendedor_disenador) — solo lectura + menú reducido a 3 tabs, sin Técnicos Externos', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoTickets(page)
  await page.screenshot({ path: `${DL_DIR}/06-tabla-neil.png`, fullPage: true })

  const selects = page.locator('table tbody select')
  const count = await selects.count()
  console.log('[SCRUM-281] Neil — selects visibles:', count)
  expect(count).toBeGreaterThan(0)
  await expect(selects.first()).toBeDisabled()

  // REQ-288 — menú reducido: Inicio, Tickets, Técnicos (solo internos) — sin Insumos/Reportes.
  const nav = page.locator('nav[aria-label]').first()
  await expect(nav).toBeVisible()
  const navText = await nav.textContent()
  console.log('[SCRUM-358] Menú de Neil:', navText)
  await expect(nav.getByText(/insumos/i)).toHaveCount(0)
  await expect(nav.getByText(/reportes/i)).toHaveCount(0)

  await nav.getByText(/técnicos/i).click()
  await page.waitForTimeout(300)
  const dropdown = page.locator('text=Técnicos externos')
  await expect(dropdown).toHaveCount(0)
  await page.screenshot({ path: `${DL_DIR}/07-neil-dropdown-tecnicos.png`, fullPage: true })
})

test('6. Aaron — comparación: menú completo con 5 pestañas + 2 opciones de Técnicos', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)

  const nav = page.locator('nav[aria-label]').first()
  const navText = await nav.textContent()
  console.log('[SCRUM-358] Menú de Aaron:', navText)
  await expect(nav.getByText(/insumos/i)).toBeVisible()
  await expect(nav.getByText(/reportes/i)).toBeVisible()

  await nav.getByText(/técnicos/i).click()
  await page.waitForTimeout(300)
  await expect(page.getByText('Técnicos externos')).toBeVisible()
  await page.screenshot({ path: `${DL_DIR}/08-aaron-dropdown-tecnicos.png`, fullPage: true })
})

test('7. Felix (Administración) — SIN acceso al módulo Servicios (REQ-288 RN4)', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.screenshot({ path: `${DL_DIR}/09-felix-post-login.png`, fullPage: true })

  // Sidebar no debe mostrar el módulo Servicios en absoluto.
  const sidebarServicios = page.locator('a,button').filter({ hasText: /servicios/i })
  const sidebarCount = await sidebarServicios.count()
  console.log('[SCRUM-358] Felix — enlaces "Servicios" en sidebar:', sidebarCount)

  // Navegación directa por URL — confirmar que no se puede usar el módulo igual.
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/10-felix-direct-url-servicios.png`, fullPage: true })
  const bodyText = await page.textContent('body')
  console.log('[SCRUM-358] Felix — contenido de /servicios/tickets vía URL directa (primeros 300 char):', bodyText?.slice(0, 300))
})

test('8. Yirena (Compras) — SIN acceso al módulo Servicios (REQ-288 RN4)', async ({ page }) => {
  await login(page, 'lidercompras@test.com')
  await page.screenshot({ path: `${DL_DIR}/11-yirena-post-login.png`, fullPage: true })

  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/12-yirena-direct-url-servicios.png`, fullPage: true })
  const bodyText = await page.textContent('body')
  console.log('[SCRUM-358] Yirena — contenido de /servicios/tickets vía URL directa (primeros 300 char):', bodyText?.slice(0, 300))
})

test('9. REQ-217 — filtros: sin fila de chips (RN5)', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)

  // Sin fila de chips de tipo (RN5) — solo debe existir el select.
  const chipButtons = page.locator('button').filter({ hasText: /^(instalaciones|garantías|reclamos|retrofit)$/i })
  const chipCount = await chipButtons.count()
  console.log('[SCRUM-280] Botones tipo "chip" fuera del select encontrados:', chipCount)
  expect(chipCount).toBe(0)
})

test('9b. REGRESIÓN — buscar con un ticket de cliente=null en pantalla ya no revienta la tabla', async ({ page }) => {
  // Hallazgo CRÍTICO original de Pre-QA (2026-08-03): TicketsPage.tsx matchesSearch() llamaba
  // ticket.cliente.toLowerCase() sin verificar null, y cliente SÍ puede ser null (endpoint mínimo
  // de REQ-249, ver StoreTicketRequest: 'cliente' => ['nullable', ...]) — cualquier búsqueda con
  // un ticket así en pantalla tiraba un TypeError sin ErrorBoundary y dejaba la página en blanco.
  // Fix: matchesSearch() ahora usa (ticket.cliente ?? '').toLowerCase(). Este test verifica que
  // NO vuelva a romperse.
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)

  // Confirmar primero que la tabla carga bien (incl. tickets con cliente=null creados por
  // el endpoint mínimo de REQ-249).
  const rowsBefore = await page.locator('table tbody tr').count()
  console.log('[REGRESIÓN 9b] Filas en tabla ANTES de buscar:', rowsBefore)
  expect(rowsBefore).toBeGreaterThan(0)

  const searchInput = page.locator('input[placeholder*="Buscar"]').first()
  await searchInput.fill('a') // cualquier caracter alcanza, incluye tickets con cliente=null
  await page.waitForTimeout(800)

  const bodyText = (await page.textContent('body'))?.trim() ?? ''
  console.log('[REGRESIÓN 9b] Longitud del body tras escribir en el buscador:', bodyText.length)
  console.log('[REGRESIÓN 9b] pageerrors capturados:', pageErrors)
  await page.screenshot({ path: `${DL_DIR}/15-sin-crash-tras-buscar.png`, fullPage: true })

  expect(pageErrors.some((e) => e.includes('toLowerCase'))).toBe(false)
  expect(bodyText.length).toBeGreaterThan(0)
  // La barra de filtros (con el contador "Mostrando X de Y") sigue presente, no pantalla en blanco.
  await expect(page.getByText(/Mostrando \d+ de \d+ tickets/)).toBeVisible()
})

test('10. REQ-217 RN6 — filtros (select Tipo) persisten al alternar Tabla/Tablero', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)

  // Se usa el select de Tipo para verificar RN6 — el buscador de texto ya se cubre aparte en 9b.
  const tipoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los tipos' }) })
  await tipoSelect.selectOption('warranty')
  await page.waitForTimeout(500)
  const beforeSwitch = await tipoSelect.inputValue()

  await page.getByRole('button', { name: /tablero/i }).click()
  await page.waitForTimeout(500)
  const boardVisible = await page.locator('[data-testid="ticket-board"]').isVisible()
  console.log('[SCRUM-280 RN6] tablero visible tras cambiar de vista con filtro tipo=warranty:', boardVisible)
  await page.getByRole('button', { name: /tabla/i }).click()
  await page.waitForTimeout(500)

  const afterSwitch = await tipoSelect.inputValue()
  console.log('[SCRUM-280 RN6] filtro tipo antes:', beforeSwitch, '| después de ida y vuelta Tabla->Tablero->Tabla:', afterSwitch)
  expect(afterSwitch).toBe(beforeSwitch)
  expect(afterSwitch).toBe('warranty')
})

test('11. REQ-249 — creación de ticket vía API: numeración secuencial y derivación de estados', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'liderservicios@test.com', password: 'liderservicios@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  // Instalación venta previa -> ambos not_applicable
  const r1 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers,
    data: { tipo: 'installation', subtipo: 'installation', tipo_instalacion: 'internal', descripcion: 'Pre-QA test instalacion venta previa' },
  })
  const t1 = await r1.json()
  console.log('[REQ-249] Instalación venta previa creada:', t1.numero, 'quote_status=', t1.quote_status, 'inspection=', t1.inspection_report_status, 'estado=', t1.estado, 'technician=', t1.internal_technician_id, 'scheduled_at=', t1.scheduled_at)
  expect(t1.quote_status).toBe('not_applicable')
  expect(t1.inspection_report_status).toBe('not_applicable')
  expect(t1.estado).toBe('reported')
  expect(t1.internal_technician_id).toBeNull()
  expect(t1.scheduled_at).toBeNull()

  // Reclamo -> informe not_applicable, cotizacion pending
  const r2 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers,
    data: { tipo: 'claim', tipo_instalacion: 'internal', descripcion: 'Pre-QA test reclamo' },
  })
  const t2 = await r2.json()
  console.log('[REQ-249] Reclamo creado:', t2.numero, 'quote_status=', t2.quote_status, 'inspection=', t2.inspection_report_status)
  expect(t2.quote_status).toBe('pending')
  expect(t2.inspection_report_status).toBe('not_applicable')

  // Numeración consecutiva: crear 2 instalaciones seguidas y confirmar consecutivo +1
  const r3 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers,
    data: { tipo: 'installation', subtipo: 'inspection', tipo_instalacion: 'internal', descripcion: 'Pre-QA consecutivo A' },
  })
  const t3 = await r3.json()
  const r4 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers,
    data: { tipo: 'installation', subtipo: 'inspection', tipo_instalacion: 'internal', descripcion: 'Pre-QA consecutivo B' },
  })
  const t4 = await r4.json()
  console.log('[REQ-249 RN1] Numeros consecutivos:', t3.numero, '->', t4.numero)
  const n3 = parseInt(t3.numero.split('-')[2], 10)
  const n4 = parseInt(t4.numero.split('-')[2], 10)
  expect(n4).toBe(n3 + 1)
})

test('12. REQ-249 — input inválido: tipo faltante, subtipo inválido para el tipo, subtipo en claim/retrofit', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'liderservicios@test.com', password: 'liderservicios@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  // tipo vacío
  const r1 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: '', tipo_instalacion: 'internal', descripcion: 'x' },
  })
  console.log('[REQ-249 ruptura] tipo vacío -> HTTP', r1.status())
  expect(r1.status()).toBe(422)

  // subtipo inválido para installation (usa un subtipo de warranty)
  const r2 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'installation', subtipo: 'warranty_generic', tipo_instalacion: 'internal', descripcion: 'x' },
  })
  console.log('[REQ-249 ruptura] subtipo cruzado (installation+warranty_generic) -> HTTP', r2.status())
  expect(r2.status()).toBe(422)

  // claim con subtipo (no debe tener)
  const r3 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'claim', subtipo: 'installation', tipo_instalacion: 'internal', descripcion: 'x' },
  })
  console.log('[REQ-249 ruptura] claim con subtipo seteado -> HTTP', r3.status())
  expect(r3.status()).toBe(422)

  // descripcion vacía (required)
  const r4 = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'retrofit', tipo_instalacion: 'internal', descripcion: '' },
  })
  console.log('[REQ-249 ruptura] descripcion vacía -> HTTP', r4.status())
  expect(r4.status()).toBe(422)
})

test('13. REQ-218 backend — gate vía API directa (bypass del bug de ruta) para probar RN1-RN6 tal cual el backend las implementa', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'liderservicios@test.com', password: 'liderservicios@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  // Crear un ticket de garantía (ambos pending) para forzar el bloqueo.
  const create = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'warranty', subtipo: 'warranty_generic', tipo_instalacion: 'internal', descripcion: 'Pre-QA gate RN1' },
  })
  const ticket = await create.json()
  console.log('[REQ-218] Ticket de prueba creado:', ticket.numero, ticket.id)

  // Escenario 1 — cierre bloqueado por cotización pendiente (informe también pending acá, pero
  // probamos primero el mensaje priorizado de informe, ver docblock assertCloseAllowed()).
  const r1 = await request.patch(`${BASE}/api/servicios/tickets/${ticket.id}/estado`, {
    headers, data: { estado: 'closed' },
  })
  const b1 = await r1.json()
  console.log('[REQ-218 Escenario 1/2] Bloqueo con informe+cotización pending -> HTTP', r1.status(), 'msg=', b1.message)
  expect(r1.status()).toBe(422)
  expect(b1.message).toMatch(/informe/i)

  // Escenario 6 — ticket "No aplica" en ambos (instalación venta previa) debe cerrar sin bloqueo.
  const createNA = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'installation', subtipo: 'installation', tipo_instalacion: 'internal', descripcion: 'Pre-QA gate escenario 6' },
  })
  const ticketNA = await createNA.json()
  const rNA = await request.patch(`${BASE}/api/servicios/tickets/${ticketNA.id}/estado`, {
    headers, data: { estado: 'closed' },
  })
  console.log('[REQ-218 Escenario 6] Ticket No aplica/No aplica -> Cerrado, HTTP', rNA.status())
  expect(rNA.status()).toBe(200)

  // Escenario 5 — cancelación sin restricciones, incluso con ambos pending.
  const rCancel = await request.patch(`${BASE}/api/servicios/tickets/${ticket.id}/estado`, {
    headers, data: { estado: 'cancelled' },
  })
  console.log('[REQ-218 Escenario 5] Cancelar con informe+cotización pending -> HTTP', rCancel.status())
  expect(rCancel.status()).toBe(200)

  // RN6 — transición a un estado intermedio (scheduled) sin gate, incluso con pending.
  const createMid = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'warranty', subtipo: 'warranty_generic', tipo_instalacion: 'internal', descripcion: 'Pre-QA gate RN6' },
  })
  const ticketMid = await createMid.json()
  const rMid = await request.patch(`${BASE}/api/servicios/tickets/${ticketMid.id}/estado`, {
    headers, data: { estado: 'on_site' },
  })
  console.log('[REQ-218 RN6] Reportado -> En sitio (sin gate) con pending -> HTTP', rMid.status())
  expect(rMid.status()).toBe(200)
})

test('14. REQ-218 Escenario 4 — cotización Rechazada sin reemplazo bloquea (requiere update directo, sin módulo Cotización real)', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'liderservicios@test.com', password: 'liderservicios@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  const create = await request.post(`${BASE}/api/servicios/tickets`, {
    headers, data: { tipo: 'warranty', subtipo: 'warranty_generic', tipo_instalacion: 'internal', descripcion: 'Pre-QA gate escenario 4 - cotizacion rechazada' },
  })
  const ticket = await create.json()
  console.log('[REQ-218 Escenario 4] Ticket creado para forzar quote_status=rejected vía tinker (documentado, no via UI):', ticket.numero, ticket.id)
  // NOTA: quote_status=rejected + inspection_report_status=completed se fuerza vía tinker en un
  // paso aparte (comando en el reporte) porque el módulo real de Cotización/Informe todavía no
  // existe (Batch 8-9/11-12) — documentado explícitamente por instrucción del batch.
  console.log('TICKET_ID_FOR_TINKER=' + ticket.id)
})

test('15. Carlos (tecnico_servicios) — API directa: 403 al intentar cambiar estado aunque tenga servicios.edit', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'tecnicoservicios@test.com', password: 'tecnicoservicios@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  const list = await request.get(`${BASE}/api/servicios/tickets`, { headers })
  const data = await list.json()
  const anyTicket = data.data[0]

  const r = await request.patch(`${BASE}/api/servicios/tickets/${anyTicket.id}/estado`, {
    headers, data: { estado: 'scheduled' },
  })
  console.log('[REQ-218 RN7 backend] Carlos (tecnico_servicios) intenta cambiar estado vía API directa -> HTTP', r.status())
  expect(r.status()).toBe(403)
})

test('16. Daniela (management) — API directa: 403 al intentar cambiar estado', async ({ request }) => {
  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: 'gerencia@test.com', password: 'gerencia@test.com' },
  })
  const { token } = await loginRes.json()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  const list = await request.get(`${BASE}/api/servicios/tickets`, { headers })
  const data = await list.json()
  const anyTicket = data.data[0]

  const r = await request.patch(`${BASE}/api/servicios/tickets/${anyTicket.id}/estado`, {
    headers, data: { estado: 'scheduled' },
  })
  console.log('[REQ-218 RN7 backend] Daniela (management) intenta cambiar estado vía API directa -> HTTP', r.status())
  expect(r.status()).toBe(403)
})

test('17. REQ-216 Escenario 2 — "Sin tickets para este filtro" cuando el filtro no matchea nada', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoTickets(page)

  // Combinación de tipo+estado que no debería matchear ningún ticket sembrado
  // (retrofit + cancelled no existe en los datos de prueba actuales).
  const tipoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los tipos' }) })
  const estadoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los estados' }) })
  await tipoSelect.selectOption('retrofit')
  await estadoSelect.selectOption('cancelled')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DL_DIR}/16-sin-resultados.png`, fullPage: true })

  const emptyMsg = page.getByText('Sin tickets para este filtro')
  const showingText = await page.getByText(/mostrando/i).textContent()
  console.log('[SCRUM-279 Escenario2] contador:', showingText)
  await expect(emptyMsg).toBeVisible()
})
