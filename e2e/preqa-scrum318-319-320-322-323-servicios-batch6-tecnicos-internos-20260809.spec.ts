import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA — Fase 4 Servicios, Batch 6 (SCRUM-318/319/320/322/323, REQ-255/256/257/259/260) —
 * Técnicos internos. SCRUM-321 (REQ-258, comisión Carlos Vergara) queda deliberadamente fuera —
 * depende de REQ-292/Batch 7, sin construir todavía (ver comentario en el ticket).
 *
 * Corre contra el stack local (Vite dev server proxy a nginx:8090, ver vite.config.ts), no
 * dev.atlanticerp.ai — este batch todavía no se pusheó.
 *
 * Promovido a permanente (regla del proyecto: un gate de estado/permiso que ya se ejercitó una
 * vez no se descarta) — cubre REQ-256 (cálculo de estado en tiempo real, los 4 estados),
 * REQ-259 RN5 (gate de rol) y REQ-260 RN5 (acceso de solo vista de Vendedor/Diseñador).
 *
 * REQ-256 es 100% real-time (Carbon::now(), sin freeze) — el fixture NO puede usar horas
 * hardcodeadas (se rompería en la siguiente corrida, ver feedback_e2e_permanent_tests_must_
 * self_seed.md). Se siembra en `beforeAll` vía tinker con offsets relativos a `now()` calculados
 * en el momento de la corrida (mismo patrón que preqa-scrum216-217-timeline-race-recheck-
 * 20260806.spec.ts), y se limpia en `afterAll` para no acumular tickets de una corrida a la
 * siguiente el mismo día (los 3 técnicos reales sí importan el estado calculado, así que dejar
 * basura de una corrida previa el mismo día rompería el conteo exacto de visitas de la próxima).
 *
 * Cuentas reales (password = email):
 *  - servicio@atlantic.com.pa (lider_servicios) — alta completa, vista Equipo/Agenda.
 *  - carlos@atlantic.com.pa   (tecnico_servicios) — solo consulta, sin alta.
 *  - milena.e@grupolafayette.com   (vendedor_disenador) — solo vista de Agenda equipo (RN5).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const TECH_NAME = `E2E PreQA Interno ${Date.now()}`

interface Fixture {
  ticketIds: number[]
  carlosEarlyHora: string
  carlosOnSiteHora: string
  pedroEnRouteHora: string
}

function seedFixture(): Fixture {
  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first();
$tenant->makeCurrent();
$now = \\Carbon\\Carbon::now('America/Panama');
$stamp = ${Date.now()};

$carlos = \\App\\Models\\User::where('email', 'carlos@atlantic.com.pa')->first();
$pedro = \\App\\Models\\User::where('email', 'santopedro181994@gmail.com')->first();
$agustin = \\App\\Models\\User::where('email', 'agustinrodriguez141985@gmail.com')->first();
$miguel = \\App\\Models\\User::where('email', 'garantias@atlantic.com.pa')->first();

function mk($numero, $tech, $estado, $start, $end) {
  return \\App\\Modules\\Servicios\\Models\\Ticket::create([
    'numero' => $numero, 'tipo' => 'installation', 'tipo_instalacion' => 'internal',
    'descripcion' => 'Pre-QA E2E fixture', 'cliente' => 'Cliente E2E PreQA',
    'estado' => $estado, 'internal_technician_id' => $tech->id,
    'scheduled_at' => $start->utc(), 'scheduled_ends_at' => $end->utc(),
  ]);
}

// Carlos: 2 visitas hoy -- una más temprana (ya pasada) y una EN CURSO ahora (Ocupado/on_site).
$early = $now->copy()->subHours(3);
$tCarlosEarly = mk("E2E-{$stamp}-1", $carlos, 'resolved', $early->copy(), $early->copy()->addHour());
$tCarlosOnSite = mk("E2E-{$stamp}-2", $carlos, 'scheduled', $now->copy()->subMinutes(15), $now->copy()->addMinutes(45));

// Pedro: próxima visita en 30 min -- En ruta.
$tPedro = mk("E2E-{$stamp}-3", $pedro, 'scheduled', $now->copy()->addMinutes(30), $now->copy()->addMinutes(90));

// Agustín: única visita de hoy ya terminada, sin más agendadas -- Fuera.
$tAgustin = mk("E2E-{$stamp}-4", $agustin, 'resolved', $now->copy()->subHours(2), $now->copy()->subHour());

// Miguel: visita CANCELADA hoy -- no debe contar ni afectar su estado (sigue Disponible, 0 visitas).
$tMiguelCancelled = mk("E2E-{$stamp}-5", $miguel, 'cancelled', $now->copy()->subMinutes(5), $now->copy()->addMinutes(55));

echo "FIXTURE_JSON:" . json_encode([
  'ticketIds' => [$tCarlosEarly->id, $tCarlosOnSite->id, $tPedro->id, $tAgustin->id, $tMiguelCancelled->id],
  'carlosEarlyHora' => $early->format('H:i'),
  'carlosOnSiteHora' => $now->copy()->subMinutes(15)->format('H:i'),
  'pedroEnRouteHora' => $now->copy()->addMinutes(30)->format('H:i'),
]) . "\\n";
`

  const stdout = execSync('docker exec -i infra-laravel-1 php artisan tinker', {
    input: script, encoding: 'utf8', timeout: 60000, cwd: '../atlanticerp-backend',
  })
  const candidates = stdout.split('\n').filter(l => l.includes('FIXTURE_JSON:'))
  const line = [...candidates].reverse().find(l => l.trim().endsWith('}'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  return JSON.parse(line.split('FIXTURE_JSON:')[1]) as Fixture
}

function cleanupFixture(ticketIds: number[]) {
  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first();
$tenant->makeCurrent();
\\App\\Modules\\Servicios\\Models\\Ticket::whereIn('id', [${ticketIds.join(',')}])->delete();
echo "CLEANED\\n";
`
  execSync('docker exec -i infra-laravel-1 php artisan tinker', {
    input: script, encoding: 'utf8', timeout: 60000, cwd: '../atlanticerp-backend',
  })
}

let fx: Fixture

test.beforeAll(() => {
  fx = seedFixture()
})

test.afterAll(() => {
  cleanupFixture(fx.ticketIds)
})

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function gotoInternalTechnicians(page: Page) {
  await page.goto(`${BASE}/servicios/tecnicos`)
  await page.waitForTimeout(1200)
}

// Cada tarjeta es un <div class="... flex flex-col gap-3">; el contenedor grid superior también
// matchea "div" con `has:`, por eso se ancla por xpath al ancestro más cercano con `flex-col`
// en vez de usar `.first()` sobre `has:` (que devolvía el contenedor entero de la grilla — bug
// real de la primera versión de este test, corregido tras la primera corrida).
function techCard(page: Page, name: string) {
  return page.getByText(name, { exact: true }).locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' flex-col ')][1]",
  )
}

test('REQ-255/256 — Vista Equipo refleja estado, especialidad y visitas de hoy en tiempo real', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  await expect(page.getByText('Carlos Vergara')).toBeVisible()
  await expect(techCard(page, 'Carlos Vergara').getByText('Ocupado')).toBeVisible()
  await expect(techCard(page, 'Pedro Santos').getByText('En ruta')).toBeVisible()
  await expect(techCard(page, 'Agustin Rodriguez').getByText('Fuera')).toBeVisible()
  await expect(techCard(page, 'Miguel Castillo').getByText('Disponible')).toBeVisible()
  await expect(techCard(page, 'Miguel Castillo').getByText('Garantías')).toBeVisible()

  // Placeholders documentados (Herramientas/Batch 13, %1ra visita/REQ-211) — deben verse
  // sensatos ("0"/"—"), no crashear ni mostrar "null"/"undefined".
  await expect(page.getByText('undefined')).toHaveCount(0)
  await expect(page.getByText('null')).toHaveCount(0)
})

test('REQ-257 — "Visitas hoy" lista el detalle en orden cronológico; sin visitas muestra el estado vacío', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  await techCard(page, 'Carlos Vergara').getByRole('button', { name: /visitas hoy/i }).click()

  const modal = page.getByTestId('internal-technician-visits-modal')
  await expect(modal).toBeVisible()
  const times = modal.locator('ul li span.text-primary')
  await expect(times).toHaveCount(2)
  await expect(times.nth(0)).toHaveText(fx.carlosEarlyHora)
  await expect(times.nth(1)).toHaveText(fx.carlosOnSiteHora)
  await modal.getByRole('button').first().click()
  await expect(modal).not.toBeVisible()

  await techCard(page, 'Miguel Castillo').getByRole('button', { name: /visitas hoy/i }).click()
  const modal2 = page.getByTestId('internal-technician-visits-modal')
  await expect(modal2).toBeVisible()
  await expect(modal2.getByText('Sin visitas hoy')).toBeVisible()
})

test('REQ-255 RN5 — clic en nombre/avatar abre el detalle con teléfono/correo/especialidad', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  await page.getByText('Miguel Castillo').click()
  const detail = page.getByTestId('internal-technician-detail-modal')
  await expect(detail).toBeVisible()
  await expect(detail.getByText('Garantías')).toBeVisible()
  await expect(detail.getByText('garantias@atlantic.com.pa')).toBeVisible()
})

test('REQ-259 RN5 — técnico interno (tecnico_servicios) NO ve el botón de alta', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  await expect(page.getByText('+ Nuevo técnico')).not.toBeVisible()
  // Camino de ruptura: aunque el botón esté oculto, el backend ya confirmó 403 vía API
  // (ver docs/pre-qa/scrum318-323-servicios-batch6-tecnicos-internos-20260809.md).
})

test('REQ-260 RN5 — Vendedor/Diseñador tiene acceso de solo vista a Agenda equipo, sin botón de alta', async ({ page }) => {
  await login(page, 'milena.e@grupolafayette.com')
  await gotoInternalTechnicians(page)

  await expect(page.getByText('+ Nuevo técnico')).not.toBeVisible()
  await page.getByText('Agenda equipo').click()
  await page.waitForTimeout(1000)
  await expect(page.getByLabel('Filtrar por técnico')).toBeVisible()
  await expect(page.getByText('Sin visitas hoy — se puede asignar carga').first()).toBeVisible()
})

test('REQ-260 — Agenda equipo agrupa por técnico y filtra a uno solo', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)
  await page.getByText('Agenda equipo').click()
  await page.waitForTimeout(1000)

  await expect(page.getByRole('heading', { name: 'Carlos Vergara' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedro Santos' })).toBeVisible()

  await page.getByLabel('Filtrar por técnico').selectOption({ label: 'Pedro Santos' })
  await page.waitForTimeout(1000)
  await expect(page.getByRole('heading', { name: 'Carlos Vergara' })).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedro Santos' })).toBeVisible()
  await expect(page.getByText(fx.pedroEnRouteHora)).toBeVisible()
})

test('REQ-259 — alta de técnico interno: validación bloquea envío sin nombre, éxito con datos válidos', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  await page.getByText('+ Nuevo técnico').click()
  const modal = page.getByTestId('internal-technician-create-modal')
  await expect(modal).toBeVisible()

  const saveBtn = modal.getByText('Guardar')
  await expect(saveBtn).toBeDisabled()

  await modal.locator('input').first().fill(TECH_NAME)
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await page.waitForTimeout(1200)

  await expect(modal).not.toBeVisible()
  await expect(page.getByText(TECH_NAME)).toBeVisible()

  // Nota de diseño verificada (no es un hallazgo, ver comentario en el ticket): un técnico dado
  // de alta por REQ-259 nace SIN `user_id` (no reusa el flujo de Usuarios) — por diseño,
  // `TechnicianStatusService::statusFor()` siempre devuelve "Fuera" para un perfil sin cuenta
  // real vinculada, apenas se refresca la lista (el 201 de creación sí responde "Disponible",
  // pero eso es una respuesta puntual, no el estado persistido/recalculado que ve esta vista).
  const newCard = techCard(page, TECH_NAME)
  await expect(newCard.getByText('Fuera')).toBeVisible()
  await expect(newCard.getByRole('button', { name: /visitas hoy/i })).toContainText('0')
})

test('REQ-259 — doble clic en Guardar no crea 2 técnicos duplicados', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInternalTechnicians(page)

  const name2 = `${TECH_NAME} DblClick`
  await page.getByText('+ Nuevo técnico').click()
  const modal = page.getByTestId('internal-technician-create-modal')
  await modal.locator('input').first().fill(name2)
  const saveBtn = modal.getByText('Guardar')
  await saveBtn.click({ clickCount: 2, delay: 20 }).catch(() => {})
  await page.waitForTimeout(1500)

  await gotoInternalTechnicians(page)
  await expect(page.getByText(name2)).toHaveCount(1)
})
