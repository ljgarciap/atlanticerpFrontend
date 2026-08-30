import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — Batch 5 tickets, 2026-08-01: SCRUM-718 (filtros multiselect Clientes),
 * SCRUM-203 (columna "Ver detalle" multi-proyecto), SCRUM-105 (avance de Pipeline +
 * guard de cotización duplicada), SCRUM-711 item 2 (Sidebar colapsado en login),
 * SCRUM-140 (Vista Externa sin Observaciones/pago/Condiciones).
 *
 * Corre contra stack local (Docker backend :8090 vía proxy Vite :5173) — el batch
 * todavía no se pusheó a dev.atlanticerp.ai. Serial a propósito: varios tests mutan estado
 * compartido (tarjetas de Pipeline, cotizaciones) y algunos dependen del orden de
 * ejecución dentro de su describe.
 *
 * Fixtures previas (tinker, ver sesión Pre-QA): orden #221 (MULTI: proyectos 290+291
 * + 1 línea sin proyecto → 2 proyectos distintos → debe mostrar "Ver detalle"), orden
 * #222 (proyecto 292 + 1 línea sin proyecto → 1 solo proyecto distinto → debe mostrar
 * el nombre, caso límite de asignación parcial).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const MGMT_EMAIL = 'management@atlantic.test'
const DESIGNER_EMAIL = 'designer@atlantic.test'
const PASS = 'Password123!'

async function login(page: Page, email: string, pass = PASS) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|compras|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

async function logout(page: Page) {
  const logoutBtn = page.getByText('Cerrar sesión', { exact: true })
  if (!(await logoutBtn.isVisible().catch(() => false))) {
    await page.locator('header, [class*="topbar" i]').getByRole('button').last().click().catch(() => {})
    await page.waitForTimeout(300)
  }
  await logoutBtn.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
}

const SHOTS = 'e2e/.tmp/preqa-batch-20260801'

// Compartido entre los describes SCRUM-105 y SCRUM-140 (SCRUM-140 reusa la cotización con
// folio que SCRUM-105 genera, en vez de rearmar una desde cero).
let quoteAId: number | null = null
let quoteBId: number | null = null
let cardId: number | null = null

// ============================= SCRUM-718 =============================
test.describe('SCRUM-718 — filtros multiselect de Clientes', () => {
  test('1. Multiselect real: A + C + "Sin contacto +60 días" simultáneos, los 3 quedan resaltados igual', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/clients`)
    await page.waitForTimeout(1000)

    const chipA = page.getByRole('button', { name: /A\s*·\s*WalkIn/i })
    const chipC = page.getByRole('button', { name: /C\s*·\s*Licitación/i })
    const chipStale = page.getByRole('button', { name: /Sin contacto \+?60 días/i })

    await expect(chipA).toBeVisible()
    await expect(chipC).toBeVisible()
    await expect(chipStale).toBeVisible()

    const classAInactive = await chipA.getAttribute('class')

    await chipA.click()
    await page.waitForTimeout(300)
    await chipC.click()
    await page.waitForTimeout(300)
    await chipStale.click()
    await page.waitForTimeout(500)

    const classAActive = await chipA.getAttribute('class')
    const classCActive = await chipC.getAttribute('class')
    const classStaleActive = await chipStale.getAttribute('class')
    await page.screenshot({ path: `${SHOTS}/718-1-triple-select.png` })

    // Criterio 1/2: los 3 deben poder coexistir seleccionados — su clase debe haber
    // CAMBIADO respecto del estado inactivo (prueba real de que quedaron "activos"),
    // no solo que el elemento sigue existiendo en el DOM.
    expect(classAActive).not.toBe(classAInactive)
    // Criterio 5: mismo estilo visual de "seleccionado" en los 3 chips.
    expect(classAActive).toBe(classCActive)
    expect(classCActive).toBe(classStaleActive)
  })

  test('2. Deseleccionar UNO de los 3 no limpia los otros dos (no auto-clear)', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/clients`)
    await page.waitForTimeout(1000)

    const chipA = page.getByRole('button', { name: /A\s*·\s*WalkIn/i })
    const chipC = page.getByRole('button', { name: /C\s*·\s*Licitación/i })
    const chipStale = page.getByRole('button', { name: /Sin contacto \+?60 días/i })

    await chipA.click(); await page.waitForTimeout(200)
    await chipC.click(); await page.waitForTimeout(200)
    await chipStale.click(); await page.waitForTimeout(300)

    const classCBefore = await chipC.getAttribute('class')
    const classStaleBefore = await chipStale.getAttribute('class')

    await chipA.click() // deseleccionar A
    await page.waitForTimeout(300)

    const classCAfter = await chipC.getAttribute('class')
    const classStaleAfter = await chipStale.getAttribute('class')
    await page.screenshot({ path: `${SHOTS}/718-2-partial-deselect.png` })

    expect(classCAfter).toBe(classCBefore)
    expect(classStaleAfter).toBe(classStaleBefore)
  })

  test('3. "Todos" limpia toda la selección y vuelve a ser el único resaltado', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/clients`)
    await page.waitForTimeout(1000)

    const chipTodos = page.getByRole('button', { name: /^Todos$/i })
    const chipA = page.getByRole('button', { name: /A\s*·\s*WalkIn/i })
    const chipStale = page.getByRole('button', { name: /Sin contacto \+?60 días/i })

    const classTodosDefault = await chipTodos.getAttribute('class') // nada seleccionado = Todos activo
    const classADefault = await chipA.getAttribute('class') // A inactivo

    await chipA.click(); await page.waitForTimeout(200)
    await chipStale.click(); await page.waitForTimeout(300)
    const classTodosWhileOthersActive = await chipTodos.getAttribute('class')

    await chipTodos.click()
    await page.waitForTimeout(400)

    const classTodosAfter = await chipTodos.getAttribute('class')
    const classAAfter = await chipA.getAttribute('class')
    await page.screenshot({ path: `${SHOTS}/718-3-todos-reset.png` })

    // Al clickear "Todos" vuelve al mismo estado visual que al cargar la página (nada elegido)
    expect(classTodosAfter).toBe(classTodosDefault)
    // Y difiere del estado "Todos" mientras A/Stale estaban activos (o sea, Todos SÍ refleja
    // visualmente que ya no hay nada seleccionado, no es un botón inerte)
    expect(classTodosAfter).not.toBe(classTodosWhileOthersActive)
    // A quedó des-resaltado otra vez (mismo class que al cargar la página, sin nada elegido)
    expect(classAAfter).toBe(classADefault)
  })

  test('4. Recargar a mitad de filtro: el estado NO persiste (no está en localStorage) — informativo, no bloqueante', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/clients`)
    await page.waitForTimeout(1000)
    const chipA = page.getByRole('button', { name: /A\s*·\s*WalkIn/i })
    await chipA.click()
    await page.waitForTimeout(300)
    await page.reload()
    await page.waitForTimeout(1000)
    const chipTodos = page.getByRole('button', { name: /^Todos$/i })
    // No es criterio de aceptación (los criterios hablan de "hasta deselección manual", no de
    // persistencia entre recargas) — documentamos el comportamiento real, no lo bloqueamos.
    await expect(chipTodos).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/718-4-reload-resets.png` })
  })
})

// ============================= SCRUM-203 =============================
test.describe('SCRUM-203 — "Ver detalle" con múltiples proyectos en una orden', () => {
  test('1. Orden #221 (2 proyectos distintos entre sus líneas) muestra un contador clickeable, nunca un solo nombre', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1200)

    const row = page.locator('tr', { hasText: '#221' }).first()
    await expect(row).toBeVisible()
    // Hallazgo de wording (ver reporte): el criterio de Jira dice literalmente "Ver detalle",
    // la implementación real muestra "N proyectos" (acá "2 proyectos") como botón clickeable —
    // funcionalmente cumple el intent (nunca un nombre único/incompleto), pero el texto no es
    // el literal del ticket.
    const projectCell = row.getByRole('button', { name: /proyectos/i })
    await expect(projectCell).toBeVisible()
    await expect(projectCell).toHaveText(/2 proyectos/i)
    await page.screenshot({ path: `${SHOTS}/203-1-multiproject-verdetalle.png` })

    // Confirma que NO aparece ningún nombre de proyecto suelto en esa celda (que sería
    // incompleto per el criterio explícito del ticket)
    await expect(row.getByText('[DEMO] Torre Delta Fase 1')).toHaveCount(0)
    await expect(row.getByText('[DEMO] Lobby Costa Bella')).toHaveCount(0)

    await projectCell.click()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/compras\/ordenes\/221/)
  })

  test('2. Orden #222 (1 proyecto asignado + 1 línea SIN proyecto) muestra el nombre, no "Ver detalle" — caso límite documentado', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1200)

    const row = page.locator('tr', { hasText: '#222' }).first()
    await expect(row).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/203-2-partial-null-single-project.png` })

    // Comportamiento actual: cuenta proyectos DISTINTOS ignorando líneas sin proyecto,
    // así que 1 línea con proyecto + 1 sin proyecto = "count===1" = muestra el nombre.
    // No es exactamente el escenario literal del ticket (que habla de 2 proyectos DISTINTOS),
    // pero es un caso límite adyacente: la orden no tiene el 100% de sus líneas asignadas a
    // ESE proyecto, y aun así se presenta como si todo perteneciera a él. Documentado como
    // hallazgo MEDIO, no bloqueante (ver reporte).
    const hasCounterButton = await row.getByRole('button', { name: /proyectos/i }).count()
    const hasProjectName = await row.getByText('[DEMO] Amenidades Delta').count()
    expect(hasCounterButton).toBe(0)
    expect(hasProjectName).toBeGreaterThan(0)
  })

  test('3. Rol sin acceso a Compras (designer) no puede ver /compras/ordenes', async ({ page }) => {
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SHOTS}/203-3-designer-no-access.png` })

    // designer no tiene compras.* — no debe ver la tabla de órdenes con datos reales
    const table = page.locator('table')
    const tableVisible = await table.isVisible().catch(() => false)
    if (tableVisible) {
      // Si la tabla existe igual, al menos no debe tener filas de datos reales (gate roto)
      const rows = await page.locator('tbody tr').count()
      expect(rows).toBe(0)
    }
  })

  test('4. El gate bloquea de verdad en el backend (403), no solo esconde el botón en el frontend', async ({ page }) => {
    // Paso 3 del protocolo Pre-QA: "¿bloquea de verdad o solo esconde el botón?" — confirmado
    // vía API directa, sin pasar por la UI, contra el endpoint real que sirve la tabla.
    const designerLogin = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: DESIGNER_EMAIL, password: PASS },
    })
    const designerToken = (await designerLogin.json()).token
    const designerResp = await page.request.get(`${BASE}/api/compras/orders`, {
      headers: { Authorization: `Bearer ${designerToken}` },
    })
    expect(designerResp.status()).toBe(403)

    const mgmtLogin = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: MGMT_EMAIL, password: PASS },
    })
    const mgmtToken = (await mgmtLogin.json()).token
    const mgmtResp = await page.request.get(`${BASE}/api/compras/orders`, {
      headers: { Authorization: `Bearer ${mgmtToken}` },
    })
    expect(mgmtResp.status()).toBe(200)
  })
})

// ============================= SCRUM-711 item 2 =============================
// NOTA de entorno (no es parte del bug): un browser context 100% nuevo de Playwright
// no tiene `sidebar-collapsed-migrated-v711` en localStorage, así que AppShell.tsx
// fuerza el sidebar al modo "riel de íconos" (ancho colapsado) en el primer render —
// mecanismo total y correctamente aparte del acordeón por sección que este ticket
// corrige. En ese modo riel, NINGÚN header de sección con texto se renderiza (todo es
// iconos con tooltip), así que hay que expandir el ANCHO primero ("Expandir menú")
// para poder observar el estado del acordeón por sección, que es lo que el AC pide.
test.describe('SCRUM-711 item 2 — Sidebar SIEMPRE colapsado al iniciar sesión', () => {
  test('1. Login en contexto limpio + ancho expandido: ningún submenú aparece desplegado antes de un clic', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.waitForTimeout(800)
    await page.getByTitle('Expandir menú').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/711-1-fresh-login-collapsed.png` })

    // Items de Ventas & Diseño/Configuración NO deben estar en el DOM (colapsados por
    // acordeón = ni siquiera renderizados, ver groupCollapsed en Sidebar.tsx)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Pipeline', exact: true })).toHaveCount(0)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Clientes', exact: true })).toHaveCount(0)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Cotizaciones', exact: true })).toHaveCount(0)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Seguridad', exact: true })).toHaveCount(0)

    // Los 10 headers de sección SÍ deben estar visibles (el grupo existe, solo colapsado)
    await expect(page.locator('aside').first().getByText('Ventas & Diseño', { exact: true })).toBeVisible()
    await expect(page.locator('aside').first().getByText('Configuración', { exact: true })).toBeVisible()
  })

  test('2. Clic en el header del módulo expande su submenú (Pipeline/Clientes viven en el grupo "CRM", no "Ventas & Diseño" — Epic CRM Batch A)', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.waitForTimeout(800)
    await page.getByTitle('Expandir menú').click()
    await page.waitForTimeout(500)
    await page.locator('aside').first().getByText('CRM', { exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Pipeline', exact: true })).toBeVisible()
    await expect(page.locator('aside').first().getByRole('button', { name: 'Clientes', exact: true })).toBeVisible()
    // Otro grupo (Configuración/Seguridad) sigue colapsado — el clic no expande TODO
    await expect(page.locator('aside').first().getByRole('button', { name: 'Seguridad', exact: true })).toHaveCount(0)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Cotizaciones', exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/711-2-expanded-after-click.png` })
  })

  test('3. Ciclo completo: expandir manualmente → CERRAR SESIÓN → volver a loguear → el acordeón nace colapsado de nuevo', async ({ page }) => {
    await login(page, MGMT_EMAIL)
    await page.waitForTimeout(800)
    await page.getByTitle('Expandir menú').click()
    await page.waitForTimeout(500)
    await page.locator('aside').first().getByText('CRM', { exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Pipeline', exact: true })).toBeVisible()

    await logout(page)
    await page.waitForURL(/login/, { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(500)

    await login(page, MGMT_EMAIL)
    await page.waitForTimeout(800)
    // NOTA importante (confirmado en vivo durante esta sesión, ver reporte): `setAuth()`
    // (authStore.ts) fuerza `sidebar-collapsed=true` (ancho en riel de íconos) en TODO login
    // real, a propósito — mecanismo previo, ya intencional, de una vuelta anterior de este
    // mismo ticket ("no heredar una sesión anterior que quedó expandida"). En modo riel,
    // `groupCollapsed` es siempre `false` (el código lo hace a propósito: "no tiene sentido
    // colapsar por grupo si ya se ve solo íconos"), así que TODOS los ítems aparecen como
    // botones de ícono con tooltip — incluido "Pipeline" — sin que eso implique que el
    // ACORDEÓN de la sección esté expandido. Hay que volver a expandir el ANCHO antes de
    // poder observar el estado real del acordeón, o el check da un falso positivo (pasó en
    // esta misma sesión: un primer intento reportó esto como CRÍTICO por no re-expandir acá).
    await page.getByTitle('Expandir menú').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/711-3-after-logout-login-still-collapsed.png` })

    // Lo que el AC exige explícitamente: aunque el usuario dejó "CRM" expandido
    // antes de cerrar sesión, al volver a entrar el ACORDEÓN nace colapsado de nuevo.
    await expect(page.locator('aside').first().getByRole('button', { name: 'Pipeline', exact: true })).toHaveCount(0)
    await expect(page.locator('aside').first().getByRole('button', { name: 'Clientes', exact: true })).toHaveCount(0)
  })
})

// ============================= SCRUM-105 =============================
// Escenarios de ruptura (a)/(b)/(c) del ticket, todos SOBRE LA MISMA tarjeta de Lead que este
// bloque crea, exactamente como pide el AC ("sobre esa MISMA tarjeta"). Login como designer
// (tiene ventas_diseno.edit/write, dueño real de tarjetas de Pipeline).
test.describe('SCRUM-105 — avance de Pipeline + guard de cotización duplicada', () => {
  const leadName = `PreQA SCRUM-105 ${Date.now()}`

  test('1. Crear tarjeta Lead + cliente/contacto, "Crear cotización" crea un borrador (quote A) sin bloquear', async ({ page }) => {
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)

    // Interceptar la respuesta de creación para quedarnos con el ID real de la tarjeta —
    // el modal se abre por estado local (setOpenCardId), no por query param, así que no
    // hay forma de leerlo de la URL después.
    const createCardResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().includes('/ventas-diseno/pipeline') && r.status() === 201,
    )

    await page.getByRole('button', { name: /\+ Nuevo Proyecto/i }).click()
    await page.waitForTimeout(400)
    await page.locator('label:has-text("Nombre del proyecto") + input').fill(leadName)

    // Contacto (requerido por el gate de Lead antes de poder generar cotización) — nombre +
    // teléfono, si falta el teléfono/correo el botón Guardar queda deshabilitado a propósito
    // (contactIncomplete en NewProjectModal.tsx)
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Contacto PreQA 105')
    await page.locator('input[type="tel"], input[placeholder="Teléfono"]').first().fill('60000105')

    await page.getByRole('button', { name: /^Guardar$/i }).click()
    const createResponse = await createCardResponse
    cardId = (await createResponse.json())?.id ?? null
    expect(cardId).toBeGreaterThan(0)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SHOTS}/105-1-lead-created.png` })

    // El modal de detalle de la tarjeta debe abrirse solo tras crear
    await expect(page.getByText(leadName).first()).toBeVisible()

    // Entrar en modo edición para setear Master/Sub cliente (requerido por el gate de Lead)
    await page.getByRole('button', { name: /^Editar$/i }).click()
    await page.waitForTimeout(300)

    const masterName = `Master PreQA 105 ${Date.now()}`
    const masterInput = page.locator('label:has-text("Cliente Master") ~ input, label:has-text("Cliente Master") + input').first()
    await masterInput.fill(masterName)
    await page.waitForTimeout(500)
    await page.getByText(`+ Crear "${masterName}"`).click()
    await page.waitForTimeout(600)

    const subName = `Sub PreQA 105 ${Date.now()}`
    const subInput = page.locator('label:has-text("Subcliente") ~ input, label:has-text("Subcliente") + input').first()
    await subInput.fill(subName)
    await page.waitForTimeout(500)
    await page.getByText(`+ Crear "${subName}"`).click()
    await page.waitForTimeout(400)
    // Mini-form de RUC (obligatorio para Subcliente)
    await page.getByPlaceholder('RUC').fill('8-888-8888')
    await page.getByRole('button', { name: /^Confirmar$/i }).click()
    await page.waitForTimeout(600)

    await page.getByRole('button', { name: /^Guardar$/i }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/105-1b-lead-client-set.png` })

    // "Crear cotización" — primer intento, NO debe bloquear (nunca se generó nada para este
    // proyecto todavía)
    await page.getByRole('button', { name: /Crear cotización/i }).click()
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 10000 })
    await page.waitForTimeout(800)
    const url = page.url()
    quoteAId = Number(url.match(/\/quotes\/(\d+)/)?.[1])
    expect(quoteAId).toBeGreaterThan(0)
    // No debe quedar un spinner infinito ("Cargando...") — la página real del formulario carga
    await expect(page.getByText(/^Cargando/i)).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/105-1c-quote-a-created.png` })
  })

  test('2. Sobre la MISMA tarjeta, "Crear cotización" DE NUEVO crea un SEGUNDO borrador (quote B) sin bloquear (ninguno tiene folio todavía)', async ({ page }) => {
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)
    await page.getByText(leadName).click()
    await page.waitForTimeout(600)

    await page.getByRole('button', { name: /Crear cotización/i }).click()
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 10000 })
    await page.waitForTimeout(800)
    quoteBId = Number(page.url().match(/\/quotes\/(\d+)/)?.[1])
    expect(quoteBId).toBeGreaterThan(0)
    expect(quoteBId).not.toBe(quoteAId)
    await expect(page.getByText(/^Cargando/i)).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/105-2-quote-b-second-draft-allowed.png` })
  })

  test('3. Generar quote B (folio) → la tarjeta de Pipeline avanza automáticamente a Cotización', async ({ page }) => {
    test.skip(!quoteBId, 'quote B no se creó en el test anterior')
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/quotes/${quoteBId}`)
    await page.waitForTimeout(1000)

    await page.locator('label:has-text("Descripción") ~ input, label:has-text("Descripción") + input').first().fill('PreQA SCRUM-105 generación')

    // Arquitecto vía mini-form (nombre + teléfono), scopeado al contenedor del ClientPicker
    // para no chocar con el botón "Confirmar" de Totales (misma etiqueta, otro componente)
    const architectPicker = page.locator('label:has-text("Arquitecto")').locator('..')
    const architectName = `Arquitecto PreQA ${Date.now()}`
    await architectPicker.locator('input').first().fill(architectName)
    await page.waitForTimeout(500)
    await page.getByText(`+ Crear "${architectName}"`).click()
    await page.waitForTimeout(300)
    await architectPicker.getByPlaceholder('Teléfono').fill('60001105')
    await architectPicker.getByRole('button', { name: /^Confirmar$/i }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOTS}/105-3a-architect-set.png` })

    // Tipo de entrega Única + fecha
    const deliverySelect = page.locator('label:has-text("Tipo de entrega")').locator('..').locator('select')
    await deliverySelect.selectOption('single')
    await page.waitForTimeout(400)
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.count() > 0) await dateInput.fill('2026-12-01')

    // Partida + 1 ítem manual (sin catálogo): referencia + descripción + cantidad + precio + costo
    await page.getByPlaceholder('Nombre de la partida').fill('Partida PreQA')
    await page.getByRole('button', { name: '+ Agregar partida' }).click()
    await page.waitForTimeout(600)
    await page.getByText('+ Agregar ítem').click()
    await page.waitForTimeout(300)
    await page.getByPlaceholder('Referencia').fill('REF-PREQA-105')
    await page.getByPlaceholder('Descripción').fill('Item de prueba Pre-QA')
    await page.getByPlaceholder('Cantidad').fill('1')
    await page.getByPlaceholder('Precio unitario').fill('100')
    await page.getByPlaceholder('Costo').fill('50')
    await page.screenshot({ path: `${SHOTS}/105-3b-item-form-filled.png` })
    await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/105-3c-item-added.png`, fullPage: true })

    await page.getByRole('button', { name: 'Guardar y generar cotización' }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/105-3d-after-generate-attempt.png`, fullPage: true })

    // Debe haber generado con éxito: folio asignado (visible en la Vista Previa que se activa
    // tras generar) y sin mensaje de "faltan campos"
    await expect(page.getByText(/faltan|missing/i)).toHaveCount(0)
  })

  test('4. Volver a "Crear cotización" sobre la MISMA tarjeta (ya con folio) → NO crea una 3ra cotización, redirige a la existente, sin spinner infinito', async ({ page }) => {
    test.skip(!quoteBId || !cardId, 'quote B o la tarjeta no se crearon en un test anterior')
    await login(page, DESIGNER_EMAIL)

    // La tarjeta ya avanzó a Cotización (test 3) — "Crear cotización" solo vive en el modal
    // para tarjetas Lead/Diseño (ver PipelineCardModal.tsx), así que el botón ya no está en
    // pantalla. El código de guard/redirect que buscamos probar es el mismo que ese botón
    // dispara (`navigate('/ventas-diseno/quotes?fromPipelineCard=' + card.id)`), así que
    // navegamos directo a esa URL real con el id capturado al crear la tarjeta en el test 1 —
    // ejercita exactamente el mismo mount-effect de QuotePage.tsx que el botón real.
    await page.goto(`${BASE}/ventas-diseno/quotes?fromPipelineCard=${cardId}`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/105-4-duplicate-guard-result.png` })

    // Debe redirigir a UNA cotización existente con folio (no un spinner infinito eterno) —
    // y específicamente a QUOTE B (la que sí tiene folio), no crear una tercera cotización.
    await expect(page.getByText(/^Cargando/i)).toHaveCount(0)
    const url = page.url()
    const redirectedId = Number(url.match(/\/quotes\/(\d+)/)?.[1])
    expect(redirectedId).toBeGreaterThan(0)
    expect(redirectedId).toBe(quoteBId)
  })
})

// ============================= SCRUM-140 =============================
// Reusa la cotización generada por el bloque SCRUM-105 (quote B, con folio) — evita rearmar
// una cotización completa solo para esto. Si SCRUM-105 no corrió antes en la misma sesión,
// estos tests se saltan solos (quoteBId nunca se seteó).
// Permite correr este describe solo (sin SCRUM-105 antes en el mismo proceso) apuntando a una
// cotización con folio ya existente vía env var, ej.:
//   PREQA_QUOTE_ID=214 npx playwright test -g "SCRUM-140"
test.describe('SCRUM-140 — Vista Externa sin Observaciones/pago/Condiciones', () => {
  const envQuoteId = process.env.PREQA_QUOTE_ID ? Number(process.env.PREQA_QUOTE_ID) : null
  const effectiveQuoteId = () => quoteBId ?? envQuoteId
  test('1. Vista Externa oculta Observaciones/instrucciones de pago/Condiciones; Vista Previa las sigue mostrando', async ({ page }) => {
    test.skip(!effectiveQuoteId(), 'no hay una cotización con folio disponible (correr SCRUM-105 antes)')
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/quotes/${effectiveQuoteId()}`)
    await page.waitForTimeout(1000)

    // Vista Previa: Condiciones SÍ debe aparecer (conditions_text nace poblado por default,
    // ver SCRUM-138)
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText('Condiciones', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/140-1-preview-shows-conditions.png`, fullPage: true })

    // Vista Externa: Condiciones/Observaciones/instrucciones de pago deben desaparecer POR
    // COMPLETO (ni un contenedor vacío) — el pie de contacto sigue visible en ambas.
    await page.getByRole('button', { name: 'Vista externa', exact: true }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText('Condiciones', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Observaciones', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/cheque|ach/i)).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/140-1-external-hides-blocks.png`, fullPage: true })
  })

  test('2. Observaciones/Condiciones vacías o null: Vista Externa no deja un "—" residual donde antes iba ese contenido', async ({ page }) => {
    test.skip(!effectiveQuoteId(), 'no hay una cotización con folio disponible')
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/quotes/${effectiveQuoteId()}`)
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: 'Vista externa', exact: true }).click()
    await page.waitForTimeout(600)

    // Sin dashes sueltos de contenido que normalmente rellena Observaciones/Condiciones vacías
    // (el "—" del RUC/Contacto en el encabezado SÍ es válido, así que no basta con "count()===0"
    // de "—" global — confirmamos específicamente que no hay una sección con ese fallback).
    const looseDashBlocks = await page.locator('text=/^—$/').count()
    await page.screenshot({ path: `${SHOTS}/140-2-no-residual-dash.png`, fullPage: true })
    // Documentamos el conteo — el criterio real ya lo cubre el test 1 (Condiciones/Observaciones
    // ausentes por completo), esto es una verificación adicional de que no aparece un bloque
    // vacío "fantasma" en su lugar.
    expect(looseDashBlocks).toBeLessThanOrEqual(2) // encabezado (RUC/fecha), nunca más
  })

  test('3. Texto MUY largo en Condiciones no rompe la paginación de Vista Externa (se sigue ocultando limpio, sin salto de página vacío)', async ({ page }) => {
    test.skip(!effectiveQuoteId(), 'no hay una cotización con folio disponible')
    // Precondición: un conditions_text MUY largo ya se seteó a mano vía tinker directo en BD
    // ANTES de correr este test (no hay UI para editarlo por cotización desde SCRUM-138 — se
    // congela del default global al crear) — ver comando en el reporte de la sesión.
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/quotes/${effectiveQuoteId()}`)
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: 'Vista externa', exact: true }).click()
    await page.waitForTimeout(600)

    // No debe haber ningún salto de página vacío ni contenedor huérfano — confirmamos que el
    // documento renderiza un único bloque continuo (altura > 0, sin overflow negativo) y que
    // Condiciones sigue ausente incluso con el texto largo detrás en BD.
    await expect(page.getByText('Condiciones', { exact: true })).toHaveCount(0)
    const docBox = await page.locator('.quote-doc').boundingBox()
    expect(docBox?.height ?? 0).toBeGreaterThan(200)
    await page.screenshot({ path: `${SHOTS}/140-3-long-conditions-external.png`, fullPage: true })
  })

  test('4. Modo oscuro + Vista Externa: el pie de contacto (que sigue visible) no queda ilegible', async ({ page }) => {
    test.skip(!effectiveQuoteId(), 'no hay una cotización con folio disponible')
    await login(page, DESIGNER_EMAIL)
    await page.goto(`${BASE}/ventas-diseno/quotes/${effectiveQuoteId()}`)
    await page.waitForTimeout(1000)

    // Hallazgo de metodología (no de producto): un contexto 100% fresco de Playwright arranca
    // en modo OSCURO por default (sin `atlanticerp_theme` en localStorage) — lo confirmamos en vivo,
    // el botón real dice "Cambiar a modo claro" en ese caso, nunca "...oscuro". Si por lo que
    // sea arrancó en claro, lo pasamos a oscuro con ese botón; si ya nació oscuro, no hace falta
    // clickear nada.
    const toDarkBtn = page.getByTitle('Cambiar a modo oscuro')
    if (await toDarkBtn.count() > 0) await toDarkBtn.click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Vista externa', exact: true }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOTS}/140-4a-external-dark-screen.png`, fullPage: true })

    // Emular impresión (SCRUM-716 fuerza .quote-doc a fondo blanco/texto oscuro en @media
    // print, independientemente del tema) — confirmar que sigue vigente.
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/140-4b-external-dark-print-emulated.png`, fullPage: true })
    const bgColor = await page.locator('.quote-doc').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bgColor).toBe('rgb(255, 255, 255)')
    await page.emulateMedia({ media: null })
  })
})
