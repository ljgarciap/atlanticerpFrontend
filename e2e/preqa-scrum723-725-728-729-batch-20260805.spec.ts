import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-723 (warn "Volver a Pipeline" sin guardar), SCRUM-725 (margen mínimo
 * por producto/global + override Mark/David + precio manual de catálogo), SCRUM-728
 * (submenú Catálogo en CRM), SCRUM-729 (sidebar Compras un solo activo + provider
 * picker con foco/blur).
 *
 * Corre contra el Vite dev server local con proxy /api a localhost:8090 (stack Docker
 * compartido). Cuentas reales del roster (password = email).
 *
 * Se siembra el propio fixture en `beforeAll` (tinker vía docker exec), con nombres/
 * referencias únicos por STAMP — no asume IDs ni registros fijos de una siembra manual
 * previa (gotcha ya documentado: `infra/test.sh` comparte la misma Postgres que el
 * stack local y la vacía en cada corrida de la suite PHPUnit). Reproducible sin
 * importar el estado previo de la BD local.
 */
test.describe.configure({ mode: 'serial' })

const VENDEDOR_SIN_PERMISO = 'milena.e@grupolafayette.com'
const MARK = 'mbekhar@atlantic.com.pa'
const DAVID = 'david@grupolafayette.com'
const LIDER_COMPRAS = 'gerencia2@atlantic.com.pa'
const TECNICO_SIN_VENTAS = 'carlos@atlantic.com.pa' // solo-lectura, servicios — sin ventas_diseno.read

const STAMP = Date.now()
const MASTER_CLIENT = `PreQA Master ${STAMP}`
const SUB_CLIENT = `PreQA Sub ${STAMP}`
const PROJECT = `PreQA Torre ${STAMP}`
const REF_LOW = `PREQA-LOW-${STAMP}`
const REF_HEALTHY = `PREQA-HEALTHY-${STAMP}`
const FAMILY = `PreQA Familia Margen ${STAMP}`
const ARCHITECT = `PreQA Arquitecto ${STAMP}`
const CONTACT = `PreQA Contacto ${STAMP}`

function seedFixture(): void {
  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$owner = \\App\\Models\\User::where('email', '${VENDEDOR_SIN_PERMISO}')->first();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => '${MASTER_CLIENT}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $mc->id, 'business_name' => '${SUB_CLIENT}', 'tax_id' => 'TAX-${STAMP}']);
\\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${PROJECT}']);
\\App\\Modules\\VentasDiseno\\Models\\Architect::create(['sub_client_id' => $sc->id, 'name' => '${ARCHITECT}', 'phone' => '6000-0000']);
\\App\\Modules\\VentasDiseno\\Models\\SubClientContact::create(['sub_client_id' => $sc->id, 'name' => '${CONTACT}', 'role' => 'client', 'phone' => '6111-1111']);

// cost=80/price=100 -> margen 20% (viola el mínimo 30% default). cost=50/price=100 -> 50% (sano).
$low = \\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::create(['reference' => '${REF_LOW}', 'description' => 'PreQA margen bajo', 'price_full' => 100, 'cost' => 80, 'is_active' => true]);
$healthy = \\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::create(['reference' => '${REF_HEALTHY}', 'description' => 'PreQA margen sano', 'price_full' => 100, 'cost' => 50, 'is_active' => true]);
$family = \\App\\Modules\\VentasDiseno\\Models\\CatalogProductFamily::create(['name' => '${FAMILY}', 'is_active' => true]);
$family->products()->attach([$low->id, $healthy->id]);

echo "FIXTURE_OK\\n";
`

  const stdout = execSync(
    `docker exec -i infra-laravel-1 php artisan tinker`,
    { input: script, encoding: 'utf8', timeout: 60000 },
  )
  // tinker hace eco del propio input línea por línea (prefijado "> ") antes de evaluarlo
  // — el string literal 'echo "FIXTURE_OK\n";' del script de arriba ya "contiene"
  // FIXTURE_OK por sí solo, así que un simple stdout.includes() daría falso positivo
  // aunque el script fallara a mitad de camino. Hay que confirmar la línea de RESULTADO
  // evaluado (sin el "echo " que la precede en la línea de eco del input).
  const ok = stdout.split('\n')
    .map(l => l.replace(/^>\s*/, ''))
    .some(l => l === 'FIXTURE_OK')
  if (!ok) {
    throw new Error(`Siembra de fixture falló, salida de tinker:\n${stdout}`)
  }
}

test.beforeAll(() => {
  seedFixture()
})

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(500)
}

async function openBlankQuote(page: Page) {
  await page.goto('/ventas-diseno/quotes')
  await page.waitForURL(/\/ventas-diseno\/quotes\/\d+/, { timeout: 15000 })
  await page.waitForTimeout(600)
}

// Pre-QA SCRUM-734 (re-check 2026-08-06) — `projectName` opcional: RN5.1/5.3
// (nuevas en SCRUM-734) excluyen del buscador cualquier Proyecto que YA tenga
// una cotización asociada (Borrador o generada) y bloquean crear uno nuevo con
// el mismo nombre bajo el mismo Subcliente. Reusar el PROJECT global en más de
// un test que llega a generar/confirmar choca con esa regla — cada test que
// necesita su "propio" proyecto limpio debe pasar un nombre distinto.
async function fillQuoteHeader(page: Page, projectName: string = PROJECT) {
  const masterInput = page.locator('label:has-text("Cliente Master") + input')
  await masterInput.fill(MASTER_CLIENT)
  await page.waitForTimeout(500)
  await page.getByText(MASTER_CLIENT).click()
  await page.waitForTimeout(400)

  const subInput = page.locator('label:has-text("Subcliente") + input')
  await subInput.fill(SUB_CLIENT)
  await page.waitForTimeout(500)
  await page.getByText(SUB_CLIENT).click()
  await page.waitForTimeout(600)

  const projectInput = page.locator('label:has-text("Proyecto") + input')
  await projectInput.fill(projectName)
  await page.waitForTimeout(500)
  await page.getByText(projectName).first().click()
  await page.waitForTimeout(300)

  await page.locator('label:has-text("Descripción") + input').fill(`[PREQA] Cotización de margen — Pre-QA SCRUM-725 (${STAMP})`)

  const architectInput = page.locator('label:has-text("Arquitecto") + input')
  await architectInput.fill(ARCHITECT)
  await page.waitForTimeout(500)
  await page.getByText(ARCHITECT).click()
  await page.waitForTimeout(300)

  await page.locator('label:has-text("Tipo de entrega") + select').selectOption('single')
  await page.waitForTimeout(200)
  await page.locator('input[type="date"]').first().fill('2026-12-31')

  // Contacto existente — requiere que el subcliente ya esté persistido (contactsReady)
  await page.waitForTimeout(500)
  const addExisting = page.locator('label:has-text("Agregar contacto existente") + input')
  await addExisting.fill(CONTACT)
  await page.waitForTimeout(500)
  await page.getByText(`${CONTACT} (Cliente)`).click().catch(async () => {
    await page.getByText(new RegExp(CONTACT)).first().click()
  })
  await page.waitForTimeout(400)
}

async function addPart(page: Page, name: string) {
  await page.getByPlaceholder('Nombre de la partida').fill(name)
  await page.getByRole('button', { name: '+ Agregar partida' }).click()
  await page.waitForTimeout(500)
}

// Ítem personalizado (no de catálogo) con margen sano (50%) — usado en SCRUM-723
// donde el margen no es lo que se está probando, solo se necesita ≥1 ítem para poder
// "generar" la cotización.
async function addHealthyCustomItem(page: Page) {
  await page.getByText('+ Agregar ítem').click()
  await page.getByPlaceholder('Referencia').fill('ITEM-SANO')
  await page.getByPlaceholder('Descripción').fill('[PREQA] Item sano')
  await page.locator('input[placeholder="Cantidad"]').fill('1')
  await page.locator('input[placeholder="Precio unitario"]').fill('100')
  await page.locator('input[placeholder="Costo"]').fill('50')
  await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
  await page.waitForTimeout(500)
}

async function generateQuote(page: Page) {
  await page.getByRole('button', { name: 'Guardar y generar cotización' }).click()
  await page.waitForTimeout(1000)
}

test.describe('SCRUM-723 — advertencia "Volver a Pipeline" sin guardar', () => {
  let generatedQuoteUrl = ''

  // Pre-QA SCRUM-734 (re-check 2026-08-06) — reescrito: RN0.4 ("un Borrador
  // nunca crea ni mueve ninguna tarjeta de Pipeline") movió la vinculación a
  // Pipeline exclusivamente a confirm() (QuoteService::resolveLinkedCardForConfirm()).
  // Antes de SCRUM-734, "generar" (asignar folio) ya vinculaba una PipelineCard,
  // así que el botón "Volver a Pipeline" existía apenas se generaba, sin
  // confirmar — el escenario original de este test 1/2 ("generado sin
  // confirmar, click en Volver a Pipeline, ver el modal") ya no puede ocurrir:
  // `pipeline_card_id` es null hasta confirm(), y el botón está gateado por
  // `quote.pipeline_card_id !== null` (QuotePage.tsx) — sin card, no hay botón.
  // La protección real que este test cubría (no perder una cotización
  // generada-pero-no-confirmada al navegar) sigue viva vía el guard del
  // Sidebar (mismo mecanismo que el test 4 de abajo, para el estado "generada
  // sin confirmar" en vez de "form tocado sin generar").
  test('1. Cotización generada (folio) SIN confirmar — sin tarjeta de Pipeline todavía (RN0.4), el Sidebar SÍ intercepta con "Salir sin guardar"', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await openBlankQuote(page)
    generatedQuoteUrl = page.url()
    await fillQuoteHeader(page)
    await addPart(page, '[PREQA] Sala')
    await addHealthyCustomItem(page)
    await generateQuote(page)
    // Debe quedar en Vista Previa con folio, todavía sin confirmar.
    await expect(page.getByText(/Cotización N°/)).toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-01-preview-generated-unconfirmed.png' })

    // RN0.4 — sin confirmar, todavía no hay PipelineCard vinculada: el atajo
    // "Volver a Pipeline" no debe existir en este estado.
    await expect(page.getByRole('button', { name: 'Volver a Pipeline' })).toHaveCount(0)

    // La protección contra perder el trabajo sigue viva por otra vía: navegar
    // por el Sidebar intercepta con el mismo modal "Salir sin guardar".
    await page.locator('nav').getByRole('button', { name: 'Clientes', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('button', { name: 'Salir sin guardar', exact: true })).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-02-exit-modal-shown.png' })

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.waitForTimeout(300)
    // Sigue en la cotización, no navegó.
    await expect(page).toHaveURL(generatedQuoteUrl)
    await expect(page.getByRole('button', { name: 'Salir sin guardar', exact: true })).toHaveCount(0)
  })

  test('2. Confirmar salida por el Sidebar — server-side, la cotización sigue sin confirmed_at y RN0.4 se cumple: ninguna PipelineCard se creó para su proyecto', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto(generatedQuoteUrl)
    await page.waitForTimeout(800)
    const quoteId = generatedQuoteUrl.match(/quotes\/(\d+)/)?.[1]
    expect(quoteId).toBeTruthy()

    // activeView es estado local de React (no persiste en la URL) — tras el
    // reload vuelve a 'Formulario' por defecto, donde isUnsaved depende de
    // formTouched (false recién cargado). Hay que volver a Vista Previa para
    // que isUnsaved vuelva a ser true (folio ya asignado, todavía sin confirmar).
    await page.getByRole('button', { name: 'Vista previa' }).click()
    await page.waitForTimeout(500)
    await page.locator('nav').getByRole('button', { name: 'Clientes', exact: true }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Salir sin guardar', exact: true }).click()
    await page.waitForURL(/\/ventas-diseno\/clients/, { timeout: 10000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-03-navigated-away-confirmed-exit.png' })

    const stdout = execSync('docker exec -i infra-laravel-1 php artisan tinker', {
      input: `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$q = \\App\\Modules\\VentasDiseno\\Models\\Quote::find(${quoteId});
$cardExists = $q->sales_project_id === null ? 'NO_PROJECT' : (\\App\\Modules\\VentasDiseno\\Models\\PipelineCard::where('sales_project_id', $q->sales_project_id)->exists() ? 'YES' : 'NO');
echo "CONFIRMED_AT:" . ($q->confirmed_at ?? 'NULL') . "\\n";
echo "CARD_EXISTS:" . $cardExists . "\\n";
`,
      encoding: 'utf8', timeout: 30000,
    })
    const lines = stdout.split('\n').map(l => l.replace(/^>\s*/, ''))
    expect(lines.find(l => l.startsWith('CONFIRMED_AT:'))).toBe('CONFIRMED_AT:NULL')
    expect(lines.find(l => l.startsWith('CARD_EXISTS:'))).toBe('CARD_EXISTS:NO')
  })

  test('4. Formulario tocado SIN generar — navegar por el Sidebar también intercepta (regresión del guard pre-existente)', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await openBlankQuote(page)
    await page.locator('label:has-text("Descripción") + input').fill('[PREQA] Form tocado sin generar')
    await page.waitForTimeout(300)
    await page.locator('nav').getByRole('button', { name: 'Clientes', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('button', { name: 'Salir sin guardar', exact: true })).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-04-form-touched-sidebar-intercepted.png' })
    // No navegó todavía (el modal sigue abierto)
    await expect(page).toHaveURL(/\/ventas-diseno\/quotes\/\d+/)
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  })

  test('5. Cotización YA confirmada — "Volver a Pipeline" navega directo, sin modal', async ({ page }) => {
    // Proyecto propio (no el PROJECT global) — el test 1 de este mismo describe
    // ya generó una cotización sobre PROJECT, y RN5.1/5.3 (SCRUM-734) ya no
    // permiten reutilizar un nombre de Proyecto que ya tiene alguna cotización.
    const ownProject = `${PROJECT} Confirmada`
    await login(page, VENDEDOR_SIN_PERMISO)
    await openBlankQuote(page)
    await fillQuoteHeader(page, ownProject)
    await addPart(page, '[PREQA] Confirmada')
    await addHealthyCustomItem(page)
    await generateQuote(page)
    await expect(page.getByText(/Cotización N°/)).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('heading', { name: 'Guardar cotización' })).toBeVisible()
    await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Guardada')).toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-05-confirmed.png' })

    await page.getByRole('button', { name: 'Volver a Pipeline' }).click()
    await page.waitForURL(/\/ventas-diseno\/pipeline/, { timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Salir sin guardar', exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/723-06-confirmed-no-modal.png' })
  })
})

async function addCatalogItemByReference(page: Page, reference: string) {
  await page.getByText('+ Agregar ítem').click()
  await page.getByRole('button', { name: 'Buscar en catálogo' }).click()
  await page.getByPlaceholder(/buscar/i).fill(reference)
  await page.waitForTimeout(500)
  await page.getByText(reference, { exact: false }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Seleccionar producto' }).click()
  await page.waitForTimeout(300)
}

// La referencia/descripción de un ítem de catálogo ya agregado se renderiza dentro de
// un <input disabled>, no como texto plano — getByText() no lo encuentra, hay que
// buscar por el value del input.
function itemRowByReference(page: Page, reference: string) {
  return page.locator('tr').filter({ has: page.locator(`input[value="${reference}"]`) })
}

test.describe('SCRUM-725 — margen mínimo (30%) por producto/global + excepción Mark/David', () => {
  let vendorQuoteUrl = ''

  test('1. Sin permiso — agregar producto de margen bajo (20%) BLOQUEA (422), revelando el 30% (decisión de Luis 2026-08-05)', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await openBlankQuote(page)
    vendorQuoteUrl = page.url()
    // Proyecto propio — RN5.1 (SCRUM-734) excluye del buscador cualquier Proyecto
    // que ya tenga una cotización asociada (Borrador o generada); el PROJECT
    // global ya lo consume el describe de SCRUM-723 en este mismo archivo.
    await fillQuoteHeader(page, `${PROJECT} Margen Vendedor`)
    await addPart(page, '[PREQA] Margen')
    await page.waitForTimeout(400)

    await addCatalogItemByReference(page, REF_LOW)
    await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.waitForTimeout(600)

    // Debe seguir en el formulario de alta (no se cerró = no se creó el ítem) con un error visible.
    await expect(page.getByText(/margen.*debajo del mínimo permitido/i)).toBeVisible()
    const errorText = await page.getByText(/margen.*debajo del mínimo permitido/i).first().textContent()
    expect(errorText).toContain('30')
    await expect(page.locator('table')).toHaveCount(0) // ningún ítem creado todavía
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-01-low-margin-blocked.png' })

    // Limpieza: cerrar el form de alta para no ensuciar el siguiente escenario.
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click().catch(() => {})
  })

  test('2. Sin permiso — ítem sano + descuento GLOBAL que empuja el margen bajo el mínimo BLOQUEA en Totales', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto(vendorQuoteUrl)
    await page.waitForTimeout(800)

    await addCatalogItemByReference(page, REF_HEALTHY)
    await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.waitForTimeout(600)
    await expect(itemRowByReference(page, REF_HEALTHY)).toBeVisible()

    // Modo de descuento -> Global, 30% (cost=50/price=100 -> margen post-descuento 28.6% < 30%)
    await page.getByRole('button', { name: 'Global', exact: true }).click()
    await page.waitForTimeout(400)
    const discountInput = page.locator('div').filter({ hasText: 'Modo de descuento' }).locator('input[type="number"]').first()
    await discountInput.fill('30')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).first().click()
    await page.waitForTimeout(700)

    await expect(page.getByText(/margen.*debajo del mínimo permitido/i)).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-02-global-discount-blocked.png' })
  })

  test('3. Sin permiso — precio manual de un producto de CATÁLOGO que viola el margen BLOQUEA (vía el modal de precio, SCRUM-734), y el precio maestro del Catálogo NO cambia', async ({ page }) => {
    // Pre-QA SCRUM-734 (re-check 2026-08-06) — actualizado: SCRUM-734 reemplazó el
    // input inline de precio por un modal dedicado (botón "$100.00" -> modal con
    // "Nuevo precio" + validación en vivo + Guardar/Cancelar). El escenario de
    // negocio que este test protege (precio manual bajo el margen NO persiste) es
    // el mismo, solo cambió cómo se llega a él en la UI.
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto(vendorQuoteUrl)
    await page.waitForTimeout(800)

    // El ítem de catálogo agregado en el test anterior (REF_HEALTHY, cost=50):
    // bajar el precio unitario a 60 -> margen (60-50)/60 = 16.7%, viola.
    const row = itemRowByReference(page, REF_HEALTHY)
    const priceButton = row.getByRole('button', { name: '$100.00' })
    await expect(priceButton).toBeEnabled() // SCRUM-725: ya no bloqueado por ser de catálogo
    await priceButton.click()

    const modal = page.getByRole('heading', { name: 'Editar precio' }).locator('..').locator('..')
    const newPriceInput = modal.locator('input[type="number"]')
    await newPriceInput.fill('60')
    await page.waitForTimeout(700) // debounce (300ms) + round-trip a previewPrice()

    await expect(page.getByText(/margen.*debajo del mínimo permitido/i)).toBeVisible()
    const saveButton = modal.getByRole('button', { name: 'Guardar', exact: true })
    await expect(saveButton).toBeDisabled()
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-03-manual-price-blocked.png' })

    // Cancelar cierra sin persistir — el precio de la fila sigue en $100.00.
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.waitForTimeout(300)
    await expect(priceButton).toHaveText('$100.00')
  })

  test('4. Verificación server-side: CatalogProduct.price_full de REF_HEALTHY sigue en 100 pese al intento de override', async () => {
    const stdout = execSync(
      `docker exec -i infra-laravel-1 php artisan tinker`,
      {
        input: `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$p = \\App\\Modules\\VentasDiseno\\Models\\CatalogProduct::where('reference', '${REF_HEALTHY}')->first();
echo "PRICE_FULL:" . $p->price_full . "\\n";
`,
        encoding: 'utf8', timeout: 30000,
      },
    )
    // tinker (REPL interactivo) prefija CADA línea de salida con "> ", incluyendo el eco
    // del propio input antes de evaluarlo — hay que sacar ese prefijo de cada línea antes
    // de buscar la real (la del eco del input arranca con "echo ...", la del resultado
    // evaluado arranca con "PRICE_FULL:100" a secas, una vez sacado el "> ").
    const line = stdout.split('\n').map(l => l.replace(/^>\s*/, '')).find(l => l.startsWith('PRICE_FULL:'))
    expect(line).toContain('PRICE_FULL:100')
  })

  test('5. Sin permiso — "agregar familia" con un producto de margen bajo: SE SALTEA ese, el resto se crea', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await openBlankQuote(page)
    await fillQuoteHeader(page, `${PROJECT} Margen Familia`)
    await addPart(page, '[PREQA] Familia')
    await page.waitForTimeout(400)

    await page.getByText('+ Agregar ítem').click()
    await page.getByRole('button', { name: 'Buscar en catálogo' }).click()
    await page.getByRole('button', { name: 'Familias' }).click()
    await page.waitForTimeout(500)
    await page.getByText(FAMILY).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Seleccionar productos' }).click()
    await page.waitForTimeout(700)

    // El producto sano se crea; el de margen bajo se saltea sin fallar el resto.
    await expect(itemRowByReference(page, REF_HEALTHY)).toBeVisible()
    await expect(itemRowByReference(page, REF_LOW)).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-05-family-add-skips-low-margin.png' })
  })

  let markQuoteUrl = ''

  test('6. Mark (con permiso) — agregar producto de margen bajo NO bloquea, queda resaltado en rojo con mensaje (con el 30% visible)', async ({ page }) => {
    await login(page, MARK)
    await openBlankQuote(page)
    markQuoteUrl = page.url()
    await fillQuoteHeader(page, `${PROJECT} Margen Mark`)
    await addPart(page, '[PREQA] Mark Margen')
    await page.waitForTimeout(400)

    await addCatalogItemByReference(page, REF_LOW)
    await page.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.waitForTimeout(600)

    // A diferencia del vendedor sin permiso: el ítem SÍ se crea.
    const row = itemRowByReference(page, REF_LOW)
    await expect(row).toBeVisible()
    const belowMarginMsg = page.getByText('Este producto quedó por debajo del margen mínimo permitido')
    await expect(belowMarginMsg).toBeVisible()
    const msgText = await belowMarginMsg.textContent()
    expect(msgText).toContain('30')
    // Botón de precio con borde rojo (below_min_margin=true) — SCRUM-734 lo
    // convirtió de <input> a <button> que abre el modal de edición de precio.
    await expect(row.locator('td').nth(3).getByRole('button')).toHaveClass(/border-red-400/)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-06-mark-item-warning-not-blocked.png' })

    // Persistir el encabezado (Proyecto/Descripción/Arquitecto son solo estado local
    // de React hasta un guardado explícito) — si no, se pierde al recargar en el
    // siguiente test.
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await page.waitForTimeout(700)
  })

  test('7. Mark — "Guardar" (confirm) con margen violado muestra modal de advertencia; "Cancelar" NO guarda', async ({ page }) => {
    await login(page, MARK)
    await page.goto(markQuoteUrl)
    await page.waitForTimeout(600)

    await page.locator('label:has-text("Tipo de entrega") + select').selectOption('single')
    await page.waitForTimeout(200)
    await page.locator('input[type="date"]').first().fill('2026-12-31')
    await page.getByRole('button', { name: 'Guardar y generar cotización' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText(/Cotización N°/)).toBeVisible({ timeout: 8000 })

    // Paso 1: "Guardar" en la Vista Previa abre PRIMERO el modal genérico de
    // confirmación (SaveQuoteConfirmModal, "Guardar cotización") — el de advertencia
    // de margen solo aparece cuando confirm() responde 422 margin_warning=true,
    // después de confirmar ese primer paso.
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('heading', { name: 'Guardar cotización' })).toBeVisible()
    await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
    await page.waitForTimeout(600)
    // Con margen violado, el modal de ADVERTENCIA reemplaza al genérico.
    await expect(page.getByRole('heading', { name: 'Advertencia de margen mínimo' })).toBeVisible()
    const bodyText = await page.getByText(/rentabilidad del negocio/).textContent()
    expect(bodyText).toContain('30')
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-07-mark-warning-modal.png' })

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText('Guardada')).toHaveCount(0)
  })

  test('8. Mark — "Continuar" en el modal de advertencia SÍ guarda (confirmed_at queda seteado)', async ({ page }) => {
    await login(page, MARK)
    await page.goto(markQuoteUrl)
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Vista previa' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByRole('heading', { name: 'Guardar cotización' })).toBeVisible()
    await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
    await page.waitForTimeout(600)
    await expect(page.getByRole('heading', { name: 'Advertencia de margen mínimo' })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Guardada')).toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/725-08-mark-continue-saves.png' })
  })
})

test.describe('SCRUM-728 — submenú Catálogo en CRM', () => {
  test('1. Usuario con ventas_diseno.read VE el submenú Catálogo bajo CRM', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto('/ventas-diseno/pipeline')
    await page.waitForTimeout(800)
    // Scope al <nav> del Sidebar — la pantalla de Pipeline también tiene su propio
    // botón "Catálogo" en el header (mismo texto), sin esto el locator es ambiguo.
    const catalogLink = page.locator('nav').getByRole('button', { name: 'Catálogo', exact: true })
    await expect(catalogLink).toBeVisible()
    await catalogLink.click()
    await page.waitForURL(/\/ventas-diseno\/catalog/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/ventas-diseno\/catalog/)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/728-01-catalog-via-sidebar.png' })
  })

  test('2. Los botones "Catálogo" existentes (ej. Clientes) siguen funcionando igual', async ({ page }) => {
    await login(page, VENDEDOR_SIN_PERMISO)
    await page.goto('/ventas-diseno/clients')
    await page.waitForTimeout(800)
    const btn = page.locator('main').getByRole('button', { name: 'Catálogo', exact: true })
    await expect(btn).toBeVisible()
    await btn.click()
    await page.waitForURL(/\/ventas-diseno\/catalog/, { timeout: 10000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/728-02-catalog-via-existing-button.png' })
  })

  test('3. Usuario SIN ventas_diseno.read NO ve el submenú Catálogo (ni la sección CRM)', async ({ page }) => {
    await login(page, TECNICO_SIN_VENTAS)
    await page.waitForTimeout(800)
    await expect(page.locator('nav').getByRole('button', { name: 'Catálogo', exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/728-03-no-catalog-for-unauthorized.png' })
  })
})

test.describe('SCRUM-729 — sidebar Compras un solo activo + provider picker foco/blur', () => {
  test('1. /compras/ordenes/nueva resalta SOLO "Nueva Orden"', async ({ page }) => {
    await login(page, LIDER_COMPRAS)
    await page.goto('/compras/ordenes/nueva')
    await page.waitForTimeout(800)
    const nuevaOrden = page.locator('nav').getByRole('button', { name: 'Nueva Orden', exact: true })
    const verOrdenes = page.locator('nav').getByRole('button', { name: 'Ver Órdenes', exact: true })
    await expect(nuevaOrden).toHaveClass(/bg-\[#d1ede9\]/)
    await expect(verOrdenes).not.toHaveClass(/bg-\[#d1ede9\]/)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/729-01-nueva-orden-solo-activo.png' })
  })

  test('2. /compras/ordenes resalta SOLO "Ver Órdenes"', async ({ page }) => {
    await login(page, LIDER_COMPRAS)
    await page.goto('/compras/ordenes')
    await page.waitForTimeout(800)
    const nuevaOrden = page.locator('nav').getByRole('button', { name: 'Nueva Orden', exact: true })
    const verOrdenes = page.locator('nav').getByRole('button', { name: 'Ver Órdenes', exact: true })
    await expect(verOrdenes).toHaveClass(/bg-\[#d1ede9\]/)
    await expect(nuevaOrden).not.toHaveClass(/bg-\[#d1ede9\]/)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/729-02-ver-ordenes-solo-activo.png' })
  })

  test('3. Campo Proveedor: lista NO desplegada permanentemente, se abre con foco/tipeo y cierra al elegir', async ({ page }) => {
    await login(page, LIDER_COMPRAS)
    await page.goto('/compras/ordenes/nueva')
    await page.waitForTimeout(800)
    const providerInput = page.getByPlaceholder(/proveedor/i).first()
    // Sin foco: la lista no debería estar visible aunque haya proveedores.
    await expect(page.locator('ul.absolute.z-50')).toHaveCount(0)
    await providerInput.click()
    await providerInput.fill('a')
    await page.waitForTimeout(600)
    const list = page.locator('ul.absolute.z-50')
    await expect(list).toBeVisible()
    const firstOption = list.locator('button').first()
    const optionText = await firstOption.textContent()
    await firstOption.click()
    await page.waitForTimeout(400)
    await expect(list).toHaveCount(0)
    if (optionText) {
      await expect(page.getByText(optionText.trim(), { exact: false })).toBeVisible()
    }
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/729-03-provider-picker-closes.png' })
  })

  test('4. Campo Proveedor: perder el foco sin elegir cierra la lista', async ({ page }) => {
    await login(page, LIDER_COMPRAS)
    await page.goto('/compras/ordenes/nueva')
    await page.waitForTimeout(800)
    const providerInput = page.getByPlaceholder(/proveedor/i).first()
    await providerInput.click()
    await providerInput.fill('a')
    await page.waitForTimeout(600)
    await expect(page.locator('ul.absolute.z-50')).toBeVisible()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(400)
    await expect(page.locator('ul.absolute.z-50')).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-batch/729-04-provider-picker-blur-closes.png' })
  })
})
