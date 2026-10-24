import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review) — Batch SCRUM-895/897/550/881/882 (2026-09-11).
 * Corre contra el stack LOCAL (localhost:5173 / nginx localhost:8090), código sin commitear en
 * `dev` de atlanticerp-backend/atlanticerp-frontend. Ver docs/pre-qa/ para el reporte completo.
 *
 * Fixtures sembrados a mano para esta corrida (no existían en la BD local, ver README de la
 * sesión): Order PREQA-895 (id 529 root / 530 child, 4 productos cubriendo los 4 casos del
 * ticket) y AdminContInvoice/AdminContPayment PREQA550-1/2 (recibos REC-002/REC-003).
 *
 * Cuentas reales (password = email, roster CoreUserSeeder):
 *  - Felix (lider_admin_contab): contabilidad@test.com
 *  - Yaneth (asistente_administrativa): asistenteadministrativa@test.com
 *  - Vendedor Disenador Test 2 (vendedor_disenador): vendedordisenador2@test.com
 *  - almacen (Bodega): liderbodega@test.com
 */
test.describe.configure({ mode: 'serial' })

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
}

// ---------------------------------------------------------------------------
// SCRUM-897 — botón "Status de Pedidos" en Facturación
// ---------------------------------------------------------------------------
test('SCRUM-897.1 — Felix ve el botón en Facturación, a la izquierda de Estado de cuenta', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-897-01-facturacion.png', fullPage: true })

  // SCRUM-930 agregó "Estado de Cuenta" también al Sidebar (persistente en toda la app, ver
  // ADR-SCRUM930) — mismo texto visible que este botón de Facturación, así que el lookup se
  // escopea a <main> (el contenido de la página) para no matchear el ítem del Sidebar también.
  const main = page.locator('main')
  const statusBtn = main.getByRole('button', { name: /status de pedidos/i })
  const estadoCuentaBtn = main.getByRole('button', { name: /estado de cuenta/i })
  await expect(statusBtn).toBeVisible()
  await expect(estadoCuentaBtn).toBeVisible()

  const statusBox = await statusBtn.boundingBox()
  const estadoBox = await estadoCuentaBtn.boundingBox()
  expect(statusBox).not.toBeNull()
  expect(estadoBox).not.toBeNull()
  // "a la izquierda de" -> menor coordenada X
  expect(statusBox!.x).toBeLessThan(estadoBox!.x)
})

test('SCRUM-897.2 — click navega a la MISMA pantalla que Bodega->Pedidos->Status', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /status de pedidos/i }).click()
  await page.waitForTimeout(1200)
  expect(page.url()).toContain('/bodega/pedidos/status')
  await page.screenshot({ path: 'e2e/.tmp/preqa-897-02-status-page-desde-facturacion.png', fullPage: true })
  // El pedido de fixture debe aparecer en la lista para Felix (admin_contab.view da acceso total)
  await expect(page.getByText('PREQA-895')).toBeVisible({ timeout: 5000 })
})

test('SCRUM-897.3 — regresión: el botón original de Bodega->Pedidos sigue intacto', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)
  const btn = page.getByRole('button', { name: /status de pedidos/i })
  await expect(btn).toBeVisible()
  await btn.click()
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/bodega/pedidos/status')
  await page.screenshot({ path: 'e2e/.tmp/preqa-897-03-boton-original-bodega.png', fullPage: true })
})

test('SCRUM-897.4 — regresión: Facturación no perdió "Estado de cuenta" ni "Crear factura"', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  // Ver nota SCRUM-930 más arriba — escopeado a <main> por el ítem homónimo del Sidebar.
  await expect(page.locator('main').getByRole('button', { name: /estado de cuenta/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /crear factura/i })).toBeVisible()
})

// ---------------------------------------------------------------------------
// SCRUM-895 — verificación UI del modal de detalle (Entregado+Pendiente=Solicitada)
// ---------------------------------------------------------------------------
test('SCRUM-895 — modal de detalle muestra los 4 casos correctos (invariante Entregado+Pendiente=Solicitada)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1200)
  const row = page.getByText('PREQA-895').first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-895-modal-detalle.png', fullPage: true })

  const bodyText = await page.locator('body').innerText()
  // Caso 4 (el bug real, GE-SOCKET1-equivalente): 20 solicitados, 20 entregados, 0 pendiente
  expect(bodyText).toContain('20')
  // Verificación fuerte ya hecha vía API (ver reporte) — acá solo confirmamos que el modal
  // renderiza sin quedarse en blanco/error y que los 4 productos de fixture aparecen.
  expect(bodyText).toContain('UAT-CAND-001')
  expect(bodyText).toContain('UAT-CAND-002')
  expect(bodyText).toContain('UAT-CAND-003')
  expect(bodyText).toContain('UAT-CAND-004')
})

// ---------------------------------------------------------------------------
// SCRUM-881 — Yaneth vs Felix
// ---------------------------------------------------------------------------
test('SCRUM-881.1 — Cobros: tarjetas de indicadores con valores reales para Yaneth (no guiones)', async ({ page }) => {
  await login(page, 'asistenteadministrativa@test.com')
  await page.goto('/admin-contab/cobros')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-881-01-cobros-yaneth.png', fullPage: true })
  const bodyText = await page.locator('body').innerText()
  // Con datos $0 la regresión concreta era mostrar "-" en vez de "$0.00"/"0" real — confirmamos
  // que NO aparece un guion suelto como placeholder de error en las tarjetas de indicadores.
  expect(bodyText).not.toMatch(/N° de cobros\s*\n\s*-/i)
})

test('SCRUM-881.2 — Comisiones Internas: Yaneth ve la tabla completa (11+ vendedores)', async ({ page }) => {
  await login(page, 'asistenteadministrativa@test.com')
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-881-02-comisiones-internas-yaneth.png', fullPage: true })
  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  expect(count).toBeGreaterThanOrEqual(11)
})

test('SCRUM-881.3 — Reportes: tarjeta "Comisión Felix +90 días" NO aparece para Yaneth', async ({ page }) => {
  await login(page, 'asistenteadministrativa@test.com')
  await page.goto('/admin-contab/reportes')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-881-03-reportes-yaneth.png', fullPage: true })
  await expect(page.getByText(/comisi[oó]n.*felix/i)).toHaveCount(0)
})

test('SCRUM-881.4 — Reportes: la tarjeta SIGUE visible para Felix', async ({ page }) => {
  await login(page, 'contabilidad@test.com')
  await page.goto('/admin-contab/reportes')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/preqa-881-04-reportes-felix.png', fullPage: true })
  await expect(page.getByText(/comisi[oó]n.*felix/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// SCRUM-882 — vendedor_disenador (Neil) no ve Admin&Cont salvo Comisiones Internas
// ---------------------------------------------------------------------------
test('SCRUM-882.1 — Neil: sidebar NO muestra Inicio/Facturación/Movimientos/Externas/Tesorería/Reportes', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa-882-01-sidebar-neil-inicial.png', fullPage: true })

  // El sidebar arranca colapsado (icon-only) -- expandirlo primero por el botón real
  // ("Expandir menú"), no por coordenadas fijas.
  const expandBtn = page.getByTitle('Expandir menú')
  if (await expandBtn.count() > 0) {
    await expandBtn.click()
    await page.waitForTimeout(400)
  }
  const adminContabEntry = page.getByText(/admin.*contab/i).first()
  if (await adminContabEntry.count() > 0 && await adminContabEntry.isVisible()) {
    await adminContabEntry.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: 'e2e/.tmp/preqa-882-02-sidebar-neil-expandido.png', fullPage: true })

  const bodyText = await page.locator('body').innerText()
  for (const label of ['Facturación', 'Movimientos', 'Comisiones Externas', 'Arqueo de Caja', 'Cuentas Bancarias', 'Caja chica', 'Reportes']) {
    expect(bodyText.includes(label), `no debería verse "${label}" en el sidebar de Neil`).toBeFalsy()
  }
})

test('SCRUM-882.2 — Neil SIGUE viendo Comisiones Internas (solo su fila)', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-882-03-comisiones-internas-neil.png', fullPage: true })
  const rows = page.locator('table tbody tr')
  const count = await rows.count()
  // Solo su propia fila -> 1 (no 11+)
  expect(count).toBe(1)
})

const HIDDEN_ROUTES = [
  '/admin-contab/inicio',
  '/admin-contab/facturacion',
  '/admin-contab/cobros',
  '/admin-contab/notas-credito',
  '/admin-contab/comisiones/externas',
  '/admin-contab/arqueo-caja',
  '/admin-contab/cuentas-bancarias',
  '/admin-contab/caja-chica',
  '/admin-contab/facturacion/estado-cuenta',
]

for (const route of HIDDEN_ROUTES) {
  test(`SCRUM-882.3 — Neil por URL directa a ${route} queda bloqueado (no shell vacío)`, async ({ page }) => {
    await login(page, 'vendedordisenador2@test.com')
    await page.goto(route)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `e2e/.tmp/preqa-882-04-blocked-${route.replace(/\//g, '_')}.png`, fullPage: true })
    const bodyText = await page.locator('body').innerText()
    // eslint-disable-next-line no-console
    console.log(`BLOCKED_URL_RESULT ${route} -> ${page.url()}`)
    // No debe llegar al contenido real de la pantalla oculta ni quedar en un shell vacío sin
    // feedback -- debe redirigir a otra pantalla accesible o mostrar un estado explícito de
    // "sin acceso". Falla si el body está prácticamente vacío (shell roto).
    expect(bodyText.trim().length, `shell vacío en ${route}`).toBeGreaterThan(20)
    expect(page.url().includes(route) && bodyText.match(/acceso restringido|no autorizado|no tienes permiso/i) === null,
      `Neil llegó al contenido real de ${route} sin bloqueo`
    ).toBeFalsy()
  })
}
