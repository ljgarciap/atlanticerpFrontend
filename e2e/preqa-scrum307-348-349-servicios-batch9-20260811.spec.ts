import { test, expect, Page, Locator } from '@playwright/test'

/**
 * Fase 4 — Servicios, Batch 9 (REQ-244/278/279, SCRUM-307/348/349, 2026-08-11).
 * Password default = email. Fixtures locales creadas por Pre-QA en esta sesión (ver
 * docs/pre-qa/ de esta fecha):
 *   T95 = REC-2026-0001 (claim, técnico=Tecnico Servicios Test 2, COMPLETADA por este mismo Pre-QA)
 *   T96 = REC-2026-0002 (claim, técnico=Tecnico Servicios Test, COMPLETADA — sesión anterior)
 *   T97 = REC-2026-0003 (claim, cancelled, COMPLETADA, CON 1 producto — usar para precarga)
 *   T101 = REC-2026-0004 (claim, SIN técnico asignado — usado por Pre-QA para el test de doble
 *          submit concurrente por API, terminó COMPLETADO — no usar para "sin hoja")
 *   T102 = REC-2026-0005 (claim, técnico=Agustín — YA completado por una corrida anterior de este
 *          mismo archivo, no reusar)
 *   T103 = REC-2026-0006 (claim, SIN técnico asignado, SIN hoja — usar para RN4 con Aaron)
 *   T104 = REC-2026-0007 (claim, técnico=Agustín Rodríguez, SIN hoja — solo lectura, RN6 caso Pedro
 *          NO asignado; nunca se completa porque Pedro siempre es rechazado, seguro de reusar)
 *   El caso "RN6 técnico SÍ asignado" se autosiembra un ticket nuevo en cada corrida (ver el test) —
 *   ese sí completa la hoja como efecto secundario permanente, no puede reusar un ID fijo.
 *   T88  = INS-2026-0002 (installation/inspection, técnico=Agustín, informe NO completado — botón blanco)
 *   T89  = INS-2026-0003 (installation/inspection, técnico=Carlos, informe COMPLETADO — botón lleno)
 */
const AARON    = 'liderservicios@test.com'
const PEDRO    = 'tecnicoservicios2@test.com'
const AGUSTIN  = 'tecnicoservicios3@test.com'
const DANIELA  = 'gerencia@test.com'

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

// Ambos modales (ClaimSheetModal e InspectionReportModal) usan el mismo wrapper
// `div.fixed.inset-0.z-[60]` — único en pantalla en cualquier momento dado, sirve para scopear
// selectores y evitar colisión con los <select> de la página de fondo (TicketsPage).
function activeModal(page: Page): Locator {
  return page.locator('div.fixed.inset-0.z-\\[60\\]')
}

test('SCRUM-348 RN1/RN2 — precarga de secciones 1-2 en Hoja de Reclamo (ticket con producto)', async ({ page }) => {
  await login(page, AARON)
  await openTicketByNumero(page, 'REC-2026-0003') // T97, tiene 1 producto, ya completada
  await page.getByRole('button', { name: /Completada/ }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Hoja de Reclamo' })).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum348-precarga.png' })

  // Sección 1 — datos del reclamante, auto-precargados del ticket
  await expect(modal.getByText('Super 99', { exact: false }).first()).toBeVisible()
  // Sección 2 — producto reclamado, auto-precargado de ticket_products
  await expect(modal.getByText('Philips', { exact: false })).toBeVisible()
  await expect(modal.getByText('LED-2026', { exact: false })).toBeVisible()
  await expect(modal.getByText(/Cant\. reclamo.*10/)).toBeVisible()

  // RN5 — ya completada, campos de captura bloqueados sin excepción de rol (Aaron = superadmin)
  await expect(modal.getByText('Esta Hoja de Reclamo ya fue completada y no puede editarse.')).toBeVisible()
  await expect(modal.getByLabel('Diagnóstico')).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Guardar Hoja de Reclamo' })).toHaveCount(0)
})

test('SCRUM-348 RN4 — diagnóstico y firma ambos obligatorios, botón Guardar deshabilitado hasta llenar ambos', async ({ page }) => {
  await login(page, AARON)
  await openTicketByNumero(page, 'REC-2026-0006') // T103, sin técnico, sin hoja
  await page.getByRole('button', { name: 'Generar Hoja de Reclamo' }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Hoja de Reclamo' })).toBeVisible()

  const saveBtn = modal.getByRole('button', { name: 'Guardar Hoja de Reclamo' })
  const firmaInput = modal.getByPlaceholder('Pendiente de firma')
  const diagnosticoSelect = modal.getByLabel('Diagnóstico')
  await expect(saveBtn).toBeDisabled()

  // Solo firma
  await firmaInput.fill('Aaron Ceballos')
  await expect(saveBtn).toBeDisabled()

  // Firma con solo espacios en blanco — canSave usa .trim(), debe seguir deshabilitado
  await firmaInput.fill('   ')
  await expect(saveBtn).toBeDisabled()
  await firmaInput.fill('')

  // Solo diagnóstico
  await diagnosticoSelect.selectOption('defectuoso')
  await expect(saveBtn).toBeDisabled()

  // Ambos llenos — recién ahí se habilita
  await firmaInput.fill('Aaron Ceballos')
  await expect(saveBtn).toBeEnabled()
  await page.screenshot({ path: 'test-results/scrum348-rn4-boton-habilitado.png' })
})

test('SCRUM-348 RN6 — técnico NO asignado ve el form bloqueado (no solo el botón escondido)', async ({ page }) => {
  await login(page, PEDRO) // Pedro NO está asignado a T104 (asignado a Agustín)
  await openTicketByNumero(page, 'REC-2026-0007')
  await page.getByRole('button', { name: 'Generar Hoja de Reclamo' }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Hoja de Reclamo' })).toBeVisible()

  // canEdit=false → isLocked=true → TODOS los campos de captura deshabilitados, no solo el botón
  await expect(modal.getByLabel('Diagnóstico')).toBeDisabled()
  await expect(modal.getByPlaceholder('Pendiente de firma')).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Guardar Hoja de Reclamo' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum348-rn6-tecnico-no-asignado-bloqueado.png' })
})

test('SCRUM-348 RN6 — técnico SÍ asignado puede editar y completar', async ({ page }) => {
  // Este test SÍ completa la hoja (efecto secundario permanente, RN5 la deja en solo lectura para
  // siempre) — autosembrado con un ticket nuevo en cada corrida en vez de un ID fijo, mismo
  // criterio que el resto de los tests e2e "permanentes" del repo (ver
  // feedback_e2e_permanent_tests_must_self_seed.md) para que la re-corrida no choque con el
  // estado dejado por la corrida anterior.
  const superLogin = await page.request.post('/api/auth/login', {
    data: { email: 'superadmin2@test.com', password: 'superadmin2@test.com' },
  })
  const { token: superToken } = await superLogin.json()

  const created = await page.request.post('/api/servicios/tickets', {
    headers: { Authorization: `Bearer ${superToken}` },
    data: {
      tipo: 'claim', tipo_instalacion: 'internal', sales_project_id: 27,
      descripcion: 'e2e self-seed RN6 asignado', requerimientos_especiales: { catalog: [], otros: [] },
    },
  })
  const ticket = await created.json()

  await page.request.patch(`/api/servicios/tickets/${ticket.id}/agendar`, {
    headers: { Authorization: `Bearer ${superToken}` },
    data: { internal_technician_id: 20, scheduled_at: '2026-08-12T09:00:00-05:00', scheduled_ends_at: '2026-08-12T11:00:00-05:00' },
  })

  await login(page, AGUSTIN) // Agustín (user id 20) SÍ está asignado al ticket recién creado
  await openTicketByNumero(page, ticket.numero)
  await page.getByRole('button', { name: 'Generar Hoja de Reclamo' }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Hoja de Reclamo' })).toBeVisible()
  await expect(modal.getByLabel('Diagnóstico')).toBeEnabled()

  await modal.getByLabel('Diagnóstico').selectOption('no_procede')
  await modal.getByPlaceholder('Pendiente de firma').fill('Agustín Rodríguez')
  const saveBtn = modal.getByRole('button', { name: 'Guardar Hoja de Reclamo' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await expect(modal).toHaveCount(0, { timeout: 10000 })
})

test('SCRUM-349 RN3 — hoja completada: cualquier rol con acceso puede Ver/Imprimir aunque no pueda editar', async ({ page }) => {
  // Daniela (management) no puede editar Hoja de Reclamo (route role gate la bloquea), pero
  // servicios.read sí le da acceso de lectura/impresión — confirmar que el botón Ver/Imprimir
  // aparece y funciona una vez la hoja (T96, Carlos) ya está completada.
  await login(page, DANIELA)
  await openTicketByNumero(page, 'REC-2026-0002') // T96, completada
  await page.getByRole('button', { name: /Completada/ }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Hoja de Reclamo' })).toBeVisible()

  const printBtn = modal.getByRole('button', { name: 'Ver / Imprimir' })
  await expect(printBtn).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await printBtn.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('Hoja-Reclamo')
})

test('SCRUM-307 RN2/RN3 — botón cambia de plantilla en blanco a informe lleno según estado del Informe de Inspección', async ({ page }) => {
  await login(page, AARON)

  // T88 — informe NO completado todavía → botón ofrece plantilla en blanco
  await openTicketByNumero(page, 'INS-2026-0002')
  await page.getByRole('button', { name: /Generar informe|Completado/ }).last().click()
  let modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Informe de Inspección' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Ver plantilla en blanco' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Ver / Imprimir' })).toHaveCount(0)
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click()

  // T89 — informe YA completado → botón cambia a informe lleno, la plantilla en blanco desaparece
  await openTicketByNumero(page, 'INS-2026-0003')
  await page.getByRole('button', { name: /Generar informe|Completado/ }).last().click()
  modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Informe de Inspección' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Ver / Imprimir' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Ver plantilla en blanco' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum307-rn3-boton-lleno.png' })
})

test('SCRUM-307 permisos — rol fuera del roster de pdf/blank: el botón NO se muestra (frontend gatea por rol, no solo el backend)', async ({ page }) => {
  await login(page, DANIELA) // management, no está en el roster route-level de pdf/blank
  await openTicketByNumero(page, 'INS-2026-0002') // sin informe completado todavía
  await page.getByRole('button', { name: /Generar informe|Completado/ }).last().click()
  const modal = activeModal(page)
  await expect(modal.getByRole('heading', { name: 'Informe de Inspección' })).toBeVisible()
  // Esperar a que carguen fields/existing antes de evaluar — de lo contrario el chequeo cae en la
  // ventana de loading transitoria y da un falso negativo.
  await expect(modal.getByText('Checklist técnico')).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum307-permisos-management-boton.png' })
  await expect(modal.getByRole('button', { name: 'Ver plantilla en blanco' })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Ver / Imprimir' })).toHaveCount(0)
})
