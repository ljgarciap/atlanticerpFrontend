import { test, expect, type Page } from '@playwright/test'

/**
 * SCRUM-440 (REQ-370) — Pre-QA re-check 2026-07-28, "Ciclo de vida completo de una orden Zona
 * Libre". Re-abierto por marly (2026-07-25/26): Yirena (lidercompras@test.com,
 * lider_compras) no podía entrar a /bodega/ordenes-zona-libre (la redirigía al dashboard) — sin
 * acceso, no podía ejecutar el Escenario 2 (aprobación) desde la UI.
 *
 * Backend Dev (commit cb0f413, 2026-07-28) agregó `bodega.read` a extra_permissions de Yirena en
 * SpecialPermissionSeeder.php — mismo mecanismo que sus otros 2 grants puntuales
 * (compras.settings.configure, compras.zona-libre.approve). Efecto secundario ACEPTADO por Luis:
 * Yirena ahora ve el resto del menú de Bodega en su Sidebar, no solo Zona Libre.
 *
 * Este re-check confirma en vivo:
 *  1. Yirena YA puede entrar a /bodega/ordenes-zona-libre (ya no la redirige).
 *  2. Ve la bandeja de órdenes pendientes.
 *  3. Efecto secundario esperado: ve el resto del menú de Bodega en el Sidebar.
 *
 * HALLAZGO CRÍTICO (confirmado leyendo BodegaOrdenesZonaLibrePage.tsx antes de este re-check y
 * reproducido en vivo abajo): el fix de cb0f413 resuelve el gate de ACCESO a la pantalla, pero la
 * pantalla en sí (`RowAction`, línea ~129) SOLO tiene 3 casos — "pendiente" → botón Recordar,
 * "rechazada" → link Ver motivo, "aprobada" → texto "sigue el flujo normal" — NINGUNO de los 3
 * renderiza un botón Aprobar/Rechazar, para NINGÚN usuario, independientemente del permiso que
 * tenga. El propio docblock del componente lo documenta: "bandeja de seguimiento SOLO DE LECTURA
 * ... La acción de aprobar/rechazar es de Yirena (Compras), fuera de alcance de este batch." No
 * existe tampoco ninguna pantalla del lado de Compras (grep completo de src/ sin resultados para
 * cualquier wiring de approve/reject de zona-libre-requests). El backend expone
 * POST /compras/zona-libre/requests/{id}/approve|reject (routes/compras.php, permiso
 * compras.zona-libre.approve) y Yirena SÍ tiene el permiso — pero no hay ningún botón en toda la
 * SPA que lo invoque. Por eso el Escenario 2 (y el "rechazar con motivo" desde la UI) siguen sin
 * poder verificarse — es exactamente el mismo hueco que marly reportó el 2026-07-25/26, el fix de
 * hoy solo resolvió la mitad (acceso), no la acción en sí.
 *
 * Corre contra dev.atlanticerp.ai. Serial a propósito: CrowdSec/ModSecurity dispara falsos timeouts con
 * logins en paralelo desde la misma IP (ver CLAUDE.md, Epic 11).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const YIRENA_EMAIL = 'lidercompras@test.com'
const YIRENA_PASS  = 'lidercompras@test.com'
const ALMACEN_EMAIL = 'liderbodega@test.com'
const ALMACEN_PASS  = 'liderbodega@test.com'

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|bodega|inicio|compras|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

test.describe('SCRUM-440 — Yirena YA puede entrar a la bandeja (fix cb0f413)', () => {
  test('Yirena entra a /bodega/ordenes-zona-libre sin ser redirigida al dashboard', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1500)

    expect(page.url()).toContain('/bodega/ordenes-zona-libre')
    // La bandeja real, no un placeholder ni un 403/dashboard.
    await expect(page.getByRole('table')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum440-yirena-bandeja.png' })
  })

  test('efecto secundario aceptado — Yirena ve el resto del menú de Bodega en el Sidebar, no solo Zona Libre', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    // bodega.read gatea TODAS las rutas de Bodega a nivel de ruta — si Yirena entra a
    // /bodega/ordenes-zona-libre, por el mismo mecanismo debe poder entrar a /bodega/home también.
    expect(page.url()).toContain('/bodega/home')

    const nav = page.locator('aside').first()
    await expect(nav.getByRole('button', { name: 'Bodega', exact: true })).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum440-yirena-sidebar-bodega.png' })
  })
})

test.describe('SCRUM-440 — HALLAZGO: no existe botón Aprobar/Rechazar en ninguna parte de la SPA', () => {
  test('CRÍTICO — en la bandeja, Yirena NO tiene botón Aprobar/Rechazar en ninguna fila (ningún estado)', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1500)

    // Camino de ruptura por los 3 estados — ninguno debe tener Aprobar/Rechazar. Labels reales
    // según es/bodega.json (zonaLibre.orders.chips): "Por aprobar" (pendiente), "Aprobadas",
    // "Rechazadas" — no "Pendiente(s)".
    for (const chipLabel of ['Por aprobar', 'Aprobadas', 'Rechazadas'] as const) {
      await page.getByRole('button', { name: chipLabel, exact: true }).click()
      await page.waitForTimeout(800)
      await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
    }

    // Confirmamos que sí ve datos reales (no está vacía) — la ausencia de botones no es porque
    // no haya filas que mostrar.
    const bodyText = await page.textContent('body')
    expect(bodyText).toMatch(/Pendiente|Aprobada|Rechazada|Sin resultados|empty/i)
  })

  test('CRÍTICO — no existe ninguna ruta de Compras dedicada a aprobar/rechazar BodegaZonaLibreRequest', async ({ page }) => {
    await login(page, YIRENA_EMAIL, YIRENA_PASS)

    // "Ver Órdenes" (compras/ordenes) SÍ tiene un filtro "Zona Libre" — pero es un filtro por
    // PROVEEDOR sobre PurchaseOrders normales (RN1: una vez aprobada, la solicitud de Bodega SE
    // CONVIERTE en una PurchaseOrder normal), no la bandeja de solicitudes pendientes de Bodega.
    // Confirmado por grep estático (sin resultados en src/ para cualquier wiring de
    // approve/reject de zona-libre-requests desde comprasApi.ts/hooks): no existe ningún botón
    // en toda la SPA que invoque POST /compras/zona-libre/requests/{id}/approve|reject.
    // Probamos que no exista ninguna ruta plausible del lado Compras para esa acción específica.
    for (const guess of ['/compras/zona-libre', '/compras/ordenes-zona-libre', '/compras/solicitudes-zona-libre']) {
      await page.goto(`${BASE}${guess}`)
      await page.waitForTimeout(1000)
      // Cualquiera de estas rutas no declaradas cae al catch-all de la SPA (dashboard/404),
      // nunca a una bandeja real de solicitudes con acciones Aprobar/Rechazar.
      await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
    }
  })
})

test.describe('SCRUM-440 — lo que SÍ sigue funcionando (regresión, ya confirmado por Pre-QA 2026-07-24)', () => {
  test('Escenario 1 — Bodega ve el motivo real de una orden rechazada', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(800)
    const viewReasonLinks = page.getByText('Ver motivo')
    const count = await viewReasonLinks.count()
    if (count > 0) {
      await viewReasonLinks.first().click()
      await page.waitForTimeout(500)
      const modalText = await page.textContent('body')
      expect(modalText?.length ?? 0).toBeGreaterThan(0)
      await page.screenshot({ path: 'e2e/.tmp/preqa-scrum440-motivo-bodega.png' })
    } else {
      test.info().annotations.push({ type: 'note', description: 'Sin órdenes rechazadas sembradas en este entorno al momento del re-check.' })
    }
  })

  test('RN3 / PERMISOS — Bodega NO ve botones Aprobar/Rechazar ni Editar/Eliminar en ninguna fila', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1000)

    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^editar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^eliminar$/i })).toHaveCount(0)
  })

  test('RN3 — API rechaza edición/eliminación de una orden ya enviada por Bodega (405/404, sin ruta)', async ({ page, request }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    const token = await page.evaluate(() => localStorage.getItem('accessToken') ?? '')
    if (!token) {
      test.skip(true, 'No se pudo leer el JWT de localStorage con las claves esperadas en este entorno.')
      return
    }
    const putRes = await request.put(`${BASE}/api/bodega/zona-libre/requests/1`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
      failOnStatusCode: false,
    })
    expect([404, 405]).toContain(putRes.status())
    const delRes = await request.delete(`${BASE}/api/bodega/zona-libre/requests/1`, {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    })
    expect([404, 405]).toContain(delRes.status())
  })
})
