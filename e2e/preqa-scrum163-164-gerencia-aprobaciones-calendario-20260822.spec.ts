import { test, expect, Page } from '@playwright/test'

// Pre-QA + Visual Review (fusionado) — SCRUM-163 (REQ-101, infraestructura configurable de
// REGLA_APROBACION) y SCRUM-164 (REQ-102, Mi calendario con Outlook), Gerencia. Contra el stack
// local (dev, sin pushear todavía). Cuentas reales del roster (ver
// project_roster_usuarios_reales_atlanticerp) — password = email, mismo criterio usado en local que en
// dev/test.atlanticerp.ai.

test.describe.configure({ mode: 'serial' })

const SUPERADMIN = 'andres.loi@illuminations.com.pa'
const MANAGEMENT_NO_SUPERADMIN = 'daniela@illuminations.com.pa'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

// ── SCRUM-164 — Mi calendario ────────────────────────────────────────────────────────────────

test('SCRUM-164 — Mi calendario ya no muestra el placeholder "Sincronización pendiente"', async ({ page }) => {
  await login(page, SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)

  await expect(page.getByText('Sincronización pendiente')).toHaveCount(0)
  await expect(page.getByText('Mi calendario')).toBeVisible()
})

test('SCRUM-164 — pill Día/Semana/Mes cambia el rango sin romper la pantalla', async ({ page }) => {
  await login(page, SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(1000)

  for (const label of ['Semana', 'Mes', 'Día']) {
    const reqPromise = page.waitForResponse(r => r.url().includes('/api/gerencia/calendar'), { timeout: 5000 }).catch(() => null)
    await page.getByRole('button', { name: label, exact: true }).click()
    await reqPromise
    await page.waitForTimeout(300)
  }
  // Si algo rompiera el render, esto ya habría lanzado un error de Playwright antes de acá.
  await expect(page.getByText('Mi calendario')).toBeVisible()
})

test('SCRUM-164 RN1 — el pedido a /gerencia/calendar nunca manda scope=team ni owner_id', async ({ page }) => {
  await login(page, SUPERADMIN)

  const reqPromise = page.waitForRequest(r => r.url().includes('/api/gerencia/calendar'), { timeout: 8000 })
  await page.goto('/gerencia')
  const req = await reqPromise
  const url = new URL(req.url())

  expect(url.searchParams.has('scope')).toBe(false)
  expect(url.searchParams.has('owner_id')).toBe(false)
})

test('SCRUM-164 — "Ver calendario completo" abre el modal', async ({ page }) => {
  await login(page, SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Ver calendario completo' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible()
})

// ── SCRUM-163 — Configurar reglas de aprobación ──────────────────────────────────────────────

test('SCRUM-163 — superadmin ve el botón "Configurar"', async ({ page }) => {
  await login(page, SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(1000)
  await expect(page.getByRole('button', { name: 'Configurar' })).toBeVisible()
})

test('SCRUM-163 — Gerencia no-superadmin NO ve el botón "Configurar"', async ({ page }) => {
  await login(page, MANAGEMENT_NO_SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(1000)
  await expect(page.getByRole('button', { name: 'Configurar' })).toHaveCount(0)
})

test('SCRUM-163 RBAC negativo — forjar el endpoint directo devuelve 403 para no-superadmin', async ({ page }) => {
  await login(page, MANAGEMENT_NO_SUPERADMIN)
  await page.goto('/gerencia')
  await page.waitForTimeout(800)

  const status = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/reglas-aprobacion', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return res.status
  })

  expect(status).toBe(403)
})

test('SCRUM-163 — crear, editar, y eliminar una regla desde el panel', async ({ page }) => {
  await login(page, SUPERADMIN)

  // Limpieza defensiva: intentos previos fallidos de este mismo spec pueden haber dejado filas
  // "PREQA —" sueltas en la base local — se borran antes de arrancar para que los locators por
  // texto exacto de abajo no queden ambiguos entre corridas.
  await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const headers = { Authorization: `Bearer ${token}` }
    const res = await fetch('/api/gerencia/reglas-aprobacion', { headers })
    const { data } = await res.json()
    for (const r of data as { id: number; tipo: string }[]) {
      if (r.tipo.startsWith('PREQA —')) {
        await fetch(`/api/gerencia/reglas-aprobacion/${r.id}`, { method: 'DELETE', headers })
      }
    }
  })

  const tipoUnico = `PREQA — Gasto no presupuestado ${Date.now()}`

  await page.goto('/gerencia')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Configurar' }).click()
  await page.waitForTimeout(500)

  const modal = page.locator('div.fixed.inset-0.z-50')

  // Escenario de ruptura primero: guardar sin tipo ni aprobador.
  await modal.getByRole('button', { name: /Nueva regla/i }).click()
  await modal.getByRole('button', { name: 'Guardar' }).click()
  await expect(modal.getByText('El tipo de solicitud es obligatorio.')).toBeVisible()

  const tipoInput = modal.locator('input[placeholder*="Orden de compra"]')
  await tipoInput.fill(tipoUnico)
  await modal.getByRole('button', { name: 'Guardar' }).click()
  await expect(modal.getByText('Elegí al menos un aprobador.')).toBeVisible()

  // Elegir el primer aprobador disponible — el contenedor de chips es el hermano
  // inmediato del <label> "Aprobadores".
  await modal.locator('label', { hasText: 'Aprobadores' })
    .locator('xpath=following-sibling::div[1]')
    .locator('button').first().click()
  await modal.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(800)

  await expect(modal.getByText(tipoUnico, { exact: true })).toBeVisible()

  // Editar — texto EXACTO como ancla, sube al contenedor de la fila (border-b) más cercano.
  const tipoEditado = `${tipoUnico} (editado)`
  const row = modal.getByText(tipoUnico, { exact: true }).locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
  await row.getByRole('button').first().click() // lápiz de editar
  await page.waitForTimeout(300)
  await tipoInput.fill(tipoEditado)
  await modal.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(800)
  await expect(modal.getByText(tipoEditado, { exact: true })).toBeVisible()

  // Eliminar (con confirm() nativo).
  page.once('dialog', d => d.accept())
  const editedRow = modal.getByText(tipoEditado, { exact: true }).locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
  await editedRow.getByRole('button', { name: 'Eliminar' }).click()
  await page.waitForTimeout(800)
  await expect(modal.getByText(tipoEditado, { exact: true })).toHaveCount(0)
})
