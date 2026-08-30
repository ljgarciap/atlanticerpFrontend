import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review — SCRUM-122 recheck (2026-08-01), commit 0b23d8e on `dev`
 * (NOT yet pushed to dev.atlanticerp.ai — this spec runs against local: npm run dev on
 * :5173 + local Docker backend).
 *
 * Bug: architect phone/email were discarded by the frontend (searchArchitects/
 * createArchitect/hydration all mapped down to {id, label}) so only the name ever
 * showed on the quote screen, even though QuoteController::show already returned
 * phone/email. Fix renders them as secondary text under the Arquitecto picker,
 * same visual pattern as the Contacts list (`text-slate-400`, "·" separator).
 *
 * Uses a REAL account (neil.quiel@atlantic.com.pa, password = email per
 * CoreUserSeeder default, unchanged) — *@atlantic.test demo accounts were
 * removed from the roster (project rule, 2026-07-30).
 *
 * Serial — same rationale as other Pre-QA specs in this repo (CrowdSec/ModSecurity
 * false timeouts on concurrent logins from the same IP), even though this run is
 * against local (:5173), not dev.atlanticerp.ai, to keep the pattern consistent.
 *
 * Cases 3 and 6 need one architect with NEITHER phone nor email -- StoreArchitectRequest
 * validates "at least one of the two" at creation (confirmed via curl: 422), so this
 * shape can only exist as legacy data, seeded directly at the DB layer, never through
 * the create flow. Seed it once, then pass its name via PREQA_LEGACY_ARCHITECT_NAME;
 * without the env var those two cases skip (not fail) rather than assume a fixture
 * that may not exist in the environment running this file:
 *
 *   docker compose -f infra/docker-compose.yml exec -T postgres psql -U atlanticerp -d atlanticerp -c \
 *     "INSERT INTO atlantic_ventas_diseno.architects (name, phone, email, created_at, updated_at) \
 *      VALUES ('PreQA Arq Vacio Legacy <ts>', NULL, NULL, now(), now());"
 *
 *   PREQA_LEGACY_ARCHITECT_NAME='PreQA Arq Vacio Legacy <ts>' npx playwright test \
 *     e2e/preqa-scrum122-architect-phone-email-recheck-20260801.spec.ts
 *
 * Case 5 reuses an existing master/sub/project fixture already in the local DB
 * ("Master PreQA 105 <ts>" / "Sub PreQA 105 <ts>", seeded by an earlier Pre-QA
 * session for SCRUM-105) to satisfy Quote::validationErrorsForGenerating()'s
 * required-fields gate on draft save without building a whole new client
 * hierarchy through CreateClientModal. If that fixture is ever cleaned up, case 5
 * needs its master/sub/project selector strings updated to a fixture that exists.
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

// SCRUM-122 route auto-creates a fresh draft quote when there's no :id segment at
// all (params.id undefined -> quoteId null -> createMutation fires). Navigating to
// .../quotes/new instead makes params.id="new" -> Number("new")=NaN -> quoteId is
// NOT null -> the get-quote query fires for a nonexistent id and the page hangs on
// "Cargando..." forever (found while writing this spec, not a real app bug — just
// the correct URL to hit for "start a new quote").
async function newQuote(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  await expect(page.getByRole('heading', { name: 'Cotización' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
}

function architectInput(page: Page) {
  // ClientPicker label is "Arquitecto" (uppercase via CSS, not markup) — the input
  // right below it has no name/id/placeholder, so scope by the label text sibling.
  return page.locator('label:text-is("Arquitecto")').locator('xpath=following-sibling::input[1]')
}

function architectPickerRoot(page: Page) {
  // ClientPicker's own root <div class="relative w-full"> — scope everything
  // belonging to the Arquitecto picker (mini-form fields, its own "Confirmar")
  // to this container, since the page has other ClientPicker instances (Cliente
  // Master/Subcliente) whose mini-forms share the same button text.
  return architectInput(page).locator('xpath=ancestor::div[contains(@class,"relative")][1]')
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
  // mini-form closes only on success
  await expect(phoneInput).toHaveCount(0, { timeout: 5000 })
}

// Selecting an EXISTING architect via search hit a real race condition in
// ClientPicker.tsx (pre-existing, not introduced by SCRUM-122 -- shared by every
// ClientPicker instance on this page: master/sub/project/architect): both
// onFocus and onChange call `search(q)` and whichever HTTP response lands last
// wins (no request token / AbortController to discard the stale one), so
// clicking then filling fast can leave the dropdown showing the unfiltered
// top-20-by-name list instead of the just-typed query's results. Real users
// typing character-by-character mostly dodge this because each keystroke's
// request tends to resolve before the next one fires, but it's a latent bug
// worth flagging separately from this ticket. Worked around here by waiting for
// the network response matching the exact typed query before clicking a result.
async function selectExistingArchitect(page: Page, name: string) {
  const input = architectInput(page)
  // toPass retries the whole block: even if one attempt loses the race (stale
  // onFocus response overwrites the filtered onChange one), a fresh attempt
  // usually lands correctly within a few tries. pressSequentially (not fill)
  // serializes one search request per keystroke with real inter-keystroke gaps,
  // the same thing that makes this race mostly invisible for actual human
  // typing -- each earlier request tends to settle before the next fires, so
  // only the last (most specific) query's response is normally still in flight
  // by the time typing finishes.
  await expect(async () => {
    await input.click()
    await input.fill('') // Control+A is NOT select-all in macOS text fields — fill() clears reliably cross-platform
    await input.pressSequentially(name, { delay: 40 })
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
  await page.getByText(name, { exact: true }).click()
}

function architectSecondaryText(page: Page) {
  // The <p class="text-xs text-slate-400"> rendered right after the ClientPicker div.
  return architectInput(page).locator('xpath=ancestor::div[1]/following-sibling::p[1]')
}

// Seed an architect directly against the backend, to reach states the UI mini-form
// can't produce on its own (e.g. neither phone nor email — the mini-form's Confirm
// stays disabled without at least one). Uses in-page fetch() (not
// page.request.post) so it goes through Vite's dev proxy (vite.config.ts: /api ->
// http://localhost:8090) the same way the real app's axios client does — a direct
// page.request.post to :5173 bypasses that proxy and 302s to the bare nginx vhost.
async function createArchitectViaApi(page: Page, name: string, phone?: string, email?: string) {
  const status = await page.evaluate(async ({ name, phone, email }) => {
    const token = localStorage.getItem('accessToken')
    const res = await fetch('/api/ventas-diseno/architects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, phone: phone || null, email: email || null }),
    })
    return res.status
  }, { name, phone, email })
  expect([200, 201]).toContain(status)
}

test('0. Login with real account works', async ({ page }) => {
  await login(page)
  await expect(page).not.toHaveURL(/\/login/)
})

// ============================= Case 1 + 2 + 3 =============================
test('1-3. Architect with only phone / only email / neither — no stray separator, no null/undefined text', async ({ page }) => {
  await login(page)

  // Case 1: only phone
  await newQuote(page)
  const uniq = Date.now()
  await createArchitectInline(page, `PreQA Arq Tel ${uniq}`, '6000-1111', '')
  await expect(architectSecondaryText(page)).toHaveText('6000-1111')
  let text = await architectSecondaryText(page).textContent()
  expect(text).not.toContain('·')
  expect(text).not.toMatch(/null|undefined/i)

  // Case 2: only email (fresh quote)
  await newQuote(page)
  await createArchitectInline(page, `PreQA Arq Mail ${uniq}`, '', `preqa.${uniq}@example.com`)
  await expect(architectSecondaryText(page)).toHaveText(`preqa.${uniq}@example.com`)
  text = await architectSecondaryText(page).textContent()
  expect(text).not.toContain('·')
  expect(text).not.toMatch(/null|undefined/i)

  // Case 3: neither — StoreArchitectRequest validates "at least one of phone/email"
  // at creation time (confirmed via curl: 422 "El campo teléfono es obligatorio
  // cuando correo electrónico no está presente" when posting name-only), and the
  // ClientPicker mini-form's Confirm button is correspondingly disabled without at
  // least one -- so "architect with neither" can only be *legacy* data (created
  // before this validation existed, or a hand-edited record), never producible
  // through the current create flow. Simulated by seeding directly at the DB layer
  // (bash, before this spec ran): `PreQA Arq Vacio Legacy <ts>` with phone=NULL,
  // email=NULL in atlantic_ventas_diseno.architects.
  const legacyName = process.env.PREQA_LEGACY_ARCHITECT_NAME
  test.skip(!legacyName, 'PREQA_LEGACY_ARCHITECT_NAME env var not set — see spec comment for how to seed it')
  await newQuote(page)
  await selectExistingArchitect(page, legacyName!)
  // No secondary <p> at all when neither phone nor email is set — nothing renders,
  // no dangling "·", no "null"/"undefined" text node.
  await expect(architectSecondaryText(page)).toHaveCount(0)
})

// ============================= Case 4 =============================
test('4. Selecting an EXISTING architect from search results also carries phone/email', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const name = `PreQA Arq Existente ${uniq}`

  // Seed one directly via API with both fields, then select it via the search
  // dropdown (not the inline create form) in a fresh quote.
  await createArchitectViaApi(page, name, '6000-2222', `existing.${uniq}@example.com`)

  await newQuote(page)
  await selectExistingArchitect(page, name)
  await expect(architectSecondaryText(page)).toHaveText(`6000-2222 · existing.${uniq}@example.com`)
})

// SCRUM-122 first pass at Case 5 tried "Guardar borrador" with ONLY the architect
// filled in and found nothing persisted after reload -- looked like a bug at
// first, but Quote::validationErrorsForGenerating() (called with requireItems:
// false for the draft save) requires Cliente Master, Subcliente, RUC, Proyecto,
// Descripción AND Arquitecto before persisting anything (422 QuoteValidationBlockedException
// otherwise) -- confirmed in QuoteController::saveDraft/QuoteService, not a
// SCRUM-122 regression. Reusing an existing master/sub/project fixture already in
// the local DB (seeded by an earlier Pre-QA session, SCRUM-105 recheck) instead of
// building a brand new client hierarchy through CreateClientModal just for this.
async function fillMinimumValidHeaderExceptArchitect(page: Page) {
  const masterInput = page.locator('label:text-is("Cliente Master")').locator('xpath=following-sibling::input[1]')
  await masterInput.click()
  await masterInput.fill('Master PreQA 105')
  await page.getByText('Master PreQA 105 1785596872414', { exact: true }).click()

  const subInput = page.locator('label:text-is("Subcliente")').locator('xpath=following-sibling::input[1]')
  await subInput.click()
  await subInput.fill('Sub PreQA 105')
  await page.getByText('Sub PreQA 105 1785596873579', { exact: true }).click()
  await page.waitForTimeout(500) // linkNewClientMutation persists master/sub immediately

  const projectInput = page.locator('label:text-is("Proyecto")').locator('xpath=following-sibling::input[1]')
  await projectInput.click()
  await projectInput.fill('Sub PreQA 105 1785596873579')
  // Scope to the dropdown <ul> right after this specific input, not getByText
  // globally -- the Subcliente input's already-filled value can otherwise collide
  // with the Proyecto dropdown option sharing the same fixture name.
  await projectInput.locator('xpath=following-sibling::ul[1]//li[contains(text(),"Sub PreQA 105 1785596873579")]').first().click()

  await page.locator('label:text-is("Descripción")').locator('xpath=following-sibling::input[1]').fill('PreQA SCRUM-122 draft-save recheck')

  await page.locator('select').first().selectOption('single')
  await page.locator('input[type="date"]').first().fill('2026-09-01')
}

test('5. Save draft, then full reload (F5) — phone/email persist via real backend hydration', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const name = `PreQA Arq Reload ${uniq}`

  await newQuote(page)
  await fillMinimumValidHeaderExceptArchitect(page)
  await createArchitectInline(page, name, '6000-3333', `reload.${uniq}@example.com`)
  await expect(architectSecondaryText(page)).toHaveText(`6000-3333 · reload.${uniq}@example.com`)

  const url = page.url()
  await page.getByRole('button', { name: /guardar borrador/i }).click()
  // REQ-086: success shows a green "Borrador guardado" banner; failure (422) shows
  // a red error box instead -- wait for the success banner specifically, not just
  // a fixed timeout, so a validation failure fails this test loudly instead of
  // silently reloading an unsaved draft.
  await expect(page.getByText(/borrador guardado/i)).toBeVisible({ timeout: 5000 })

  // Full reload, not client-side re-navigation — forces re-hydration from the
  // actual GET response, not React state left over in memory.
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Cotización' })).toBeVisible({ timeout: 10000 })
  await expect(architectSecondaryText(page)).toHaveText(`6000-3333 · reload.${uniq}@example.com`)
})

// ============================= Case 6 =============================
test('6. Switch architect A (with data) -> B (without data) without saving — no stale text from A', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const nameA = `PreQA Arq StaleA ${uniq}`
  // B reuses the same DB-seeded no-phone/no-email fixture as case 3 — the API
  // create endpoint requires at least phone or email, so it can't produce a
  // true "neither" architect on its own (see case 3's comment for detail).
  const nameB = process.env.PREQA_LEGACY_ARCHITECT_NAME
  test.skip(!nameB, 'PREQA_LEGACY_ARCHITECT_NAME env var not set — see case 3\'s comment for how to seed it')

  await createArchitectViaApi(page, nameA, '6000-4444', `stalea.${uniq}@example.com`)

  await newQuote(page)

  // Select A first
  await selectExistingArchitect(page, nameA)
  await expect(architectSecondaryText(page)).toHaveText(`6000-4444 · stalea.${uniq}@example.com`)

  // Now switch to B (no phone/email) WITHOUT saving
  await selectExistingArchitect(page, nameB!)

  // B has neither field -> the <p> must disappear entirely, not linger with A's data
  await expect(architectSecondaryText(page)).toHaveCount(0)
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain('stalea')
  expect(bodyText).not.toContain('6000-4444')
})

// ============================= Case 7 =============================
test('7. Long / unusual characters in phone+email do not break layout', async ({ page }) => {
  await login(page)
  const uniq = Date.now()
  const longEmail = `preqa.very.long.email.address.for.layout.stress.${uniq}@subdomain.atlantic-example.com.pa`
  const weirdPhone = '+507 (6000) 5555 ext.9999 / WhatsApp'

  await newQuote(page)
  await createArchitectInline(page, `PreQA Arq Largo ${uniq}`, weirdPhone, longEmail)
  await expect(architectSecondaryText(page)).toContainText(weirdPhone)
  await expect(architectSecondaryText(page)).toContainText(longEmail)

  // Not a hard layout-overflow assertion (no fixed-width container to check against
  // precisely), but confirm the paragraph doesn't force the page into horizontal
  // scroll -- a cheap, real signal of a broken layout.
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  expect(hasHorizontalOverflow).toBeFalsy()
})
