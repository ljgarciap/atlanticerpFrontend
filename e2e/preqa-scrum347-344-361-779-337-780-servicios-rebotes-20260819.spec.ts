import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — 5 rebotes de QA (marly.rangel) del 2026-08-19 sobre la
 * épica de Servicios (SCRUM-330), ya desplegados a dev.atlanticerp.ai por script manual
 * (`infra/deploy-manual.sh dev`, GitHub Actions caído por facturación de la org). Senior Review
 * propio del Arquitecto ya corrió (suite completa PHPUnit/PHPStan/vitest/tsc en verde antes de
 * cada commit). Esta es la verificación adversarial independiente antes de devolver a QA.
 *
 * Commits: atlanticerp-backend 7733ac9 (SCRUM-347), 38ebd5f (SCRUM-361/779), 8e162f8 (SCRUM-337),
 * 0574d5c (SCRUM-780) — atlanticerp-frontend 7171c72 (SCRUM-779), 6dd47f3 (SCRUM-780).
 *
 * Corre contra dev.atlanticerp.ai real (playwright.dev-remote.config.ts). Cuentas reales
 * (password = email): liderservicios@test.com (Aaron, lider_servicios),
 * tecnicoservicios@test.com (Tecnico Servicios Test, tecnico_servicios), lidercompras@test.com
 * (Yirena, lider_compras), gerencia5@test.com (Whileyner, management — mbekhar/daniela/
 * luis.garcia NO loguean con password=email en este entorno, ver hallazgo de proceso en el reporte).
 *
 * HALLAZGO CRÍTICO real de este pase (SCRUM-337, ver tests 8/9 abajo): el fix de backend
 * (8e162f8) dejó de mandar la key `rate_history` para actores sin `puede_ver_costos`, pero
 * ExternalTechnicianDetailModal.tsx (línea ~173) sigue leyendo `technician.rate_history.length`
 * sin optional chaining — la ficha de técnico externo CRASHEA (pantalla en blanco) para
 * tecnico_servicios/cualquier rol sin costos. Además, el endpoint de LISTADO
 * (`ExternalTechnicianController::summary()`, usado por GET /servicios/external-technicians)
 * nunca fue tocado por el fix — sigue exponiendo `tarifa_dia` a cualquier rol basado solo en
 * `tarifa_visible`, ignorando `puede_ver_costos` — la columna TARIFA de la tabla "Técnicos
 * externos" le muestra $25.00 a Carlos.
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum347-344-361-779-337-780-20260819'

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

// ---------- SCRUM-347 (REQ-277) — Sincronización con Bodega, gate CRÍTICO de la empresa entera ----------

test('1. Yirena (lider_compras) — Ingresos > + Nuevo ingreso carga la lista de órdenes elegibles sin 500', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'lidercompras@test.com')
  await page.goto(`${BASE}/compras/ingresos/nuevo`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/01-scrum347-ingresos-nuevo.png`, fullPage: true })

  expect(errors.join('\n')).not.toContain('500')
  // La pantalla debe mostrar contenido real (selector de orden), no una pantalla de error genérica.
  await expect(page.getByText(/error|algo salió mal/i)).toHaveCount(0)
})

test('2. Ruptura directa — GET /compras/goods-receipts/eligible-orders responde 200, no 500', async ({ request }) => {
  const token = await apiToken(request, 'lidercompras@test.com')
  const res = await request.get(`${BASE}/api/compras/goods-receipts/eligible-orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log('[SCRUM-347] eligible-orders status:', res.status())
  expect(res.status()).toBe(200)
})

// ---------- SCRUM-344 (REQ-274) — ciclo completo Servicios -> Compras -> Recibido, bloqueado en cascada por 347 ----------

test('3. Aaron — Insumos: producto "PreQA204 producto" en estado "Solicitud pendiente" antes del ciclo', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Insumos', exact: true }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/02-scrum344-insumos-antes.png`, fullPage: true })

  const row = page.locator('tbody tr').filter({ hasText: 'PreQA204 producto' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Solicitud pendiente', { exact: false })).toBeVisible()
})

test('4. Yirena — avanza la orden real de Servicios (id 97, en_transito_local) hasta Recibido vía Ingreso de Mercancía real', async ({ page, request }) => {
  const token = await apiToken(request, 'lidercompras@test.com')

  const orderRes = await request.get(`${BASE}/api/compras/orders/97`, { headers: { Authorization: `Bearer ${token}` } })
  const order = await orderRes.json()
  expect(order.origin_module).toBe('servicios')
  console.log('[SCRUM-344] orden 97 antes:', order.status, order.lines[0].catalog_product_id, order.lines[0].quantity)

  await login(page, 'lidercompras@test.com')
  await page.goto(`${BASE}/compras/ordenes/97`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/03-scrum344-orden97-en-transito-local.png`, fullPage: true })

  if (order.status === 'en_transito_local') {
    const bodegasRes = await request.get(`${BASE}/api/bodega/warehouses`, { headers: { Authorization: `Bearer ${token}` } })
    const bodegasJson = await bodegasRes.json()
    const warehouses = bodegasJson.data ?? bodegasJson
    const bodegaCentral = warehouses.find((w: { name: string }) => w.name === 'Bodega Central')

    const line = order.lines[0]
    const receiptRes = await request.post(`${BASE}/api/compras/goods-receipts`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        purchase_order_id: 97,
        lines: [{ catalog_product_id: line.catalog_product_id, quantity: line.quantity, unit_cost: line.unit_cost, warehouse_id: bodegaCentral.id }],
      },
    })
    console.log('[SCRUM-344] goods-receipt status:', receiptRes.status())
    expect([200, 201]).toContain(receiptRes.status())

    await page.reload()
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: /Avanzar a:/i }).click()
    await page.waitForTimeout(1500)
  }

  await page.screenshot({ path: `${DL_DIR}/04-scrum344-orden97-recibida.png`, fullPage: true })
  const finalRes = await request.get(`${BASE}/api/compras/orders/97`, { headers: { Authorization: `Bearer ${token}` } })
  const finalOrder = await finalRes.json()
  console.log('[SCRUM-344] orden 97 estado final:', finalOrder.status)
  expect(finalOrder.status).toBe('recibido')
})

test('5. Aaron — tras "Recibido" el disponible del insumo sube y el botón vuelve a "Solicitar" (cascada real cerrada)', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Insumos', exact: true }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DL_DIR}/05-scrum344-insumos-despues.png`, fullPage: true })

  const row = page.locator('tbody tr').filter({ hasText: 'PreQA204 producto' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Solicitud pendiente', { exact: false })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Solicitar', exact: true })).toBeVisible()
})

// ---------- SCRUM-361/779 (REQ-291/275) — nombre de insumo vacío ----------

test('6. Aaron — tabla de Insumos muestra el nombre real del producto, no vacío', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Insumos', exact: true }).click()
  await page.waitForTimeout(800)

  const row = page.locator('tbody tr').filter({ hasText: 'PreQA204 producto' })
  await expect(row).toBeVisible()
  await expect(row.getByText('PreQA204 producto', { exact: false })).toBeVisible()
})

test('7. Aaron — Informe de Inspección (ticket GAR-2026-0001, id 5): datalist "Material" trae nombres reales de insumos, no vacíos', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets?ticket=5`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/06-scrum361-ticket-detail.png`, fullPage: true })

  const detailModal = page.locator('div.fixed.inset-0.z-50')
  await detailModal.getByRole('button', { name: 'Generar informe', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/07-scrum361-informe-modal.png`, fullPage: true })

  const datalist = page.locator('#inspection-report-insumos-datalist')
  await expect(datalist).toBeAttached()
  const optionValues = await datalist.locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value))
  console.log('[SCRUM-361] opciones del datalist de Material:', JSON.stringify(optionValues))
  expect(optionValues.length).toBeGreaterThan(0)
  expect(optionValues.every(v => v.trim() !== '')).toBe(true)
})

// ---------- SCRUM-337 (REQ-267) — proyectos/tickets asignados de técnico externo (gate de costos) ----------

test('8. Aaron (puede_ver_costos) — ficha de técnico externo id 2: ve tarifa, margen e historial completo, sin crash', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await row.locator('button, svg').last().click({ force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/08-scrum337-aaron-ficha.png`, fullPage: true })

  expect(errors, `Errores de página al abrir la ficha como Aaron: ${errors.join(' | ')}`).toEqual([])
  await expect(page.getByText('$25.00').first()).toBeVisible()
})

test('9. HALLAZGO CRÍTICO — Carlos (tecnico_servicios, sin puede_ver_costos): abrir la ficha del mismo técnico CRASHEA (pantalla en blanco)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await login(page, 'tecnicoservicios@test.com')

  // 9a. La tabla de LISTADO ya leakea tarifa_dia (ExternalTechnicianController::summary() nunca
  // se tocó en el fix de SCRUM-337, sigue exponiendo tarifa_dia basado solo en tarifa_visible,
  // ignorando puede_ver_costos).
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/09-scrum337-carlos-listado-leak-tarifa.png`, fullPage: true })
  const listLeak = await page.locator('tbody tr', { hasText: 'QA Luis Vargas' }).getByText('$25.00').count()
  console.log('[SCRUM-337 CRÍTICO 1/2] "$25.00" visible para Carlos en la tabla de listado:', listLeak > 0)

  // 9b. Abrir la ficha detalle crashea la app entera (pantalla en blanco) — regresión introducida
  // por el propio fix del backend (8e162f8), que dejó de mandar la key `rate_history` para este
  // rol pero ExternalTechnicianDetailModal.tsx sigue leyendo `.rate_history.length` sin guard.
  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await row.locator('button, svg').last().click({ force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/10-scrum337-carlos-ficha-crash.png`, fullPage: true })

  console.log('[SCRUM-337 CRÍTICO 2/2] errores de página al abrir la ficha como Carlos:', JSON.stringify(errors))
  const bodyText = await page.locator('body').innerText()
  console.log('[SCRUM-337] body text tras el intento de apertura (esperado: vacío = crash):', JSON.stringify(bodyText.slice(0, 200)))

  // Esta aserción documenta el bug — se espera que FALLE (sí hay errores) hasta que se corrija.
  expect(errors, 'La ficha del técnico externo no debe crashear para roles sin puede_ver_costos').toEqual([])
})

// ---------- SCRUM-780 — Reorganización de menú y permisos "Ajustes" ----------

test('10. Aaron — desplegable "Tickets" revela "Listado de Tickets" + "Cotizaciones" al hacer clic', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1200)

  // Sidebar colapsado por defecto en el viewport de test — expandir el panel Y la sección
  // "SERVICIOS" (2 niveles: aside colapsado -> grupo de sección colapsado) para que los labels
  // de texto ("Tickets", "Ajustes", etc.) se rendericen antes de buscarlos.
  const expandBtn = page.locator('[title="Expandir menú"]')
  if (await expandBtn.count() > 0) {
    await expandBtn.click()
    await page.waitForTimeout(400)
  }
  const serviciosSection = page.locator('aside').getByRole('button', { name: /servicios/i })
  if (await serviciosSection.count() > 0 && await page.getByText('Tickets', { exact: true }).count() === 0) {
    await serviciosSection.first().click()
    await page.waitForTimeout(400)
  }

  await expect(page.getByText('Listado de Tickets')).toHaveCount(0)
  await expect(page.getByText('Cotizaciones')).toHaveCount(0)
  await page.screenshot({ path: `${DL_DIR}/11-scrum780-tickets-cerrado.png`, fullPage: true })

  await page.getByText('Tickets', { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DL_DIR}/12-scrum780-tickets-abierto.png`, fullPage: true })

  await expect(page.getByText('Listado de Tickets').first()).toBeVisible()
  await expect(page.getByText('Cotizaciones').first()).toBeVisible()
})

test('11. Aaron (lider_servicios) — "Ajustes" NO aparece en el sidebar Y navegar por URL directa a /servicios/ajustes lo redirige', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1000)
  const expandBtn11 = page.locator('[title="Expandir menú"]')
  if (await expandBtn11.count() > 0) {
    await expandBtn11.click()
    await page.waitForTimeout(400)
  }
  const serviciosSection11 = page.locator('aside').getByRole('button', { name: /servicios/i })
  if (await serviciosSection11.count() > 0 && await page.getByText('Insumos', { exact: false }).count() === 0) {
    await serviciosSection11.first().click()
    await page.waitForTimeout(400)
  }
  await expect(page.getByText('Ajustes', { exact: true })).toHaveCount(0)

  await page.goto(`${BASE}/servicios/ajustes`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/13-scrum780-aaron-ajustes-bloqueado.png`, fullPage: true })
  console.log('[SCRUM-780] Aaron navega a /servicios/ajustes, URL final:', page.url())
  expect(page.url()).not.toContain('/servicios/ajustes')
})

test('12. Ruptura directa — GET /servicios/settings con token de Aaron (lider_servicios) da 403', async ({ request }) => {
  const token = await apiToken(request, 'liderservicios@test.com')
  const res = await request.get(`${BASE}/api/servicios/settings`, { headers: { Authorization: `Bearer ${token}` } })
  console.log('[SCRUM-780] GET /servicios/settings como lider_servicios → status:', res.status())
  expect(res.status()).toBe(403)
})

test('13. Whileyner (management) — ve "Ajustes" en el sidebar y accede normalmente a /servicios/ajustes', async ({ page }) => {
  await login(page, 'gerencia5@test.com')
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1000)
  const expandBtn13 = page.locator('[title="Expandir menú"]')
  if (await expandBtn13.count() > 0) {
    await expandBtn13.click()
    await page.waitForTimeout(400)
  }
  const serviciosSection13 = page.locator('aside').getByRole('button', { name: /servicios/i })
  if (await serviciosSection13.count() > 0 && await page.getByText('Ajustes', { exact: true }).count() === 0) {
    await serviciosSection13.first().click()
    await page.waitForTimeout(400)
  }
  await expect(page.getByText('Ajustes', { exact: true }).first()).toBeVisible()

  await page.goto(`${BASE}/servicios/ajustes`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14-scrum780-management-ajustes-ok.png`, fullPage: true })
  expect(page.url()).toContain('/servicios/ajustes')
  await expect(page.getByText(/sin agendar|adjuntos|configuraci/i).first()).toBeVisible()
})
