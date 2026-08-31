import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-734 "Correcciones Detalladas y Flujo completo para revision de
 * Crear Nueva Cotización" (versionado real de cotización, sin clonar el
 * proyecto). Corre contra el Vite dev server local con proxy /api al stack
 * Docker local (mismo commit que dev.atlanticerp.ai al momento de esta corrida,
 * confirmado por `git log -1`). Cuentas reales del roster (password = email).
 * Se siembra el propio fixture en `beforeAll` vía tinker — no asume estado
 * previo de la BD local.
 */
test.describe.configure({ mode: 'serial' })

const VENDEDOR_SIN_PERMISO = 'vendedordisenador@test.com'
const OTRO_VENDEDOR_SIN_PERMISO = 'vendedordisenador2@test.com'
const MARK = 'gerencia3@test.com'
const MANAGEMENT = 'gerencia@test.com'

const STAMP = Date.now()

function tinker(script: string): string {
  return execSync(`docker exec -i infra-laravel-1 php artisan tinker`, {
    input: script, encoding: 'utf8', timeout: 60000,
  })
}

function tinkerResult(script: string, marker: string): string {
  const stdout = tinker(script)
  const line = stdout.split('\n')
    .map(l => l.replace(/^>\s*/, ''))
    .find(l => l.startsWith(`${marker}:`))
  if (line === undefined) {
    throw new Error(`Marcador "${marker}" no encontrado, salida de tinker:\n${stdout}`)
  }
  return line.slice(marker.length + 1)
}

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// GRUPO A — "Usar como base para nueva versión" por fila de la tabla de
// versiones: RN3 exige que sea "disponible sobre cualquier versión del
// historial, no solo la más reciente" — es decir, el botón de la fila de la
// v1 debe basar la nueva versión en v1, no en lo que esté abierto en pantalla.
// ---------------------------------------------------------------------------
test.describe('GRUPO A — Usar como base por fila específica (RN3, sección 3)', () => {
  const MASTER = `PreQA734 Master ${STAMP}`
  const SUB = `PreQA734 Sub ${STAMP}`
  const PROJECT = `PreQA734 Torre ${STAMP}`
  let projectId = ''
  let v1Id = ''
  let v3Id = ''

  test.beforeAll(() => {
    // v1 total=100 (1 ítem $100), v3 total=900 (1 ítem $900) — inequívocos entre sí.
    const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
// firstOrCreate en cada paso — idempotente si el buffer piped a tinker se
// reevalúa dos veces en la misma sesión (quirk observado del entorno local).
$owner = \\App\\Models\\User::where('email', '${VENDEDOR_SIN_PERMISO}')->first();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::firstOrCreate(['name' => '${MASTER}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::firstOrCreate(['master_client_id' => $mc->id, 'business_name' => '${SUB}'], ['tax_id' => 'TAX-${STAMP}']);
$proj = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::firstOrCreate(['sub_client_id' => $sc->id, 'name' => '${PROJECT}']);
$arch = \\App\\Modules\\VentasDiseno\\Models\\Architect::firstOrCreate(['sub_client_id' => $sc->id, 'name' => 'PreQA734 Arch'], ['phone' => '6000-0000']);
$contact = \\App\\Modules\\VentasDiseno\\Models\\SubClientContact::firstOrCreate(['sub_client_id' => $sc->id, 'name' => 'PreQA734 Contact'], ['role' => 'client', 'phone' => '6111-1111']);

$card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::firstOrCreate(['sales_project_id' => $proj->id], ['stage' => 'quote', 'master_client_id' => $mc->id, 'sub_client_id' => $sc->id, 'owner_id' => $owner->id, 'stage_changed_at' => now(), 'amount' => 900]);

// idempotente por folio (firstOrCreate) — el entorno de tinker vía stdin
// pipeado a veces reevalúa el buffer completo dos veces, esto evita un
// UniqueConstraintViolationException si eso pasa.
$makeQuote = function($folio, $confirmedAt, $itemPrice) use ($proj, $sc, $mc, $arch, $contact, $owner) {
    $existing = \\App\\Modules\\VentasDiseno\\Models\\Quote::where('folio', $folio)->first();
    if ($existing !== null) { return $existing; }
    $q = \\App\\Modules\\VentasDiseno\\Models\\Quote::create([
        'master_client_id' => $mc->id, 'sub_client_id' => $sc->id, 'sales_project_id' => $proj->id,
        'ruc' => 'TAX-X', 'description' => 'PreQA734 v', 'owner_id' => $owner->id, 'architect_id' => $arch->id,
        'delivery_type' => 'single', 'folio' => $folio, 'generated_at' => $confirmedAt, 'confirmed_at' => $confirmedAt,
        'conditions_text' => 'x',
    ]);
    $q->contacts()->attach($contact->id);
    $q->deliveryDates()->create(['date' => '2026-12-31']);
    $part = $q->parts()->create(['name' => 'Sala', 'position' => 0]);
    $part->items()->create(['is_custom' => true, 'reference' => 'ITEM-'.$folio, 'description' => 'Item', 'quantity' => 1, 'unit_price' => $itemPrice, 'cost' => 10]);
    return $q;
};

$v1 = $makeQuote('PQ734-${STAMP}-V1', now()->subDays(3), 100);
$v2 = $makeQuote('PQ734-${STAMP}-V2', now()->subDays(2), 500);
$v3 = $makeQuote('PQ734-${STAMP}-V3', now()->subDays(1), 900);

echo "PROJECT_ID:" . $proj->id . "\\n";
echo "V1_ID:" . $v1->id . "\\n";
echo "V3_ID:" . $v3->id . "\\n";
`
    projectId = tinkerResult(script, 'PROJECT_ID')
    v1Id = tinkerResult(script, 'V1_ID')
    v3Id = tinkerResult(script, 'V3_ID')
    expect(projectId).not.toBe('')
  })

  test('1. Viendo v3 (la más reciente), clic en "Usar como base" de la FILA de v1 — la nueva versión debe basarse en v1 ($100), no en v3 ($900)', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto(`/ventas-diseno/quotes-list?viewQuote=${v3Id}`)
    await page.waitForTimeout(1000)

    await expect(page.getByText('Versiones de este proyecto')).toBeVisible({ timeout: 8000 })
    // Localizar la fila de v1 por su folio DENTRO de la tabla "Versiones de este
    // proyecto" (la última <table> del documento) — la lista principal de
    // Cotizaciones detrás del modal también tiene una fila con el mismo folio y
    // su propio botón de fila (RN3.1), así que un locator sin acotar es ambiguo.
    const versionsTable = page.locator('table').last()
    const v1Row = versionsTable.locator('tr').filter({ hasText: `PQ734-${STAMP}-V1` })
    await expect(v1Row).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/A1-versions-table-viewing-v3.png' })

    await v1Row.getByRole('button', { name: 'Usar como base para nueva versión' }).click()
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 10000 })
    await page.waitForTimeout(800)
    const newDraftUrl = page.url()
    const newDraftId = newDraftUrl.match(/quotes\/(\d+)/)?.[1]
    expect(newDraftId).toBeTruthy()
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/A2-new-draft-after-click.png' })

    // Verificación server-side: ¿el nuevo Borrador copió el ítem de v1 ($100) o el de v3 ($900)?
    const itemPrice = tinkerResult(`
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$q = \\App\\Modules\\VentasDiseno\\Models\\Quote::with('parts.items')->find(${newDraftId});
$item = $q->parts->first()?->items->first();
echo "ITEM_PRICE:" . ($item?->unit_price ?? 'NONE') . "\\n";
`, 'ITEM_PRICE')

    expect(itemPrice, 'RN3: "Usar como base" de la fila de v1 debe copiar el ítem de v1 ($100), no el de v3 ($900) que estaba abierto en pantalla').toBe('100')
  })
})

// ---------------------------------------------------------------------------
// GRUPO B — RN2.2: una cotización confirmada nunca se edita directamente, ni
// por el formulario general ni agregando/editando/borrando un ítem — la única
// vía es "Usar como base para nueva versión". Este es el gate que Senior
// Review encontró roto y corrigió retroactivamente (commit 56cb6f6, mismo día)
// para store/update/bulkStore/destroy de QuoteItemController y QuotePartController
// — Pre-QA lo re-verifica en vivo, no confía en el docblock.
// ---------------------------------------------------------------------------
test.describe('GRUPO B — Inmutabilidad de cotización confirmada (RN2.2)', () => {
  const MASTER = `PreQA734B Master ${STAMP}`
  const SUB = `PreQA734B Sub ${STAMP}`
  const PROJECT = `PreQA734B Torre ${STAMP}`
  let quoteId = ''
  let partId = ''

  test.beforeAll(() => {
    const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${VENDEDOR_SIN_PERMISO}')->first();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::firstOrCreate(['name' => '${MASTER}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::firstOrCreate(['master_client_id' => $mc->id, 'business_name' => '${SUB}'], ['tax_id' => 'TAX-${STAMP}B']);
$proj = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::firstOrCreate(['sub_client_id' => $sc->id, 'name' => '${PROJECT}']);
$arch = \\App\\Modules\\VentasDiseno\\Models\\Architect::firstOrCreate(['sub_client_id' => $sc->id, 'name' => 'PreQA734B Arch'], ['phone' => '6000-0000']);

$q = \\App\\Modules\\VentasDiseno\\Models\\Quote::where('folio', 'PQ734B-${STAMP}')->first();
if ($q === null) {
    $q = \\App\\Modules\\VentasDiseno\\Models\\Quote::create([
        'master_client_id' => $mc->id, 'sub_client_id' => $sc->id, 'sales_project_id' => $proj->id,
        'ruc' => 'TAX-X', 'description' => 'PreQA734B confirmed', 'owner_id' => $owner->id, 'architect_id' => $arch->id,
        'delivery_type' => 'single', 'folio' => 'PQ734B-${STAMP}', 'generated_at' => now(), 'confirmed_at' => now(),
        'conditions_text' => 'x',
    ]);
    $part = $q->parts()->create(['name' => 'Sala', 'position' => 0]);
    $part->items()->create(['is_custom' => true, 'reference' => 'ITEM-B', 'description' => 'Item', 'quantity' => 1, 'unit_price' => 100, 'cost' => 10]);
}
$part = $q->parts()->first();

echo "QUOTE_ID:" . $q->id . "\\n";
echo "PART_ID:" . $part->id . "\\n";
`
    quoteId = tinkerResult(script, 'QUOTE_ID')
    partId = tinkerResult(script, 'PART_ID')
    expect(quoteId).not.toBe('')
  })

  test('1. UI: el formulario de una cotización confirmada está completamente deshabilitado (canEdit=false), sin importar que el botón "Editar" siga visible', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto(`/ventas-diseno/quotes/${quoteId}`)
    await page.waitForTimeout(1000)
    // Debe abrir directo en Vista Previa (folio ya asignado) o el toggle a Formulario
    // debe mostrar todo disabled.
    const formToggle = page.getByRole('button', { name: 'Formulario' })
    if (await formToggle.isVisible()) await formToggle.click()
    await page.waitForTimeout(500)
    const masterInput = page.locator('label:has-text("Cliente Master") + input')
    await expect(masterInput).toBeDisabled()
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/B1-confirmed-form-disabled.png' })
  })

  test('2. Backend (HTTP real): POST de un ítem nuevo sobre una cotización confirmada es rechazado con 422 (gate ensureEditable, fix retroactivo 56cb6f6)', async () => {
    const loginOut = execSync(
      `curl -s -X POST http://localhost:8090/api/auth/login -H "Content-Type: application/json" `
      + `-d '{"email":"${VENDEDOR_SIN_PERMISO}","password":"${VENDEDOR_SIN_PERMISO}","tenant":"atlantic"}'`,
      { encoding: 'utf8' },
    )
    const token = JSON.parse(loginOut).token as string
    expect(token).toBeTruthy()

    const itemOut = execSync(
      `curl -s -w "\\nHTTP_STATUS:%{http_code}" -X POST `
      + `http://localhost:8090/api/ventas-diseno/quotes/${quoteId}/parts/${partId}/items `
      + `-H "Authorization: Bearer ${token}" -H "Content-Type: application/json" `
      + `-d '{"reference":"ITEM-INTENTO-BYPASS","description":"x","quantity":1,"unit_price":999}'`,
      { encoding: 'utf8' },
    )
    const status = itemOut.match(/HTTP_STATUS:(\d+)/)?.[1]
    expect(status, `Respuesta completa: ${itemOut}`).toBe('422')
    expect(itemOut).toContain('no se puede editar directamente')

    // Segunda vía de bypass: DELETE del ítem real existente sobre la misma cotización confirmada.
    const realItemId = tinkerResult(`
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$part = \\App\\Modules\\VentasDiseno\\Models\\QuotePart::find(${partId});
echo "ITEM_ID:" . ($part->items->first()->id ?? 'NONE') . "\\n";
`, 'ITEM_ID')
    const deleteRealOut = execSync(
      `curl -s -w "\\nHTTP_STATUS:%{http_code}" -X DELETE `
      + `http://localhost:8090/api/ventas-diseno/quotes/${quoteId}/parts/${partId}/items/${realItemId} `
      + `-H "Authorization: Bearer ${token}"`,
      { encoding: 'utf8' },
    )
    const deleteStatus = deleteRealOut.match(/HTTP_STATUS:(\d+)/)?.[1]
    expect(deleteStatus, `DELETE del ítem real de una cotización confirmada respondió: ${deleteRealOut}`).toBe('422')
  })
})

// ---------------------------------------------------------------------------
// GRUPO C — RN4.1: cada cotización generada SOBRESCRIBE (nunca suma) el campo
// Valor de la tarjeta de Pipeline. Flujo real de punta a punta por UI:
// generar+confirmar v1 ($200) -> "Usar como base" -> editar precio a $500 ->
// generar+confirmar v2 -> el Valor de la tarjeta debe ser $500, no $700.
// ---------------------------------------------------------------------------
test.describe('GRUPO C — Sobrescritura del Valor de Pipeline entre versiones (RN4.1)', () => {
  const MASTER = `PreQA734C Master ${STAMP}`
  const SUB = `PreQA734C Sub ${STAMP}`
  const PROJECT = `PreQA734C Torre ${STAMP}`
  const ARCHITECT = `PreQA734C Arch ${STAMP}`
  const CONTACT = `PreQA734C Contact ${STAMP}`

  test.beforeAll(() => {
    const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::firstOrCreate(['name' => '${MASTER}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::firstOrCreate(['master_client_id' => $mc->id, 'business_name' => '${SUB}'], ['tax_id' => 'TAX-${STAMP}C']);
\\App\\Modules\\VentasDiseno\\Models\\SalesProject::firstOrCreate(['sub_client_id' => $sc->id, 'name' => '${PROJECT}']);
\\App\\Modules\\VentasDiseno\\Models\\Architect::firstOrCreate(['sub_client_id' => $sc->id, 'name' => '${ARCHITECT}'], ['phone' => '6000-0000']);
\\App\\Modules\\VentasDiseno\\Models\\SubClientContact::firstOrCreate(['sub_client_id' => $sc->id, 'name' => '${CONTACT}'], ['role' => 'client', 'phone' => '6111-1111']);
echo "FIXTURE_OK:1\\n";
`
    tinkerResult(script, 'FIXTURE_OK')
  })

  async function fillHeader(page: Page) {
    const masterInput = page.locator('label:has-text("Cliente Master") + input')
    await masterInput.fill(MASTER)
    await page.waitForTimeout(500)
    await page.getByText(MASTER).click()
    await page.waitForTimeout(400)
    const subInput = page.locator('label:has-text("Subcliente") + input')
    await subInput.fill(SUB)
    await page.waitForTimeout(500)
    await page.getByText(SUB).click()
    await page.waitForTimeout(600)
    const projectInput = page.locator('label:has-text("Proyecto") + input')
    await projectInput.fill(PROJECT)
    await page.waitForTimeout(500)
    await page.getByText(PROJECT).first().click()
    await page.waitForTimeout(300)
    await page.locator('label:has-text("Descripción") + input').fill(`[PREQA734C] RN4.1 (${STAMP})`)
    const architectInput = page.locator('label:has-text("Arquitecto") + input')
    await architectInput.fill(ARCHITECT)
    await page.waitForTimeout(500)
    await page.getByText(ARCHITECT).click()
    await page.waitForTimeout(300)
    // SCRUM-796 (secc. 7) — el label pasó de "Tipo de entrega" a "Fecha estimada de entrega".
    await page.locator('label:has-text("Fecha estimada de entrega") + select').selectOption('single')
    await page.waitForTimeout(200)
    await page.locator('input[type="date"]').first().fill('2026-12-31')
    await page.waitForTimeout(500)
    const addExisting = page.locator('label:has-text("Agregar contacto existente") + input')
    await addExisting.fill(CONTACT)
    await page.waitForTimeout(500)
    await page.getByText(new RegExp(CONTACT)).first().click()
    await page.waitForTimeout(400)
  }

  async function confirmQuote(page: Page) {
    await page.getByRole('button', { name: 'Guardar y generar cotización' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText(/Cotización N°/)).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('heading', { name: 'Guardar cotización' })).toBeVisible()
    await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Guardada')).toBeVisible({ timeout: 8000 })
  }

  test('1. v1 $200 confirmada -> Valor de Pipeline = $214 (grandTotal(), $200 + 7% ITBMS — real, vía confirm())', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto('/ventas-diseno/quotes')
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 15000 })
    await page.waitForTimeout(600)
    await fillHeader(page)
    await page.getByPlaceholder('Nombre de la partida').fill('[PREQA734C] Sala')
    await page.getByRole('button', { name: '+ Agregar partida' }).click()
    await page.waitForTimeout(500)
    await page.getByText('+ Agregar ítem').click()
    await page.getByPlaceholder('Referencia').fill('ITEM-C-V1')
    await page.getByPlaceholder('Descripción').fill('[PREQA734C] Item v1')
    await page.locator('input[placeholder="Cantidad"]').fill('1')
    await page.locator('input[placeholder="Precio unitario"]').fill('200')
    await page.locator('input[placeholder="Costo"]').fill('50')
    await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.waitForTimeout(500)
    await confirmQuote(page)
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/C1-v1-confirmed-200.png' })

    const cardAmount = tinkerResult(`
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$proj = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::where('name', '${PROJECT}')->first();
$card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::where('sales_project_id', $proj->id)->first();
echo "AMOUNT:" . $card->amount . "\\n";
`, 'AMOUNT')
    expect(cardAmount).toBe('214')
  })

  test('2. "Usar como base" desde Cotizaciones, precio editado a $500, confirmada -> Valor de Pipeline = $535 (NO $214+$535=$749)', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto('/ventas-diseno/quotes-list')
    await page.waitForTimeout(1000)
    const row = page.locator('tbody tr').filter({ hasText: PROJECT })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Usar como base para nueva versión' }).click()
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 10000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/C2-new-draft-from-v1.png' })

    // Editar el precio del ítem copiado ($200 -> $500) vía el modal de precio.
    const itemRow = page.locator('tr').filter({ has: page.locator('input[value="ITEM-C-V1"]') })
    await itemRow.getByRole('button', { name: '$200.00' }).click()
    const modal = page.getByRole('heading', { name: 'Editar precio' }).locator('..').locator('..')
    await modal.locator('input[type="number"]').fill('500')
    await page.waitForTimeout(700)
    await modal.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(600)

    await confirmQuote(page)
    await page.screenshot({ path: 'e2e/.tmp/preqa-734/C3-v2-confirmed-500.png' })

    const cardAmount = tinkerResult(`
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$proj = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::where('name', '${PROJECT}')->first();
$card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::where('sales_project_id', $proj->id)->first();
echo "AMOUNT:" . $card->amount . "\\n";
`, 'AMOUNT')
    expect(cardAmount, 'RN4.1: el Valor debe sobrescribirse a $535 (última versión, con ITBMS), nunca sumarse a $214+$535').toBe('535')
  })
})
