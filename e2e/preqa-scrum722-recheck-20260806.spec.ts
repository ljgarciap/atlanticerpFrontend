import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA re-check — SCRUM-722 ("ID de Cotización como identificador único en todo
 * el sistema"), sobre el fix backend `25937ee` + fix de concurrencia agregado en
 * esta misma sesión (`ensurePipelineLinkage()`, `App\Modules\VentasDiseno\Services\
 * QuoteService.php`).
 *
 * Bug original (reportado por Daniela): crear una cotización nueva sobre el mismo
 * Cliente Master/Subcliente/Proyecto que otra cotización YA EXISTENTE pero SIN
 * CONFIRMAR colapsaba ambas al mismo `sales_project_id`/`PipelineCard` — la
 * segunda nunca aparecía como entrada independiente en Pipeline.
 *
 * Cubre el camino end-to-end vía UI real (no solo tinker): elegir, en el picker de
 * Proyecto del formulario de "+ Nueva cotización", un Proyecto que YA tiene otra
 * cotización sin confirmar, y confirmar en Pipeline que ambas terminan como
 * tarjetas independientes.
 */
const VENDEDOR = 'neil.quiel@atlantic.com.pa'
const STAMP = Date.now()

interface Fixture {
  masterClientName: string
  subClientName: string
  projectName: string
  architectName: string
  existingQuoteId: number
  projectId: number
}

function seedFixture(): Fixture {
  const masterClientName = `PreQA 722 Master ${STAMP}`
  const subClientName = `PreQA 722 Sub ${STAMP}`
  const projectName = `PreQA 722 Project ${STAMP}`
  const architectName = `PreQA 722 Arq ${STAMP}`

  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::where('slug', 'atlantic')->first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${VENDEDOR}')->first();

$master = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => '${masterClientName}']);
$sub = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $master->id, 'business_name' => '${subClientName}', 'tax_id' => '155-${STAMP}']);
$project = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sub->id, 'name' => '${projectName}']);
$architect = \\App\\Modules\\VentasDiseno\\Models\\Architect::create(['sub_client_id' => $sub->id, 'name' => '${architectName}', 'phone' => '6000-0000']);

$card = \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::create([
  'sales_project_id' => $project->id, 'stage' => 'lead',
  'master_client_id' => $master->id, 'sub_client_id' => $sub->id,
  'owner_id' => $owner->id, 'stage_changed_at' => now(),
]);

$existingQuote = \\App\\Modules\\VentasDiseno\\Models\\Quote::create([
  'owner_id' => $owner->id, 'master_client_id' => $master->id, 'sub_client_id' => $sub->id,
  'sales_project_id' => $project->id, 'description' => 'Cotizacion existente sin confirmar',
]);

echo "FIXTURE_JSON:" . json_encode([
  'masterClientName' => '${masterClientName}',
  'subClientName' => '${subClientName}',
  'projectName' => '${projectName}',
  'architectName' => '${architectName}',
  'existingQuoteId' => $existingQuote->id,
  'projectId' => $project->id,
]) . "\\n";
`

  let stdout: string
  try {
    stdout = execSync(
      `docker exec -i infra-laravel-1 php artisan tinker`,
      { input: script, encoding: 'utf8', timeout: 60000 },
    )
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string }
    throw new Error(`tinker fixture failed.\nSTDOUT:\n${e.stdout}\nSTDERR:\n${e.stderr}\n${e.message}`)
  }
  // psysh puede ecoar la línea de entrada antes de ejecutarla -- la salida real es la
  // última ocurrencia que termina en '}' (mismo patrón que preqa-scrum216-217-...).
  const candidates = stdout.split('\n').filter(l => l.includes('FIXTURE_JSON:'))
  const line = [...candidates].reverse().find(l => l.trim().endsWith('}'))
  if (!line) throw new Error(`No se pudo parsear el fixture. Output:\n${stdout}`)
  const match = line.match(/FIXTURE_JSON:(\{.*\})/)
  if (!match) throw new Error(`No se pudo parsear el fixture. Output:\n${stdout}`)
  return JSON.parse(match[1]) as Fixture
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

// ClientPicker no usa <label for>/aria-labelledby -- label e input son hermanos
// sueltos dentro del mismo div, así que getByLabel() no resuelve. Navegamos por
// proximidad: el <label> con el texto exacto, seguido del <input> hermano.
async function fillPicker(page: Page, labelText: string, optionText: string) {
  const input = page.locator('label', { hasText: labelText }).locator('xpath=following-sibling::input').first()
  await input.click()
  await input.fill(optionText)
  await page.getByText(optionText, { exact: true }).first().click()
}

test('SCRUM-722 — segunda cotización sobre Proyecto con otra ya existente sin confirmar aparece como tarjeta independiente en Pipeline', async ({ page }) => {
  test.setTimeout(60000)
  const saveDraftResponse = page.waitForResponse(res => res.url().includes('/save-draft') && res.request().method() === 'POST')

  await login(page, VENDEDOR)

  await page.goto('/ventas-diseno/quotes')
  await page.waitForLoadState('networkidle')

  await fillPicker(page, 'Cliente Master', fx.masterClientName)
  await page.waitForTimeout(500)
  await fillPicker(page, 'Subcliente', fx.subClientName)
  await page.waitForTimeout(500)
  await fillPicker(page, 'Proyecto', fx.projectName)
  await page.waitForTimeout(500)
  await fillPicker(page, 'Arquitecto', fx.architectName)
  await page.waitForTimeout(500)

  // Campos obligatorios para que save-draft pase la validación (Descripción,
  // Arquitecto ya lleno arriba, Fecha de entrega) -- no son parte del criterio de
  // SCRUM-722 en sí, pero sin ellos el backend rechaza con 422 antes de llegar a
  // ensurePipelineLinkage().
  const descriptionInput = page.locator('label', { hasText: 'Descripción' }).locator('xpath=following-sibling::input').first()
  await descriptionInput.fill('Cotizacion nueva - PreQA 722 recheck')

  const deliveryTypeSelect = page.locator('label', { hasText: 'Tipo de entrega' }).locator('xpath=following-sibling::select').first()
  await deliveryTypeSelect.selectOption('single')
  await page.waitForTimeout(300)
  const deliveryDateInput = page.locator('label', { hasText: 'Fecha(s) de entrega' }).locator('xpath=following-sibling::div//input[@type="date"]').first()
  await deliveryDateInput.fill('2026-12-01')

  await page.getByRole('button', { name: /Guardar borrador/i }).click()

  // Señal directa (no solo DOM, evita depender de un toast transitorio que puede
  // desaparecer antes de que el assert lo vea): la respuesta de save-draft debe traer un
  // sales_project.id DISTINTO del proyecto original -- confirma que
  // ensurePipelineLinkage() clonó en vez de reusar el mismo Proyecto/tarjeta que
  // ya tenía la cotización existente sin confirmar.
  const res = await saveDraftResponse
  const body = await res.json()
  expect(body.sales_project.id).not.toBe(fx.projectId)
  expect(body.pipeline_card_id).not.toBeNull()

  await page.goto('/ventas-diseno/pipeline')
  await page.waitForSelector('text=/lead|Lead/i', { timeout: 15000 }).catch(() => {})

  // El proyecto clonado preserva el MISMO nombre/subcliente que el original (por diseño,
  // ver docblock de ensurePipelineLinkage) -- así que la señal visible en Pipeline de
  // "2 tarjetas independientes" es que el nombre del proyecto aparece 2 VECES en el
  // tablero, no 1 (antes del fix, la segunda cotización era invisible -- 1 sola tarjeta).
  const projectNameTiles = page.locator('p.font-medium', { hasText: fx.projectName })
  await expect(projectNameTiles).toHaveCount(2, { timeout: 20000 })
})
