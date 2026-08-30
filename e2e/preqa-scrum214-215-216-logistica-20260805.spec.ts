import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA adversarial — SCRUM-214 (REQ-151 filtros/buscador), SCRUM-215 (REQ-152 chip Retrasados),
 * SCRUM-216 (REQ-153 tarjeta de envío). Password default = email.
 *
 * Se siembra el propio fixture en `beforeAll` (tinker vía docker exec) en vez de asumir IDs fijos
 * — un intento anterior de este mismo test hardcodeaba "#195".."#199" de una sesión de siembra
 * manual, y se rompió en la primera corrida siguiente porque `infra/test.sh` comparte la misma
 * Postgres que el stack local y la vació (gotcha ya documentado en el CLAUDE.md del proyecto).
 * Los IDs reales se capturan del stdout de tinker (JSON en la última línea) y se usan en las
 * aserciones — el test es reproducible sin importar el estado previo de la BD local.
 *
 * Re-check Pre-QA 2026-08-05 (bounce de Daniela sobre el filtro de proyecto): se agrega
 * `order200`/`projectSinCotizacion`, un proyecto A PROPÓSITO sin Quote/PipelineCard aprobados,
 * para dejar cobertura permanente del gate que se rompió — el "Filtro de Proyecto" reusaba
 * `approvedProjects.search()` (gateado por `documentStatus()==='approved'`, semántica de
 * REQ-133/Nueva Orden), invisible para cualquier proyecto con envío activo real que no tuviera
 * cotización aprobada vigente. Fix: `shipmentProjects.search()` nuevo, sin ese gate — ver
 * `PurchaseOrderController::searchShipmentProjects()`.
 */
const LIDER_COMPRAS = 'gerencia2@atlantic.com.pa'
const STAMP = Date.now()

interface Fixture {
  providerAlpha: string
  providerBeta: string
  projectUnica: string
  projectDosA: string
  projectDosB: string
  projectSinCotizacion: string
  order195: number
  order196: number
  order197: number
  order198: number
  order199: number
  order200: number
}

function seedFixture(): Fixture {
  const providerAlpha = `PreQA Provider Alpha ${STAMP}`
  const providerBeta = `PreQA Provider Beta ${STAMP}`
  const projectUnica = `PreQA Torre Unica ${STAMP}`
  const projectDosA = `PreQA Torre Dos A ${STAMP}`
  const projectDosB = `PreQA Torre Dos B ${STAMP}`
  const projectSinCotizacion = `PreQA Torre SinCotizacion ${STAMP}`

  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${LIDER_COMPRAS}')->first();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => 'PreQA MC ${STAMP}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $mc->id, 'business_name' => 'PreQA SC ${STAMP}', 'tax_id' => 'TAX-${STAMP}']);
$spUnica = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectUnica}']);
$spDosA = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectDosA}']);
$spDosB = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectDosB}']);
// A propósito SIN Quote/PipelineCard -- mismo caso que datos legados o corrección de cotización;
// nunca pasa por documentStatus()==='approved'. Ver docblock de arriba (re-check 2026-08-05).
$spSinCotizacion = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectSinCotizacion}']);

// El picker de "Buscar proyecto" (approved-projects) solo lista proyectos con Quote confirmada +
// documentStatus()==='approved' (ver QuoteListService::searchApprovedProjects) — spDosA necesita
// esto para el paso 11 del test (filtro de proyecto), a diferencia de spUnica/spDosB que solo se
// usan para el conteo/desglose por línea de la orden, que no depende de este endpoint.
$cardDosA = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::create(['sales_project_id' => $spDosA->id, 'stage' => 'proposal', 'master_client_id' => $mc->id, 'sub_client_id' => $sc->id, 'owner_id' => $owner->id]);
$quoteDosA = \\App\\Modules\\VentasDiseno\\Models\\Quote::create(['master_client_id' => $mc->id, 'sub_client_id' => $sc->id, 'sales_project_id' => $spDosA->id, 'owner_id' => $owner->id, 'status' => 'sent']);
$quoteDosA->folio = 'PREQA-${STAMP}';
$quoteDosA->confirmed_at = now();
$quoteDosA->save();
$providerAlpha = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => '${providerAlpha}', 'currency' => 'USD']);
$providerBeta = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => '${providerBeta}', 'currency' => 'USD']);

$o195 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerAlpha->id, 'created_by' => $owner->id, 'status' => 'ordenado', 'modality' => 'directo', 'shipping_type' => 'terrestre', 'estimated_arrival_date' => '2026-07-02', 'total_amount' => 100]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $o195->id, 'quantity' => 1, 'unit_cost' => 10, 'subtotal' => 10, 'sales_project_id' => $spUnica->id]);

$o196 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerBeta->id, 'created_by' => $owner->id, 'status' => 'en_transito', 'modality' => 'directo', 'shipping_type' => 'maritimo', 'estimated_arrival_date' => '2026-12-01', 'total_amount' => 100]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $o196->id, 'quantity' => 1, 'unit_cost' => 10, 'subtotal' => 10, 'sales_project_id' => $spDosA->id]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $o196->id, 'quantity' => 1, 'unit_cost' => 10, 'subtotal' => 10, 'sales_project_id' => $spDosB->id]);

$o197 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerAlpha->id, 'created_by' => $owner->id, 'status' => 'recibido', 'modality' => 'directo', 'estimated_arrival_date' => '2026-06-01', 'total_amount' => 100]);
$o198 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerAlpha->id, 'created_by' => $owner->id, 'status' => 'por_aprobar', 'modality' => 'directo', 'total_amount' => 100]);
$o199 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerBeta->id, 'created_by' => $owner->id, 'status' => 'en_aduana', 'modality' => 'directo', 'total_amount' => 100]);

$o200 = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $providerAlpha->id, 'created_by' => $owner->id, 'status' => 'en_transito', 'modality' => 'directo', 'shipping_type' => 'aereo', 'estimated_arrival_date' => '2026-09-15', 'total_amount' => 250]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $o200->id, 'quantity' => 1, 'unit_cost' => 250, 'subtotal' => 250, 'sales_project_id' => $spSinCotizacion->id]);

echo "FIXTURE_JSON:" . json_encode(['order195' => $o195->id, 'order196' => $o196->id, 'order197' => $o197->id, 'order198' => $o198->id, 'order199' => $o199->id, 'order200' => $o200->id]) . "\\n";
`

  const stdout = execSync(
    `docker exec -i infra-laravel-1 php artisan tinker`,
    { input: script, encoding: 'utf8', timeout: 60000 },
  )
  const line = stdout.split('\n').find(l => l.includes('FIXTURE_JSON:'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  const ids = JSON.parse(line.split('FIXTURE_JSON:')[1]) as Record<string, number>

  return {
    providerAlpha, providerBeta, projectUnica, projectDosA, projectDosB, projectSinCotizacion,
    order195: ids.order195, order196: ids.order196, order197: ids.order197,
    order198: ids.order198, order199: ids.order199, order200: ids.order200,
  }
}

let fx: Fixture

test.beforeAll(() => {
  fx = seedFixture()
})

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test('SCRUM-214/215/216 — Logística: filtros, chip Retrasados, tarjeta rediseñada', async ({ page }) => {
  await test.step('0) Login lider_compras y abrir Logística', async () => {
    await login(page, LIDER_COMPRAS)
    await page.goto('/compras/logistica')
    await page.waitForSelector('text=Logística')
    // La BD local puede tener otras órdenes activas de sesiones previas — per_page=all para que
    // los 5 fixtures propios no queden ocultos por paginación (default 5 por página).
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.waitFor({ state: 'visible', timeout: 10000 })
    await perPageSelect.selectOption('all')
    // Confirma temprano que useProviders() ya trajo los proveedores del fixture — evita un
    // flake más adelante (paso 9) si esa query todavía no había resuelto.
    const providerSelect = page.locator('select').first()
    await expect(providerSelect.locator('option', { hasText: fx.providerAlpha })).toBeAttached({ timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/scrum214-216-00-logistica.png', fullPage: true })
  })

  await test.step('1) por_aprobar nunca aparece en Logística', async () => {
    await expect(page.getByText(`#${fx.order198}`, { exact: true })).not.toBeVisible()
  })

  await test.step('2) Tarjeta crítica/retrasada — título con ícono de advertencia', async () => {
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
    const titleRow = page.locator('div.font-semibold', { hasText: String(fx.order195) })
    await expect(titleRow.locator('svg')).toBeVisible()
  })

  await test.step('3) Ruta con 2 proyectos abre el modal de desglose', async () => {
    // Acotado a la tarjeta de la orden 196: la BD local puede tener otras órdenes con "2
    // proyectos" de sesiones previas (ej. el propio Pre-QA que corrió antes en esta sesión).
    const card196 = page.locator('div.p-4', { has: page.getByText(`#${fx.order196}`, { exact: true }) }).first()
    const link2proj = card196.getByRole('button', { name: /proyectos/i })
    await expect(link2proj).toBeVisible()
    await link2proj.click()
    // La página acumula muchas tarjetas (cada una con su propio fetch de detalle) — el modal
    // puede tardar más que el resto de las interacciones bajo esa carga.
    await expect(page.getByText('Cargando...')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(fx.projectDosA)).toBeVisible()
    await expect(page.getByText(fx.projectDosB)).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-216-03-modal-desglose.png', fullPage: true })
    await page.locator('.fixed.inset-0 button').first().click()
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible()
  })

  await test.step('4) Orden sin proyecto asignado sigue visible en la lista', async () => {
    await expect(page.getByText(`#${fx.order199}`, { exact: true })).toBeVisible()
  })

  await test.step('5) "Llegada estimada" es texto plano, NO un input', async () => {
    const card195 = page.locator('div.p-4', { has: page.getByText(`#${fx.order195}`, { exact: true }) }).first()
    const label = card195.locator('span', { hasText: 'Llegada estimada' })
    await expect(label).toBeVisible()
    const container = label.locator('xpath=..')
    expect(await container.locator('input').count()).toBe(0)
    await expect(container.locator('p')).toContainText('2026-07-02')
  })

  await test.step('6) "Llegada real" sigue siendo un input editable con label (REQ-156 preservado)', async () => {
    const card195 = page.locator('div.p-4', { has: page.getByText(`#${fx.order195}`, { exact: true }) }).first()
    const label = card195.locator('span', { hasText: 'Llegada real' })
    await expect(label).toBeVisible()
    await expect(label.locator('xpath=..').locator('input[type="date"]')).toBeVisible()
  })

  await test.step('7) Chip "Retrasados" — solo muestra la orden crítica, excluye las demás', async () => {
    await page.getByRole('button', { name: 'Retrasados' }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order196}`, { exact: true })).not.toBeVisible()
    await expect(page.getByText(`#${fx.order197}`, { exact: true })).not.toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-216-07-chip-retrasados.png', fullPage: true })
    await page.getByRole('button', { name: 'Todas' }).click()
    await page.waitForTimeout(400)
  })

  await test.step('8) Buscador de texto libre — matchea por nombre de proyecto único', async () => {
    await page.getByPlaceholder(/Buscar por N/i).fill(fx.projectUnica)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order196}`, { exact: true })).not.toBeVisible()
  })

  await test.step('9) Combinar filtros: buscador + proveedor + chip a la vez, luego "Limpiar filtros" resetea TODO', async () => {
    const providerSelect = page.locator('select').first()
    await providerSelect.selectOption({ label: fx.providerAlpha })
    await page.getByRole('button', { name: 'Retrasados' }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-216-09-filtros-combinados.png', fullPage: true })

    const clearBtn = page.getByRole('button', { name: 'Limpiar filtros' })
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await page.waitForTimeout(600)

    await expect(page.getByPlaceholder(/Buscar por N/i)).toHaveValue('')
    await expect(providerSelect).toHaveValue('')
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order196}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order197}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order199}`, { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-216-09b-post-limpiar.png', fullPage: true })
  })

  await test.step('10) Filtro de Responsable (creador) existe y es distinto del filtro de Proveedor', async () => {
    const count = await page.locator('select').count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  await test.step('11) Filtro de Proyecto — buscar y seleccionar, ver chip de proyecto activo, luego quitarlo', async () => {
    await page.getByPlaceholder(/Buscar proyecto/i).fill(fx.projectDosA)
    await page.waitForTimeout(700)
    const option = page.getByRole('button', { name: new RegExp(fx.projectDosA, 'i') })
    await expect(option).toBeVisible()
    await option.click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order196}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: new RegExp(fx.projectDosA, 'i') }).click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order195}`, { exact: true })).toBeVisible()
  })

  await test.step('12) Filtro de Proyecto encuentra un proyecto SIN cotización aprobada (re-check 2026-08-05, ver docblock de arriba)', async () => {
    await page.getByPlaceholder(/Buscar proyecto/i).fill(fx.projectSinCotizacion)
    await page.waitForTimeout(700)
    const option = page.getByRole('button', { name: new RegExp(fx.projectSinCotizacion, 'i') })
    await expect(option).toBeVisible()
    await option.click()
    await page.waitForTimeout(600)
    await expect(page.getByText(`#${fx.order200}`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(fx.projectSinCotizacion, 'i') }).click()
    await page.waitForTimeout(400)
  })
})

test('SCRUM-214 — regresión en Ver Órdenes: buscador compartido sigue funcionando por N° de orden y proveedor', async ({ page }) => {
  await login(page, LIDER_COMPRAS)
  await page.goto('/compras/ordenes')
  await page.waitForSelector('table')

  await test.step('Buscar por N° de orden exacto', async () => {
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill(String(fx.order196))
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    // Acotado a celdas de tabla: getByText sin acotar también matchea la <option> oculta del
    // <select> de proveedor si el número coincidiera como substring en algún nombre.
    await expect(page.locator('td', { hasText: `#${fx.order196}` }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-orders-regression-search-id.png', fullPage: true })
  })

  await test.step('Buscar por nombre de proveedor', async () => {
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('')
    await searchInput.fill(fx.providerBeta)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    // Acotado a celdas de tabla: un getByText sin acotar matchea también la <option> (oculta)
    // del <select> de proveedor, que comparte el mismo texto.
    await expect(page.locator('td', { hasText: fx.providerBeta }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum214-orders-regression-search-provider.png', fullPage: true })
  })
})
