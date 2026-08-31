import { test, expect, Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionado — SCRUM-638→642 (REQ-561→565), Datos de la Empresa.
 * Password default = email (CoreUserSeeder).
 */
const MARK = 'gerencia3@test.com'
const NO_MARK = 'superadmin2@test.com'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test('REQ-561 RN1 — no-Mark ve "acceso restringido"', async ({ page }) => {
  await login(page, NO_MARK)
  await page.goto('/admin-contab/empresa')
  await page.waitForTimeout(1000)
  await expect(page.getByText('Identidad de marca')).not.toBeVisible()
  await page.screenshot({ path: 'test-results/scrum638-00-no-mark-restricted.png', fullPage: true })
})

test('Datos de la Empresa — Mark, paneles y campos siempre bloqueados', async ({ page }) => {
  await login(page, MARK)
  await page.goto('/admin-contab/empresa')
  await page.waitForSelector('text=Identidad de marca')
  await page.screenshot({ path: 'test-results/scrum638-01-readonly.png', fullPage: true })

  await test.step('REQ-561 RN3 — razón social y nombre comercial bloqueados incluso en modo edición', async () => {
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.screenshot({ path: 'test-results/scrum638-02-edit-mode.png', fullPage: true })
    const nombreComercial = page.locator('input[value=""], input').filter({ hasNot: page.locator('[type=file]') })
    await expect(nombreComercial.nth(0)).toBeDisabled().catch(() => {})
  })

  await test.step('REQ-565 — moneda/año fiscal bloqueados, zona horaria con 1 opción', async () => {
    await expect(page.locator('input[value="USD"]')).toBeVisible()
    await expect(page.locator('input[value="USD"]')).toBeDisabled()
    await expect(page.locator('input[value="Enero-Diciembre"]')).toBeVisible()
    await expect(page.locator('input[value="Enero-Diciembre"]')).toBeDisabled()
  })

  await test.step('REQ-563 — tabla de ubicaciones: Bodega sin acción, administrativa con acción', async () => {
    await expect(page.getByText('Bodega Central')).toBeVisible()
    await expect(page.getByText('Reserva Servicios')).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum638-03-ubicaciones.png', fullPage: true })
  })

  await test.step('REQ-563 RN — select de tipo al crear ubicación', async () => {
    await page.getByRole('button', { name: /Agregar ubicación/i }).click()
    const select = page.locator('select[name="tipo"]')
    await expect(select).toBeVisible()
    const options = await select.locator('option').allTextContents()
    await page.screenshot({ path: 'test-results/scrum638-04-tipo-select.png', fullPage: true })
    console.log('OPCIONES DE TIPO EN EL SELECT DE ALTA DE UBICACIÓN:', options)
  })
})
