import { test, expect } from '@playwright/test'

// SCRUM-428/429/430/446/447/448/449/450 — "Solicitud de ajuste". Promovido a permanente
// (2026-07-21) por la regla de e2e no se descarta: este batch tuvo un hallazgo CRÍTICO real de
// Pre-QA (race condition — 5 approve concurrentes triplicaban el ajuste de stock antes del fix
// de lockForUpdate() dentro de la transacción, ver AdjustmentRequestController::approve()).
//
// Re-verificación 2026-07-21 encontró que un doble clic real desde el navegador SÍ dispara 2
// requests HTTP (el botón no alcanza a deshabilitarse entre los dos clics de un dblclick), pero
// el backend absorbe la carrera correctamente: como máximo 1 de las 2 respuestas es 200, la otra
// 422 ("Esta solicitud ya fue resuelta."). Este test protege ese contrato end-to-end, no solo a
// nivel de curl concurrente (que también se verificó aparte, fuera de este repo de tests).

async function login(page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('Doble clic rápido en Aprobar sobre la misma línea Pendiente — a lo sumo 1 aplica (regresión CRÍTICO Pre-QA)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  const approveResponses: number[] = []
  page.on('response', res => {
    if (res.url().includes('/adjustment-requests/lines/') && res.url().includes('/approve')) {
      approveResponses.push(res.status())
    }
  })

  await login(page, 'management@illuminations.test', 'Password123!')
  await page.goto('/bodega/solicitud-ajuste')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Pendiente' }).click()
  await page.waitForTimeout(1000)

  const approveBtn = page.getByRole('button', { name: /^aprobar$/i }).first()
  const count = await page.getByRole('button', { name: /^aprobar$/i }).count()

  test.skip(count === 0, 'No hay líneas Pendiente disponibles en este entorno para ejercitar el doble clic')

  await approveBtn.dblclick({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)

  const successCount = approveResponses.filter(s => s === 200).length
  expect(successCount).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
