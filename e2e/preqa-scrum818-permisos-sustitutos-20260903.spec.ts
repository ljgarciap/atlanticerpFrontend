import { test, expect, Page } from '@playwright/test'

// Pre-QA — SCRUM-818 (rebote 2026-09-03, hallazgos de Daniela sobre Comparación de Referencias).
// Corrido en LOCAL contra http://localhost:8090 (nginx + build fresco), con las cuentas REALES
// de Mark (Gerencia) y Yirena (Líder de Compras) — no cuentas *.test — para reproducir la cuenta
// real reportada en el rebote. Datos sembrados vía tinker antes de esta corrida: RoleModuleVisibility
// real para management/lider_compras (v2, sin tocar extra_permissions v1), 1 producto original
// (PQ818-ORIG, id 719) + 1 sustituto, 1 proyecto en etapa Cotización con folio PQ818-COT-1 (con
// una línea de cotización real que referencia el producto original, para que el picker de
// proyectos filtrado por producto lo encuentre), 1 solicitud Pendiente Gerencia (Hallazgo 1), 1
// solicitud Rechazada "global" sin proyecto (Hallazgo 3) y 1 solicitud Rechazada propia de
// designer@atlantic.test, atada a PQ818-COT-1 (Hallazgo 3b).
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:8090'

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

test('Hallazgo 1 — Mark (Gerencia, acceso solo vía rol) VE la solicitud Pendiente Gerencia y puede aprobarla', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto(`${BASE}/compras/sustitutos`)
  await page.waitForTimeout(600)

  // Antes del fix: "No hay solicitudes de reemplazo registradas" pese a existir. Varias filas
  // comparten el mismo producto original (fixtures de esta sesión) — solo importa que la lista
  // no esté vacía y que el botón de aprobar exista (Pendiente Gerencia + can_decide=true).
  await expect(page.getByText('PreQA818 Lampara Original').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /aprobar/i }).first()).toBeVisible()
})

test('Hallazgo 2 — Mark encuentra el proyecto al buscar sustituto (picker "Proyecto de venta" filtrado por producto)', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto(`${BASE}/compras/sustitutos`)
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Buscar sustituto' }).click()

  // 1) Elegir el producto original.
  await page.getByPlaceholder('Buscar producto…').fill('PreQA818 Lampara Original')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Seleccionar' }).first().click()

  // 2) Método "Buscar en catálogo" (default) — buscar el sustituto.
  await page.getByPlaceholder('Buscar por nombre o categoría…').fill('PreQA818 Lampara Sustituto')
  await page.waitForTimeout(500)

  // 3) Abrir el modal de generar solicitud sobre el resultado.
  await page.getByRole('button', { name: 'Generar solicitud' }).click()

  // 4) Abrir el picker de proyecto (filtrado server-side por el producto ORIGINAL, id 719).
  await page.getByRole('button', { name: 'Selecciona un proyecto de venta…' }).click()
  await page.waitForTimeout(500)

  // Antes del fix (v1 sin gerencia.view): searchApprovedProjects devolvía 0 proyectos para Mark
  // pese a que el proyecto SÍ contiene el producto — el picker mostraba el mensaje de "no existe
  // ningún proyecto" en vez de la fila real.
  await expect(page.getByText('No existe ningún proyecto que contenga este producto')).not.toBeVisible()
  await expect(page.getByText('PreQA818 Proyecto Cotizacion', { exact: false })).toBeVisible()

  // 5) Seleccionarlo y confirmar que el botón de envío del modal queda habilitado. El texto
  // "Generar solicitud" también es el de la fila de resultados detrás del overlay — se acota al
  // botón dentro del modal (fixed inset) para no ambigüar el locator.
  await page.getByText('PreQA818 Proyecto Cotizacion', { exact: false }).first().click()
  const modal = page.locator('.fixed.inset-0')
  await expect(modal.getByRole('button', { name: 'Generar solicitud' })).toBeEnabled()
})

test('Hallazgo 3 — Yirena (Compras, acceso solo vía rol) VE la lista y el botón "Generar orden" en la Rechazada', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${BASE}/compras/sustitutos`)
  await page.waitForTimeout(600)

  // Antes del fix: lista vacía para Yirena (mismo síntoma que Mark). Yirena tiene acceso completo
  // (lider_compras), por lo que ve ambas Rechazadas sembradas (id 28 y 29) — solo importa que
  // vea al menos un botón "Generar orden" (can_generate_order=true para su rol).
  await expect(page.getByText('PreQA818 Lampara Original').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /generar orden/i }).first()).toBeVisible()
})

test('Hallazgo 3(b) — un Vendedor VE su propia solicitud Rechazada, pero NUNCA el botón "Generar orden"', async ({ page }) => {
  await login(page, 'designer@atlantic.test', 'Password123!')
  await page.goto(`${BASE}/compras/sustitutos`)
  await page.waitForTimeout(600)

  // Solicitud rechazada #29, atada a su propio proyecto (PQ818-COT-1) — debe verla en su lista
  // scopeada, pero can_generate_order debe ser false (rol distinto de lider_compras/superadmin).
  await expect(page.getByText('PreQA818 Lampara Original').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /generar orden/i })).toHaveCount(0)
})
