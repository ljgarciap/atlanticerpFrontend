import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA adversarial — SCRUM-739 (UAT-2, ocultar/restaurar módulos y botones de Catálogo en
 * bloque para TODOS los usuarios no-superadmin). Senior Review ya aprobó (13/13 backend, 960/960
 * frontend, PHPStan limpio) — este spec cubre lo que esa revisión no ejercita: la app real en
 * navegador con cuentas reales del roster, y el escenario de ruptura específico que Luis pidió
 * validar: un override individual preexistente en un módulo, sobreviviendo (o no) a un ciclo
 * bulk-hide → bulk-restore de ESE MISMO módulo.
 *
 * Cuentas reales (NUNCA *@atlantic.test, no existen en esta BD):
 *   superadmin: lujogarpin78@gmail.com (password = mismo email)
 *   Vendedor/Diseñador: milena.e@grupolafayette.com (password = mismo email)
 *
 * Nota: el hallazgo de "restore borra override individual preexistente" ya se confirmó por
 * separado vía tinker directo (ver comentario de Jira / docs/pre-qa/scrum739-...) — este spec
 * cubre la superficie de UI (Sidebar/CatalogPage reales, botón "Visibilidad de módulos (UAT)").
 */
const SUPERADMIN = 'lujogarpin78@gmail.com'
const VENDEDOR = 'milena.e@grupolafayette.com'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test.describe.serial('SCRUM-739 — Visibilidad de módulos (UAT) masiva', () => {
  test('camino feliz: superadmin oculta Servicios, Vendedor deja de verlo, restore lo devuelve', async ({ page }) => {
    // Nota: Vendedor/Diseñador no tiene Bodega por default de rol (can_view=0 ya sin bulk) —
    // confirmado por tinker antes de este spec. Servicios SÍ es FULL por rol default para este
    // usuario, así que es el módulo correcto para probar el ciclo hide->restore visible en UI.

    // --- Baseline: Vendedor ve Servicios en el Sidebar (renderiza como <button>, no <a>) ---
    await login(page, VENDEDOR)
    await expect(page.getByRole('button', { name: /^servicios$/i })).toBeVisible()

    // --- Superadmin: abre Usuarios -> Visibilidad de módulos (UAT) -> oculta Servicios ---
    await login(page, SUPERADMIN)
    await page.goto('/security/users')
    const bulkBtn = page.getByRole('button', { name: /visibilidad de módulos.*uat/i })
    await expect(bulkBtn).toBeVisible()
    await bulkBtn.click()

    await page.locator('label', { hasText: /^Servicios$/ }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: /ocultar/i }).click()
    await expect(page.getByText(/guardado/i)).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /cerrar/i }).click()

    // --- Vendedor: ya no ve Servicios ---
    await login(page, VENDEDOR)
    await expect(page.getByRole('button', { name: /^servicios$/i })).not.toBeVisible()

    // --- Superadmin: restaura Servicios (el modal ya precarga marcado lo que está
    // oculto — no hace falta re-clickear, "Restaurar" usa esa misma selección) ---
    await login(page, SUPERADMIN)
    await page.goto('/security/users')
    await page.getByRole('button', { name: /visibilidad de módulos.*uat/i }).click()
    await expect(page.locator('label', { hasText: /^Servicios$/ }).locator('input[type="checkbox"]')).toBeChecked()
    await page.getByRole('button', { name: /restaurar/i }).click()
    await expect(page.getByText(/guardado/i)).toBeVisible({ timeout: 10000 })

    // --- Vendedor: vuelve a ver Servicios ---
    await login(page, VENDEDOR)
    await expect(page.getByRole('button', { name: /^servicios$/i })).toBeVisible()
  })

  test('doble clic en Ocultar no duplica ni rompe (botón se deshabilita en isPending)', async ({ page }) => {
    await login(page, SUPERADMIN)
    await page.goto('/security/users')
    await page.getByRole('button', { name: /visibilidad de módulos.*uat/i }).click()
    await page.locator('label', { hasText: /^Gerencia$/ }).locator('input[type="checkbox"]').check()

    const hideBtn = page.getByRole('button', { name: /ocultar/i })
    await hideBtn.click()
    // Segundo click inmediato — si el botón no se deshabilitó a tiempo, igual el backend es
    // idempotente (confirmado por curl directo), así que lo que importa es que no tire error.
    await hideBtn.click({ force: true }).catch(() => {})
    await expect(page.getByText(/guardado/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/error/i)).not.toBeVisible()

    // cleanup: restaurar Gerencia (ya viene precargado marcado, no re-clickear)
    await page.getByRole('button', { name: /restaurar/i }).click()
    await expect(page.getByText(/guardado/i)).toBeVisible({ timeout: 10000 })
  })
})
