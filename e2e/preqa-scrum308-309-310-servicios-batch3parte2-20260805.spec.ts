import { test, expect, Page } from '@playwright/test'

/**
 * Fase 4 — Servicios, Batch 3 parte 2 (REQ-245 Nuevo ticket datos generales / SCRUM-308,
 * REQ-246 búsqueda Cliente Master→Subcliente→Proyecto / SCRUM-309, REQ-247 requerimientos
 * especiales + productos / SCRUM-310). Password default = email (BusinessRoleUserSeeder).
 *
 * Fixture local `[PREQA]` (MasterClient/SubClient/SalesProject/CatalogProduct) sembrada a mano
 * para esta validación — local dev no tenía datos de Ventas & Diseño. Limpiar con
 * DemoCleanupController o a mano después de esta sesión.
 */
const LIDER_SERVICIOS   = 'servicio@illuminations.com.pa'
const VENDEDOR_DISENADOR = 'milena.e@grupolafayette.com'
const TECNICO_SERVICIOS  = 'carlos@illuminations.com.pa'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test('SCRUM-308/309/310 — Nuevo ticket completo', async ({ page }) => {
  await test.step('0) Login como lider_servicios y abrir Tickets', async () => {
    await login(page, LIDER_SERVICIOS)
    await page.goto('/servicios/tickets')
    await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum308-309-310-00-tickets.png' })
  })

  await test.step('1) Abrir el formulario de Nuevo ticket', async () => {
    await page.getByRole('button', { name: 'Nuevo ticket' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo ticket' })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum308-309-310-01-formulario-vacio.png' })
  })

  await test.step('2) REQ-245 — datos generales, botón deshabilitado hasta completar', async () => {
    const submitBtn = page.getByRole('button', { name: 'Crear ticket' })
    await expect(submitBtn).toBeDisabled()
    await page.getByPlaceholder('Ej: Apto 14B — Lobby').fill('Reclamo detectado en visita — Pre-QA')
    await expect(submitBtn).toBeDisabled() // todavía falta el proyecto (RN6)
  })

  await test.step('3) REQ-246 RN2/RN3/RN4 — buscar Cliente Master → Subcliente → Proyecto', async () => {
    await page.getByRole('button', { name: 'Cliente Master' }).click()
    await expect(page.getByRole('heading', { name: 'Buscar Cliente Master' })).toBeVisible()
    await page.locator('input[type="text"]').last().fill('Pacífico')
    await expect(page.getByRole('button', { name: '[PREQA] Inmobiliaria Pacífico' })).toBeVisible()
    await page.getByRole('button', { name: '[PREQA] Inmobiliaria Pacífico' }).click()

    await page.getByRole('button', { name: 'Subcliente' }).click()
    await expect(page.getByRole('heading', { name: 'Buscar Subcliente' })).toBeVisible()
    await page.getByRole('button', { name: '[PREQA] Pacífico Norte SA' }).click()

    await page.getByRole('combobox').filter({ hasText: 'Elegir proyecto' }).selectOption({ label: '[PREQA] Torre Pacífico' })
    await page.screenshot({ path: 'test-results/scrum308-309-310-03-cliente-elegido.png' })
  })

  await test.step('4) REQ-247 RN1/RN6 — marcar requerimientos del catálogo fijo', async () => {
    await page.getByTestId('requirement-chip-casco').click()
    await page.getByTestId('requirement-chip-arnes').click()
    await expect(page.getByTestId('requirement-chip-casco')).toHaveClass(/bg-primary/)
  })

  await test.step('5) REQ-247 RN3/RN4 — buscar y agregar un producto del catálogo real', async () => {
    await page.getByText('Buscar producto en inventario').click()
    await expect(page.getByRole('heading', { name: 'Buscar producto en inventario' })).toBeVisible()
    await page.locator('input[type="text"]').last().fill('PREQA-LUM')
    const productBtn = page.getByRole('button', { name: /PREQA-LUM-001 — \[PREQA\] Colgante LED/ })
    await expect(productBtn).toBeVisible()
    await productBtn.click()
    await expect(page.getByText('PREQA-LUM-001')).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum308-309-310-05-producto-agregado.png' })
  })

  await test.step('6) Crear el ticket y verificar el detalle real (cliente derivado, requerimientos, producto)', async () => {
    await page.getByRole('button', { name: 'Crear ticket' }).click()
    await expect(page.getByText(/^Ticket /)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('[PREQA] Inmobiliaria Pacífico').first()).toBeVisible()
    await expect(page.getByText('[PREQA] Pacífico Norte SA').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum308-309-310-06-ticket-creado.png' })
  })

  await test.step('7) REQ-245 RN4 — Vendedor/Diseñador también ve el botón y puede crear', async () => {
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await login(page, VENDEDOR_DISENADOR)
    await page.goto('/servicios/tickets')
    await expect(page.getByRole('button', { name: 'Nuevo ticket' })).toBeVisible()
  })

  await test.step('8) REQ-245 RN4 — Técnico interno NO ve el botón de Nuevo ticket', async () => {
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await login(page, TECNICO_SERVICIOS)
    await page.goto('/servicios/tickets')
    await expect(page.getByRole('button', { name: 'Nuevo ticket' })).not.toBeVisible()
    await page.screenshot({ path: 'test-results/scrum308-309-310-08-tecnico-sin-boton.png' })
  })
})
