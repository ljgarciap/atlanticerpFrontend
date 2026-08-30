import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://localhost:8090' })

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

// SCRUM-406 — camino de ruptura: pedido "Asignado" por falta de stock SIN ninguna PurchaseOrder
// asociada todavía (Compras no generó la orden). VR-9007 (producto 105, cero PO activas).
test('SCRUM-406 — tarjeta sin stock y SIN OC asociada no revienta, no muestra ETA inventada', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  const card = page.locator('[data-testid^="order-card-"]', { hasText: 'VR-9007' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Sin stock')
  await expect(card.getByTestId('supplier-eta')).toHaveCount(0) // sin OC -> sin ETA, no inventada
  await page.screenshot({ path: 'e2e/.tmp/scrum406-sin-oc.png' })

  // Abrir el detalle también debe ser seguro (sin ETA de proveedor en el campo del modal).
  await card.click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/scrum406-sin-oc-detail.png' })

  expect(errors).toEqual([])
})
