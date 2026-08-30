import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

test.use({ baseURL: 'http://localhost:8090' })

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

// SCRUM-391 — camino de ruptura explícito pedido por el brief: el picker seleccionado deja de
// tener pedidos "En picking" DESPUÉS de que el chip ya se pintó (cambio de estado concurrente).
// No navegamos fuera de /bodega/pedidos (para simular exactamente "el modal se vuelve a abrir en
// la misma sesión, con datos de tablero potencialmente cacheados"), cambiamos el estado real en
// Postgres vía tinker, y confirmamos que reabrir + reseleccionar el mismo picker degrada a
// "sin pedidos" en vez de reventar o mostrar datos fantasma.
test('SCRUM-391 — picker deja de tener en_picking mientras se usa el modal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /imprimir picking del día/i }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Apolonio Gonzalez' }).click()
  await page.waitForTimeout(800)
  await expect(page.getByTestId('picking-orders-count')).toContainText('2')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(300)

  // Cambiamos el estado real en Postgres MIENTRAS la SPA sigue montada en la misma página.
  execSync(
    'docker compose exec -T laravel php artisan tenants:artisan tinker < ' +
    '/private/tmp/claude-501/-Users-lgarcia-Documents-GitHub-Softclass-Illumination-atlanticerp/829e7394-7187-44d4-96b4-8a3e5ad60152/scratchpad/move_out_of_picking.php',
    { cwd: '/Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend/infra', stdio: 'inherit' },
  )

  // Reabrir el modal SIN recargar la página (misma sesión SPA).
  await page.getByRole('button', { name: /imprimir picking del día/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/.tmp/scrum391-stale-chip-reopened.png' })

  const chip = page.getByRole('button', { name: 'Apolonio Gonzalez' })
  const chipStillThere = await chip.count()
  console.log('SCRUM-391 stale-chip: sigue apareciendo Apolonio como chip?', chipStillThere > 0)

  if (chipStillThere > 0) {
    await chip.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'e2e/.tmp/scrum391-stale-chip-empty-result.png' })
    const ordersCount = page.getByTestId('picking-orders-count')
    const hasOrdersCount = await ordersCount.count()
    if (hasOrdersCount > 0) {
      await expect(ordersCount).toContainText('0')
    }
    // No debe seguir mostrando la fila consolidada vieja (VR-9003/VR-9004) como si siguiera vigente.
    const rows = page.getByTestId('picking-item-row')
    await expect(rows).toHaveCount(0)
  }

  expect(errors).toEqual([])
})
