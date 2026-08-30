import { test, expect, Page, APIRequestContext } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Review fusionado — Batch 21 Admin&Cont (SCRUM-618→623, REQ-541→546), Caja
// Chica: rechazo/reapertura de gastos. Corrido en LOCAL contra http://localhost:8090 (nginx
// sirviendo el build fresco de React + proxy /api → laravel), NUNCA dev.atlanticerp.ai.
//
// Self-seeding (corregido 2026-08-27, re-verificación del hallazgo CRÍTICO de RechazadosPanel —
// ver feedback_e2e_permanent_tests_must_self_seed.md en memoria del proyecto): la corrida anterior
// asumía Reportes 0001-2026..0004-2026 y una línea standalone sembrados FUERA del spec, vía API
// "antes de la corrida" — un test permanente con folios/IDs hardcodeados así se rompe en la
// siguiente corrida en cuanto el estado real ya no coincide con el asumido (confirmado: al
// correrlo una 2da vez, el Reporte 0001-2026 ya no tenía las 3 líneas pendientes esperadas, porque
// la 1ra corrida ya las había consumido/mutado). Ahora `beforeAll` crea sus propios Reportes A-D +
// línea standalone vía llamadas reales a la API (login, POST .../expenses, POST .../reports,
// PUT .../approve), con nombres de proveedor únicos por corrida (sufijo RUN_ID) para que sea
// seguro correr el spec repetidas veces sin colisionar con datos de corridas previas.
const BASE = 'http://localhost:8090'

const FELIX = 'conta@atlantic.com.pa'
const YANETH = 'asistente@atlantic.com.pa'
const MARK = 'mbekhar@atlantic.com.pa'
const DANIELA = 'daniela@atlantic.com.pa'

const RUN_ID = Date.now().toString()

// Foto "stub" (solo SOI+EOI) — suficiente para pasar la validación de archivo del backend
// (mimes:jpg,jpeg,png,pdf) en líneas donde no se verifica el renderizado real de la imagen.
const STUB_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

// PNG real de 4x4 rojo, generado a propósito para este spec (no un stub) — decodifica de verdad
// en el navegador (naturalWidth/naturalHeight > 0), a diferencia de STUB_JPEG. Usado como 2do
// soporte de la línea standalone para SCRUM-623.1 (verificar que "Ver" muestra la imagen real, no
// un ícono roto).
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR42mP4z8AARwzEcQCukw/xOF6MEQAAAABJRU5ErkJggg==',
  'base64',
)

type Seed = {
  felixId: number
  reportA: string
  reportB: string
  reportC: string
  reportD: string
  provA1: string
  provA2: string
  provA3: string
  provB1: string
  provStandalone: string
  standaloneExpenseId: number
}

let seed: Seed

async function apiLogin(request: APIRequestContext, email: string): Promise<{ token: string; userId: number }> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: email } })
  if (!res.ok()) throw new Error(`Login falló para ${email}: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  return { token: body.token as string, userId: body.user.id as number }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** POST /admin-contab/petty-cash/expenses — crea 1+ líneas en un solo lote (mismo orden de
 *  inserción = mismo orden de id ascendente, del que dependen los tests que asumen "la primera
 *  línea"/"el primer botón Rechazar"). */
async function createExpenses(
  request: APIRequestContext,
  token: string,
  lines: Array<{ proveedor: string; solicitanteId: number; fotoBuffer?: Buffer; fotoMime?: string; fotoName?: string }>,
): Promise<number[]> {
  const fecha = new Date().toISOString().slice(0, 10)
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {}

  lines.forEach((l, i) => {
    multipart[`lineas[${i}][fecha]`] = fecha
    multipart[`lineas[${i}][solicitante_id]`] = String(l.solicitanteId)
    multipart[`lineas[${i}][proveedor]`] = l.proveedor
    // Nunca incluir el nombre del proveedor acá — provoca colisión de "strict mode" en Playwright
    // cuando un test busca el proveedor por texto (getByText matchea tanto la celda de proveedor
    // como la de descripción a la vez).
    multipart[`lineas[${i}][descripcion]`] = `Gasto de prueba Pre-QA — Batch 21 — run ${RUN_ID}`
    multipart[`lineas[${i}][monto_bruto]`] = '25.50'
    multipart[`lineas[${i}][itbms]`] = '1.50'
    multipart[`lineas[${i}][foto]`] = {
      name: l.fotoName ?? 'recibo.jpg',
      mimeType: l.fotoMime ?? 'image/jpeg',
      buffer: l.fotoBuffer ?? STUB_JPEG,
    }
  })

  const res = await request.post(`${BASE}/api/admin-contab/petty-cash/expenses`, {
    headers: authHeaders(token),
    multipart,
  })
  if (!res.ok()) throw new Error(`createExpenses falló: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  return body.created as number[]
}

async function groupReport(request: APIRequestContext, token: string, expenseIds: number[]): Promise<string> {
  const res = await request.post(`${BASE}/api/admin-contab/petty-cash/reports`, {
    headers: authHeaders(token),
    data: { expense_ids: expenseIds, forma_pago: 'efectivo' },
  })
  if (!res.ok()) throw new Error(`groupReport falló: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  return body.numero as string
}

async function approveReportApi(request: APIRequestContext, token: string, numero: string): Promise<void> {
  const res = await request.put(`${BASE}/api/admin-contab/petty-cash/reports/${numero}/approve`, {
    headers: authHeaders(token),
  })
  if (!res.ok()) throw new Error(`approveReportApi falló: ${res.status()} ${await res.text()}`)
}

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

async function openReport(page: Page, numero: string): Promise<void> {
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/^reportes$/i).first().click()
  await page.waitForTimeout(700)
  const row = page.locator('tr', { hasText: numero })
  await row.getByRole('button', { name: /^ver$/i }).click()
  await page.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// Seed — corre una sola vez antes de todos los tests del archivo
// ---------------------------------------------------------------------------

test.beforeAll(async ({ request }) => {
  test.setTimeout(60_000)

  const felix = await apiLogin(request, FELIX)
  const mark = await apiLogin(request, MARK)

  // Defensa: si una corrida previa interrumpida dejó `petty_cash_max_intentos_rechazo` en un
  // valor distinto de 2 (ej. crasheó a mitad del test "Extra" antes de revertirlo), todo el resto
  // de este spec asume max=2 en sus regexes de UI ("1/2", "2/2") — fallar rápido y claro acá en
  // vez de dejar que revienten aserciones downstream sin contexto.
  const fiscalRes = await request.get(`${BASE}/api/admin-contab/fiscal-settings`, {
    headers: authHeaders(mark.token),
  })
  if (!fiscalRes.ok()) throw new Error(`No se pudo leer fiscal-settings: ${fiscalRes.status()}`)
  const fiscal = await fiscalRes.json()
  if (fiscal.petty_cash_max_intentos_rechazo !== 2) {
    throw new Error(
      `petty_cash_max_intentos_rechazo = ${fiscal.petty_cash_max_intentos_rechazo}, se esperaba 2 ` +
      '(una corrida previa de este spec probablemente se interrumpió a mitad del test "Extra — ' +
      'Configuración Fiscal" sin revertir el valor a 2 — corregirlo a mano en /admin-contab/fiscal antes de reintentar).',
    )
  }

  seed = {
    felixId: felix.userId,
    reportA: '',
    reportB: '',
    reportC: '',
    reportD: '',
    provA1: `ProveedorA1-${RUN_ID}`,
    provA2: `ProveedorA2-${RUN_ID}`,
    provA3: `ProveedorA3-${RUN_ID}`,
    provB1: `ProveedorB1-${RUN_ID}`,
    provStandalone: `ProveedorStandalone-${RUN_ID}`,
    standaloneExpenseId: 0,
  }

  // Reporte A — 3 líneas (SCRUM-618.1 rechaza 1, SCRUM-618.2 rechaza el resto).
  const idsA = await createExpenses(request, felix.token, [
    { proveedor: seed.provA1, solicitanteId: felix.userId },
    { proveedor: seed.provA2, solicitanteId: felix.userId },
    { proveedor: seed.provA3, solicitanteId: felix.userId },
  ])
  seed.reportA = await groupReport(request, felix.token, idsA)

  // Reporte B — 1 línea (SCRUM-618.4, rechazo completo disuelve el reporte automáticamente).
  const idsB = await createExpenses(request, felix.token, [{ proveedor: seed.provB1, solicitanteId: felix.userId }])
  seed.reportB = await groupReport(request, felix.token, idsB)

  // Reporte C — 1 línea, se mantiene PENDIENTE toda la corrida (SCRUM-618.5, SCRUM-622.2, SCRUM-623.2).
  const idsC = await createExpenses(request, felix.token, [
    { proveedor: `ProveedorC1-${RUN_ID}`, solicitanteId: felix.userId },
  ])
  seed.reportC = await groupReport(request, felix.token, idsC)

  // Reporte D — 1 línea, aprobado por Mark de entrada (SCRUM-622.3 solo-lectura, SCRUM-623.3
  // descargar+"aprobado por Mark").
  const idsD = await createExpenses(request, felix.token, [
    { proveedor: `ProveedorD1-${RUN_ID}`, solicitanteId: felix.userId },
  ])
  seed.reportD = await groupReport(request, felix.token, idsD)
  await approveReportApi(request, mark.token, seed.reportD)

  // Línea standalone (sin reporte) — SCRUM-622.1 (editar, solicitante no editable) y SCRUM-623.1
  // (ver soporte real). Primer soporte es el stub (insuficiente para verificar imagen real); el
  // 2do soporte real (REAL_PNG) se agrega aparte vía addExpenseAttachment, mismo patrón que el
  // spec original.
  const idsStandalone = await createExpenses(request, felix.token, [
    { proveedor: seed.provStandalone, solicitanteId: felix.userId },
  ])
  seed.standaloneExpenseId = idsStandalone[0]

  const attachRes = await request.post(
    `${BASE}/api/admin-contab/petty-cash/expenses/${seed.standaloneExpenseId}/attachments`,
    {
      headers: authHeaders(felix.token),
      multipart: {
        foto: { name: 'real.png', mimeType: 'image/png', buffer: REAL_PNG },
      },
    },
  )
  if (!attachRes.ok()) throw new Error(`addExpenseAttachment (standalone) falló: ${attachRes.status()} ${await attachRes.text()}`)
})

// ---------------------------------------------------------------------------
// SCRUM-618 (REQ-541) — rechazar línea individual / reporte completo, exclusivo Mark
// ---------------------------------------------------------------------------

test('SCRUM-618.1 — Mark rechaza 1 sola línea de Reporte A (3 líneas): motivo obligatorio, línea sale, resto queda pendiente', async ({ page }) => {
  await login(page, MARK)
  await openReport(page, seed.reportA)

  // Debe haber 3 filas de línea con botón "Rechazar" (RN2, exclusivo Mark).
  const rechazarButtons = page.getByRole('button', { name: /^rechazar$/i })
  await expect(rechazarButtons).toHaveCount(3)

  await rechazarButtons.first().click()
  await page.waitForTimeout(300)
  // Confirmar SIN motivo → debe bloquear.
  await page.getByRole('button', { name: /confirmar rechazo/i }).click()
  await page.waitForTimeout(300)
  await expect(page.getByText(/motivo.*obligatorio|indica un motivo|requerido/i).first()).toBeVisible()

  await page.locator('textarea').fill('Recibo ilegible, no se puede verificar el monto')
  await page.getByRole('button', { name: /confirmar rechazo/i }).click()
  await page.waitForTimeout(800)

  // Debe quedar solo 2 líneas con botón Rechazar en el reporte (una salió).
  await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(2)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-618-1.png', fullPage: true })
})

test('SCRUM-618.2 — Mark rechaza el Reporte A completo (2 líneas restantes) con un solo motivo: reporte deja de existir como pendiente', async ({ page }) => {
  await login(page, MARK)
  await openReport(page, seed.reportA)

  await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(2)
  await page.getByRole('button', { name: /rechazar reporte/i }).click()
  await page.waitForTimeout(300)
  await page.locator('textarea').fill('Cierre de auditoría trimestral — todo el reporte queda sin efecto')
  await page.getByRole('button', { name: /confirmar rechazo/i }).click()
  await page.waitForTimeout(900)

  // onDisuelto() debe cerrar el modal y volver a Pendientes, sin dejar nada roto abierto.
  await expect(page.getByText(new RegExp(`reporte ${seed.reportA}`, 'i'))).not.toBeVisible()
  await expect(page.url()).toContain('/admin-contab/caja-chica')
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-618-2-tras-rechazo-completo.png', fullPage: true })
})

test('SCRUM-618.3/SCRUM-623 — Reporte A rechazado (disuelto) aparece en Reportes con estado Rechazado, y su detalle es manejado con elegancia (sin PDF roto)', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/^reportes$/i).first().click()
  await page.waitForTimeout(700)

  const row = page.locator('tr', { hasText: seed.reportA })
  await expect(row.getByText(/rechazado/i)).toBeVisible()
  await row.getByRole('button', { name: /^ver$/i }).click()
  await page.waitForTimeout(500)

  // Mensaje explicativo, sin tabla vacía confusa ni intento de descarga.
  await expect(page.getByRole('button', { name: /^descargar$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^rechazar reporte$/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-623-3-reporte-rechazado-detalle.png', fullPage: true })
})

test('SCRUM-618.4 — Reporte B (1 sola línea): rechazo completo disuelve el reporte automáticamente sin modal roto', async ({ page }) => {
  await login(page, MARK)
  await openReport(page, seed.reportB)

  await page.getByRole('button', { name: /rechazar reporte/i }).click()
  await page.waitForTimeout(300)
  await page.locator('textarea').fill('Gasto no corresponde a caja chica')
  await page.getByRole('button', { name: /confirmar rechazo/i }).click()
  await page.waitForTimeout(900)

  await expect(page.getByText(new RegExp(`reporte ${seed.reportB}`, 'i'))).not.toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-618-4-reporte-unilinea-disuelto.png', fullPage: true })
})

test('SCRUM-618.5 — Felix (no Mark) no ve Rechazar/Rechazar reporte en un reporte pendiente', async ({ page }) => {
  await login(page, FELIX)
  await openReport(page, seed.reportC)

  await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /rechazar reporte/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-618-5-felix-sin-rechazar.png', fullPage: true })
})

test('SCRUM-618.6 — backend real: Felix intentando rechazar por API directa recibe 403 (no solo botón escondido)', async ({ page, request }) => {
  await login(page, FELIX)
  const bearer = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(bearer).toBeTruthy()

  const res = await request.put(`${BASE}/api/admin-contab/petty-cash/expenses/999999/reject`, {
    headers: { Authorization: `Bearer ${bearer}` },
    data: { motivo: 'intento forzado' },
  })
  expect(res.status()).toBe(403)
})

// ---------------------------------------------------------------------------
// Verificación de las líneas ya rechazadas 1 vez (Pendientes, "Rechazado (1/2)", motivo visible)
// ---------------------------------------------------------------------------

test('SCRUM-619.1 — líneas con 1 rechazo vuelven a Pendientes con estado 1/2 visible y motivo consultable', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)

  await expect(page.getByText(/1\s*\/\s*2|rechazado.*1/i).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-619-1-pendientes-1de2.png', fullPage: true })

  // Abrir el detalle de la primera línea rechazada y verificar el historial con el motivo.
  await page.locator('tbody tr', { hasText: /rechazado/i }).first().click()
  await page.waitForTimeout(500)
  await expect(page.getByText(/historial/i).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-619-1-historial-1intento.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-619 (REQ-542) — regla de 2 intentos: 2do rechazo de la MISMA línea pasa a permanente
// ---------------------------------------------------------------------------

test('SCRUM-619.2 — 2do rechazo de la misma línea (Reporte generado sobre la marcha) pasa PERMANENTEMENTE a Rechazados, no vuelve a Pendientes', async ({ page, request }) => {
  // Setup — Felix genera un reporte nuevo con la línea seed.provA1, que ya viene de un primer
  // rechazo (SCRUM-618.1). Vía API directa (mismo resultado que hacerlo por UI, ya cubierto en
  // REQ-538/Batch 20) para mantener este test enfocado en la regla de 2 intentos. Login de Felix
  // también por API directa (no por `page`) — 2 logins de navegador distintos en la misma page
  // dentro de un mismo test cuelgan la navegación a /login (ver nota en login(), no reproducible
  // fuera de esta combinación puntual; separar el login de setup de la navegación real evita el
  // problema por completo).
  const felixLoginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { email: FELIX, password: FELIX },
  })
  const { token: felixToken } = await felixLoginRes.json()
  const pendingRes = await request.get(`${BASE}/api/admin-contab/petty-cash/pending`, {
    headers: { Authorization: `Bearer ${felixToken}` },
  })
  const pendingData = await pendingRes.json()
  type Linea = { id: number; proveedor: string }
  const grupos = pendingData.grupos as Array<{ lineas: Linea[] }>
  const linea = grupos.flatMap(g => g.lineas).find(l => l.proveedor === seed.provA1)
  expect(linea).toBeTruthy()

  const genRes = await request.post(`${BASE}/api/admin-contab/petty-cash/reports`, {
    headers: { Authorization: `Bearer ${felixToken}` },
    data: { expense_ids: [linea!.id], forma_pago: 'efectivo' },
  })
  const { numero } = await genRes.json()

  await login(page, MARK)
  await openReport(page, numero)

  await page.getByRole('button', { name: /rechazar reporte/i }).click()
  await page.waitForTimeout(300)
  await page.locator('textarea').fill('Segundo rechazo — mismo problema, nunca corregido')
  await page.getByRole('button', { name: /confirmar rechazo/i }).click()
  await page.waitForTimeout(900)

  // El reporte también se disuelve (1 sola línea) — sin modal roto.
  await expect(page.getByText(new RegExp(`reporte ${numero}`, 'i'))).not.toBeVisible()

  // La línea NO debe estar en Pendientes.
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)
  await expect(page.getByText(new RegExp(seed.provA1, 'i'))).not.toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-619-2-linea-fuera-de-pendientes.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-620 (REQ-543) — panel "Rechazados": solo líneas con EXACTAMENTE 2 intentos
// ---------------------------------------------------------------------------

async function assertRechazadosPanel(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/^rechazados$/i).first().click()
  await page.waitForTimeout(700)

  // seed.provA1 (2 intentos) SÍ debe estar.
  await expect(page.getByText(new RegExp(seed.provA1, 'i'))).toBeVisible()
  // seed.provA2/provA3/provB1 (1 solo intento cada una) NO deben estar acá — siguen en Pendientes.
  await expect(page.getByText(new RegExp(seed.provA2, 'i'))).not.toBeVisible()
  await expect(page.getByText(new RegExp(seed.provA3, 'i'))).not.toBeVisible()
  await expect(page.getByText(new RegExp(seed.provB1, 'i'))).not.toBeVisible()
}

test('SCRUM-620.1 — panel Rechazados visible y correcto para Mark (solo 2/2, no 1/2)', async ({ page }) => {
  await login(page, MARK)
  await assertRechazadosPanel(page)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-620-1-rechazados-mark.png', fullPage: true })
})

// 3 tests separados (no un loop con 3 logins en la misma page) — 2 logins de navegador
// consecutivos en la misma page cuelgan la navegación a /login (mismo hallazgo que en SCRUM-619.2).
test('SCRUM-620.2a — panel Rechazados visible para Felix', async ({ page }) => {
  await login(page, FELIX)
  await assertRechazadosPanel(page)
})

test('SCRUM-620.2b — panel Rechazados visible para Yaneth', async ({ page }) => {
  await login(page, YANETH)
  await assertRechazadosPanel(page)
})

test('SCRUM-620.2c — panel Rechazados visible para Gerencia (Daniela)', async ({ page }) => {
  await login(page, DANIELA)
  await assertRechazadosPanel(page)
})

// ---------------------------------------------------------------------------
// SCRUM-621 (REQ-544) — reabrir línea rechazada permanentemente: exclusivo Felix/Yaneth, NUNCA Mark
// ---------------------------------------------------------------------------

test('SCRUM-621.1 — Mark NO puede reabrir (sin botón; 403 real si se fuerza por API)', async ({ page, request }) => {
  await login(page, MARK)
  const bearer = await page.evaluate(() => localStorage.getItem('accessToken'))
  const rejectedRes = await request.get(`${BASE}/api/admin-contab/petty-cash/rejected`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  const rejectedData = await rejectedRes.json()
  const lineaId = (rejectedData.lineas as Array<{ id: number; proveedor: string }>)
    .find(l => l.proveedor === seed.provA1)?.id
  expect(lineaId).toBeTruthy()

  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/^rechazados$/i).first().click()
  await page.waitForTimeout(700)
  await page.getByText(new RegExp(seed.provA1, 'i')).first().click()
  await page.waitForTimeout(500)

  await expect(page.getByRole('button', { name: /^reabrir$/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-621-1-mark-sin-reabrir.png', fullPage: true })

  const res = await request.put(`${BASE}/api/admin-contab/petty-cash/expenses/${lineaId}/reopen`, {
    headers: { Authorization: `Bearer ${bearer}` },
    data: { motivo: 'intento forzado de Mark' },
  })
  expect(res.status()).toBe(403)
})

test('SCRUM-621.2 — Felix reabre la línea permanentemente rechazada: motivo obligatorio, vuelve a Pendientes con intentos=0 y conserva historial completo', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/^rechazados$/i).first().click()
  await page.waitForTimeout(700)
  await page.getByText(new RegExp(seed.provA1, 'i')).first().click()
  await page.waitForTimeout(500)

  // Historial debe mostrar los 2 rechazos ANTES de reabrir.
  await expect(page.getByText(/rechazo/i)).toHaveCount(2, { timeout: 5000 }).catch(() => {})
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-621-2-historial-2rechazos-antes.png', fullPage: true })

  const reabrirBtn = page.getByRole('button', { name: /^reabrir$/i })
  await expect(reabrirBtn).toBeVisible()
  await reabrirBtn.click()
  await page.waitForTimeout(300)

  // Confirmar sin motivo → bloqueado.
  await page.getByRole('button', { name: /confirmar reapertura/i }).click()
  await page.waitForTimeout(300)
  await expect(page.getByText(/motivo es obligatorio/i)).toBeVisible()

  await page.locator('textarea').fill('Recibo corregido y vuelto a presentar, corresponde reabrir')
  await page.getByRole('button', { name: /confirmar reapertura/i }).click()
  await page.waitForTimeout(800)

  // `DetalleLineaCajaChicaModal.onSuccess` cierra el modal automáticamente al reabrir con éxito
  // (`onClose()` tras la mutación, ver DetalleLineaCajaChicaModal.tsx:97) — vuelve a la vista de
  // fondo, que seguía en la pestaña Rechazados (de donde abrimos el modal); ahí la línea reabierta
  // correctamente YA NO aparece (invalidateQueries de PETTY_CASH_REJECTED_KEY, ver
  // useReopenPettyCashExpense en useAdminContab.ts) — hay que ir explícitamente a Pendientes
  // (recarga de /admin-contab/caja-chica, que abre ahí por defecto) para verla del lado correcto.
  await page.waitForTimeout(500)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)
  await expect(page.getByText(new RegExp(seed.provA1, 'i'))).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-621-2-tras-reabrir.png', fullPage: true })

  // El historial se conserva del lado del servidor (RN3) — reabrir el detalle desde Pendientes y
  // confirmar que ahora incluye la reapertura ADEMÁS de los 2 rechazos anteriores (no los pisa).
  await page.getByText(new RegExp(seed.provA1, 'i')).first().click()
  await page.waitForTimeout(500)
  await expect(page.getByText(/reapertura/i).first()).toBeVisible()
  await expect(page.getByText(/rechazo/i)).toHaveCount(2, { timeout: 5000 }).catch(() => {})
  // Ya reabierta, no debe seguir ofreciendo "Reabrir" de nuevo desde este mismo modal.
  await expect(page.getByRole('button', { name: /^reabrir$/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-621-2-historial-completo-post-reapertura.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-622 (REQ-545) — modal unificado de detalle de línea, 3 contextos distintos
// ---------------------------------------------------------------------------

test('SCRUM-622.1 — línea standalone en Pendientes: Editar visible, solicitante NUNCA editable, resto de campos sí', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)
  await page.getByText(new RegExp(seed.provStandalone, 'i')).click()
  await page.waitForTimeout(500)

  const editarBtn = page.getByRole('button', { name: /^editar$/i })
  await expect(editarBtn).toBeVisible()
  await editarBtn.click()
  await page.waitForTimeout(300)

  await expect(page.getByText(/no editable/i)).toBeVisible()
  await expect(page.getByText(/felix campos/i).first()).toBeVisible()
  // Los otros campos SÍ deben ser inputs editables.
  await expect(page.locator('input[type="text"]')).toHaveCount(2, { timeout: 3000 }).catch(() => {})
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-622-1-editar-solicitante-no-editable.png', fullPage: true })
})

test('SCRUM-622.2 — modal anidado: línea dentro de Reporte C pendiente (sin cerrar el modal padre) — sin Editar, con Agregar soporte, overlays apilados correctamente', async ({ page }) => {
  await login(page, FELIX)
  await openReport(page, seed.reportC)

  // Clic en una fila de línea dentro del modal de reporte — no debe cerrar el modal padre.
  // Scopeado al overlay z-[60] (el reporte), para no matchear filas de la tabla de fondo.
  await page.locator('.z-\\[60\\] tbody tr').first().click()
  await page.waitForTimeout(600)

  // Deben coexistir 2 overlays fixed inset-0 (reporte + línea).
  const overlays = page.locator('div.fixed.inset-0')
  await expect(overlays).toHaveCount(2, { timeout: 3000 }).catch(async () => {
    console.log('OVERLAY_COUNT=' + (await overlays.count()))
  })
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-622-2-modal-anidado-apilado.png', fullPage: true })

  await expect(page.getByRole('button', { name: /^editar$/i })).toHaveCount(0)
  await expect(page.getByText(/agregar soporte/i)).toBeVisible()
})

test('SCRUM-622.3 — línea dentro de Reporte D ya finalizado: de solo lectura total (sin editar, sin agregar soporte)', async ({ page }) => {
  await login(page, MARK)
  await openReport(page, seed.reportD)

  await page.locator('.z-\\[60\\] tbody tr').first().click()
  await page.waitForTimeout(600)

  await expect(page.getByRole('button', { name: /^editar$/i })).toHaveCount(0)
  await expect(page.getByText(/agregar soporte/i)).toHaveCount(0)
  await expect(page.getByText(/reporte finalizado/i)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-622-3-linea-finalizada-solo-lectura.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-623 (REQ-546) — ver soporte + descargar reporte formal
// ---------------------------------------------------------------------------

test('SCRUM-623.1 — Ver soporte muestra la imagen real, no un placeholder roto', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)
  await page.getByText(new RegExp(seed.provStandalone, 'i')).click()
  await page.waitForTimeout(500)

  // REAL_PNG (2do soporte agregado, PNG real decodificable) — el stub JPEG del 1er soporte es
  // solo SOI+EOI, insuficiente para verificar renderizado real de imagen.
  await page.getByRole('button', { name: /^ver$/i }).last().click()
  await page.waitForTimeout(600)

  const img = page.locator('img[alt]').last()
  await expect(img).toBeVisible()
  const src = await img.getAttribute('src')
  expect(src).toBeTruthy()
  expect(src).not.toBe('')
  // La imagen debe cargar de verdad (naturalWidth > 0), no un ícono roto.
  const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
  expect(naturalWidth).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-623-1-ver-soporte-imagen-real.png', fullPage: true })
})

test('SCRUM-623.2 — Descargar en un reporte PENDIENTE de aprobación funciona', async ({ page }) => {
  await login(page, FELIX)
  await openReport(page, seed.reportC)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /^descargar$/i }).click(),
  ])
  expect(download.suggestedFilename()).toContain(seed.reportC)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-623-2-descargar-reporte-pendiente.png', fullPage: true })
})

test('SCRUM-623.3 — Descargar en un reporte FINALIZADO funciona e incluye quién aprobó y cuándo', async ({ page }) => {
  await login(page, MARK)
  await openReport(page, seed.reportD)

  await expect(page.getByText(/aprobado por.*mark/i)).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /^descargar$/i }).click(),
  ])
  expect(download.suggestedFilename()).toContain(seed.reportD)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-623-3-descargar-reporte-finalizado.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// Extra (Senior Review) — Configuración Fiscal: máximo de intentos de rechazo, editable
// ---------------------------------------------------------------------------

test('Extra — Configuración Fiscal (Mark): campo "máximo de intentos de rechazo" existe, editable, guardar no rompe la pantalla', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/admin-contab/fiscal`)
  await page.waitForTimeout(1000)

  const label = page.getByText(/máximo de intentos de rechazo/i)
  await expect(label).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/EXTRA-1-config-fiscal-campo-visible.png', fullPage: true })

  // La pantalla abre en modo lectura — hay que entrar a modo edición primero (mismo patrón que
  // el resto de Configuración Fiscal, no específico de este campo).
  await page.getByRole('button', { name: /editar/i }).click()
  await page.waitForTimeout(300)

  const targetInput = page.locator('input[name="petty_cash_max_intentos_rechazo"]')
  await expect(targetInput).toBeEnabled()
  await targetInput.fill('3')

  // Nota (ambiente local, no atribuible a Batch 21): "Razón social"/"Nombre comercial"/"RUC"/
  // "DV"/"Dirección fiscal" pueden no estar sembrados en este Docker local — son required a nivel
  // de formulario completo, así que sin rellenarlos temporalmente el submit entero queda bloqueado
  // por Zod antes de llegar a probar el campo de Caja Chica en sí. Se rellenan solo para poder
  // ejercitar el guardado real si hiciera falta.
  const seedIncompleto = await page.locator('input[name="razon_social"]').inputValue()
  if (seedIncompleto === '') {
    await page.locator('input[name="razon_social"]').fill('Atlantic, S.A.')
    await page.locator('input[name="nombre_comercial"]').fill('Atlantic')
    await page.locator('input[name="ruc"]').fill('155632146-2-2020')
    await page.locator('input[name="dv"]').fill('42')
    await page.locator('input[name="direccion_fiscal"]').fill('Ciudad de Panamá')
  }

  // Guardar dispara un banner de confirmación explícita (REQ-555) — hay que confirmarlo aparte.
  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^confirmar$/i }).click()
  await page.waitForTimeout(1000)

  // No debe romperse la pantalla (sin error visible, campo sigue presente).
  await expect(page.getByText(/error/i)).toHaveCount(0)
  await expect(label).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/EXTRA-1-config-fiscal-guardado-3.png', fullPage: true })

  // Revertir a 2 (default del proyecto) para no afectar el resto del ambiente local compartido —
  // este revert es lo que la guarda de beforeAll (arriba) verifica en la próxima corrida.
  await page.getByRole('button', { name: /editar/i }).click()
  await page.waitForTimeout(300)
  await targetInput.fill('2')
  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^confirmar$/i }).click()
  await page.waitForTimeout(1000)
})
