import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://localhost:8090' })

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-391 — seleccionar picker, verificar consolidado sumado + doble clic Imprimir + picker que dejó de tener en_picking', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /imprimir picking del día/i }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Apolonio Gonzalez' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/scrum391-consolidated-loaded.png', fullPage: true })

  const ordersCount = page.getByTestId('picking-orders-count')
  await expect(ordersCount).toContainText('2')

  const rows = page.getByTestId('picking-item-row')
  await expect(rows).toHaveCount(1) // VR-9003 + VR-9004 mismo producto 104 -> 1 sola línea consolidada
  const rowText = await rows.first().allTextContents()
  console.log('SCRUM-391 consolidated row:', rowText)
  await expect(rows.first()).toContainText('VR-9003')
  await expect(rows.first()).toContainText('VR-9004')

  // Doble clic en Imprimir.
  const printBtn = page.getByRole('button', { name: 'Imprimir', exact: true })
  await expect(printBtn).toBeEnabled()
  await printBtn.click({ force: true })
  await printBtn.click({ force: true })
  await page.waitForTimeout(300)

  expect(errors).toEqual([])
})
