import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review (fusionado) — Batch 13 Notas Crédito y Devoluciones (SCRUM-571→574,
 * REQ-494→497), Admin&Cont. Corre contra el stack local (infra/docker-compose.yml, nginx en
 * localhost:8090 vía proxy de Vite) + frontend Vite dev server (localhost:5173) — NO dev.atlanticerp.ai.
 *
 * Datos sembrados vía API real (tinker solo para la plumbing Order/AdminContInvoice, fuera de
 * alcance de este batch — mismo criterio que `AdminContCreditNoteControllerTest::makeInvoicedOrder()`
 * — + POST/PUT reales contra `/api/admin-contab/notas-credito` para register()/decide()). Prefijo
 * [PREQA-B13] en todo lo sembrado. Ver reporte de Pre-QA (docs/pre-qa/) para el detalle completo.
 *
 * ⚠️ Password real de Mark en este entorno local: default (su propio email), NO la que constaba
 * en el prompt de despacho (`B1n4X_2026?`, confirmada inválida vía Hash::check() contra la BD real
 * — hallazgo de documentación, reportado aparte, no bloqueante de este batch).
 *
 *   NC-0007 (id 26) — Anulación completa $200 (bajo el umbral $5,000), CON comprobante —
 *                     pendiente_aprobacion (REQ-494 RN1, foco explícito del Arquitecto). Se deja
 *                     pendiente a propósito (no se decide) para verificar el estado en UI.
 *   NC-0008 (id 27) — Devolución mercancía $8,000, SIN comprobante — aprobada por Mark sin exigir
 *                     comprobante (RN2, foco explícito).
 *   NC-0009 (id 28) — Anulación completa $400, comprobante imagen JPG — pendiente (para Ver comprobante).
 *   NC-0010 (id 29) — Anulación completa $500 — rechazada por Mark con motivo.
 *   NC-0011 (id 30) — Anulación completa $300 — aprobada por Mark.
 *   NC-0012 (id 31) — Anulación completa $250, pendiente_aprobacion — chequeo de visibilidad de
 *                     los botones Aprobar/Rechazar contra un actor no-Mark (Felix).
 *   NC-0013 (id 32) — Anulación completa $200, pendiente, SIN comprobante (creada directo en BD,
 *                     fuera del flujo de registro que ya lo exige) — verificado el bloqueo RN2 al
 *                     aprobar vía API real (422), no se repite acá en UI (ya cubierto por backend).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const FELIX = 'conta@illuminations.com.pa'
const FELIX_PW = 'conta@illuminations.com.pa'
const MARK = 'mbekhar@illuminations.com.pa'
const MARK_PW = 'mbekhar@illuminations.com.pa' // default (email-como-password) — NO la del prompt de despacho, ver docblock arriba

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

async function openNoteByNumero(page: Page, numero: string) {
  // La tabla de historial NO renderiza la columna "número de nota" (solo Fecha/Cliente/Tipo/
  // Factura de origen/Monto/Estado/Registrado por) — el buscador sí filtra por número
  // internamente (placeholder "Buscar por cliente, factura o número de nota..."), pero el texto
  // de la fila nunca contiene el string "NC-XXXX". Filtrar deja 1 sola fila de datos (más el
  // header), así que abrimos esa por posición, no por texto.
  const search = page.locator('input[placeholder*="Buscar"], input[placeholder*="uscar" i]')
  await search.fill(numero)
  await page.waitForTimeout(700)
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(2, { timeout: 8000 }) // header + 1 resultado
  await rows.nth(1).click()
  await page.waitForTimeout(800)
}

test('REQ-494 RN1 — NC-0007 (Anulación completa $200, bajo umbral) muestra "Pendiente" en UI', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0007')
  await expect(page.getByText(/NC-0007/i).first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/pendiente/i).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-nc0007-pendiente-monto-bajo.png' })
})

test('REQ-494 RN1 — hallazgo documentado: Felix (NO Mark) SÍ ve Aprobar/Rechazar en NC-0012 pendiente (backend bloquea, UI no oculta)', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0012')
  await expect(page.getByText(/NC-0012/i).first()).toBeVisible({ timeout: 8000 })
  const aprobarBtn = page.getByRole('button', { name: /^Aprobar$/i })
  const visible = await aprobarBtn.isVisible().catch(() => false)
  console.log('REQ-494 RN1 — botón "Aprobar" visible para Felix (NO Mark):', visible)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-felix-nc0012-botones.png' })
  // Hallazgo documentado en el reporte (no falla el test): `puede_aprobar_rechazar` es solo por
  // estado, no por actor — a diferencia de `puede_decidir_incobrable` en Facturación (mismo batch/
  // epic, mismo patrón "exclusivo de Mark"), que SÍ resuelve identidad server-side.
})

test('REQ-494 — Mark ve y usa Aprobar/Rechazar en NC-0012', async ({ page }) => {
  await login(page, MARK, MARK_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0012')
  await expect(page.getByRole('button', { name: /^Aprobar$/i })).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: /^Rechazar$/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-mark-nc0012-detalle-pendiente.png' })
})

test('REQ-495 — Ver comprobante de NC-0009 (imagen JPG) muestra un <img> real, no fallback genérico', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0009')
  await page.getByRole('button', { name: /Ver comprobante/i }).click()
  await page.waitForTimeout(1200)
  const img = page.locator('img[alt*="omprobante" i]')
  await expect(img).toBeVisible({ timeout: 8000 })
  const src = await img.getAttribute('src')
  console.log('REQ-495 — <img> src del comprobante (debe ser una URL presignada S3 real):', src)
  expect(src).toMatch(/^https?:\/\/.*amazonaws\.com/)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-comprobante-imagen.png' })
})

test('REQ-495 RN2 — Ver comprobante de NC-0008 (sin comprobante) muestra mensaje explícito, no <img> roto', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0008')
  await page.getByRole('button', { name: /Ver comprobante/i }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByText(/no tiene ning[uú]n comprobante/i)).toBeVisible({ timeout: 8000 })
  await expect(page.locator('img[alt*="omprobante" i]')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-sin-comprobante-mensaje.png' })
})

test('REQ-496 RN3 — Documento formal de NC-0010 (rechazada) muestra estado "Rechazada", nunca aplicada', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0010')
  await page.getByRole('button', { name: /Ver documento/i }).click()
  await page.waitForTimeout(1000)
  // Excluye el <option value="rechazada"> oculto del filtro "Estado" de la tabla de historial —
  // el modal de documento se apila arriba, pero getByText por defecto matchea el DOM entero.
  const modal = page.locator('div.fixed').last()
  await expect(modal.getByText(/^Rechazada$/i).first()).toBeVisible({ timeout: 8000 })
  await expect(modal.getByText(/Documentacion insuficiente|Documentación insuficiente/i)).toBeVisible()
  // Pre-QA — hallazgo real corregido en el momento: "Destino del monto" renderizaba la clave i18n
  // cruda ("documentoModal.resultado.aplicadoSaldo") en vez del texto traducido, por un prefijo
  // `notasCredito.` faltante en RESULTADO_KEY (REQ-496 RN1). Aserción negativa para que una
  // regresión futura no pase desapercibida.
  await expect(modal.getByText(/documentoModal\.resultado\./)).toHaveCount(0)
  await expect(modal.getByText(/Aplicado al saldo pendiente|Devuelto al cliente|Dejado como saldo a favor/i)).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-documento-rechazada.png' })
})

test('REQ-497 — "Ver factura relacionada" en NC-0010 abre/descarga la factura CORRECTA (order_id, no el PK de la nota)', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0010')
  await page.getByRole('button', { name: /Ver documento/i }).click()
  await page.waitForTimeout(800)
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
  // Texto real del botón: "Ver factura {{numero}}" (i18n `verFacturaRelacionada`), no "Ver factura
  // relacionada" literal.
  await page.getByRole('button', { name: /Ver factura \[PREQA-B13\]/i }).click()
  const download = await downloadPromise
  console.log('REQ-497 — nombre del archivo descargado:', download.suggestedFilename())
  expect(download.suggestedFilename()).toContain('PREQA-B13]-F-23924')
})

test('RN2 REQ-494 — Devolución de mercancía (NC-0008) fue aprobada por Mark sin exigir comprobante', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0008')
  const modal = page.locator('div.fixed').last()
  await expect(modal.getByText(/^Aplicada$/i).first()).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-devolucion-aplicada-sin-comprobante.png' })
})

test('REQ-494 RN3 — NC-0011 (aprobada) muestra quién aprobó y cuándo', async ({ page }) => {
  await login(page, FELIX, FELIX_PW)
  await gotoNotasCredito(page)
  await openNoteByNumero(page, 'NC-0011')
  await expect(page.getByText(/Mark Bekhar/i).first()).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/.tmp/preqa-b13-nc0011-aprobado-por.png' })
})
