import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA adversarial — SCRUM-733: "Ver Órdenes: filtro de Proyecto no encuentra proyectos sin
 * cotización aprobada (mismo bug que SCRUM-214)".
 *
 * Foco real: un proyecto cuya ÚNICA orden está "Por aprobar" (sin cotización aprobada, sin envío
 * activo) tiene que ser encontrable en el filtro de Proyecto de Ver Órdenes (OrdersPage) — a
 * diferencia de Logística (LogisticsPage), que sigue excluyéndolo a propósito (REQ-151/
 * SCRUM-214). El fix comparte el mismo endpoint `shipment-projects` para ambas pantallas,
 * diferenciado por el query param `active_shipments` (Logística=true, Ver Órdenes=default false)
 * — ver `PurchaseOrderController::searchShipmentProjects()` y `comprasApi.shipmentProjects`.
 *
 * Se siembra el propio fixture en `beforeAll` (tinker vía docker exec), mismo patrón que
 * `preqa-scrum214-215-216-logistica-20260805.spec.ts` — nunca IDs hardcodeados, `infra/test.sh`
 * comparte la misma Postgres que el stack local y la vacía entre corridas.
 */
const LIDER_COMPRAS = 'gerencia2@atlantic.com.pa'
const SIN_PERMISO = 'designer@atlantic.test'
const STAMP = Date.now()

interface Fixture {
  provider: string
  projectPorAprobar: string
  projectOrdenado: string
  orderPorAprobar: number
  orderOrdenado: number
}

function seedFixture(): Fixture {
  const provider = `PreQA733 Provider ${STAMP}`
  const projectPorAprobar = `PreQA733 Torre PorAprobar ${STAMP}`
  const projectOrdenado = `PreQA733 Torre Ordenado ${STAMP}`

  const script = `
$tenant = \\App\\Shared\\Multitenancy\\Tenant::first();
$tenant->makeCurrent();
$mc = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::create(['name' => 'PreQA733 MC ${STAMP}']);
$sc = \\App\\Modules\\VentasDiseno\\Models\\SubClient::create(['master_client_id' => $mc->id, 'business_name' => 'PreQA733 SC ${STAMP}', 'tax_id' => 'TAX733-${STAMP}']);
// A propósito SIN Quote/PipelineCard -- ninguno de los dos proyectos pasa por
// documentStatus()==='approved', que es justo el gate que approved-projects exigía.
$spPorAprobar = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectPorAprobar}']);
$spOrdenado = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::create(['sub_client_id' => $sc->id, 'name' => '${projectOrdenado}']);

$prov = \\App\\Modules\\Compras\\Models\\Provider::create(['name' => '${provider}', 'currency' => 'USD']);

$oPorAprobar = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $prov->id, 'status' => 'por_aprobar', 'modality' => 'directo', 'total_amount' => 100]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $oPorAprobar->id, 'quantity' => 1, 'unit_cost' => 10, 'subtotal' => 10, 'sales_project_id' => $spPorAprobar->id]);

$oOrdenado = \\App\\Modules\\Compras\\Models\\PurchaseOrder::create(['provider_id' => $prov->id, 'status' => 'ordenado', 'modality' => 'directo', 'shipping_type' => 'terrestre', 'estimated_arrival_date' => '2026-09-01', 'total_amount' => 100]);
\\App\\Modules\\Compras\\Models\\PurchaseOrderLine::create(['purchase_order_id' => $oOrdenado->id, 'quantity' => 1, 'unit_cost' => 10, 'subtotal' => 10, 'sales_project_id' => $spOrdenado->id]);

echo "FIXTURE_JSON:" . json_encode(['orderPorAprobar' => $oPorAprobar->id, 'orderOrdenado' => $oOrdenado->id]) . "\\n";
`

  const stdout = execSync(
    `docker exec -i infra-laravel-1 php artisan tinker`,
    { input: script, encoding: 'utf8', timeout: 60000 },
  )
  const line = stdout.split('\n').find(l => l.includes('FIXTURE_JSON:'))
  if (!line) throw new Error(`No se encontró FIXTURE_JSON en la salida de tinker:\n${stdout}`)
  const ids = JSON.parse(line.split('FIXTURE_JSON:')[1]) as Record<string, number>

  return {
    provider, projectPorAprobar, projectOrdenado,
    orderPorAprobar: ids.orderPorAprobar, orderOrdenado: ids.orderOrdenado,
  }
}

let fx: Fixture

test.beforeAll(() => {
  fx = seedFixture()
})

async function login(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByPlaceholder('usuario@atlantic.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /iniciar sesión/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

test.describe('SCRUM-733 — Ver Órdenes: filtro de Proyecto', () => {
  test('camino feliz — proyecto con orden "Ordenado" aparece y filtra la tabla', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)
    await page.goto('/compras/ordenes')
    await page.waitForSelector('table')
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.waitFor({ state: 'visible', timeout: 10000 })
    await perPageSelect.selectOption('all')

    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectOrdenado)
    await page.waitForTimeout(700)
    const option = page.getByRole('button', { name: new RegExp(fx.projectOrdenado, 'i') })
    await expect(option).toBeVisible()
    await option.click()
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: `#${fx.orderOrdenado}` }).first()).toBeVisible()
    await expect(page.locator('td', { hasText: `#${fx.orderPorAprobar}` })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum733-01-camino-feliz.png', fullPage: true })
    // limpia el filtro para los pasos siguientes
    await page.getByRole('button', { name: new RegExp(fx.projectOrdenado, 'i') }).click()
    await page.waitForTimeout(400)
  })

  test('camino de ruptura — proyecto cuya única orden está "Por aprobar" SÍ aparece en Ver Órdenes', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)
    await page.goto('/compras/ordenes')
    await page.waitForSelector('table')
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.waitFor({ state: 'visible', timeout: 10000 })
    await perPageSelect.selectOption('all')

    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectPorAprobar)
    await page.waitForTimeout(700)
    const option = page.getByRole('button', { name: new RegExp(fx.projectPorAprobar, 'i') })
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: `#${fx.orderPorAprobar}` }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum733-02-camino-ruptura-por-aprobar.png', fullPage: true })
  })

  test('regresión Logística — el mismo proyecto "Por aprobar" NO aparece en el filtro de Logística', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)
    await page.goto('/compras/logistica')
    await page.waitForSelector('text=Logística')

    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectPorAprobar)
    await page.waitForTimeout(700)
    const option = page.getByRole('button', { name: new RegExp(fx.projectPorAprobar, 'i') })
    await expect(option).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum733-03-regresion-logistica-sin-resultado.png', fullPage: true })
  })

  test('búsqueda vacía / con espacios / sin match — no crashea, no muestra resultados falsos', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)
    await page.goto('/compras/ordenes')
    await page.waitForSelector('table')
    const input = page.getByPlaceholder('Buscar proyecto…')

    // Vacío: la query está `enabled: projectSearch.length > 0`, no debería ni dispararse.
    await input.fill('')
    await page.waitForTimeout(400)
    await expect(page.locator('ul.absolute')).toHaveCount(0)

    // Solo espacios: el backend hace trim(), no debería devolver "todos" los proyectos.
    await input.fill('    ')
    await page.waitForTimeout(700)
    const optionsAfterSpaces = page.locator('ul.absolute li')
    const countSpaces = await optionsAfterSpaces.count()
    // Documentamos el conteo real en vez de asumir 0 — un trim()==='' en el backend cae en el
    // branch "sin filtro de texto" de la query (WHERE ilike se salta), lo que devolvería TODOS
    // los proyectos con líneas de orden, no ninguno. Esto se reporta como hallazgo si count > 0.
    await page.screenshot({ path: 'test-results/scrum733-04-busqueda-espacios.png', fullPage: true })
    test.info().annotations.push({ type: 'espacios-en-blanco-resultado', description: `count=${countSpaces}` })

    // String que no matchea nada real.
    await input.fill('ZZZ_NO_EXISTE_NUNCA_733_XYZ')
    await page.waitForTimeout(700)
    await expect(page.locator('ul.absolute')).toHaveCount(0)
  })

  test('combinación de filtros — Proyecto + Estado en AND', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)
    await page.goto('/compras/ordenes')
    await page.waitForSelector('table')
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.waitFor({ state: 'visible', timeout: 10000 })
    await perPageSelect.selectOption('all')

    // Selecciona el proyecto "Por aprobar".
    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectPorAprobar)
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: new RegExp(fx.projectPorAprobar, 'i') }).click()
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: `#${fx.orderPorAprobar}` }).first()).toBeVisible()

    // Combina con Estado = "Ordenado" (no matchea la orden que está "por_aprobar") — AND real
    // debe vaciar la tabla, no ignorar uno de los dos filtros.
    const statusSelect = page.locator('select').nth(1)
    await statusSelect.selectOption('ordenado')
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: `#${fx.orderPorAprobar}` })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum733-05-combinado-sin-match.png', fullPage: true })

    // Cambia Estado a "Por aprobar" — ahora sí debe coincidir con ambos filtros.
    await statusSelect.selectOption('por_aprobar')
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: `#${fx.orderPorAprobar}` }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum733-05b-combinado-con-match.png', fullPage: true })
  })

  test('querystring — active_shipments viaja true en Logística y ausente en Ver Órdenes', async ({ page }) => {
    await login(page, LIDER_COMPRAS, LIDER_COMPRAS)

    const capturedOrders: string[] = []
    page.on('request', req => {
      if (req.url().includes('/api/compras/orders/shipment-projects')) capturedOrders.push(req.url())
    })
    await page.goto('/compras/ordenes')
    await page.waitForSelector('table')
    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectPorAprobar)
    await page.waitForTimeout(700)
    page.removeAllListeners('request')

    expect(capturedOrders.length).toBeGreaterThan(0)
    for (const url of capturedOrders) {
      const params = new URL(url).searchParams
      expect(params.get('active_shipments')).toBeNull()
    }

    const capturedLogistics: string[] = []
    page.on('request', req => {
      if (req.url().includes('/api/compras/orders/shipment-projects')) capturedLogistics.push(req.url())
    })
    await page.goto('/compras/logistica')
    await page.waitForSelector('text=Logística')
    await page.getByPlaceholder('Buscar proyecto…').fill(fx.projectOrdenado)
    await page.waitForTimeout(700)
    page.removeAllListeners('request')

    expect(capturedLogistics.length).toBeGreaterThan(0)
    for (const url of capturedLogistics) {
      const params = new URL(url).searchParams
      expect(params.get('active_shipments')).toBe('true')
    }
  })

  test('rol sin compras.read — shipment-projects sigue bloqueado con 403', async ({ page }) => {
    await login(page, SIN_PERMISO, 'Password123!')
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    expect(token).toBeTruthy()

    const res = await page.request.get('/api/compras/orders/shipment-projects?search=x', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })
})
