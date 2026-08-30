import { test, expect } from '@playwright/test'

// Pre-QA real para SCRUM-501 (siembra Pedidos de Bodega) y SCRUM-670 (siembra Zona Libre de
// Colón), pedida por marly.rangel el 2026-07-25. Corre contra los fixtures sembrados por
// database/seeders/QaTicketsBatch20260725Seeder.php (marcador [QA-BOD] / QA-ZL-*).

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-501 — Kanban Pedidos muestra los pedidos sembrados en sus etapas reales', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  await login(page, 'almacen@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)

  const body = page.locator('body')
  await expect(body).toContainText('Residencial Las Brisas')
  await expect(body).toContainText('Torre Marina Bahía')
  await expect(body).toContainText('Local Comercial Multiplaza')
  await expect(body).toContainText('Restaurante Costa del Este')

  await page.screenshot({ path: 'e2e/.tmp/scrum501-pedidos-board.png', fullPage: true })
  expect(errors).toEqual([])
})

test('SCRUM-501 — pedido En picking abre con picking parcial (3 ramas)', async ({ page }) => {
  await login(page, 'apolonio.gonzalez@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1500)

  const card = page.locator('[data-testid^="order-card-"]').filter({ hasText: 'Torre Marina Bahía' }).first()
  await expect(card).toBeVisible()
  await card.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum501-picking-parcial.png', fullPage: true })
})

test('SCRUM-670 — Nueva Orden Zona Libre ya no sale vacía (productos sembrados)', async ({ page }) => {
  await login(page, 'logistica@atlantic.com.pa')
  await page.goto('/bodega/ordenes-zona-libre/nueva')
  await page.waitForTimeout(1500)

  const body = page.locator('body')
  await expect(body).not.toContainText('No se encontraron productos disponibles')
  await expect(body).toContainText('QA-ZL-001')

  await page.screenshot({ path: 'e2e/.tmp/scrum670-nueva-orden.png', fullPage: true })
})

test('SCRUM-670 — Bandeja de Órdenes Zona Libre muestra los 3 estados', async ({ page }) => {
  await login(page, 'logistica@atlantic.com.pa')
  await page.goto('/bodega/ordenes-zona-libre')
  await page.waitForTimeout(1500)

  const body = page.locator('body')
  await expect(body).toContainText(/por aprobar/i)
  await expect(body).toContainText(/aprobada/i)
  await expect(body).toContainText(/rechazada/i)

  await page.screenshot({ path: 'e2e/.tmp/scrum670-bandeja.png', fullPage: true })
})
