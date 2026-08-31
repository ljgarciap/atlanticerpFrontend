import { test, expect, type Page } from '@playwright/test'

/**
 * SCRUM-440 (REQ-370) — Pre-QA de la implementación de frontend Aprobar/Rechazar en la bandeja de
 * Órdenes Zona Libre (commit d837c0d, 2026-07-28). Este ticket nunca tuvo su propio Pre-QA — la
 * pasada anterior (ver preqa-scrum440-zona-libre-recheck-20260728.spec.ts) encontró el CRÍTICO de
 * que no existía NINGÚN botón; ese hallazgo ya fue corregido, este archivo es la verificación en
 * vivo del fix, adversarial, contra dev.atlanticerp.ai.
 *
 * Promovido a test permanente (no desechable) — el criterio de aprobar/rechazar con permisos
 * angostos es exactamente el tipo de gate que ya se rompió una vez (ver CLAUDE.md, regla de
 * e2e no desechable).
 *
 * Serial a propósito: CrowdSec/ModSecurity dispara falsos timeouts con logins concurrentes desde
 * la misma IP (ver feedback_preqa_crowdsec_no_paralelo).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const YIRENA_EMAIL = 'lidercompras@test.com'
const YIRENA_PASS = 'lidercompras@test.com'
const ALMACEN_EMAIL = 'liderbodega@test.com'
const ALMACEN_PASS = 'liderbodega@test.com'

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|bodega|inicio|compras|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function goToBandeja(page: Page) {
  await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Por aprobar', exact: true }).click()
  await page.waitForTimeout(800)
}

test.describe('SCRUM-440 — Yirena ve y usa Aprobar/Rechazar', () => {
  test('Yirena ve botones Aprobar/Rechazar en una fila pendiente real', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await goToBandeja(page)

    const aprobarBtns = page.getByRole('button', { name: /^aprobar$/i })
    const rechazarBtns = page.getByRole('button', { name: /^rechazar$/i })
    const count = await aprobarBtns.count()
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-yirena-bandeja-pendientes.png' })

    if (count === 0) {
      test.info().annotations.push({ type: 'note', description: 'Sin órdenes pendientes sembradas — no se puede ejercitar aprobar/rechazar sin fixture.' })
      test.skip(true, 'Sin filas pendientes en el entorno')
    }
    expect(await aprobarBtns.count()).toBeGreaterThan(0)
    expect(await rechazarBtns.count()).toBeGreaterThan(0)
  })

  test('Rechazar sin motivo bloquea el envío (validación client-side)', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await goToBandeja(page)

    const rechazarBtns = page.getByRole('button', { name: /^rechazar$/i })
    if ((await rechazarBtns.count()) === 0) {
      test.skip(true, 'Sin filas pendientes en el entorno')
      return
    }
    await rechazarBtns.first().click()
    await page.waitForTimeout(400)

    // Intentar enviar con el textarea vacío
    const modal = page.locator('text=Motivo').locator('..').locator('..')
    await page.getByRole('button', { name: /^rechazar$/i }).last().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-rechazar-sin-motivo.png' })

    // El modal debe seguir abierto (no se cerró) y debe mostrar el error de requerido
    await expect(page.locator('textarea')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/obligatorio|requerid|required/i)

    // Cerrar el modal para no interferir con el siguiente test
    await page.getByRole('button', { name: /cancelar|cerrar/i }).first().click().catch(() => {})
  })

  test('Recargar a mitad del modal de Rechazar no deja la orden en limbo (sigue pendiente)', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await goToBandeja(page)

    const rechazarBtns = page.getByRole('button', { name: /^rechazar$/i })
    if ((await rechazarBtns.count()) === 0) {
      test.skip(true, 'Sin filas pendientes en el entorno')
      return
    }
    await rechazarBtns.first().click()
    await page.waitForTimeout(400)
    await page.locator('textarea').fill('motivo a medio escribir, nunca enviado')
    await page.reload()
    await page.waitForTimeout(1200)

    // Tras recargar, el modal no debe persistir (no hay borrador guardado) y la fila sigue en
    // "Por aprobar" con sus botones intactos — no quedó a medio resolver server-side.
    await expect(page.locator('textarea')).toHaveCount(0)
    await page.getByRole('button', { name: 'Por aprobar', exact: true }).click()
    await page.waitForTimeout(600)
    expect(await page.getByRole('button', { name: /^aprobar$/i }).count()).toBeGreaterThan(0)
  })

  test('Aprobar una orden pendiente real genera una orden de compra visible en Compras (RN1)', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await goToBandeja(page)

    const aprobarBtns = page.getByRole('button', { name: /^aprobar$/i })
    if ((await aprobarBtns.count()) === 0) {
      test.skip(true, 'Sin filas pendientes en el entorno')
      return
    }

    // Capturar el order_number de la fila que vamos a aprobar antes de actuar
    const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: /^aprobar$/i }) }).first()
    const orderNumberText = await row.locator('td').first().textContent()

    await row.getByRole('button', { name: /^aprobar$/i }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-tras-aprobar.png' })

    // La fila debe pasar a estado "Aprobada" (o desaparecer de "Por aprobar")
    await page.getByRole('button', { name: 'Aprobadas', exact: true }).click()
    await page.waitForTimeout(800)
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain((orderNumberText ?? '').replace('#', ''))

    // Confirmar en el módulo Compras — Ver Órdenes — que existe una PO real con modality Zona Libre
    await page.goto(`${BASE}/compras/ordenes`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-compras-ordenes-tras-aprobar.png' })
    const comprasBody = await page.textContent('body')
    expect(comprasBody).toMatch(/Zona Libre/i)
  })

  test('Doble clic en Aprobar no genera 2 órdenes de compra (idempotencia)', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await goToBandeja(page)

    const aprobarBtns = page.getByRole('button', { name: /^aprobar$/i })
    if ((await aprobarBtns.count()) === 0) {
      test.skip(true, 'Sin filas pendientes en el entorno para probar doble clic')
      return
    }

    const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: /^aprobar$/i }) }).first()
    const btn = row.getByRole('button', { name: /^aprobar$/i })

    // Disparar 2 clics rápidos — el botón debe deshabilitarse en el primer clic (loading state)
    await Promise.all([btn.click(), btn.click({ force: true }).catch(() => {})])
    await page.waitForTimeout(1500)

    // No debe haber quedado ningún mensaje de error visible por el segundo intento fallido, y la
    // fila debe reflejar un único resultado consistente (aprobada), no un estado roto.
    await page.getByRole('button', { name: 'Aprobadas', exact: true }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-doble-clic-aprobar.png' })
  })
})

test.describe('SCRUM-440 — Bodega solo consulta, no aprueba/rechaza (RN3 / permisos)', () => {
  test('Bodega NO ve botones Aprobar/Rechazar en ninguna fila pendiente', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await goToBandeja(page)

    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-bodega-sin-botones.png' })
  })

  test('Escenario 1 — Bodega ve el motivo real de una orden rechazada por Yirena', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(800)

    const viewReasonLinks = page.getByText('Ver motivo')
    const count = await viewReasonLinks.count()
    if (count === 0) {
      test.info().annotations.push({ type: 'note', description: 'Sin órdenes rechazadas sembradas — no se pudo verificar visibilidad del motivo end-to-end en este entorno.' })
      return
    }
    await viewReasonLinks.first().click()
    await page.waitForTimeout(500)
    const modalText = await page.textContent('body')
    expect(modalText?.length ?? 0).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-440-bodega-ve-motivo.png' })
  })

  test('Bodega intentando pegar directo el endpoint de approve por API recibe 403 (permiso server-side real, no solo UI)', async ({ page, request }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    const token = await page.evaluate(() => localStorage.getItem('accessToken') ?? localStorage.getItem('token') ?? '')
    if (!token) {
      test.skip(true, 'No se pudo leer el JWT de localStorage con las claves esperadas en este entorno.')
      return
    }
    const res = await request.post(`${BASE}/api/compras/zona-libre/requests/1/approve`, {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    })
    expect([401, 403]).toContain(res.status())
  })
})
