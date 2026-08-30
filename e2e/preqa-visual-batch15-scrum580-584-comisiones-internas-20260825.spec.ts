import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

// Pre-QA + Visual Review fusionado — Batch 15 Comisiones Internas (SCRUM-580->584, REQ-503->507).
// PROMOVIDO A PERMANENTE (SCRUM-582 encontro un CRITICO real, ver
// docs/pre-qa/scrum580-584-batch15-comisiones-internas-20260825.md). Contra dev.atlanticerp.ai.
//
// REQ-506 (proyectos compartidos) no tiene UI de asignacion (decision de diseno, ver ADR §4 de
// ADR-SCRUM580-584) — `pipeline_cards.compartido_con` solo se puede setear por tinker. Por
// feedback_e2e_permanent_tests_must_self_seed, ese test se autosiembra en beforeAll/afterAll en
// vez de asumir un pedido pre-sembrado a mano (que se pierde en la siguiente corrida, o si otra
// sesion lo despuebla como paso en esta misma sesion).

const FELIX = 'conta@illuminations.com.pa'
const MARK = 'mbekhar@illuminations.com.pa'
const MARK_PASS = 'B1n4X_2026?'
const MILENA = 'milena.e@grupolafayette.com'

async function login(page: Page, email: string, password?: string): Promise<boolean> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
  return !page.url().includes('/login')
}

async function goToComisiones(page: Page): Promise<void> {
  await page.goto('/admin-contab/comisiones/internas')
  await page.waitForTimeout(1200)
}

test('REQ-503/505 — Neil Quiel: NC visible con referencia, agrupacion por mes con arrastre', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await goToComisiones(page)

  // filtrar a Neil Quiel
  const vendorSelect = page.locator('select').nth(1)
  await vendorSelect.selectOption({ label: 'Neil Quiel' })
  await page.waitForTimeout(900)

  const row = page.locator('td', { hasText: 'Neil Quiel' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForTimeout(600)

  await page.screenshot({ path: 'e2e/.tmp/b15-01-neil-expanded.png', fullPage: true })

  const expandedRow = page.locator('tr').filter({ has: page.locator('td[colspan="7"]') })

  // REQ-505: 3 grupos por mes (agosto actual, julio arrastrado, abril arrastrado)
  await expect(expandedRow.getByText(/^agosto/i).first()).toBeVisible()
  const arrastradoTags = expandedRow.getByText('Arrastrado', { exact: false })
  await expect(arrastradoTags.first()).toBeVisible()
  const arrastradoCount = await arrastradoTags.count()
  expect(arrastradoCount).toBeGreaterThanOrEqual(2) // julio + abril

  // REQ-503: referencia de NC visible en rojo, con el numero de nota
  await expect(expandedRow.getByText('NC-0002', { exact: false })).toBeVisible()
  await expect(expandedRow.getByText('NC-0003', { exact: false })).toBeVisible()
})

test('REQ-507 — estado de cuenta: mes en curso (3 totales) vs mes cerrado (solo pagado), boton PDF', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await goToComisiones(page)

  const vendorSelect = page.locator('select').nth(1)
  await vendorSelect.selectOption({ label: 'Neil Quiel' })
  await page.waitForTimeout(900)
  await page.locator('td', { hasText: 'Neil Quiel' }).first().click()
  await page.waitForTimeout(600)

  const verEstadoCuenta = page.getByText('Ver estado de cuenta', { exact: false })
  await expect(verEstadoCuenta).toBeVisible()
  await verEstadoCuenta.click()
  await page.waitForTimeout(900)

  const modal = page.locator('[data-testid="account-statement-modal"]')
  await expect(modal).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/b15-04-estado-cuenta-mes-actual.png', fullPage: true })

  // mes en curso: debe mostrar Por pagar y Pendiente de cobro (totales, no el estado por-fila),
  // y descuento NC — el bloque de totales es el ultimo div.space-y-1 del modal
  const totalsBlock = modal.locator('div.space-y-1')
  await expect(totalsBlock.getByText('Por pagar', { exact: false })).toBeVisible()
  await expect(totalsBlock.getByText('Pendiente de cobro', { exact: false })).toBeVisible()
  await expect(totalsBlock.getByText(/descuento.*nota.*cr[eé]dito/i)).toBeVisible()

  // boton Ver/Imprimir PDF dispara la descarga sin error
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  await modal.getByText(/Ver.*Imprimir|Imprimir.*PDF/i).click()
  const download = await downloadPromise
  expect(download).not.toBeNull()

  await modal.getByText('Cerrar', { exact: false }).click()
  await page.waitForTimeout(400)

  // mes cerrado (julio, ya paso): RN1 -- solo pagado de ese mes, nota de mes cerrado, sin
  // Por pagar/Pendiente de cobro en los totales, y no debe romperse aunque groups quede vacio
  // (no hay ordenes 'pagado' reales en dev todavia -- documentado como limitacion)
  await page.getByLabel('Mes anterior', { exact: false }).click()
  await page.waitForTimeout(900)
  // la fila puede seguir expandida de antes (expandedVendor persiste entre cambios de mes) — solo
  // hacer click si el boton "Ver estado de cuenta" todavia no esta visible
  if (!(await page.getByText('Ver estado de cuenta', { exact: false }).isVisible().catch(() => false))) {
    await page.locator('td', { hasText: 'Neil Quiel' }).first().click()
    await page.waitForTimeout(600)
  }
  await page.getByText('Ver estado de cuenta', { exact: false }).click()
  await page.waitForTimeout(900)
  await expect(modal).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/b15-07-estado-cuenta-mes-cerrado.png', fullPage: true })
  await expect(modal.getByText('liquidado', { exact: false })).toBeVisible()
  const totalsBlockClosed = modal.locator('div.space-y-1')
  await expect(totalsBlockClosed.getByText('Por pagar', { exact: false })).toHaveCount(0)
  await expect(totalsBlockClosed.getByText('Pendiente de cobro', { exact: false })).toHaveCount(0)
})

test('REQ-505 — vendedor con cero pedidos EN TODA LA HISTORIA (Designer Demo, id 48): fila y mensaje', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()
  await goToComisiones(page)

  const vendorSelect = page.locator('select').nth(1)
  await vendorSelect.selectOption({ label: 'Designer Demo' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/b15-05-designer-demo-sin-pedidos.png', fullPage: true })

  // Regresion SCRUM-582: antes del fix, filtrar a un vendedor sin NINGUN pedido en su historia
  // devolvia "vendedores: []" y la tabla mostraba "Sin vendedores para este filtro." — nunca
  // habia fila que expandir. Debe existir la fila y, al expandirla, mostrar el mensaje correcto.
  const row = page.locator('td', { hasText: 'Designer Demo' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForTimeout(600)
  const expandedRow = page.locator('tr').filter({ has: page.locator('td[colspan="7"]') })
  await expect(expandedRow.getByText('Sin pedidos registrados todavía.', { exact: false })).toBeVisible()
})

test('PERMISOS — Milena (vendedor) solo ve su propia fila, sin selector de vendedor ni exportar', async ({ page }) => {
  const ok = await login(page, MILENA)
  expect(ok).toBeTruthy()
  await goToComisiones(page)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'e2e/.tmp/b15-06-milena-vendedor-view.png', fullPage: true })

  const selects = page.locator('select')
  await expect(selects).toHaveCount(1) // solo el select de mes, sin selector de vendedor
  await expect(page.getByText('Exportar', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Kayra Milena Estrada', { exact: false }).first()).toBeVisible()
})

test('ICONOGRAFIA — sin emoji en toda la pantalla de Comisiones Internas', async ({ page }) => {
  const ok = await login(page, MARK, MARK_PASS)
  expect(ok).toBeTruthy()
  await goToComisiones(page)
  await page.waitForTimeout(900)
  const bodyText = await page.locator('body').innerText()
  // eslint-disable-next-line no-control-regex
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  expect(emojiRegex.test(bodyText)).toBeFalsy()
})

test.describe('REQ-506 — proyectos compartidos (fixture self-seed/cleanup)', () => {
  // pedido_id (pipeline_cards.id) usado para este test — owner Idmar Hernandez
  // (idmar@illuminations.com.pa), amount=549.27, mes de cierre agosto 2026. Compartido con
  // Bernardo Gomez.
  const SHARED_PEDIDO_ID = 184
  const SHARED_WITH_USER_ID = 42 // Bernardo Gomez

  function sshTinker(phpExpr: string): void {
    const escaped = phpExpr.replace(/"/g, '\\"')
    execSync(
      'ssh -i /Users/lgarcia/.ssh/atlanticerp/atlanticerp-key.pem -o StrictHostKeyChecking=no ubuntu@dev.atlanticerp.ai ' +
      `"cd /var/www/backend && docker compose -f infra/docker-compose.qa.yml exec -T laravel php artisan tinker --execute=\\"${escaped}\\"" < /dev/null`,
      { stdio: 'pipe' },
    )
  }

  const tenantSwitch = "App\\Shared\\Multitenancy\\Tenant::forgetCurrent(); "
    + "App\\Shared\\Multitenancy\\Tenant::where('slug','illuminations')->first()->makeCurrent(); "

  test.beforeAll(() => {
    sshTinker(
      tenantSwitch
      + `DB::table('illuminations_ventas_diseno.pipeline_cards')->where('id', ${SHARED_PEDIDO_ID})`
      + `->update(['compartido_con' => json_encode([${SHARED_WITH_USER_ID}])]);`,
    )
  })

  test.afterAll(() => {
    sshTinker(
      tenantSwitch
      + `DB::table('illuminations_ventas_diseno.pipeline_cards')->where('id', ${SHARED_PEDIDO_ID})`
      + `->update(['compartido_con' => null]);`,
    )
  })

  test('pedido compartido: badge de compartido + total del proyecto, en ambos responsables', async ({ page }) => {
    const ok = await login(page, FELIX)
    expect(ok).toBeTruthy()
    await goToComisiones(page)

    const vendorSelect = page.locator('select').nth(1)
    await vendorSelect.selectOption({ label: 'Idmar Hernandez' })
    await page.waitForTimeout(900)
    await page.locator('td', { hasText: 'Idmar Hernandez' }).first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'e2e/.tmp/b15-02-idmar-shared.png', fullPage: true })
    const expandedIdmar = page.locator('tr').filter({ has: page.locator('td[colspan="7"]') })
    await expect(expandedIdmar.getByText('Compartido con', { exact: false })).toBeVisible()
    await expect(expandedIdmar.getByText('Bernardo Gomez', { exact: false })).toBeVisible()
    await expect(expandedIdmar.getByText('549.27', { exact: false })).toBeVisible() // total del proyecto completo
    await expect(expandedIdmar.getByText('274.64', { exact: false }).first()).toBeVisible() // su parte

    await vendorSelect.selectOption({ label: 'Bernardo Gomez' })
    await page.waitForTimeout(900)
    await page.locator('td', { hasText: 'Bernardo Gomez' }).first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'e2e/.tmp/b15-03-bernardo-shared.png', fullPage: true })
    const expandedBernardo = page.locator('tr').filter({ has: page.locator('td[colspan="7"]') })
    await expect(expandedBernardo.getByText('Compartido con', { exact: false })).toBeVisible()
    await expect(expandedBernardo.getByText('Idmar Hernandez', { exact: false })).toBeVisible()
    await expect(expandedBernardo.getByText('274.64', { exact: false }).first()).toBeVisible()
  })
})
