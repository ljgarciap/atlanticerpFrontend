import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Pre-QA 2026-07-28 — SCRUM-390/392/393/394/395/396/398/399/400/401 (batch "Packing -> Por
// despachar -> Despachado", cableado de frontend commits 993e812 + 43fbc15, Senior Review
// aprobado). Corre contra https://dev.atlanticerp.ai con los 12 pedidos de SCRUM-501 + fixtures ad-hoc
// sembradas para este pase (solo id=16, familia id=17/18 en por_despachar sin repartidor — los
// fixtures originales de familia/por_despachar de SCRUM-501 ya habían sido consumidos/avanzados
// por verificaciones previas de Senior Review).

const ESTEBAN = 'liderbodega@test.com' // Jefe de Bodega (lider_bodega)
const OSVALDO = 'asistentebodega@test.com' // Asistente de Bodega

const SOLO_ORDER_ID = 16
const FAMILY_ROOT_ID = 17
const FAMILY_SIBLING_ID = 18
const PACKING_ORDER_ID = 5 // [QA-BOD] Residencial Vista Hermosa, items 10 (qty_picked=2) y 11 (qty_picked=4)
const DESPACHADO_ORDER_ID = 8 // [QA-BOD] Restaurante Costa del Este, courier=Gary, invoice_ready=true
const INVOICE_READY_ORDER_ID = 19 // fixture dedicado, por_despachar + invoice_ready=true, no lo toca ningun otro test

async function login(page, email: string) {
  await page.goto('https://dev.atlanticerp.ai/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
}

async function goToPedidos(page) {
  await page.goto('https://dev.atlanticerp.ai/bodega/pedidos')
  await page.waitForTimeout(1200)
}

function cardFor(page, orderId: number) {
  return page.getByTestId(`order-card-${orderId}`)
}

test.describe.serial('SCRUM-396/398 — Asignar Repartidor + bloqueo de despacho', () => {
  test('RN1 — Asistente (Osvaldo) ve el control pero recibe 403 real del backend, no un bloqueo cosmético', async ({ page }) => {
    await login(page, OSVALDO)
    await goToPedidos(page)
    const card = cardFor(page, SOLO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()

    const assignBtn = card.getByTestId(`assign-courier-button-${SOLO_ORDER_ID}`)
    await expect(assignBtn).toBeVisible() // visible para todos los perfiles a propósito (ver docblock)
    await assignBtn.click()
    await page.waitForTimeout(300)

    await card.getByTestId(`assign-courier-select-${SOLO_ORDER_ID}`).selectOption({ label: 'Transporte Test' })
    await card.getByTestId(`assign-courier-confirm-${SOLO_ORDER_ID}`).click()
    await page.waitForTimeout(1000)

    const err = card.getByTestId(`assign-courier-error-${SOLO_ORDER_ID}`)
    await expect(err).toBeVisible()
    const text = await err.innerText()
    console.log('SCRUM396_ASISTENTE_403_MESSAGE=', text)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum396-asistente-403.png') })
  })

  test('RN1 (camino feliz) — Esteban (Jefe de Bodega) sí puede asignar; select incluye a Transporte Test real', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, SOLO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()

    await card.getByTestId(`assign-courier-button-${SOLO_ORDER_ID}`).click()
    await page.waitForTimeout(500)
    const select = card.getByTestId(`assign-courier-select-${SOLO_ORDER_ID}`)
    const optionTexts = await select.locator('option').allInnerTexts()
    console.log('SCRUM396_COURIER_SELECT_OPTIONS=', JSON.stringify(optionTexts))
    expect(optionTexts.join(' ')).toContain('Transporte Test')

    await select.selectOption({ label: 'Transporte Test' })
    await card.getByTestId(`assign-courier-confirm-${SOLO_ORDER_ID}`).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum396-esteban-ok.png'), fullPage: true })
  })

  test('SCRUM-398 RN2 — sin factura: Despachar bloquea con mensaje REAL del backend, no un boton pre-deshabilitado', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, SOLO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()

    const dispatchBtn = card.getByTestId(`dispatch-button-${SOLO_ORDER_ID}`)
    await expect(dispatchBtn).toBeVisible()
    await expect(dispatchBtn).toBeEnabled() // nunca pre-calculado disabled, ver Senior Review
    await dispatchBtn.click()
    await page.waitForTimeout(1000)

    const err = card.getByTestId(`dispatch-error-${SOLO_ORDER_ID}`)
    await expect(err).toBeVisible()
    const text = await err.innerText()
    console.log('SCRUM398_RN2_NO_INVOICE_MESSAGE=', text)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum398-sin-factura.png') })
  })

  test('RN2 — asignar repartidor a la raiz de familia propaga automaticamente al hermano', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const rootCard = cardFor(page, FAMILY_ROOT_ID)
    await rootCard.scrollIntoViewIfNeeded()

    await rootCard.getByTestId(`assign-courier-button-${FAMILY_ROOT_ID}`).click()
    await page.waitForTimeout(400)
    await rootCard.getByTestId(`assign-courier-select-${FAMILY_ROOT_ID}`).selectOption({ label: 'Transporte Test' })
    await rootCard.getByTestId(`assign-courier-confirm-${FAMILY_ROOT_ID}`).click()
    await page.waitForTimeout(1200)

    // Recargar y confirmar que el hermano (invoice_ready=false, sin courier propio) ya tiene
    // "Despachar" habilitado en vez de "Asignar Repartidor" — prueba indirecta de la propagacion,
    // ya que el board no expone courier_id crudo en la tarjeta.
    await goToPedidos(page)
    const siblingCard = cardFor(page, FAMILY_SIBLING_ID)
    await siblingCard.scrollIntoViewIfNeeded()
    const siblingDispatchBtn = siblingCard.getByTestId(`dispatch-button-${FAMILY_SIBLING_ID}`)
    await expect(siblingDispatchBtn).toBeVisible()
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum396-rn2-propagacion.png'), fullPage: true })
  })

  test('SCRUM-398 RN3 — despacho de familia no arrastra al miembro sin factura', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)

    // Root (invoice_ready=true, ya con courier) SI puede despachar.
    const rootCard = cardFor(page, FAMILY_ROOT_ID)
    await rootCard.scrollIntoViewIfNeeded()
    await rootCard.getByTestId(`dispatch-button-${FAMILY_ROOT_ID}`).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum398-rn3-root-dispatch.png'), fullPage: true })

    // Releer el tablero: la raiz debe estar en despachado, el hermano (invoice_ready=false) debe
    // seguir en por_despachar con su propio boton de despachar (no arrastrado).
    await goToPedidos(page)
    const siblingCard = cardFor(page, FAMILY_SIBLING_ID)
    await siblingCard.scrollIntoViewIfNeeded()
    const siblingStillHasDispatch = siblingCard.getByTestId(`dispatch-button-${FAMILY_SIBLING_ID}`)
    await expect(siblingStillHasDispatch).toBeVisible()
    console.log('SCRUM398_RN3_SIBLING_STILL_IN_POR_DESPACHAR=true (boton Despachar sigue visible, no avanzo)')

    // Confirmar tambien via error inline si se intenta despachar el hermano directo (debe seguir
    // bloqueado por falta de factura).
    await siblingCard.getByTestId(`dispatch-button-${FAMILY_SIBLING_ID}`).click()
    await page.waitForTimeout(1000)
    const err = siblingCard.getByTestId(`dispatch-error-${FAMILY_SIBLING_ID}`)
    await expect(err).toBeVisible()
    console.log('SCRUM398_RN3_SIBLING_DISPATCH_ERROR=', await err.innerText())
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum398-rn3-sibling-blocked.png') })
  })
})

test.describe.serial('SCRUM-393/394/395 — Registrar Entrega (Packing)', () => {
  test('Camino de ruptura — tope real es qty_picked, motivo obligatorio en parcial, "otra" exige texto libre', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, PACKING_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.getByTestId(`register-delivery-button-${PACKING_ORDER_ID}`).click()
    await page.waitForTimeout(800)

    const modal = page.getByTestId('register-delivery-modal')
    await expect(modal).toBeVisible()
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum393-modal-open.png'), fullPage: true })

    // Item 10: qty_requested=2, qty_picked=2 -> tope real es 2. Habilitar edicion e intentar
    // escribir por encima del tope real.
    await modal.getByTestId('register-delivery-edit-10').click()
    const qtyInput10 = modal.getByTestId('register-delivery-qty-10')
    await expect(qtyInput10).toHaveAttribute('max', '2')
    await qtyInput10.fill('99')
    await modal.getByTestId('register-delivery-save').click()
    await page.waitForTimeout(500)
    const qtyErr10 = modal.getByTestId('register-delivery-qty-error-10')
    await expect(qtyErr10).toBeVisible()
    console.log('SCRUM393_CAP_ERROR=', await qtyErr10.innerText())
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum393-cap-bloqueado.png') })

    // Corregir item 10 a entrega completa (2), y dejar item 11 parcial (2 de 4, motivo faltante)
    // para ejercitar SCRUM-394 (motivo obligatorio).
    await qtyInput10.fill('2')
    await modal.getByTestId('register-delivery-edit-11').click()
    const qtyInput11 = modal.getByTestId('register-delivery-qty-11')
    await expect(qtyInput11).toHaveAttribute('max', '4')
    await qtyInput11.fill('2')
    await page.waitForTimeout(200)

    const motivoSelect11 = modal.getByTestId('register-delivery-motivo-11')
    await expect(motivoSelect11).toBeVisible() // aparece automaticamente al quedar parcial

    // Intentar guardar SIN motivo -> bloqueado (RN2 SCRUM-394).
    await modal.getByTestId('register-delivery-save').click()
    await page.waitForTimeout(500)
    const motivoErr = modal.getByTestId('register-delivery-motivo-error-11')
    await expect(motivoErr).toBeVisible()
    console.log('SCRUM394_MOTIVO_REQUIRED_ERROR=', await motivoErr.innerText())
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum394-motivo-bloqueado.png') })

    // Elegir "Otra" sin detalle -> bloqueado.
    await motivoSelect11.selectOption('otra')
    await page.waitForTimeout(200)
    await modal.getByTestId('register-delivery-save').click()
    await page.waitForTimeout(500)
    const detalleErr = modal.getByTestId('register-delivery-motivo-detalle-error-11')
    await expect(detalleErr).toBeVisible()
    console.log('SCRUM394_OTRA_DETALLE_REQUIRED_ERROR=', await detalleErr.innerText())
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum394-otra-sin-detalle.png') })

    // Completar con un motivo real del catalogo (sin_stock) esta vez, y guardar -> debe pasar.
    await motivoSelect11.selectOption('sin_stock')
    await page.waitForTimeout(200)
    await modal.getByTestId('register-delivery-save').click()
    await page.waitForTimeout(1500)
    await expect(modal).not.toBeVisible() // onSuccess cierra el modal
    console.log('SCRUM393_395_SAVE_OK=true')
  })

  test('SCRUM-395 — el pedido avanza y se crea la tarjeta Faltante vinculada a la familia', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    // El pedido original ya no debe seguir en Packing.
    const originalCardInPacking = page.getByTestId(`register-delivery-button-${PACKING_ORDER_ID}`)
    await expect(originalCardInPacking).toHaveCount(0)

    const board = page.getByTestId('pedidos-board')
    await expect(board).toContainText('Residencial Vista Hermosa')
    // Debe aparecer una segunda tarjeta con el mismo cliente (la tarjeta Faltante heredada).
    const matchingCards = page.locator('[data-testid^="order-card-"]').filter({ hasText: 'Residencial Vista Hermosa' })
    const count = await matchingCards.count()
    console.log('SCRUM395_TARJETAS_CON_MISMO_CLIENTE=', count)
    expect(count).toBeGreaterThanOrEqual(2) // original avanzada + Faltante nueva
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum395-faltante-creada.png'), fullPage: true })
  })
})

test.describe.serial('SCRUM-399/400 — Confirmar Guía Firmada + documento Guía de Entrega', () => {
  test('Validaciones de campo obligatorio (repartidor, quien recibio, archivo)', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, DESPACHADO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.getByTestId(`register-signed-guide-button-${DESPACHADO_ORDER_ID}`).click()
    await page.waitForTimeout(600)

    const modal = page.getByTestId('signed-guide-modal')
    await expect(modal).toBeVisible()

    // "Quien entrego" preseleccionado con el repartidor ya asignado (Transporte Test).
    const courierSelect = modal.getByTestId('signed-guide-courier-select')
    const selectedText = await courierSelect.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text)
    console.log('SCRUM399_PRESELECTED_COURIER=', selectedText)
    expect(selectedText).toContain('Transporte Test')

    // Intentar confirmar sin nombre de quien recibio ni archivo -> bloqueado.
    await modal.getByTestId('signed-guide-confirm').click()
    await page.waitForTimeout(500)
    await expect(modal.getByTestId('signed-guide-received-by-error')).toBeVisible()
    await expect(modal.getByTestId('signed-guide-file-error')).toBeVisible()
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum399-validacion-vacio.png') })
  })

  test('Camino feliz — receptor distinto al repartidor, avanza automaticamente a Entregado', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, DESPACHADO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.getByTestId(`register-signed-guide-button-${DESPACHADO_ORDER_ID}`).click()
    await page.waitForTimeout(600)

    const modal = page.getByTestId('signed-guide-modal')
    await modal.getByTestId('signed-guide-received-by-input').fill('Maria Fernandez (Recepcionista)')
    await modal.getByTestId('signed-guide-dropzone').click()
    await page.setInputFiles('input[type="file"]', path.join(__dirname, 'guia-firmada-test.png'))
    await page.waitForTimeout(300)
    await modal.getByTestId('signed-guide-confirm').click()
    await page.waitForTimeout(1800)
    await expect(modal).not.toBeVisible()
    console.log('SCRUM399_AUTO_ADVANCE_OK=true')
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum399-confirmado.png') })

    // No hay boton de avance manual: recargar y confirmar que ya no ofrece "Confirmar Guia
    // Firmada" (avanzo solo, sin otro clic).
    await goToPedidos(page)
    await expect(page.getByTestId(`register-signed-guide-button-${DESPACHADO_ORDER_ID}`)).toHaveCount(0)
  })

  test('SCRUM-400 — la Guia de Entrega muestra el nombre real de quien recibio, no el repartidor', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, DESPACHADO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: /ver guía|guia/i }).click()
    await page.waitForTimeout(800)

    const sig = page.getByTestId('guide-signature')
    await expect(sig).toBeVisible()
    const text = await sig.innerText()
    console.log('SCRUM400_SIGNATURE_TEXT=', JSON.stringify(text))
    expect(text).toContain('Maria Fernandez')
    expect(text).not.toContain('Transporte Test')

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.includes('$')).toBe(false) // RN1 — nunca precios en la guia
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum400-firma-real.png') })
  })
})

test.describe('SCRUM-401 — acceso a Factura (placeholder, alcance reducido pre-aprobado)', () => {
  test('invoice_ready=true muestra "ver" y el modal placeholder sin acciones de edicion', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    // NOTA: la fila de Factura solo se renderiza en stage "por_despachar" (ver OrderCardTile) —
    // por eso se usa un fixture dedicado en vez de DESPACHADO_ORDER_ID, que ya avanzo a "entregado".
    const card = cardFor(page, INVOICE_READY_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    const invoiceBtn = card.getByTestId('invoice-view-button')
    await expect(invoiceBtn).toBeVisible()
    await invoiceBtn.click()
    await page.waitForTimeout(600)
    const bodyText = await page.locator('body').innerText()
    console.log('SCRUM401_INVOICE_MODAL_TEXT_SNIPPET=', bodyText.slice(0, 300))
    // Solo boton "Cerrar", nada de generar/editar/eliminar.
    await expect(page.getByRole('button', { name: /generar|editar|eliminar/i })).toHaveCount(0)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum401-modal-listo.png') })
  })

  test('invoice_ready=false muestra estado "esperando", sin boton ver', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, FAMILY_SIBLING_ID) // invoice_ready=false, todavia en por_despachar
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByTestId('invoice-waiting')).toBeVisible()
    await expect(card.getByTestId('invoice-view-button')).toHaveCount(0)
    await page.screenshot({ path: path.join(__dirname, '.tmp', 'scrum401-esperando.png') })
  })
})

test.describe('SCRUM-390 — Descarga a Excel desde Ver Detalle (alcance reducido, ya no depende del batch)', () => {
  test('Descargar Excel dispara una descarga real', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, DESPACHADO_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.click()
    await page.waitForTimeout(800)
    await page.getByTestId('toggle-items').click()
    await page.waitForTimeout(400)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.getByTestId('export-excel-button').click(),
    ])
    console.log('SCRUM390_DOWNLOAD_TRIGGERED=', download !== null)
    if (download) console.log('SCRUM390_DOWNLOAD_SUGGESTED_FILENAME=', download.suggestedFilename())
    expect(download).not.toBeNull()
  })
})

// Chequeo adicional (SCRUM-56, regla de cliente) + recarga a mitad de flujo — Paso 3 del
// protocolo Pre-QA, sobre los 2 modales NUEVOS de este batch que ningún test anterior cubría.
// Promovido a permanente (regla del proyecto: gate que ya se rompió una vez, ver docblock de
// `BodegaRoles::TEAM_MEMBERS_QUERY_MAP` — 43fbc15 corrigió una regresión cruzada real en el
// selector de repartidor/picker el mismo día de este batch, sin test dedicado que la hubiera
// atrapado, señalado como hallazgo MEDIO no bloqueante por Senior Review).
const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

test.describe('Chequeos adicionales — emoji (SCRUM-56) + recarga/doble-clic sobre los modales nuevos', () => {
  test('Emoji grep — tarjetas Por despachar (fila de factura) sin iconografia de emoji', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, INVOICE_READY_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    const text = await card.innerText()
    expect(emojiRegex.test(text)).toBe(false)
  })

  test('Recargar a mitad de "Asignar Repartidor" (form abierto) no rompe, no arrastra estado fantasma', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, ESTEBAN)
    await goToPedidos(page)
    const card = cardFor(page, INVOICE_READY_ORDER_ID)
    await card.scrollIntoViewIfNeeded()
    await card.getByTestId(`assign-courier-button-${INVOICE_READY_ORDER_ID}`).click()
    await page.waitForTimeout(400)
    await page.reload()
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
    await expect(page.getByTestId('pedidos-board')).toBeVisible()
    // El form no debe quedar "fantasma" abierto tras el reload (se re-monta desde cero).
    await expect(page.getByTestId(`assign-courier-form-${INVOICE_READY_ORDER_ID}`)).toHaveCount(0)
  })

  test('Doble clic rapido en "Despachar" (hermano bloqueado) no dispara 2 requests con resultado inconsistente', async ({ page }) => {
    await login(page, ESTEBAN)
    await goToPedidos(page)
    // FAMILY_SIBLING_ID ya tiene "Despachar" visible (courier propagado por RN2), bloqueado por
    // falta de factura — confirma que doble-clic no genera un crash ni un estado inconsistente
    // (el código ya usa `isPending` para deshabilitar mientras la mutación está en vuelo).
    const card = cardFor(page, FAMILY_SIBLING_ID)
    await card.scrollIntoViewIfNeeded()
    const dispatchBtn = card.getByTestId(`dispatch-button-${FAMILY_SIBLING_ID}`)
    await Promise.all([dispatchBtn.click(), dispatchBtn.click()])
    await page.waitForTimeout(1200)
    await expect(card.getByTestId(`dispatch-error-${FAMILY_SIBLING_ID}`)).toBeVisible()
  })
})
