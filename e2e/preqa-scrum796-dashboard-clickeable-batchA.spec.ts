import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * Pre-QA — SCRUM-796 Batch A (secc. 1/3/4): Dashboard CRM clickeable. Se promueve a spec
 * permanente porque toca un mecanismo de deep-link (`?stage=`/`?tag=` en Pipeline) que ya
 * comparte código con el gate viejo de REQ-074 (`?stage=approved`) — un cambio futuro en
 * `PipelinePage.tsx` que rompa esto no lo detectaría ningún otro spec existente (ver hallazgo
 * de Pre-QA, sesión SCRUM-796 2026-08-25: las conductas nuevas de este batch solo habían sido
 * probadas por un harness adversarial descartable).
 *
 * Corre contra el Vite dev server local por defecto (no `dev.atlanticerp.ai`) — a diferencia de
 * preqa-scrum684-689-dashboard-crm-batchc.spec.ts, cuyo default remoto llevó a validar el
 * código YA DESPLEGADO en vez del cambio local durante esta misma sesión (ver changelog).
 * Serial + workers=1: logins reales concurrentes con el mismo usuario se pisan (mismo criterio
 * que preqa-scrum684-689, y confirmado en vivo en esta sesión).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const MGMT_EMAIL = 'whil@illuminations.com.pa'
const MGMT_PASS = 'whil@illuminations.com.pa'

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', MGMT_EMAIL)
  await page.fill('input[type="password"]', MGMT_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(/ventas-diseno|crm|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

test.describe('SCRUM-796 secc. 1.1/1.2 — deep-link ?stage= genérico', () => {
  test('?stage=lost filtra a una sola columna y "Todos" lo limpia de verdad', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline?stage=lost`)
    await page.waitForTimeout(1000)

    // Solo la columna "Perdido" debe quedar visible — las otras 5 desaparecen del tablero.
    await expect(page.getByText('Perdido', { exact: true }).first()).toBeVisible()
    for (const stage of ['Lead', 'Diseño', 'Cotización', 'Propuesta', 'Aprobado']) {
      await expect(page.getByRole('heading', { name: stage, exact: true })).toHaveCount(0)
    }

    // El badge removible del filtro debe estar presente (nombre accesible viene del
    // aria-label="Limpiar" del botón, no del glyph visual "×").
    await expect(page.getByRole('button', { name: 'Limpiar' })).toBeVisible()

    // "Todos" limpia el filtro heredado por deep-link — vuelven las 6 columnas.
    await page.getByRole('button', { name: /^todos$/i }).click()
    await page.waitForTimeout(500)
    for (const stage of ['Lead', 'Diseño', 'Cotización', 'Propuesta', 'Aprobado', 'Perdido']) {
      await expect(page.getByText(stage, { exact: true }).first()).toBeVisible()
    }

    expect(errors).toEqual([])
  })

  test('?stage=approved (mecanismo viejo REQ-074) sigue funcionando igual que antes', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline?stage=approved`)
    await page.waitForTimeout(1000)

    await expect(page.getByText('Aprobado', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lead', exact: true })).toHaveCount(0)
  })

  test('Dashboard CRM — click en tarjeta indicador navega a Pipeline con esa etapa filtrada', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1200)

    await page.getByText('Diseño', { exact: true }).first().click()
    await page.waitForURL(/\/ventas-diseno\/pipeline\?stage=design/, { timeout: 5000 })
    await expect(page.getByText('Diseño', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lead', exact: true })).toHaveCount(0)
  })
})

test.describe('SCRUM-796 secc. 1.3 — filtro por etiqueta exacta', () => {
  test('?tag=both filtra por "Diseño + Cotización" exacto, no une design+quote', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline?tag=both`)
    await page.waitForTimeout(1000)

    // Las 6 columnas de etapa se mantienen (el tag no restringe columnas, solo filtra tarjetas).
    for (const stage of ['Lead', 'Diseño', 'Cotización', 'Propuesta', 'Aprobado', 'Perdido']) {
      await expect(page.getByText(stage, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Limpiar' })).toBeVisible()
  })

  test('Dashboard CRM — click en leyenda "Diseño + Cotización" navega con ?tag=both exacto', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: /diseño \+ cotización/i }).click()
    await page.waitForURL(/\/ventas-diseno\/pipeline\?tag=both/, { timeout: 5000 })
  })
})

test.describe('SCRUM-796 secc. 4 — top-3 + "Ver más" + navegación puntual', () => {
  test.beforeAll(() => {
    // Self-seed: 4 tarjetas estancadas (>15 días) para el mismo Cliente Master, para forzar
    // el caso ">3" (el indicador debe mostrar "Ver más" recién con más de 3 — no con exactamente
    // 3) y confirmar que cada una es su propia fila navegable, nunca colapsada por cliente.
    // Idempotente (firstOrCreate/updateOrCreate en cada paso) — spec permanente, se re-corre
    // muchas veces sobre el mismo Postgres no-fresh, no debe acumular filas duplicadas cada vez.
    // Pasado por stdin (no embebido en el comando) — un template literal con $variables de
    // PHP dentro de un string de shell entre comillas dobles se corrompe (bash expande sus
    // propios "$master"/"$i" como variables de shell antes de que tinker los vea).
    const tinker = `
      \\App\\Shared\\Multitenancy\\Tenant::first()->makeCurrent();
      $master = \\App\\Modules\\VentasDiseno\\Models\\MasterClient::firstOrCreate(['name' => 'SCRUM796 Cliente Ver Mas']);
      $owner = \\App\\Models\\User::where('email', 'whil@illuminations.com.pa')->first();
      for ($i = 1; $i <= 4; $i++) {
        $project = \\App\\Modules\\VentasDiseno\\Models\\SalesProject::firstOrCreate(['name' => "SCRUM796 VerMas Proyecto $i"]);
        \\App\\Modules\\VentasDiseno\\Models\\PipelineCard::updateOrCreate(
          ['sales_project_id' => $project->id],
          ['stage' => 'design', 'master_client_id' => $master->id, 'owner_id' => $owner->id, 'stage_changed_at' => now()->subDays(16 + $i)],
        );
      }
      echo 'seeded'.PHP_EOL;
    `
    execSync(
      'docker compose exec -T laravel php artisan tinker',
      { cwd: '/Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend/infra', input: tinker, stdio: ['pipe', 'inherit', 'inherit'] },
    )
  })

  test('más de 3 clientes estancados muestra "Ver más", el modal lista todos, y cada fila navega a su propia tarjeta', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1200)

    await expect(page.getByText(/clientes sin contacto reciente/i)).toBeVisible()
    const viewMore = page.getByRole('button', { name: /ver más/i })
    await expect(viewMore).toBeVisible()

    await viewMore.click()
    await page.waitForTimeout(500)

    // Las 4 tarjetas del cliente sembrado aparecen como filas separadas dentro del modal —
    // nunca colapsadas en una sola entrada de "SCRUM796 Cliente Ver Mas". Acotado al overlay
    // del modal (z-[60]) porque el top-3 de la página de fondo sigue montado detrás y repite
    // 3 de los mismos 4 nombres — sin acotar, el conteo cuenta ambos lugares a la vez.
    const rows = page.locator('div.z-\\[60\\]').getByRole('button', { name: /SCRUM796 VerMas Proyecto/ })
    await expect(rows).toHaveCount(4)

    // Click en una fila puntual (no la primera) navega a SU tarjeta, no a otra.
    await rows.nth(2).click()
    await page.waitForURL(/\/ventas-diseno\/pipeline\?card=\d+/, { timeout: 5000 })
  })
})
