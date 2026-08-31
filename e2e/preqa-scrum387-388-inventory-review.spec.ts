import { test, expect } from '@playwright/test'

/**
 * SCRUM-387/388 (REQ-317/318) — Pre-QA 2026-07-27. Nace del rebote de marly.rangel a
 * SCRUM-387/388 (2026-07-26): "no puedo probarlo por UI, el botón de esta etapa está
 * DESHABILITADO". La causa real era más profunda — `OrderCardTile` disparaba SIEMPRE
 * `start-picking` para toda tarjeta `picking_pendiente`, incluso las de
 * `order_type=revision_inventario` (hubiera llamado la mutación equivocada de haber estado
 * habilitado). Este batch corrige eso y agrega el `InventoryReviewModal` que faltaba.
 *
 * Fixtures sembrados a mano (`atlantic_bodega.orders`, tinker — ver reporte de la tarea).
 * IDs reales de esta corrida (cambian si se resetea el schema de tenant o si se re-ejecuta el
 * archivo completo — RN1/RN2/RN3 CONSUMEN la orden "asignado" de origen, dejan la tarjeta de
 * Revisión resuelta; correr el archivo 2 veces sin re-sembrar hace que esos 3 tests se salten):
 *  - Order "...-01" — asignado, 2 ítems (qty=2 c/u) — usado para generar, vía el flujo real de
 *    picking, una tarjeta de Revisión con 2 ítems shortfall (escenario RN3 mixto).
 *  - Order #44 "PED-PREQA387B-02" — asignado, 1 ítem (qty=1) — usado para generar una Revisión de
 *    1 ítem (escenario RN2, nada encontrado).
 *  - Order #45 "PED-PREQA387B-03" — asignado, 1 ítem (qty=1) — usado para generar una Revisión de
 *    1 ítem (escenario RN1, todo encontrado).
 *  - Order #46 "PED-PREQA387B-04" — picking_pendiente, order_type=pedido (NORMAL, no revisión) —
 *    control de no-regresión: debe seguir mostrando "Iniciar Picking", nunca "Revisar Inventario"
 *    (este test SÍ hace clic real en "Iniciar Picking", mutando el fixture a en_picking).
 *  - Order #47 "PED-PREQA387B-05" — picking_pendiente, order_type=pedido — dedicado a las
 *    verificaciones de solo-lectura de rol (Picker/Courier), nunca se le hace clic, para no
 *    depender del orden de ejecución con el fixture #46 de arriba.
 *
 * Igual que el resto de specs `preqa-*`: si el fixture no existe en este entorno, el test se
 * salta en vez de fallar en falso (schemas de tenant se resetean con `infra/test.sh`).
 */

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

/** Lleva una orden de "Asignado" a una tarjeta de Revisión de Inventario real, vía el mismo
 * camino que usaría un picker real: Asignar Picker -> Iniciar Picking -> marcar "Recogido" con
 * cantidad reducida (shortfall) -> Completar. Devuelve el id de la tarjeta de revisión generada.
 *
 * `orderNumber` (no `.first()` sobre CUALQUIER "Revisar Inventario" del tablero) — el board es
 * compartido entre los 3 tests de este archivo (`test.describe.configure({ mode: 'serial' })`
 * los corre uno a la vez para evitar pisarse el fixture, pero aun en serie pueden quedar 2+
 * tarjetas de revisión visibles al mismo tiempo si un test previo no las resolvió del todo) —
 * hay que anclar a la tarjeta que comparte `order_number` con la orden recién procesada. */
async function driveToInventoryReview(page, orderId: number, orderNumber: string, pickedQtys: number[]): Promise<number> {
  const card = page.getByTestId(`order-card-${orderId}`)
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /asignar picker/i }).click()
  await page.getByTestId(`assign-picker-select-${orderId}`).selectOption({ label: 'Ayudante General Bodega Test' })
  await page.getByTestId(`assign-picker-confirm-${orderId}`).click()
  await page.waitForTimeout(900)

  await page.getByTestId(`start-picking-button-${orderId}`).click()
  await page.waitForTimeout(900)
  const sheet = page.getByTestId('picking-sheet-modal')
  await expect(sheet).toBeVisible()

  const rows = sheet.locator('[data-testid^="picking-row-"]')
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const testId = await row.getAttribute('data-testid')
    const itemId = testId!.replace('picking-row-', '')
    if (pickedQtys[i] !== undefined) {
      await sheet.getByTestId(`picking-edit-btn-${itemId}`).click()
      await sheet.getByTestId(`picking-alistada-input-${itemId}`).fill(String(pickedQtys[i]))
      await sheet.getByTestId(`picking-alistada-input-${itemId}`).blur()
      await page.waitForTimeout(400)
    }
    await sheet.getByTestId(`picking-recogido-${itemId}`).check()
  }
  await sheet.getByTestId('picking-completado-checkbox').click()
  await page.waitForTimeout(1200)
  await expect(page.getByTestId('picking-completed-banner')).toContainText(/revisión de inventario/i)
  await page.getByText(/^cerrar$/i).first().click()
  await page.waitForTimeout(800)
  await page.reload()
  await page.waitForTimeout(1200)

  const reviewCard = page.locator('[data-testid^="order-card-"]').filter({ hasText: orderNumber }).filter({ has: page.locator('[data-testid^="review-inventory-button-"]') })
  await expect(reviewCard).toBeVisible()
  const reviewButton = reviewCard.locator('[data-testid^="review-inventory-button-"]')
  const reviewTestId = await reviewButton.getAttribute('data-testid')
  return Number(reviewTestId!.replace('review-inventory-button-', ''))
}

// El board de Bodega es un fixture compartido — los tests de generación de Revisión
// (RN1/RN2/RN3) mutan el mismo tablero y podrían pisarse bajo `fullyParallel: true` (default de
// `playwright.config.ts`). Serial evita falsos positivos/negativos por carrera entre workers.
test.describe.configure({ mode: 'serial' })

test.describe('SCRUM-387/388 — Revisión de Inventario', () => {
  test('control de no-regresión — tarjeta picking_pendiente NORMAL sigue mostrando "Iniciar/Continuar Picking", nunca "Revisar Inventario"', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    const card = page.getByTestId('order-card-46')
    if ((await card.count()) === 0) {
      test.skip(true, 'Fixture Order #46 (PED-PREQA387B-04) no está sembrado en este entorno.')
      return
    }
    await expect(card.getByTestId('start-picking-button-46')).toBeVisible()
    await expect(card.getByTestId('review-inventory-button-46')).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa387-00-control-normal.png' })

    // Confirma que efectivamente dispara start-picking (no la mutación de revisión) — abre la
    // Hoja de Picking normal, editable.
    await card.getByTestId('start-picking-button-46').click()
    await page.waitForTimeout(900)
    await expect(page.getByTestId('picking-sheet-modal')).toBeVisible()
  })

  test('rol Picker (ayudante_general_bodega) — el botón "Revisar Inventario" no aparece nunca, y el endpoint responde 403 directo', async ({ page }) => {
    await login(page, 'ayudantegeneralbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    // Fixture #47 (dedicado, distinto de #46) — #46 se usa en el test anterior para hacer clic
    // real en "Iniciar Picking", lo que muta su stage a en_picking; reusarlo acá haría que este
    // test dependiera del orden de ejecución. #47 se deja intacto (solo lectura de botones).
    const card = page.getByTestId('order-card-47')
    if ((await card.count()) === 0) {
      test.skip(true, 'Fixture Order #47 (PED-PREQA387B-05) no está sembrado en este entorno.')
      return
    }
    // El Picker SÍ debe seguir viendo "Iniciar Picking" (BodegaRoles::CAN_PICK lo incluye a
    // propósito, es su trabajo real) — el gate de `canOperatePicking` es exclusivo de "Revisar
    // Inventario"/"Asignar Picker", no de todo el flujo de picking.
    await expect(card.getByTestId('review-inventory-button-47')).toHaveCount(0)
    await expect(card.getByTestId('start-picking-button-47')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-01-picker-sin-boton-revision.png' })

    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    const apiResponse = await page.request.post('/api/bodega/orders/47/resolve-inventory-review', {
      headers: { Authorization: `Bearer ${token}` },
      data: { decisions: [{ order_item_id: 1, found: true, location: 'X-01' }] },
    })
    expect(apiResponse.status()).toBe(403)
  })

  test('rol Courier/Repartidor (transporte) — el botón "Revisar Inventario" no aparece nunca, y el endpoint responde 403 directo', async ({ page }) => {
    await login(page, 'transporte@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    const card = page.getByTestId('order-card-47')
    if ((await card.count()) === 0) {
      test.skip(true, 'Fixture Order #47 (PED-PREQA387B-05) no está sembrado en este entorno.')
      return
    }
    await expect(card.getByTestId('review-inventory-button-47')).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/preqa387-02-courier-sin-boton.png' })

    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    const apiResponse = await page.request.post('/api/bodega/orders/47/resolve-inventory-review', {
      headers: { Authorization: `Bearer ${token}` },
      data: { decisions: [{ order_item_id: 1, found: true, location: 'X-01' }] },
    })
    expect(apiResponse.status()).toBe(403)
  })

  test('SCRUM-387 + RN1 — picking parcial genera la Revisión, y "todo encontrado" la manda directo a En picking sin volver a la cola', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    if ((await page.getByTestId('order-card-45').count()) === 0) {
      test.skip(true, 'Fixture Order #45 (PED-PREQA387B-03) no está sembrado en este entorno.')
      return
    }

    const reviewId = await driveToInventoryReview(page, 45, 'PED-PREQA387B-03', [0])
    await page.screenshot({ path: 'e2e/.tmp/preqa387-03-rn1-review-generada.png', fullPage: true })

    await page.getByTestId(`review-inventory-button-${reviewId}`).click()
    await page.waitForTimeout(900)
    const modal = page.getByTestId('inventory-review-modal')
    await expect(modal).toBeVisible()

    // Ruptura — confirmar con una fila en "Pendiente" debe bloquear con mensaje claro.
    await page.getByTestId('inventory-review-confirm').click()
    await expect(page.getByTestId('inventory-review-general-error')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-04-rn1-bloqueo-pendiente.png' })

    const row = modal.locator('[data-testid^="inventory-review-status-"]').first()
    const rowTestId = await row.getAttribute('data-testid')
    const itemId = rowTestId!.replace('inventory-review-status-', '')

    // Ruptura — "Sí hay" con ubicación vacía debe bloquear antes de pegarle al backend.
    await row.selectOption('si')
    await page.getByTestId('inventory-review-confirm').click()
    await expect(page.getByTestId(`inventory-review-location-error-${itemId}`)).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-05-rn1-ubicacion-vacia-bloqueo.png' })

    // Ruptura — ubicación solo con espacios en blanco también debe bloquear (trim en frontend).
    await modal.getByTestId(`inventory-review-location-${itemId}`).fill('   ')
    await page.getByTestId('inventory-review-confirm').click()
    await expect(page.getByTestId(`inventory-review-location-error-${itemId}`)).toBeVisible()

    await modal.getByTestId(`inventory-review-location-${itemId}`).fill('D-04-B')
    await page.getByTestId('inventory-review-confirm').click()
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('inventory-review-confirmed-banner')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-06-rn1-confirmado.png', fullPage: true })

    await page.getByText(/^cerrar$/i).first().click()
    await page.waitForTimeout(800)
    await page.reload()
    await page.waitForTimeout(1200)

    // RN1 — la tarjeta pasó directo a En picking, sin volver a "Picking pendiente".
    await expect(page.getByTestId(`review-inventory-button-${reviewId}`)).toHaveCount(0)
    await expect(page.getByTestId(`open-picking-sheet-button-${reviewId}`)).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-07-rn1-en-picking.png', fullPage: true })
  })

  test('SCRUM-388 RN2 — "nada encontrado" mueve la tarjeta a Asignado marcada sin stock', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    if ((await page.getByTestId('order-card-44').count()) === 0) {
      test.skip(true, 'Fixture Order #44 (PED-PREQA387B-02) no está sembrado en este entorno.')
      return
    }

    const reviewId = await driveToInventoryReview(page, 44, 'PED-PREQA387B-02', [0])
    await page.getByTestId(`review-inventory-button-${reviewId}`).click()
    await page.waitForTimeout(900)
    const modal = page.getByTestId('inventory-review-modal')
    await expect(modal).toBeVisible()

    const row = modal.locator('[data-testid^="inventory-review-status-"]').first()
    await row.selectOption('no')
    await page.getByTestId('inventory-review-confirm').click()
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('inventory-review-confirmed-banner')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-08-rn2-confirmado.png', fullPage: true })

    await page.getByText(/^cerrar$/i).first().click()
    await page.waitForTimeout(800)
    await page.reload()
    await page.waitForTimeout(1200)

    const card = page.getByTestId(`order-card-${reviewId}`)
    await expect(card).toBeVisible()
    await expect(card).toContainText(/sin stock/i)
    await page.screenshot({ path: 'e2e/.tmp/preqa387-09-rn2-sin-stock.png', fullPage: true })
  })

  test('SCRUM-388 RN3 — escenario mixto genera 2 tarjetas (En picking + Asignado sin stock) SIN recargar manualmente', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    if ((await page.getByTestId('order-card-62').count()) === 0) {
      test.skip(true, 'Fixture Order #62 (PED-PREQA387F-01) no está sembrado en este entorno.')
      return
    }

    const reviewId = await driveToInventoryReview(page, 62, 'PED-PREQA387F-01', [0, 0])
    await page.getByTestId(`review-inventory-button-${reviewId}`).click()
    await page.waitForTimeout(900)
    const modal = page.getByTestId('inventory-review-modal')
    await expect(modal).toBeVisible()

    const rows = modal.locator('[data-testid^="inventory-review-status-"]')
    await expect(rows).toHaveCount(2)
    const firstTestId = await rows.nth(0).getAttribute('data-testid')
    const firstItemId = firstTestId!.replace('inventory-review-status-', '')
    const secondTestId = await rows.nth(1).getAttribute('data-testid')
    const secondItemId = secondTestId!.replace('inventory-review-status-', '')

    await rows.nth(0).selectOption('si')
    await modal.getByTestId(`inventory-review-location-${firstItemId}`).fill('A-01-B')
    await rows.nth(1).selectOption('no')

    // Ruptura — doble clic rápido en "Confirmar revisión": la mutación debe quedar disabled tras
    // el primer clic (resolveReview.isPending), un segundo request no debería salir. Se cuenta
    // vía `page.route` en vez de un segundo `.click()` normal — Playwright bloquearía ese segundo
    // clic hasta que el botón vuelva a estar "enabled y stable", lo que anula la condición de
    // carrera que se quiere ejercitar; `dispatchEvent('click')` dispara el evento DOM crudo sin
    // esperar actionability, igual que un doble clic real de mouse haría.
    let resolveRequestCount = 0
    await page.route('**/resolve-inventory-review', route => { resolveRequestCount++; route.continue() })
    const confirmBtn = page.getByTestId('inventory-review-confirm')
    await confirmBtn.click()
    await confirmBtn.dispatchEvent('click').catch(() => {})
    await page.waitForTimeout(1200)
    expect(resolveRequestCount).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('inventory-review-confirmed-banner')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa387-10-rn3-confirmado.png', fullPage: true })

    await page.getByText(/^cerrar$/i).first().click()
    await page.waitForTimeout(1500) // sin reload manual — depende de invalidación de query

    // La familia queda en 3 tarjetas, no 2 — la original (id 56, ya en Packing desde que se
    // completó el picking, REQ-317 RN1: "la original SIEMPRE continúa a Packing") + las 2 que
    // genera la resolución de la Revisión (REQ-318 RN3): una En picking (lo encontrado) y otra
    // Asignado+sin stock (lo no encontrado). Las 3 comparten `customer_name`/`order_number` y se
    // confirman "Parte N de 3" — acotado a `order-card-*` (no `getByText` a secas) porque el
    // mismo texto también aparece como `<option>` oculta en selects de otras tarjetas del board.
    const orderCards = page.locator('[data-testid^="order-card-"]')
    const mixtoCards = orderCards.filter({ hasText: 'PreQA387F Cliente Mixto' })
    await expect(mixtoCards).toHaveCount(3, { timeout: 5000 })
    await expect(mixtoCards.filter({ has: page.locator('[data-testid^="open-picking-sheet-button-"]') })).toBeVisible()
    await expect(mixtoCards.filter({ hasText: /sin stock/i })).toBeVisible()
    // El orden de las 3 en el board no está garantizado — confirma que las 3 etiquetas
    // "Parte N de 3" existen entre las 3 tarjetas, sin asumir cuál aparece primero en el DOM.
    await expect(mixtoCards).toContainText(['de 3', 'de 3', 'de 3'])
    await page.screenshot({ path: 'e2e/.tmp/preqa387-11-rn3-tres-tarjetas-sin-reload.png', fullPage: true })
  })

  test('recargar con el modal de Revisión abierto a mitad de llenado no rompe al reabrir', async ({ page }) => {
    await login(page, 'liderbodega@test.com')
    await page.goto('/bodega/pedidos')
    await page.waitForTimeout(1200)

    const reviewButton = page.locator('[data-testid^="review-inventory-button-"]').first()
    if ((await reviewButton.count()) === 0) {
      test.skip(true, 'No hay ninguna tarjeta de Revisión de Inventario pendiente en este entorno.')
      return
    }
    const testId = await reviewButton.getAttribute('data-testid')
    const reviewId = testId!.replace('review-inventory-button-', '')

    await reviewButton.click()
    await page.waitForTimeout(700)
    const modal = page.getByTestId('inventory-review-modal')
    await expect(modal).toBeVisible()
    const row = modal.locator('[data-testid^="inventory-review-status-"]').first()
    await row.selectOption('si')

    await page.reload()
    await page.waitForTimeout(1200)

    // El modal no persiste tras el reload (esperable, no hay guardado de borrador) — pero la
    // tarjeta original sigue intacta y se puede reabrir limpio, sin quedar en un estado roto.
    await expect(page.getByTestId('inventory-review-modal')).toHaveCount(0)
    const cardAfterReload = page.getByTestId(`review-inventory-button-${reviewId}`)
    if ((await cardAfterReload.count()) > 0) {
      await cardAfterReload.click()
      await page.waitForTimeout(700)
      await expect(page.getByTestId('inventory-review-modal')).toBeVisible()
      const rowAfter = page.locator('[data-testid^="inventory-review-status-"]').first()
      await expect(rowAfter).toHaveValue('pendiente')
    }
    await page.screenshot({ path: 'e2e/.tmp/preqa387-12-reload-a-medio-llenado.png' })
  })
})
