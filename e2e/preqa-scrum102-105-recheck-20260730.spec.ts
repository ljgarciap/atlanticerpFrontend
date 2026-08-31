import { test, expect } from '@playwright/test'

/**
 * Pre-QA — SCRUM-102/105 (daily 2026-07-30, Bloque C): Daniela reportó el 2026-07-22 que las
 * tarjetas resumen de Cotizaciones mostraban $0/0% para Neil pese a tener proyectos Aprobados
 * en el pipeline. Investigación inicial (misma sesión) diagnosticó mal la causa — se consultaron
 * columnas `total_amount`/`amount` que no existen en el modelo Quote (el monto real se calcula
 * vía Quote::grandTotal(), que sí suma quote_parts.items correctamente). Re-verificado con el
 * método real: Neil SÍ tiene montos reales sembrados (Scrum711SalesForceDemoSeeder, cherry-pickeado
 * el 29/jul) — Aprobado $2,418.36 (3), Perdido $54.57 (1), 75% de conversión. Sin gap real, sin
 * cambio de código ni de datos.
 */
const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

test('las tarjetas resumen de Neil muestran montos reales, no $0/0%', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill('vendedordisenador2@test.com')
  await page.locator('input[type="password"]').fill('vendedordisenador2@test.com')
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)

  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(2000)

  await expect(page.getByText('$2,418.36')).toBeVisible()
  await expect(page.getByText('75%')).toBeVisible()
  await expect(page.getByText('$0.00', { exact: true })).toHaveCount(0)
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0)
})
