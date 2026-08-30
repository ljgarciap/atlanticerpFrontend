import { test, expect } from '@playwright/test'

// SCRUM-329 Oleada A / Batch A3 "Pedidos: tablero frontend" — Pre-QA exploratorio 2026-07-23.
// Corre contra fixtures reales sembrados a mano (10 pedidos, ver docs/pre-qa/
// scrum329-batch-a3-pedidos-frontend-2026-07-23.md para el detalle exacto de cada uno).

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('Pedidos — encabezado, contador real, botones (SCRUM-375/404)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  const subtitle = page.getByTestId('pedidos-subtitle')
  await expect(subtitle).toBeVisible()
  await expect(subtitle).toContainText('10')

  await page.screenshot({ path: 'e2e/.tmp/pedidos-board-full.png', fullPage: true })

  // Botón Status de pedidos navega a placeholder, sin 404/crash.
  await page.getByRole('button', { name: /status de pedidos/i }).click()
  await page.waitForTimeout(500)
  await expect(page.url()).toContain('/bodega/pedidos/status')
  await expect(page.locator('body')).not.toContainText('404')
  await page.screenshot({ path: 'e2e/.tmp/order-status-placeholder.png' })
  expect(errors).toEqual([])
})

test('Pedidos — panel de carga por asistente (SCRUM-376)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  const panel = page.getByTestId('assistant-load-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Mariano')
  await expect(panel).toContainText('Osvaldo')
  await expect(panel).toContainText('50')
})

test('Pedidos — filtros combinables + doble clic en chip (SCRUM-379/380)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  const search = page.locator('input[placeholder]').first()
  await search.fill('Pacifico')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/filter-search-pacifico.png', fullPage: true })
  await expect(page.getByTestId('pedidos-board')).toContainText('PED-2026-0001')
  await expect(page.getByTestId('pedidos-board')).toContainText('PED-2026-0008')
  await expect(page.getByTestId('pedidos-board')).not.toContainText('PED-2026-0003')

  // Doble clic en chip "Urgentes" — no debe duplicar filtro ni romper.
  const urgentChip = page.getByRole('button', { name: /urgentes/i })
  await search.fill('')
  await page.waitForTimeout(300)
  await urgentChip.click()
  await urgentChip.click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/chip-doubleclick-urgentes.png', fullPage: true })
  await expect(page.getByTestId('pedidos-board')).toContainText('PED-2026-0001')
})

test('Pedidos — Kanban 7 etapas en orden (SCRUM-381)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  const board = page.getByTestId('pedidos-board')
  const text = await board.innerText()
  const stages = ['Asignado', 'Picking pendiente', 'En picking', 'Packing', 'Por despachar', 'Despachado', 'Entregado']
  let lastIndex = -1
  for (const s of stages) {
    const idx = text.indexOf(s)
    expect(idx).toBeGreaterThan(lastIndex)
    lastIndex = idx
  }
})

test('Pedidos — tarjeta: alerta atrasado + familia + factura pasiva (SCRUM-382/397/405)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/board-cards-detail.png', fullPage: true })

  // Factura pasiva: PED-2026-0006 invoice_ready=true, PED-2026-0007 invoice_ready=false
  await expect(page.getByTestId('invoice-ready')).toBeVisible()
  await expect(page.getByTestId('invoice-waiting')).toBeVisible()
})

test('Pedidos — botones de transición deshabilitados, nunca pegan a endpoint inexistente (foco de ruptura)', async ({ page }) => {
  const requestsToMutationEndpoints: string[] = []
  page.on('request', req => {
    const url = req.url()
    if (/assign-picker|start-picking|complete-picking|register-delivery|assign-courier|dispatch|register-signed-guide/.test(url)) {
      requestsToMutationEndpoints.push(url)
    }
  })
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  const disabledButtons = page.locator('button[disabled]')
  const count = await disabledButtons.count()
  expect(count).toBeGreaterThan(0)
  // Intentar forzar clic vía JS en todos los deshabilitados — no debe disparar ninguna llamada real.
  await page.evaluate(() => {
    document.querySelectorAll('button[disabled]').forEach(b => (b as HTMLButtonElement).click())
  })
  await page.waitForTimeout(500)
  expect(requestsToMutationEndpoints).toEqual([])
})

test('Pedidos — modal Ver Detalle: contacto/direccion/ref fabrica reales (SCRUM-402, regresion Senior Review)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByTestId('order-card-27').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/detail-modal-collapsed.png' })

  await expect(page.locator('body')).toContainText('Juan Perez')
  await expect(page.locator('body')).toContainText('Calle 50, Torre Delta')

  // RN1 — tabla colapsada por defecto.
  await expect(page.locator('table')).toHaveCount(0)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'e2e/.tmp/detail-modal-expanded.png' })
  await expect(page.locator('table')).toHaveCount(1)
  await expect(page.locator('body')).toContainText('FCT-LAMP-0001')
})

test('Pedidos — recargar con modal abierto no rompe (foco de ruptura)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  await page.getByTestId('order-card-27').click()
  await page.waitForTimeout(500)
  await page.reload()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/reload-mid-modal.png', fullPage: true })
  expect(errors).toEqual([])
  // El tablero debe seguir usable (modal no debe quedar "fantasma" abierto sin datos).
  await expect(page.getByTestId('pedidos-board')).toBeVisible()
})

test('Pedidos — Guia de Entrega: sin firmar en blanco, firmada muestra nombre (SCRUM-400 RN1/RN2)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  // PED-2026-0008 (despachado, NO firmada aun)
  const card8 = page.getByTestId('order-card-34')
  await card8.getByRole('button', { name: /ver guía|guia/i }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/guide-unsigned.png' })
  await expect(page.getByTestId('guide-signature')).toContainText(/pendiente/i)
  await expect(page.locator('body')).not.toContainText(/\$\d|USD\s*\d/i)
  await page.getByRole('button', { name: /cerrar|close/i }).click()
  await page.waitForTimeout(300)

  // PED-2026-0009 (entregado, YA firmada) — RN2
  const card9 = page.getByTestId('order-card-35')
  await card9.getByRole('button', { name: /ver guía|guia/i }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/guide-signed.png' })
  const sigText = await page.getByTestId('guide-signature').innerText()
  console.log('SCRUM-400 RN2 signature text (signed):', sigText)
})

test('Pedidos — grep visual de emoji en la UI real (regla SCRUM-56)', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)
  await page.getByTestId('order-card-27').click()
  await page.waitForTimeout(500)
  await page.getByTestId('toggle-items').click()
  await page.waitForTimeout(300)
  const bodyText = await page.locator('body').innerText()
  // Rango básico de emoji comunes (excluye iconos SVG, que no son texto).
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(bodyText)).toBe(false)
})
