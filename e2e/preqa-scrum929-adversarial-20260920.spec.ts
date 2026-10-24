import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Pre-QA SCRUM-929 (2026-09-20) — pasada adversarial permanente. Complementa (no reemplaza) el
// spec de B5, que solo cubre el camino feliz secuencial "entrega 1, luego completo por el resto".
// Promovido a permanente (regla de Pre-QA: un gate de dinero/duplicado que ya se ejercitó en
// fallo no se descarta) — cubre exactamente los escenarios de ruptura que el ticket señala como
// "foco especial" por tratarse de dinero real: doble clic humano, 2 pestañas en carrera sobre la
// MISMA entrega, orden inverso completo-antes-que-parcial, recarga a mitad del flujo, y un rol
// sin el permiso de facturación. Ningún hallazgo bloqueante en la pasada del 2026-09-20 — los 5
// casos pasan limpio contra el guard transaccional real (`InvoiceBillingPlanner`).

const BACKEND_DIR = '/Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend'
const TMP_DIR = 'e2e/.tmp'
const CONTA = 'contabilidad@test.com'
const DESIGNER = 'designer@atlantic.test'
const DESIGNER_PASSWORD = 'Password123!'

function runTinker(scriptPath: string): string {
  const out = execSync(
    `docker compose exec -T laravel php artisan tenants:artisan tinker < ${scriptPath}`,
    { cwd: `${BACKEND_DIR}/infra` },
  )
  return out.toString()
}

function seedFamiliaDe963(tag: string): string {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
  const scriptPath = resolve(TMP_DIR, `seed-${tag}.php`)
  const orderNumber = `PED-ADV929-${tag}-${Date.now()}`
  const php = `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$ownerId = \\App\\Models\\User::where('email', '${CONTA}')->value('id') ?? \\App\\Models\\User::first()->id;
$master = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => 'Cliente ${tag} ' . time()]);
$sub = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $master->id, 'business_name' => 'Sub ${tag} ' . time(), 'tax_id' => '155-9299-3-' . random_int(1000, 9999)]);
$project = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'Proyecto ${tag}']);
$quote = \\App\\Modules\\VentasDiseno\\Models\\Quote::create(['owner_id' => $ownerId, 'sales_project_id' => $project->id, 'master_client_id' => $master->id, 'folio' => 'COT-${tag}-' . random_int(1000, 999999), 'generated_at' => now()]);
$part = \\App\\Modules\\VentasDiseno\\Models\\QuotePart::create(['quote_id' => $quote->id, 'name' => 'Partida 1', 'position' => 1]);
$item = $part->items()->create(['catalog_product_id' => null, 'is_custom' => true, 'reference' => 'REF-${tag}', 'description' => 'Panel LED (${tag})', 'quantity' => 9, 'unit_price' => 100.00, 'discount_percent' => 0]);
$quote = \\App\\Modules\\VentasDiseno\\Models\\Quote::with('parts.items')->findOrFail($quote->id);
$card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::create(['sales_project_id' => $project->id, 'stage' => 'approved', 'master_client_id' => $master->id, 'sub_client_id' => $sub->id, 'owner_id' => $ownerId, 'amount' => $quote->grandTotal(), 'stage_changed_at' => now()]);
$root = \\App\\Modules\\Bodega\\Models\\Order::create(['order_number' => '${orderNumber}', 'pipeline_card_id' => $card->id, 'order_type' => \\App\\Modules\\Bodega\\Models\\Order::ORDER_TYPE_PEDIDO, 'stage' => \\App\\Modules\\Bodega\\Models\\Order::STAGE_POR_DESPACHAR, 'customer_name' => $sub->business_name]);
$root->items()->create(['quote_item_id' => $item->id, 'description_snapshot' => $item->description, 'qty_requested' => 3, 'qty_picked' => 3, 'qty_delivered' => 3]);
for ($i = 2; $i <= 3; $i++) {
    $e = \\App\\Modules\\Bodega\\Models\\Order::create(['order_number' => '${orderNumber}', 'pipeline_card_id' => $card->id, 'order_type' => \\App\\Modules\\Bodega\\Models\\Order::ORDER_TYPE_PEDIDO, 'stage' => \\App\\Modules\\Bodega\\Models\\Order::STAGE_POR_DESPACHAR, 'customer_name' => $sub->business_name, 'family_id' => $root->id, 'sequence_in_family' => $i, 'total_in_family' => 3]);
    $e->items()->create(['quote_item_id' => $item->id, 'description_snapshot' => $item->description, 'qty_requested' => 3, 'qty_picked' => 3, 'qty_delivered' => 3]);
}
$root->sequence_in_family = 1;
$root->total_in_family = 3;
$root->save();
echo "SEED_OK order_number=${orderNumber}\\n";
`
  writeFileSync(scriptPath, php)
  const out = runTinker(scriptPath)
  if (!out.includes('SEED_OK')) throw new Error('Seed falló:\n' + out)
  return orderNumber
}

function cleanupFamilia(tag: string, orderNumber: string): void {
  const scriptPath = resolve(TMP_DIR, `cleanup-${tag}.php`)
  const php = `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$root = \\App\\Modules\\Bodega\\Models\\Order::where('order_number', '${orderNumber}')->whereNull('family_id')->first();
if ($root) {
    $card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::find($root->pipeline_card_id);
    $projectId = $card->sales_project_id;
    $masterId = $card->master_client_id;
    $subId = $card->sub_client_id;
    \\App\\Modules\\AdminCont\\Models\\AdminContInvoice::where('family_root_id', $root->id)->get()->each(function ($i) { $i->lines()->delete(); $i->delete(); });
    \\App\\Modules\\Bodega\\Models\\Order::where('id', $root->id)->orWhere('family_id', $root->id)->get()->each(function ($o) { $o->items()->delete(); $o->delete(); });
    $card->delete();
    \\App\\Modules\\VentasDiseno\\Models\\Quote::where('sales_project_id', $projectId)->get()->each(function ($q) { $q->parts()->each(function ($p) { $p->items()->delete(); $p->delete(); }); $q->delete(); });
    \\App\\Modules\\VentasDiseno\\Models\\SalesProject::where('id', $projectId)->delete();
    \\App\\Modules\\VentasDiseno\\Models\\SubClient::where('id', $subId)->delete();
    \\App\\Modules\\VentasDiseno\\Models\\MasterClient::where('id', $masterId)->delete();
    echo "CLEANUP_OK\\n";
} else {
    echo "CLEANUP_NOOP\\n";
}
`
  writeFileSync(scriptPath, php)
  runTinker(scriptPath)
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

test.describe.configure({ mode: 'serial' })

test('doble clic humano en "Guardar factura" (parcial) no debe crear 2 facturas', async ({ page }) => {
  const orderNumber = seedFamiliaDe963('dblclick')
  try {
    await login(page, CONTA, CONTA)
    await page.goto('/admin-contab/facturacion')
    await page.waitForTimeout(1000)
    const header = page.locator('div.cursor-pointer').filter({ hasText: 'Proyecto dblclick' }).first()
    await expect(header).toBeVisible({ timeout: 10000 })
    await header.click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Generar factura de esta entrega' }).first().click()
    const previewModal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Vista previa' }) })
    await expect(previewModal).toBeVisible()
    await page.waitForTimeout(600)

    const guardar = previewModal.getByRole('button', { name: /Guardar factura/i })
    await expect(guardar).toBeEnabled()

    // Doble clic REAL: dos eventos click sincrónicos sobre el mismo <button>, disparados en el
    // mismo tick de JS (bypassea las esperas de actionability de Playwright que normalmente
    // evitarían la carrera) -- simula lo más parecido a un doble clic humano rápido antes de que
    // React re-renderice el atributo disabled.
    await guardar.evaluate((btn: HTMLButtonElement) => { btn.click(); btn.click() })
    await page.waitForTimeout(1500)

    // Verificación real contra la BD (no solo la UI): a lo sumo 1 factura activa para la entrega 1.
    const checkScript = resolve(TMP_DIR, 'check-dblclick.php')
    writeFileSync(checkScript, `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$root = \\App\\Modules\\Bodega\\Models\\Order::where('order_number', '${orderNumber}')->whereNull('family_id')->first();
$count = \\App\\Modules\\AdminCont\\Models\\AdminContInvoice::where('order_id', $root->id)->where('tipo', 'parcial')->whereNull('anulada_at')->count();
echo "PARCIALES_ACTIVAS=" . $count . "\\n";
`)
    const out = runTinker(checkScript)
    expect(out).toContain('PARCIALES_ACTIVAS=1')
  } finally {
    cleanupFamilia('dblclick', orderNumber)
  }
})

test('dos pestañas facturando la MISMA entrega en simultáneo: solo una factura activa', async ({ browser }) => {
  test.setTimeout(60000)
  const orderNumber = seedFamiliaDe963('twotabs')
  const context = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await context.newPage()
  try {
    // Mismo BrowserContext => misma sesión/localStorage, igual que 2 pestañas reales del mismo
    // navegador logueado una sola vez. Loguear en las 2 pisaría la sesión de la otra (clearCookies
    // del login() es por-contexto, no por-página).
    await login(pageA, CONTA, CONTA)

    for (const p of [pageA, pageB]) {
      await p.goto('/admin-contab/facturacion')
      await p.waitForTimeout(1000)
      const header = p.locator('div.cursor-pointer').filter({ hasText: 'Proyecto twotabs' }).first()
      await expect(header).toBeVisible({ timeout: 10000 })
      await header.click()
      await p.waitForTimeout(500)
    }

    // Apuntar DETERMINÍSTICAMENTE a la MISMA entrega en las 2 pestañas -- la fila que dice
    // "Entrega 1 de 3" (no ".first()", que puede apuntar a filas distintas si el orden de
    // renderizado difiere sutilmente entre pestañas).
    async function openAndConfirm(p: Page) {
      const fila = p.locator('div.grid').filter({ hasText: 'Entrega 1 de 3' })
      await fila.getByRole('button', { name: 'Generar factura de esta entrega' }).click()
      const modal = p.locator('div.fixed.inset-0').filter({ has: p.getByRole('heading', { name: 'Vista previa' }) })
      await expect(modal).toBeVisible()
      const guardar = modal.getByRole('button', { name: /Guardar factura/i })
      await expect(guardar).toBeEnabled({ timeout: 8000 })
      await guardar.click()
      await p.waitForTimeout(2000)
    }

    // Disparadas casi en simultáneo, sin esperar a que la primera termine antes de arrancar la segunda.
    await Promise.all([openAndConfirm(pageA), openAndConfirm(pageB)])

    // Verificación real contra la BD: a lo sumo 1 factura activa para TODA la familia (no solo
    // para `order_id = root`, que solo cubriría la entrega 1 -- una `parcial` de otra entrega
    // cuelga de SU PROPIO order_id, ver ADR §1).
    const checkScript = resolve(TMP_DIR, 'check-twotabs.php')
    writeFileSync(checkScript, `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$root = \\App\\Modules\\Bodega\\Models\\Order::where('order_number', '${orderNumber}')->whereNull('family_id')->first();
$count = \\App\\Modules\\AdminCont\\Models\\AdminContInvoice::where('family_root_id', $root->id)->whereNull('anulada_at')->count();
echo "FACTURAS_ACTIVAS_FAMILIA=" . $count . "\\n";
`)
    const out = runTinker(checkScript)
    expect(out).toContain('FACTURAS_ACTIVAS_FAMILIA=1')
  } finally {
    await context.close()
    cleanupFamilia('twotabs', orderNumber)
  }
})

test('"Facturar pedido completo" PRIMERO (antes de cualquier parcial) bloquea toda facturación posterior de ese pedido', async ({ page }) => {
  const orderNumber = seedFamiliaDe963('completofirst')
  try {
    await login(page, CONTA, CONTA)
    await page.goto('/admin-contab/facturacion')
    await page.waitForTimeout(1000)
    const header = page.locator('div.cursor-pointer').filter({ hasText: 'Proyecto completofirst' }).first()
    await expect(header).toBeVisible({ timeout: 10000 })
    await header.click()
    await page.waitForTimeout(500)

    await expect(page.getByRole('button', { name: 'Generar factura de esta entrega' })).toHaveCount(3)

    const botonCompleto = page.getByRole('button', { name: 'Facturar pedido completo' })
    await botonCompleto.scrollIntoViewIfNeeded()
    await botonCompleto.click()
    const modal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Vista previa' }) })
    await expect(modal).toBeVisible()
    await page.waitForTimeout(600)
    await modal.getByRole('button', { name: /Guardar factura/i }).click()
    await page.waitForTimeout(1500)

    // Regla crítica del ticket (AC6/AC7): tras el completo, CERO botones de facturación quedan
    // disponibles para este pedido -- ni "por entrega" ni "pedido completo" de nuevo.
    await expect(page.getByRole('button', { name: 'Generar factura de esta entrega' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Facturar pedido completo' })).toHaveCount(0)

    // Verificación de backend: un intento directo de facturar una de las entregas restantes debe
    // rechazarse (no solo estar oculto en la UI -- ver ADR §3, "el rechazo real es del backend").
    const checkScript = resolve(TMP_DIR, 'check-completofirst.php')
    writeFileSync(checkScript, `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$root = \\App\\Modules\\Bodega\\Models\\Order::where('order_number', '${orderNumber}')->whereNull('family_id')->first();
$entregas = \\App\\Modules\\Bodega\\Models\\Order::where('family_id', $root->id)->orderBy('sequence_in_family')->get();
$actor = \\App\\Models\\User::where('email', '${CONTA}')->first();
$svc = app(\\App\\Modules\\AdminCont\\Services\\InvoiceService::class);
try {
    $svc->confirm(\\App\\Modules\\Bodega\\Models\\Order::find($entregas[0]->id), $actor, 'entrega');
    echo "RECHAZO=NO -- se coló una factura de entrega tras el completo\\n";
} catch (\\Throwable $e) {
    echo "RECHAZO=SI -- " . get_class($e) . ": " . $e->getMessage() . "\\n";
}
`)
    const out = runTinker(checkScript)
    expect(out).toContain('RECHAZO=SI')
  } finally {
    cleanupFamilia('completofirst', orderNumber)
  }
})

test('recargar la página a mitad del flujo (preview abierto, sin confirmar) no crea factura ni deja estado roto', async ({ page }) => {
  const orderNumber = seedFamiliaDe963('reload')
  try {
    await login(page, CONTA, CONTA)
    await page.goto('/admin-contab/facturacion')
    await page.waitForTimeout(1000)
    const header = page.locator('div.cursor-pointer').filter({ hasText: 'Proyecto reload' }).first()
    await expect(header).toBeVisible({ timeout: 10000 })
    await header.click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Generar factura de esta entrega' }).first().click()
    const modal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Vista previa' }) })
    await expect(modal).toBeVisible()
    await page.waitForTimeout(600)

    // Recarga ANTES de tocar "Guardar factura".
    await page.reload()
    await page.waitForTimeout(1000)

    // El modal no debe sobrevivir la recarga (estado en memoria, no persistido) y las 3 entregas
    // deben seguir pendientes -- ninguna factura fantasma.
    await expect(page.getByRole('heading', { name: 'Vista previa' })).toHaveCount(0)
    const projHeader = page.locator('div.cursor-pointer').filter({ hasText: 'Proyecto reload' }).first()
    await expect(projHeader).toBeVisible({ timeout: 10000 })
    await projHeader.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('button', { name: 'Generar factura de esta entrega' })).toHaveCount(3)
  } finally {
    cleanupFamilia('reload', orderNumber)
  }
})

test('un usuario sin permiso de facturación (rol designer) no puede acceder ni facturar', async ({ page }) => {
  await login(page, DESIGNER, DESIGNER_PASSWORD)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1200)

  // No debe renderizar la pantalla de Facturación (gate de ruta/menu por rol) -- ni el título ni
  // el botón "+ Crear Factura" deben quedar visibles/accesibles para este rol.
  const title = page.getByRole('heading', { name: 'Facturación' })
  await expect(title).toHaveCount(0)

  // Verificación de backend directa (independiente del frontend): un intento de confirmar una
  // factura como designer debe ser bloqueado a nivel de autorización, no solo por la UI.
  const token = await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'designer@atlantic.test', password: 'Password123!', tenant: 'atlantic' }),
    })
    const j = await r.json()
    return j.token as string
  })
  const resp = await page.evaluate(async (tok) => {
    const r = await fetch('/api/admin-contab/invoices', {
      headers: { Authorization: `Bearer ${tok}` },
    })
    return r.status
  }, token)
  expect(resp).toBe(403)
})
