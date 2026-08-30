import { test, expect } from '@playwright/test'

// Pre-QA RECHECK 2026-07-23 — SCRUM-400 (REQ-330 Guía de Entrega), fix de received_by_name +
// "tomar el documento más reciente". Corre contra fixtures reales sembradas a mano vía tinker/curl
// (Order 125 = Escenario 1 sin firmar, Order 126 = Escenario 2 firmada nombres distintos,
// Order 127 = 3 documentos guia_entrega, el de mayor id es un "rogue" SIN firmar).

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openGuideFor(page, orderId: number) {
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)
  const card = page.getByTestId(`order-card-${orderId}`)
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: /guía|guia/i }).click()
  await page.waitForTimeout(800)
}

test('Escenario 1 — guía sin firmar (Order 125) muestra espacio de firma en blanco', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@atlantic.com.pa')
  await openGuideFor(page, 125)

  const sig = page.getByTestId('guide-signature')
  await expect(sig).toBeVisible()
  const text = await sig.innerText()
  console.log('ORDER125_SIGNATURE_TEXT=', JSON.stringify(text))
  await page.screenshot({ path: 'e2e/.tmp/scrum400-recheck-order103-unsigned.png', fullPage: true })

  // RN1 — nunca precios en ningún lado de la guía.
  const bodyText = await page.locator('body').innerText()
  console.log('ORDER125_HAS_DOLLAR_SIGN=', bodyText.includes('$'))

  expect(errors).toEqual([])
})

test('Escenario 2 — guía firmada (Order 126) muestra receptor, no repartidor', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@atlantic.com.pa')
  await openGuideFor(page, 126)

  const sig = page.getByTestId('guide-signature')
  await expect(sig).toBeVisible()
  const text = await sig.innerText()
  console.log('ORDER126_SIGNATURE_TEXT=', JSON.stringify(text))
  await page.screenshot({ path: 'e2e/.tmp/scrum400-recheck-order104-signed.png', fullPage: true })

  const bodyText = await page.locator('body').innerText()
  console.log('ORDER126_HAS_DOLLAR_SIGN=', bodyText.includes('$'))
  console.log('ORDER126_CONTAINS_COURIER_NAME=', bodyText.includes('Gary Arrocha'))
  console.log('ORDER126_CONTAINS_RECEIVER_NAME=', bodyText.includes('Maria Fernandez'))

  expect(errors).toEqual([])
})

test('Adversarial — Order 127 con 3 documentos guia_entrega, el de mayor id SIN firmar', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@atlantic.com.pa')
  await openGuideFor(page, 127)

  const sig = page.getByTestId('guide-signature')
  await expect(sig).toBeVisible()
  const text = await sig.innerText()
  console.log('ORDER127_SIGNATURE_TEXT=', JSON.stringify(text))
  await page.screenshot({ path: 'e2e/.tmp/scrum400-recheck-order105-adversarial.png', fullPage: true })

  const bodyText = await page.locator('body').innerText()
  console.log('ORDER127_CONTAINS_RECEIVER_NAME=', bodyText.includes('Carlos Receptor Real'))

  expect(errors).toEqual([])
})

test('Descarga del PDF — Order 126 (firmada) descarga el documento correcto', async ({ page }) => {
  await login(page, 'almacen@atlantic.com.pa')
  await openGuideFor(page, 126)

  let downloadApiUrl: string | null = null
  page.on('request', req => {
    if (req.url().includes('/documents/') && req.url().includes('/download')) downloadApiUrl = req.url()
  })

  const [popup] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
    page.getByRole('button', { name: /descargar/i }).click(),
  ])
  await page.waitForTimeout(1500)
  console.log('DOWNLOAD_API_URL=', downloadApiUrl)
  console.log('DOWNLOAD_POPUP_URL=', popup ? popup.url() : 'NO_POPUP_OPENED')
})

test('Rol sin permiso bodega.read no puede ver el board de Pedidos', async ({ page }) => {
  // Pre-QA 2026-07-23 (recheck) — corregido tras descubrir que "transporte" (Gary) SÍ tiene
  // bodega.view/bodega.write reales por rol (no es un caso "sin permiso" válido). Un vendedor/
  // diseñador no tiene ningún permiso de Bodega (confirmado vía JWT: modules.bodega todo false),
  // es el rol correcto para este escenario de ruptura.
  let ordersApiStatus: number | null = null
  page.on('response', res => {
    if (res.url().includes('/api/bodega/orders') && !res.url().includes('assistant-load')) ordersApiStatus = res.status()
  })
  await login(page, 'neil.quiel@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/scrum400-recheck-role-sin-permiso.png', fullPage: true })
  const bodyText = await page.locator('body').innerText()
  console.log('NOPERM_ORDERS_API_STATUS=', ordersApiStatus)
  console.log('NOPERM_BODY_SNIPPET=', bodyText.slice(0, 400))
})

test('Recargar a mitad del modal abierto no crashea', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@atlantic.com.pa')
  await openGuideFor(page, 126)
  await page.reload()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/scrum400-recheck-reload-midflow.png', fullPage: true })
  const bodyText = await page.locator('body').innerText()
  console.log('RELOAD_HAS_ERROR_BOUNDARY_TEXT=', /error|algo salió mal/i.test(bodyText))
  expect(errors).toEqual([])
})
