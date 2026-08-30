import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Pre-QA — SCRUM-766 (decisión de Luis 2026-08-16): las vistas INTERNAS (los 6 puntos de acceso
// del ticket) deben verse exactamente iguales entre sí y contra lo descargado, generadas por un
// motor de PDF real (dompdf, QuotePdfService) — reemplaza QuoteDocument.tsx + window.print(). La
// política de ocultar precio/descuento/total/observaciones/pago/condiciones/totales/firma en la
// vista externa (SCRUM-140) se mantiene sin cambios.
const BASE = 'http://localhost:5173'
const QUOTE_ID = process.env.PREQA766_QUOTE_ID ?? ''
const FOLIO = process.env.PREQA766_FOLIO ?? 'PREQA766-E2E'

async function login(page, email: string, password: string = 'Password123!') {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test.describe.configure({ mode: 'serial' })

test('1. Vista Previa interna — PDF real embebido, con precios y foto', async ({ page }) => {
  test.skip(QUOTE_ID === '', 'Requiere PREQA766_QUOTE_ID — ver checkpoint de memoria 2026-08-16')
  await login(page, 'designer@illuminations.test')

  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes(`/quotes/${QUOTE_ID}/pdf`) && r.url().includes('external=0')),
    (async () => {
      await page.goto(`${BASE}/ventas-diseno/quotes/${QUOTE_ID}`)
      await page.getByText('Vista previa').click()
    })(),
  ])
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')

  const iframe = page.locator('iframe')
  await expect(iframe).toBeVisible()
  const src = await iframe.getAttribute('src')
  expect(src).toMatch(/^blob:/)

  const bytes = await response.body()
  const path = 'e2e/.tmp/preqa766-internal.pdf'
  writeFileSync(path, bytes)
  const text = execSync(`pdftotext "${path}" -`).toString()
  console.log('PDF INTERNO — primeros 300 chars:', text.slice(0, 300).replace(/\n/g, ' | '))

  // Estructura del ticket presente.
  expect(text).toContain('APTO')
  expect(text).toContain('Total partida');
  expect(text).toMatch(/P.gina 1 de 1/)
  // Datos comerciales SÍ visibles en la interna.
  expect(text).toContain('Observaciones visibles solo interno PreQA766')
  expect(text).toContain('Condiciones visibles solo interno PreQA766')
  expect(text).toContain('$153.00') // tipo Proyecto (-15%): $85/ud x 2 - 10% desc = $153 (total partida)
})

test('2. Vista Externa — misma estructura, sin precios ni condiciones (política SCRUM-140 intacta)', async ({ page }) => {
  test.skip(QUOTE_ID === '', 'Requiere PREQA766_QUOTE_ID')
  await login(page, 'designer@illuminations.test')

  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes(`/quotes/${QUOTE_ID}/pdf`) && r.url().includes('external=1')),
    (async () => {
      await page.goto(`${BASE}/ventas-diseno/quotes/${QUOTE_ID}`)
      await page.getByText('Vista externa').click()
    })(),
  ])
  expect(response.status()).toBe(200)

  const bytes = await response.body()
  const path = 'e2e/.tmp/preqa766-external.pdf'
  writeFileSync(path, bytes)
  const text = execSync(`pdftotext "${path}" -`).toString()
  console.log('PDF EXTERNO — primeros 300 chars:', text.slice(0, 300).replace(/\n/g, ' | '))

  // Misma estructura (encabezado, APTO, cliente/proyecto, tabla) pero SIN datos comerciales.
  expect(text).toContain('APTO')
  expect(text).not.toContain('$153.00')
  expect(text).not.toContain('Total partida')
  expect(text).not.toContain('Observaciones visibles solo interno PreQA766')
  expect(text).not.toContain('Condiciones visibles solo interno PreQA766')
  expect(text).not.toContain('Firma del cliente')
})

test('3. Descargar PDF dispara una descarga real con el nombre correcto', async ({ page }) => {
  test.skip(QUOTE_ID === '', 'Requiere PREQA766_QUOTE_ID')
  await login(page, 'designer@illuminations.test')
  await page.goto(`${BASE}/ventas-diseno/quotes/${QUOTE_ID}`)
  await page.getByText('Vista previa').click()
  await expect(page.locator('iframe')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByText('Descargar PDF').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`Cotizacion-${FOLIO}.pdf`)
})

test('4. Cotizaciones → Detalle (QuoteViewerModal) — mismo PDF, más la sección Versiones (React)', async ({ page }) => {
  test.skip(QUOTE_ID === '', 'Requiere PREQA766_QUOTE_ID')
  await login(page, 'designer@illuminations.test')

  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes(`/quotes/${QUOTE_ID}/pdf`)),
    page.goto(`${BASE}/ventas-diseno/quotes-list?viewQuote=${QUOTE_ID}`),
  ])
  expect(response.status()).toBe(200)
  await expect(page.locator('iframe')).toBeVisible()
  await expect(page.getByRole('heading', { name: new RegExp(FOLIO) })).toBeVisible()
})
