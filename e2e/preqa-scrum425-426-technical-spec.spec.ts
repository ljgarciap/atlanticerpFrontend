import { test, expect } from '@playwright/test'

// Pre-QA exploratorio SCRUM-425/426 (Ficha técnica de producto, Ver Inventario / Crear producto).
// Corre contra el build real servido por nginx (docker-compose local, puerto 8090) -- no el dev
// server de Vite -- para validar el mismo artefacto que test.atlanticerp.ai/prod servirían.
const BASE = 'http://localhost:8090'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openCreateModal(page) {
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /crear nuevo producto/i }).click()
  await page.waitForTimeout(500)
}

const SPEC_FIELDS = [
  'voltage', 'power', 'socket_type', 'color_temperature', 'luminous_flux', 'dimensions',
  'weight', 'material_finish', 'ip_rating', 'estimated_lifespan', 'warranty', 'certifications',
]

test.describe.configure({ mode: 'serial' })

test('1. Camino feliz — crear producto con los 12 campos, ver ficha técnica con esos valores', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await openCreateModal(page)

  const ref = `PREQA-HAPPY-${Date.now()}`
  await page.locator('input[placeholder="Referencia pública"]').fill(ref)
  await page.locator('input[placeholder="Descripción"]').fill('Producto Pre-QA feliz')
  await page.locator('input[placeholder="Precio de venta"]').fill('199.99')
  await page.locator('input[placeholder="Costo"]').fill('99.99')

  // The placeholders are i18n-translated labels, not raw keys -- fill by position instead.
  const specInputs = page.locator('.grid.grid-cols-2.gap-3').last().locator('input')
  const count = await specInputs.count()
  console.log('SPEC INPUT COUNT:', count)
  for (let i = 0; i < count; i++) {
    await specInputs.nth(i).fill(`valor-${i}-${SPEC_FIELDS[i] ?? i}`)
  }

  await page.screenshot({ path: 'e2e/.tmp/preqa425-01-create-filled.png', fullPage: true })

  const saveBtn = page.getByRole('button', { name: 'Guardar' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-02-after-save.png', fullPage: true })

  // Reopen and verify
  await page.locator('input[placeholder="Buscar producto…"]').fill(ref)
  await page.waitForTimeout(200)
  const searchBtn = page.getByRole('button', { name: /buscar/i })
  if (await searchBtn.count() > 0) await searchBtn.click()
  await page.waitForTimeout(900)
  await page.getByText(ref, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-03-detail-opened.png', fullPage: true })

  await page.getByRole('button', { name: /ver ficha técnica/i }).click()
  await page.waitForTimeout(500)
  const modalText = await page.locator('.fixed.inset-0.z-\\[60\\]').innerText()
  console.log('TECHNICAL SPEC MODAL TEXT:', modalText)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-04-ficha-tecnica.png', fullPage: true })
  for (let i = 0; i < count; i++) {
    expect(modalText).toContain(`valor-${i}-${SPEC_FIELDS[i] ?? i}`)
  }
})

test('2a. Bloqueo — falta 1 campo (power vacío) bloquea el botón Guardar', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await openCreateModal(page)

  await page.locator('input[placeholder="Referencia pública"]').fill(`PREQA-BLOCK-A-${Date.now()}`)
  await page.locator('input[placeholder="Descripción"]').fill('Bloqueo A')
  await page.locator('input[placeholder="Precio de venta"]').fill('50')
  await page.locator('input[placeholder="Costo"]').fill('25')

  const specInputs = page.locator('.grid.grid-cols-2.gap-3').last().locator('input')
  const count = await specInputs.count()
  for (let i = 0; i < count; i++) {
    if (i === 1) continue // leave "power" (index 1) empty
    await specInputs.nth(i).fill(`val-${i}`)
  }
  await page.screenshot({ path: 'e2e/.tmp/preqa425-05-block-power-empty.png', fullPage: true })
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

test('2b. Bloqueo — falta 1 campo (certifications, último) bloquea el botón Guardar', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await openCreateModal(page)

  await page.locator('input[placeholder="Referencia pública"]').fill(`PREQA-BLOCK-B-${Date.now()}`)
  await page.locator('input[placeholder="Descripción"]').fill('Bloqueo B')
  await page.locator('input[placeholder="Precio de venta"]').fill('50')
  await page.locator('input[placeholder="Costo"]').fill('25')

  const specInputs = page.locator('.grid.grid-cols-2.gap-3').last().locator('input')
  const count = await specInputs.count()
  for (let i = 0; i < count - 1; i++) {
    await specInputs.nth(i).fill(`val-${i}`)
  }
  // leave last field (certifications) empty
  await page.screenshot({ path: 'e2e/.tmp/preqa425-06-block-certifications-empty.png', fullPage: true })
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

test('2c. Bloqueo real de backend — POST directo con technical_spec incompleto -> 422 con mensaje específico', async ({ page, request }) => {
  await login(page, 'management@atlantic.test')
  // grab bearer token from localStorage (axios interceptor JWT)
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth')) {
        return localStorage.getItem(k)
      }
    }
    return null
  })
  console.log('TOKEN RAW STORAGE VALUE:', token)

  const incompleteSpec: Record<string, string> = {}
  for (const key of SPEC_FIELDS) incompleteSpec[key] = 'x'
  delete incompleteSpec.power // remove one required field entirely

  const resp = await page.request.post(`${BASE}/api/compras/inventory`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
    },
    data: {
      reference: `PREQA-CURL-${Date.now()}`,
      description: 'Direct POST test',
      price_full: 10,
      cost: 5,
      stock_quantity: 0,
      technical_spec: incompleteSpec,
    },
    failOnStatusCode: false,
  })
  const status = resp.status()
  const body = await resp.json().catch(() => null)
  console.log('DIRECT POST STATUS:', status, 'BODY:', JSON.stringify(body))
  expect(status).toBe(422)
  const errors = body?.errors ?? {}
  const errorKeys = Object.keys(errors)
  console.log('ERROR KEYS:', errorKeys)
  expect(errorKeys.some(k => k.includes('power'))).toBeTruthy()

  // INFORMATIVO (no falla el test): sin el header Accept: application/json -- lo que manda un
  // fetch() de devtools "a mano" por default, a diferencia del axios del propio front que sí lo
  // fija (ver src/api/authApi.ts) -- Laravel no devuelve JSON sino un 302 a "http://localhost"
  // (sin puerto). No es un bug de SCRUM-425/426 puntual, es el comportamiento default de Laravel
  // para toda la API cuando el cliente no pide JSON explícitamente.
  const respNoAccept = await page.request.post(`${BASE}/api/compras/inventory`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: {
      reference: `PREQA-CURL-NOACCEPT-${Date.now()}`,
      description: 'no accept header',
      price_full: 10,
      cost: 5,
      stock_quantity: 0,
      technical_spec: incompleteSpec,
    },
    failOnStatusCode: false,
    maxRedirects: 0,
  })
  console.log('NO-ACCEPT-HEADER STATUS:', respNoAccept.status(), 'LOCATION:', respNoAccept.headers()['location'])
})

test('3. Producto legado (technical_spec NULL) muestra estado vacío coherente, sin crash', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1000)
  await page.locator('input[placeholder="Buscar producto…"]').fill('PREQA-LEGACY-001')
  await page.waitForTimeout(200)
  const searchBtn = page.getByRole('button', { name: /buscar/i })
  if (await searchBtn.count() > 0) await searchBtn.click()
  await page.waitForTimeout(900)
  await page.getByText('PREQA-LEGACY-001', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /ver ficha técnica/i }).click()
  await page.waitForTimeout(500)
  const modalText = await page.locator('.fixed.inset-0.z-\\[60\\]').innerText()
  console.log('LEGACY PRODUCT MODAL TEXT:', JSON.stringify(modalText))
  expect(modalText).not.toMatch(/undefined|null/i)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-07-legacy-empty-state.png', fullPage: true })
})

test('4. Persistencia real tras F5', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await openCreateModal(page)
  const ref = `PREQA-RELOAD-${Date.now()}`
  await page.locator('input[placeholder="Referencia pública"]').fill(ref)
  await page.locator('input[placeholder="Descripción"]').fill('Persistencia F5')
  await page.locator('input[placeholder="Precio de venta"]').fill('75')
  await page.locator('input[placeholder="Costo"]').fill('30')
  const specInputs = page.locator('.grid.grid-cols-2.gap-3').last().locator('input')
  const count = await specInputs.count()
  for (let i = 0; i < count; i++) {
    await specInputs.nth(i).fill(`persist-${i}`)
  }
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1200)

  // Full reload
  await page.reload()
  await page.waitForTimeout(1200)
  await page.locator('input[placeholder="Buscar producto…"]').fill(ref)
  await page.waitForTimeout(200)
  const searchBtn = page.getByRole('button', { name: /buscar/i })
  if (await searchBtn.count() > 0) await searchBtn.click()
  await page.waitForTimeout(900)
  await page.getByText(ref, { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /ver ficha técnica/i }).click()
  await page.waitForTimeout(500)
  const modalText = await page.locator('.fixed.inset-0.z-\\[60\\]').innerText()
  console.log('POST-RELOAD MODAL TEXT:', modalText)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-08-post-reload.png', fullPage: true })
  for (let i = 0; i < count; i++) {
    expect(modalText).toContain(`persist-${i}`)
  }
})

test('5. Caracteres especiales y valor > 255 chars', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await openCreateModal(page)
  const ref = `PREQA-EDGE-${Date.now()}`
  await page.locator('input[placeholder="Referencia pública"]').fill(ref)
  await page.locator('input[placeholder="Descripción"]').fill('Edge cases ñ á "comillas"')
  await page.locator('input[placeholder="Precio de venta"]').fill('10')
  await page.locator('input[placeholder="Costo"]').fill('5')

  const longValue = 'A'.repeat(300)
  const specInputs = page.locator('.grid.grid-cols-2.gap-3').last().locator('input')
  const count = await specInputs.count()
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      await specInputs.nth(i).fill(longValue) // voltage gets the >255 char value
    } else if (i === 1) {
      await specInputs.nth(i).fill(`Ñandú "acentuado" 100% seguro — 220V`)
    } else {
      await specInputs.nth(i).fill(`ok-${i}`)
    }
  }
  await page.screenshot({ path: 'e2e/.tmp/preqa425-09-edge-filled.png', fullPage: true })
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-10-edge-after-save.png', fullPage: true })
  const bodyText = await page.locator('body').innerText()
  console.log('EDGE CASE PAGE TEXT AFTER SAVE:', bodyText.slice(0, 2000))
})

test('6. Sin iconografía de emoji en el modal de ficha técnica (SCRUM-56)', async ({ page }) => {
  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1000)
  await page.locator('input[placeholder="Buscar producto…"]').fill('PREQA-LEGACY-001')
  await page.waitForTimeout(200)
  const searchBtn = page.getByRole('button', { name: /buscar/i })
  if (await searchBtn.count() > 0) await searchBtn.click()
  await page.waitForTimeout(900)
  await page.getByText('PREQA-LEGACY-001', { exact: true }).first().click()
  await page.waitForTimeout(600)
  const buttonHtml = await page.getByRole('button', { name: /ver ficha técnica/i }).innerHTML()
  console.log('BUTTON HTML:', buttonHtml)
  // eslint-disable-next-line no-misleading-character-class
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(buttonHtml)).toBeFalsy()
  await page.getByRole('button', { name: /ver ficha técnica/i }).click()
  await page.waitForTimeout(500)
  const modalHtml = await page.locator('.fixed.inset-0.z-\\[60\\]').innerHTML()
  expect(emojiRegex.test(modalHtml)).toBeFalsy()
  await page.screenshot({ path: 'e2e/.tmp/preqa425-11-no-emoji.png', fullPage: true })
})

test('7. Modo restringido (Ventas & Diseño) — visibilidad del botón + no leak de costo/margen', async ({ page }) => {
  await login(page, 'designer@atlantic.test')
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(1000)
  await page.locator('input[placeholder="Buscar producto…"]').fill('PREQA-LEGACY-001')
  await page.waitForTimeout(200)
  const searchBtn = page.getByRole('button', { name: /buscar/i })
  if (await searchBtn.count() > 0) await searchBtn.click()
  await page.waitForTimeout(900)
  await page.getByText('PREQA-LEGACY-001', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/.tmp/preqa425-12-restricted-detail.png', fullPage: true })
  const btn = page.getByRole('button', { name: /ver ficha técnica/i })
  const visible = await btn.count()
  console.log('RESTRICTED MODE — Ver ficha técnica button count:', visible)
  if (visible > 0) {
    await btn.click()
    await page.waitForTimeout(500)
    const modalText = await page.locator('.fixed.inset-0.z-\\[60\\]').innerText()
    console.log('RESTRICTED MODE FICHA TECNICA TEXT:', modalText)
    expect(modalText.toLowerCase()).not.toMatch(/costo|margen|\$/)
    await page.screenshot({ path: 'e2e/.tmp/preqa425-13-restricted-ficha-tecnica.png', fullPage: true })
  }
})
