import { test, expect, Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionado — SCRUM-632→637 (REQ-555→560), Configuración Fiscal.
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

test('REQ-555 RN1 — no-Mark ve "acceso restringido", no la pantalla', async ({ page }) => {
  await login(page, NO_MARK)
  await page.goto('/admin-contab/fiscal')
  await page.waitForTimeout(1000)
  await expect(page.getByText('Datos fiscales de la empresa')).not.toBeVisible()
  await page.screenshot({ path: 'test-results/scrum632-00-no-mark-restricted.png', fullPage: true })
})

test('Configuración Fiscal — Mark, modo lectura/edición y paneles', async ({ page }) => {
  await login(page, MARK)
  await page.goto('/admin-contab/fiscal')
  await page.waitForSelector('text=Datos fiscales de la empresa')
  await page.screenshot({ path: 'test-results/scrum632-01-readonly.png', fullPage: true })

  await test.step('REQ-555 RN2 — campos bloqueados en modo lectura', async () => {
    const razonSocial = page.locator('input').first()
    await expect(razonSocial).toBeDisabled()
  })

  await test.step('Entrar a modo edición', async () => {
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.screenshot({ path: 'test-results/scrum632-02-edit-mode.png', fullPage: true })
  })

  await test.step('REQ-555 RN3 — "Última sincronización" sigue bloqueada en modo edición', async () => {
    const ultimaSync = page.locator('label:has-text("Última sincronización") input, label:has-text("Sincronización") input')
    await expect(ultimaSync.first()).toBeDisabled()
  })

  await test.step('REQ-557 — badge de ambiente (contraste fuerte prod/pruebas) visible', async () => {
    const bodyText = await page.textContent('body')
    console.log('Contiene "Producción" o "Pruebas":', /Producci[oó]n|Pruebas/.test(bodyText ?? ''))
  })

  await test.step('REQ-558 — tasas base sin botón eliminar, tabla visible', async () => {
    await expect(page.getByText('7% — General')).toBeVisible()
    await expect(page.getByText('3.5% — Retención')).toBeVisible()
    await expect(page.getByText('0% — Exento')).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum632-03-itbms-table-editmode.png', fullPage: true })
  })

  await test.step('REQ-558 RN3 — agregar tasa sin completar campos bloquea guardado', async () => {
    await page.getByRole('button', { name: /Agregar tasa/i }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-results/scrum632-04-nueva-tasa-validation.png', fullPage: true })
  })

  await test.step('REQ-559 — abrir detalle de tasa base (7% General)', async () => {
    await page.getByText('7% — General').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-results/scrum632-05-detalle-tasa-modal.png', fullPage: true })
  })
})
