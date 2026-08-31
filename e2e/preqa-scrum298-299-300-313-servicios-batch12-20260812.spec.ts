import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Visual Review + Pre-QA — Batch 12 Servicios (Cotización — documento formal, historial por
 * ticket, historial global, condiciones configurables), SCRUM-298/299/300/313
 * (REQ-235/236/237/250).
 *
 * Corre contra el stack local (Vite dev server proxy a nginx:8090, ver vite.config.ts).
 *
 * HALLAZGO CRÍTICO real (confirmado contra el mockup 5A__Servicios_Tickets.html —
 * viewCotizacion()/buildCotizacionReadOnlyHtml(), líneas ~2603-2665 — y contra el propio texto de
 * Jira, REQ-236 RN2/Escenario 2: "un clic abre esa cotización específica en modo de solo
 * lectura"): el diseño original de `serviciosApi.serviceQuotes.document()` forzaba un
 * `<a download>` para el botón de cabecera "Ver/Imprimir" (REQ-235) Y para cada fila del
 * historial (REQ-236/REQ-250) — no existía NINGUNA vista en pantalla, solo una descarga silenciosa
 * a disco. Verificado en vivo con Playwright (evento `download` disparado, ninguna UI de
 * visualización). Corregido en el mismo despacho (regla dura de Pre-QA: un hallazgo bloqueante
 * arreglable dentro del alcance aprobado se corrige antes de re-correr el checklist completo):
 * nuevo componente `ServiceQuotePdfViewerModal` (iframe embebido en la propia app, mismo Blob que
 * antes) — "Ver" (el modal) e "Imprimir" (Ctrl+P / ícono de impresión del visor nativo de PDF del
 * navegador dentro del iframe) quedan como el mismo documento (RN4 de REQ-235). Se descartó abrir
 * el blob en una pestaña nueva (`window.open` + navegar esa ventana) — Chrome bloquea en silencio
 * la navegación de nivel superior de OTRA ventana hacia un `blob:` ajeno ("cross-partition blob
 * URL navigation", confirmado con Playwright: la pestaña quedaba en blanco). El iframe, al vivir
 * en el MISMO documento que generó el Object URL, no tiene ese problema.
 *
 * Nota sobre el evento `download` de Playwright en modo headless: Chromium headless (sin perfil de
 * usuario) no siempre tiene el visor de PDF nativo activo y puede reportar un `download` igual al
 * navegar el iframe a un blob de tipo PDF — confirmado que esto es un artefacto del entorno
 * headless (con `--headed` el PDF se renderiza inline sin ningún evento `download`, ver captura
 * `08-inline-viewer.png` de la sesión). Por eso estos tests verifican la señal real de regresión —
 * que se abre `ServiceQuotePdfViewerModal` con un iframe `src` de tipo `blob:` — en vez de la
 * ausencia del evento `download`, que no es un indicador confiable en CI headless.
 *
 * Cuentas reales (password = email, ver memoria project_roster_usuarios_reales_atlanticerp):
 *  - liderservicios@test.com (lider_servicios) — genera/envía/decide cotizaciones, Ajustes
 *    de Servicios visible pero NO editable.
 *  - gerencia@test.com  (management) — Ajustes de Servicios editable (REQ-237 RN1).
 *  - tecnicoservicios2@test.com    (tecnico_servicios) — NO asignado a los tickets de este
 *    fixture, usado para confirmar visibilidad transversal del historial global (REQ-250 RN2).
 */
test.describe.configure({ mode: 'serial' })

const BASE             = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const LIDER_SERVICIOS  = 'liderservicios@test.com'
const MANAGEMENT       = 'gerencia@test.com'
const TECNICO_AJENO    = 'tecnicoservicios2@test.com'

interface Fixture {
  masterClientId: number
  subClientId:    number
  salesProjectId: number
  ticketMultiId:     number  // 2 versiones (rechazada + aprobada) — REQ-236
  ticketMultiNumero: string
  ticketSingleId:    number  // 1 sola versión (borrador) — REQ-236 RN1 "solo se muestra con 2+"
  ticketSingleNumero: string
}

function seedFixture(): Fixture {
  const stamp = Date.now()
  const script = `
\\App\\Shared\\Multitenancy\\Tenant::all()->first()->makeCurrent();

$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => 'E2E PreQA Batch12 ${stamp}', 'default_price_type' => null]);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $mc->id, 'business_name' => 'E2E PreQA Batch12 Sub ${stamp}', 'tax_id' => '8-888-8888', 'delivery_address' => 'Calle E2E, Panama', 'category' => 'a_walkin']);
$sp = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => 'Proyecto E2E ${stamp}', 'tag' => 'both']);

$aaron = \\App\\Models\\User::where('email', 'liderservicios@test.com')->first();
$base = ['tipo' => 'warranty', 'subtipo' => null, 'tipo_instalacion' => 'internal', 'sales_project_id' => $sp->id, 'cliente' => $sc->business_name, 'contacto' => 'Contacto E2E', 'telefono' => '6000-1234', 'email' => 'e2e@preqa-batch12.test', 'direccion' => 'Calle E2E, Panama', 'requerimientos_especiales' => null, 'observaciones' => null, 'estado' => \\App\\Modules\\Servicios\\Models\\Ticket::ESTADO_REPORTED, 'quote_status' => 'pending', 'inspection_report_status' => 'not_applicable', 'internal_technician_id' => null, 'scheduled_at' => null, 'scheduled_ends_at' => null, 'created_by' => $aaron->id];

$t1 = \\App\\Modules\\Servicios\\Models\\Ticket::create(array_merge($base, ['numero' => 'GAR-2026-E2E${stamp}1', 'descripcion' => 'E2E Batch12 multi-version']));
$t2 = \\App\\Modules\\Servicios\\Models\\Ticket::create(array_merge($base, ['numero' => 'GAR-2026-E2E${stamp}2', 'descripcion' => 'E2E Batch12 single-version']));

echo "FIXTURE_JSON:" . json_encode([
  'masterClientId' => $mc->id, 'subClientId' => $sc->id, 'salesProjectId' => $sp->id,
  'ticketMultiId' => $t1->id, 'ticketMultiNumero' => $t1->numero,
  'ticketSingleId' => $t2->id, 'ticketSingleNumero' => $t2->numero,
]) . "\\n";
`
  const stdout = execSync('docker exec -i infra-laravel-1 php artisan tinker', {
    input: script, encoding: 'utf8', timeout: 60000,
  })
  const candidates = stdout.split('\n').filter(l => l.includes('FIXTURE_JSON:'))
  const line = [...candidates].reverse().find(l => l.trim().endsWith('}'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  return JSON.parse(line.split('FIXTURE_JSON:')[1]) as Fixture
}

function cleanupFixture(fx: Fixture) {
  const script = `
\\App\\Shared\\Multitenancy\\Tenant::all()->first()->makeCurrent();
$ticketIds = [${fx.ticketMultiId}, ${fx.ticketSingleId}];
$quoteIds = \\App\\Modules\\Servicios\\Models\\ServiceQuote::whereIn('ticket_id', $ticketIds)->pluck('id');
\\App\\Modules\\Servicios\\Models\\ServiceQuoteItem::whereIn('service_quote_id', $quoteIds)->delete();
\\App\\Modules\\Servicios\\Models\\ServiceQuote::whereIn('id', $quoteIds)->delete();
\\App\\Modules\\Servicios\\Models\\Ticket::whereIn('id', $ticketIds)->delete();
\\App\\Modules\\VentasDiseno\\Models\\SalesProject::where('id', ${fx.salesProjectId})->delete();
\\App\\Modules\\VentasDiseno\\Models\\SubClient::where('id', ${fx.subClientId})->delete();
\\App\\Modules\\VentasDiseno\\Models\\MasterClient::where('id', ${fx.masterClientId})->delete();
echo "CLEANED\\n";
`
  execSync('docker exec -i infra-laravel-1 php artisan tinker', {
    input: script, encoding: 'utf8', timeout: 60000,
  })
}

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: email } })
  const body = await res.json() as { token: string }
  return body.token
}

/** Genera + agrega ítem + envía + decide una cotización completa vía API (mismo flujo que un
 * usuario real) — usado en `beforeAll` para dejar el fixture con 2 versiones (rechazada +
 * aprobada) sin depender de recorrer la UI, que ya se ejercita en los tests mismos. */
async function createFullQuote(
  request: APIRequestContext, token: string, ticketId: number, decision: 'approved' | 'rejected',
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` }
  await request.post(`${BASE}/api/servicios/tickets/${ticketId}/quote`, { headers })
  await request.post(`${BASE}/api/servicios/tickets/${ticketId}/quote/items`, {
    headers,
    data: {
      tipo: 'labor', catalog_product_id: null, is_custom: false, external_technician_id: null,
      description: 'E2E Batch12 mano de obra', quantity: 2, unit_price: 100, margin_percent: null,
    },
  })
  await request.patch(`${BASE}/api/servicios/tickets/${ticketId}/quote/enviar`, { headers })
  await request.patch(`${BASE}/api/servicios/tickets/${ticketId}/quote/decidir`, {
    headers, data: { estado: decision },
  })
}

let fx: Fixture

test.beforeAll(async ({ request }) => {
  fx = seedFixture()
  const token = await apiLogin(request, LIDER_SERVICIOS)
  // ticketMultiId: rechazada (v1) + aprobada (v2) -> historial con 2 versiones (REQ-236).
  await createFullQuote(request, token, fx.ticketMultiId, 'rejected')
  await createFullQuote(request, token, fx.ticketMultiId, 'approved')
  // ticketSingleId: solo 1 cotización en Borrador -> historial NO debe mostrarse (REQ-236 RN1).
  await request.post(`${BASE}/api/servicios/tickets/${fx.ticketSingleId}/quote`, {
    headers: { Authorization: `Bearer ${token}` },
  })
})

test.afterAll(() => {
  cleanupFixture(fx)
})

async function openTicketQuoteModal(page: Page, numero: string): Promise<{ ticket: import('@playwright/test').Locator, quote: import('@playwright/test').Locator }> {
  await page.goto(`${BASE}/servicios/tickets`)
  await page.getByPlaceholder(/buscar/i).first().fill(numero).catch(() => {})
  await page.waitForTimeout(600)
  const row = page.locator('tr', { hasText: numero }).first()
  await row.getByTitle(/ver detalle/i).click()
  const ticket = page.locator('div.z-50').first()
  await expect(ticket.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
  await ticket.getByRole('button', { name: /generar cotización|^borrador$|^enviada$|^aprobada$|^rechazada$/i }).first().click()
  const quote = page.locator('div.z-\\[60\\]').first()
  await expect(quote).toBeVisible()
  await expect(quote.getByText(/cargando/i)).toHaveCount(0, { timeout: 10000 })
  return { ticket, quote }
}

function pdfViewer(page: Page) {
  return page.locator('div.z-\\[70\\]').first()
}

test.describe('Batch 12 — Cotización: documento, historial, condiciones', () => {
  test('SCRUM-298 (REQ-235) — "Ver/Imprimir" abre el visor en pantalla, no una descarga a ciegas', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const { quote } = await openTicketQuoteModal(page, fx.ticketMultiNumero)
    await page.screenshot({ path: 'test-results/b12-235-01-quote-modal.png', fullPage: true })

    await quote.getByRole('button', { name: /ver.imprimir/i }).click()

    const viewer = pdfViewer(page)
    await expect(viewer).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/b12-235-02-pdf-viewer-open.png', fullPage: true })

    // Regresión — antes de este batch, este click hacía un <a download> silencioso: nunca existía
    // NINGÚN modal ni iframe, la "prueba" de que funcionaba era solo un archivo en Descargas.
    const iframe = viewer.locator('iframe')
    await expect(iframe).toBeVisible()
    const src = await iframe.getAttribute('src')
    expect(src).toMatch(/^blob:/)

    await viewer.getByRole('button').last().click() // botón Close (X)
    await expect(viewer).toHaveCount(0)
  })

  test('SCRUM-299 (REQ-236) — historial con 2+ versiones: resalta vigente, abre cada versión en su propio visor', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const { quote } = await openTicketQuoteModal(page, fx.ticketMultiNumero)

    await expect(quote.getByText(/historial de cotizaciones/i)).toBeVisible()
    await expect(quote.getByText('tickets.quoteModal.historyCurrent').or(quote.getByText(/vigente/i))).toBeVisible()
    await page.screenshot({ path: 'test-results/b12-236-01-history-section.png', fullPage: true })

    // La entrada Rechazada (la más vieja) abre SU propio documento — RN2/Escenario 2: "un clic
    // abre esa cotización específica en modo de solo lectura", no siempre la vigente.
    const rejectedRow = quote.locator('button', { hasText: /rechazada/i }).first()
    await expect(rejectedRow).toBeVisible()
    await rejectedRow.click()

    const viewer = pdfViewer(page)
    await expect(viewer).toBeVisible({ timeout: 5000 })
    const iframe = viewer.locator('iframe')
    const src = await iframe.getAttribute('src')
    expect(src).toMatch(/^blob:/)
    await page.screenshot({ path: 'test-results/b12-236-02-history-row-viewer.png', fullPage: true })
  })

  test('REQ-236 RN1 — con una sola versión, la sección de historial NO se muestra', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const { quote } = await openTicketQuoteModal(page, fx.ticketSingleNumero)
    await expect(quote.getByText(/historial de cotizaciones/i)).toHaveCount(0)
  })

  test('SCRUM-300 (REQ-237) — Ajustes de Servicios: Aaron ve Condiciones pero NO puede editar, Gerencia sí y el guardado numérico sigue funcionando', async ({ page }) => {
    await test.step('Aaron (lider_servicios) — visible, todo deshabilitado, sin botón Guardar', async () => {
      await login(page, LIDER_SERVICIOS)
      await page.goto(`${BASE}/servicios/ajustes`)
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'test-results/b12-237-01-settings-aaron.png', fullPage: true })

      const textarea = page.locator('textarea').first()
      await expect(textarea).toBeVisible()
      await expect(textarea).toBeDisabled()
      await expect(page.locator('input[type="number"]').first()).toBeDisabled()
      await expect(page.getByRole('button', { name: /guardar/i })).toHaveCount(0)
    })

    await test.step('Gerencia (management) — Condiciones editable, guarda, un setting numérico también persiste', async () => {
      await login(page, MANAGEMENT)
      await page.goto(`${BASE}/servicios/ajustes`)
      await page.waitForTimeout(800)

      const textarea = page.locator('textarea').first()
      await expect(textarea).toBeEnabled()
      const originalText = await textarea.inputValue()
      await textarea.fill(`${originalText} [e2e-batch12-marker]`)

      const numberInput = page.locator('input[type="number"]').first()
      await expect(numberInput).toBeEnabled()
      const originalNumber = await numberInput.inputValue()
      const newNumber = String(Number(originalNumber) + 1)
      await numberInput.fill(newNumber)

      await page.screenshot({ path: 'test-results/b12-237-02-settings-management-dirty.png', fullPage: true })
      await page.getByRole('button', { name: /guardar/i }).click()
      await page.waitForTimeout(1000)

      await page.reload()
      await page.waitForTimeout(800)
      await expect(page.locator('textarea').first()).toHaveValue(new RegExp('\\[e2e-batch12-marker\\]'))
      await expect(page.locator('input[type="number"]').first()).toHaveValue(newNumber)
      await page.screenshot({ path: 'test-results/b12-237-03-settings-persisted-after-reload.png', fullPage: true })

      // Revertir para no dejar basura en Ajustes reales del entorno local.
      await page.locator('textarea').first().fill(originalText)
      await page.locator('input[type="number"]').first().fill(originalNumber)
      await page.getByRole('button', { name: /guardar/i }).click()
      await page.waitForTimeout(800)
    })
  })

  test('SCRUM-313 (REQ-250) — historial global: chips/conteos, incluye rechazadas, visible para técnico no asignado', async ({ page }) => {
    await login(page, TECNICO_AJENO)
    await page.goto(`${BASE}/servicios/cotizaciones`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'test-results/b12-250-01-global-history-tecnico-ajeno.png', fullPage: true })

    // Escenario 2 (RN2) — visibilidad transversal: Pedro no está asignado a ningún ticket de este
    // fixture, pero debe ver AMBAS versiones (incluida la Rechazada, RN1) igual.
    await page.getByPlaceholder(/buscar/i).fill(fx.ticketMultiNumero)
    await page.waitForTimeout(500)
    await expect(page.getByText(fx.ticketMultiNumero)).toHaveCount(2) // 2 filas (rechazada + aprobada)
    await page.screenshot({ path: 'test-results/b12-250-02-global-history-filtered.png', fullPage: true })

    // Chip "Rechazada" filtra correctamente.
    await page.locator('input').first().fill('')
    await page.waitForTimeout(300)
    const chip = page.getByRole('button', { name: /rechazada/i })
    await expect(chip).toBeVisible()
    await chip.click()
    await page.waitForTimeout(600)
    await expect(page.getByText(fx.ticketMultiNumero)).toHaveCount(1)

    // El acceso directo de una fila abre el visor en pantalla (mismo componente que REQ-235/236),
    // nunca una descarga silenciosa.
    await page.getByRole('button', { name: /tickets\.quotesHistory\.table\.columns\.detail|ver documento/i }).first().click()
    await expect(pdfViewer(page)).toBeVisible({ timeout: 5000 })
  })
})
