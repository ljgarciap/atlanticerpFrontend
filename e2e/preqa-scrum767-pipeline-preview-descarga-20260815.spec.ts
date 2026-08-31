import { test, expect } from '@playwright/test'

// Pre-QA — SCRUM-767 (mejora nueva/corrección, Gerencia Test 2026-08-15): los archivos cargados
// en el detalle de una tarjeta de Pipeline quedaban guardados pero funcionalmente inaccesibles
// (ningún onClick/href). Backend nuevo (`GET .../files/{fileId}/url`, no existía) + frontend
// (Ver inline / Descargar, antes texto estático). Se promueve a spec permanente por tratarse de
// una corrección real sobre datos ya guardados por usuarios.
const BASE = 'http://localhost:5173'
const CARD_ID = process.env.PREQA767_CARD_ID ?? ''
const PROJECT_NAME = process.env.PREQA767_PROJECT_NAME ?? 'PreQA767 Proyecto'
const FILE_NAME = process.env.PREQA767_FILE_NAME ?? 'plano-preqa767.pdf'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openCard(page) {
  await page.goto(`${BASE}/ventas-diseno/pipeline?card=${CARD_ID}`)
  await page.waitForTimeout(1200)
}

test.describe.configure({ mode: 'serial' })

test('1. Persistencia — el archivo cargado sigue apareciendo al reabrir la tarjeta (sin re-cargarlo)', async ({ page }) => {
  test.skip(CARD_ID === '', 'Requiere PREQA767_CARD_ID — ver checkpoint de memoria 2026-08-15')
  await login(page, 'designer@atlantic.test')
  await openCard(page)
  await page.screenshot({ path: 'e2e/.tmp/preqa767-01-tarjeta-abierta.png', fullPage: true })

  await expect(page.getByText(FILE_NAME)).toBeVisible()
})

test('2. Escenario central — clic en el nombre abre la previsualización del PDF real', async ({ page }) => {
  test.skip(CARD_ID === '', 'Requiere PREQA767_CARD_ID')
  await login(page, 'designer@atlantic.test')
  await openCard(page)

  await page.getByText(FILE_NAME).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/preqa767-02-previsualizacion-abierta.png', fullPage: true })

  // Debe abrir el visor inline (iframe), NO descargar automáticamente.
  const iframe = page.locator('iframe')
  await expect(iframe).toBeVisible()
  const src = await iframe.getAttribute('src')
  console.log('IFRAME SRC:', src)
  expect(src).toMatch(/^https:\/\//) // URL presignada real, no un blob: local
  // La key de S3 es un UUID a propósito (PipelineFileService::upload()), no el nombre original —
  // se verifica la ruta ventas-diseno/{cardId}/design/ en vez del nombre de archivo.
  expect(src).toContain(`/ventas-diseno/${CARD_ID}/design/`)
  expect(src).toContain('X-Amz-Signature')

  // La URL presignada debe ser realmente accesible (no un 403/404 de S3).
  const resp = await page.request.get(src!)
  console.log('S3 PRESIGNED URL STATUS:', resp.status())
  expect(resp.status()).toBe(200)
})

test('3. Cerrar la previsualización regresa al detalle de la tarjeta', async ({ page }) => {
  test.skip(CARD_ID === '', 'Requiere PREQA767_CARD_ID')
  await login(page, 'designer@atlantic.test')
  await openCard(page)

  await page.getByText(FILE_NAME).first().click()
  await expect(page.locator('iframe')).toBeVisible()

  // Botón de cerrar del visor (icon button, sin texto — se identifica por ser el único
  // "icon" button en la barra superior del visor).
  const viewerHeader = page.locator('iframe').locator('xpath=preceding-sibling::div[1]')
  await viewerHeader.getByRole('button').last().click()
  await page.waitForTimeout(500)

  await expect(page.locator('iframe')).not.toBeVisible()
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible() // seguimos en el detalle de la tarjeta
})

test('4. Descargar es independiente de Ver — no abre el visor', async ({ page }) => {
  test.skip(CARD_ID === '', 'Requiere PREQA767_CARD_ID')
  await login(page, 'designer@atlantic.test')
  await openCard(page)

  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
  await page.getByTitle('Descargar').first().click()
  const download = await downloadPromise
  await page.waitForTimeout(500)

  console.log('DOWNLOAD EVENT:', download?.suggestedFilename())
  expect(page.locator('iframe')).toHaveCount(0) // Descargar nunca abre el visor
})
