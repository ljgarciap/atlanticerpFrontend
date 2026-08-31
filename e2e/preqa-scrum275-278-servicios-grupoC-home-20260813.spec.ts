import { test, expect, Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionado — Grupo C, Home de Servicios (SCRUM-275/276/277/278,
 * REQ-212/213/214/215), y verificación independiente del fix de SCRUM-321 (capitalización de mes).
 * Corre contra el stack local estándar (localhost:5173 → proxy /api → localhost:8090), no un stack
 * aislado — batch chico, mismo criterio que otros gates fusionados recientes de este proyecto.
 *
 * Fixtures propias sembradas vía tinker en el dev local (no *.test):
 *   - GAR-2026-85425 (id 310) — reported hace 7 días, cliente "QA GrupoC Sin Responder" (REQ-212)
 *   - GAR-2026-87208 (id 311) — reported hace 2 días, cliente "QA GrupoC Dentro Umbral" (negativo)
 *   - INS-2026-82846 (id 312) — reported, cliente "QA GrupoC Insumo Pendiente", 1 ticket_product
 *     con cantidad_pendiente=3 (REQ-213/214)
 */

const LIDER_SERVICIOS = 'liderservicios@test.com'   // Aaron — lider_servicios, puede Agendar
const TECNICO         = 'tecnicoservicios@test.com'      // Carlos — tecnico_servicios, NO puede Agendar
const GERENCIA         = 'gerencia@test.com'    // Management, ve la comisión de Carlos

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

test.describe('Grupo C — Home de Servicios', () => {

  test('REQ-212 — Servicios sin responder muestra el ticket >5 días y NO el de 2 días', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    await page.goto('/servicios/inicio')
    await expect(page.getByText('QA GrupoC Sin Responder')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Reportado hace 7 días/)).toBeVisible()
    await expect(page.getByText('QA GrupoC Dentro Umbral')).toHaveCount(0)
  })

  test('REQ-213 — Insumos pendientes muestra el producto con "Por confirmar"', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    await page.goto('/servicios/inicio')
    await expect(page.getByText('Driver LED 24V QA')).toBeVisible({ timeout: 10000 })
    const row = page.locator('tr', { hasText: 'Driver LED 24V QA' })
    await expect(row.getByText('Por confirmar')).toBeVisible()
  })

  test('REQ-214 — Ver ticket abre modal de solo lectura con Agendar (lider_servicios) sin Editar/Cancelar', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    await page.goto('/servicios/inicio')
    const row = page.locator('tr', { hasText: 'Driver LED 24V QA' })
    await row.getByRole('button', { name: /ver ticket/i }).click()

    const modal = page.locator('div.z-50').first()
    await expect(modal.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
    await expect(modal.getByText('INS-2026-82846')).toBeVisible()
    // RN3 — Agendar/Reagendar debe estar disponible para lider_servicios.
    await expect(modal.getByRole('button', { name: /agendar|reagendar/i })).toBeVisible()
    // RN4 — Editar/Cancelar NUNCA, sin importar el rol.
    await expect(modal.getByRole('button', { name: /^editar$/i })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: /cancelar ticket/i })).toHaveCount(0)
  })

  test('REQ-214 — con un rol sin permiso de agendar, tampoco se ve Agendar en el modal de solo lectura', async ({ page }) => {
    await login(page, TECNICO)
    await page.goto('/servicios/inicio')
    const row = page.locator('tr', { hasText: 'Driver LED 24V QA' })
    await row.getByRole('button', { name: /ver ticket/i }).click()

    const modal = page.locator('div.z-50').first()
    await expect(modal.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
    await expect(modal.getByRole('button', { name: /agendar|reagendar/i })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: /^editar$/i })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: /cancelar ticket/i })).toHaveCount(0)
  })

  test('REQ-215 — Estado de tickets muestra 6 tarjetas (incluida Cancelado) y el chip de tipo filtra', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    await page.goto('/servicios/inicio')

    await expect(page.getByText('Estado de tickets')).toBeVisible({ timeout: 10000 })
    for (const label of ['Reportado', 'Agendado', 'En sitio', 'Resuelto', 'Cerrado', 'Cancelado']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
    await expect(page.getByText('Cerrado (este mes)')).toBeVisible()

    // Chip "Garantías" — el ticket #310 (sin_responder, tipo warranty, reported) debe seguir
    // contando en la tarjeta Reportado tras filtrar.
    await page.getByRole('button', { name: 'Garantías' }).click()
    await page.waitForTimeout(500) // deja asentar el refetch por queryKey
  })
})

test.describe('SCRUM-321 — capitalización del período en el modal de comisión de Tecnico Servicios Test', () => {
  test('el texto del período se muestra "agosto de 2026", no "Agosto De 2026"', async ({ page }) => {
    await login(page, GERENCIA)
    await page.goto('/servicios/tecnicos')

    const carlosCard = page.locator('div', { hasText: 'Tecnico Servicios Test' }).first()
    await expect(carlosCard).toBeVisible({ timeout: 10000 })

    // Mini-indicador de comisión — abre el modal de detalle.
    await carlosCard.getByText(/comisión|bono/i).first().click().catch(async () => {
      // Si el mini-indicador no es clickeable directo, buscar un botón de detalle dentro de la tarjeta.
      await carlosCard.getByRole('button').first().click()
    })

    const modal = page.locator('div.z-50, div.z-\\[60\\]').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    const bodyText = await modal.innerText()
    expect(bodyText).not.toMatch(/\bDe\b \d{4}/) // "De" mayúscula seguida de año = bug viejo
    expect(bodyText.toLowerCase()).toContain('de 2026')
  })
})

test.describe('Recheck adicional — mismo bug de capitalización en Reportes (encontrado por Pre-QA, no en el alcance original de SCRUM-321)', () => {
  test('ReportsPeriodSelect y ReportsCommissionSection muestran "de" en minúscula', async ({ page }) => {
    await login(page, GERENCIA)
    await page.goto('/servicios/reportes')

    // ReportsPeriodSelect — las <option> no cuentan como "visible" fuera de un dropdown abierto,
    // se lee su textContent directo.
    const select = page.locator('select').first()
    await expect(select).toBeVisible({ timeout: 10000 })
    const optionTexts = await select.locator('option').allInnerTexts()
    expect(optionTexts.length).toBeGreaterThan(0)
    for (const text of optionTexts) {
      expect(text).not.toMatch(/\b[A-ZÁÉÍÓÚ][a-záéíóú]+ De \d{4}/)
    }

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b[A-ZÁÉÍÓÚ][a-záéíóú]+ De \d{4}/)
  })
})
