import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA RE-CHECK — SCRUM-124 (REQ-032 Entrega completa o parcial), commit 5508faa.
 *
 * Runs the FULL checklist against dev.atlanticerp.ai after the remove-date fix (per the hard
 * Pre-QA rule: re-run the whole checklist, not just the point that failed, to catch any
 * regression the fix might have introduced). Complements (does not replace) the earlier
 * batch spec e2e/preqa-scrum116-117-124-20260729.spec.ts.
 *
 * Serial on purpose: CrowdSec/ModSecurity flags concurrent logins from the same IP as
 * false-positive DoS (see CLAUDE.md, Epic 11).
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
  const esToggle = page.getByRole('button', { name: 'ES', exact: true })
  if (await esToggle.isVisible().catch(() => false)) {
    await esToggle.click()
    await page.waitForTimeout(500)
  }
}

function deliverySelect(page: Page) {
  return page.locator('select').filter({ has: page.locator('option[value="partial"]') })
}
function dateInputs(page: Page) {
  return page.locator('input[type="date"]')
}
function removeButtons(page: Page) {
  return page.getByRole('button', { name: 'Eliminar' })
}

test.describe('SCRUM-124 RE-CHECK — checklist completo tras fix de remove-date (commit 5508faa)', () => {
  test('1. Parcial muestra exactamente 2 campos de fecha VACIOS + boton +', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    await deliverySelect(page).selectOption('partial')
    await page.waitForTimeout(400)
    const dates = dateInputs(page)
    await expect(dates).toHaveCount(2)
    expect(await dates.nth(0).inputValue()).toBe('')
    expect(await dates.nth(1).inputValue()).toBe('')
    await expect(page.getByRole('button', { name: '+', exact: true })).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-1-partial-2-empty.png' })
  })

  test('2. Click en + agrega una 3ra fecha', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    await deliverySelect(page).selectOption('partial')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(300)
    await expect(dateInputs(page)).toHaveCount(3)
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(300)
    await expect(dateInputs(page)).toHaveCount(4)
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-2-add-dates.png' })
  })

  test('3. NUEVO — con 3+ fechas aparecen botones Eliminar; quitar una deja el conteo y valores correctos', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    await deliverySelect(page).selectOption('partial')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+', exact: true }).click() // -> 3
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '+', exact: true }).click() // -> 4
    await page.waitForTimeout(200)

    let dates = dateInputs(page)
    await expect(dates).toHaveCount(4)
    await dates.nth(0).fill('2026-08-01')
    await dates.nth(1).fill('2026-08-15')
    await dates.nth(2).fill('2026-09-01')
    await dates.nth(3).fill('2026-09-15')

    // NOTA: la condicion del boton en QuotePage.tsx es `deliveryDates.length > 2` evaluada
    // por fecha (no por indice) — es decir, con 4 fechas TODAS muestran boton Eliminar, no
    // solo las agregadas mas alla de la 2da. Esto sigue cumpliendo el criterio real (poder
    // quitar una fecha individual, nunca bajar de 2) de forma mas permisiva que lo que el
    // checklist original asumia (solo la 3ra+) — no es un hallazgo, es diseño valido.
    let removes = removeButtons(page)
    const removeCountAt4 = await removes.count()
    console.log('SCRUM-124 recheck: botones Eliminar visibles con 4 fechas:', removeCountAt4)
    expect(removeCountAt4).toBe(4)

    // Quito especificamente la fecha en indice 1 (una de las "originales") y verifico que
    // ES esa la que desaparece, no otra, y que el resto conserva su valor y orden.
    const valueAtIndex1 = await dates.nth(1).inputValue()
    await removes.nth(1).click()
    await page.waitForTimeout(300)

    dates = dateInputs(page)
    await expect(dates).toHaveCount(3)
    const remainingInputValues = [
      await dates.nth(0).inputValue(),
      await dates.nth(1).inputValue(),
      await dates.nth(2).inputValue(),
    ]
    console.log('SCRUM-124 recheck: valor borrado esperado:', valueAtIndex1, '| valores restantes:', remainingInputValues)
    expect(remainingInputValues).not.toContain(valueAtIndex1)
    expect(remainingInputValues).toEqual(['2026-08-01', '2026-09-01', '2026-09-15'])
    // Con 3 fechas restantes, siguen mostrandose los 3 botones Eliminar.
    removes = removeButtons(page)
    expect(await removes.count()).toBe(3)
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-3-remove-one.png' })
  })

  test('4. NUEVO — con exactamente 2 fechas NO aparece boton Eliminar; imposible bajar de 2 (incl. doble click de carrera)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    await deliverySelect(page).selectOption('partial')
    await page.waitForTimeout(300)

    // Caso A: exactamente 2 fechas -> cero botones Eliminar visibles.
    let removes = removeButtons(page)
    await expect(dateInputs(page)).toHaveCount(2)
    expect(await removes.count()).toBe(0)

    // Caso B: subir a 3, quitar una hasta volver a 2 -> los botones deben desaparecer
    // por completo (guard length>2 vuelve a false), confirmando que no se puede seguir
    // quitando por debajo del minimo por el camino normal.
    await page.getByRole('button', { name: '+', exact: true }).click() // -> 3
    await page.waitForTimeout(200)
    let dates = dateInputs(page)
    await dates.nth(0).fill('2026-08-01')
    await dates.nth(1).fill('2026-08-15')
    await dates.nth(2).fill('2026-09-01')

    removes = removeButtons(page)
    await expect(removes).toHaveCount(3)
    await removes.first().click()
    await page.waitForTimeout(300)
    dates = dateInputs(page)
    await expect(dates).toHaveCount(2)
    removes = removeButtons(page)
    expect(await removes.count()).toBe(0)

    // Caso C: condicion de carrera — subir a 3 de nuevo y doble-click rapido sobre el
    // MISMO boton de Eliminar (closures de indice podrian filtrar dos veces sobre el
    // array ya mutado y tirar por debajo del minimo de 2).
    await page.getByRole('button', { name: '+', exact: true }).click() // -> 3
    await page.waitForTimeout(200)
    dates = dateInputs(page)
    await dates.nth(2).fill('2026-09-01')
    removes = removeButtons(page)
    await expect(removes).toHaveCount(3)
    const btn = removes.first()
    await btn.dblclick({ timeout: 2000 }).catch(async () => {
      await btn.click().catch(() => {})
    })
    await page.waitForTimeout(400)

    dates = dateInputs(page)
    const finalCount = await dates.count()
    console.log('SCRUM-124 recheck: conteo de fechas tras doble-click rapido en Eliminar (partia de 3):', finalCount)
    expect(finalCount).toBeGreaterThanOrEqual(2)
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-4-min-2-dblclick.png' })
  })

  test('5. Parcial (3+) -> Unica resetea a exactamente 1 campo VACIO (regresion del fix original)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const sel = deliverySelect(page)
    await sel.selectOption('partial')
    await page.waitForTimeout(300)
    let dates = dateInputs(page)
    await dates.nth(0).fill('2026-08-01')
    await dates.nth(1).fill('2026-08-15')
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(200)
    dates = dateInputs(page)
    await dates.nth(2).fill('2026-09-01')

    await sel.selectOption('single')
    await page.waitForTimeout(400)
    dates = dateInputs(page)
    await expect(dates).toHaveCount(1)
    expect(await dates.nth(0).inputValue()).toBe('')
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-5-single-reset.png' })
  })

  test('6. Unica -> Parcial de nuevo: exactamente 2 campos VACIOS (regresion del fix original)', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    const sel = deliverySelect(page)
    await sel.selectOption('partial')
    await page.waitForTimeout(300)
    let dates = dateInputs(page)
    await dates.nth(0).fill('2026-08-01')
    await dates.nth(1).fill('2026-08-15')
    await page.getByRole('button', { name: '+', exact: true }).click()
    await page.waitForTimeout(200)
    dates = dateInputs(page)
    await dates.nth(2).fill('2026-09-01')

    await sel.selectOption('single')
    await page.waitForTimeout(300)
    await sel.selectOption('partial')
    await page.waitForTimeout(300)

    dates = dateInputs(page)
    await expect(dates).toHaveCount(2)
    expect(await dates.nth(0).inputValue()).toBe('')
    expect(await dates.nth(1).inputValue()).toBe('')
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-6-partial-reenter.png' })
  })

  test('7. Tipo de entrega sin seleccionar + Verificar cotizacion -> marca como faltante', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    // No tocar el select de Tipo de entrega en absoluto.
    const checkBtn = page.getByRole('button', { name: 'Verificar cotización', exact: true })
    await expect(checkBtn).toBeVisible({ timeout: 5000 })
    await checkBtn.click()
    await page.waitForTimeout(1200)
    const bodyText = await page.textContent('body')
    const flagged = bodyText?.includes('Falta información')
    console.log('SCRUM-124 recheck item 7 — marco faltante sin tipo de entrega:', flagged)
    expect(flagged).toBeTruthy()
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-7-missing-no-type.png' })
  })

  test('8. Parcial con fecha(s) vacias + Verificar cotizacion -> marca como faltante', async ({ page }) => {
    await login(page)
    await openBlankQuote(page)
    await deliverySelect(page).selectOption('partial')
    await page.waitForTimeout(300)
    // Dejar ambas fechas vacias a proposito.
    const checkBtn = page.getByRole('button', { name: 'Verificar cotización', exact: true })
    await checkBtn.click()
    await page.waitForTimeout(1200)
    let bodyText = await page.textContent('body')
    let flagged = bodyText?.includes('Falta información')
    console.log('SCRUM-124 recheck item 8a — ambas fechas vacias, marco faltante:', flagged)
    expect(flagged).toBeTruthy()

    // Variante: 1 de 2 llena, la otra vacia.
    const dates = dateInputs(page)
    await dates.nth(0).fill('2026-08-01')
    await checkBtn.click()
    await page.waitForTimeout(1200)
    bodyText = await page.textContent('body')
    flagged = bodyText?.includes('Falta información')
    console.log('SCRUM-124 recheck item 8b — 1 de 2 fechas llena, marco faltante:', flagged)
    expect(flagged).toBeTruthy()
    await page.screenshot({ path: 'e2e/.tmp/recheck-124-8-missing-partial-empty-dates.png' })
  })
})
