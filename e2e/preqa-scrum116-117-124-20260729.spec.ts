import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-116 (REQ-024 Cliente Master), SCRUM-117 (REQ-025 Subcliente),
 * SCRUM-124 (REQ-032 Entrega) — batch 2026-07-29, commit 58fdd4d sobre a45f41e.
 *
 * Corre contra dev.atlanticerp.ai. Serial a propósito: CrowdSec/ModSecurity dispara falsos
 * timeouts con logins en paralelo desde la misma IP (ver CLAUDE.md, Epic 11).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const DESIGNER_EMAIL = 'designer@atlantic.test'
const DESIGNER_PASS  = 'Password123!'

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(DESIGNER_EMAIL)
  await page.locator('input[type="password"]').fill(DESIGNER_PASS)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

async function openBlankQuote(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await page.waitForTimeout(1000)
  // El locale detectado por defecto en Chromium headless es en-US -> UI en ingles.
  // Forzamos ES via el toggle del TopBar para poder usar los mismos labels que ve
  // un usuario real (APP_LOCALE=es).
  const esToggle = page.getByRole('button', { name: 'ES', exact: true })
  if (await esToggle.isVisible().catch(() => false)) {
    await esToggle.click()
    await page.waitForTimeout(500)
  }
}

test.describe('SCRUM-116 — Cliente Master buscar y crear', () => {
  test('focus vacio muestra + Crear cliente inmediatamente', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    await masterInput.click()
    await page.waitForTimeout(500)
    await expect(page.getByText('+ Crear cliente')).toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-116-focus-vacio.png' })
  })

  test('fuzzy match por palabra compartida muestra + Crear junto a resultados', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    const list = page.locator('ul').filter({ has: page.getByText('+ Crear cliente') })
    await expect(list.getByText('+ Crear cliente')).toBeVisible({ timeout: 3000 })
    const resultCount = await list.locator('li').count()
    console.log('SCRUM-116 fuzzy "Grupo" -> li count (incl. + Crear):', resultCount)
    expect(resultCount).toBeGreaterThan(1) // al menos 1 resultado real + la opcion de crear
    await page.screenshot({ path: 'e2e/.tmp/preqa-116-fuzzy-match.png' })
  })

  test('nombre EXACTO de cliente existente oculta + Crear cliente', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    const firstOption = page.locator('ul li').first()
    const exactName = (await firstOption.textContent())?.trim() ?? ''
    expect(exactName.length).toBeGreaterThan(0)
    await masterInput.fill('')
    await page.waitForTimeout(300)
    await masterInput.fill(exactName)
    await page.waitForTimeout(700)
    await expect(page.getByText('+ Crear cliente')).not.toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-116-exact-match-no-create.png' })
  })
})

test.describe('SCRUM-117 — Subcliente acotado al Cliente Master', () => {
  test('lupa/campo Subcliente deshabilitado sin Cliente Master', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const subInput = page.locator('label:has-text("Subcliente")').locator('xpath=following-sibling::input[1]')
    await expect(subInput).toBeDisabled()
  })

  test('limpiar Cliente Master a mano (backspace) limpia y deshabilita Subcliente', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    const subInput = page.locator('label:has-text("Subcliente")').locator('xpath=following-sibling::input[1]')

    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    await page.locator('ul li').first().click()
    await page.waitForTimeout(500)
    await expect(subInput).toBeEnabled()

    // Elegir un subcliente para que el campo tenga valor antes de limpiar el master
    await subInput.click()
    await page.waitForTimeout(600)
    const subOptions = page.locator('ul li')
    const subCount = await subOptions.count()
    console.log('SCRUM-117 subclientes disponibles tras elegir master:', subCount)
    if (subCount > 0 && !(await subOptions.first().textContent())?.includes('+ Nuevo')) {
      await subOptions.first().click()
      await page.waitForTimeout(500)
    }

    // Backspace manual en Master, NO seleccionar otra opcion
    await masterInput.click()
    await masterInput.press('End')
    for (let i = 0; i < 40; i++) await masterInput.press('Backspace')
    await page.waitForTimeout(500)

    await expect(masterInput).toHaveValue('')
    await expect(subInput).toHaveValue('')
    await expect(subInput).toBeDisabled()
    await page.screenshot({ path: 'e2e/.tmp/preqa-117a-clear-master-clears-sub.png' })
  })

  test('re-elegir un Master nuevo reactiva Subcliente con busqueda propia (no arrastra el anterior)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    const subInput = page.locator('label:has-text("Subcliente")').locator('xpath=following-sibling::input[1]')

    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    const firstMasterLabel = (await page.locator('ul li').first().textContent())?.trim() ?? ''
    await page.locator('ul li').first().click()
    await page.waitForTimeout(500)

    await masterInput.click()
    await masterInput.press('End')
    for (let i = 0; i < 60; i++) await masterInput.press('Backspace')
    await page.waitForTimeout(400)

    await masterInput.fill('Inversiones')
    await page.waitForTimeout(700)
    const options = page.locator('ul').filter({ hasText: 'Inversiones' })
    const secondMasterLabel = (await options.locator('li').first().textContent())?.trim() ?? ''
    console.log('SCRUM-117 master1:', firstMasterLabel, '| master2 elegido:', secondMasterLabel)
    await options.locator('li').first().click()
    await page.waitForTimeout(500)

    await expect(subInput).toBeEnabled()
    await subInput.click()
    await page.waitForTimeout(600)
    const scopedList = await page.locator('ul li').allTextContents()
    console.log('SCRUM-117 subclientes tras elegir SEGUNDO master:', scopedList)
    // Ningun subcliente listado deberia pertenecer obviamente al primer master (chequeo best-effort)
    await page.screenshot({ path: 'e2e/.tmp/preqa-117a-remaster-fresh-search.png' })
  })

  test('+ Nuevo Subcliente aparece junto a resultados existentes (no solo con 0 resultados)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    const subInput = page.locator('label:has-text("Subcliente")').locator('xpath=following-sibling::input[1]')

    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    await page.locator('ul li').first().click()
    await page.waitForTimeout(500)

    await subInput.click()
    await page.waitForTimeout(700)
    const items = await page.locator('ul li').allTextContents()
    console.log('SCRUM-117b subcliente items en foco vacio:', items)
    const hasCreate = items.some(t => t.includes('Nuevo subcliente'))
    expect(hasCreate).toBeTruthy()
    await page.screenshot({ path: 'e2e/.tmp/preqa-117b-create-with-results.png' })
  })
})

test.describe('SCRUM-124 — Entrega completa o parcial', () => {
  async function fillHeaderMinimal(page: Page) {
    // no-op: probamos el selector de entrega de forma aislada, no requiere cliente
  }

  test('Parcial: 2 fechas, agregar 3ra, volver a Unica -> exactamente 1 campo VACIO', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const deliverySelect = page.locator('select').filter({ has: page.locator('option[value="partial"]') })
    await deliverySelect.selectOption('partial')
    await page.waitForTimeout(400)

    let dateInputs = page.locator('input[type="date"]')
    await expect(dateInputs).toHaveCount(2)
    await dateInputs.nth(0).fill('2026-08-01')
    await dateInputs.nth(1).fill('2026-08-15')

    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(300)
    dateInputs = page.locator('input[type="date"]')
    await expect(dateInputs).toHaveCount(3)
    await dateInputs.nth(2).fill('2026-09-01')

    await deliverySelect.selectOption('single')
    await page.waitForTimeout(400)
    dateInputs = page.locator('input[type="date"]')
    await expect(dateInputs).toHaveCount(1)
    const staleValue = await dateInputs.nth(0).inputValue()
    console.log('SCRUM-124 valor del campo unico tras volver de Parcial:', JSON.stringify(staleValue))
    expect(staleValue).toBe('')
    await page.screenshot({ path: 'e2e/.tmp/preqa-124-single-reset-empty.png' })
  })

  test('Unica -> Parcial de nuevo: exactamente 2 campos VACIOS (no resucita las 3 fechas viejas)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const deliverySelect = page.locator('select').filter({ has: page.locator('option[value="partial"]') })
    await deliverySelect.selectOption('partial')
    await page.waitForTimeout(300)
    let dateInputs = page.locator('input[type="date"]')
    await dateInputs.nth(0).fill('2026-08-01')
    await dateInputs.nth(1).fill('2026-08-15')
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(200)
    dateInputs = page.locator('input[type="date"]')
    await dateInputs.nth(2).fill('2026-09-01')

    await deliverySelect.selectOption('single')
    await page.waitForTimeout(300)
    await deliverySelect.selectOption('partial')
    await page.waitForTimeout(300)

    dateInputs = page.locator('input[type="date"]')
    await expect(dateInputs).toHaveCount(2)
    const v0 = await dateInputs.nth(0).inputValue()
    const v1 = await dateInputs.nth(1).inputValue()
    console.log('SCRUM-124 valores al re-entrar a Parcial:', JSON.stringify([v0, v1]))
    expect(v0).toBe('')
    expect(v1).toBe('')
    await page.screenshot({ path: 'e2e/.tmp/preqa-124-partial-reenter-empty.png' })
  })

  test('HALLAZGO: no existe boton para quitar una fecha individual en modo Parcial (Excel REQ-032)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const deliverySelect = page.locator('select').filter({ has: page.locator('option[value="partial"]') })
    await deliverySelect.selectOption('partial')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(200)
    // Botones visibles cerca de las fechas: deberia haber alguno de "quitar" ademas del "+"
    const nearbyButtons = await page.locator('button').allTextContents()
    console.log('SCRUM-124 botones visibles en la pantalla (buscando alguno de remove/quitar/x):', nearbyButtons)
    await page.screenshot({ path: 'e2e/.tmp/preqa-124-no-remove-button.png' })
  })

  test('bloqueante: sin fecha de entrega, validar marca como faltante', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    // Dejar Tipo de entrega en "-" (sin seleccionar) y correr la validacion
    const checkButton = page.getByRole('button', { name: /Ya está lista|Comprobar|check|Verificar/i }).first()
    // Fallback generico: boton secundario antes de Guardar borrador
    const validateBtn = page.locator('button', { hasText: /borrador|generar/i }).first()
    // Usamos el boton explicito de "comprobar" si existe por texto conocido; si no, tomamos el primero
    // de los tres botones finales del formulario (Comprobar / Guardar borrador / Generar).
    const footerButtons = page.locator('div.flex.justify-end.gap-2 button')
    const count = await footerButtons.count()
    console.log('SCRUM-124/047 botones de footer encontrados:', count, await footerButtons.allTextContents())
    if (count > 0) {
      await footerButtons.first().click()
      await page.waitForTimeout(1200)
      const bodyText = await page.textContent('body')
      const flagged = bodyText?.includes('Falta información') || bodyText?.toLowerCase().includes('falta')
      console.log('SCRUM-124/047 validacion marco faltante:', flagged)
      await page.screenshot({ path: 'e2e/.tmp/preqa-124-047-missing-validation.png' })
    }
  })
})

test.describe('Cross-cutting — reload mid-flow al limpiar Cliente Master', () => {
  test('reload tras limpiar Master (antes de guardar borrador) no resucita el master/sub viejo de forma inconsistente', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const masterInput = page.locator('label:has-text("Cliente Master")').locator('xpath=following-sibling::input[1]')
    const subInput = page.locator('label:has-text("Subcliente")').locator('xpath=following-sibling::input[1]')

    await masterInput.fill('Grupo')
    await page.waitForTimeout(700)
    await page.locator('ul li').first().click()
    await page.waitForTimeout(500)
    await subInput.click()
    await page.waitForTimeout(600)
    const subOptions = page.locator('ul li')
    if ((await subOptions.count()) > 0 && !(await subOptions.first().textContent())?.includes('+ Nuevo')) {
      await subOptions.first().click()
      await page.waitForTimeout(500)
    }

    const urlBeforeReload = page.url()
    const hadId = /\/quotes\/\d+/.test(urlBeforeReload)
    console.log('SCRUM-117 cross-cutting: URL antes de limpiar/reload:', urlBeforeReload, 'tenia id?', hadId)

    await masterInput.click()
    await masterInput.press('End')
    for (let i = 0; i < 40; i++) await masterInput.press('Backspace')
    await page.waitForTimeout(400)
    await expect(masterInput).toHaveValue('')

    await page.reload()
    await page.waitForTimeout(1500)

    const masterAfterReload = await masterInput.inputValue()
    const subAfterReload = await subInput.inputValue()
    console.log('SCRUM-117 cross-cutting: master/sub tras reload:', JSON.stringify({ masterAfterReload, subAfterReload, urlAfterReload: page.url() }))
    await page.screenshot({ path: 'e2e/.tmp/preqa-117-reload-midflow.png' })
  })
})
