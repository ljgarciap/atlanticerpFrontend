import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — Fase 4 Servicios, Batch 5 (SCRUM-333/334/335/336/337, REQ-263→267) — Técnicos
 * externos. Corre contra el stack local (Vite dev server proxy a nginx:8090, ver
 * vite.config.ts), no dev.atlanticerp.ai — este batch todavía no se pusheó.
 *
 * Promovido a permanente (regla del proyecto: un gate que ya se rompió una vez no se descarta) —
 * cubre el hallazgo real de Pre-QA: GET /external-technicians/{id} devolvía `especialidad: null`
 * en vez de "Sin especificar" (REQ-264 RN1), inconsistente con el resto de los endpoints del
 * mismo batch (fix: ExternalTechnicianController::show(), línea 75). Ver
 * docs/pre-qa/scrum333-337-servicios-batch5-tecnicos-externos-20260809.md.
 *
 * Nombre único por corrida (Date.now()) — self-seeding sin colisión entre corridas repetidas,
 * ver feedback_e2e_permanent_tests_must_self_seed.md (no hay constraint de unicidad de negocio
 * sobre `nombre`, así que reusar un literal fijo entre corridas duplica filas y rompe selectores
 * estrictos de Playwright).
 *
 * Cuentas reales (password = email):
 *  - liderservicios@test.com (lider_servicios) — alta completa.
 *  - tecnicoservicios@test.com   (tecnico_servicios) — solo consulta (RN5).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const TECH_NAME = `E2E PreQA ${Date.now()}`

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function gotoExternalTechnicians(page: Page) {
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
}

async function searchAndOpenFicha(page: Page) {
  const search = page.getByPlaceholder('Buscar por nombre...')
  await search.fill(TECH_NAME)
  await page.waitForTimeout(800)
  await page.getByLabel('Ver ficha').first().click()
  const detail = page.getByTestId('external-technician-detail-modal')
  await expect(detail).toBeVisible()
  return detail
}

test('REQ-264 RN1 — especialidad vacía muestra "Sin especificar" en la ficha, no en blanco', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoExternalTechnicians(page)

  await page.getByText('+ Agregar técnico externo').click()
  const modal = page.getByTestId('external-technician-create-modal')
  const textboxes = modal.getByRole('textbox')
  await textboxes.nth(0).fill(TECH_NAME)
  await textboxes.nth(1).fill('E2E Co')
  await modal.getByRole('spinbutton').fill('37')
  await modal.getByText('Guardar').click()

  const detail = page.getByTestId('external-technician-detail-modal')
  await expect(detail).toBeVisible({ timeout: 5000 })
  await expect(detail.getByText('Sin especificar')).toBeVisible()
})

test('REQ-263 RN4 — buscador + chip de estado se combinan', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoExternalTechnicians(page)

  const search = page.getByPlaceholder('Buscar por nombre...')
  await search.fill(TECH_NAME)
  await page.waitForTimeout(800)
  await expect(page.getByText(TECH_NAME)).toBeVisible()

  await page.getByText(/^Inactivos/).click()
  await page.waitForTimeout(800)
  await expect(page.getByText(TECH_NAME)).not.toBeVisible()
})

test('REQ-266 — editar tarifa acumula historial; ocultar tarifa muestra "Sin tarifa asignada" sin nueva entrada', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoExternalTechnicians(page)
  const detail = await searchAndOpenFicha(page)

  const tarifaAmount = detail.getByText('$37.00', { exact: true }).first()
  await expect(tarifaAmount).toBeVisible()

  await tarifaAmount.locator('xpath=following-sibling::button').click()
  const tarifaInput = detail.locator('input[type="number"]').first()
  await tarifaInput.fill('42')
  await detail.getByText('Guardar').click()
  await page.waitForTimeout(800)
  await expect(detail.getByText('$42.00', { exact: true }).first()).toBeVisible()

  await detail.getByRole('switch').click()
  await page.waitForTimeout(800)
  await expect(detail.getByText('Sin tarifa asignada')).toBeVisible()

  const historyItems = detail.locator('ul li')
  await expect(historyItems).toHaveCount(2)
})

test('REQ-267 RN3 — sin proyectos asignados muestra el mensaje de estado vacío', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoExternalTechnicians(page)
  const detail = await searchAndOpenFicha(page)

  await expect(detail.getByText('Aún no tiene proyectos asignados')).toBeVisible()
})

test('REQ-265 Escenario 2 — inactivar sin proyectos activos aplica directo, sin advertencia', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await gotoExternalTechnicians(page)
  const detail = await searchAndOpenFicha(page)

  await detail.getByText('Inactivar').click()
  await page.waitForTimeout(800)
  await expect(detail.getByText('¿de todas formas quieres inactivarlo?')).not.toBeVisible()
  await expect(detail.getByText('Reactivar')).toBeVisible()
})

test('RN5 (REQ-263/264/265/266) — técnico interno tiene acceso de solo consulta, sin controles de escritura', async ({ page }) => {
  await login(page, 'tecnicoservicios@test.com')
  await gotoExternalTechnicians(page)

  await expect(page.getByText('+ Agregar técnico externo')).not.toBeVisible()

  const detail = await searchAndOpenFicha(page)
  await expect(detail.getByRole('switch')).not.toBeVisible()
  await expect(detail.getByText('Inactivar')).not.toBeVisible()
  await expect(detail.getByText('Reactivar')).not.toBeVisible()
})
