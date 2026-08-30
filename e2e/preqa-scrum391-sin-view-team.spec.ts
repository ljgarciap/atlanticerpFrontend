import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://localhost:8090' })

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

// SCRUM-391 — actor SIN modules.bodega.view_team (Picker real: ayudante_general_bodega,
// apolonio.gonzalez@atlantic.com.pa, confirmado por Pre-QA vía tinker que view_team=false,
// a diferencia de logistica@atlantic.com.pa/asistente_bodega que SÍ tiene view_team=true —
// el brief original sugería logistica como el actor sin el permiso, dato desactualizado).
// Comportamiento esperado (decisión de producto confirmada por Luis, comentario de código
// 2026-07-24): lista de chips vacía con mensaje, NUNCA un error.
test('SCRUM-391 — actor sin view_team ve el modal con chips vacíos, sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  const failedRequests: string[] = []
  page.on('requestfailed', req => failedRequests.push(req.url()))

  await login(page, 'apolonio.gonzalez@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /imprimir picking del día/i }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.tmp/scrum391-sin-view-team.png' })

  const emptyMsg = page.getByTestId('picking-empty-pickers')
  await expect(emptyMsg).toBeVisible()
  const chipsContainer = page.getByTestId('picker-chips')
  await expect(chipsContainer).toHaveCount(0)

  expect(errors).toEqual([])
  console.log('SCRUM-391 sin view_team — failed requests:', failedRequests)
})
