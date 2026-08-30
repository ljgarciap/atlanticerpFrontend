import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA (+ Visual Review for SCRUM-720, no mockup attached — reviewed against
 * the ticket's textual acceptance criteria instead) — SCRUM-122 + SCRUM-720,
 * commit d0d1d81 (frontend) / 9e285b0 (backend), branch
 * fix/scrum-122-720-dev-testing, NOT yet pushed. Runs against a dedicated local
 * stack spun up for this session: backend on :8091 (Docker Compose project
 * scrum122720), frontend on :5173 (Vite dev, proxy already wired to :8091) — NOT
 * the main infra-* stack.
 *
 * SCRUM-122 (Daniela Amaya): Architect directory was global — any architect
 * showed up regardless of the quote's Master Client/Sub-client. Now mirrors the
 * Sales Project pattern exactly: architects.sub_client_id (nullable FK, legacy
 * NULL rows stay invisible by design), GET .../architects requires sub_client_id
 * (422 without it) and filters strictly by it, POST requires it in the body too.
 * Frontend: Architect field disabled until a Sub-client is chosen, same as
 * Project; selecting/creating an architect sends the current sub_client_id
 * automatically.
 *
 * SCRUM-720 (Daniela Amaya): Reports panel 2-column grid left gaps when card
 * heights differed — switched to a single full-width column, visual-only (no
 * data/logic/filter/calc change).
 *
 * Real account (neil.quiel@atlantic.com.pa / same as email password, per
 * CoreUserSeeder default) — *@atlantic.test demo accounts are gone from the
 * roster (project rule, 2026-07-30). Serial — same CrowdSec/ModSecurity false
 * timeout rationale as other Pre-QA specs in this repo, even though this run
 * targets local (:5173), not dev.atlanticerp.ai.
 *
 * DB fixtures used (confirmed present via direct psql before writing this spec):
 *   MasterClient 1 "[DEMO] Grupo Constructor Delta" -> SubClient 1 "[DEMO] Delta Residencial S.A."  (Sub A)
 *   MasterClient 2 "[DEMO] Inversiones Costa Bella" -> SubClient 2 "[DEMO] Costa Bella Torres S.A." (Sub B)
 *   architects table empty at session start — every architect created below is fresh.
 */
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:5173'
const EMAIL = 'neil.quiel@atlantic.com.pa'
const PASS  = 'neil.quiel@atlantic.com.pa'

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

// See prior SCRUM-122 recheck spec (e2e/preqa-scrum122-architect-phone-email-recheck-20260801.spec.ts)
// for why /ventas-diseno/quotes (no :id segment) is the correct "new draft" URL.
async function newQuote(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await expect(page.getByRole('heading', { name: 'Cotización' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
}

function fieldInput(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::input[1]')
}

function architectInput(page: Page) {
  return fieldInput(page, 'Arquitecto')
}

function architectPickerRoot(page: Page) {
  return architectInput(page).locator('xpath=ancestor::div[contains(@class,"relative")][1]')
}

async function selectMasterAndSub(page: Page, masterName: string, subName: string) {
  const masterInput = fieldInput(page, 'Cliente Master')
  await masterInput.click()
  await masterInput.fill(masterName)
  await page.getByText(masterName, { exact: true }).click()

  const subInput = fieldInput(page, 'Subcliente')
  await subInput.click()
  await subInput.fill(subName)
  await page.getByText(subName, { exact: true }).click()
  await page.waitForTimeout(500) // linkNewClientMutation persists master/sub immediately
}

async function createArchitectInline(page: Page, name: string, phone: string, email: string) {
  const input = architectInput(page)
  await input.click()
  await input.fill(name)
  await page.getByText(`+ Crear "${name}"`).click()
  const root = architectPickerRoot(page)
  const phoneInput = root.getByPlaceholder('Teléfono')
  const emailInput = root.getByPlaceholder('Email')
  if (phone) await phoneInput.fill(phone)
  if (email) await emailInput.fill(email)
  await root.getByRole('button', { name: 'Confirmar' }).click()
  await expect(phoneInput).toHaveCount(0, { timeout: 5000 })
}

test('0. Login with real account works', async ({ page }) => {
  await login(page)
  await expect(page).not.toHaveURL(/\/login/)
})

// ===================== SCRUM-122 Case 1 =====================
test('1. Architect field disabled when no Sub-client chosen yet', async ({ page }) => {
  await login(page)
  await newQuote(page)
  await expect(architectInput(page)).toBeDisabled()
})

// ===================== SCRUM-122 Case 2 =====================
test('2. Architect field enables once Master Client + Sub-client are chosen', async ({ page }) => {
  await login(page)
  await newQuote(page)
  await expect(architectInput(page)).toBeDisabled()
  await selectMasterAndSub(page, '[DEMO] Grupo Constructor Delta', '[DEMO] Delta Residencial S.A.')
  await expect(architectInput(page)).toBeEnabled({ timeout: 10000 })
})

// ===================== SCRUM-122 Case 3 + 4 (the critical one) =====================
test('3-4. Architect created under Sub-client A is scoped: visible under A, absent under B', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const name = `PreQA Arq Scope ${uniq}`

  // Case 3: create under Sub-client A
  await newQuote(page)
  await selectMasterAndSub(page, '[DEMO] Grupo Constructor Delta', '[DEMO] Delta Residencial S.A.')
  await createArchitectInline(page, name, '6000-1234', `scope.${uniq}@example.com`)
  await expect(page.locator('label:text-is("Arquitecto")').locator('xpath=following-sibling::input[1]')).toHaveValue(name)

  // Reopen the picker under Sub-client A and confirm it's findable there
  const inputA = architectInput(page)
  await inputA.click()
  await inputA.fill('')
  await inputA.pressSequentially('PreQA Arq Scope', { delay: 40 })
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 })

  // Case 4 (CRITICAL): new quote under Sub-client B, search the same name — must NOT appear
  await newQuote(page)
  await selectMasterAndSub(page, '[DEMO] Inversiones Costa Bella', '[DEMO] Costa Bella Torres S.A.')
  const inputB = architectInput(page)
  await inputB.click()
  await inputB.fill('')
  await inputB.pressSequentially('PreQA Arq Scope', { delay: 40 })
  await page.waitForTimeout(600)
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  // Proves the search actually ran (not a silently failed request): with zero
  // matches for this exact typed query under Sub-client B, "+ Crear" for it must show.
  await expect(page.getByText('+ Crear "PreQA Arq Scope"')).toBeVisible({ timeout: 5000 })
})

// ===================== SCRUM-122 Case 5 — network-level check =====================
test('5. GET /architects requires sub_client_id (422 without it), scopes strictly with it', async ({ page }) => {
  await login(page)
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  expect(token).toBeTruthy()

  // Missing sub_client_id entirely
  const missing = await page.evaluate(async (token) => {
    const res = await fetch('/api/ventas-diseno/architects', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    return { status: res.status, body: await res.json() }
  }, token)
  expect(missing.status).toBe(422)

  // With sub_client_id=1 (Sub A) — should NOT include anything created under Sub B in case 4,
  // and must include the case-3 fixture created under Sub A
  const scopedA = await page.evaluate(async (token) => {
    const res = await fetch('/api/ventas-diseno/architects?sub_client_id=1', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    return { status: res.status, body: await res.json() }
  }, token)
  expect(scopedA.status).toBe(200)
  const namesA = (scopedA.body.data as Array<{ name: string; sub_client_id?: number }>).map(a => a.name)
  expect(namesA.some(n => n.startsWith('PreQA Arq Scope'))).toBe(true)

  const scopedB = await page.evaluate(async (token) => {
    const res = await fetch('/api/ventas-diseno/architects?sub_client_id=2', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    return { status: res.status, body: await res.json() }
  }, token)
  expect(scopedB.status).toBe(200)
  const namesB = (scopedB.body.data as Array<{ name: string }>).map(a => a.name)
  expect(namesB.some(n => n.startsWith('PreQA Arq Scope'))).toBe(false)
})

// ===================== SCRUM-122 Case 6 — existing quote hydration =====================
test('6. Reloading an existing quote with an assigned architect still hydrates name/phone/email', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const name = `PreQA Arq Hydrate ${uniq}`

  await newQuote(page)
  await selectMasterAndSub(page, '[DEMO] Grupo Constructor Delta', '[DEMO] Delta Residencial S.A.')
  await createArchitectInline(page, name, '6000-9999', `hydrate.${uniq}@example.com`)

  // architect_id only travels to the backend via buildHeaderPayload() on "Guardar
  // borrador" (setArchitect alone is local-only state) — Quote::validationErrorsForGenerating()
  // requires Proyecto + Descripción too (confirmed by the SCRUM-122 recheck spec from
  // 2026-08-01), so fill those before saving.
  const projectInput = fieldInput(page, 'Proyecto')
  await projectInput.click()
  await projectInput.fill('[DEMO] Torre Delta Fase 1')
  await page.getByText('[DEMO] Torre Delta Fase 1', { exact: true }).click()

  await page.locator('label:text-is("Descripción")').locator('xpath=following-sibling::input[1]')
    .fill(`PreQA SCRUM-122 hydration recheck ${uniq}`)

  await page.locator('select').first().selectOption('single')
  await page.locator('input[type="date"]').first().fill('2026-09-01')

  // Wait on the actual network round-trip rather than the transient success
  // banner (draftJustSaved), which can flash and clear before a fixed-timeout
  // text assertion reliably catches it.
  const saveResponse = page.waitForResponse(
    resp => resp.url().includes('/save-draft') && resp.request().method() === 'POST',
    { timeout: 10000 },
  )
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  const resp = await saveResponse
  expect(resp.status(), `save-draft response body: ${await resp.text().catch(() => '<unreadable>')}`).toBe(200)

  const url = page.url()
  await page.reload()
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
  await expect(architectInput(page)).toHaveValue(name, { timeout: 10000 })
  await expect(page.locator('text=6000-9999')).toBeVisible()
  expect(page.url()).toBe(url)
})

// ===================== SCRUM-720 =====================
test('7. Reports panel: single full-width column, no 2-col gaps, filters still work', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })

  // Locate the Metas card by its heading text (robust to structural refactors).
  const metasTitle = page.getByText('Metas', { exact: true })
  await expect(metasTitle).toBeVisible()
  const metasBox = await metasTitle.locator('xpath=ancestor::*[contains(@class,"p-4")][1]').boundingBox()
  expect(metasBox).not.toBeNull()
  // Full-width: card's width should be close to the viewport's content width (allow for
  // sidebar/padding — assert it's clearly NOT half-width, i.e. > 700px in a 1280px viewport).
  expect(metasBox!.width).toBeGreaterThan(700)

  // No horizontal overflow / cut-off elements
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
  expect(hasHorizontalOverflow).toBe(false)

  // Period filter still works: switch to "Trimestre" and confirm the request refires /
  // content updates (no stale spinner, no crash)
  const quarterButton = page.getByRole('button', { name: 'Trimestre' })
  await quarterButton.click()
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
  await expect(quarterButton).toBeVisible()

  const yearButton = page.getByRole('button', { name: 'Año' })
  await yearButton.click()
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
  await expect(yearButton).toBeVisible()
})
