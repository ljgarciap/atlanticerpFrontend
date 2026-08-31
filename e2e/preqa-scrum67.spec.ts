import { test, expect } from '@playwright/test'

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

// SCRUM-67 (hallazgo QA Gerencia Test, 2026-07-20) — el mock abre un listado completo de
// pendientes antes del drill-down al detalle; el "+N más" no tenía ningún onClick, así que no
// había forma de ver el resto una vez pasados los primeros 3. Gate promovido a e2e/ por regla
// del proyecto (smoke tests que verifican un hallazgo ya roto una vez no se borran).
test('SCRUM-67 — "+N pendientes más" abre el listado completo con drill-down', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', 'management@atlantic.test')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)

  await page.goto(`${BASE}/ventas-diseno/home`)
  await page.waitForTimeout(2500)

  const body = await page.textContent('body')
  if (!body?.match(/\+\s*\d+\s*pendientes más/)) {
    test.skip(true, 'Datos demo actuales no tienen más de 3 pendientes para management — nada que verificar en esta corrida.')
    return
  }

  await page.click('text=/\\+\\s*\\d+\\s*pendientes más/')
  await page.waitForTimeout(800)
  await expect(page.getByText('Pendientes — detalle completo')).toBeVisible()

  const modal = page.locator('text=Pendientes — detalle completo').locator('xpath=ancestor::div[contains(@class,"max-w-md")]')
  const rows = modal.locator('text=/sin contactar hace|Falta contacto Arquitecto/')
  expect(await rows.count()).toBeGreaterThan(3)

  await rows.first().click()
  await page.waitForTimeout(600)
  await expect(page.getByText('Detalle del pendiente')).toBeVisible()
  await expect(page.getByText('Pendientes — detalle completo')).not.toBeVisible()
})
