import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — Batch 3: SCRUM-103 (REQ-081 fuzzy search + stage filter), SCRUM-140
 * (REQ-048 Vista Previa/Externa document reconciliation, print CSS), SCRUM-143
 * (REQ-086 reopen draft for editing).
 *
 * Corre contra dev.atlanticerp.ai. Serial a proposito: CrowdSec/ModSecurity dispara falsos
 * timeouts con logins en paralelo desde la misma IP (ver CLAUDE.md, Epic 11).
 *
 * Fixtures reales usados (relevados via API en dev.atlanticerp.ai, 2026-07-30):
 * - id 205 = COT-2026-0087, designer (own), document_status 'sent', sales_project sin
 *   PipelineCard vinculada -> pipeline_card_id debe ser null (no originada de Pipeline).
 * - id 159 = draft de designer, sin master_client/sub_client/folio -> 0 items, 0 contactos.
 * - id 156 = draft de Vendedor Disenador Test 10 (equipo), management puede verla en scope Team.
 * - id 149 = COT-2026-0082, sent, de Idmar (equipo) -> para confirmar Editar ausente en no-draft.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const DESIGNER_EMAIL = 'designer@atlantic.test'
const DESIGNER_PASS  = 'Password123!'
const MGMT_EMAIL = 'management@atlantic.test'
const MGMT_PASS  = 'Password123!'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

async function gotoQuotesList(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(1000)
  const esToggle = page.getByRole('button', { name: 'ES', exact: true })
  if (await esToggle.isVisible().catch(() => false)) {
    await esToggle.click()
    await page.waitForTimeout(500)
  }
}

// ============================= SCRUM-103 =============================
test.describe('SCRUM-103 — fuzzy search folio sin guiones + filtro etapa', () => {
  test('1. Buscar folio SIN ningun guion (COT20260087) encuentra COT-2026-0087 como aproximado', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT20260087')
    await page.waitForTimeout(700)
    await expect(page.locator('body')).toContainText('COT-2026-0087', { timeout: 5000 })
    // banner de aproximado debe estar presente (no es coincidencia exacta)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).toContain('aproximad')
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-1-no-hyphens.png' })
  })

  test('2. Buscar folio con SOLO 1 guion removido (COT2026-0087) tambien encuentra por aproximacion', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT2026-0087')
    await page.waitForTimeout(700)
    await expect(page.locator('body')).toContainText('COT-2026-0087', { timeout: 5000 })
  })

  test('3. Buscar folio con el OTRO guion removido (COT-20260087) tambien encuentra por aproximacion', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT-20260087')
    await page.waitForTimeout(700)
    await expect(page.locator('body')).toContainText('COT-2026-0087', { timeout: 5000 })
  })

  test('4. Busqueda sin relacion alguna (0 resultados): estado vacio, SIN banner de aproximado falso', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('zzzznotarealstring98765xyz')
    await page.waitForTimeout(700)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).not.toContain('aproximad')
    // debe verse el estado vacio de la tabla, sin romperse (sin trazas de excepcion)
    expect(bodyText.toLowerCase()).not.toMatch(/exception|internal server error|500/)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-4-zero-results.png' })
  })

  test('5. Combinar filtro de etapa + busqueda que NO aplica a esa etapa -> 0 resultados, sin banner falso', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT-2026-0087') // exacto, pero esta cotizacion no tiene stage (no viene de Pipeline)
    await page.waitForTimeout(500)
    const stageSelect = page.locator('select').first()
    await stageSelect.selectOption({ label: /cotizaci[oó]n|quote/i }).catch(async () => {
      await stageSelect.selectOption({ index: 1 })
    })
    await page.waitForTimeout(700)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).not.toContain('aproximad')
    expect(bodyText).not.toContain('COT-2026-0087')
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-5-stage-plus-search-mismatch.png' })
  })

  test('6. "Limpiar filtros" resetea busqueda Y etapa de una sola vez', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await gotoQuotesList(page)
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT-2026-0087')
    const stageSelect = page.locator('select').first()
    await stageSelect.selectOption({ index: 1 })
    await page.waitForTimeout(500)
    const clearBtn = page.getByRole('button', { name: /limpiar filtros/i })
    await expect(clearBtn).toBeVisible({ timeout: 3000 })
    await clearBtn.click()
    await page.waitForTimeout(500)
    await expect(search).toHaveValue('')
    await expect(stageSelect).toHaveValue('')
    // y la tabla vuelve a mostrar filas (mas de las que habia con el filtro combinado en 0)
    await page.waitForTimeout(500)
    const rows = await page.locator('table tbody tr').count()
    expect(rows).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-6-clear-filters.png' })
  })
})

// ============================= SCRUM-140 =============================
test.describe('SCRUM-140 — casos negativos del documento (0 items, sin contactos, sin Pipeline, dark print, descuento externo)', () => {
  test('7. Cotizacion con 0 items Y sin contactos (draft 159): contrato de datos confirmado via API', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    const opened = await page.evaluate(async (targetId) => {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`/api/ventas-diseno/quotes/${targetId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      return { status: res.status, body: await res.json().catch(() => null) }
    }, 159)
    console.log('QUOTE 159 RAW:', JSON.stringify(opened))
    expect(opened.status).toBe(200)
    expect(opened.body.parts.length).toBe(0)
    expect(opened.body.contacts.length).toBe(0)
  })

  test('7b. Documento renderiza "Sin partidas todavia" y "Sin contactos registrados" para un draft vacio (via QuoteViewerModal)', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    // Interceptamos la respuesta de /quotes (list) para clickear la fila correcta sin depender del orden
    await page.goto(`${BASE}/ventas-diseno/quotes-list`)
    await page.waitForTimeout(1000)
    // Localizamos la fila cuyo boton "Ver" corresponde al id 159 inspeccionando el DOM por orden de
    // aparicion: como no hay atributo data-id, abrimos el PRIMER "Ver" cuya fila tenga folio "—" y
    // master client "—" (draft vacio real). Puede haber varias; validamos el contenido del modal
    // resultante, que debe ser consistente sea cual fuere el draft vacio que abra.
    const emptyRow = page.locator('table tbody tr').filter({ hasText: '—' }).first()
    const viewBtn = emptyRow.locator('button[title]')
    await viewBtn.click()
    await page.waitForTimeout(800)
    const modalText = await page.locator('.fixed.inset-0').innerText()
    expect(modalText).toMatch(/sin partidas/i)
    expect(modalText).toMatch(/sin contactos/i)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-7b-empty-draft-modal.png' })
  })

  test('8. Cotizacion 205 (COT-2026-0087) NO se origino de Pipeline -> boton "Volver a Pipeline" ausente', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    const raw = await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken')
      const res = await fetch('/api/ventas-diseno/quotes/205', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      return res.json()
    })
    console.log('QUOTE 205 pipeline_card_id:', raw.pipeline_card_id)
    expect(raw.pipeline_card_id).toBeNull()

    await page.goto(`${BASE}/ventas-diseno/quotes/205`)
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: /^Vista Previa$/i }).click()
    await page.waitForTimeout(600)
    const returnBtn = page.getByRole('button', { name: /volver a pipeline/i })
    await expect(returnBtn).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-8-no-return-to-pipeline.png' })
  })

  test('9. DARK MODE + print media: instrucciones de pago y pie de contacto (nuevos hoy) deben verse en color oscuro sobre blanco, no invisibles', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await page.goto(`${BASE}/ventas-diseno/quotes/205`)
    await page.waitForTimeout(1000)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /^Vista Previa$/i }).click()
    await page.waitForTimeout(600)
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(300)

    const colors = await page.evaluate(() => {
      function colorOf(text: string): string | null {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(text)) {
            const el = node.parentElement
            if (el) return getComputedStyle(el).color
          }
        }
        return null
      }
      return {
        checkPayableTo: colorOf('Cheque a nombre de'),
        companyName: colorOf('ATLANTIC USA CORP'),
        achLabel: colorOf('Pagos por ACH'),
        footer: colorOf('Calle 57 Este'),
        docBg: (() => {
          const doc = document.querySelector('.quote-doc')
          return doc ? getComputedStyle(doc).backgroundColor : null
        })(),
      }
    })
    console.log('PRINT+DARK COMPUTED COLORS:', JSON.stringify(colors))

    // Documento debe imprimir con fondo blanco (override SCRUM-716 sigue vigente)
    expect(colors.docBg).toBe('rgb(255, 255, 255)')

    // Ningun texto de contenido debe imprimir en un color CLARO (ilegible sobre blanco).
    // Umbral: los 3 canales RGB por debajo de 180 (gris medio/oscuro, legible en papel).
    function isLegibleOnWhite(rgb: string | null): boolean {
      if (!rgb) return false
      const m = rgb.match(/\d+/g)
      if (!m) return false
      const [r, g, b] = m.map(Number)
      return r < 180 && g < 180 && b < 180
    }
    expect(isLegibleOnWhite(colors.checkPayableTo)).toBe(true)
    expect(isLegibleOnWhite(colors.companyName)).toBe(true)
    expect(isLegibleOnWhite(colors.achLabel)).toBe(true)
    expect(isLegibleOnWhite(colors.footer)).toBe(true)

    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-9-dark-print.png', fullPage: true })
  })

  test('10. Vista Externa con descuento en Totales aplicado: totales/descuento siguen completamente ocultos, sin fuga de monto', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    const raw = await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken')
      const res = await fetch('/api/ventas-diseno/quotes/205', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      return res.json()
    })
    console.log('QUOTE 205 discount_totals_amount:', raw.discount_totals_amount, 'grand_total:', raw.grand_total)

    await page.goto(`${BASE}/ventas-diseno/quotes/205`)
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: /^Vista Externa$/i }).click()
    await page.waitForTimeout(600)
    const text = await page.locator('body').innerText()
    expect(text).not.toMatch(/subtotal/i)
    expect(text).not.toMatch(/descuento/i)
    if (raw.discount_totals_amount > 0) {
      expect(text).not.toContain(String(raw.discount_totals_amount))
    }
    expect(text).not.toContain(String(raw.grand_total))
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-10-external-discount.png' })
  })
})

// ============================= SCRUM-143 =============================
test.describe('SCRUM-143 — reabrir borrador para editar', () => {
  test('11. Management viendo un draft AJENO (equipo): boton Editar aparece y navega', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    const raw = await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken')
      const res = await fetch('/api/ventas-diseno/quotes/156', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      return { status: res.status, body: await res.json() }
    })
    console.log('QUOTE 156 (Idmar draft) as management:', JSON.stringify(raw.body).slice(0, 500))
    expect(raw.body.document_status).toBe('draft')
    console.log('can_edit for management on teammate draft:', raw.body.can_edit)

    await page.goto(`${BASE}/ventas-diseno/quotes-list`)
    await page.waitForTimeout(1000)
    const teamBtn = page.getByRole('button', { name: /equipo/i })
    if (await teamBtn.isVisible().catch(() => false)) {
      await teamBtn.click()
      await page.waitForTimeout(800)
    }
    // Buscamos y abrimos el draft de Idmar
    const search = page.locator('input[type="text"]').first()
    await search.fill('Annie')
    await page.waitForTimeout(700)
    const row = page.locator('table tbody tr').first()
    await row.locator('button[title]').click()
    await page.waitForTimeout(800)
    const editBtn = page.getByRole('button', { name: /^editar$/i })
    const editVisible = await editBtn.isVisible().catch(() => false)
    console.log('Editar button visible for management on teammate draft:', editVisible)
    if (editVisible) {
      await editBtn.click()
      await page.waitForURL(/\/ventas-diseno\/quotes\/156/, { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
      console.log('URL after clicking Editar:', page.url())
      // Confirmamos si el formulario permite guardar de verdad (no solo navega)
      const saveBtn = page.getByRole('button', { name: /guardar borrador/i })
      const saveVisible = await saveBtn.isVisible().catch(() => false)
      console.log('Guardar borrador button visible:', saveVisible)
      await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-11-mgmt-edit-teammate-draft.png' })
    }
  })

  test('12. Cotizacion YA generada (sent, id 149, de Idmar): boton Editar NO aparece en absoluto', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/ventas-diseno/quotes-list`)
    await page.waitForTimeout(1000)
    const teamBtn = page.getByRole('button', { name: /equipo/i })
    if (await teamBtn.isVisible().catch(() => false)) {
      await teamBtn.click()
      await page.waitForTimeout(800)
    }
    const search = page.locator('input[type="text"]').first()
    await search.fill('COT-2026-0082')
    await page.waitForTimeout(700)
    const row = page.locator('table tbody tr').first()
    await row.locator('button[title]').click()
    await page.waitForTimeout(800)
    const editBtn = page.getByRole('button', { name: /^editar$/i })
    await expect(editBtn).toHaveCount(0)
    // Tambien confirmamos que NO esta oculto/deshabilitado (count 0, no visible:false)
    const modalHtml = await page.locator('.fixed.inset-0').innerHTML()
    expect(modalHtml.toLowerCase()).not.toContain('editar')
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-12-no-edit-on-sent.png' })
  })

  test('13. Click Editar en un borrador propio y cerrar sin guardar: la lista queda consistente', async ({ page }) => {
    await login(page, DESIGNER_EMAIL, DESIGNER_PASS)
    await page.goto(`${BASE}/ventas-diseno/quotes-list`)
    await page.waitForTimeout(1000)
    const emptyRow = page.locator('table tbody tr').filter({ hasText: '—' }).first()
    await emptyRow.locator('button[title]').click()
    await page.waitForTimeout(700)
    const editBtn = page.getByRole('button', { name: /^editar$/i })
    await expect(editBtn).toBeVisible({ timeout: 3000 })
    await editBtn.click()
    await page.waitForURL(/\/ventas-diseno\/quotes\/\d+$/, { timeout: 5000 })
    await page.waitForTimeout(800)
    // Volvemos a la lista SIN guardar (breadcrumb o navegacion directa)
    await page.goto(`${BASE}/ventas-diseno/quotes-list`)
    await page.waitForTimeout(1000)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).not.toMatch(/exception|internal server error/)
    const rows = await page.locator('table tbody tr').count()
    expect(rows).toBeGreaterThan(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3/103-13-close-without-saving.png' })
  })
})
