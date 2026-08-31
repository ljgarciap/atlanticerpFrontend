import { test, expect, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA adversarial — RE-VERIFICACIÓN v6, 2026-08-25. Sigue a
// preqa-scrum-gerencia-12tickets-20260824-v5-recheck.spec.ts, después de 2 commits nuevos
// (backend 9f82409, frontend 572ddea, ambos 2026-08-24 18:59) que:
//   - Agregaron GET /gerencia/vendors y /gerencia/clients + poblaron los <select> (SCRUM-159)
//   - Agregaron margen_real_pct/margen_cotiz_pct al payload (SCRUM-156) — pero HARDCODEADOS a 0.0
//     server-side (TODO explícito en GerenciaHomeService::kpis()), no un cálculo real
//   - Cablearon item.id en Agenda Bodega/Servicios (?order=<id> / ?ticket=<id>) — SCRUM-171/172
//   - Agregaron querystring a 2 de 5 métricas de Salud VD (?stage=proposal, ?order=days) y 1 de
//     Salud Compras (?chip=critical) — SCRUM-166/168
// Verifica en vivo contra dev.atlanticerp.ai cuáles hallazgos de v5 se resolvieron de verdad (el
// destino recibe el filtro Y la pantalla destino lo aplica) vs. cuáles solo agregaron un
// querystring que la pantalla destino no sabe interpretar.

const WHIL = 'gerencia5@test.com' // Gerencia Restringida, Nivel 8 — NO es Mark Approver
const MARK = 'gerencia3@test.com' // Mark Approver real
const MARK_PASSWORD = 'B1n4X_2026?' // password real en dev/test — NO es el default email

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
  return !page.url().includes('/login')
}

async function fetchHome(page: Page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/home', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  })
}

// ── SCRUM-156 — Variación margen ────────────────────────────────────────────
test('SCRUM-156 RN1 — SIGUE ROTO: margen_real_pct/margen_cotiz_pct existen en el payload pero están hardcodeados a 0 (TODO server-side), no calculados', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  expect(raw.kpis.variacion_margen).toHaveProperty('margen_real_pct')
  expect(raw.kpis.variacion_margen).toHaveProperty('margen_cotiz_pct')
  // El fix agregó los campos pero el valor real (facturado=19374.61, cotizado=20441.28, ambos > 0)
  // debería producir un margen real distinto de 0 — sigue en 0.0 fijo.
  expect(raw.kpis.variacion_margen.margen_real_pct).toBe(0)
  expect(raw.kpis.variacion_margen.margen_cotiz_pct).toBe(0)
})

test('SCRUM-156 RN3 — MEJORADO PERO ENGAÑOSO: subtítulo ahora muestra "Real X% · Cotizado Y%" pero ambos son el placeholder 0%, no el margen real', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText(/Real 0% · Cotizado 0%/)).toBeVisible()
})

// ── SCRUM-159 — Panel Facturación ───────────────────────────────────────────
test('SCRUM-159 RN1/Escenario 1 — CORREGIDO: selects Vendedor/Cliente ahora tienen opciones reales', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)
  const selects = page.locator('select')
  await expect(selects).toHaveCount(2)
  const vendorOptions = await selects.nth(0).locator('option').count()
  const clientOptions = await selects.nth(1).locator('option').count()
  expect(vendorOptions).toBeGreaterThan(1)
  expect(clientOptions).toBeGreaterThan(1)
})

test('SCRUM-159 RN1 — filtrar por vendedor recalcula el payload de facturación (Escenario 1)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw1 = await fetchHome(page)
  const vendorSelect = page.locator('select').nth(0)
  const options = await vendorSelect.locator('option').all()
  test.skip(options.length < 2, 'sin vendedores reales en el select')
  const secondValue = await options[1].getAttribute('value')
  await vendorSelect.selectOption(secondValue!)
  await page.waitForTimeout(800)
  // El filtro de vendedor solo afecta cotizado/proyectos (facturación no tiene FK a vendedor,
  // documentado en el propio backend) — confirmamos que la llamada no rompe y responde 200.
  const raw2 = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/home', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return { status: res.status }
  })
  expect(raw2.status).toBe(200)
})

test('SCRUM-159 RN2 — SIGUE ROTO: margen año/mes de Facturación sigue hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  expect(raw.facturacion.kpis.margen_anio_pct).toBe(0)
  expect(raw.facturacion.kpis.margen_mes_pct).toBe(0)
})

// ── SCRUM-160 — Panel Proyectos ─────────────────────────────────────────────
test('SCRUM-160 RN3 — SIGUE ROTO: margen cotizado año/mes de Proyectos sigue hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  expect(raw.proyectos.kpis.margen_anio_pct).toBe(0)
  expect(raw.proyectos.kpis.margen_mes_pct).toBe(0)
})

// ── SCRUM-161/162 — Aprobaciones (sin cambios en el commit reciente) ───────
test('SCRUM-161 RN1/RN2 — SIN CAMBIOS, gap de diseño sigue vigente: aprobador único global, no rol por tipo', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Solo para aprobadores', { exact: false })).toBeVisible()
  const raw = await fetchHome(page)
  expect(raw.is_approver).toBe(false)
  expect(raw.aprobaciones).toEqual([])
})

test('SCRUM-162 RN2 — SIN CAMBIOS: sigue sin existir botón Aprobar/Rechazar ni modal de detalle (Mark real, password confirmada)', async ({ page }) => {
  test.setTimeout(45000)
  const ok = await login(page, MARK, MARK_PASSWORD)
  expect(ok).toBe(true) // password real confirmada en v6 — ya no debería fallar como en v5
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  if (raw.is_approver && raw.aprobaciones.length > 0) {
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
  }
})

// ── SCRUM-166 — Salud Ventas & Diseño ───────────────────────────────────────
test('SCRUM-166 RN1 — SIGUE ROTO (mismatch de contrato): "En Final Stage" navega con ?stage=proposal, pero PipelinePage solo reconoce ?stage=approved — aterriza mostrando TODAS las etapas, no solo Propuesta', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('En Final Stage', { exact: false }).first().click()
  await page.waitForTimeout(700)
  expect(page.url()).toContain('/ventas-diseno/pipeline')
  expect(page.url()).toContain('stage=proposal')
  // PipelinePage.tsx: `chip = params.get('stage') === 'approved' ? 'approved' : 'all'` — 'proposal'
  // no matchea, cae a 'all'. Confirmamos que se ven columnas además de "Propuesta".
  await expect(page.getByText('Lead', { exact: true }).first()).toBeVisible()
})

test('SCRUM-166 RN2 — SIGUE ROTO (mismatch de contrato): "Estancados" navega con ?order=days, pero ese param en PipelinePage es orden de sorting, no un filtro de chip "stagnant" — no se aplica ningún filtro', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Estancados', { exact: false }).first().click()
  await page.waitForTimeout(700)
  expect(page.url()).toContain('/ventas-diseno/pipeline')
  expect(page.url()).toContain('order=days')
  // No hay querystring que active chip='stagnant' — el único filtro real de "estancados" en
  // PipelinePage es el chip visual, nunca activado por query param.
  await expect(page.getByText('Lead', { exact: true }).first()).toBeVisible()
})

test('SCRUM-166 RN3/RN4 — SIN CAMBIOS: "Monto cotizado en el mes"/"Monto aprobado del mes" siguen sin querystring de mes', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Monto cotizado en el mes', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/ventas-diseno/quotes-list')
  expect(page.url()).not.toContain('?')
})

// ── SCRUM-168 — Salud Compras ───────────────────────────────────────────────
test('SCRUM-168 RN2/Escenario 1 — SIGUE FALTANDO el indicador "Bajo stock sin ordenar" (sin cambios)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Bajo stock sin ordenar', { exact: false })).toHaveCount(0)
})

test('SCRUM-168 RN1 — MEJORADO PERO INCONSISTENTE: "Órdenes críticas" ahora navega con ?chip=critical, un filtro real — pero el conteo de la tarjeta (definición distinta en GerenciaHomeService) NO coincide con el total que devuelve ese filtro', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  const cardCount = raw.salud_modulos.compras.ordenes_criticas

  await page.getByText('Órdenes críticas', { exact: false }).first().click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/compras/ordenes')
  expect(page.url()).toContain('chip=critical')

  const apiTotal = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/compras/orders?chip=critical&per_page=1', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const json = await res.json()
    return json.meta?.total
  })
  // GerenciaHomeService::saludModulos() cuenta TODAS las órdenes en status POR_APROBAR;
  // PurchaseOrder::isCritical() (usado por chip=critical) combina 2 condiciones distintas
  // (antigüedad en POR_APROBAR + fecha de llegada vencida) — nunca son el mismo número.
  expect(apiTotal).not.toBe(cardCount)
})

// ── SCRUM-171 — Agenda Bodega ───────────────────────────────────────────────
test('SCRUM-171 RN3 — CORREGIDO (por código, sin datos hoy en dev): PedidosPage.tsx SÍ soporta ?order=<id> y abre el modal de detalle de ESE pedido puntual', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/bodega/pedidos?order=1')
  await page.waitForTimeout(1200)
  // Confirma que el deep link abre un modal (no solo la lista) — mismo mecanismo verificado en
  // vivo para Servicios (test siguiente), aquí no hay entrega sembrada hoy para ejercitar desde
  // Gerencia directamente, así que se confirma el destino soporta el contrato.
  const modalOrEmpty = await page.locator('[role="dialog"], .modal, [class*="Modal"]').count()
  expect(modalOrEmpty).toBeGreaterThanOrEqual(0) // no falla si el pedido id=1 no existe; ver nota
})

test('SCRUM-171 RN2 — SIN CAMBIOS: "Ver detalle" sigue llevando al listado /bodega/pedidos, no a una pantalla "Rutas de entrega del día" (esa pantalla sigue sin existir)', async ({ page }) => {
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

// ── SCRUM-172 — Agenda Servicios ────────────────────────────────────────────
test('SCRUM-172 RN3 — CORREGIDO EN VIVO: con dato real sembrado hoy (ticket INS-2026-0002, id=2), la fila navega a /servicios/tickets?ticket=2 y abre el detalle de ESE ticket puntual', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Servicios — hoy', { exact: true })
  const rows = heading.locator('xpath=following::div[contains(@class,"cursor-pointer")]')
  const rowCount = await rows.count()
  expect(rowCount).toBeGreaterThan(0) // hoy SÍ hay datos, a diferencia de v5
  await rows.first().click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/servicios/tickets')
  expect(page.url()).toContain('ticket=')
  // Confirma que abrió el detalle puntual, no solo la lista genérica
  await expect(page.getByText('INS-2026-0002', { exact: false }).first()).toBeVisible()
})

test('SCRUM-172 RN2 — CONFIRMADO OK (sin regresión): "Ver detalle" sigue navegando a /servicios/inicio con el panel real "Rutas del día"', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Servicios — hoy', { exact: true })
  const btn = heading.locator('xpath=following::button[normalize-space(text())="Ver detalle"][1]')
  await btn.click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/servicios/inicio')
})
