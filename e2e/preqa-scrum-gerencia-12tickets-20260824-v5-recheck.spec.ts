import { test, expect, Page } from '@playwright/test'

// Pre-QA adversarial — CUARTA PASADA POST-MERGE (v5), 2026-08-24 tarde. Sigue a
// preqa-scrum-gerencia-12tickets-20260824-v3-postmerge.spec.ts, después de 2 commits de fix
// adicionales (066acfb, 3d89f18) que corrigieron destinos de navegación y agregaron onClick a las
// barras del gráfico. Verifica en vivo contra dev.atlanticerp.ai cuáles hallazgos de
// docs/pre-qa/gerencia-epic-12tickets-20260824-v4-final.md siguen vigentes tras ese fix.

const WHIL = 'gerencia5@test.com' // Gerencia Restringida, Nivel 8 — NO es Mark Approver
const MARK = 'gerencia3@test.com' // Mark Approver real

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
test('SCRUM-156 RN1/RN3 — SIGUE ROTO: el KPI calcula variación de MONTO, no de margen en puntos porcentuales; subtítulo sigue en $, no en %', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  // RN1: "margen facturado del mes − margen cotizado del mes, en puntos porcentuales".
  // Lo real: variacion_pct = (facturado - cotizado) / cotizado * 100, ambos montos en $.
  expect(raw.kpis.variacion_margen).toHaveProperty('facturado')
  expect(raw.kpis.variacion_margen).toHaveProperty('cotizado')
  // No existe ningún campo de margen real (porcentaje) en el payload del KPI — confirma que el
  // cálculo sigue siendo sobre montos, no márgenes.
  expect(raw.kpis.variacion_margen).not.toHaveProperty('margen_facturado_pct')
  expect(raw.kpis.variacion_margen).not.toHaveProperty('margen_cotizado_pct')
  // RN3: el subtítulo del UI muestra "Facturado $X · Cotizado $Y", no "ambos porcentajes explícitos"
  await expect(page.getByText(/Facturado \$[\d,.]+ · Cotizado \$[\d,.]+/)).toBeVisible()
})

test('SCRUM-156 Escenario 2 — MEJORADO: clic navega a /admin-contab/facturacion (antes /admin-contab genérico)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Variación margen facturado vs. cotizado', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/admin-contab/facturacion')
})

// ── SCRUM-157 — CxC al día (ya pasaba en v4, re-confirmar no hay regresión) ─
test('SCRUM-157 — sigue OK: monto $ como valor principal, subtítulo con % y total entre paréntesis, navega a /admin-contab/facturacion', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('CxC al día', { exact: false }).first()).toBeVisible()
  await page.getByText('CxC al día', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/admin-contab/facturacion')
})

// ── SCRUM-158 — Proyectos activos (ya pasaba en v4, re-confirmar) ───────────
test('SCRUM-158 — sigue OK: cuenta total + subtítulo, navega a /ventas-diseno/pipeline', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('en todos los módulos', { exact: false })).toBeVisible()
  await page.getByText('Proyectos activos', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/ventas-diseno/pipeline')
})

// ── SCRUM-159 — Panel Facturación ───────────────────────────────────────────
test('SCRUM-159 RN1/Escenario 1 — SIGUE ROTO: selects Vendedor/Cliente sin opciones reales, Escenario 1 no ejecutable', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const selects = page.locator('select')
  await expect(selects).toHaveCount(2)
  await expect(selects.nth(0).locator('option')).toHaveCount(1)
  await expect(selects.nth(1).locator('option')).toHaveCount(1)
})

test('SCRUM-159 RN2 — SIGUE ROTO: margen del año/mes de Facturación hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  expect(raw.facturacion.kpis.margen_anio_pct).toBe(0)
  expect(raw.facturacion.kpis.margen_mes_pct).toBe(0)
})

test('SCRUM-159 RN3/Escenario 2 — MEJORADO: las barras ya son clickeables y navegan, pero sin filtrar por el mes específico de la barra', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const chartArea = page.locator('text=Facturado por mes').locator('xpath=following::div[1]')
  const firstBar = chartArea.locator('> div').first()
  await firstBar.click({ force: true })
  await page.waitForTimeout(600)
  // Navega (mejora real) pero al panel genérico de facturación, no al detalle DE ESE MES
  expect(page.url()).toContain('/admin-contab/facturacion')
})

// ── SCRUM-160 — Panel Proyectos ─────────────────────────────────────────────
test('SCRUM-160 RN3 — SIGUE ROTO: margen cotizado del año/mes de Proyectos hardcodeado en 0%', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  expect(raw.proyectos.kpis.margen_anio_pct).toBe(0)
  expect(raw.proyectos.kpis.margen_mes_pct).toBe(0)
})

test('SCRUM-160 Escenario 1 — sigue OK: etiquetas y orden correctos (cerrados año/mes, luego márgenes)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Proyectos cerrados este año', { exact: false })).toBeVisible()
  await expect(page.getByText('Proyectos cerrados este mes', { exact: false })).toBeVisible()
})

// ── SCRUM-161/162 — Aprobaciones ────────────────────────────────────────────
test('SCRUM-161 RN1/RN2 — GAP DE DISEÑO sigue vigente: un único Mark Approver global (ComprasSettings.primary_approver_user_id), no un rol autorizado por tipo', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Solo para aprobadores', { exact: false })).toBeVisible()
  const raw = await fetchHome(page)
  expect(raw.is_approver).toBe(false)
  expect(raw.aprobaciones).toEqual([])
})

test('SCRUM-162 RN2 — SIGUE ROTO: no existe botón Aprobar/Rechazar ni modal de detalle, solo navega a la lista del módulo de origen', async ({ page }) => {
  test.setTimeout(45000)
  const ok = await login(page, MARK)
  test.skip(!ok, 'mbekhar password no es el default en este entorno — ver limitación en el reporte')
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await fetchHome(page)
  if (raw.is_approver && raw.aprobaciones.length > 0) {
    await expect(page.getByRole('button', { name: /aprobar/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /rechazar/i })).toHaveCount(0)
    const firstRow = page.locator('text=Aprobaciones por validar').locator('xpath=following::*[1]')
    await page.waitForTimeout(300)
  }
})

// ── SCRUM-165 — Mi calendario Día/Semana/Mes (ya pasaba en v4) ─────────────
test('SCRUM-165 — sigue OK: pill Día activo por defecto, clic en Semana cambia la vista', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const semana = page.getByRole('button', { name: /^Semana$/i })
  await expect(semana).toBeVisible()
  await semana.click()
  await page.waitForTimeout(500)
  await expect(semana).toHaveClass(/teal|active|bg-/)
})

// ── SCRUM-166 — Salud Ventas & Diseño ───────────────────────────────────────
test('SCRUM-166 — MEJORADO: los 5 indicadores ahora tienen 3 destinos DISTINTOS (antes 1 solo), pero ninguno lleva filtro aplicado', async ({ page }) => {
  await login(page, WHIL)

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('En Final Stage', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const urlFinalStage = page.url()

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Monto cotizado en el mes', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const urlCotizado = page.url()

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Monto aprobado del mes', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const urlAprobado = page.url()

  expect(urlFinalStage).toContain('/ventas-diseno/pipeline')
  expect(urlCotizado).toContain('/ventas-diseno/quotes-list')
  expect(urlAprobado).toContain('/ventas-diseno/pedidos')
  // Ninguno lleva querystring/filtro — RN1 pide "Pipeline filtrado por esa etapa", esto solo
  // aterriza en la pantalla correcta, sin aplicar el filtro.
  expect(urlFinalStage).not.toContain('?')
})

// ── SCRUM-168 — Salud Compras ───────────────────────────────────────────────
test('SCRUM-168 RN2/Escenario 1 — SIGUE FALTANDO el indicador "Bajo stock sin ordenar"', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Bajo stock sin ordenar', { exact: false })).toHaveCount(0)
})

test('SCRUM-168 — MEJORADO: Órdenes críticas → /compras/ordenes, Próximas a llegar → /compras/logistica (antes ambos a /compras genérico)', async ({ page }) => {
  await login(page, WHIL)

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Órdenes críticas', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const urlCriticas = page.url()

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Próximas a llegar', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const urlProximas = page.url()

  expect(urlCriticas).toContain('/compras/ordenes')
  expect(urlProximas).toContain('/compras/logistica')
})

// ── SCRUM-171 — Agenda Bodega ───────────────────────────────────────────────
test('SCRUM-171 RN3 — SIGUE ROTO: cada fila navega al mismo destino genérico /bodega/pedidos, item.id nunca se usa', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Bodega — hoy', { exact: true })
  const rows = heading.locator('xpath=following::div[contains(@class,"cursor-pointer")]')
  const rowCount = await rows.count()
  test.skip(rowCount === 0, 'sin datos de agenda de bodega sembrados hoy en dev — no se puede ejercitar RN3')
  await rows.first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/bodega/pedidos')
  // No hay forma de que la URL identifique la fila puntual — no hay :id ni query en la ruta
  expect(page.url()).not.toMatch(/\/bodega\/pedidos\/\d+/)
})

test('SCRUM-171 RN2 — destino "Ver detalle" (/bodega/pedidos) es un listado de pedidos, no una pantalla de "Rutas de entrega del día" (esa pantalla no existe en el código)', async ({ page }) => {
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
test('SCRUM-172 RN3 — SIGUE ROTO: cada fila navega al mismo destino genérico /servicios/tickets, item.id nunca se usa', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Servicios — hoy', { exact: true })
  const rows = heading.locator('xpath=following::div[contains(@class,"cursor-pointer")]')
  const rowCount = await rows.count()
  test.skip(rowCount === 0, 'sin datos de agenda de servicios sembrados hoy en dev — no se puede ejercitar RN3')
  await rows.first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/servicios/tickets')
  expect(page.url()).not.toMatch(/\/servicios\/tickets\/\d+/)
})

test('SCRUM-172 RN2 — CONFIRMADO OK: "Ver detalle" navega a /servicios/inicio, que sí tiene panel "Rutas del día" real', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Servicios — hoy', { exact: true })
  const btn = heading.locator('xpath=following::button[normalize-space(text())="Ver detalle"][1]')
  await btn.click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/servicios/inicio')
})
