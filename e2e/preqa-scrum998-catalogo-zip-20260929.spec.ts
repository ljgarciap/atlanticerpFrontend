import { test, expect, Page } from '@playwright/test'

// SCRUM-998 — PDF de Catálogo grande generado en segundo plano (ZIP de volúmenes). Pre-QA 2026-09-29 contra `E2E_BASE_URL`
// (por defecto dev.atlanticerp.ai) con el usuario real `vendedor3@` (Vendedor/Diseñador, password = correo en dev).
//
// Precondición: `E2E_EXPORT_ID` = una exportación YA TERMINADA de `vendedor3@` (se genera con la API real: POST
// /ventas-diseno/catalog/send-pdf con más productos que `catalog_pdf_max_single_products` y se espera a `done`; la corrida real
// de Horizon + S3 la hace el Pre-QA). Sin esa variable el spec se salta: no fabrica datos por su cuenta.
test.use({ baseURL: process.env.E2E_BASE_URL ?? 'https://dev.atlanticerp.ai' })
test.describe.configure({ mode: 'serial' })

const EXPORT_ID = process.env.E2E_EXPORT_ID ?? ''
test.skip(!EXPORT_ID, 'requiere E2E_EXPORT_ID de una exportación terminada de vendedor3@')

async function login(page: Page, email: string, password: string = email) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20_000 })
}

function track(page: Page) {
  const bad: string[] = []
  page.on('response', r => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`) })
  return bad
}

test('SCRUM-998 — el enlace del aviso abre el Catálogo con el banner y el botón descarga el ZIP real de S3', async ({ page }) => {
  const bad = track(page)
  await login(page, 'vendedor3@test.com')

  await page.goto(`/ventas-diseno/catalog?export=${EXPORT_ID}`)
  await expect(page.getByText(/Tu catálogo está listo/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/2 volúmenes/)).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/s998-00-banner-listo.png', fullPage: true })

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /Descargar ZIP/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^Catalogo-Atlantic-\d{4}-\d{2}-\d{2}\.zip$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(bad).toEqual([])
})

test('SCRUM-998 — pedir el catálogo completo con más productos que el máximo muestra el aviso y el banner (sin descargar un PDF)', async ({ page }) => {
  const bad = track(page)
  // El backend real devolvería 202 con un catálogo de 29.630 productos (un job de ~60 volúmenes por corrida): se responde el 202
  // con el identificador de la exportación ya generada para probar la UI sin encolar un catálogo completo en cada corrida.
  await page.route('**/api/ventas-diseno/catalog/send-pdf', route => route.fulfill({
    status: 202, contentType: 'application/json',
    body: JSON.stringify({ export_id: EXPORT_ID, status: 'queued', total_products: 29630, volumes: 60 }),
  }))
  let pdfDownloads = 0
  page.on('download', () => { pdfDownloads++ })

  await login(page, 'vendedor3@test.com')
  await page.goto('/ventas-diseno/catalog')
  await expect(page.locator('h1')).toBeVisible()
  await page.getByRole('button', { name: /Enviar catálogo completo/i }).click()

  await expect(page.getByText(/demasiado grande para un solo PDF/)).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(new RegExp(`export=${EXPORT_ID}`))
  await expect(page.getByRole('button', { name: /Descargar ZIP/i })).toBeVisible({ timeout: 30_000 })
  expect(pdfDownloads).toBe(0)
  await page.screenshot({ path: 'e2e/.tmp/s998-01-pedido-grande.png', fullPage: true })
  expect(bad).toEqual([])
})

test('SCRUM-998 — el aviso in-app de la exportación terminada está en la campana y su enlace abre la descarga', async ({ page }) => {
  const bad = track(page)
  await login(page, 'vendedor3@test.com')
  await page.goto('/ventas-diseno/catalog')

  await page.getByTitle(/Notificaciones/i).click()
  const item = page.getByText(/Tu catálogo en PDF está listo/).first()
  await expect(item).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: 'e2e/.tmp/s998-02-campana.png', fullPage: true })

  await item.click()
  await expect(page).toHaveURL(/\/ventas-diseno\/catalog\?export=/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: /Descargar ZIP/i })).toBeVisible({ timeout: 30_000 })
  expect(bad).toEqual([])
})

test('SCRUM-998 — una exportación ajena se muestra como no encontrada', async ({ page }) => {
  await login(page, 'gerencia3@test.com')
  await page.goto(`/ventas-diseno/catalog?export=${EXPORT_ID}`)

  await expect(page.getByText(/No se encontró esa exportación/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Descargar ZIP/i })).toHaveCount(0)
})
