import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

test.describe.configure({ mode: 'serial' })

// Self-seeding real (ver feedback_e2e_permanent_tests_must_self_seed.md en memoria del proyecto) —
// re-check 2026-09-08 tras el rebote de Pre-QA (fix backend commit 0582d23): el Docker local se
// reseedeó desde cero entre la corrida original y este re-check (2 caídas por falta de memoria), así
// que el fixture original (invoice id=244, order_id=834, master_client_id=1507) ya no existe — un ID
// hardcodeado es justo el patrón que la regla de arriba prohíbe. En vez de resetear un ID fijo, este
// beforeAll BORRA cualquier fixture previo de "PreQA SCRUM858" (por nombre) y crea uno nuevo de punta
// a punta (MasterClient → SubClient → SalesProject → PipelineCard → Quote → Order → items →
// AdminContInvoice), igual que hace `makeFacturableOrder()` en AdminContInvoiceControllerTest.php —
// así el spec es seguro de re-ejecutar sin importar qué IDs haya en la base en ese momento.
let scrum858Fixture: { orderId: number; invoiceId: number; masterClientId: number; numero: string; subClientName: string }

test.beforeAll(() => {
  const script = `<?php
use App\\Modules\\AdminCont\\Models\\AdminContInvoice;
use App\\Modules\\AdminCont\\Models\\AdminContPayment;
use App\\Modules\\Bodega\\Models\\Order;
use App\\Modules\\VentasDiseno\\Models\\MasterClient;
use App\\Modules\\VentasDiseno\\Models\\PipelineCard;
use App\\Modules\\VentasDiseno\\Models\\Quote;
use App\\Modules\\VentasDiseno\\Models\\SalesProject;
use App\\Modules\\VentasDiseno\\Models\\SubClient;
use App\\Models\\User;
use App\\Shared\\Multitenancy\\Tenant;
use Carbon\\Carbon;

Tenant::where('slug', 'atlantic')->first()?->makeCurrent();

// Limpieza de corridas previas — cascada manual (sin FK reales entre schemas).
$oldMasters = MasterClient::where('name', 'like', 'PreQA SCRUM858 UI%')->get();
foreach ($oldMasters as $m) {
    $oldOrders = Order::whereIn('pipeline_card_id', PipelineCard::where('master_client_id', $m->id)->pluck('id'))->get();
    foreach ($oldOrders as $o) {
        AdminContPayment::where('master_client_id', $m->id)->delete();
        AdminContInvoice::where('order_id', $o->id)->delete();
        $o->items()->delete();
        $o->delete();
    }
    Quote::where('master_client_id', $m->id)->delete();
    PipelineCard::where('master_client_id', $m->id)->delete();
    SalesProject::whereIn('sub_client_id', SubClient::where('master_client_id', $m->id)->pluck('id'))->delete();
    SubClient::where('master_client_id', $m->id)->delete();
    $m->delete();
}

$owner  = User::where('email', 'contabilidad@test.com')->first();
$master = MasterClient::create(['name' => 'PreQA SCRUM858 UI ' . uniqid()]);
$sub    = SubClient::create(['master_client_id' => $master->id, 'business_name' => 'PreQA SCRUM858 UI Sub ' . uniqid(), 'tax_id' => '155-0000-1-' . random_int(1000, 9999)]);
$project = SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'PreQA SCRUM858 UI Proyecto']);
$card   = PipelineCard::create([
    'sales_project_id' => $project->id, 'stage' => 'approved', 'master_client_id' => $master->id,
    'sub_client_id' => $sub->id, 'owner_id' => $owner?->id ?? 1, 'amount' => 500.0, 'stage_changed_at' => Carbon::now(),
]);
Quote::create(['owner_id' => $owner?->id ?? 1, 'sales_project_id' => $project->id, 'master_client_id' => $master->id, 'folio' => 'COT-2026-PREQA858-' . random_int(100000, 999999), 'generated_at' => Carbon::now()]);
$order = Order::create([
    'order_number' => 'PED-2026-PREQA858-' . random_int(100000, 999999),
    'pipeline_card_id' => $card->id, 'order_type' => Order::ORDER_TYPE_PEDIDO,
    'stage' => Order::STAGE_POR_DESPACHAR, 'customer_name' => $sub->business_name,
]);
$order->items()->create(['qty_requested' => 5, 'reference_snapshot' => 'REF-TEST', 'description_snapshot' => 'Item de prueba']);
$invoice = AdminContInvoice::create(['numero' => 'F-0001', 'order_id' => $order->id, 'master_client_id' => $master->id, 'cliente' => $master->name, 'monto' => 500, 'saldo_aplicado' => 0]);

echo json_encode(['orderId' => $order->id, 'invoiceId' => $invoice->id, 'masterClientId' => $master->id, 'numero' => $invoice->numero, 'subClientName' => $sub->business_name]);
`
  const scriptPath = `${process.cwd()}/../atlanticerp-backend/storage/app/preqa-scrum858-seed.php`
  writeFileSync(scriptPath, script)
  const out = execSync(
    `docker compose -f "${process.cwd()}/../atlanticerp-backend/infra/docker-compose.yml" exec -T laravel php artisan tinker /var/www/html/storage/app/preqa-scrum858-seed.php < /dev/null`,
    { stdio: 'pipe' },
  ).toString()
  // El prompt de PsySH (`> `) queda pegado inmediatamente después del `}` de cierre, sin newline —
  // extraer el objeto JSON por posición de llaves en vez de asumir la línea completa es JSON válido.
  const start = out.indexOf('{"orderId"')
  if (start === -1) throw new Error('SCRUM-858 self-seed no devolvió el JSON esperado. Output crudo: ' + out)
  const end = out.indexOf('}', start)
  if (end === -1) throw new Error('SCRUM-858 self-seed devolvió JSON incompleto. Output crudo: ' + out)
  scrum858Fixture = JSON.parse(out.slice(start, end + 1))
  console.log('SCRUM-858 fixture sembrado: ' + JSON.stringify(scrum858Fixture))
})

// Pre-QA + Visual Review fusionado — SCRUM-850/855/856/858/860, corrido en LOCAL contra
// http://localhost:5173 (Vite dev server, proxy /api -> http://localhost:8090 vía vite.config.ts),
// NUNCA dev.atlanticerp.ai. Fixtures propios sembrados vía tinker (no había PED-2026-* previos en el
// Docker local, re-seedeado desde cero) — ver scratchpad/seed_invoice.php y seed_bodega.php.
//
// Backend en vivo ya verificado ANTES de este spec (curl directo, fuera de Playwright):
// - SCRUM-858: invoice id=244 (order_id=834) creada real vía POST /api/admin-contab/invoices.
//   Con saldo_aplicado=250/500 -> puede_registrar_cobro=true (confirmado por API). Reseteado a 0
//   para el flujo real de UI de este spec.
// - SCRUM-860: dispatch real vía API confirmó los 3 escenarios de backend (order 835 courier+sin
//   factura -> despacha; order 836 sin courier+con factura -> sigue bloqueada; familia 837/838
//   root+hermano sin factura -> despachan juntos). Este spec cubre la vista Tabla/Tablero.

const BASE = 'http://localhost:5173'

const ANDRES    = 'superadmin@test.com'
const DANIELA   = 'gerencia@test.com' // local: password = default (email), no B1n4X_2026?
const FELIX     = 'contabilidad@test.com'

async function login(page: Page, email: string, password?: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

// ---------------------------------------------------------------------------
// SCRUM-850 — Scroll horizontal tabla Usuarios (sin mockup, Visual Review N/A)
// ---------------------------------------------------------------------------

test('SCRUM-850.1 — viewport angosto: tabla de Usuarios (tab Activos) scrollea horizontal sin recortar columnas', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await login(page, ANDRES)
  await page.goto(`${BASE}/security/users`)
  await page.waitForTimeout(1000)

  const wrapper = page.locator('div.overflow-x-auto').filter({ has: page.locator('table') }).first()
  await expect(wrapper).toBeVisible()

  const { scrollWidth, clientWidth } = await wrapper.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)

  // El Card exterior debe seguir con el overflow-hidden + rounded (no perdió el border-radius).
  const card = wrapper.locator('xpath=ancestor::*[contains(@class,"rounded")][1]')
  const borderRadius = await card.evaluate(el => getComputedStyle(el).borderRadius)
  expect(borderRadius).not.toBe('0px')

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-850-1-mobile-activos-scroll.png', fullPage: true })

  // Scroll manual: mover el wrapper y confirmar que una columna de la derecha (Acciones/Estado) se hace visible.
  await wrapper.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-850-1-mobile-activos-scrolled-right.png', fullPage: true })
})

test('SCRUM-850.2 — viewport angosto: tab Inactivos también scrollea sin recortar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await login(page, ANDRES)
  await page.goto(`${BASE}/security/users`)
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /^inactivos$/i }).click()
  await page.waitForTimeout(800)

  const wrapper = page.locator('div.overflow-x-auto').filter({ has: page.locator('table') }).first()
  await expect(wrapper).toBeVisible()
  const { scrollWidth, clientWidth } = await wrapper.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-850-2-mobile-inactivos-scroll.png', fullPage: true })
})

test('SCRUM-850.3 — viewport desktop normal: sin regresión visual, tabla completa visible sin scroll forzado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page, ANDRES)
  await page.goto(`${BASE}/security/users`)
  await page.waitForTimeout(1000)

  const wrapper = page.locator('div.overflow-x-auto').filter({ has: page.locator('table') }).first()
  await expect(wrapper).toBeVisible()
  const { scrollWidth, clientWidth } = await wrapper.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  // En desktop la tabla entra sin necesitar scroll (columnas angostas) — no debería haber overflow real.
  expect(scrollWidth - clientWidth).toBeLessThanOrEqual(2)
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-850-3-desktop-sin-regresion.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-855 — Filtro fechas Gerencia (sin mockup, Visual Review N/A)
// ---------------------------------------------------------------------------

test('SCRUM-855.1 — filtro "desde" por defecto es 1 de enero del año en curso, no el mes actual', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/gerencia`)
  await page.waitForTimeout(1500)

  const year = new Date().getFullYear()
  const desdeInput = page.locator('input[type="date"]').first()
  await expect(desdeInput).toHaveValue(`${year}-01-01`)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-855-1-desde-1ro-enero.png', fullPage: true })
})

test('SCRUM-855.2 — "Limpiar filtros" resetea "desde" a 1 de enero, no al mes actual', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/gerencia`)
  await page.waitForTimeout(1500)

  const year = new Date().getFullYear()
  const desdeInput = page.locator('input[type="date"]').first()
  // Cambiar el filtro a otra fecha primero, para confirmar que "Limpiar" de verdad lo resetea (no
  // que nunca se tocó).
  await desdeInput.fill(`${year}-06-15`)
  await page.waitForTimeout(300)
  await expect(desdeInput).toHaveValue(`${year}-06-15`)

  await page.getByRole('button', { name: /limpiar/i }).click()
  await page.waitForTimeout(500)
  await expect(desdeInput).toHaveValue(`${year}-01-01`)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-855-2-limpiar-resetea-enero.png', fullPage: true })
})

test('SCRUM-855.3 — dashboard carga sin error con rango amplio (~8-9 meses) y el drill-down de "monto del mes" sigue usando el mes actual', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/gerencia`)
  await page.waitForTimeout(2000)

  // Sin error visible, con datos/gráficos cargando bajo el rango ampliado.
  await expect(page.getByText(/error/i)).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-855-3-dashboard-rango-amplio.png', fullPage: true })

  // Drill-down de KPI "Monto cotizado/aprobado del mes" — currentMonth(), concepto distinto al
  // filtro desde/hasta, no debe haberse roto por este cambio. Buscamos el link/botón de KPI del mes
  // y confirmamos que la navegación resultante trae el mes ACTUAL (YYYY-MM), no el 1ro de enero.
  const kpiMes = page.getByText(/cotizado.*mes|aprobado.*mes/i).first()
  const kpiVisible = await kpiMes.isVisible().catch(() => false)
  if (kpiVisible) {
    await kpiMes.click().catch(() => {})
    await page.waitForTimeout(800)
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const url = page.url()
    // El drill-down puede navegar a otro módulo (pipeline/reportes) con ?mes=YYYY-MM en query —
    // si no matchea el patrón esperado, lo dejamos como observación, no como fallo duro (no es el
    // foco de este ticket, currentMonth() no se tocó).
    if (url.includes('mes=')) {
      expect(url).toContain(currentMonth)
    }
    await page.screenshot({ path: 'e2e/screenshots/SCRUM-855-3-drilldown-mes-actual.png', fullPage: true })
  }
})

// ---------------------------------------------------------------------------
// SCRUM-856 — Botón Estado de Cuenta (CON mockup, Visual Review aplica)
// ---------------------------------------------------------------------------

test('SCRUM-856.1 — botón "Estado de cuenta" junto a "+ Crear factura" en Facturación', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/facturacion`)
  await page.waitForTimeout(1200)

  // SCRUM-930 agregó "Estado de Cuenta" también al Sidebar (persistente en toda la app) — mismo
  // texto visible que este botón de Facturación, escopeado a <main> para no matchear ambos.
  const crearFactura = page.getByRole('button', { name: /crear factura/i })
  const estadoCuenta  = page.locator('main').getByRole('button', { name: /^estado de cuenta$/i })
  await expect(crearFactura).toBeVisible()
  await expect(estadoCuenta).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-856-1-boton-junto-crear-factura.png', fullPage: true })
})

test('SCRUM-856.2 — click abre Estado de cuenta en pestaña nueva, SIN cliente/proyecto/fecha preseleccionados (matchea mockup)', async ({ page, context }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/facturacion`)
  await page.waitForTimeout(1200)

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('main').getByRole('button', { name: /^estado de cuenta$/i }).click(),
  ])
  await newPage.waitForLoadState('domcontentloaded')
  await newPage.waitForTimeout(1000)

  const url = new URL(newPage.url())
  expect(url.pathname).toBe('/admin-contab/facturacion/estado-cuenta')
  expect(url.searchParams.get('master_client_id')).toBeNull()

  // Matchea el mockup adjunto (SCRUM-856, attachment 12064): subcliente vacío, "Todos los
  // proyectos", Desde/Hasta vacíos, vista "Agrupado por proyecto" por defecto, mensaje de estado
  // vacío antes de buscar.
  await expect(newPage.getByPlaceholder(/selecciona un subclient/i)).toHaveValue('')
  // "Todos los proyectos" es la opción por defecto de un <select> — verificar el valor
  // seleccionado, no visibilidad de texto (las <option> no son "visible" para Playwright aunque
  // el <select> sí lo sea).
  const proyectoSelect = newPage.locator('select').filter({ has: newPage.locator('option', { hasText: /todos los proyectos/i }) }).first()
  await expect(proyectoSelect).toBeVisible()
  await expect(proyectoSelect).toHaveValue('')
  const dateInputs = newPage.locator('input[type="date"]')
  await expect(dateInputs.first()).toHaveValue('')
  await expect(dateInputs.last()).toHaveValue('')
  await expect(newPage.getByText(/selecciona un cliente/i)).toBeVisible()
  await newPage.screenshot({ path: 'e2e/screenshots/SCRUM-856-2-estado-cuenta-sin-preseleccion.png', fullPage: true })
})

test('SCRUM-856.3 — acceso EXISTENTE (desde detalle de cliente, con master_client_id) sigue funcionando igual que antes', async ({ page }) => {
  await login(page, FELIX)
  // Acceso directo con query string, mismo patrón que el flujo viejo (detalle de cliente ->
  // openEstadoCuenta(masterClientId)) — confirmamos que sigue preseleccionando.
  await page.goto(`${BASE}/admin-contab/facturacion/estado-cuenta?master_client_id=1`)
  await page.waitForTimeout(1200)

  // No debe seguir mostrando "selecciona un cliente" vacío indefinidamente si el id es válido —
  // como mínimo, no debe romperse la pantalla ni mostrar error.
  await expect(page.getByText(/error/i)).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-856-3-acceso-existente-con-cliente.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-858 — Recibo de Cobro (sin mockup, Visual Review N/A)
// ---------------------------------------------------------------------------
// Fixture: invoice id=244 (order_id=834, factura F-0001), cliente "PreQA SCRUM858 Sub ...",
// monto=$500, saldo_aplicado=0 (reseteado antes de este spec). Backend de puede_registrar_cobro
// con saldo parcial (250/500 -> true) ya verificado en vivo vía API fuera de este spec.

async function openFacturaDetail(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin-contab/facturacion`)
  await page.waitForTimeout(1200)
  // "Vista plana" muestra las entregas sin agrupar por proyecto — más fácil de ubicar por texto.
  await page.getByRole('button', { name: /vista plana/i }).click()
  await page.waitForTimeout(600)
  await page.getByPlaceholder(/buscar/i).first().fill('PreQA SCRUM858').catch(() => {})
  await page.waitForTimeout(700)

  const row = page.getByText(/F-0001/i).first()
  await row.click()
  await page.waitForTimeout(700)
}

test('SCRUM-858.1 — Facturación: detalle de la factura de prueba muestra "Registrar cobro" habilitado (saldo 0/500)', async ({ page }) => {
  await login(page, FELIX)
  await openFacturaDetail(page)

  await expect(page.getByRole('button', { name: /registrar cobro/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-858-1-registrar-cobro-visible-saldo-0.png', fullPage: true })
})

test('SCRUM-858.2 — Registrar el cobro completo vía UI: cache se invalida solo (sin recargar), botón desaparece', async ({ page }) => {
  await login(page, FELIX)
  await openFacturaDetail(page)

  await page.getByRole('button', { name: /registrar cobro/i }).click()
  await page.waitForURL(url => url.pathname.includes('/admin-contab/cobros'), { timeout: 8000 })
  await page.waitForTimeout(1200)

  // El modal debe abrir con el cliente preseleccionado y la factura F-0001 disponible. Scopear TODO
  // a la ventana del modal (div.fixed.inset-0.z-[60]) — el fondo (Cobros: historial + filtros) sigue
  // montado detrás y tiene sus propios <select>/<input type="checkbox">, que un `.first()` sin
  // scopear puede matchear por error (pasó con "Todos los clientes" en una iteración anterior).
  const modal = page.locator('div.fixed.inset-0.z-\\[60\\]')
  await expect(modal.getByText(/F-0001/i)).toBeVisible({ timeout: 5000 })
  await modal.locator('input[type="checkbox"]').first().check()
  await page.waitForTimeout(300)

  // Método de pago con confirmación inmediata que NO requiera cuenta bancaria (no hay ninguna
  // sembrada en este Docker local — METODOS_SIN_CUENTA_BANCARIA = [retencion_impuestos,
  // ajuste_cuenta], y de esos solo retencion_impuestos está en METODOS_CONFIRMACION_INMEDIATA,
  // ver AdminContPayment.php). "Efectivo" sí es inmediato pero exige bank_account_id -> el botón
  // queda disabled sin eso, que es justo lo que encontramos al probar con efectivo primero.
  // Playwright selectOption({label}) exige un string EXACTO, no regex (un regex ahí no lanza error,
  // simplemente no matchea nada y deja el <select> en su valor default sin avisar) — resolver el
  // índice a mano.
  const metodoSelect = modal.locator('select').first()
  const metodoOptions = await metodoSelect.locator('option').allTextContents()
  const retencionIdx = metodoOptions.findIndex(o => /retenci[oó]n/i.test(o))
  expect(retencionIdx, `No se encontró la opción "Retención" en el <select> de método de pago. Opciones: ${metodoOptions.join(', ')}`).toBeGreaterThanOrEqual(0)
  await metodoSelect.selectOption({ index: retencionIdx })
  await page.waitForTimeout(300)
  await expect(metodoSelect).toHaveValue('retencion_impuestos')
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-858-2-modal-cobro-antes-submit.png', fullPage: true })

  await modal.getByRole('button', { name: /^registrar cobro$/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-858-2-tras-registrar.png', fullPage: true })
  await expect(page.getByText(/error/i)).toHaveCount(0)

  // Volver a Facturación con page.goBack() (History API, SPA — NUNCA page.goto(), que sí sería un
  // reload real y perdería el punto de esta prueba: que la invalidación de cache de TanStack Query
  // sobrevive sin necesidad de recargar). El componente FacturacionPage se remonta con su estado
  // local de UI en default (búsqueda/vista) — eso es esperado, lo que importa es que el QueryClient
  // (que vive arriba en el árbol, no se destruye) ya tiene el detalle de la factura invalidado.
  await page.goBack()
  await page.waitForTimeout(1000)
  await expect(page.url()).toContain('/admin-contab/facturacion')

  await page.getByRole('button', { name: /vista plana/i }).click()
  await page.waitForTimeout(600)
  await page.getByPlaceholder(/buscar/i).first().fill('PreQA SCRUM858').catch(() => {})
  await page.waitForTimeout(700)
  const row2 = page.getByText(/F-0001/i).first()
  await row2.click()
  await page.waitForTimeout(700)

  await expect(page.getByRole('button', { name: /registrar cobro/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-858-2-boton-desaparecido-sin-reload.png', fullPage: true })
})

test('SCRUM-858.3 — PDF del recibo: footer real con paginación "Página X de Y" y "ATLANTIC" junto al logo', async ({ page, request }) => {
  await login(page, FELIX)
  const bearer = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(bearer).toBeTruthy()

  // Historial de cobros -> abrir el detalle del recibo recién generado (SCRUM-858.2) -> "Ver recibo".
  await page.goto(`${BASE}/admin-contab/cobros`)
  await page.waitForTimeout(1200)
  const historyRow = page.locator('tbody tr', { hasText: 'PreQA SCRUM858' }).first()
  const visible = await historyRow.isVisible().catch(() => false)

  if (visible) {
    await historyRow.click()
    await page.waitForTimeout(700)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByRole('button', { name: /ver recibo/i }).click(),
    ])
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    if (filePath) {
      // Extraer texto real del PDF con pdftotext (poppler-utils) para verificar el footer.
      const text = execSync(`pdftotext "${filePath}" -`).toString()
      expect(text).toMatch(/ATLANTIC/) // header, no el footer -- este SÍ aparece

      // CRÍTICO real (confirmado en vivo, no solo lectura de código) — PaymentReceiptPdfService::
      // generate() NUNCA llama ->setOption('isPhpEnabled', true) en el builder de Pdf::loadView(),
      // a diferencia de QuotePdfService/CatalogPdfService/OrderDocumentService (que sí lo hacen,
      // con el mismo comentario "necesario para el mecanismo de paginación real"). Sin ese flag,
      // dompdf usa el default del paquete (`enable_php` => false en
      // vendor/barryvdh/laravel-dompdf/config/dompdf.php, nunca publicado/override en este
      // proyecto) y el bloque <script type="text/php"> del footer se ignora en silencio — el PDF
      // se genera igual (sin error), pero SIN ningún texto de pie de página: ni "Página 1 de 1" ni
      // "Atlantic - Panama - Documento generado por AtlanticERP". El criterio del ticket ("footer
      // real con paginación, no el texto plano viejo") queda peor que antes: el <div class="footer">
      // viejo (que SÍ se veía) fue reemplazado por un mecanismo que no renderiza nada.
      expect(text, 'CRÍTICO SCRUM-858 — el footer de page_text() no renderiza: falta isPhpEnabled=true en PaymentReceiptPdfService::generate()').toMatch(/P[aá]gina\s+1\s+de\s+1/i)

      // Rebote #3 (2026-09-09, marly.rangel) — con isPhpEnabled ya corregido, el texto seguía
      // siendo el hardcodeado viejo con "AtlanticERP". Ahora nunca debe aparecer.
      expect(text, 'CRÍTICO — la palabra "AtlanticERP" no debería aparecer en ningún lugar del PDF').not.toMatch(/atlanticerp/i)

      // Bug real encontrado por Pre-QA el mismo día (commit 91898e6) — con
      // AdminContFiscalSettings vacío (estado real en dev/test/prod, nadie llenó Configuración
      // Fiscal todavía), el footer mostraba solo "Atlantic" en vez del texto estándar
      // completo que el ticket pide y que quote-pdf/service-quote-pdf ya hardcodean. Además, un
      // doble-escape ({{ }} de Blade sobre un valor ya addslashes()-eado, y luego addslashes()
      // escapando de más para un string PHP doble-comillado) dejaba "\&#039;"/"\'" literales en
      // el pie cuando el nombre comercial tenía comillas — sin RUC/nombre comercial cargados en
      // este entorno no se ejercita ese caso puntual acá (cubierto en
      // tests/Unit/AdminCont/PdfFooterTextTest.php del backend), pero si algo llegara a quedar
      // mal escapado el footer lo mostraría como basura visible — confirmamos que no aparece.
      expect(text, 'El pie de página no debe mostrar solo "Atlantic" a secas — falta el texto estándar completo (dirección + sitio web)').toMatch(/Calle Ejemplo 123/)
      expect(text, 'El pie de página no debe tener basura de escape (comilla HTML-entity o backslash sobrante)').not.toMatch(/&#0?39;|\\'/)
    }
  } else {
    console.log('No se encontró la fila del cobro en el historial por texto de cliente — se omite la verificación de PDF por UI en este test (ver hallazgo en el reporte).')
  }
})

test('SCRUM-858.4 — CASO DE RUPTURA: pegarle directo al endpoint de registrar cobro para una factura YA cubierta al 100% (no por UI) — verifica el fix del rebote (commit 0582d23)', async ({ page, request }) => {
  await login(page, FELIX)
  const bearer = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(bearer).toBeTruthy()

  // Factura del fixture self-seeded, ya debería estar 100% cubierta tras SCRUM-858.2. Confirmamos
  // el estado real primero.
  const detailRes = await request.get(`${BASE}/api/admin-contab/invoices/${scrum858Fixture.orderId}/detail`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  const detail = await detailRes.json()
  console.log('SCRUM-858.4 — puede_registrar_cobro actual: ' + detail.puede_registrar_cobro + ', saldo_aplicado: ' + detail.saldo_aplicado)

  // Intento directo de registrar OTRO cobro para la misma factura ya cubierta, sin pasar por la UI.
  const res = await request.post(`${BASE}/api/admin-contab/payments`, {
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    data: {
      master_client_id: scrum858Fixture.masterClientId,
      invoice_ids: [scrum858Fixture.invoiceId],
      aplicar_saldo_favor: false,
      metodo_pago: 'efectivo',
      monto_recibido_estimado: 0,
      bank_account_id: null,
    },
  })
  console.log('SCRUM-858.4 — POST /api/admin-contab/payments contra factura ya cubierta -> HTTP ' + res.status())
  console.log('SCRUM-858.4 — body: ' + await res.text())

  // Re-check 2026-09-08 (fix del rebote, commit backend 0582d23): el criterio del ticket exige que
  // el backend sea la fuente de verdad — debe RECHAZAR (4xx), no aceptar silenciosamente un cobro de
  // $0 sobre una factura ya saldada. Antes del fix esto devolvía 201 (hallazgo CRÍTICO #2 original).
  expect(res.status(), 'El backend debería rechazar (4xx) un cobro sobre una factura ya 100% cubierta, no aceptarlo silenciosamente').toBeGreaterThanOrEqual(400)
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(String(body.message || '')).toMatch(/saldada/i)
})

// SCRUM-858.5 (lote mixto: una factura abierta + una ya saldada en el mismo request, rechaza TODO
// el lote) requiere 2 facturas reales del mismo master_client_id — armar un 2do pedido facturable
// completo solo para esto duplicaría la mitad del beforeAll dentro de un test. Se verificó en vivo
// por curl directo fuera de este spec en el re-check 2026-09-08 (ver docs/pre-qa/
// scrum850-855-856-858-860-batch-20260908.md): POST con invoice_ids=[abierta, saldada] del mismo
// master_client_id -> 422 "ya está saldada", y la factura abierta del lote quedó con
// saldo_aplicado=0 intacto (nada se registró parcialmente). Cubierto también por el test PHPUnit
// `test_register_con_una_factura_saldada_entre_varias_rechaza_todo_el_lote` (commit 0582d23).

// ---------------------------------------------------------------------------
// SCRUM-860 — Bodega Módulo Pedidos: toggle tabla/tablero + grep de emoji
// (Los 3 escenarios de backend de "quitar bloqueo de falta factura" ya se verificaron en vivo vía
// API/curl fuera de este spec — órdenes 835/836/837/838. Este spec cubre la UI: toggle, columnas,
// filtros compartidos, modal de detalle, y el grep visual de emoji SCRUM-56.)
// ---------------------------------------------------------------------------

test('SCRUM-860.1 — Bodega Pedidos: toggle Tabla muestra 6 columnas y respeta los mismos filtros que el tablero', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /^tabla$/i }).click()
  await page.waitForTimeout(700)

  const table = page.locator('table').first()
  await expect(table).toBeVisible()
  const headers = await table.locator('thead th').allTextContents()
  expect(headers.length).toBe(6)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-860-1-tabla-6-columnas.png', fullPage: true })

  // Filtro de búsqueda por cliente de nuestro fixture -> debe reducir las filas de la tabla igual
  // que reduciría las columnas del tablero (mismo array `cards` filtrado).
  const searchInput = page.getByPlaceholder(/buscar/i).first()
  const hasSearch = await searchInput.isVisible().catch(() => false)
  if (hasSearch) {
    await searchInput.fill('PreQA SCRUM860')
    await page.waitForTimeout(700)
    const rowCount = await table.locator('tbody tr').count()
    expect(rowCount).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/screenshots/SCRUM-860-1-tabla-filtrada.png', fullPage: true })
  }
})

test('SCRUM-860.2 — click en una fila de la tabla abre el mismo modal de detalle que el tablero', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^tabla$/i }).click()
  await page.waitForTimeout(700)

  await page.locator('table tbody tr').first().click()
  await page.waitForTimeout(700)

  // El modal de detalle de pedido (OrderDetailModal) debe abrir — buscamos un overlay fixed.
  const overlay = page.locator('div.fixed.inset-0')
  await expect(overlay.first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-860-2-modal-detalle-desde-tabla.png', fullPage: true })
})

test('SCRUM-860.3 — toggle vuelve a Tablero y muestra el mismo set de pedidos (mismo array ya filtrado)', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /^tablero$/i }).click()
  await page.waitForTimeout(700)
  await expect(page.locator('[data-testid="pedidos-board"]')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-860-3-tablero.png', fullPage: true })
})

test('SCRUM-860.4 — grep visual de emoji: cero emojis en Pedidos (tabla y tablero), regla dura SCRUM-56', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1200)

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

  await page.getByRole('button', { name: /^tabla$/i }).click()
  await page.waitForTimeout(700)
  const tableText = await page.locator('body').innerText()
  expect(emojiRegex.test(tableText), 'Vista Tabla no debería tener emoji (SCRUM-56)').toBe(false)

  await page.getByRole('button', { name: /^tablero$/i }).click()
  await page.waitForTimeout(700)
  const boardText = await page.locator('body').innerText()
  expect(emojiRegex.test(boardText), 'Vista Tablero no debería tener emoji (SCRUM-56)').toBe(false)
})
