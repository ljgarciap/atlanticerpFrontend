import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Reviewer — SCRUM-203 (REQ-140, columnas Ver Órdenes), 2026-08-01. Contra stack local
 * (Docker backend + Vite dev server) — el batch todavía no se pusheó a dev.atlanticerp.ai.
 *
 * Mockup adjunto 2A__Compras_Ordenes.html confirma exactamente estas 13 columnas (+ Acciones):
 * N° de orden, Proveedor, Modalidad de ingreso, Tipo de envío, Fecha de orden, Llegada estimada,
 * Fecha de pago, Monto, Costo de envío, Recepción, Estado, Responsable, Proyecto asignado.
 *
 * Regresión promovida a test permanente (no es solo el checklist inicial): la primera pasada de
 * esta misma revisión encontró un CRÍTICO real — con las 5 columnas nuevas la tabla excede el
 * ancho del viewport, y el Card wrapper (`overflow-hidden`) clippeaba el contenido en vez de dar
 * scroll, dejando el botón "Ver" (única acción de la fila) fuera del área visible y sin forma de
 * alcanzarlo (confirmado con bounding box fuera del viewport, no solo apretado). Corregido con un
 * `overflow-x-auto` alrededor de la tabla. Este test verifica que el botón "Ver" siga siendo
 * alcanzable — si alguien vuelve a envolver la tabla en un contenedor que recorte el overflow,
 * este test lo agarra antes de que llegue a QA.
 */
const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const EMAIL = 'management@atlantic.test'
const PASS  = 'Password123!'

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|compras|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

test.describe('SCRUM-203 — tabla Ver Órdenes', () => {
  test('las 13 columnas requeridas están presentes, en el orden del mockup', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1200)

    const headers = await page.locator('table thead th').allTextContents()
    const cleaned = headers.map(h => h.trim()).filter(Boolean)

    // "Orden"/"Modalidad"/"Total" son labels preexistentes (mismo dato que "N° de orden"/
    // "Modalidad de ingreso"/"Monto" del mockup, wording ya usado antes de este ticket) — no
    // bloqueante, ver criterio ya aplicado en SCRUM-140 para "SUB-TOTAL"/"TOTAL".
    expect(cleaned).toEqual([
      'Orden', 'Proveedor', 'Modalidad', 'Tipo de envío', 'Fecha de orden', 'Llegada estimada',
      'Fecha de pago', 'Total', 'Costo de envío', 'Recepción', 'Estado', 'Responsable',
      'Proyecto asignado', 'Acciones',
    ])
  })

  test('regresión: el botón "Ver" de cada fila sigue siendo alcanzable pese al ancho de la tabla', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1200)

    const verButton = page.getByRole('button', { name: /^Ver$/i }).first()
    await expect(verButton).toBeVisible()
    await verButton.scrollIntoViewIfNeeded()

    const box = await verButton.boundingBox()
    expect(box).not.toBeNull()
    const viewportWidth = page.viewportSize()?.width ?? 1280
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x).toBeLessThan(viewportWidth)

    await verButton.click()
    await page.waitForTimeout(500)
    // Confirma que el clic real navega al detalle — no solo que el elemento existe en el DOM.
    await expect(page).toHaveURL(/\/compras\/ordenes\/\d+/)
  })
})
