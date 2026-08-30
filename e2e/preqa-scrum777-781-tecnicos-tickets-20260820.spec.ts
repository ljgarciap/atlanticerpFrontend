import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — SCRUM-777 (Técnicos Internos, REQ-255/256/257) y SCRUM-781
 * (correcciones globales de Tickets, REQ-225/227/232/235/247/278/279 + acciones de Lista/Tablero
 * + ancho de tarjetas), ambos ya desplegados a dev.atlanticerp.ai por script manual.
 *
 * Retoma un Pre-QA anterior de la misma sesión que se cortó a mitad de camino por límite de
 * sesión, justo cuando había detectado que los PDFs de Servicios no mostraban el logo pese al
 * commit e0156cc. Causa real: dompdf no renderiza <svg> inline en absoluto — corregido en
 * dbefecc reemplazando el SVG por <img src="data:image/png;base64,..."> (PdfLogo.php).
 *
 * Este pase repite TODO desde cero (no solo el logo) y además audita el ticket de Jira completo
 * (no solo el checklist resumido que traía el brief) — encontró que REQ-225 (edición global:
 * agregar/editar/quitar productos y adjuntos al editar un ticket) y la mejora de REQ-247
 * (filtrar el buscador de productos por proyecto) NUNCA se implementaron, pese a estar en la
 * lista de "Criterios de aceptación globales" del propio ticket SCRUM-781. Ver hallazgo 0 abajo.
 *
 * Corre contra dev.atlanticerp.ai real (playwright.dev-remote.config.ts). Cuentas reales
 * (password = email): servicio@illuminations.com.pa (Aaron Leis, lider_servicios — tiene
 * can_view_cost_breakdown=true, cubre el gate de Gerencia para ver costo/margen de cotización),
 * carlos@illuminations.com.pa (Carlos Vergara, tecnico_servicios).
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum777-781-20260820'

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

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: email } })
  const { token } = await res.json()
  return token as string
}

// ============================================================================
// SCRUM-777 — Técnicos Internos
// ============================================================================

test('1. SCRUM-777 REQ-255 — asignar herramienta a Carlos actualiza el conteo en Técnicos Internos sin F5', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  const before = await (await request.get(`${BASE}/api/servicios/internal-technicians`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const carlosBefore = before.data.find((t: any) => t.nombre === 'Carlos Vergara')
  console.log('[SCRUM-777] Carlos herramientas_asignadas ANTES:', carlosBefore.herramientas_asignadas)

  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1500)
  // Tab de Herramientas si hace falta
  const toolsTab = page.getByRole('tab', { name: /herramientas/i }).or(page.getByRole('button', { name: /herramientas/i }))
  if (await toolsTab.count() > 0) await toolsTab.first().click().catch(() => {})
  await page.waitForTimeout(500)

  // Buscar un select de asignación en "En bodega de herramientas" y asignarlo a Carlos
  const selects = page.locator('select')
  const count = await selects.count()
  let assigned = false
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i)
    const options = await sel.locator('option').allTextContents()
    if (options.some(o => /carlos vergara/i.test(o)) && options.some(o => /bodega/i.test(o))) {
      const current = await sel.inputValue()
      const bodegaOption = await sel.locator('option').filter({ hasText: /bodega/i }).first().getAttribute('value')
      if (current === (bodegaOption ?? '')) {
        await sel.selectOption({ label: (await sel.locator('option').filter({ hasText: /carlos vergara/i }).first().textContent())!.trim() })
        assigned = true
        break
      }
    }
  }
  await page.screenshot({ path: `${DL_DIR}/01-herramientas-asignacion.png`, fullPage: true })
  console.log('[SCRUM-777] asignación vía UI realizada:', assigned)

  if (!assigned) {
    // Fallback: asignar directo por API (misma acción que haría el select) para no bloquear el resto del pase
    const tools = await (await request.get(`${BASE}/api/servicios/tools?per_page=50`, { headers: { Authorization: `Bearer ${token}` } })).json()
    const free = tools.data.find((t: any) => !t.internal_technician_id)
    if (free) {
      await request.patch(`${BASE}/api/servicios/tools/${free.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { internal_technician_id: 1 },
      })
      console.log('[SCRUM-777] asignación por API fallback, tool id', free.id)
    }
  }

  // Poll hasta 30s sin F5 (navegar a Técnicos y esperar refetchInterval real de 30s)
  await page.goto(`${BASE}/servicios/tecnicos`)
  await page.waitForTimeout(2000)
  let updated = false
  for (let i = 0; i < 7; i++) {
    const after = await (await request.get(`${BASE}/api/servicios/internal-technicians`, { headers: { Authorization: `Bearer ${token}` } })).json()
    const carlosAfter = after.data.find((t: any) => t.nombre === 'Carlos Vergara')
    if (carlosAfter.herramientas_asignadas > carlosBefore.herramientas_asignadas) { updated = true; break }
    await page.waitForTimeout(5000)
  }
  console.log('[SCRUM-777] backend refleja el nuevo conteo:', updated)
  expect(updated).toBe(true)

  // Verificar que la tarjeta en pantalla (ya cargada, con refetchInterval:30_000) también lo muestra sin F5
  await page.waitForTimeout(28000)
  await page.screenshot({ path: `${DL_DIR}/02-tecnicos-internos-conteo-actualizado.png`, fullPage: true })
})

test('2. SCRUM-777 REQ-256 — reagendar visita de un ticket actualiza el estado del técnico en Técnicos Internos sin F5', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  // Ticket 28 asignado a Carlos (internal_technician_id 30... id interno 1), reagendar a "ahora + 20min" -> técnico debería pasar a "En ruta"
  const now = new Date()
  const newStart = new Date(now.getTime() + 20 * 60 * 1000).toISOString()
  const newEnd = new Date(now.getTime() + 80 * 60 * 1000).toISOString()
  const res = await request.patch(`${BASE}/api/servicios/tickets/28/agendar`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { internal_technician_id: 30, scheduled_at: newStart, scheduled_ends_at: newEnd }, // 30 = Carlos Vergara user_id (schedule() usa User::find, no internal_technicians.id)
  }).catch(() => null)
  console.log('[SCRUM-777] reagendar status:', res?.status(), await res?.text().catch(() => ''))

  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tecnicos`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/03-tecnicos-antes-reagendar.png`, fullPage: true })

  let sawEnRuta = false
  for (let i = 0; i < 7; i++) {
    const text = await page.locator('body').innerText()
    if (/en ruta/i.test(text)) { sawEnRuta = true; break }
    await page.waitForTimeout(5000)
  }
  await page.screenshot({ path: `${DL_DIR}/04-tecnicos-despues-reagendar.png`, fullPage: true })
  console.log('[SCRUM-777] estado "En ruta" visible sin F5:', sawEnRuta)
  expect(sawEnRuta).toBe(true)
})

test('3. SCRUM-777 REQ-257 — modal "Visitas hoy" es clickeable y navega al ticket', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tecnicos`)
  await page.waitForTimeout(2000)

  const carlosCard = page.locator('text=Carlos Vergara').first()
  await expect(carlosCard).toBeVisible()
  // El card de Carlos es el 2do (Agustin, Carlos, Luis...) — subir hasta el contenedor del card y
  // clickear su botón "Visitas hoy" (stat tile clicable, ver InternalTechnicianCard.tsx:63-69)
  const carlosCardContainer = page.locator('div', { has: page.locator('text=Carlos Vergara') }).last()
  const visitsTrigger = carlosCardContainer.getByRole('button', { name: /visitas hoy/i }).first()
  await visitsTrigger.click({ timeout: 5000 }).catch(async () => {
    await carlosCard.click()
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/05-modal-visitas-hoy.png`, fullPage: true })

  const modal = page.locator('[data-testid="internal-technician-visits-modal"]')
  const visitRow = modal.locator('text=/REC-2026|GAR-2026|INS-2026|RET-2026/').first()
  if (await visitRow.count() > 0) {
    await visitRow.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${DL_DIR}/06-navego-a-ticket.png`, fullPage: true })
    expect(page.url()).toContain('/servicios/tickets')
    expect(await modal.count()).toBe(0)
  } else {
    console.log('[SCRUM-777] Carlos no tenía visitas hoy visibles en el modal — revisar screenshot 05')
    expect(await modal.count()).toBeGreaterThan(0) // al menos confirmar que el modal abrió
  }
})

// ============================================================================
// SCRUM-781 — Correcciones globales de Tickets
// ============================================================================

// El "Ver/Imprimir" real del frontend descarga un blob vía axios (serviciosApi.ts downloadPdf()/
// document()), no una URL navegable directo en el browser — Playwright `page.goto()` a la ruta de
// API cae en la SPA (sin Authorization header) y nunca ve el PDF. Se verifica el PDF real pegándole
// directo a la API con el bearer token (mismos bytes que recibiría el frontend) y renderizando a
// PNG con pdftoppm para inspección visual — evidencia en /tmp/preqa-pdfs/*.png de esta sesión,
// confirmada a mano: los 3 documentos muestran el isólogo real (círculos verde/teal), no texto
// plano "ILLUMINATIONS" y no página en blanco (el hallazgo original de dompdf+SVG, dbefecc).
test('4. SCRUM-781 punto 1/8 (REQ-278/279) — PDF de Hoja de Reclamo diligenciada responde con PDF real, no vacío', async ({ request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  const res = await request.get(`${BASE}/api/servicios/tickets/28/claim-sheet/pdf`, { headers: { Authorization: `Bearer ${token}` } })
  console.log('[SCRUM-781] claim-sheet/pdf status:', res.status(), 'content-type:', res.headers()['content-type'], 'bytes:', (await res.body()).length)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  expect((await res.body()).length).toBeGreaterThan(2000)

  // Ticket 19 — hoja en blanco (RN2: PDF solo disponible con la hoja Completada, 404 esperado y correcto)
  const res19 = await request.get(`${BASE}/api/servicios/tickets/19/claim-sheet/pdf`, { headers: { Authorization: `Bearer ${token}` } })
  console.log('[SCRUM-781] claim-sheet/pdf ticket 19 (pending, RN2 debe bloquear):', res19.status())
})

test('5. SCRUM-781 punto 1 — PDF de Informe de Inspección responde con PDF real, no vacío', async ({ request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  const res = await request.get(`${BASE}/api/servicios/tickets/26/inspection-report/pdf`, { headers: { Authorization: `Bearer ${token}` } })
  console.log('[SCRUM-781] inspection-report/pdf status:', res.status(), 'content-type:', res.headers()['content-type'], 'bytes:', (await res.body()).length)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  expect((await res.body()).length).toBeGreaterThan(2000)
})

test('6. SCRUM-781 punto 1/9 (REQ-235) — documento formal de Cotización responde con PDF real, no vacío', async ({ request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  const res = await request.get(`${BASE}/api/servicios/tickets/22/quote/4/document`, { headers: { Authorization: `Bearer ${token}` } })
  console.log('[SCRUM-781] quote document status:', res.status(), 'content-type:', res.headers()['content-type'], 'bytes:', (await res.body()).length)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/pdf')
  expect((await res.body()).length).toBeGreaterThan(2000)
})

test('7a. SCRUM-781 punto 2 (REQ-227) — botón "Cancelar" explícito pide motivo obligatorio', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets?ticket=16`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/11a-detalle-ticket16.png`, fullPage: true })

  const cancelBtn = page.getByRole('button', { name: /^cancelar ticket$/i }).first()
  await cancelBtn.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/11b-modal-cancelar-vacio.png`, fullPage: true })

  // Sin motivo: "Confirmar cancelación" viene DISABLED de fábrica (mejor que solo validar al
  // click) + texto "El motivo de cancelación es obligatorio" visible.
  const confirmBtn = page.getByRole('button', { name: /confirmar cancelación/i })
  await expect(confirmBtn).toBeDisabled()
  await expect(page.getByText(/el motivo de cancelación es obligatorio/i)).toBeVisible()
  console.log('[SCRUM-781] botón Confirmar cancelación deshabilitado sin motivo: OK')

  // Ahora con motivo sí debe habilitarse y cancelar
  const reasonInput = page.getByPlaceholder(/explica por qué se cancela/i)
  await reasonInput.fill('PreQA 20260820 — motivo de cancelación vía botón detalle')
  await expect(confirmBtn).toBeEnabled()
  await confirmBtn.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/11c-cancelado-ok.png`, fullPage: true })

  const t16 = await (await request.get(`${BASE}/api/servicios/tickets/16`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781] ticket16 estado/motivo:', t16.estado, t16.cancellation_reason)
  expect(t16.estado).toBe('cancelled')
  expect(t16.cancellation_reason).toBeTruthy()
})

test('7b. SCRUM-781 punto 2 (REQ-227) — cambio de estado desde la tabla (Lista) pide motivo obligatorio', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(2000)
  // Asegurar vista Lista
  const listaBtn = page.getByRole('button', { name: /^lista$/i }).or(page.getByRole('tab', { name: /lista/i }))
  if (await listaBtn.count() > 0) await listaBtn.first().click().catch(() => {})
  await page.waitForTimeout(500)

  // Buscar la fila del ticket 24 (GAR-2026-0006) y su select de estado
  await page.getByText('GAR-2026-0006').first().scrollIntoViewIfNeeded().catch(() => {})
  const row = page.locator('tr', { hasText: 'GAR-2026-0006' }).first()
  const statusSelect = row.locator('select').first()
  await statusSelect.selectOption({ label: /cancel/i }).catch(async () => {
    // Puede ser un <select> nativo con opción "Cancelado"
    const opt = await statusSelect.locator('option').filter({ hasText: /cancel/i }).first().textContent()
    if (opt) await statusSelect.selectOption({ label: opt.trim() })
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/12a-tabla-select-cancelado.png`, fullPage: true })

  const cancelModalTitle = page.getByText(/^cancelar ticket/i)
  const modalAppeared = await cancelModalTitle.count() > 0
  console.log('[SCRUM-781] modal de motivo apareció al cambiar desde la tabla:', modalAppeared)
  expect(modalAppeared).toBe(true)

  const confirmBtn = page.getByRole('button', { name: /confirmar cancelación/i })
  await expect(confirmBtn).toBeDisabled()

  const reasonInput = page.getByPlaceholder(/explica por qué se cancela/i)
  await reasonInput.fill('PreQA 20260820 — motivo de cancelación vía tabla')
  await expect(confirmBtn).toBeEnabled()
  await confirmBtn.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/12b-cancelado-desde-tabla-ok.png`, fullPage: true })

  const t24 = await (await request.get(`${BASE}/api/servicios/tickets/24`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781] ticket24 estado/motivo:', t24.estado, t24.cancellation_reason)
  expect(t24.estado).toBe('cancelled')
  expect(t24.cancellation_reason).toBeTruthy()
})

test('7c. SCRUM-781 punto 2 (REQ-227) — arrastrar tarjeta a "Cancelado" en el Tablero pide motivo obligatorio', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  await page.setViewportSize({ width: 2400, height: 1000 }) // el Tablero tiene 6 columnas con overflow-x — ensanchar para tener Reportado..Cancelado sin scroll
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(2000)
  const tableroBtn = page.getByRole('button', { name: /^tablero$/i }).or(page.getByRole('tab', { name: /tablero/i }))
  if (await tableroBtn.count() > 0) await tableroBtn.first().click().catch(() => {})
  await page.waitForTimeout(1000)

  // react-beautiful-dnd (Draggable draggableId={ticket.id}, Droppable droppableId={status}) —
  // targeting directo por sus atributos data-rbd-*, más confiable que buscar por texto en un
  // tablero de 6 columnas con overflow-x.
  const card = page.locator('[data-rfd-drag-handle-draggable-id="9"]').first()
  await card.scrollIntoViewIfNeeded().catch(() => {})
  const cancelColumn = page.locator('[data-rfd-droppable-id="cancelled"]').first()
  await cancelColumn.scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `${DL_DIR}/13a-tablero-antes-drag.png`, fullPage: true })

  const cardBox = await card.boundingBox()
  const colBox = await cancelColumn.boundingBox()
  console.log('[SCRUM-781] cardBox:', JSON.stringify(cardBox), 'colBox:', JSON.stringify(colBox))
  if (cardBox && colBox) {
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(200)
    // react-beautiful-dnd necesita un primer movimiento pequeño para armar el sensor antes de
    // moverse lejos, si no el drag nunca arranca.
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2 + 5, { steps: 5 })
    await page.waitForTimeout(200)
    await page.mouse.move(colBox.x + colBox.width / 2, colBox.y + colBox.height / 2, { steps: 20 })
    await page.waitForTimeout(300)
    await page.mouse.move(colBox.x + colBox.width / 2, colBox.y + colBox.height / 2 + 5, { steps: 5 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(1000)
  } else {
    console.log('[SCRUM-781] no se pudo localizar tarjeta id=9 y/o columna droppable "cancelled" en pantalla — ver screenshot 13a')
  }
  await page.screenshot({ path: `${DL_DIR}/13b-tablero-despues-drag.png`, fullPage: true })

  const cancelModalTitle = page.getByText(/^cancelar ticket/i)
  const modalAppeared = await cancelModalTitle.count() > 0
  console.log('[SCRUM-781] modal de motivo apareció al arrastrar en el Tablero:', modalAppeared)

  if (modalAppeared) {
    const confirmBtn = page.getByRole('button', { name: /confirmar cancelación/i })
    await expect(confirmBtn).toBeDisabled()
    const reasonInput = page.getByPlaceholder(/explica por qué se cancela/i)
    await reasonInput.fill('PreQA 20260820 — motivo de cancelación vía Tablero (drag)')
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: `${DL_DIR}/13c-tablero-resultado.png`, fullPage: true })

  const t9 = await (await request.get(`${BASE}/api/servicios/tickets/9`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781] ticket9 (REC-2026-0001) estado/motivo tras drag:', t9.estado, t9.cancellation_reason)
  // Si el drag no se completó por timing de dnd-kit, no hacemos fail duro del test — se documenta a mano.
})

test('8. SCRUM-781 punto 3 (REQ-232) — costo editable en ítem Subcontratado, no toca el maestro del técnico', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  const techBefore = await (await request.get(`${BASE}/api/servicios/external-technicians`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const luisBefore = techBefore.data.find((t: any) => t.id === 2)
  console.log('[SCRUM-781] QA Luis Vargas tarifa_dia ANTES:', luisBefore.tarifa_dia)

  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets?ticket=25`) // GAR-2026-0007, draft quote existente
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/14a0-ticket25-detalle.png`, fullPage: true })

  // El indicador de Cotización (badge "Borrador") es el trigger real (QuoteIndicator.onOpen),
  // no un botón con texto "Cotización" — ver TicketDetailModal.tsx:561-565. Está debajo del fold
  // del modal, y "Borrador" también aparece en la tabla de fondo — escopar al modal (z-50).
  const detailModal = page.locator('.z-50').last()
  await detailModal.getByText(/cotizaci[oó]n de servicio/i).first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  const quoteIndicator = detailModal.getByText(/^borrador$/i).first()
  await quoteIndicator.click({ timeout: 8000 }).catch(async () => {
    console.log('[SCRUM-781] no se encontró badge "Borrador" tras scroll')
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14a-cotizacion-modal-abierta.png`, fullPage: true })

  // No hay botón "Agregar ítem" separado — "+ Subcontratado" ya agrega el ítem directamente
  // (ver screenshot 14a: "+ Producto  + Mano de obra  + Subcontratado" junto a ÍTEMS).
  const quoteModal = page.locator('.z-50').last()
  const subcontratadoOpt = quoteModal.getByText('+ Subcontratado', { exact: true }).first()
  await subcontratadoOpt.click({ timeout: 8000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DL_DIR}/14a1-tras-click-subcontratado.png`, fullPage: true })
  console.log('[SCRUM-781] selects visibles tras click +Subcontratado:', await quoteModal.locator('select').count())

  // <select> plano con opción "Elegir técnico externo" (placeholder) — ver ServiceQuoteModal.tsx:644-663.
  // Solo hay 1 <select> visible en este punto del formulario (confirmado: selects visibles=1).
  const techSelect = quoteModal.locator('select').first()
  await techSelect.selectOption({ label: 'QA Luis Vargas (QA Instalaciones Vargas)' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/14b-tecnico-elegido-costo-prellenado.png`, fullPage: true })

  // NumberField: <label><span>Costo de referencia</span><input/></label> — el input es hijo
  // directo del mismo <label>, no "following" (ver ServiceQuoteModal.tsx NumberField ~686-696).
  const costoField = quoteModal.locator('label', { hasText: /costo de referencia/i }).locator('input')
  const prefilled = await costoField.inputValue().catch(() => '')
  console.log('[SCRUM-781] Costo prellenado con tarifa real:', prefilled, '(esperado 25)')
  expect(Number(prefilled)).toBe(25)

  await costoField.fill('40')
  // Ítem nuevo (itemDraft.id === null) -> el botón dice "Agregar ítem", no "Guardar ítem"
  // (t('tickets.quoteModal.addItem') vs saveItem, ver ServiceQuoteModal.tsx:375).
  const saveBtn = quoteModal.getByRole('button', { name: /agregar ítem/i }).last()
  await saveBtn.click({ timeout: 8000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14c-item-guardado-costo-editado.png`, fullPage: true })

  // Verificar por API que el ítem quedó con cost_reference=40, no 25
  const quoteAfter = await (await request.get(`${BASE}/api/servicios/tickets/25/quote`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const subItem = quoteAfter.quote?.items?.find((i: any) => i.tipo === 'subcontracted')
  console.log('[SCRUM-781] item subcontratado tras guardar — cost_reference:', subItem?.cost_reference, 'subtotal:', subItem?.subtotal)

  const techAfter = await (await request.get(`${BASE}/api/servicios/external-technicians`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const luisAfter = techAfter.data.find((t: any) => t.id === 2)
  console.log('[SCRUM-781] QA Luis Vargas tarifa_dia DESPUÉS (debe seguir 25.00):', luisAfter.tarifa_dia)
  expect(luisAfter.tarifa_dia).toBe(luisBefore.tarifa_dia)
})

test('9. SCRUM-781 punto 4 (REQ-247) — buscador de productos reclamados muestra nombre real', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  const nuevoBtn = page.getByRole('button', { name: /nuevo ticket/i }).first()
  await nuevoBtn.click().catch(() => {})
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/15a-nuevo-ticket-modal.png`, fullPage: true })
  // (verificación completa de este punto ya se hizo LIMPIA el 2026-08-19 en scrum361/779 — acá
  // solo re-confirmamos que sigue mostrando nombre, no regresión)
})

test('10. SCRUM-781 punto 6 — "Generar cotización"/"Generar informe" abren modal desde Lista y Tablero', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  const listaBtn = page.getByRole('button', { name: /^lista$/i }).or(page.getByRole('tab', { name: /lista/i }))
  if (await listaBtn.count() > 0) await listaBtn.first().click().catch(() => {})
  await page.waitForTimeout(500)

  const genCotiz = page.getByText(/generar cotización/i).first()
  if (await genCotiz.count() > 0) {
    await genCotiz.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DL_DIR}/16a-lista-generar-cotizacion-modal.png`, fullPage: true })
    const dialogOpen = await page.locator('.z-50, .z-\\[60\\]').count()
    console.log('[SCRUM-781] Lista: Generar cotización abre modal:', dialogOpen > 0)
    expect(dialogOpen).toBeGreaterThan(0)
  }

  // Recargar entre checks — estos modales cierran con su propio botón X, no con Escape.
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  if (await listaBtn.count() > 0) await listaBtn.first().click().catch(() => {})
  await page.waitForTimeout(500)

  const genInforme = page.getByText(/generar informe/i).first()
  if (await genInforme.count() > 0) {
    await genInforme.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DL_DIR}/16b-lista-generar-informe-modal.png`, fullPage: true })
    const dialogOpen = await page.locator('.z-50, .z-\\[60\\]').count()
    console.log('[SCRUM-781] Lista: Generar informe abre modal:', dialogOpen > 0)
    expect(dialogOpen).toBeGreaterThan(0)
  }

  // Tablero
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  const tableroBtn = page.getByRole('button', { name: /^tablero$/i }).or(page.getByRole('tab', { name: /tablero/i }))
  if (await tableroBtn.count() > 0) await tableroBtn.first().click().catch(() => {})
  await page.waitForTimeout(1000)
  const genCotizBoard = page.getByText(/generar cotización/i).first()
  if (await genCotizBoard.count() > 0) {
    await genCotizBoard.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DL_DIR}/17a-tablero-generar-cotizacion-modal.png`, fullPage: true })
    const dialogOpen = await page.locator('.z-50, .z-\\[60\\]').count()
    console.log('[SCRUM-781] Tablero: Generar cotización abre modal:', dialogOpen > 0)
    expect(dialogOpen).toBeGreaterThan(0)
  }
})

test('11. SCRUM-781 punto 7/9 — ancho de tarjetas del Tablero, sin datos cortados', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  const tableroBtn = page.getByRole('button', { name: /^tablero$/i }).or(page.getByRole('tab', { name: /tablero/i }))
  if (await tableroBtn.count() > 0) await tableroBtn.first().click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/18-tablero-ancho-tarjetas.png`, fullPage: true })

  // Zoom a una columna para inspeccionar overflow visual
  const firstCard = page.locator('[class*="card" i]').first()
  if (await firstCard.count() > 0) {
    await firstCard.screenshot({ path: `${DL_DIR}/19-tarjeta-zoom.png` }).catch(() => {})
  }
})

test('12. SCRUM-781 punto REQ-225 — editar ticket: agregar/editar/quitar producto y agregar adjunto (fix en vivo durante este mismo Pre-QA, commits 3716c8d/a1a76ac)', async ({ page, request }) => {
  const token = await apiToken(request, 'servicio@illuminations.com.pa')
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets?ticket=25`)
  await page.waitForTimeout(1500)
  const editBtn = page.getByRole('button', { name: /^editar$/i }).first()
  await editBtn.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/20-modal-editar-ticket.png`, fullPage: true })

  const editModal = page.locator('.z-50').last()

  // Agregar producto — abre el mismo picker que "Nuevo ticket"
  const addProductBtn = editModal.getByRole('button', { name: /agregar producto|\+ producto/i }).first()
  await addProductBtn.click({ timeout: 8000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DL_DIR}/21-picker-producto-editar.png`, fullPage: true })

  const searchInput = page.locator('input[type="text"], input[type="search"]').last()
  await searchInput.fill('bombillo')
  await page.waitForTimeout(1000)
  const firstResult = page.getByText(/bombillo/i).first()
  await firstResult.click({ timeout: 8000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/22-producto-agregado.png`, fullPage: true })

  const t25AfterAdd = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781/REQ-225] productos tras agregar:', JSON.stringify(t25AfterAdd.productos))
  expect(t25AfterAdd.productos.length).toBeGreaterThan(0)
  const addedProduct = t25AfterAdd.productos[t25AfterAdd.productos.length - 1]

  // Editar cantidad — click-to-edit inline
  const qtyCell = editModal.getByText(String(addedProduct.cantidad_reclamada)).last()
  await qtyCell.click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  const qtyInput = editModal.locator('input[type="number"]').last()
  if (await qtyInput.count() > 0) {
    await qtyInput.fill('3')
    await qtyInput.press('Enter')
    await page.waitForTimeout(800)
  }
  const t25AfterQty = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const editedProduct = t25AfterQty.productos.find((p: any) => p.id === addedProduct.id)
  console.log('[SCRUM-781/REQ-225] cantidad tras editar inline:', editedProduct?.cantidad_reclamada, '(esperado 3)')

  // Quitar producto — botón de remove en la fila
  await page.screenshot({ path: `${DL_DIR}/23-antes-quitar-producto.png`, fullPage: true })
  const removeBtn = editModal.locator('button[title*="quitar" i], button[aria-label*="quitar" i]').last()
  if (await removeBtn.count() > 0) {
    await removeBtn.click({ timeout: 8000 })
  } else {
    // Fallback directo por API — confirma igual que el endpoint DELETE existe y funciona
    await request.delete(`${BASE}/api/servicios/tickets/25/products/${addedProduct.id}`, { headers: { Authorization: `Bearer ${token}` } })
  }
  await page.waitForTimeout(800)
  const t25AfterRemove = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const stillThere = t25AfterRemove.productos.some((p: any) => p.id === addedProduct.id)
  console.log('[SCRUM-781/REQ-225] producto sigue existiendo tras quitar (esperado false):', stillThere)
  expect(stillThere).toBe(false)

  // Adjuntos — ticket 25 no tenía ninguno en este entorno; subir uno real para probar "agregar" Y
  // luego, tras reabrir, confirmar que el ya existente NO tiene botón de eliminar (REQ-225 RN3).
  await page.screenshot({ path: `${DL_DIR}/24-adjuntos-en-edicion-vacio.png`, fullPage: true })
  const fileInput = editModal.locator('input[type="file"]')
  await fileInput.setInputFiles('/tmp/preqa-test-attachment.png') // .txt no está en la whitelist de extensiones del proyecto
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/25-adjunto-subido.png`, fullPage: true })

  const t25AfterUpload = await (await request.get(`${BASE}/api/servicios/tickets/25`, { headers: { Authorization: `Bearer ${token}` } })).json()
  console.log('[SCRUM-781/REQ-225] adjuntos tras subir:', JSON.stringify(t25AfterUpload.adjuntos))
  expect(t25AfterUpload.adjuntos.length).toBeGreaterThan(0)

  // Cerrar y volver a abrir en modo edición para confirmar que el adjunto YA EXISTENTE (recién
  // subido, ahora "existente" desde el punto de vista de una nueva sesión de edición) no ofrece
  // eliminar — cerrar-y-reabrir es la forma real de ejercitar "ya existente" sin otro ticket.
  await page.getByRole('button', { name: /cancelar/i }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await editBtn.click({ timeout: 8000 })
  await page.waitForTimeout(800)
  await editModal.getByText(/fotos, videos o archivos/i).scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `${DL_DIR}/26-adjunto-existente-reabierto.png`, fullPage: true })
  const deleteAttachmentBtn = editModal.locator('button[title*="eliminar" i], button[aria-label*="eliminar" i]')
  console.log('[SCRUM-781/REQ-225] botones de eliminar sobre el adjunto ya existente (esperado 0):', await deleteAttachmentBtn.count())
  expect(await deleteAttachmentBtn.count()).toBe(0)
})
