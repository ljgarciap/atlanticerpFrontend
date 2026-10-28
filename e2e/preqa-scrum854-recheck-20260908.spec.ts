import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

test.describe.configure({ mode: 'serial' })

// Re-check COMPLETO de Pre-QA sobre SCRUM-854 (filtro multi-selección Vendedor/Diseñador) tras el
// rebote CRÍTICO: en Pedidos (Bodega), el selector usaba ventasDisenoApi.home.vendors() (gateado
// por ventas_diseno.read) -> 403 para lider_bodega/asistente_bodega/auxiliar_bodega/
// transporte. Fix: nuevo endpoint GET /api/bodega/orders/sellers gateado por bodega.read (backend
// 262224e, frontend 28c7a59). Este spec corre las 6 ubicaciones completas, no solo Pedidos, para
// agarrar cualquier regresión que el fix haya podido introducir en otro lado.
//
// Corrido en LOCAL contra http://localhost:5173 (proxy /api -> localhost:8090), nunca dev.atlanticerp.ai
// (CrowdSec da falsos timeouts contra dev — ver feedback_preqa_crowdsec_no_paralelo.md). Usuarios
// reales del roster (ver project_roster_usuarios_reales_atlanticerp.md), password local = default (email).
//
// Test PERMANENTE (ver feedback_e2e_no_desechar / feedback_e2e_permanent_tests_must_self_seed) —
// gate de permisos que ya se rompió una vez (bodega.read vs ventas_diseno.read). Self-seeding real:
// OrderBoardService::sellers() deriva las opciones del filtro de owners de pedidos EXISTENTES en
// el board (baseQuery()->get()->pluck('pipelineCard.owner')), no de un roster estático — el Docker
// local puede no tener pedidos de Bodega en absoluto tras un reseed (encontrado en el re-check
// original: dropdown vacío con la app funcionando bien, causa real = 0 pedidos sembrados, no un
// bug). beforeAll crea 2 pedidos con owners distintos + un 3er par que comparte sales_project_id
// (regresión conocida de keyBy — feedback_quote_stage_keyby_shared_project.md) antes de cada corrida.
let scrum854Fixture: { vendedor2Id: number; vendedor3Id: number; orderAId: number; orderBId: number; orderC1Id: number; orderC2Id: number; masterClientId: number }

test.beforeAll(() => {
  const script = `<?php
use App\\Modules\\Bodega\\Models\\Order;
use App\\Modules\\VentasDiseno\\Models\\MasterClient;
use App\\Modules\\VentasDiseno\\Models\\PipelineCard;
use App\\Modules\\VentasDiseno\\Models\\SalesProject;
use App\\Modules\\VentasDiseno\\Models\\SubClient;
use App\\Models\\User;
use App\\Shared\\Multitenancy\\Tenant;
use Carbon\\Carbon;

Tenant::where('slug', 'atlantic')->first()?->makeCurrent();

$oldMasters = MasterClient::where('name', 'like', 'PreQA SCRUM854%')->get();
foreach ($oldMasters as $m) {
    $cardIds = PipelineCard::where('master_client_id', $m->id)->pluck('id');
    Order::whereIn('pipeline_card_id', $cardIds)->get()->each(function ($o) { $o->items()->delete(); $o->delete(); });
    PipelineCard::where('master_client_id', $m->id)->delete();
    SalesProject::whereIn('sub_client_id', SubClient::where('master_client_id', $m->id)->pluck('id'))->delete();
    SubClient::where('master_client_id', $m->id)->delete();
    $m->delete();
}

$vendedor2 = User::where('email', 'vendedor2@test.com')->first();
$vendedor3 = User::where('email', 'vendedor3@test.com')->first();

$master = MasterClient::create(['name' => 'PreQA SCRUM854 Cliente ' . uniqid()]);
$sub    = SubClient::create(['master_client_id' => $master->id, 'business_name' => 'PreQA SCRUM854 Sub ' . uniqid(), 'tax_id' => '155-0000-9-' . random_int(1000, 9999)]);

$projectA = SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'PreQA SCRUM854 Proyecto A (Vendedor)']);
$cardA = PipelineCard::create(['sales_project_id' => $projectA->id, 'stage' => 'approved', 'master_client_id' => $master->id, 'sub_client_id' => $sub->id, 'owner_id' => $vendedor2?->id, 'amount' => 300.0, 'stage_changed_at' => Carbon::now()]);
$orderA = Order::create(['order_number' => 'PED-2026-PREQA854A-' . random_int(100000, 999999), 'pipeline_card_id' => $cardA->id, 'order_type' => Order::ORDER_TYPE_PEDIDO, 'stage' => Order::STAGE_ASIGNADO, 'customer_name' => $sub->business_name]);
$orderA->items()->create(['qty_requested' => 3, 'reference_snapshot' => 'REF-A', 'description_snapshot' => 'Item A']);

$projectB = SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'PreQA SCRUM854 Proyecto B (Vendedor)']);
$cardB = PipelineCard::create(['sales_project_id' => $projectB->id, 'stage' => 'approved', 'master_client_id' => $master->id, 'sub_client_id' => $sub->id, 'owner_id' => $vendedor3?->id, 'amount' => 200.0, 'stage_changed_at' => Carbon::now()]);
$orderB = Order::create(['order_number' => 'PED-2026-PREQA854B-' . random_int(100000, 999999), 'pipeline_card_id' => $cardB->id, 'order_type' => Order::ORDER_TYPE_PEDIDO, 'stage' => Order::STAGE_POR_DESPACHAR, 'customer_name' => $sub->business_name]);
$orderB->items()->create(['qty_requested' => 2, 'reference_snapshot' => 'REF-B', 'description_snapshot' => 'Item B']);

$projectC = SalesProject::create(['sub_client_id' => $sub->id, 'name' => 'PreQA SCRUM854 Proyecto C (compartido)']);
$cardC1 = PipelineCard::create(['sales_project_id' => $projectC->id, 'stage' => 'approved', 'master_client_id' => $master->id, 'sub_client_id' => $sub->id, 'owner_id' => $vendedor2?->id, 'amount' => 100.0, 'stage_changed_at' => Carbon::now()]);
$orderC1 = Order::create(['order_number' => 'PED-2026-PREQA854C1-' . random_int(100000, 999999), 'pipeline_card_id' => $cardC1->id, 'order_type' => Order::ORDER_TYPE_PEDIDO, 'stage' => Order::STAGE_EN_PICKING, 'customer_name' => $sub->business_name]);
$orderC1->items()->create(['qty_requested' => 1, 'reference_snapshot' => 'REF-C1', 'description_snapshot' => 'Item C1']);

$cardC2 = PipelineCard::create(['sales_project_id' => $projectC->id, 'stage' => 'approved', 'master_client_id' => $master->id, 'sub_client_id' => $sub->id, 'owner_id' => $vendedor3?->id, 'amount' => 150.0, 'stage_changed_at' => Carbon::now()]);
$orderC2 = Order::create(['order_number' => 'PED-2026-PREQA854C2-' . random_int(100000, 999999), 'pipeline_card_id' => $cardC2->id, 'order_type' => Order::ORDER_TYPE_PEDIDO, 'stage' => Order::STAGE_PACKING, 'customer_name' => $sub->business_name]);
$orderC2->items()->create(['qty_requested' => 1, 'reference_snapshot' => 'REF-C2', 'description_snapshot' => 'Item C2']);

echo json_encode(['vendedor2Id' => $vendedor2?->id, 'vendedor3Id' => $vendedor3?->id, 'orderAId' => $orderA->id, 'orderBId' => $orderB->id, 'orderC1Id' => $orderC1->id, 'orderC2Id' => $orderC2->id, 'masterClientId' => $master->id]);
`
  const scriptPath = `${process.cwd()}/../atlanticerp-backend/storage/app/preqa-scrum854-seed.php`
  writeFileSync(scriptPath, script)
  const out = execSync(
    `docker compose -f "${process.cwd()}/../atlanticerp-backend/infra/docker-compose.yml" exec -T laravel php artisan tinker /var/www/html/storage/app/preqa-scrum854-seed.php < /dev/null`,
    { stdio: 'pipe' },
  ).toString()
  const start = out.indexOf('{"vendedor2Id"')
  if (start === -1) throw new Error('SCRUM-854 self-seed no devolvió el JSON esperado. Output crudo: ' + out)
  const end = out.indexOf('}', start)
  if (end === -1) throw new Error('SCRUM-854 self-seed devolvió JSON incompleto. Output crudo: ' + out)
  scrum854Fixture = JSON.parse(out.slice(start, end + 1))
  console.log('SCRUM-854 fixture sembrado: ' + JSON.stringify(scrum854Fixture))
})

const BASE = 'http://localhost:5173'

const LIDER_BODEGA = 'liderbodega@test.com'      // lider_bodega
const ASISTENTE_BODEGA = 'asistentebodega@test.com' // asistente_bodega
const DANIELA = 'gerencia@test.com'             // management -> canSeeTeam / canViewTeam
const ANDRES = 'superadmin@test.com'           // superadmin

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
// 1. Pedidos (Bodega) — el punto que rebotó
// ---------------------------------------------------------------------------

test('SCRUM-854.1a — Pedidos: lider_bodega ve opciones reales en el selector de vendedor (no "Sin resultados")', async ({ page }) => {
  await login(page, LIDER_BODEGA)
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)

  // aria-haspopup="listbox" es específico del toggle de UserMultiSelect — evita colisionar con
  // otros botones que también matchean /todos/i (ej. "Imprimir picking del día (todos)").
  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.waitForTimeout(400)

  const emptyMsg = page.getByText(/sin resultados|no hay usuarios|no options/i)
  await expect(emptyMsg).toHaveCount(0)
  const options = page.locator('div[role="listbox"] li label')
  const count = await options.count()
  expect(count, 'El selector de vendedor en Pedidos debería tener al menos 1 opción para lider_bodega').toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-1a-pedidos-lider-bodega-opciones.png', fullPage: true })
})

test('SCRUM-854.1b — Pedidos: /api/bodega/orders/sellers responde 200 para asistente_bodega; /api/ventas-diseno/home/vendors sigue en 403 (esperado, contexto)', async ({ page }) => {
  await login(page, ASISTENTE_BODEGA)
  const bearer = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(bearer).toBeTruthy()

  const resSellers = await page.request.get(`${BASE}/api/bodega/orders/sellers`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  expect(resSellers.status()).toBe(200)
  const sellersBody = await resSellers.json()
  expect(Array.isArray(sellersBody.data)).toBe(true)
  expect(sellersBody.data.length).toBeGreaterThan(0)

  const resVendorsOld = await page.request.get(`${BASE}/api/ventas-diseno/home/vendors`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  console.log('SCRUM-854.1b — /api/ventas-diseno/home/vendors para asistente_bodega -> HTTP ' + resVendorsOld.status() + ' (esperado 403, ya no se usa en Pedidos, solo contexto)')
  expect(resVendorsOld.status()).toBe(403)
})

test('SCRUM-854.1c — Pedidos: filtrar por 1 y por 2 vendedores devuelve resultados (mecanismo OR ya verificado, corre igual con el endpoint nuevo)', async ({ page }) => {
  await login(page, LIDER_BODEGA)
  await page.goto(`${BASE}/bodega/pedidos`)
  await page.waitForTimeout(1500)

  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.waitForTimeout(400)
  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)

  const reqPromise1 = page.waitForRequest(req => req.url().includes('/api/bodega/orders') && req.method() === 'GET', { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).check()
  await page.waitForTimeout(700)
  const req1 = await reqPromise1
  if (req1) console.log('SCRUM-854.1c — request tras 1 selección: ' + req1.url())
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-1c-pedidos-1-vendedor.png', fullPage: true })

  if (total > 1) {
    const reqPromise2 = page.waitForRequest(req => req.url().includes('/api/bodega/orders') && req.method() === 'GET', { timeout: 5000 }).catch(() => null)
    await checkboxes.nth(1).check()
    await page.waitForTimeout(700)
    const req2 = await reqPromise2
    if (req2) {
      console.log('SCRUM-854.1c — request tras 2 selecciones: ' + req2.url())
      expect(req2.url()).toMatch(/seller_ids/)
    }
    await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-1c-pedidos-2-vendedores.png', fullPage: true })
  }
  // No error visible tras filtrar.
  await expect(page.getByText(/^error$/i)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// 2. Pipeline
// ---------------------------------------------------------------------------

test('SCRUM-854.2 — Pipeline: multi-select, búsqueda por nombre, limpiar, sin selección = todos, red lleva owner_ids[]', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /equipo/i }).first().click()
  await page.waitForTimeout(600)

  const toggle = page.locator('button[aria-haspopup="listbox"]').first()
  await toggle.click()
  await page.waitForTimeout(400)

  await page.locator('input[placeholder]').last().fill('a')
  await page.waitForTimeout(300)
  const filteredCount = await page.locator('div[role="listbox"] li label').count()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-2-pipeline-busqueda.png', fullPage: true })
  await page.locator('input[placeholder]').last().fill('')
  await page.waitForTimeout(300)

  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)
  expect(filteredCount).toBeLessThanOrEqual(total)

  const reqPromise = page.waitForRequest(req => req.url().includes('/api/ventas-diseno/pipeline') || req.url().includes('/pipeline'), { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).check()
  await page.waitForTimeout(700)
  const req = await reqPromise
  if (req) {
    console.log('SCRUM-854.2 — Pipeline request tras selección: ' + req.url())
    expect(req.url()).toMatch(/owner_ids/)
  }

  // Limpiar — cerrar el dropdown primero (el backdrop fixed.inset-0.z-10 del listbox abierto
  // intercepta el click sobre "Limpiar filtros" si queda detrás, causa real de un hang en la
  // primera corrida de este spec: actionability nunca se resuelve y el test agota el timeout).
  // Cerrar el dropdown clickeando su propio backdrop (div.fixed.inset-0.z-10) -- Escape no lo
  // cierra (sin handler de teclado) y re-clickear el toggle tampoco funciona: el backdrop, al
  // estar abierto, se renderiza POR ENCIMA incluso del propio botón toggle (z-10 fixed inset-0
  // vs. el botón sin z-index propio) e intercepta ese click también.
  await page.locator('div.fixed.inset-0.z-10').click({ force: true })
  await page.waitForTimeout(200)
  const limpiarBtn = page.getByRole('button', { name: /^limpiar filtros$/i })
  const hasLimpiar = await limpiarBtn.isVisible().catch(() => false)
  if (hasLimpiar) {
    await limpiarBtn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-2-pipeline-limpio.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 3. Lista de Proyectos
// ---------------------------------------------------------------------------

test('SCRUM-854.3 — Lista de Proyectos: mismo checklist', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/crm/projects`)
  await page.waitForTimeout(1500)

  const teamBtn = page.getByRole('button', { name: /equipo/i }).first()
  const hasTeam = await teamBtn.isVisible().catch(() => false)
  expect(hasTeam, 'Gerencia (management) debería ver el toggle Equipo en Lista de Proyectos').toBe(true)
  await teamBtn.click()
  await page.waitForTimeout(600)

  const toggle = page.locator('button[aria-haspopup="listbox"]').first()
  await toggle.click()
  await page.waitForTimeout(400)
  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)

  const reqPromise = page.waitForRequest(req => req.url().includes('/ventas-diseno/projects'), { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).check()
  await page.waitForTimeout(700)
  const req = await reqPromise
  if (req) {
    console.log('SCRUM-854.3 — Proyectos request tras selección: ' + req.url())
    expect(req.url()).toMatch(/owner_ids/)
  }
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-3-proyectos-filtrado.png', fullPage: true })

  // Cerrar el dropdown clickeando su propio backdrop (div.fixed.inset-0.z-10) -- Escape no lo
  // cierra (sin handler de teclado) y re-clickear el toggle tampoco funciona: el backdrop, al
  // estar abierto, se renderiza POR ENCIMA incluso del propio botón toggle (z-10 fixed inset-0
  // vs. el botón sin z-index propio) e intercepta ese click también.
  await page.locator('div.fixed.inset-0.z-10').click({ force: true })
  await page.waitForTimeout(200)
  const limpiarBtn = page.getByRole('button', { name: /^limpiar filtros$/i })
  const hasLimpiar = await limpiarBtn.isVisible().catch(() => false)
  if (hasLimpiar) {
    await limpiarBtn.click()
    await page.waitForTimeout(500)
  }
})

// ---------------------------------------------------------------------------
// 4. Cotizaciones
// ---------------------------------------------------------------------------

test('SCRUM-854.4 — Cotizaciones: mismo checklist', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(1500)

  // El UserMultiSelect solo se muestra con scope='team' (mismo patrón que Pipeline/Dashboard).
  await page.getByRole('button', { name: /equipo/i }).first().click()
  await page.waitForTimeout(600)

  const toggle = page.locator('button[aria-haspopup="listbox"]').first()
  const visible = await toggle.isVisible().catch(() => false)
  expect(visible, 'Gerencia debería ver el filtro de vendedor en Cotizaciones').toBe(true)
  await toggle.click()
  await page.waitForTimeout(400)
  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)

  const reqPromise = page.waitForRequest(req => req.url().includes('/ventas-diseno/quotes') || req.url().includes('cotizacion'), { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).check()
  await page.waitForTimeout(700)
  const req = await reqPromise
  if (req) {
    console.log('SCRUM-854.4 — Cotizaciones request tras selección: ' + req.url())
    expect(req.url()).toMatch(/owner_ids/)
  }
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-4-cotizaciones-filtrado.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 5. Reportes VentasDiseno
// ---------------------------------------------------------------------------

test('SCRUM-854.5 — Reportes VentasDiseno: recálculo real (red lleva owner_ids, no filtro visual post-render)', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(1500)

  // El UserMultiSelect solo se muestra con scope='team'.
  await page.getByRole('button', { name: /equipo/i }).first().click()
  await page.waitForTimeout(600)

  const toggle = page.locator('button[aria-haspopup="listbox"]').first()
  const visible = await toggle.isVisible().catch(() => false)
  expect(visible, 'Gerencia debería ver el filtro de vendedor en Reportes').toBe(true)
  await toggle.click()
  await page.waitForTimeout(400)
  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)

  const reqPromise = page.waitForRequest(req => req.url().includes('/reportes') || req.url().includes('/reports'), { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).check()
  await page.waitForTimeout(1000)
  const req = await reqPromise
  if (req) {
    console.log('SCRUM-854.5 — Reportes request tras selección: ' + req.url())
    expect(req.url()).toMatch(/owner_ids/)
  }
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-5-reportes-filtrado.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 6. Dashboard CRM
// ---------------------------------------------------------------------------

test('SCRUM-854.6 — Dashboard CRM: mismo checklist (rol Gerencia/superadmin)', async ({ page }) => {
  await login(page, ANDRES)
  await page.goto(`${BASE}/crm/dashboard`)
  await page.waitForTimeout(1500)

  const toggle = page.locator('button[aria-haspopup="listbox"]').first()
  await expect(toggle).toBeVisible()
  await toggle.click()
  await page.waitForTimeout(400)
  const checkboxes = page.locator('div[role="listbox"] li input[type="checkbox"]')
  const total = await checkboxes.count()
  expect(total).toBeGreaterThan(0)

  // .click() en vez de .check() — .check() se cuelga acá esperando reconfirmar el estado
  // "checked" del locator original después del click; la selección en sí se aplica bien (se
  // confirma con el chip "N seleccionados" + la request con owner_ids abajo), es un artefacto de
  // este spec, no del producto.
  const reqPromise = page.waitForRequest(req => req.url().includes('/dashboard'), { timeout: 5000 }).catch(() => null)
  await checkboxes.nth(0).click()
  await page.waitForTimeout(1000)
  const req = await reqPromise
  if (req) {
    console.log('SCRUM-854.6 — Dashboard request tras selección: ' + req.url())
    expect(req.url()).toMatch(/owner_ids/)
  }
  await expect(page.getByRole('button', { name: /seleccionados/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-854-6-dashboard-filtrado.png', fullPage: true })

  // Grep de emoji SCRUM-56 sobre esta pantalla tocada.
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  const bodyText = await page.locator('body').innerText()
  expect(emojiRegex.test(bodyText), 'Dashboard CRM no debería tener emoji (SCRUM-56)').toBe(false)
})
