import { test, expect, Page } from '@playwright/test'

/**
 * Fase 4 — Servicios, Batch 8 (Informe de Inspección, REQ-238→243, SCRUM-301→306).
 * Password default = email (BusinessRoleUserSeeder). Fixtures locales usadas (ver
 * memory/project_sesion_20260810_batch8_informe_inspeccion.md y docs/pre-qa/ de esta sesión):
 *   T82 = INS-2026-0001 (installation, SIN técnico asignado)
 *   T84 = INS-2026-0003 (installation/inspection, técnico=Tecnico Servicios Test)
 *   T86 = GAR-2026-0001 (warranty_generic, técnico=Garantias Servicios Test, 1 producto asociado)
 *   T93 = RET-2026-0001 (retrofit, técnico=Tecnico Servicios Test 2, 1 producto asociado)
 *   T94 = RET-2026-0002 (retrofit, técnico=Tecnico Servicios Test, SIN producto)
 */
const AARON   = 'liderservicios@test.com'
const MIGUEL  = 'garantiasservicios@test.com'
const CARLOS  = 'tecnicoservicios@test.com'
const DANIELA = 'gerencia@test.com'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function openTicketByNumero(page: Page, numero: string) {
  await page.goto('/servicios/tickets')
  await page.getByPlaceholder('Buscar por N° ticket, cliente o técnico').fill(numero)
  const row = page.locator('tr', { hasText: numero })
  await expect(row).toBeVisible()
  await row.getByTitle('Ver detalle').click()
  await expect(page.getByRole('heading', { name: `Ticket ${numero}` })).toBeVisible()
}

async function openInspectionReport(page: Page) {
  // El indicador "Generar informe"/"Completado" aparece 2 veces (columna de la tabla + dentro del
  // modal de detalle recién abierto) — el del modal es siempre el último en el DOM.
  await page.getByRole('button', { name: /Generar informe|Completado/ }).last().click()
  await expect(page.getByRole('heading', { name: 'Informe de Inspección' })).toBeVisible()
}

test('SCRUM-301 — RN4 precarga de técnico responsable en informe NUEVO', async ({ page }) => {
  await login(page, AARON)
  await openTicketByNumero(page, 'GAR-2026-0001') // T86, técnico ya asignado = Garantias Servicios Test
  await openInspectionReport(page)
  await page.screenshot({ path: 'test-results/scrum301-precarga-tecnico.png' })

  const tecnicoSelect = page.getByRole('combobox', { name: 'Técnico responsable' })
  await expect(tecnicoSelect).toHaveValue(/.+/)
  const selectedLabel = await tecnicoSelect.locator('option:checked').textContent()
  expect(selectedLabel).toContain('Garantias Servicios Test')

  // RN1/RN2 SCRUM-302 — con producto asociado en Garantías (no Retrofit): Diagnóstico + Observación específica.
  await expect(page.getByText('Diagnóstico', { exact: true })).toBeVisible()
  await expect(page.getByText('Observación específica')).toBeVisible()
})

test('SCRUM-302 — campos dinámicos cambian correctamente entre tickets sin quedar pegados', async ({ page }) => {
  await login(page, AARON)

  await openTicketByNumero(page, 'INS-2026-0003') // T84 installation/inspection, sin producto
  await openInspectionReport(page)
  await expect(page.getByText('Checklist técnico')).toBeVisible()
  await expect(page.getByText('Recomendación para cotización')).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()

  await openTicketByNumero(page, 'RET-2026-0001') // T93 retrofit CON producto
  await openInspectionReport(page)
  await expect(page.getByText('Estado actual del producto')).toBeVisible()
  await expect(page.getByText('Observación técnica')).toBeVisible()
  // Confirmar que NO quedaron pegados los campos del ticket anterior (installation)
  await expect(page.getByText('Checklist técnico')).not.toBeVisible()
  await page.screenshot({ path: 'test-results/scrum302-campos-no-pegados.png' })
})

test('SCRUM-304 — conclusión vacía bloquea el guardado', async ({ page }) => {
  await login(page, CARLOS)
  await openTicketByNumero(page, 'RET-2026-0002') // T94, técnico=Carlos, sin informe todavía
  await openInspectionReport(page)

  const saveBtn = page.getByRole('button', { name: 'Guardar informe' })
  await expect(saveBtn).toBeDisabled()

  await page.getByLabel('Conclusión').fill('   ') // solo espacios
  await expect(saveBtn).toBeDisabled()

  await page.getByLabel('Conclusión').fill('Conclusión real de Carlos para T94')
  await expect(saveBtn).toBeEnabled()
  await page.screenshot({ path: 'test-results/scrum304-conclusion-required.png' })
})

test('SCRUM-306 — modo alternativo Súbelo aquí oculta el formulario', async ({ page }) => {
  await login(page, CARLOS)
  await openTicketByNumero(page, 'RET-2026-0002') // T94
  await openInspectionReport(page)

  await expect(page.getByText('Hallazgos de la inspección')).toBeVisible()
  await page.getByText('¿Ya tienes el informe? Súbelo aquí').click()

  await expect(page.getByText('Subir informe existente')).toBeVisible()
  await expect(page.getByText('Hallazgos de la inspección')).not.toBeVisible()
  await expect(page.getByText('Materiales / insumos utilizados')).not.toBeVisible()
  await expect(page.getByText('+ Adjuntar archivo (PDF o imagen)')).toBeVisible()
  await expect(page.getByLabel('Firma del técnico responsable')).toBeVisible()
  await expect(page.getByLabel('Firma / acuse de recibido del cliente')).toBeVisible()

  // Sin archivo adjunto todavía -> no debería poder guardar en este modo
  await expect(page.getByRole('button', { name: 'Guardar informe' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/scrum306-modo-archivo.png' })
})

test('SCRUM-241/242 — Fotos Antes/Después separadas y firma Pendiente de firma en vista de solo lectura', async ({ page }) => {
  await login(page, DANIELA) // Gerencia — solo lectura
  await openTicketByNumero(page, 'INS-2026-0003') // T84 ya tiene informe completado (via curl), firmas vacías
  await openInspectionReport(page)

  await expect(page.getByText('Fotos — Antes')).toBeVisible()
  await expect(page.getByText('Fotos — Después')).toBeVisible()

  // Gerencia solo lectura: sin botón Guardar
  await expect(page.getByRole('button', { name: 'Guardar informe' })).toHaveCount(0)

  const firmaTecnico = page.getByLabel('Firma del técnico responsable')
  const firmaCliente = page.getByLabel('Firma / acuse de recibido del cliente')
  await expect(firmaTecnico).toHaveAttribute('placeholder', 'Pendiente de firma')
  await expect(firmaCliente).toHaveAttribute('placeholder', 'Pendiente de firma')
  await expect(firmaTecnico).toBeDisabled()
  await page.screenshot({ path: 'test-results/scrum241-242-readonly-gerencia.png' })
})

test('SCRUM-301 RN5 — Carlos no puede editar el informe de un ticket sin asignar (ownership UI)', async ({ page }) => {
  await login(page, CARLOS)
  await openTicketByNumero(page, 'INS-2026-0001') // T82, sin técnico asignado
  await openInspectionReport(page)

  // canEdit=false: sin botón "Guardar informe", inputs deshabilitados, sin toggle de modo
  await expect(page.getByRole('button', { name: 'Guardar informe' })).toHaveCount(0)
  await expect(page.getByText('¿Ya tienes el informe? Súbelo aquí')).toHaveCount(0)
  const fechaInput = page.getByLabel('Fecha de inspección')
  await expect(fechaInput).toBeDisabled()
  await page.screenshot({ path: 'test-results/scrum301-carlos-denegado-ui.png' })
})

test('SCRUM-301 — refrescar la página a mitad del formulario no rompe nada', async ({ page }) => {
  await login(page, AARON)
  await openTicketByNumero(page, 'RET-2026-0001') // T93
  await openInspectionReport(page)
  await page.getByLabel('Conclusión').fill('Texto que se va a perder con el refresh')
  await page.reload()
  await openTicketByNumero(page, 'RET-2026-0001')
  // No debe crashear ni dejar el ticket en un estado raro — el detalle carga normal
  await expect(page.getByRole('heading', { name: 'Ticket RET-2026-0001' })).toBeVisible()
})
