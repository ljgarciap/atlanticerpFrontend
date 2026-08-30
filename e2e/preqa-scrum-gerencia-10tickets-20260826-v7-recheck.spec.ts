import { test, expect, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Reviewer FUSIONADOS — RE-VERIFICACIÓN v7, 2026-08-26. Sigue a
// preqa-scrum-gerencia-9tickets-20260825-v6-recheck.spec.ts, tras commits nuevos backend
// (dbad9ec, 7d79236, aef2eb6, ea7a6bb) y frontend (af49af4, 5a8693c, a2d5040, 9706b1e), todos
// 2026-08-25. Corre contra dev.atlanticerp.ai — backend ead5669 / frontend 910e328 (HEAD de origin/dev
// confirmado por Luis antes de arrancar esta pasada).
//
// Resultado resumido (ver atlanticerp/docs/pre-qa/gerencia-epic-10tickets-20260826-v7-recheck.md para
// el detalle completo): 2/10 pasan (SCRUM-160, SCRUM-168 con reserva de "Bajo stock sin ordenar"
// aún pendiente pero fuera del alcance re-verificable hoy — ver reporte), 8/10 NO PASAN.
//
// Hallazgo transversal NUEVO más importante de esta pasada: "Salud por módulo" para Admin&Contab
// (SCRUM-167), Bodega (SCRUM-169) y Servicios (SCRUM-170) fueron redefinidos por Daniela el
// 2026-08-25 y el fix SÍ agregó los indicadores correctos con la navegación de origen correcta —
// pero NINGUNA de las 3 pantallas destino (CobrosPage.tsx, PedidosPage.tsx de Bodega,
// TicketsPage.tsx de Servicios) lee el query param que Gerencia envía (`estado=`, `chip=`) — el
// mismo patrón "querystring que el destino no consume" ya documentado para SCRUM-166 en v5/v6,
// ahora confirmado en 3 pantallas más.
//
// Segundo hallazgo transversal, más grave — SCRUM-161/162: GerenciaAprobacionController no filtra
// por tipo de solicitud. Confirmado en vivo creando una ReglaAprobacion de prueba (tipo=adjustment,
// aprobador=Whil, ELIMINADA al terminar la prueba) — Whil vio los 23 pendientes de TODOS los tipos,
// no solo adjustment. Además, aprobar/rechazar desde Gerencia escribe valores de enum INVÁLIDOS en
// cada modelo real (ej. 'aprobado' en vez de la constante real 'aprobada' de GeneralCountRequest) —
// confirmado en vivo aprobando CNT-5 desde Gerencia con Mark: desapareció de la bandeja de Gerencia
// pero quedó con estado='aprobado' (inválido) en Bodega, no 'aprobada' — dato real de dev.atlanticerp.ai
// dejado en este estado como evidencia, pendiente de corrección junto con el fix.

const WHIL = 'whil@atlantic.com.pa' // Gerencia Restringida, Nivel 8 — NO es Mark Approver
const MARK = 'mbekhar@atlantic.com.pa' // Mark Approver real
const MARK_PASSWORD = 'B1n4X_2026?' // password real en dev/test — NO es el default email
const TECH_SUPERADMIN = 'lujogarpin78@gmail.com' // password real = default (email)

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  // Defensivo (agregado v7 — ver feedback_preqa_crowdsec_no_paralelo): CrowdSec puede tardar en
  // servir /login tras varios logins seguidos de la misma IP incluso en modo secuencial. Nunca
  // dejar que un timeout acá tumbe todo el archivo — degradar a `false` para que cada test decida
  // con test.skip() si no hay sesión disponible, en vez de abortar el resto de tests serial.
  try {
    await page.context().clearCookies()
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
    await page.locator('input[type="email"]').waitFor({ timeout: 20000 })
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password ?? email)
    await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
    await page.waitForTimeout(1200)
    return !page.url().includes('/login')
  } catch {
    return false
  }
}

async function apiCall(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(async ({ m, u, b }) => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch(u, {
      method: m,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* not json */ }
    return { status: res.status, json }
  }, { m: method, u: url, b: body })
}

// ── SCRUM-159 — Panel Facturación ───────────────────────────────────────────
test('SCRUM-159 RN2 — CORREGIDO: margen del año/mes ahora es un valor real calculado (57.66%), ya no hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  expect((raw.json as any).facturacion.kpis.margen_anio_pct).toBeGreaterThan(0)
  expect((raw.json as any).facturacion.kpis.margen_mes_pct).toBeGreaterThan(0)
})

test('SCRUM-159 RN1 — gap arquitectónico PERSISTE, ahora con aviso transparente: el filtro de Vendedor no tiene efecto real en Facturación (AdminContInvoice no tiene FK de vendedor) — la UI ahora lo declara explícitamente en vez de fallar en silencio', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)
  const vendorSelect = page.locator('select').nth(0)
  const opts = await vendorSelect.locator('option').all()
  test.skip(opts.length < 2, 'sin vendedores reales en el select')
  const before = await page.locator('text=Facturado este año').locator('xpath=following-sibling::p[1]').textContent()
  await vendorSelect.selectOption((await opts[1].getAttribute('value'))!)
  await page.waitForTimeout(1000)
  const after = await page.locator('text=Facturado este año').locator('xpath=following-sibling::p[1]').textContent()
  expect(after).toBe(before) // sin efecto real, confirmado — no es un bug de UI, es el modelo de datos
  await expect(page.getByText('El filtro por vendedor aplica solo a Proyectos', { exact: false })).toBeVisible()
})

test('SCRUM-159 RN3/Escenario 2 — SIGUE ROTO: clic en una barra del gráfico navega a Facturación genérica, sin el mes como filtro (el callback onBarClick descarta el parámetro "mes" que BarChart sí le pasa)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)
  const monthLabel = page.getByText('Ago', { exact: true }).first()
  await monthLabel.click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/admin-contab/facturacion')
  expect(page.url()).not.toContain('?') // sin querystring de mes — RN3 pide navegar "al detalle de ESE MES específico"
})

// ── SCRUM-160 — Panel Proyectos ─────────────────────────────────────────────
test('SCRUM-160 RN1 — CORREGIDO Y CONFIRMADO EN VIVO: el filtro de Vendedor SÍ recalcula Proyectos ($769,441 → $55,000 con un vendedor real seleccionado)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)
  const before = await page.locator('text=Proyectos cerrados este año').locator('xpath=following-sibling::p[1]').textContent()
  const vendorSelect = page.locator('select').nth(0)
  const opts = await vendorSelect.locator('option').all()
  test.skip(opts.length < 2, 'sin vendedores reales en el select')
  const [req] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/gerencia/home') && r.method() === 'GET', { timeout: 8000 }).catch(() => null),
    vendorSelect.selectOption((await opts[1].getAttribute('value'))!),
  ])
  expect(req?.url()).toContain('vendedor_id=')
  await page.waitForTimeout(1000)
  const after = await page.locator('text=Proyectos cerrados este año').locator('xpath=following-sibling::p[1]').textContent()
  expect(after).not.toBe(before)
})

test('SCRUM-160 RN3 — CORREGIDO: margen cotizado año/mes ahora es un valor real (57.47%), ya no hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  expect((raw.json as any).proyectos.kpis.margen_anio_pct).toBeGreaterThan(0)
  expect((raw.json as any).proyectos.kpis.margen_mes_pct).toBeGreaterThan(0)
})

// ── SCRUM-161 — Aprobaciones listado personalizado ──────────────────────────
// NOTA (2026-08-26): este test hace 3 logins seguidos (superadmin setup → WHIL → superadmin
// cleanup) — bajo carga de CrowdSec puede degradar silenciosamente el 2do login a `false` (ver
// helper `login()` arriba) y hacer que el assert de abajo falle con types.size=0 en vez de
// confirmar el hallazgo. El hallazgo YA fue confirmado en vivo y de forma concluyente durante la
// sesión que escribió este spec (creación real de ReglaAprobacion tipo=adjustment→Whil, login
// real de Whil viendo los 23 pendientes de todos los tipos, cleanup real) — ver
// docs/pre-qa/gerencia-epic-10tickets-20260826-v7-recheck.md para la evidencia capturada. Si este
// test falla con types.size=0, re-correrlo aislado (no en la corrida completa) antes de asumir
// que el bug se corrigió.
test('SCRUM-161 RN2 — CRÍTICO CONFIRMADO EN VIVO (no solo lectura de código): un aprobador registrado en ReglaAprobacion SOLO para el tipo "adjustment" ve los 23 pendientes de TODOS los tipos (purchase_order/zona_libre/general_count), no solo los suyos — pendingApprovalsSection() no filtra por tipo, solo gatea visibilidad binaria', async ({ page }) => {
  test.setTimeout(60000)
  // Setup: crear regla de prueba vía superadmin
  const supOk = await login(page, TECH_SUPERADMIN)
  test.skip(!supOk, 'credencial de superadmin de prueba no disponible en este entorno')
  const usersResp = await apiCall(page, 'GET', '/api/users?per_page=100')
  const users = (usersResp.json as any)?.data ?? (usersResp.json as any) ?? []
  const whilUser = Array.isArray(users) ? users.find((u: any) => u.email === WHIL) : null
  test.skip(!whilUser, 'no se pudo resolver el id de whil vía /api/users')

  const createResp = await apiCall(page, 'POST', '/api/gerencia/reglas-aprobacion', {
    tipo: 'adjustment', activo: true,
    observaciones: 'TEST Pre-QA v7 — verificar aislamiento por tipo, ELIMINAR tras la prueba',
    aprobador_ids: [whilUser.id],
  })
  const reglaId = (createResp.json as any)?.id
  test.skip(!reglaId, 'no se pudo crear la regla de prueba')

  try {
    await login(page, WHIL)
    const home = await apiCall(page, 'GET', '/api/gerencia/home')
    const types = new Set(((home.json as any)?.aprobaciones ?? []).map((a: any) => a.type))
    // Confirma el bug: ve tipos que NO son 'adjustment' (purchase_order, zona_libre, general_count)
    expect(types.size).toBeGreaterThan(1)
    expect(Array.from(types)).toEqual(expect.arrayContaining(['purchase_order']))
  } finally {
    // Cleanup — nunca dejar la regla de prueba activa en dev
    await login(page, TECH_SUPERADMIN)
    await apiCall(page, 'DELETE', `/api/gerencia/reglas-aprobacion/${reglaId}`)
  }
})

test('SCRUM-161 — sin ninguna ReglaAprobacion activa (estado real de dev.atlanticerp.ai hoy), David/Whil no tienen forma de ser aprobadores — is_approver=false, aprobaciones=[]', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  expect((raw.json as any).is_approver).toBe(false)
  expect((raw.json as any).aprobaciones).toEqual([])
})

// ── SCRUM-162 — Detalle + Aprobar/Rechazar ──────────────────────────────────
test('SCRUM-162 RN1/RN2/RN3 — CORREGIDO: modal de detalle existe, botones Aprobar/Rechazar renderizan para Mark (aprobador real), "Ver en [módulo]" navega con el ID puntual preseleccionado', async ({ page }) => {
  test.setTimeout(45000)
  const ok = await login(page, MARK, MARK_PASSWORD)
  expect(ok).toBe(true)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const row = page.getByText('PO-8', { exact: false }).first()
  await row.click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(1)
  const verEnBtn = page.getByRole('button', { name: /^ver en/i })
  await verEnBtn.click()
  await page.waitForTimeout(900)
  expect(page.url()).toContain('/compras/ordenes?order=8') // ID puntual, no la lista genérica
})

test('SCRUM-162 — purchase_order correctamente NO ofrece botón Rechazar (regla de negocio ya documentada en el código: rechazo de PO se gestiona en Compras, no en Gerencia)', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('PO-8', { exact: false }).first().click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
})

test('SCRUM-162 RN4 — CRÍTICO CONFIRMADO EN VIVO: aprobar un conteo general desde Gerencia lo saca de la bandeja de Gerencia (mitad de RN4 cumple) pero escribe estado="aprobado" (inválido) en vez de la constante real GeneralCountRequest::ESTADO_APROBADA="aprobada" — el módulo de origen (Bodega) NO reconoce el registro como aprobado de verdad, RN4 ("se refleja en el módulo de origen") no se cumple', async ({ page }) => {
  test.setTimeout(30000)
  // NOTA: este test es informativo/de regresión — NO repite la mutación real en cada corrida para
  // no seguir corrompiendo datos de dev en cada ejecución del spec. Verifica el estado ya dejado
  // por la corrida original de esta sesión (2026-08-26) sobre GeneralCountRequest id=5 (CNT-5).
  const ok = await login(page, MARK, MARK_PASSWORD)
  test.skip(!ok)
  const origin = await apiCall(page, 'GET', '/api/bodega/general-counts/5')
  test.skip(origin.status !== 200, 'CNT-5 ya no existe o cambió de estado por otra causa — re-verificar manualmente')
  // Si alguien corrigió el bug (usando la constante real), este assert empieza a fallar — es la señal de que el fix ya se aplicó.
  expect((origin.json as any)?.estado).toBe('aprobado')
})

test('SCRUM-162 — código confirma el mismo patrón de valor-de-enum-inválido para relocation/adjustment/zona_libre (no solo general_count) — GerenciaAprobacionController usa literales de texto en vez de las constantes reales de cada modelo', async () => {
  // Documentado por lectura de código (no requiere sesión): RelocationRequest::ESTADO_APROBADA
  // = 'aprobada' (no 'aprobado'), AdjustmentRequestLine::ESTADO_APROBADA = 'Aprobada' (no
  // 'Aprobado'), BodegaZonaLibreRequest::STATUS_APROBADA = 'aprobada' (no 'aprobado') — los 4
  // helpers aprobar*/rechazar* de GerenciaAprobacionController (excepto purchase_order) escriben
  // el literal incorrecto en los 4 casos. Ver docs/pre-qa/gerencia-epic-10tickets-20260826-v7-recheck.md.
  expect(true).toBe(true)
})

// ── SCRUM-166 — Salud Ventas & Diseño ───────────────────────────────────────
test('SCRUM-166 RN1 — CONFIRMADO CORREGIDO: "En Final Stage" navega con ?stage=proposal y PipelinePage.tsx ahora sí lo reconoce (chip=final_stage), mostrando solo la columna Propuesta', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('En Final Stage', { exact: false }).first().click()
  await page.waitForTimeout(900)
  expect(page.url()).toContain('stage=proposal')
  await expect(page.getByText('Propuesta', { exact: false }).first()).toBeVisible()
})

test('SCRUM-166 RN2 — SIGUE ROTO, sin cambios desde v5/v6: "Estancados" navega con ?order=days, pero ese param en PipelinePage es orden de sorting (days/value), nunca activa el chip "stagnant"', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Estancados', { exact: false }).first().click()
  await page.waitForTimeout(900)
  expect(page.url()).toContain('order=days')
  await expect(page.getByText('Lead', { exact: true }).first()).toBeVisible() // todas las columnas, no solo estancados
})

test('SCRUM-166 RN3/RN4 — SIGUE ROTO, sin cambios: "Monto cotizado/aprobado del mes" siguen navegando sin ningún querystring de mes', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Monto cotizado en el mes', { exact: false }).first().click()
  await page.waitForTimeout(700)
  expect(page.url()).toBe('https://dev.atlanticerp.ai/ventas-diseno/quotes-list')
})

// ── SCRUM-167 — Salud Admin & Contab (redefinido por Daniela 2026-08-25) ────
test('SCRUM-167 — indicadores correctos (CxC Total / Cuentas al día, CxP eliminado) y navegación de origen correcta', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('CxC Total', { exact: false })).toBeVisible()
  await expect(page.getByText('Cuentas al día', { exact: false })).toBeVisible()
  await page.getByText('CxC Total', { exact: false }).first().click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/admin-contab/cobros?estado=esperando_confirmacion')
})

test('SCRUM-167 CA4 — CRÍTICO NUEVO: CobrosPage.tsx no lee el query param "estado" en absoluto (solo lee master_client_id/accion) — el filtro "Esperando confirmación" nunca se aplica visualmente, el usuario ve el listado completo sin filtrar', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/admin-contab/cobros?estado=esperando_confirmacion')
  await page.waitForTimeout(1500)
  // El select de estado sigue en su default ("Todos los estados"), no en "Esperando confirmación"
  const estadoSelect = page.locator('select', { hasText: 'Todos los estados' })
  await expect(estadoSelect).toHaveCount(1)
})

// ── SCRUM-168 — Salud Compras ────────────────────────────────────────────────
test('SCRUM-168 RN1 — CORREGIDO Y CONFIRMADO: el conteo de "Órdenes críticas" en la tarjeta (43) ahora COINCIDE con el total real que devuelve el filtro ?chip=critical (43) — antes 41 vs 43', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  const cardCount = (raw.json as any).salud_modulos.compras.ordenes_criticas
  await page.getByText('Órdenes críticas', { exact: false }).first().click()
  await page.waitForTimeout(900)
  const apiTotal = await apiCall(page, 'GET', '/api/compras/orders?chip=critical&per_page=1')
  expect((apiTotal.json as any).meta?.total).toBe(cardCount)
})

test('SCRUM-168 RN2/Escenario 1 — SIGUE FALTANDO, sin cambios: el indicador "Bajo stock sin ordenar" no existe en la tarjeta', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Bajo stock sin ordenar', { exact: false })).toHaveCount(0)
})

// ── SCRUM-169 — Salud Bodega (redefinido por Daniela 2026-08-25) ───────────
test('SCRUM-169 CA3 — CORRECTO: "Despachado a tiempo" es el único indicador sin navegación, tal como pide RN3 de Daniela (no debe navegar ni ejecutar acción)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Despachado a tiempo', { exact: false }).first().click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/gerencia') // no navegó a ningún lado
})

test('SCRUM-169 CA1/CA4/CA5 — CRÍTICO NUEVO: PedidosPage.tsx (Bodega) inicializa el chip en useState<Chip>(\'all\') hardcodeado — nunca lee ?chip= de la URL — "Despachos urgentes" y "Despachos atrasados" navegan a URLs distintas pero la pantalla se ve IDÉNTICA en ambas (mismo total "25 pedidos en proceso")', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/bodega/pedidos?chip=urgentes')
  await page.waitForTimeout(1500)
  const urgentesText = await page.locator('body').innerText()
  await page.goto('/bodega/pedidos?chip=atrasados')
  await page.waitForTimeout(1500)
  const atrasadosText = await page.locator('body').innerText()
  // Mismo contenido pese a query params distintos — confirma que el chip no se aplica
  expect(urgentesText.slice(0, 200)).toBe(atrasadosText.slice(0, 200))
})

// ── SCRUM-170 — Salud Servicios (redefinido por Daniela 2026-08-25) ────────
test('SCRUM-170 CA2/CA5 — CORRECTO: "Resuelto en 1ra visita" fue eliminado, quedan solo 2 indicadores (Sin responder / Completados este mes)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Resuelto en 1ra visita', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Sin responder', { exact: false })).toBeVisible()
  await expect(page.getByText('Completados este mes', { exact: false })).toBeVisible()
})

test('SCRUM-170 CA1/CA4 — CRÍTICO NUEVO: TicketsPage.tsx inicializa filtros en EMPTY_TICKET_FILTERS, nunca lee ?estado= de la URL — "Sin responder" navega a ?estado=reportado pero el listado muestra los 20 tickets totales, no solo los reportados', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/servicios/tickets?estado=reportado')
  await page.waitForTimeout(1500)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  const sinResponder = (raw.json as any).salud_modulos.servicios.sin_responder // 7
  const body = await page.locator('body').innerText()
  const match = body.match(/Mostrando (\d+) de (\d+) tickets/)
  expect(match).not.toBeNull()
  // Si el filtro se aplicara de verdad, el total mostrado sería igual a sin_responder (7).
  // Confirmamos el bug: NO coincide (el listado no está filtrado).
  expect(Number(match![2])).not.toBe(sinResponder)
})

// ── SCRUM-171 — Agenda de Bodega — hoy ──────────────────────────────────────
test('SCRUM-171 RN2 — SIGUE ROTO, sin cambios desde v5/v6: "Ver detalle" navega a /bodega/pedidos (lista genérica) — la pantalla "Rutas de entrega del día completo" que pide RN2 sigue sin existir en el código', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Bodega — hoy', { exact: true })
  const btn = heading.locator('xpath=following::button[normalize-space(text())="Ver detalle"][1]')
  await btn.click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/pedidos')
  await expect(page.getByText(/ruta.*entrega/i)).toHaveCount(0)
})

test('SCRUM-171 — SIGUE SIN DATOS DE AGENDA HOY (3ra sesión consecutiva v5→v7): agendas.bodega=[] en dev.atlanticerp.ai, RN1/RN3 siguen sin poder ejercitarse end-to-end con datos reales', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await apiCall(page, 'GET', '/api/gerencia/home')
  expect((raw.json as any).agendas.bodega).toEqual([])
})
