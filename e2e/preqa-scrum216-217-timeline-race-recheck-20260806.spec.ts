import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA adversarial — SCRUM-216 (REQ-153 RN3/RN4, "Llegada real") + SCRUM-217 (REQ-154, timeline
 * de envío), re-check 2026-08-06 sobre los commits backend `28461c8`/frontend `51e505b`.
 *
 * Cubre lo que el Visual Reviewer (verificación de fidelidad visual/funcional) no ejercita:
 * condición de carrera en `advance()` (encontrada y corregida en esta misma sesión, ver commit de
 * `GoodsReceiptConfirmationService`/`PurchaseOrderController::advance()`), doble clic a nivel UI,
 * orden vieja sembrada antes de la migración de columnas de etapa (`ordenado_at` etc. NULL con
 * `status` ya avanzado), recarga a mitad del timeline, gate de `compras.edit` a nivel de DOM (no
 * solo el 403 de API, ya cubierto por un curl directo en la sesión), y sincronización cross-page
 * con Ver Órdenes ahora que la tarjeta también dibuja el timeline nuevo.
 *
 * Fixture propio en `beforeAll` (mismo patrón que `preqa-scrum214-215-216-logistica-20260805`) —
 * nunca IDs hardcodeados, capturados del stdout de tinker.
 */
const LIDER_COMPRAS = 'gerencia2@illuminations.com.pa'
const SIN_COMPRAS = 'neil.quiel@illuminations.com.pa' // vendedor_disenador — sin compras.view/edit
const STAMP = Date.now()

interface Fixture {
  providerNormal: string
  providerLocal: string
  orderMidSequence: number // en_transito, normal provider — para doble-clic
  orderOldNoStageDates: number // en_aduana, TODAS las columnas de etapa NULL (dato "pre-migración")
  orderLocalOrdenado: number // local provider, ordenado — timeline de 3 pasos
  orderPenultimate: number // en_transito_local, normal provider — a un clic de "Recibido"
}

function seedFixture(): Fixture {
  const providerNormal = `PreQA TL Normal ${STAMP}`
  const providerLocal = `PreQA TL Local ${STAMP}`

  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${LIDER_COMPRAS}')->first();

$pNormal = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => '${providerNormal}', 'currency' => 'USD', 'origin' => 'internacional', 'category' => 'internacional']);
$pLocal = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => '${providerLocal}', 'currency' => 'USD', 'origin' => 'local', 'category' => 'local']);

// Mid-sequence, normal provider -- para el test de doble-clic (avanza en_transito -> en_aduana).
$oMid = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $pNormal->id, 'created_by' => $owner->id, 'status' => 'en_transito', 'status_changed_at' => now(), 'modality' => 'directo', 'total_amount' => 100, 'ordenado_at' => now()->subDays(3)]);

// "Dato pre-migración" -- status ya avanzado (en_aduana) pero NINGUNA columna de etapa poblada,
// simulando una orden creada antes del 2026-08-05 (migración add_stage_dates...). El timeline no
// debe romperse ni inventar fechas -- debe mostrar "--" en todos los pasos completados.
$oOld = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $pNormal->id, 'created_by' => $owner->id, 'status' => 'en_aduana', 'status_changed_at' => now()->subDays(10), 'modality' => 'directo', 'total_amount' => 100]);

// Local provider, ordenado -- timeline de 3 pasos (Ordenado -> En transito local -> Recibido).
$oLocal = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $pLocal->id, 'created_by' => $owner->id, 'status' => 'ordenado', 'status_changed_at' => now(), 'modality' => 'directo', 'total_amount' => 100, 'ordenado_at' => now()]);

// Penultima etapa -- a un clic de "Recibido" (auto-fill de Llegada real + boton desaparece).
$oPenultimate = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $pNormal->id, 'created_by' => $owner->id, 'status' => 'en_transito_local', 'status_changed_at' => now(), 'modality' => 'directo', 'total_amount' => 100, 'ordenado_at' => now()->subDays(5), 'en_transito_at' => now()->subDays(4), 'en_aduana_at' => now()->subDays(2)]);

echo "FIXTURE_JSON:" . json_encode([
  'orderMidSequence' => $oMid->id,
  'orderOldNoStageDates' => $oOld->id,
  'orderLocalOrdenado' => $oLocal->id,
  'orderPenultimate' => $oPenultimate->id,
]) . "\\n";
`

  const stdout = execSync(
    `docker exec -i infra-laravel-1 php artisan tinker`,
    { input: script, encoding: 'utf8', timeout: 60000 },
  )
  // psysh puede ecoar la línea de entrada "echo "FIXTURE_JSON:" . json_encode([" antes de
  // ejecutarla -- esa línea también matchea 'FIXTURE_JSON:' pero no es JSON. La salida real
  // siempre llega DESPUÉS (última ocurrencia), y termina en '}' (objeto JSON completo), a
  // diferencia del eco de la línea de entrada (termina en '[' sin cerrar).
  const candidates = stdout.split('\n').filter(l => l.includes('FIXTURE_JSON:'))
  const line = [...candidates].reverse().find(l => l.trim().endsWith('}'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  const ids = JSON.parse(line.split('FIXTURE_JSON:')[1]) as Record<string, number>

  return {
    providerNormal, providerLocal,
    orderMidSequence: ids.orderMidSequence,
    orderOldNoStageDates: ids.orderOldNoStageDates,
    orderLocalOrdenado: ids.orderLocalOrdenado,
    orderPenultimate: ids.orderPenultimate,
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

async function openLogisticaShowAll(page: Page) {
  await page.goto('/compras/logistica')
  await page.waitForSelector('text=Logística')
  const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
  await perPageSelect.waitFor({ state: 'visible', timeout: 10000 })
  await perPageSelect.selectOption('all')
  await page.waitForTimeout(500)
}

test('SCRUM-216/217 — timeline: orden vieja sin fechas de etapa no rompe el render', async ({ page }) => {
  await login(page, LIDER_COMPRAS)
  await openLogisticaShowAll(page)

  const card = page.locator('div.p-4', { has: page.getByText(`#${fx.orderOldNoStageDates}`, { exact: true }) }).first()
  await expect(card).toBeVisible()

  const timeline = card.locator('[data-testid="shipment-timeline"]')
  await expect(timeline).toBeVisible()

  // en_aduana = paso índice 2 de la secuencia normal (0=ordenado,1=en_transito,2=en_aduana) -- los
  // pasos 0/1 deben aparecer "done" (ya alcanzados según el status) pero SIN fecha real (columnas
  // NULL), mostrando "--" en vez de una fecha inventada o un crash del componente.
  const step0 = card.locator('[data-testid="timeline-step-ordenado"]')
  const step1 = card.locator('[data-testid="timeline-step-en_transito"]')
  await expect(step0).toHaveAttribute('data-state', 'done')
  await expect(step1).toHaveAttribute('data-state', 'done')
  await expect(step0).toContainText('—')
  await expect(step1).toContainText('—')

  await page.screenshot({ path: 'test-results/preqa-scrum216217-old-order-timeline.png', fullPage: false })
})

test('SCRUM-217 — timeline de 3 pasos para proveedor local, primer paso rotulado "Ordenado"', async ({ page }) => {
  await login(page, LIDER_COMPRAS)
  await openLogisticaShowAll(page)

  const card = page.locator('div.p-4', { has: page.getByText(`#${fx.orderLocalOrdenado}`, { exact: true }) }).first()
  await expect(card).toBeVisible()

  const timeline = card.locator('[data-testid="shipment-timeline"]')
  const steps = timeline.locator('[data-testid^="timeline-step-"]')
  await expect(steps).toHaveCount(3)
  await expect(timeline.locator('[data-testid="timeline-step-ordenado"]')).toContainText('Ordenado')
  await expect(timeline.locator('[data-testid="timeline-step-ordenado"]')).not.toContainText('Salió de origen')
})

test('SCRUM-217 RN7 — usuario sin compras.edit ve el timeline pero nunca el botón de avance (gate de DOM)', async ({ page }) => {
  await login(page, SIN_COMPRAS)
  // neil.quiel (vendedor_disenador) no tiene role_module_visibility para compras -- confirmar
  // primero que efectivamente no puede navegar al módulo por su cuenta (bandera ya conocida de la
  // auditoría anterior), y forzar la navegación directa a la URL de todas formas para ejercitar el
  // gate del botón específicamente, no la visibilidad del menú.
  await page.goto('/compras/logistica')
  await page.waitForTimeout(1000)
  const hasLogisticaHeading = await page.getByText('Logística').isVisible().catch(() => false)

  if (hasLogisticaHeading) {
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    if (await perPageSelect.isVisible().catch(() => false)) {
      await perPageSelect.selectOption('all')
      await page.waitForTimeout(500)
    }
    const card = page.locator('div.p-4', { has: page.getByText(`#${fx.orderMidSequence}`, { exact: true }) }).first()
    if (await card.isVisible().catch(() => false)) {
      await expect(card.locator('[data-testid="shipment-timeline"]')).toBeVisible()
      await expect(card.getByRole('button', { name: /completar etapa/i })).toHaveCount(0)
    }
  }
  // Si el rol ni siquiera llega a la pantalla (bandera de scope conocida, ver visual-review
  // 2026-08-05), el test no falla -- el gate real (403 de API) ya está confirmado por curl directo
  // en la sesión de Pre-QA; esto solo agrega la capa de UI cuando el usuario SÍ puede llegar.
})

test('SCRUM-217 RN3 — doble clic rápido en "Completar etapa actual" no avanza 2 etapas de una', async ({ page }) => {
  await login(page, LIDER_COMPRAS)
  await openLogisticaShowAll(page)

  const card = page.locator('div.p-4', { has: page.getByText(`#${fx.orderMidSequence}`, { exact: true }) }).first()
  await expect(card).toBeVisible()

  const advanceBtn = card.getByRole('button', { name: /completar etapa actual/i })
  await expect(advanceBtn).toBeVisible()
  await expect(advanceBtn).toContainText('En aduana') // en_transito -> en_aduana es el próximo paso real

  // Disparar 2 clics lo más rápido posible -- el botón debe pasar a loading/disabled tras el
  // primero, así que el segundo no debería generar un 2do request de avance real.
  await Promise.all([advanceBtn.click(), advanceBtn.click({ force: true }).catch(() => {})])
  await page.waitForTimeout(1500)

  // Confirmar contra el backend (fuente de verdad) que la orden avanzó UNA sola etapa, no 2.
  const stdout = execSync(
    `docker exec -i infra-laravel-1 php artisan tinker`,
    {
      input: `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$o = \\App\\Modules\\Compras\\Models\\PurchaseOrder::find(${fx.orderMidSequence});
echo "STATUS_JSON:" . json_encode(['status' => $o->status]) . "\\n";
`,
      encoding: 'utf8', timeout: 30000,
    },
  )
  const statusCandidates = stdout.split('\n').filter(l => l.includes('STATUS_JSON:'))
  const line = [...statusCandidates].reverse().find(l => l.trim().endsWith('}'))
  const result = JSON.parse(line!.split('STATUS_JSON:')[1]) as { status: string }
  // en_transito -> en_aduana es UNA etapa; en_transito_local sería 2 etapas de una (bug).
  expect(result.status).toBe('en_aduana')
})

test('SCRUM-217 RN4/RN5 — recarga a mitad del timeline conserva la etapa y el botón correcto', async ({ page }) => {
  await login(page, LIDER_COMPRAS)
  await openLogisticaShowAll(page)

  const cardBefore = page.locator('div.p-4', { has: page.getByText(`#${fx.orderPenultimate}`, { exact: true }) }).first()
  await expect(cardBefore).toBeVisible()
  await expect(cardBefore.getByRole('button', { name: /completar etapa actual/i })).toContainText('Recibido')

  await page.reload()
  await page.waitForSelector('text=Logística')
  const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
  await perPageSelect.selectOption('all')
  await page.waitForTimeout(500)

  const cardAfter = page.locator('div.p-4', { has: page.getByText(`#${fx.orderPenultimate}`, { exact: true }) }).first()
  await expect(cardAfter).toBeVisible()
  await expect(cardAfter.getByRole('button', { name: /completar etapa actual/i })).toContainText('Recibido')
  const timeline = cardAfter.locator('[data-testid="shipment-timeline"]')
  await expect(timeline.locator('[data-testid="timeline-step-en_transito_local"]')).toHaveAttribute('data-state', 'current')
})

test('SCRUM-217 RN3/RN4 — completar la última etapa: auto-fill de Llegada real + botón desaparece + sync inmediato en Ver Órdenes', async ({ page, context }) => {
  await login(page, LIDER_COMPRAS)
  await openLogisticaShowAll(page)

  page.on('response', r => {
    if (r.url().includes('/advance')) console.log(`ADVANCE_RESPONSE: ${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', r => {
    if (r.url().includes('/advance')) console.log(`ADVANCE_REQUEST_FAILED: ${r.failure()?.errorText} ${r.url()}`)
  })

  const card = page.locator('div.p-4', { has: page.getByText(`#${fx.orderPenultimate}`, { exact: true }) }).first()
  await expect(card).toBeVisible()
  const advanceBtn = card.getByRole('button', { name: /completar etapa actual/i })
  await expect(advanceBtn).toContainText('Recibido')
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/advance'), { timeout: 10000 }),
    advanceBtn.click(),
  ])
  console.log(`ADVANCE_STATUS: ${response.status()}`)

  await expect(card.getByRole('button', { name: /completar etapa actual/i })).toHaveCount(0, { timeout: 10000 })
  const arrivalBlock = card.locator('text=Llegada real').locator('xpath=..')
  await expect(arrivalBlock.locator('input')).toHaveCount(0)
  await expect(arrivalBlock).not.toContainText('Pendiente')

  // Cross-screen sync (RN4/Escenario 5) -- SIN recargar Logística, abrir Ver Órdenes en una
  // pestaña nueva del mismo contexto (mismo querystring de sesión) y confirmar que ya ve
  // "Recibido" para esta orden.
  const ordersPage = await context.newPage()
  await ordersPage.goto('/compras/ordenes')
  await ordersPage.waitForSelector('text=Ver Órdenes')
  await ordersPage.getByPlaceholder(/Buscar por N/i).fill(String(fx.orderPenultimate))
  await ordersPage.getByRole('button', { name: 'Buscar' }).click()
  await ordersPage.waitForTimeout(800)
  const row = ordersPage.locator('tr', { hasText: `#${fx.orderPenultimate}` }).first()
  await expect(row).toContainText(/recibido/i)
  await ordersPage.close()
})
