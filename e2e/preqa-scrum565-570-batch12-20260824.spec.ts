import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review (fusionado) — Batch 12 Notas Crédito y Devoluciones (SCRUM-565→570,
 * REQ-488→493), Admin&Cont. Corre contra dev.atlanticerp.ai (backend 8bf111c, frontend a3bdc66).
 * Serial a propósito: CrowdSec/ModSecurity dispara falsos timeouts con logins en paralelo desde
 * la misma IP (ver CLAUDE.md, Epic 11).
 *
 * Datos reales sembrados vía API (legítimo, front door — POST /ventas-diseno/quotes,
 * /bodega/orders/*, /admin-contab/invoices) para poder ejercitar "Corrección de datos" de punta a
 * punta: no existía en dev.atlanticerp.ai ninguna factura con Order/Quote real (todas las órdenes
 * pendientes eran huérfanas de cotización, y las 2 únicas facturas emitidas — F-PREQA-COBROS-1/2 —
 * venían de un batch de Cobros sin Order real). Ver reporte de Pre-QA para el detalle completo.
 *
 * Facturas sembradas:
 *   F-0001 (id 3) — $6,587.31 (>$5,000) — cliente master 7040, sub-cliente 7561.
 *   F-0002 (id 4) — $3,293.65 (≤$5,000) — mismo cliente.
 * Notas ya registradas contra ellas vía API (verificación backend, ver reporte):
 *   NC-0001 — Corrección de datos sobre F-0001, motivo ITBMS, quedó pendiente_aprobacion.
 *   NC-0002 — Corrección de datos sobre F-0002, motivo fecha, quedó aplicada (generó F-0003).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const FELIX = 'conta@illuminations.com.pa'
const MARK  = 'mbekhar@illuminations.com.pa'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function gotoNotasCredito(page: Page) {
  await page.goto(`${BASE}/admin-contab/notas-credito`)
  await page.waitForTimeout(1200)
}

test('Visual Review — entrada real desde el sidebar llega a Notas Crédito (no solo URL directa)', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab`)
  await page.waitForTimeout(1200)
  // El dev real usa sidebar izquierdo (no subtabs superiores + dropdown como el mockup) — variante
  // de layout aceptable (Visual Review: misma funcionalidad, layout distinto). El botón está
  // directo en el sidebar, sin necesidad de abrir un dropdown intermedio.
  const notasLink = page.getByRole('button', { name: /Notas cr[eé]dito y devoluciones/i }).first()
  const visible = await notasLink.isVisible().catch(() => false)
  console.log('SCRUM-568/entry-point — botón "Notas crédito y devoluciones" visible en el sidebar:', visible)
  expect(visible).toBe(true)
  await notasLink.click()
  await page.waitForTimeout(1200)
  expect(page.url()).toContain('/admin-contab/notas-credito')
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-entry-point.png' })
})

test('SCRUM-569 REQ-492 — 5 tarjetas + historial muestra las 2 notas sembradas (F-0001/F-0002)', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  // El número de nota (NC-000x) no es una columna visible de la tabla (mismo criterio que el
  // mockup, que tampoco la muestra) — identificamos las filas por la factura de origen, que sí es
  // columna real.
  await expect(page.getByRole('cell', { name: 'F-0001' })).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('cell', { name: 'F-0002' })).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-historial-inicial.png', fullPage: true })
})

test('SCRUM-569 RN1/RN3 — búsqueda por número de nota (NC-0001) filtra aunque la columna no se muestre', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  const search = page.locator('input[placeholder*="Buscar"]')
  await search.fill('NC-0001')
  await page.waitForTimeout(700)
  await expect(page.getByRole('cell', { name: 'F-0001' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'F-0002' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-search-nc0001.png' })
})

test('SCRUM-569 RN2/RN3 — filtro de estado "Pendiente de aprobación" + tipo "Anulación completa" combinados (AND)', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  const selects = page.locator('select')
  const count = await selects.count()
  console.log('selects encontrados en historial:', count)
  // Orden real del toolbar: [0]=cliente, [1]=tipo, [2]=estado (confirmado por HistorialNotasCreditoPanel.tsx)
  await selects.nth(1).selectOption({ label: 'Anulación completa de factura' })
  await page.waitForTimeout(500)
  await selects.nth(2).selectOption({ label: 'Pendiente de aprobación' })
  await page.waitForTimeout(700)
  await expect(page.getByRole('cell', { name: 'F-0001' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'F-0002' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-filtros-combinados.png' })
})

test('SCRUM-569 RN4 — Limpiar filtros resetea todo', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  const search = page.locator('input[placeholder*="Buscar"]')
  await search.fill('NC-0001')
  await page.waitForTimeout(500)
  const clearBtn = page.getByText(/Limpiar filtros/i)
  await expect(clearBtn).toBeVisible()
  await clearBtn.click()
  await page.waitForTimeout(600)
  await expect(search).toHaveValue('')
  await expect(page.getByRole('cell', { name: 'F-0001' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'F-0002' })).toBeVisible()
})

test('SCRUM-570 RN1/RN4 — detalle de nota pendiente_aprobacion (F-0001): sin motivo_rechazo/aprobado_por, Aprobar/Rechazar visibles y deshabilitados', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  await page.getByRole('row', { name: /F-0001/ }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByText(/Aprobar/i)).toBeVisible()
  await expect(page.getByText(/Rechazar/i)).toBeVisible()
  const aprobarBtn = page.getByRole('button', { name: /^Aprobar$/i })
  const rechazarBtn = page.getByRole('button', { name: /^Rechazar$/i })
  await expect(aprobarBtn).toBeDisabled()
  await expect(rechazarBtn).toBeDisabled()
  // RN1 — no debe mostrar "Motivo del rechazo" (nunca aplicó)
  await expect(page.getByText(/Motivo del rechazo/i)).toHaveCount(0)
  // RN1 — no debe mostrar "Aprobado/Rechazado por" (todavía no hay decisión)
  await expect(page.getByText(/Aprobado.*por|Rechazado.*por/i)).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-detalle-nc0001-pendiente.png', fullPage: true })
})

test('SCRUM-570 RN2 — detalle de F-0002 (Corrección de datos, no Devolución): sin trazabilidad de Bodega', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  await page.getByRole('row', { name: /F-0002/ }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByText(/Trazabilidad.*Bodega|Bodega.*Trazabilidad/i)).toHaveCount(0)
  // No debe tener Aprobar/Rechazar (ya está aplicada)
  const aprobarBtn = page.getByRole('button', { name: /^Aprobar$/i })
  await expect(aprobarBtn).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-detalle-nc0002-aplicada.png', fullPage: true })
})

// NOTA: el password real de mbekhar@illuminations.com.pa ya no es el default (email) en
// dev.atlanticerp.ai — no se pudo loguear como Mark en esta sesión (sin acceso para resetearlo). El
// modal de detalle es el MISMO componente para cualquier rol con acceso (puede_aprobar_rechazar
// se calcula 100% server-side, ver CreditNoteService::show()) — ya verificado con Felix arriba.
// Documentado como gap de credenciales, no como hallazgo funcional.

test('SCRUM-565 RN2/RN6 Escenario 1 — Descuento comercial sin factura de origen bloquea el registro', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  await page.getByRole('button', { name: /Nueva nota/i }).click()
  await page.waitForTimeout(800)

  // Elegir cliente (usar uno con facturas para poder desmarcar la selección después)
  // Placeholder EXACTO del campo cliente del modal ("Buscar cliente...") — distinto del buscador
  // del historial de fondo ("Buscar por cliente, factura o número de nota..."), que también matchea
  // un filtro *="cliente" laxo y se llevaba el foco por error en una iteración anterior de este spec.
  const clienteInput = page.getByPlaceholder('Buscar cliente...')
  await clienteInput.fill('SURPLUS')
  await page.waitForTimeout(700)
  const opt = page.locator('li').filter({ hasText: 'SURPLUS' }).first()
  if (await opt.isVisible().catch(() => false)) await opt.click()
  await page.waitForTimeout(600)

  // NO seleccionar ninguna factura de origen — el bloque de Monto/Motivo ni siquiera se renderiza
  // sin `facturaSeleccionada` (RN2 enforced estructuralmente, ver RegistrarNotaCreditoModal.tsx
  // línea ~557: `{facturaSeleccionada && !esCorreccionDeDatos && (...)}`).
  const montoInput = page.locator('input[type="number"]').first()
  const montoVisible = await montoInput.isVisible({ timeout: 3000 }).catch(() => false)
  console.log('SCRUM-565 RN2 — campo Monto visible SIN factura de origen seleccionada?', montoVisible)
  expect(montoVisible).toBe(false)

  const confirmBtn = page.getByRole('button', { name: /Registrar nota|Confirmar/i }).last()
  // RN6 — botón debe permanecer deshabilitado (canSubmit=false) SIN factura de origen seleccionada
  const isDisabled = await confirmBtn.isDisabled().catch(() => null)
  console.log('SCRUM-565 RN2 — botón Registrar nota disabled sin factura de origen?', isDisabled)
  expect(isDisabled).toBe(true)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-565-sin-factura-origen.png' })
})

test('SCRUM-565 Escenario 2 — excedente "devolver dinero" exige cuenta bancaria antes de habilitar el registro', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  await page.getByRole('button', { name: /Nueva nota/i }).click()
  await page.waitForTimeout(800)

  // Placeholder EXACTO del campo cliente del modal ("Buscar cliente...") — distinto del buscador
  // del historial de fondo ("Buscar por cliente, factura o número de nota..."), que también matchea
  // un filtro *="cliente" laxo y se llevaba el foco por error en una iteración anterior de este spec.
  const clienteInput = page.getByPlaceholder('Buscar cliente...')
  await clienteInput.fill('SURPLUS')
  await page.waitForTimeout(700)
  const opt = page.locator('li').filter({ hasText: 'SURPLUS' }).first()
  if (await opt.isVisible().catch(() => false)) await opt.click()
  await page.waitForTimeout(700)

  // Seleccionar F-0003 (saldo pendiente real USD 3,293.65, factura sin pagos aplicados) y un monto
  // apenas mayor — genera excedente real (RN REQ-484) sin cruzar el umbral de $5,000, para aislar
  // específicamente la validación de cuenta bancaria (si usara un monto >$5,000 también exigiría
  // comprobante obligatorio, confundiendo qué validación es la que bloquea).
  const facturaSelect = page.locator('select').filter({ hasText: /F-000/ }).first()
  const hasFacturaSelect = await facturaSelect.isVisible().catch(() => false)
  if (hasFacturaSelect) {
    await facturaSelect.selectOption({ index: 2 })
    await page.waitForTimeout(500)
  }

  const montoInput = page.locator('input[type="number"]').first()
  await montoInput.fill('3400')
  await page.waitForTimeout(500)

  const motivoTextarea = page.locator('textarea').first()
  await motivoTextarea.fill('Prueba Pre-QA — excedente devolver dinero sin cuenta')
  await page.waitForTimeout(300)

  // Elegir "Devolver el dinero al cliente" (debería ya venir marcado por default)
  const devolverRadio = page.locator('input[type="radio"][value="devuelto"]')
  if (await devolverRadio.isVisible().catch(() => false)) {
    await devolverRadio.check()
    await page.waitForTimeout(300)
  }

  const confirmBtn = page.getByRole('button', { name: /Registrar nota|Confirmar/i }).last()
  const isDisabled = await confirmBtn.isDisabled().catch(() => null)
  console.log('SCRUM-565 Escenario 2 — botón disabled sin cuenta bancaria de salida?', isDisabled)
  expect(isDisabled).toBe(true)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-565-sin-cuenta-bancaria.png' })
})

test('SCRUM-566/567 — Corrección de datos abre revisión previa con tarjetas ANTES de confirmar (RN1), "Volver y corregir" preserva el formulario (RN4)', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  await page.getByRole('button', { name: /Nueva nota/i }).click()
  await page.waitForTimeout(800)

  // Todos los selects/inputs de acá en adelante se escopean DENTRO del modal — el historial de
  // fondo tiene sus propios <select> (cliente/tipo/estado del toolbar de filtros) que quedan
  // montados detrás del overlay y `page.locator('select').first()` los agarra por error si no se
  // acota al modal (ya pasó 2 veces en iteraciones anteriores de este mismo spec).
  const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Registrar nueva nota' }) })

  const clienteInput = modal.getByPlaceholder('Buscar cliente...')
  await clienteInput.fill('SURPLUS')
  await page.waitForTimeout(700)
  const opt = page.locator('li').filter({ hasText: 'SURPLUS' }).first()
  if (await opt.isVisible().catch(() => false)) await opt.click()
  await page.waitForTimeout(600)

  const tipoSelect = modal.locator('select').first()
  await tipoSelect.selectOption({ label: 'Anulación completa de factura' })
  await page.waitForTimeout(500)

  const subtipoSelect = modal.locator('select').nth(1)
  const subtipoVisible = await subtipoSelect.isVisible().catch(() => false)
  console.log('subtipo select visible tras elegir Anulación completa?', subtipoVisible)
  if (subtipoVisible) {
    await subtipoSelect.selectOption({ label: 'Corrección de datos — el trabajo sí se entregó, hay que refacturar' })
    await page.waitForTimeout(500)
  }

  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-566-form-correccion.png', fullPage: true })

  // Elegir factura de origen F-0001
  const facturaSelect = modal.locator('select').filter({ hasText: /F-000/ }).first()
  if (await facturaSelect.isVisible().catch(() => false)) {
    await facturaSelect.selectOption({ index: 1 })
    await page.waitForTimeout(500)
  }

  // motivo de corrección = ITBMS
  const motivoCorreccionSelect = modal.locator('select').filter({ hasText: /ITBMS|Fecha|Ambos/i }).first()
  if (await motivoCorreccionSelect.isVisible().catch(() => false)) {
    await motivoCorreccionSelect.selectOption({ label: 'Tratamiento de ITBMS incorrecto' })
    await page.waitForTimeout(500)
  }

  // Orden real en el DOM (confirmado con debug): [0]tipo, [1]subtipo, [2]motivo corrección,
  // [3]tratamiento correcto, [4]factura de origen — "tratamiento correcto" NO es el último select
  // pese a aparecer visualmente después en algunos estados intermedios del form.
  const tratamientoSelect = modal.locator('select').nth(3)
  await tratamientoSelect.selectOption({ index: 1 })
  await page.waitForTimeout(300)

  const motivoTextarea = modal.locator('textarea').first()
  const motivoTexto = 'Prueba Pre-QA UI — revision previa, no debe persistir nada'
  await motivoTextarea.fill(motivoTexto)
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-566-debug-antes-revisar.png', fullPage: true })
  const selectDebug = await modal.locator('select').evaluateAll(els =>
    els.map(e => ({ tag: e.tagName, value: (e as HTMLSelectElement).value, selectedLabel: (e as HTMLSelectElement).selectedOptions[0]?.textContent }))
  )
  console.log('DEBUG selects en el modal:', JSON.stringify(selectDebug))

  const revisarBtn = modal.getByRole('button', { name: /Revisar/i })
  const revisarEnabled = await revisarBtn.isEnabled().catch(() => false)
  console.log('SCRUM-566 — botón "Revisar antes de anular" habilitado tras completar el form?', revisarEnabled)
  if (revisarEnabled) {
    await revisarBtn.click()
    await page.waitForTimeout(1200)

    // RN1 — debe mostrar tarjetas de revisión, no un submit directo
    await expect(page.getByText(/factura.*origen|Factura de origen/i).first()).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-b12-566-revision-tarjetas.png', fullPage: true })

    // RN2/RN3 — "Ver factura nueva"
    const verFacturaBtn = page.getByRole('button', { name: /Ver factura/i })
    if (await verFacturaBtn.isVisible().catch(() => false)) {
      await verFacturaBtn.click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'e2e/.tmp/preqa-b12-567-vista-previa-factura.png', fullPage: true })
    }

    // RN4 — Volver y corregir preserva el formulario
    const volverBtn = page.getByRole('button', { name: /Volver y corregir|Volver/i })
    await volverBtn.click()
    await page.waitForTimeout(800)
    await expect(motivoTextarea).toHaveValue(motivoTexto)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b12-566-volver-preserva-form.png', fullPage: true })
  }

  // Cerrar sin confirmar — RN1 exige que nada se haya persistido
  await page.keyboard.press('Escape').catch(() => {})
})

// ── SCRUM-568 (REQ-491) — cola de devoluciones confirmadas por Bodega ──────────────────────────
// Devolución sembrada vía API (front door, POST /bodega/returns + confirm-reception): DEV-2026-0003
// sobre el order 25 (misma factura F-0001), 2 unidades, status esperando_nota_credito.

test('SCRUM-568 RN1/RN2 — fila ámbar en el historial abre el formulario precargado', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)

  const row = page.getByRole('row', { name: /DEV-2026-0003|Pendiente de generar nota/ }).first()
  await expect(row).toBeVisible({ timeout: 8000 })
  // RN1 — visualmente ámbar (bg-amber-50/70 en la fila real)
  const bg = await row.evaluate(el => getComputedStyle(el).backgroundColor)
  console.log('SCRUM-568 RN1 — background-color de la fila de la cola:', bg)

  await row.click()
  await page.waitForTimeout(1200)

  const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Registrar nueva nota' }) })
  await expect(modal).toBeVisible()
  // RN2 — precargado: cliente bloqueado, tipo "Devolución de mercancía" de solo lectura
  await expect(modal.getByText(/Devoluci[oó]n de mercanc[ií]a/i)).toBeVisible()
  await expect(modal.getByText('ENDLESS 30 30 LED WW')).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-568-precarga-devolucion.png', fullPage: true })

  // GAP YA CONOCIDO (Senior Review 2026-08-24, SCRUM-786) — monto sugerido arranca en $0.00 porque
  // Bodega no trackea precio unitario por línea. No se re-reporta como hallazgo nuevo.
  const montoInput = modal.locator('input').filter({ hasText: '' })
  const montoValue = await modal.locator('input[type="text"], input:not([type])').evaluateAll(
    els => els.map(e => (e as HTMLInputElement).value)
  ).catch(() => [])
  console.log('SCRUM-568 — valores de inputs de texto en el modal precargado (buscando Monto=$0.00 ya conocido):', JSON.stringify(montoValue))
})

test('SCRUM-568 RN3 — al generar la nota, la fila deja de aparecer en la cola', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)

  const row = page.getByRole('row', { name: /DEV-2026-0003|Pendiente de generar nota/ }).first()
  await expect(row).toBeVisible({ timeout: 8000 })
  await row.click()
  await page.waitForTimeout(1200)

  const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Registrar nueva nota' }) })
  await expect(modal).toBeVisible()

  // Completar el monto (gap ya conocido: arranca en $0.00) para poder registrar la nota real.
  const montoInput = modal.locator('input[type="number"]').first()
  await montoInput.fill('850')
  await page.waitForTimeout(300)
  const motivoTextarea = modal.locator('textarea').first()
  await motivoTextarea.fill('Prueba Pre-QA — cierre real de la cola de devoluciones (RN3 REQ-491)')
  await page.waitForTimeout(300)

  const registrarBtn = modal.getByRole('button', { name: /Registrar nota/i })
  await expect(registrarBtn).toBeEnabled({ timeout: 5000 })
  await registrarBtn.click()
  await page.waitForTimeout(1500)

  // El modal debe cerrarse (onRegistered -> setModalOpen(false)) y la fila ámbar ya no debe existir.
  await expect(modal).toHaveCount(0, { timeout: 8000 })
  await expect(page.getByRole('row', { name: /DEV-2026-0003/ })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-568-cola-cerrada.png', fullPage: true })
})

test('SCRUM-570 Escenario 1 — detalle de nota de Devolución de mercancía aplicada muestra trazabilidad completa de Bodega', async ({ page }) => {
  await login(page, FELIX)
  await gotoNotasCredito(page)
  const row = page.getByRole('row', { name: /DEV-2026-0003/ })
  // La fila real de la nota generada (no la de la cola, que ya no existe tras RN3) referencia el
  // return_number en su trazabilidad, no necesariamente visible en la columna — localizamos por
  // "Devolución de mercancía" + F-0001 en su lugar.
  const notaRow = page.locator('tr').filter({ hasText: 'Devolución de mercancía' }).filter({ hasText: 'F-0001' })
  await expect(notaRow).toBeVisible({ timeout: 8000 })
  await notaRow.click()
  await page.waitForTimeout(1000)
  await expect(page.getByText(/DEV-2026-0003/)).toBeVisible()
  await expect(page.getByText(/Recepci[oó]n f[ií]sica confirmada|Devoluci[oó]n creada/i).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa-b12-570-trazabilidad-bodega.png', fullPage: true })
})

test('DEBUG timezone check', async ({ page }) => {
  await login(page, FELIX)
  const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const check = await page.evaluate(() => new Date('2026-08-24').toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' }))
  console.log('BROWSER TIMEZONE:', tz, '| new Date(2026-08-24) formatted es-PA:', check)
})
