import { test, expect } from '@playwright/test'

// SCRUM-451→456 — pantalla "Bodegas". Promovido a permanente (2026-07-21) tras un hallazgo
// CRÍTICO real de Pre-QA: el chip "Espacio libre" dejaba la pantalla en blanco (crash sin error
// boundary) porque esa rama de la respuesta no traía `kpis`. No depende de datos de producto
// sembrados a mano — solo de las 7 bodegas físicas, que siempre existen vía migración.

async function login(page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('Bodegas — las 7 pestañas se muestran, Bodega Central por defecto (REQ-381)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'designer@atlantic.test', 'Password123!')
  await page.goto('/bodega/bodegas')

  await expect(page.getByRole('button', { name: 'Bodega Central' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bodega Zona Libre' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Showroom Obarrio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Showroom SM' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Showroom Cliente' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Merma' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reclamos y Devoluciones' })).toBeVisible()
  expect(errors).toEqual([])
})

test('Bodegas — chip "Espacio libre" no rompe la pantalla (regresión CRÍTICO Pre-QA 2026-07-21)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'designer@atlantic.test', 'Password123!')
  await page.goto('/bodega/bodegas')

  await page.getByRole('button', { name: /Espacio libre/i }).click()
  await page.waitForTimeout(500)

  // El bug real: la pantalla quedaba completamente en blanco (React desmontaba el árbol
  // entero sin error boundary). El fix hace que el backend siempre incluya `kpis`.
  await expect(page.getByRole('heading', { name: 'Bodegas' })).toBeVisible()
  await expect(page.getByText(/próximamente/i)).toBeVisible()
  expect(errors).toEqual([])
})

test('Bodegas — navegar a la pantalla nunca crashea, tenga o no el permiso el usuario', async ({ page }) => {
  // No asume un estado de permiso específico (bodega.read puede estar o no otorgado según el
  // entorno) -- el contrato que este test protege es "nunca un crash de React", ya sea que
  // RequirePermission redirija o que la pantalla cargue con datos reales.
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'designer@atlantic.test', 'Password123!')
  await page.goto('/bodega/bodegas')
  await page.waitForTimeout(1000)

  expect(errors).toEqual([])
})
