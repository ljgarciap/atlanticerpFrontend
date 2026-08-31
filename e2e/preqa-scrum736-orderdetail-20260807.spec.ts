import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA adversarial — SCRUM-736 (Detalle de Orden de Compra vs. mockup aprobado), 2026-08-07.
 * Corre contra el stack LOCAL (localhost:5173), nunca dev/test.atlanticerp.ai (regla del ticket).
 *
 * Ya pasaron Senior Review (🟢) y Visual Reviewer (🟢, 0 CRÍTICOs, checklist funcional de los 7
 * elementos del mockup). Este archivo NO repite esa comparación visual — se enfoca en el
 * comportamiento en runtime: doble clic, recarga a mitad de flujo, permisos a nivel de rol
 * (¿el botón se esconde de verdad o solo el backend responde 403?), estado sucio de modales, y un
 * caso de datos que ninguno de los tests unitarios cubre (línea con `catalog_product_id` NULL —
 * reference y factory_reference ambos null a la vez, un escenario real de producto de catálogo
 * borrado después de haber sido pedido, no solo un caso sintético).
 *
 * Fixture propio (mismo patrón que preqa-scrum216-217-timeline-race-recheck-20260806.spec.ts):
 * modelos Eloquent creados directamente por tinker, capturando IDs del stdout — nunca IDs
 * hardcodeados de una corrida anterior.
 */

const LIDER_COMPRAS_EMAIL = 'lidercompras@test.com'
const LIDER_COMPRAS_PASS = 'lidercompras@test.com'
// Candidato de "rol sin permiso de edición" investigado en vivo, no asumido: el módulo Compras
// hoy en el sistema SOLO es visible (`modules.compras.view`) para `lider_compras`/`management`,
// y AMBOS security levels que lo ven tienen `can_edit=true` (confirmado con query directa a
// `security_level_module_permissions` — no existe hoy ningún rol con Compras view-only). El
// candidato real de solo-lectura es distinto: `lider_bodega` NO tiene `compras.view` en su JWT,
// pero `GET /compras/orders/{id}` acepta `permission:compras.read,bodega.read` (OR, ver
// routes/compras.php) — exactamente el mismo puente que usa el botón "Ver orden" del panel "Por
// recibir" de Bodega Home (SCRUM-371/REQ-301). Confirmado en vivo: GET 200, PATCH
// advance/liquidate y PUT update devuelven 403 con este mismo token.
const BODEGA_EMAIL = 'liderbodega@test.com'
const BODEGA_PASS = 'liderbodega@test.com'

interface Fixture {
  stamp: number
  providerLocalId: number
  providerIntlId: number
  agencyId: number
  orderA: number // zona_libre, en_transito_local (next_status=recibido), agencia + pago parcial asignados
  orderB: number // directo, ordenado (next_status=en_transito_local) -- sin liquidacion
  orderC: number // zona_libre, recibido -- estado FINAL, sin next_status
  orderF: number // zona_libre, por_aprobar (requiere Mark) -- Editar orden debe aparecer
  orderE: number // directo, 1 linea con catalog_product_id NULL -- reference y factory_reference ambos null
  // Clon de Orden A dedicado a Escenario 5 -- Escenario 2 AVANZA Orden A de verdad hasta
  // "recibido" (next_status pasa a null), así que reusarla en el test de permisos de rol sería
  // acoplar el resultado a QUÉ test corrió antes en vez del escenario que se quiere probar.
  orderG: number
}

function seedFixture(): Fixture {
  const stamp = Date.now()
  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${LIDER_COMPRAS_EMAIL}')->first();
$stamp = ${stamp};

$provLocal = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => "PreQA736 Prov Local {$stamp}", 'currency' => 'USD', 'origin' => 'local', 'category' => 'locales']);
$provIntl = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => "PreQA736 Prov Intl {$stamp}", 'currency' => 'USD', 'origin' => 'internacional', 'category' => 'europa']);

$prod1 = \\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::create(['reference' => "PREQA736-REF1-{$stamp}", 'factory_reference' => "PREQA736-FAB1-{$stamp}", 'description' => 'PreQA736 Lampara Normal', 'price_full' => 100, 'cost' => 50, 'is_active' => true]);
$prodDoomed = \\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::create(['reference' => "PREQA736-DOOMED-{$stamp}", 'factory_reference' => "PREQA736-DOOMED-FAB-{$stamp}", 'description' => 'PreQA736 Producto A Eliminar', 'price_full' => 75, 'cost' => 40, 'is_active' => true]);

$orderA = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provLocal->id, 'created_by' => $owner->id, 'status' => 'en_transito_local', 'status_changed_at' => now(), 'modality' => 'zona_libre', 'shipping_type' => 'maritimo', 'who_pays_shipping' => 'cliente', 'total_amount' => 800, 'currency' => 'USD', 'requires_primary_approval' => false, 'ordenado_at' => now()->subDays(3), 'en_transito_local_at' => now()]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderA->id, 'catalog_product_id' => $prod1->id, 'quantity' => 8, 'unit_cost' => 100, 'subtotal' => 800]);
$agency = \\App\\Modules\\Compras\\Models\\LiquidationAgency::create(['name' => "PreQA736 Agencia {$stamp}"]);
$orderA->update(['liquidation_agency_id' => $agency->id]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderPayment::create(['purchase_order_id' => $orderA->id, 'amount' => 300, 'payment_proof_storage_key' => 'preqa736/fake-proof.pdf', 'registered_by' => $owner->id]);

$orderB = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provLocal->id, 'created_by' => $owner->id, 'status' => 'ordenado', 'status_changed_at' => now(), 'modality' => 'directo', 'shipping_type' => 'terrestre', 'who_pays_shipping' => 'cliente', 'total_amount' => 200, 'currency' => 'USD', 'requires_primary_approval' => false, 'ordenado_at' => now()]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderB->id, 'catalog_product_id' => $prod1->id, 'quantity' => 2, 'unit_cost' => 100, 'subtotal' => 200]);

$orderC = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provLocal->id, 'created_by' => $owner->id, 'status' => 'recibido', 'status_changed_at' => now(), 'modality' => 'zona_libre', 'shipping_type' => 'maritimo', 'who_pays_shipping' => 'cliente', 'total_amount' => 100, 'currency' => 'USD', 'requires_primary_approval' => false, 'ordenado_at' => now()->subDays(5), 'en_transito_local_at' => now()->subDays(1)]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderC->id, 'catalog_product_id' => $prod1->id, 'quantity' => 1, 'unit_cost' => 100, 'subtotal' => 100]);

$orderF = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provIntl->id, 'created_by' => $owner->id, 'status' => 'por_aprobar', 'status_changed_at' => now(), 'modality' => 'zona_libre', 'shipping_type' => 'aereo', 'who_pays_shipping' => 'atlantic', 'total_amount' => 500, 'currency' => 'USD', 'requires_primary_approval' => true]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderF->id, 'catalog_product_id' => $prod1->id, 'quantity' => 5, 'unit_cost' => 100, 'subtotal' => 500]);

$orderE = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provIntl->id, 'created_by' => $owner->id, 'status' => 'ordenado', 'status_changed_at' => now(), 'modality' => 'directo', 'shipping_type' => 'maritimo', 'who_pays_shipping' => 'cliente', 'total_amount' => 75, 'currency' => 'USD', 'requires_primary_approval' => false, 'ordenado_at' => now()]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderE->id, 'catalog_product_id' => $prodDoomed->id, 'quantity' => 1, 'unit_cost' => 75, 'subtotal' => 75]);
$prodDoomed->delete();

// Clon de Orden A, dedicado a Escenario 5 (rol de solo lectura) -- Escenario 2 avanza Orden A de
// verdad, así que este test de permisos necesita su propia orden con next_status garantizado.
$orderG = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $provLocal->id, 'created_by' => $owner->id, 'status' => 'en_transito_local', 'status_changed_at' => now(), 'modality' => 'zona_libre', 'shipping_type' => 'maritimo', 'who_pays_shipping' => 'cliente', 'total_amount' => 800, 'currency' => 'USD', 'requires_primary_approval' => false, 'ordenado_at' => now()->subDays(3), 'en_transito_local_at' => now()]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $orderG->id, 'catalog_product_id' => $prod1->id, 'quantity' => 8, 'unit_cost' => 100, 'subtotal' => 800]);
$orderG->update(['liquidation_agency_id' => $agency->id]);

echo "FIXTURE_JSON:" . json_encode([
  'stamp' => $stamp,
  'providerLocalId' => $provLocal->id,
  'providerIntlId' => $provIntl->id,
  'agencyId' => $agency->id,
  'orderA' => $orderA->id,
  'orderB' => $orderB->id,
  'orderC' => $orderC->id,
  'orderF' => $orderF->id,
  'orderE' => $orderE->id,
  'orderG' => $orderG->id,
]) . "\\n";
`
  const stdout = execSync(`docker exec -i infra-laravel-1 php artisan tinker`, {
    input: script, encoding: 'utf8', timeout: 60000,
  })
  const candidates = stdout.split('\n').filter(l => l.includes('FIXTURE_JSON:'))
  const line = [...candidates].reverse().find(l => l.trim().endsWith('}'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  return JSON.parse(line.split('FIXTURE_JSON:')[1]) as Fixture
}

/** Borra todo el fixture de esta sesión de Pre-QA -- nunca se deja basura en la BD local. */
function cleanupFixture(fx: Fixture) {
  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
foreach ([${fx.orderA}, ${fx.orderB}, ${fx.orderC}, ${fx.orderF}, ${fx.orderE}, ${fx.orderG}] as $id) {
  $o = \\App\\Modules\\Compras\\Models\\PurchaseOrder::find($id);
  if ($o) { $o->lines()->delete(); $o->payments()->delete(); $o->delete(); }
}
\\App\\Modules\\Compras\\Models\\LiquidationAgency::where('id', ${fx.agencyId})->delete();
\\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::where('reference', 'like', 'PREQA736-%-${fx.stamp}')->delete();
\\App\\Modules\\Compras\\Models\\Provider::whereIn('id', [${fx.providerLocalId}, ${fx.providerIntlId}])->delete();
echo "CLEANUP_DONE\\n";
`
  execSync(`docker exec -i infra-laravel-1 php artisan tinker`, { input: script, encoding: 'utf8', timeout: 60000 })
}

let fx: Fixture

test.beforeAll(() => {
  fx = seedFixture()
})

test.afterAll(() => {
  cleanupFixture(fx)
})

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function tokenFor(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  if (!token) throw new Error('No accessToken en localStorage tras login')
  return token
}

// ─────────────────────────────────────────────────────────────────────────
// Escenario 1 — campos de solo lectura realmente inmutables (criterio 6 de Jira)
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 1 — campos de solo lectura', () => {
  test('orden en_transito_local (Orden A): ningún input/select/textarea en el resumen ni en la tabla de líneas', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderA}`)
    await page.waitForSelector('h1')
    await expect(page.getByText(/PreQA736 Prov Local/).first()).toBeVisible()

    // El único <button> permitido dentro de la sección "Liquidando con" es "Cambiar empresa"
    // (única acción editable aprobada por el criterio). Fuera de esa sección y del botón "Más
    // acciones"/Avanzar/PDF/Ver Órdenes, no debe haber NINGÚN input/select/textarea VISIBLE.
    // (Nota: hay un <input type="file" class="hidden"> real en el DOM -- el trigger oculto de
    // "Subir confirmación del proveedor", ProviderConfirmationCard, sin cambios de SCRUM-736 y
    // fuera de alcance -- por eso se filtra a `:visible`, no a "cero en el DOM".)
    const strayInputs = await page.locator('input:visible, select:visible, textarea:visible').count()
    await expect(page.getByPlaceholder(/buscar agencia/i)).toHaveCount(0)
    expect(strayInputs, 'no debe haber ningún input/select/textarea VISIBLE fuera de un picker abierto').toBe(0)

    // La tabla de líneas: celdas son texto plano, no hay ningún control editable dentro de <tbody>.
    const editableCellControls = await page.locator('tbody input:visible, tbody select:visible, tbody button').count()
    expect(editableCellControls).toBe(0)
    await page.screenshot({ path: 'test-results/scrum736-01-orderA-readonly.png', fullPage: true })
  })

  test('orden por_aprobar (Orden F): "Editar orden" SÍ aparece (aprobado por el mockup: od-editar-wrap), pero fuera de edición sigue todo de solo lectura', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderF}`)
    await page.waitForSelector('h1')

    // Antes de entrar en modo edición: cero inputs.
    const inputsBefore = await page.locator('input, select, textarea').count()
    expect(inputsBefore).toBe(0)

    const editBtn = page.getByRole('button', { name: /^editar orden$/i })
    await expect(editBtn).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum736-02-orderF-editar-visible.png', fullPage: true })

    // Entrar en edición SÍ habilita campos (comportamiento ya aprobado por el mockup: "Solo se
    // puede editar mientras la orden esté 'Por aprobar'") -- confirma que el editor real aparece.
    await editBtn.click()
    await page.waitForTimeout(400)
    const inputsEditing = await page.locator('input, select, textarea').count()
    expect(inputsEditing).toBeGreaterThan(0)

    // Cancelar debe volver a modo lectura sin dejar ningún control editable.
    await page.getByRole('button', { name: /^cancelar$/i }).click()
    await page.waitForTimeout(300)
    const inputsAfterCancel = await page.locator('input, select, textarea').count()
    expect(inputsAfterCancel).toBe(0)
    await expect(page.getByRole('button', { name: /^editar orden$/i })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum736-03-orderF-cancelar-vuelve-readonly.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 2 — doble clic / envíos duplicados
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 2 — doble clic', () => {
  test('doble clic en "Avanzar a: Recibido" (Orden A) dispara UN solo PATCH /advance, backend avanza UNA sola etapa', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderA}`)
    await page.waitForSelector('h1')

    const advanceBtn = page.getByRole('button', { name: /avanzar a: recibido/i })
    await expect(advanceBtn).toBeVisible()

    let advanceRequestCount = 0
    page.on('request', req => {
      if (req.url().includes(`/orders/${fx.orderA}/advance`) && req.method() === 'PATCH') advanceRequestCount++
    })

    await Promise.all([advanceBtn.click(), advanceBtn.click({ force: true }).catch(() => {})])
    await page.waitForTimeout(1500)

    expect(advanceRequestCount, 'un doble clic no debe disparar 2 PATCH /advance reales').toBe(1)

    // Confirma contra el backend (fuente de verdad) que la orden avanzó UNA sola etapa (recibido),
    // no que se haya intentado avanzar 2 veces más allá del último estado.
    const check = execSync(`docker exec -i infra-laravel-1 php artisan tinker`, {
      input: `$tenant = \\App\\Shared\\Multitenancy\\Tenant::first(); $tenant->makeCurrent(); $o = \\App\\Modules\\Compras\\Models\\PurchaseOrder::find(${fx.orderA}); echo "STATUS_JSON:" . json_encode(['status' => $o->status]) . "\\n";`,
      encoding: 'utf8', timeout: 30000,
    })
    const line = [...check.split('\n').filter(l => l.includes('STATUS_JSON:'))].reverse().find(l => l.trim().endsWith('}'))
    const result = JSON.parse(line!.split('STATUS_JSON:')[1]) as { status: string }
    expect(result.status).toBe('recibido')
    await page.screenshot({ path: 'test-results/scrum736-04-doble-clic-avanzar.png', fullPage: true })
  })

  test('doble clic en "Ver Orden (PDF)" (Orden B) dispara como máximo un fetch de PDF por clic real, sin popup extra descontrolado', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderB}`)
    await page.waitForSelector('h1')

    const pdfBtn = page.getByRole('button', { name: /ver orden \(pdf\)/i })
    await expect(pdfBtn).toBeVisible()

    let pdfRequestCount = 0
    page.on('request', req => {
      if (req.url().includes(`/orders/${fx.orderB}/pdf`)) pdfRequestCount++
    })

    const [popup1] = await Promise.all([
      page.waitForEvent('popup').catch(() => null),
      pdfBtn.click(),
    ])
    // Segundo clic inmediato -- el botón debe estar en loading/disabled y no disparar un 2do fetch.
    await pdfBtn.click({ force: true }).catch(() => {})
    await page.waitForTimeout(1500)

    expect(pdfRequestCount, 'un doble clic no debe disparar 2 fetch de PDF').toBe(1)
    if (popup1) await popup1.close().catch(() => {})
    await page.screenshot({ path: 'test-results/scrum736-05-doble-clic-pdf.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 3 — recargar con el menú "Más acciones" abierto
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 3 — recarga a mitad de flujo', () => {
  test('recargar con "Más acciones" abierto y "Incluir costo" desmarcado: no rompe, vuelve al default (checked) sin mensaje viejo colgado', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderA}`)
    await page.waitForSelector('h1')

    await page.getByRole('button', { name: /más acciones/i }).click()
    const checkbox = page.locator('input[type="checkbox"]')
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
    await expect(checkbox).not.toBeChecked()
    await page.screenshot({ path: 'test-results/scrum736-06-menu-abierto-antes-reload.png', fullPage: true })

    await page.reload()
    await page.waitForSelector('h1')

    // El menú no debe quedar "fantasma" abierto tras la recarga (nuevo montaje, estado inicial).
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
    // Ningún mensaje de éxito/error de "Enviar por correo" de la sesión anterior debe sobrevivir.
    await expect(page.getByText(/correo enviado|error al enviar/i)).toHaveCount(0)

    // Reabrir: el checkbox vuelve al default (true) -- no se "recuerda" el estado anterior, pero
    // tampoco crashea ni queda en un estado indefinido/vacío.
    await page.getByRole('button', { name: /más acciones/i }).click()
    await expect(page.locator('input[type="checkbox"]')).toBeChecked()
    await page.screenshot({ path: 'test-results/scrum736-07-menu-tras-reload-default.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 4 — modal de Pagos: cerrar y reabrir no deja estado sucio
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 4 — modal de Pagos, estado sucio', () => {
  test('abrir "Registrar pago", escribir un monto sin guardar, cerrar el modal y reabrir: el form vuelve limpio', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderA}`)
    await page.waitForSelector('h1')

    // Escopado a <main> -- el mismo texto "Pagos a Proveedores" también existe como link del
    // Sidebar (title attr, matchea getByRole('button') por accesibilidad), no solo el trigger
    // del detalle de la orden.
    const main = page.locator('main')
    await main.getByRole('button', { name: /pagos a proveedores/i }).click()
    await expect(page.getByText(/saldo pendiente|balance/i).first()).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: /registrar pago/i }).click()
    const amountInput = page.locator('input[type="number"]').first()
    await amountInput.fill('123.45')
    await expect(amountInput).toHaveValue('123.45')
    await page.screenshot({ path: 'test-results/scrum736-08-pago-form-sucio-antes-cerrar.png', fullPage: true })

    // Cierra el modal con el botón "X" (no Cancelar del form -- el escenario es "cerrar el MODAL
    // completo con datos a medio llenar", no cancelar el form primero).
    await page.locator('button[aria-label="Cerrar"]').click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/saldo pendiente|balance/i)).toHaveCount(0)

    // Reabre: el modal se remonta desde cero (unmount real, no display:none) -- el form de
    // "Registrar pago" no debe estar visible ni el monto '123.45' debe sobrevivir en ningún lado.
    await main.getByRole('button', { name: /pagos a proveedores/i }).click()
    await expect(page.getByText(/saldo pendiente|balance/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('input[type="number"]')).toHaveCount(0) // form de registrar pago colapsado por defecto
    await expect(page.getByText('123.45')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum736-09-pago-modal-reabierto-limpio.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 5 — rol sin permiso de edición (compras.edit=false, pero SÍ ve el detalle)
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 5 — rol de solo lectura', () => {
  test('lider_bodega (bodega.read, sin compras.edit): ve el detalle vía el puente bodega.read, pero ningún botón editable persiste cambios reales', async ({ page }) => {
    await login(page, BODEGA_EMAIL, BODEGA_PASS)
    await page.goto(`/compras/ordenes/${fx.orderG}`)
    await page.waitForSelector('h1', { timeout: 10000 })
    await expect(page.getByText(/PreQA736 Prov Local/).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum736-10-readonly-ve-detalle.png', fullPage: true })

    // Hallazgo real, confirmado en vivo (ver nota en el reporte): "Avanzar a", "Cambiar empresa" y
    // el menú "Más acciones" (Enviar por correo) NO están gateados por permiso en el frontend --
    // solo por status/modalidad, igual que antes de este ticket -- a diferencia de "Aprobar
    // orden", que sí tiene usePermission('compras.approve'). Se documenta el estado real tal cual
    // se ve, no lo que "debería" ser. Pre-existente: no introducido por el diff de 95500cc (mismas
    // condiciones `order.next_status !== null` / `order.modality === 'zona_libre'` ya existían).
    const advanceVisible = await page.getByRole('button', { name: /avanzar a:/i }).isEnabled().catch(() => false)
    const changeAgencyVisible = await page.getByRole('button', { name: /cambiar empresa/i }).isEnabled().catch(() => false)
    test.info().annotations.push({
      type: 'hallazgo-preexistente',
      description: `Para un rol sin compras.edit (solo bodega.read): "Avanzar a" habilitado=${advanceVisible}, "Cambiar empresa" habilitado=${changeAgencyVisible}. Ambos botones responden al click con un 403 real del backend (ver aserciones de abajo), pero la UI no los oculta/deshabilita para este rol -- mismo patrón ya documentado en este archivo para SCRUM-206 (apiErrorMessage), pero sin el fix de "no mostrar un botón que sabemos que va a fallar siempre".`,
    })
    expect(advanceVisible).toBe(true)
    expect(changeAgencyVisible).toBe(true)

    // Lo que SÍ importa para el cierre de ESTE ticket: si el botón está visible y el usuario lo
    // acciona, el BACKEND debe bloquear con 403 -- la mutación real nunca debe persistir, pase lo
    // que pase en el frontend.
    const token = await tokenFor(page)
    const directUpdate = await page.request.put(`/api/compras/orders/${fx.orderG}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { provider_id: fx.providerLocalId, shipping_type: 'maritimo', who_pays_shipping: 'cliente', modality: 'zona_libre', lines: [] },
    })
    expect(directUpdate.status(), 'PUT directo a /orders/{id} sin compras.edit debe devolver 403').toBe(403)

    const directLiquidate = await page.request.patch(`/api/compras/orders/${fx.orderG}/liquidate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { liquidation_agency_id: fx.agencyId },
    })
    expect(directLiquidate.status(), 'PATCH directo a /liquidate sin compras.edit debe devolver 403').toBe(403)

    const directAdvance = await page.request.patch(`/api/compras/orders/${fx.orderG}/advance`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(directAdvance.status(), 'PATCH directo a /advance sin compras.edit debe devolver 403').toBe(403)

    // Hallazgo adicional (menor, informativo): ProviderConfirmationCard pide GET .../documents,
    // que SÍ exige compras.read puro (sin el OR de bodega.read) -- 403 real, pero el componente lo
    // trata igual que "sin documentos subidos" en vez de mostrar un estado de error/permiso.
    let documentsStatus: number | null = null
    page.on('response', res => { if (res.url().includes(`/orders/${fx.orderG}/documents`) && res.request().method() === 'GET') documentsStatus = res.status() })
    await page.reload()
    await page.waitForSelector('h1')
    await page.waitForTimeout(800)
    test.info().annotations.push({
      type: 'hallazgo-preexistente-menor',
      description: `GET /orders/{id}/documents con solo bodega.read devuelve ${documentsStatus} (403 esperado), pero ProviderConfirmationCard muestra "Todavía no se subió la confirmación del proveedor" -- un 403 real se ve indistinguible de "sin documentos". Fuera de alcance de SCRUM-736 (Senior Review ya confirmó que este componente no fue tocado por 95500cc).`,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 6 — modalidad directo: sección "Liquidando con" NO debe aparecer en absoluto
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 6 — modalidad directo sin liquidación', () => {
  test('Orden B (directo): sin sección "Liquidando con" ni botón "Cambiar empresa"/"Liquidar", ni vacía ni oculta con CSS', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderB}`)
    await page.waitForSelector('h1')

    await expect(page.getByText(/liquidando con/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /cambiar empresa/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^liquidar$/i })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum736-11-orderB-sin-liquidacion.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 7 — estado final: sin botón Avanzar ni resto visual de mensajes viejos
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 7 — orden en estado final', () => {
  test('Orden C (recibido, sin next_status): sin botón "Avanzar a", sin ningún resto de "último estado"', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`/compras/ordenes/${fx.orderC}`)
    await page.waitForSelector('h1')

    await expect(page.getByRole('button', { name: /avanzar a:/i })).toHaveCount(0)
    await expect(page.getByText(/ya está en su último estado/i)).toHaveCount(0)
    await expect(page.getByText(/última etapa/i)).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum736-12-orderC-estado-final.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Escenario 8 — línea con catalog_product_id NULL (reference Y factory_reference ambos null)
// ─────────────────────────────────────────────────────────────────────────
test.describe('Escenario 8 — línea con producto de catálogo eliminado', () => {
  test('Orden E: la línea con catalog_product_id NULL no rompe la tabla, muestra "—" en Ref. fábrica Y Referencia pública', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

    await page.goto(`/compras/ordenes/${fx.orderE}`)
    await page.waitForSelector('h1')

    // La descripción también viene de catalogProduct?->description -- con el producto borrado,
    // debe degradar sin romper (celda vacía o "—"), no lanzar una excepción de render.
    const row = page.locator('tbody tr').first()
    await expect(row).toBeVisible()
    const cells = await row.locator('td').allInnerTexts()
    test.info().annotations.push({ type: 'fila-producto-eliminado', description: cells.join(' | ') })

    // Ref. fábrica (col 2) y Referencia pública (col 3) deben mostrar "—" -- ninguna debe quedar
    // vacía sin indicador ni mostrar "undefined"/"null" crudo.
    expect(cells[1]?.trim()).toBe('—')
    expect(cells[2]?.trim()).toBe('—')
    expect(cells.some(c => /undefined|null/i.test(c))).toBe(false)

    const jsErrors = errors.filter(e => !/favicon|ResizeObserver/i.test(e))
    expect(jsErrors, `errores de consola/render: ${jsErrors.join('; ')}`).toEqual([])
    await page.screenshot({ path: 'test-results/scrum736-13-orderE-producto-eliminado.png', fullPage: true })
  })
})
