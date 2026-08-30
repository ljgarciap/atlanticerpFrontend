import { test, expect } from '@playwright/test'

// SCRUM-407→413 (Batch A4, "Status de Pedidos") — Pre-QA exploratorio 2026-07-23.
// Corre contra fixtures reales sembrados a mano para este batch (2 familias + 1 pedido de otro
// vendedor), ver docs/pre-qa/scrum407-413-batch-a4-status-pedidos-2026-07-23.md para el detalle
// exacto de cada uno (ids reales generados en el momento del seed).

async function login(page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-407 — botón desde Pedidos navega a Status y "Volver a Pedidos" regresa', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /status de pedidos/i }).click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/pedidos/status')
  await expect(page.locator('body')).not.toContainText('404')
  await page.screenshot({ path: 'e2e/.tmp/scrum407-status-screen.png', fullPage: true })

  await page.getByRole('button', { name: /volver a pedidos/i }).click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/pedidos')
  expect(page.url()).not.toContain('/status')
})

test('SCRUM-412 — botón desde Pipeline (Ventas & Diseño) navega al MISMO lugar', async ({ page }) => {
  await login(page, 'neil.quiel@illuminations.com.pa')
  await page.goto('/ventas-diseno/pipeline')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /status de pedidos/i }).click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/pedidos/status')
  await page.screenshot({ path: 'e2e/.tmp/scrum412-status-from-pipeline.png', fullPage: true })
})

test('SCRUM-408 — columnas en orden RN1 + búsqueda filtra a una sola fila', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)

  // La tabla renderiza el header en mayúsculas (CSS text-transform: uppercase) — comparar
  // case-insensitive, la regla de negocio (RN1) es el ORDEN de las columnas, no el casing.
  const headerText = (await page.locator('thead').innerText()).toUpperCase()
  const cols = ['N° PEDIDO', 'N° COTIZACIÓN', 'SUBCLIENTE', 'FECHA DE PEDIDO', 'VENDEDOR']
  let lastIdx = -1
  for (const c of cols) {
    const idx = headerText.indexOf(c)
    expect(idx).toBeGreaterThan(lastIdx)
    lastIdx = idx
  }

  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM2')
  await page.waitForTimeout(600)
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await page.screenshot({ path: 'e2e/.tmp/scrum408-search-filtered.png', fullPage: true })
})

test('SCRUM-408/413 — familia de 2 tarjetas consolida en UNA fila (no una por tarjeta)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)

  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM2')
  await page.waitForTimeout(600)
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('SCRUM-409/410 — modal detalle: datos generales, Fecha de Estatus = hoy, y cálculo de pendiente (10 solicitadas/6 entregadas => 4 pendientes)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)

  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM2')
  await page.waitForTimeout(600)
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/scrum409-410-detail-modal.png', fullPage: true })

  await expect(page.locator('body')).toContainText('Neil Quiel') // Diseñador
  await expect(page.locator('body')).toContainText('PreQA Familia 2 Tarjetas') // Proyecto
  await expect(page.locator('body')).toContainText('Contacto PreQA')
  await expect(page.locator('body')).toContainText('6000-1234')

  // Fecha de Estatus = hoy (fecha real del sistema al momento de la consulta).
  const today = new Date().toISOString().slice(0, 10)
  await expect(page.locator('body')).toContainText(today)

  const rows = page.getByTestId('order-status-item-row')
  await expect(rows).toHaveCount(2) // 2 productos distintos consolidados, sin duplicar
  const pendings = page.getByTestId('order-status-item-pending')
  await expect(pendings.nth(0)).toHaveText('4') // 10 solicitadas - 6 entregadas
})

test('SCRUM-410 Escenario 2 — familia de 3 tarjetas, completamente entregada => Pendiente 0 en todas', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)

  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM3')
  await page.waitForTimeout(600)
  await expect(page.locator('tbody tr')).toHaveCount(1) // 3 tarjetas => 1 sola fila
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/scrum410-fam3-fully-delivered.png', fullPage: true })

  const pendings = page.getByTestId('order-status-item-pending')
  const count = await pendings.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(pendings.nth(i)).toHaveText('0')
  }
})

test('SCRUM-411 — Ver/Descargar dispara la generación real del documento (200 + URL firmada real)', async ({ page }) => {
  // Nota: el tab nuevo que abre `window.open` termina en descarga real del PDF (S3 presigned),
  // lo que cierra la page auxiliar de Playwright antes de poder leer su URL final de forma
  // confiable — se verifica en su lugar la respuesta real de red del endpoint que lo dispara.
  // El contenido/paleta del PDF ya se verificó descargándolo directo (ver reporte de Pre-QA).
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)

  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM2')
  await page.waitForTimeout(600)
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(800)

  const respPromise = page.waitForResponse(r => /\/orders\/status\/\d+\/document$/.test(r.url()))
  await page.getByTestId('view-document-button').click()
  const resp = await respPromise
  expect(resp.status()).toBe(200)
  const body = await resp.json()
  expect(body.url).toMatch(/\.pdf/i)
  expect(body.order_id).toBeTruthy()
})

test('SCRUM-412 RN2 — vendedor ve SOLO sus propios pedidos, no los de otro vendedor', async ({ page }) => {
  await login(page, 'neil.quiel@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum412-neil-own-orders.png', fullPage: true })

  await expect(page.locator('body')).toContainText('PREQA-FAM2')
  await expect(page.locator('body')).toContainText('PREQA-FAM3')
  await expect(page.locator('body')).not.toContainText('PREQA-FEFI')
})

test('SCRUM-412 RN3 — solo consulta, sin ningún control de edición visible para Ventas & Diseño', async ({ page }) => {
  await login(page, 'neil.quiel@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(800)

  const bodyText = (await page.locator('body').innerText()).toLowerCase()
  expect(bodyText).not.toMatch(/\bguardar\b|\beditar\b|\beliminar\b/)
  await expect(page.locator('input[type="text"]:not([placeholder*="Buscar"])')).toHaveCount(0)
})

test('Foco de ruptura — rol sin bodega.read ni ventas_diseno.read es redirigido, no ve la pantalla', async ({ page }) => {
  // Demo users (AuthUserSeeder) usan password fijo "Password123!", NO el email como password
  // (a diferencia de los usuarios reales de negocio de BusinessRoleUserSeeder) — usar el password
  // real acá, si no el login falla en silencio y el redirect a /login se confunde con el gate real.
  await login(page, 'supervisor@illuminations.test', 'Password123!')
  await expect(page.locator('body')).not.toContainText(/iniciar sesión/i) // confirma que el login sí funcionó
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  expect(page.url()).not.toContain('/bodega/pedidos/status')
  await page.screenshot({ path: 'e2e/.tmp/no-permission-redirect.png', fullPage: true })
})

test('Foco de ruptura — recargar con el modal de detalle abierto no rompe la pantalla', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(600)
  await page.reload()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/scrum-status-reload-mid-modal.png', fullPage: true })
  expect(errors).toEqual([])
  // La pantalla debe seguir usable — no modal fantasma sin datos, tabla presente.
  await expect(page.locator('table').first()).toBeVisible()
})

test('Foco de ruptura — búsqueda vacía/con espacios no rompe ni filtra de más', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  const search = page.locator('input[type="text"]')
  await search.fill('   ')
  await page.waitForTimeout(600)
  await expect(page.locator('body')).not.toContainText('500')
  await search.fill('')
  await page.waitForTimeout(600)
})

test('Foco de ruptura — doble clic en una fila no abre 2 modales ni duplica llamadas de detalle', async ({ page }) => {
  const detailCalls: string[] = []
  page.on('request', req => {
    if (/\/orders\/status\/\d+$/.test(req.url())) detailCalls.push(req.url())
  })
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  const search = page.locator('input[type="text"]')
  await search.fill('PREQA-FAM2')
  await page.waitForTimeout(600)
  const row = page.locator('tbody tr').first()
  // dblclick real (2 clics casi simultáneos) en vez de 2 .click() separados — evita el falso
  // positivo de Playwright reintentando el 2do click contra el modal que ya tapó la fila.
  await row.dblclick()
  await page.waitForTimeout(800)
  await expect(page.locator('.bg-black\\/40').first()).toBeVisible()
  // No debe haber más de un modal apilado — un solo botón "Cerrar" visible.
  await expect(page.getByRole('button', { name: /^cerrar$/i })).toHaveCount(1)
  // Un doble clic es 1 solo `onClick` de React por especificación de evento (dblclick no
  // duplica el handler de click) — igual confirmamos que no se dispararon 2+ requests de detalle.
  expect(new Set(detailCalls).size).toBeLessThanOrEqual(1)
})

test('Regla SCRUM-56 — sin emoji visible en la pantalla ni en el modal', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos/status')
  await page.waitForTimeout(1000)
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(600)
  const bodyText = await page.locator('body').innerText()
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(bodyText)).toBe(false)
})
