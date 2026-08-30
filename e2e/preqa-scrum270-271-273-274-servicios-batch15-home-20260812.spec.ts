import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — Fase 4 Servicios, Batch 15 "Inicio" (SCRUM-270/271/273/274,
 * REQ-207/208/210/211). Alcance deliberadamente parcial — NO cubre SCRUM-272/275/276/277/278
 * (Mi calendario, Servicios sin responder, Insumos y herramientas, modal Ver ticket, Estado de
 * tickets), que no tienen código en este batch.
 *
 * Corre contra el stack Docker aislado `batch15review` (backend :8095) + vite dev del worktree
 * batch15-frontend (:5173), NO dev.atlanticerp.ai — este trabajo todavía no se pusheó.
 *
 * Fixtures reales sembradas vía tinker para este batch (ver seed_fixtures2.php en el scratchpad):
 * 6 visitas hoy (para ejercitar el límite de 5 + "Ver agenda completa"), 1 ticket sin agendar hace
 * 4 días (debe aparecer en Pendientes) + 1 hace 1 día (NO debe aparecer), 3 instalaciones cerradas
 * este mes + 4 garantías cerradas este mes (3 con visit_count=1, 1 con visit_count=2) para
 * Indicadores del mes.
 *
 * Cuentas reales (password = email):
 *  - servicio@atlantic.com.pa   (lider_servicios) — Aaron, ve TODO incl. "+ Nuevo ticket"
 *  - carlos@atlantic.com.pa     (tecnico_servicios) — NO debe ver "+ Nuevo ticket"
 *  - garantias@atlantic.com.pa  (garantias_servicios) — NO debe ver "+ Nuevo ticket"
 *
 * ⚠️ Tests 1-12 (arriba) dependen de las fixtures de rutas/pendientes/indicadores sembradas para el
 * worktree `batch15review` original (backend :8095), que ya no existe — al re-correr esta suite
 * contra un stack limpio (ej. el stack local compartido :8090, sin esas fixtures puntuales) esos
 * tests van a fallar por falta de datos, no por regresión real. Deuda conocida, no corregida en
 * este re-check (fuera de alcance del fix puntual verificado abajo) — ver
 * feedback_e2e_permanent_tests_must_self_seed.md en memoria del proyecto.
 *
 * Tests 13-16 (agregados 2026-08-12, re-check del CRÍTICO de REQ-211 Escenario 5 — control de meta
 * manual, commits ff41fb1/46942bf) SÍ son self-seeding/idempotentes a propósito: no dependen de
 * ningún fixture previo, solo del roster real (siempre presente, CoreUserSeeder/
 * BusinessRoleUserSeeder corren en todos los entornos) y restauran el valor de meta original al
 * final vía la API real — pueden correr solas, en cualquier orden relativo a los tests 1-12, contra
 * cualquier stack que tenga el roster real sembrado.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const API_BASE = process.env.PREQA_API_BASE_URL ?? 'http://localhost:8090'
const DL_DIR = 'e2e/.tmp/preqa-servicios-batch15-home'

async function login(page: Page, email: string) {
  // Cada test debe partir de una sesión limpia — sin esto, un token de una corrida anterior
  // (ej. re-uso de contexto entre tests de la misma suite) hace que /login redirija directo al
  // Home autenticado y el resto del helper cuelgue esperando un input que nunca aparece.
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoHome(page: Page) {
  // Ruta real (App.tsx): /servicios/inicio — NO /servicios/home. Un typo acá cae en el catch-all
  // `*` → <Navigate to={getHomeRoute(user)}>, que por coincidencia aterriza en la pantalla correcta
  // para usuarios cuyo ÚNICO/primer módulo es servicios (Aaron/Carlos/Miguel), enmascarando el
  // error hasta que se prueba con un usuario multi-módulo (Daniela, ventas_diseno con prioridad
  // más alta en MODULE_HOME_ROUTES) — descubierto exactamente así durante esta pasada.
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1500)
}

test('1. Aaron (lider_servicios) — Encabezado: título, botones Agenda y + Nuevo ticket', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/01-home-aaron.png`, fullPage: true })

  await expect(page.getByRole('heading', { name: 'Inicio de Servicios' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toBeVisible()
})

test('2. Aaron — REQ-207 RN2: botón Agenda navega a Técnicos Internos → Agenda equipo sin filtro', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  await page.waitForTimeout(1500)
  expect(page.url()).toContain('/servicios/tecnicos?view=agenda')
  await page.screenshot({ path: `${DL_DIR}/02-agenda-desde-home.png`, fullPage: true })

  // "sin filtro de técnico aplicado (vista de todos)" — el selector de técnico debe arrancar vacío
  const techFilter = page.locator('select').filter({ hasText: /todos/i }).first()
  if (await techFilter.count() > 0) {
    await expect(techFilter).toHaveValue('')
  }
})

test('3. Aaron — REQ-207 RN1: + Nuevo ticket abre EXACTAMENTE el mismo formulario del módulo Tickets', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.getByRole('button', { name: 'Nuevo ticket' }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/03-modal-nuevo-ticket.png`, fullPage: true })

  // Distintivo del formulario real de Tickets (búsqueda en cascada Cliente Master/Subcliente/
  // Proyecto) — si esto aparece, es el mismo componente, no un formulario simplificado propio.
  await expect(page.getByText('Cliente Master')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear ticket' })).toBeVisible()

  await page.keyboard.press('Escape').catch(() => {})
})

test('4. Aaron — REQ-208: Rutas del día muestra máx. 5 de 6 visitas + "Ver agenda completa"', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/04-rutas-dia.png`, fullPage: true })

  await expect(page.getByRole('heading', { name: 'Rutas del día' })).toBeVisible()

  const rows = page.locator('li').filter({ hasText: 'Waze' })
  const count = await rows.count()
  console.log('[REQ-208] filas de Rutas del día visibles:', count)
  expect(count).toBe(5) // 6 visitas sembradas hoy, límite de 5 (DEFAULT_ROUTES_LIMIT)

  await expect(page.getByRole('button', { name: 'Ver agenda completa' })).toBeVisible()

  // RN5 — el botón Waze/Maps abre Google Maps con la dirección real de la visita
  const firstWazeLink = page.getByRole('link', { name: /Waze/i }).first()
  const href = await firstWazeLink.getAttribute('href')
  expect(href).toContain('google.com/maps/search')
  console.log('[REQ-208 RN5] href Waze/Maps:', href)

  // "Ver agenda completa" navega a Técnicos Internos → Agenda equipo
  await page.getByRole('button', { name: 'Ver agenda completa' }).click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/servicios/tecnicos?view=agenda')
})

test('5. Aaron — REQ-210: Pendientes muestra badge=1 y SOLO el ticket >3 días (no el de 1 día)', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/05-pendientes.png`, fullPage: true })

  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible()
  await expect(page.getByText('sin agendar hace 4 días')).toBeVisible()
  // Escenario 2 — reportado hace 1 día NO debe aparecer todavía
  await expect(page.getByText('Cliente Reciente QA')).toHaveCount(0)
  await expect(page.getByText(/sin agendar hace 1 día/)).toHaveCount(0)

  const badge = page.locator('span.rounded-full.bg-red-500')
  await expect(badge).toHaveText('1')
})

test('6. Aaron — REQ-210 RN5: "Ver ticket" navega al ticket CORRECTO (deep-link ?ticket=)', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)

  await page.getByRole('button', { name: 'Ver ticket' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DL_DIR}/06-deeplink-ticket.png`, fullPage: true })

  expect(page.url()).toMatch(/\/servicios\/tickets\?ticket=\d+/)

  // Confirmar que el modal que abre es el del ticket CORRECTO (Cliente Sin Agendar QA), no
  // cualquier ticket ni la pantalla en blanco — este es el punto que el pedido pidió verificar
  // explícitamente (no solo "aterriza en la pantalla correcta"). Matchea 2 elementos a propósito
  // (la fila de tabla de fondo + el párrafo del modal) — confirma que ambos refieren al mismo
  // ticket, no que el selector esté mal.
  await expect(page.getByText('Cliente Sin Agendar QA').first()).toBeVisible()
  expect(await page.getByText('Cliente Sin Agendar QA').count()).toBeGreaterThanOrEqual(1)
})

test('7. Aaron — REQ-211: Indicadores del mes con datos reales sembrados', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/07-indicadores.png`, fullPage: true })

  await expect(page.getByRole('heading', { name: 'Indicadores del mes' })).toBeVisible()
  await expect(page.getByText('3 / 36')).toBeVisible() // completadas=3, meta=36 (manual_default)
  await expect(page.getByText('Meta de referencia (sin historial suficiente todavía).')).toBeVisible()
  await expect(page.getByText('75%')).toBeVisible() // resuelto_primera_visita_pct
  await expect(page.getByText('Resuelto 1ra visita')).toBeVisible()
  await expect(page.getByText('Tiempo prom. resolución')).toBeVisible()
  await expect(page.getByText('Ingresos por instalaciones')).toBeVisible()
})

test('8. Carlos (tecnico_servicios) — gate REQ-245 RN4: NO debe ver "+ Nuevo ticket", panels SÍ visibles (RN1)', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/08-home-carlos.png`, fullPage: true })

  await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible()

  // RN1 de los 3 paneles — visibles para TODOS los roles del módulo, no solo Aaron/gerencia
  await expect(page.getByRole('heading', { name: 'Rutas del día' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Indicadores del mes' })).toBeVisible()
})

test('9. Miguel (garantias_servicios) — mismo gate: NO debe ver "+ Nuevo ticket"', async ({ page }) => {
  await login(page, 'garantias@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/09-home-miguel.png`, fullPage: true })

  await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toHaveCount(0)
})

test('10. Daniela (management) — SÍ debe ver "+ Nuevo ticket" (rol autorizado)', async ({ page }) => {
  await login(page, 'daniela@atlantic.com.pa')
  await gotoHome(page)
  await page.screenshot({ path: `${DL_DIR}/10-home-daniela.png`, fullPage: true })

  await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toBeVisible()
})

test('11. Ruptura — recargar Home a mitad del modal "+ Nuevo ticket" no deja la app en estado roto', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await page.getByRole('button', { name: 'Nuevo ticket' }).click()
  await page.waitForTimeout(500)
  await page.reload()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/11-reload-mid-modal.png`, fullPage: true })

  // El modal se cierra (estado de React se resetea, esperado) pero la pantalla de Inicio debe
  // seguir funcional, no en blanco/error.
  await expect(page.getByRole('heading', { name: 'Inicio de Servicios' })).toBeVisible()
})

test('12. Ruptura — doble clic en "+ Nuevo ticket" no abre 2 modales superpuestos', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  const btn = page.getByRole('button', { name: 'Nuevo ticket' })
  await btn.click()
  await btn.click({ force: true }).catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/12-doble-clic-nuevo-ticket.png`, fullPage: true })

  const titles = page.getByRole('heading', { name: 'Nuevo ticket' })
  await expect(titles).toHaveCount(1)
})

// ── REQ-211 Escenario 5 — control de meta manual (re-check 2026-08-12, commits ff41fb1/46942bf) ──
// El CRÍTICO original: backend soportaba PUT /api/servicios/home/installation-goal
// (role:superadmin,management) pero ningún control de frontend lo llamaba. Tests 13-16 cubren el
// gate de rol (ícono visible SOLO management/superadmin) y el guardado real, self-seeding: no
// dependen de fixtures previas, y restauran el valor original de la meta al final vía la API real
// (login por API + PUT) para no dejar el entorno con un override permanente entre corridas.

async function apiLogin(request: import('@playwright/test').APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API_BASE}/api/auth/login`, { data: { email, password: email } })
  const body = await res.json()
  return body.token as string
}

test('13. Gate de rol — pencil de "Ajustar meta" visible SOLO para superadmin/management', async ({ page }) => {
  // Daniela (management) — SÍ debe ver el ícono.
  await login(page, 'daniela@atlantic.com.pa')
  await gotoHome(page)
  await expect(page.getByTitle(/ajustar meta|meta de instalaciones/i)).toBeVisible()

  // Aaron (lider_servicios) — NO debe verlo (mismo gate que el backend, role:superadmin,management).
  await login(page, 'servicio@atlantic.com.pa')
  await gotoHome(page)
  await expect(page.getByTitle(/ajustar meta|meta de instalaciones/i)).toHaveCount(0)
  await page.screenshot({ path: `${DL_DIR}/13-gate-rol-sin-pencil-aaron.png`, fullPage: true })
})

test('14. Management guarda un valor nuevo — panel y leyenda se actualizan de inmediato', async ({ page, request }) => {
  // Captura el valor/origen actual vía API para poder restaurarlo al final (idempotencia).
  const token = await apiLogin(request, 'daniela@atlantic.com.pa')
  const before = await (await request.get(`${API_BASE}/api/servicios/home/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()
  const originalMeta = before.indicadores_mes.instalaciones.meta as number

  await login(page, 'daniela@atlantic.com.pa')
  await gotoHome(page)

  const testValue = originalMeta === 999 ? 998 : 999
  await page.getByTitle(/ajustar meta|meta de instalaciones/i).click()
  await page.waitForTimeout(400)
  const input = page.locator('input[type="number"]')
  await input.fill(String(testValue))
  await page.getByRole('button', { name: /confirmar|guardar/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14-goal-saved.png`, fullPage: true })

  await expect(page.getByText(`0 / ${testValue}`)).toBeVisible()
  await expect(page.getByText('Meta ajustada manualmente por Gerencia para este mes.')).toBeVisible()

  // Restaura el valor original — no deja el override de la corrida de test como estado permanente.
  await request.put(`${API_BASE}/api/servicios/home/installation-goal`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, value: originalMeta },
  })
})

test('15. Validación — valor negativo o vacío deja "Guardar" deshabilitado (no llega a la API)', async ({ page }) => {
  await login(page, 'daniela@atlantic.com.pa')
  await gotoHome(page)
  await page.getByTitle(/ajustar meta|meta de instalaciones/i).click()
  await page.waitForTimeout(400)

  const input = page.locator('input[type="number"]')
  const confirmBtn = page.getByRole('button', { name: /confirmar|guardar/i })

  await input.fill('')
  await expect(confirmBtn).toBeDisabled()

  await input.fill('-5')
  await page.screenshot({ path: `${DL_DIR}/15-validacion-negativo.png`, fullPage: true })
  await expect(confirmBtn).toBeDisabled()
})

test('16. Gate de backend — PUT installation-goal responde 403 para un rol sin permiso', async ({ request }) => {
  const token = await apiLogin(request, 'servicio@atlantic.com.pa') // lider_servicios
  const res = await request.put(`${API_BASE}/api/servicios/home/installation-goal`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, value: 50 },
  })
  expect(res.status()).toBe(403)
})
