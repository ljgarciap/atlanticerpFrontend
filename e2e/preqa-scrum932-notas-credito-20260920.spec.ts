import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-932 "MEJORA UAT: Notas Crédito y Devoluciones", Admin&Cont. Corre contra el
 * stack local (infra/docker-compose.yml, nginx en localhost:8090 vía proxy de Vite) + frontend
 * Vite dev server (localhost:5173) — NO dev.atlanticerp.ai.
 *
 * Datos sembrados vía tinker directo sobre los modelos reales (Order/AdminContInvoice/
 * AdminContCreditNote/OrderDocument — no hay factory/seeder de admin_contab para este escenario,
 * ver docblock del script en el reporte de Pre-QA), prefijo "PreQA932"/"932" en todo lo sembrado.
 * Master Client 46, 4 facturas (Norte pagada, Sur pendiente, Familia con guía en OTRO pedido de la
 * familia, Suelta sin proyecto/cotización/guía), 3 notas de crédito reales.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const FELIX = 'contabilidad@test.com'
const FELIX_PW = 'contabilidad@test.com'

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function gotoNotasCredito(page: Page) {
  await page.goto(`${BASE}/admin-contab/notas-credito`)
  await page.waitForTimeout(1200)
}

async function openCreationModal(page: Page) {
  await page.getByRole('button', { name: /nueva nota|registrar|\+ nota/i }).first().click()
  await page.waitForTimeout(600)
}

async function selectClient(page: Page, query: string) {
  const modal = page.locator('div.fixed').last()
  const input = modal.locator('input[placeholder*="liente" i], input[placeholder*="uscar" i]').first()
  await input.fill(query)
  await page.waitForTimeout(700)
  await modal.locator('li').filter({ hasText: query }).first().click()
  await page.waitForTimeout(700)
}

async function openNoteByNumero(page: Page, numero: string) {
  const search = page.locator('input[placeholder*="Buscar"], input[placeholder*="uscar" i]')
  await search.fill(numero)
  await page.waitForTimeout(700)
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(2, { timeout: 8000 })
  await rows.nth(1).click()
  await page.waitForTimeout(800)
}

test('Punto 1 — modal de creación muestra Proyecto/# Cotización después de Cliente Master, acotados al cliente', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  const proyectoSelect = page.locator('select').filter({ hasText: /Todos los proyectos/i })
  const cotizacionSelect = page.locator('select').filter({ hasText: /Todas las cotizaciones/i })
  await expect(proyectoSelect).toBeVisible({ timeout: 8000 })
  await expect(cotizacionSelect).toBeVisible()

  const proyectoOpts = await proyectoSelect.locator('option').allTextContents()
  console.log('Opciones Proyecto:', proyectoOpts)
  expect(proyectoOpts.join('|')).toContain('Proyecto Norte 932')
  expect(proyectoOpts.join('|')).toContain('Proyecto Sur 932')
  expect(proyectoOpts.join('|')).toContain('Proyecto Familia 932')

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-modal-proyecto-cotizacion.png' })
})

test('Punto 1 — elegir Cotización autocompleta el Proyecto asociado', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  const cotizacionSelect = page.locator('select').filter({ hasText: /Todas las cotizaciones/i })
  await cotizacionSelect.selectOption({ label: 'COT-2026-932F' })
  await page.waitForTimeout(400)

  const proyectoSelect = page.locator('select').filter({ hasText: /Todos los proyectos|Proyecto/i }).first()
  const selectedProyecto = await proyectoSelect.locator('option:checked').textContent()
  console.log('Proyecto autocompletado tras elegir cotización:', selectedProyecto)
  expect(selectedProyecto).toContain('Proyecto Familia 932')

  // La combinación acota "Factura de origen" a la factura de esa cotización.
  const facturaSelect = page.locator('select').filter({ hasText: /Factura de origen|FAC-932/i }).first()
  const facturaOpts = await facturaSelect.locator('option').allTextContents()
  console.log('Opciones Factura de origen tras filtrar por COT-2026-932F:', facturaOpts)
  expect(facturaOpts.some(o => o.includes('FAC-932-FAMILIA'))).toBeTruthy()
  expect(facturaOpts.some(o => o.includes('FAC-932-NORTE'))).toBeFalsy()
  expect(facturaOpts.some(o => o.includes('FAC-932-SUR'))).toBeFalsy()

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-cotizacion-autocompleta-proyecto.png' })
})

test('Punto 1 — elegir Proyecto filtra # de Cotización, y factura pagada (Norte) sigue apareciendo', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  const proyectoSelect = page.locator('select').filter({ hasText: /Todos los proyectos/i })
  await proyectoSelect.selectOption({ label: 'Proyecto Norte 932' })
  await page.waitForTimeout(400)

  const cotizacionSelect = page.locator('select').filter({ hasText: /Todas las cotizaciones|COT-2026/i }).first()
  const cotOpts = await cotizacionSelect.locator('option').allTextContents()
  console.log('Opciones Cotización tras filtrar por Proyecto Norte:', cotOpts)
  expect(cotOpts.some(o => o.includes('COT-2026-932N'))).toBeTruthy()
  expect(cotOpts.some(o => o.includes('COT-2026-932F'))).toBeFalsy()

  // REQ-483/484 — CreditNoteService::invoicesForClient() SIGUE trayendo facturas ya pagadas
  // (a diferencia de Cobros) — la factura de Norte (saldo_pendiente=0) debe seguir en el <select>.
  const facturaSelect = page.locator('select').filter({ hasText: /Factura de origen|FAC-932/i }).first()
  const facturaOpts = await facturaSelect.locator('option').allTextContents()
  console.log('Opciones Factura de origen (Proyecto Norte, factura pagada):', facturaOpts)
  expect(facturaOpts.some(o => o.includes('FAC-932-NORTE'))).toBeTruthy()

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-proyecto-filtra-cotizacion-factura-pagada.png' })
})

test('Punto 1 — factura elegida se limpia si el filtro cambiado la deja fuera de las opciones visibles', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  // Sin filtro: elegir FAC-932-NORTE.
  const facturaSelect = page.locator('select').filter({ hasText: /Factura de origen|FAC-932/i }).first()
  const norteLabel = (await facturaSelect.locator('option').allTextContents()).find(o => o.includes('FAC-932-NORTE'))!
  await facturaSelect.selectOption({ label: norteLabel })
  await page.waitForTimeout(300)
  await expect(facturaSelect).not.toHaveValue('')

  // Ahora filtrar por Proyecto Sur — la factura elegida (Norte) deja de estar entre las opciones.
  const proyectoSelect = page.locator('select').filter({ hasText: /Todos los proyectos|Proyecto Norte/i }).first()
  await proyectoSelect.selectOption({ label: 'Proyecto Sur 932' })
  await page.waitForTimeout(500)

  const value = await facturaSelect.inputValue()
  console.log('Valor de "Factura de origen" tras cambiar el filtro que la excluye:', JSON.stringify(value))
  expect(value).toBe('') // useEffect debe limpiar facturaOrigenId

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-factura-se-limpia-al-filtrar.png' })
})

test('Punto 1 — doble clic / cambios rápidos Proyecto→Cotización→Proyecto no dejan estado inconsistente', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  const proyectoSelect = page.locator('select').filter({ hasText: /Todos los proyectos|Proyecto/i }).first()
  const cotizacionSelect = page.locator('select').filter({ hasText: /Todas las cotizaciones|COT-2026/i }).first()

  await proyectoSelect.selectOption({ label: 'Proyecto Familia 932' })
  await cotizacionSelect.selectOption({ label: 'COT-2026-932F' })
  await proyectoSelect.selectOption({ label: 'Todos los proyectos' })
  await cotizacionSelect.selectOption({ label: 'COT-2026-932N' })
  await proyectoSelect.selectOption({ label: 'Todos los proyectos' })
  await page.waitForTimeout(400)

  // Hallazgo (no bloqueante) — tras "Proyecto: Todos" tras haber elegido Cotización=932N,
  // `selectProject(null)` no resetea `selectedQuoteId` (mismo criterio que Cobros/SCRUM-931: solo
  // "elegir Cotización" auto-completa Proyecto, "elegir Proyecto=Todos" nunca toca Cotización) —
  // el <select> de Proyecto muestra "Todos los proyectos" pero la Cotización elegida sigue
  // acotando qué facturas/proyectos aparecen. No crashea, no dejó una factura inválida seleccionada
  // (ver test anterior) — solo verificamos acá que el estado post-secuencia es CONSISTENTE, no que
  // "Todos" limpie la Cotización (eso no lo pide el AC).
  const proyectoValue = await proyectoSelect.locator('option:checked').textContent()
  const cotizacionValue = await cotizacionSelect.locator('option:checked').textContent()
  console.log('Tras secuencia rápida — Proyecto:', proyectoValue, '| Cotización:', cotizacionValue)
  expect(proyectoValue).toContain('Todos los proyectos')
  expect(cotizacionValue).toContain('COT-2026-932N')

  // La lista de Proyecto (con Cotización=932N todavía activa) debe seguir acotada a Norte — no
  // debe mostrar Familia/Sur como si el filtro se hubiera perdido.
  const proyectoOptsPostSecuencia = await proyectoSelect.locator('option').allTextContents()
  console.log('Opciones de Proyecto tras la secuencia (Cotización=932N sigue activa):', proyectoOptsPostSecuencia)
  expect(proyectoOptsPostSecuencia.some(o => o.includes('Proyecto Norte 932'))).toBeTruthy()
  expect(proyectoOptsPostSecuencia.some(o => o.includes('Proyecto Familia 932'))).toBeFalsy()

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-cambios-rapidos-filtro.png' })
})

test('Punto 2 — detalle de NC-932-FAMILIA muestra Cotización y Guía ANTES de Factura de origen, ambas clickeables', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-932-FAMILIA')

  const cotizacionField = page.getByText('Cotización', { exact: true }).locator('..')
  const guiaField = page.getByText('Guía de Entrega', { exact: true }).locator('..')
  const facturaField = page.getByText('Factura de origen', { exact: true }).locator('..')

  await expect(cotizacionField.getByRole('button')).toBeVisible({ timeout: 8000 })
  await expect(guiaField.getByRole('button')).toBeVisible()
  await expect(facturaField.getByRole('button')).toBeVisible()

  // Orden real en el DOM: Cotización y Guía deben aparecer ANTES que Factura de origen.
  const gridText = await page.locator('div.fixed').last().innerText()
  const idxCot = gridText.indexOf('Cotización')
  const idxGuia = gridText.indexOf('Guía de Entrega')
  const idxFact = gridText.indexOf('Factura de origen')
  console.log('Índices en el grid — Cotización:', idxCot, 'Guía:', idxGuia, 'Factura de origen:', idxFact)
  expect(idxCot).toBeGreaterThan(-1)
  expect(idxGuia).toBeGreaterThan(-1)
  expect(idxFact).toBeGreaterThan(-1)
  expect(idxCot).toBeLessThan(idxFact)
  expect(idxGuia).toBeLessThan(idxFact)

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-detalle-familia-orden-campos.png' })

  // Clic en Cotización abre su detalle (QuoteViewerModal).
  await cotizacionField.getByRole('button').click()
  await page.waitForTimeout(1000)
  await expect(page.getByText('COT-2026-932F').first()).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/.tmp/preqa-932-detalle-familia-cotizacion-modal.png' })
  await page.keyboard.press('Escape').catch(() => {})
  const closeButtons = page.locator('button').filter({ has: page.locator('svg') })
  await page.waitForTimeout(300)
})

test('Punto 2 — detalle de NC-932-FAMILIA: clic en Guía abre el pedido CORRECTO (distinto al de la factura)', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-932-FAMILIA')

  const guiaField = page.getByText('Guía de Entrega', { exact: true }).locator('..')
  await guiaField.getByRole('button').click()
  await page.waitForTimeout(1200)

  // GuiaEntregaModal debe abrir sin error (ni quedarse en "cargando" para siempre si hubiera un 403/404).
  const errorText = page.getByText(/error|no se pudo|not found|404/i)
  const hasError = await errorText.first().isVisible().catch(() => false)
  console.log('¿Modal de Guía muestra error al abrir el pedido resuelto (order_id de un miembro DISTINTO al de la factura)?', hasError)
  expect(hasError).toBeFalsy()
  await expect(page.getByText(/Guía de Entrega/i).first()).toBeVisible({ timeout: 8000 })

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-detalle-familia-guia-modal.png' })
})

test('Punto 2 — detalle de NC-932-SUELTA (factura sin proyecto/cotización/guía) muestra "—" en vez de botón roto', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-932-SUELTA')

  const cotizacionField = page.getByText('Cotización', { exact: true }).locator('..')
  const guiaField = page.getByText('Guía de Entrega', { exact: true }).locator('..')

  await expect(cotizacionField.getByRole('button')).toHaveCount(0)
  await expect(guiaField.getByRole('button')).toHaveCount(0)
  await expect(cotizacionField.getByText('—')).toBeVisible({ timeout: 8000 })
  await expect(guiaField.getByText('—')).toBeVisible()

  // "Factura de origen" SÍ debe seguir siendo un botón real (la factura existe, solo le faltan
  // proyecto/cotización/guía).
  const facturaField = page.getByText('Factura de origen', { exact: true }).locator('..')
  await expect(facturaField.getByRole('button')).toBeVisible()

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-detalle-suelta-sin-cotizacion-guia.png' })
})

test('Punto 2 — "Factura de origen" en el detalle sigue abriendo el PDF directo (no un modal) — sin cambios', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-932-NORTE')

  const facturaField = page.getByText('Factura de origen', { exact: true }).locator('..')
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
  await facturaField.getByRole('button').click()
  const download = await downloadPromise
  console.log('Descarga disparada al clickear Factura de origen en el detalle:', download?.suggestedFilename() ?? '(sin evento download — revisar)')
  expect(download).not.toBeNull()

  await page.screenshot({ path: 'e2e/.tmp/preqa-932-detalle-norte-factura-origen-pdf.png' })
})

test('Iconografía — cero emoji visible en el modal de creación y el detalle', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openCreationModal(page)
  await selectClient(page, 'PreQA932')
  await page.waitForTimeout(600)

  const creationText = await page.locator('div.fixed').last().innerText()
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  console.log('¿Emoji detectado en modal de creación?', emojiRegex.test(creationText))
  expect(emojiRegex.test(creationText)).toBeFalsy()

  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-932-FAMILIA')
  const detailText = await page.locator('div.fixed').last().innerText()
  console.log('¿Emoji detectado en detalle de nota?', emojiRegex.test(detailText))
  expect(emojiRegex.test(detailText)).toBeFalsy()
})
