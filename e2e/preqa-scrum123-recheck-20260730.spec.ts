import { test, expect } from '@playwright/test'

/**
 * Pre-QA — SCRUM-123 (daily 2026-07-30, Bloque C): Daniela reportó el 2026-07-23 no poder
 * elegir un contacto ya existente del Subcliente sin guardar la cotización primero
 * ("Guardá la cotización antes de agregar contactos"). El fix de SCRUM-716 (2026-07-29,
 * persistir Cliente Master/Subcliente de inmediato al seleccionarlos, no solo al guardar
 * el encabezado completo) ya cubre exactamente este caso — confirmado en vivo: la sección
 * Contactos (incluido "Agregar contacto existente") queda disponible apenas se elige el
 * Subcliente, sin tocar "Guardar borrador". Sin cambio de código nuevo en este ticket.
 */
const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

test('elegir Subcliente habilita "Agregar contacto existente" sin guardar antes', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill('management@atlantic.test')
  await page.locator('input[type="password"]').fill('Password123!')
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)

  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /nueva cotizaci[oó]n/i }).click()
  await page.waitForTimeout(2000)

  await page.locator('text=Cliente Master').locator('..').locator('input').fill('QA L4 Cliente Full')
  await page.waitForTimeout(1000)
  await page.getByText('QA L4 Cliente Full', { exact: true }).click()
  await page.waitForTimeout(1000)

  await page.locator('text=Subcliente').locator('..').locator('input').click()
  await page.waitForTimeout(800)
  await page.getByText('QA L4 Sub Full S.A.', { exact: true }).click()
  await page.waitForTimeout(1500)

  await expect(page.getByText(/guard[aá].*cotizaci[oó]n antes/i)).toHaveCount(0)
  await expect(page.getByText(/agregar contacto existente/i)).toBeVisible()
})
