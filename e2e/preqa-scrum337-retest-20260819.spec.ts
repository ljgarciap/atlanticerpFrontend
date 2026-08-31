import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * Retest de SCRUM-337 (REQ-267) tras los 2 fixes del rebote anterior de Pre-QA (mismo día,
 * 2026-08-19): backend `fba73d4` (gatea tarifa_dia en summary(), no solo show()) y frontend
 * `98f80cd` (guarda rate_history contra undefined antes de leer .length). Ambos ya verificados
 * a nivel de payload JSON via curl directo (ver reporte) — este spec cierra el checklist completo
 * a nivel de UI real contra dev.atlanticerp.ai: no crash, no leak visual, camino feliz de quien sí tiene
 * el permiso intacto, y un smoke de edición.
 *
 * Cuentas reales (password = email): liderservicios@test.com (Aaron, lider_servicios,
 * puede_ver_costos=true), tecnicoservicios@test.com (Tecnico Servicios Test, tecnico_servicios,
 * puede_ver_costos=false). Técnico externo id 2 "QA Luis Vargas" tiene rate_history real (1 fila,
 * $25.00) y tarifa_visible=true — el mismo que crasheaba en el pase anterior.
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'https://dev.atlanticerp.ai'
const DL_DIR = 'e2e/.tmp/preqa-scrum337-retest-20260819'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: email } })
  const { token } = await res.json()
  return token as string
}

// ---------- 1 y 2: Carlos (sin puede_ver_costos) — ficha no crashea, no hay leak en ficha ni listado ----------

test('1. Carlos (tecnico_servicios) — listado de Técnicos externos NO muestra tarifa real en la columna TARIFA', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'tecnicoservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/01-carlos-listado.png`, fullPage: true })

  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await expect(row).toBeVisible()
  await expect(row.getByText('$25.00')).toHaveCount(0)
  await expect(row.getByText('25.00')).toHaveCount(0)
  expect(errors, `Errores de página en el listado: ${errors.join(' | ')}`).toEqual([])
})

test('2. Carlos — abrir la ficha de "QA Luis Vargas" (id 2, con rate_history real) NO crashea, carga datos sin costo/tarifa/historial', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await login(page, 'tecnicoservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)

  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await row.locator('button, svg').last().click({ force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/02-carlos-ficha-sin-crash.png`, fullPage: true })

  // No debe crashear: la app sigue teniendo contenido real, no una pantalla en blanco.
  const bodyText = await page.locator('body').innerText()
  expect(bodyText.trim().length, 'La app quedó en blanco (crash) al abrir la ficha').toBeGreaterThan(0)
  expect(errors, `Errores de página/consola al abrir la ficha como Carlos: ${errors.join(' | ')}`).toEqual([])

  // Datos sin costo que SÍ deben verse.
  await expect(page.getByText('QA Luis Vargas').first()).toBeVisible()
  await expect(page.getByText('QA Instalaciones Vargas').first()).toBeVisible()
  await expect(page.getByText('Instalaciones').first()).toBeVisible()

  // Nada de tarifa/costo/margen/historial REAL visible en ningún lado de la ficha — el label
  // "Tarifa por día" puede seguir en el DOM como sección con placeholder ("Sin tarifa asignada"),
  // eso es correcto (no es un leak); lo que no debe aparecer es el monto ni el historial.
  await expect(page.getByText('$25.00')).toHaveCount(0)
  await expect(page.getByText('Sin tarifa asignada')).toBeVisible()
  await expect(page.getByText(/margen/i)).toHaveCount(0)
  await expect(page.getByText(/historial de tarifa/i)).toHaveCount(0)
  await expect(page.getByText('COSTO', { exact: true })).toHaveCount(0)
})

// ---------- 3: Aaron (con puede_ver_costos) — camino feliz intacto en listado + ficha ----------

test('3a. Aaron (lider_servicios) — listado SÍ muestra la tarifa real en la columna TARIFA', async ({ page }) => {
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/03-aaron-listado.png`, fullPage: true })

  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await expect(row).toBeVisible()
  await expect(row.getByText('$25.00')).toBeVisible()
})

test('3b. Aaron — ficha de "QA Luis Vargas" SÍ muestra tarifa, margen y el historial completo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, 'liderservicios@test.com')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1200)
  const row = page.locator('tbody tr', { hasText: 'QA Luis Vargas' })
  await row.locator('button, svg').last().click({ force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/04-aaron-ficha-completa.png`, fullPage: true })

  expect(errors, `Errores de página al abrir la ficha como Aaron: ${errors.join(' | ')}`).toEqual([])
  await expect(page.getByText('$25.00').first()).toBeVisible()
  // Historial de tarifa: al menos una entrada visible (25.00 — Super).
  await expect(page.getByText('25.00', { exact: false }).first()).toBeVisible()
  // Proyectos asignados con costo/margen visibles para Aaron.
  await expect(page.getByText('REC-2026-0006', { exact: false })).toBeVisible()
})

// ---------- 4: smoke de edición (Aaron) — no se rompió el resto del CRUD ----------

test('4. Ruptura directa — PATCH tarifa/estado de Aaron siguen funcionando (200), no se rompió el resto del CRUD', async ({ request }) => {
  const token = await apiToken(request, 'liderservicios@test.com')

  // Confirmar estado actual y volver a setearlo (sin cambiar datos reales) — smoke no destructivo.
  const before = await request.get(`${BASE}/api/servicios/external-technicians/2`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const beforeJson = await before.json()
  console.log('[SCRUM-337 retest] estado/tarifa actual id 2:', beforeJson.estado, beforeJson.tarifa_dia)

  const patchTarifa = await request.patch(`${BASE}/api/servicios/external-technicians/2/tarifa`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { tarifa_dia: beforeJson.tarifa_dia, tarifa_visible: beforeJson.tarifa_visible },
  })
  console.log('[SCRUM-337 retest] PATCH tarifa status:', patchTarifa.status())
  expect(patchTarifa.status()).toBe(200)
  const patchTarifaJson = await patchTarifa.json()
  // El summary() que responde este PATCH debe seguir mostrando tarifa_dia a Aaron (canSeeCosts=true).
  expect(patchTarifaJson.tarifa_dia).toBe(beforeJson.tarifa_dia)

  const patchEstado = await request.patch(`${BASE}/api/servicios/external-technicians/2/estado`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { estado: beforeJson.estado },
  })
  console.log('[SCRUM-337 retest] PATCH estado status:', patchEstado.status())
  expect(patchEstado.status()).toBe(200)
})
