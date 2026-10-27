import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// SCRUM-929 (B5) — spec permanente y AUTOSEMBRADO: a diferencia de otros specs de este directorio
// que dependen de fixtures sembradas a mano en una sesión pasada (frágil — ver hallazgo de entorno
// 2026-09-19, esos specs quedaron rotos porque los pedidos que esperaban ya no existían en dev), este
// siembra y limpia SU PROPIO pedido en cada corrida, con el script PHP inline en este archivo (no en
// un scratchpad fuera del repo). Cubre en el navegador real el camino completo de "facturar por
// entrega o por pedido completo" que pide la descripción del ticket: una factura `parcial` por
// entrega (con SUS cantidades, no las del pedido entero), y "Facturar pedido completo" cerrando el
// resto sin duplicar ni perder saldo.

const BACKEND_DIR = '/Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend'
const TMP_DIR = 'e2e/.tmp'
// Absolutos: `runTinker()` corre `docker compose` con cwd en atlanticerp-backend/infra, así que una ruta
// relativa a atlanticerp-frontend (donde corre este spec) no resolvería del lado del shell.
const SEED_SCRIPT = resolve(TMP_DIR, 'seed-scrum929-b5.php')
const CLEANUP_SCRIPT = resolve(TMP_DIR, 'cleanup-scrum929-b5.php')

const FELIX = 'contabilidad@test.com'

function runTinker(scriptPath: string): string {
  const out = execSync(
    `docker compose exec -T laravel php artisan tenants:artisan tinker < ${scriptPath}`,
    { cwd: `${BACKEND_DIR}/infra` },
  )
  return out.toString()
}

/** Escribe y corre el seed; devuelve el `order_number` del pedido (único, con timestamp). */
function seedFamiliaDe963(): string {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
  const orderNumber = 'PED-E2E929-' + Date.now()

  const php = `
\\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first()->makeCurrent();
$ownerId = \\App\\Models\\User::where('email', '${FELIX}')->value('id') ?? \\App\\Models\\User::first()->id;
$master = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => 'Cliente E2E929 ' . time()]);
$sub = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $master->id, 'business_name' => 'Sub E2E929 ' . time(), 'tax_id' => '155-9299-1-' . random_int(1000, 9999)]);
$project = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'Proyecto E2E929']);
$quote = \\App\\Modules\\VentasDiseno\\Models\\Quote::create(['owner_id' => $ownerId, 'sales_project_id' => $project->id, 'master_client_id' => $master->id, 'folio' => 'COT-E2E929-' . random_int(1000, 999999), 'generated_at' => now()]);
$part = \\App\\Modules\\VentasDiseno\\Models\\QuotePart::create(['quote_id' => $quote->id, 'name' => 'Partida 1', 'position' => 1]);
$item = $part->items()->create(['catalog_product_id' => null, 'is_custom' => true, 'reference' => 'REF-E2E929', 'description' => 'Panel XL (e2e 929)', 'quantity' => 9, 'unit_price' => 100.00, 'discount_percent' => 0]);
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
  writeFileSync(SEED_SCRIPT, php)
  const out = runTinker(SEED_SCRIPT)
  if (!out.includes('SEED_OK')) {
    throw new Error('El seed de SCRUM-929 B5 no terminó OK. Salida:\n' + out)
  }
  return orderNumber
}

function cleanupFamilia(orderNumber: string): void {
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
  writeFileSync(CLEANUP_SCRIPT, php)
  runTinker(CLEANUP_SCRIPT)
}

test.describe.configure({ mode: 'serial' })

test('SCRUM-929 B5 — pedido de 3 entregas: facturar la 1ra por entrega, luego el resto por "pedido completo", sin duplicar ni perder saldo', async ({ page }) => {
  const orderNumber = seedFamiliaDe963()

  try {
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(FELIX)
    await page.locator('input[type="password"]').fill(FELIX)
    await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
    await page.waitForTimeout(1200)

    await page.goto('/admin-contab/facturacion')
    await page.waitForTimeout(1000)

    const header = page.locator('div.cursor-pointer').filter({ hasText: 'Proyecto E2E929' }).first()
    await expect(header).toBeVisible({ timeout: 10000 })
    await header.click()
    await page.waitForTimeout(500)

    // 3 filas, una por entrega, cada una con su propio botón — no una sola fila por el pedido entero.
    await expect(page.getByText('Entrega 1 de 3')).toBeVisible()
    await expect(page.getByText('Entrega 2 de 3')).toBeVisible()
    await expect(page.getByText('Entrega 3 de 3')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generar factura de esta entrega' })).toHaveCount(3)

    // Factura la 1ra entrega -- SOLO sus 3 unidades (300 base + 21 ITBMS = 321), no las 9 del pedido.
    await page.getByRole('button', { name: 'Generar factura de esta entrega' }).first().click()
    const previewModal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Vista previa' }) })
    await expect(previewModal).toBeVisible()
    await page.waitForTimeout(500)
    await expect(previewModal.getByText('Parcial')).toBeVisible()
    // El aviso de restante ya trae el monto exacto embebido -- 963 (total) - 321 (esta factura) = 642.
    await expect(previewModal.getByText('Después de esta factura quedan USD 642.00 por facturar del pedido.')).toBeVisible()
    await expect(previewModal.getByText('Total factura')).toBeVisible()
    await previewModal.getByRole('button', { name: /Guardar factura/i }).click()
    await page.waitForTimeout(1000)

    // Ahora: 1 fila facturada (parcial, la pastilla de estado) + 2 pendientes + "Facturar pedido completo" (resto: 642).
    const pillFacturada = page.locator('span').filter({ hasText: 'Facturada' })
    await expect(pillFacturada).toBeVisible()
    const botonCompleto = page.getByRole('button', { name: 'Facturar pedido completo' })
    await botonCompleto.scrollIntoViewIfNeeded()
    await expect(botonCompleto).toBeVisible()
    await expect(page.getByText('Quedan USD 642.00 por facturar del pedido')).toBeVisible()

    // Factura el resto de una sola vez.
    await botonCompleto.click()
    await expect(previewModal).toBeVisible()
    await page.waitForTimeout(500)
    await expect(previewModal.getByText('Total factura')).toBeVisible()
    await previewModal.getByRole('button', { name: /Guardar factura/i }).click()
    await page.waitForTimeout(1000)

    // Cierre: ya no queda ningún botón de facturar (ni por entrega ni "pedido completo") para este pedido.
    await expect(page.getByRole('button', { name: 'Generar factura de esta entrega' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Facturar pedido completo' })).toHaveCount(0)
    // Dos filas "Facturada" (la parcial de la entrega 1 + el completo del resto) -- Σ = 963, no más.
    await expect(page.locator('span').filter({ hasText: 'Facturada' })).toHaveCount(2)
  } finally {
    cleanupFamilia(orderNumber)
  }
})
