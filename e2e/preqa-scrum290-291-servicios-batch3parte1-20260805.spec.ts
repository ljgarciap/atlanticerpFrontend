import { test, expect, Page } from '@playwright/test'

/**
 * Fase 4 — Servicios, Batch 3 parte 1 (REQ-227 Cancelar ticket / SCRUM-290, REQ-228 Ver/Imprimir
 * PDF / SCRUM-291). Password default = email (BusinessRoleUserSeeder).
 */
const LIDER_SERVICIOS = 'servicio@atlantic.com.pa'
const TECNICO_SERVICIOS = 'carlos@atlantic.com.pa'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function openFirstTicketDetail(page: Page) {
  await page.goto('/servicios/tickets')
  await page.waitForSelector('table')
  await page.locator('button[title="Ver detalle"]').first().click()
  await expect(page.getByText(/^Ticket /)).toBeVisible()
}

test('SCRUM-290/291 — Cancelar ticket y Ver/Imprimir PDF', async ({ page }) => {
  await test.step('0) Login como lider_servicios (Aaron) y abrir el primer ticket', async () => {
    await login(page, LIDER_SERVICIOS)
    await openFirstTicketDetail(page)
    await page.screenshot({ path: 'test-results/scrum290-291-00-detalle.png' })
  })

  await test.step('1) Visual — botones Ver/Imprimir y Cancelar ticket presentes (lider_servicios)', async () => {
    await expect(page.getByRole('button', { name: 'Ver/Imprimir' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar ticket' })).toBeVisible()
  })

  await test.step('2) REQ-228 — Ver/Imprimir dispara la descarga del PDF', async () => {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Ver/Imprimir' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^Ticket-.*\.pdf$/)
  })

  await test.step('3) REQ-227 Escenario 2 — confirmación requerida, motivo obligatorio', async () => {
    await page.getByRole('button', { name: 'Cancelar ticket' }).click()
    await expect(page.getByText(/Cancelar ticket /)).toBeVisible()

    const confirmBtn = page.getByRole('button', { name: 'Confirmar cancelación' })
    await expect(confirmBtn).toBeDisabled()

    // Cerrar sin confirmar (RN2 — rechazar la confirmación no cambia el estado).
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page.getByText('Motivo de cancelación')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar ticket' })).toBeVisible()
  })

  await test.step('4) REQ-227 Escenario 1 — cancelación exitosa con motivo', async () => {
    await page.getByRole('button', { name: 'Cancelar ticket' }).click()
    const motivoTexto = 'Cliente ya no requiere el servicio — prueba Pre-QA'
    await page.getByPlaceholder('Explica por qué se cancela este ticket').fill(motivoTexto)
    await page.getByRole('button', { name: 'Confirmar cancelación' }).click()

    // El modal de confirmación (heading propio "Cancelar ticket <numero>") debe cerrarse antes de
    // verificar el detalle — "Motivo de cancelación" es también la etiqueta del campo DENTRO del
    // modal, así que afirmarlo sin esperar el cierre daría un falso positivo con el modal todavía
    // abierto (encontrado en esta misma sesión de Pre-QA verificando el screenshot del paso).
    await expect(page.getByRole('heading', { name: /^Cancelar ticket /i })).not.toBeVisible()
    await expect(page.getByText('Motivo de cancelación')).toBeVisible()
    await expect(page.getByText(motivoTexto)).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum290-291-04-cancelado.png' })
  })

  await test.step('5) REQ-227 RN4 — botón Cancelar ticket desaparece en un ticket ya cancelado', async () => {
    await expect(page.getByRole('button', { name: 'Cancelar ticket' })).not.toBeVisible()
  })

  await test.step('6) REQ-227 RN1 — técnico interno no ve el botón Cancelar ticket, pero sí Ver/Imprimir', async () => {
    // Cambiar de usuario a mitad del test: limpiar sesión (cookies + storage) en vez de navegar
    // la UI de logout, que además vive detrás de un menú desplegable no relevante para este caso.
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await login(page, TECNICO_SERVICIOS)
    await openFirstTicketDetail(page)

    await expect(page.getByRole('button', { name: 'Ver/Imprimir' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar ticket' })).not.toBeVisible()
    await page.screenshot({ path: 'test-results/scrum290-291-06-tecnico-sin-cancelar.png' })
  })
})
