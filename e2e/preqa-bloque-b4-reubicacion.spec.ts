import { test, expect, Page } from '@playwright/test'

// Pre-QA 2026-07-24/25 — Bloque B4 "Reubicación entre bodegas" (SCRUM-454/457/458/459).
// Corre contra playwright.config.ts estándar del repo (dev server npm run dev, baseURL :5173,
// que proxea /api a http://localhost:8090 — ver vite.config.ts).
// Fixtures sembradas manualmente vía tinker en la sesión original (producto PREQA-B4-001, id 346):
//   - Bodega Central (id 6): stock, ubicacion PREQA-A1 (ocupada) + PREQA-A2-LIBRE (vacia)
//   - Showroom Obarrio (id 8): stock, ubicacion PREQA-B1-OCC (ocupada, = todas las locations)
//   - Merma (id 11): sin ninguna WarehouseLocation (empty-state genuino)
// Si estos IDs/ubicaciones no existen en el entorno donde se re-corre este test, hay que
// re-sembrarlos (ver docs/pre-qa/bloque-b4-reubicacion-2026-07-24.md en atlanticerp-backend).
// Backend ya verificado por curl directo (RN1/RN2/gate Mark/concurrencia/doble-resolucion) —
// este spec cubre SOLO comportamiento de UI que curl no puede: chips, reset de filtro, reload
// a mitad de flujo, doble clic (promovido a permanente tras encontrar y corregir un bug real de
// doble-submit en RelocateModal — ver commit que agrega `submittingRef`).
// Requiere el mock_approver_user_id de ComprasSettings configurado y al menos 1 solicitud
// "pendiente" para el test de "rechazar sin motivo" — si no hay ninguna pendiente, ese test
// no ejercita el camino de ruptura (queda documentado como condición, no falla en falso).

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function openWarehouse(page: Page, name: string) {
  await page.goto('/bodega/bodegas')
  await page.waitForTimeout(1000)
  await page.getByText(name, { exact: true }).first().click()
  await page.waitForTimeout(1000)
}

test.describe('Bloque B4 — chip Espacio libre (REQ-384)', () => {
  test('exclusivo con Todos + solo muestra ubicaciones vacias de la bodega actual', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')

    await page.getByRole('button', { name: 'Espacio libre', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText('PREQA-A2-LIBRE')
    await expect(page.locator('body')).not.toContainText('PREQA-A1')
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-espacio-libre-central.png' })

    // Exclusividad: activar "Todos" apaga "Espacio libre"
    await page.getByRole('button', { name: 'Todos', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText('PREQA-A1')
  })

  test('bodega con TODAS las ubicaciones ocupadas: lista vacia con estado claro, no rota', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Showroom Obarrio')

    await page.getByRole('button', { name: 'Espacio libre', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText(/no hay espacio libre disponible/i)
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-espacio-libre-todas-ocupadas.png' })
  })

  test('bodega SIN ninguna ubicacion registrada: estado vacio claro, no rota ni queda en blanco', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Merma')

    await page.getByRole('button', { name: 'Espacio libre', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText(/no hay espacio libre disponible/i)
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-espacio-libre-sin-ubicaciones.png' })
  })
})

test.describe('Bloque B4 — modal Reubicar (SCRUM-457)', () => {
  test('RN1: selector de destino excluye la bodega actual (Bodega Central)', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    await page.getByText('PREQA-B4-001').first().click({ trial: true }).catch(() => {})
    const row = page.locator('tr', { hasText: 'PREQA-B4-001' }).first()
    await row.getByText('Reubicar', { exact: true }).click()
    await page.waitForTimeout(500)

    const select = page.locator('select')
    const options = await select.locator('option').allTextContents()
    expect(options.join('|')).not.toContain('Bodega Central')
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-modal-reubicar-destino.png' })
  })

  test('RN2: enviar vacio no llama al backend, muestra validacion cliente', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    const row = page.locator('tr', { hasText: 'PREQA-B4-001' }).first()
    await row.getByText('Reubicar', { exact: true }).click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Solicitar reubicación' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toContainText(/cantidad válida/i)
  })

  test('reload a mitad de flujo: modal parcialmente lleno, recargar no deja estado raro', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    const row = page.locator('tr', { hasText: 'PREQA-B4-001' }).first()
    await row.getByText('Reubicar', { exact: true }).click()
    await page.waitForTimeout(500)
    await page.locator('input[type="number"]').first().fill('3')
    await page.locator('textarea').fill('reload mid flow test')

    await page.reload()
    await page.waitForTimeout(1200)

    // El modal no debe seguir abierto (se desmonta con la navegacion), y la pagina debe cargar
    // normalmente sin loading infinito ni pantalla en blanco.
    await expect(page.locator('text=Reubicar producto')).toHaveCount(0)
    await expect(page.locator('body')).toContainText('Bodega Central')
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-reload-mid-flow.png' })
  })

  test('doble clic rapido en Solicitar reubicacion no crea 2 solicitudes', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    const row = page.locator('tr', { hasText: 'PREQA-B4-001' }).first()
    await row.getByText('Reubicar', { exact: true }).click()
    await page.waitForTimeout(500)

    const motivoUnico = `doble-clic-${Date.now()}`
    const modal = page.locator('.fixed.inset-0.z-50')
    await modal.locator('select').selectOption({ label: 'Showroom SM' })
    await modal.locator('input[type="number"]').first().fill('1')
    await modal.locator('textarea').fill(motivoUnico)

    // Dos clics disparados en el mismo tick de evento (más fiel a un doble-clic real que dos
    // .click() de Playwright, que serializan y esperan a que el elemento vuelva a ser "stable").
    const submitBtn = page.getByRole('button', { name: 'Solicitar reubicación' })
    await submitBtn.evaluate(el => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(1500)

    // Verificación real contra el backend — no solo "la UI no rompió", sino que el fix
    // (submittingRef en RelocateModal) efectivamente evitó la 2da request.
    const res = await page.request.get('/api/bodega/relocations?per_page=50', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const body = await res.json()
    const matches = (body.data as Array<{ motivo: string }>).filter(r => r.motivo === motivoUnico)
    expect(matches).toHaveLength(1)
  })
})

test.describe('Bloque B4 — bandeja Solicitudes de reubicacion (SCRUM-459)', () => {
  test('Escenario 1: filtro vuelve a Todas al reabrir el modal', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    await page.getByText('Solicitudes de reubicación', { exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(500)

    // Cerrar por el boton X — sibling del h2 dentro del mismo div flex
    const modal = page.locator('.fixed.inset-0.z-50').filter({ hasText: 'Solicitudes de reubicación' })
    await modal.locator('h2 ~ button').click()
    await page.waitForTimeout(500)

    await page.getByText('Solicitudes de reubicación', { exact: true }).click()
    await page.waitForTimeout(800)
    const todasBtn = page.getByRole('button', { name: 'Todas', exact: true })
    await expect(todasBtn).toHaveClass(/bg-primary/)
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-bandeja-filtro-reset.png' })
  })

  test('RN2: solicitud ya resuelta no tiene ninguna accion disponible', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    await page.getByText('Solicitudes de reubicación', { exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Aprobadas', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)

    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
    await page.screenshot({ path: 'e2e-tmp/.tmp/b4-bandeja-sin-acciones.png' })
  })

  test('RN1: rechazar sin motivo bloquea en UI', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await openWarehouse(page, 'Bodega Central')
    await page.waitForTimeout(500)

    await page.getByText('Solicitudes de reubicación', { exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Pendientes', exact: true }).click()
    await page.waitForTimeout(800)

    const rejectBtn = page.getByRole('button', { name: /^rechazar$/i }).first()
    if (await rejectBtn.count() > 0) {
      await rejectBtn.click()
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: 'Rechazar' }).last().click()
      await page.waitForTimeout(300)
      await expect(page.locator('body')).toContainText(/motivo para rechazar/i)
    }
  })
})
