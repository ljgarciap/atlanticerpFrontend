import { test, expect } from '@playwright/test'

/**
 * SCRUM-383/384/385/386 (REQ-313/314/315/316) — flujo real de punta a punta contra Docker local:
 * asignar picker -> iniciar picking -> abrir Hoja de Picking -> marcar recogido todos los
 * artículos -> completar picking -> verificar que avanza a Packing -> (Pre-QA 2026-07-26, CRÍTICO)
 * reabrir esa misma Hoja de Picking YA en Packing desde el nuevo entry point del detalle del
 * pedido, y confirmar que se ve en modo solo lectura.
 *
 * Corre contra un fixture real sembrado a mano (Order #42, "PED-E2E-PICK-01", 2 artículos,
 * `atlantic_bodega.orders`/`order_items` en Docker local, ver reporte de la tarea para el
 * script exacto) — mismo patrón que el resto de specs `preqa-*` del proyecto (fixtures reales, no
 * mocks). Se promueve a test permanente (regla del proyecto: un smoke test que verifica un
 * gate/flujo de estado no se borra) — si el fixture #42 ya no existe en el entorno donde corre
 * esto, el test se salta explícitamente en vez de fallar en falso.
 *
 * El caso de "reabrir en modo solo lectura" (Pre-QA 2026-07-26) vive DENTRO de este mismo test,
 * no como un `test()` separado — `playwright.config.ts` tiene `fullyParallel: true`, así que 2
 * tests del mismo archivo pueden correr en workers distintos sin orden garantizado; encadenar
 * "reabrir #42 ya en Packing" como test aparte asumiría que el test de arriba ya corrió y mutó
 * el fixture, lo cual `fullyParallel` no garantiza. Continuar linealmente dentro del mismo test
 * es la única forma segura de reusar el estado que el propio test acaba de crear.
 */

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test('SCRUM-383→386 — asignar picker, iniciar picking, completar la Hoja de Picking y avanzar a Packing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  await login(page, 'almacen@atlantic.com.pa')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)

  const card = page.getByTestId('order-card-42')
  if ((await card.count()) === 0) {
    test.skip(true, 'Fixture Order #42 (PED-E2E-PICK-01) no está sembrado en este entorno — ver reporte de la tarea para recrearlo.')
    return
  }
  await expect(card).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-01-asignado.png', fullPage: true })

  // SCRUM-383 (REQ-313 RN1) — no se puede avanzar sin elegir picker.
  await card.getByRole('button', { name: /asignar picker/i }).click()
  const form = page.getByTestId('assign-picker-form-42')
  await expect(form).toBeVisible()
  await page.getByTestId('assign-picker-confirm-42').click()
  await expect(page.getByTestId('assign-picker-required-error-42')).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-02-picker-required.png' })

  // Elige a Apolonio González (único Picker real sembrado, `ayudante_general_bodega`) y confirma.
  await page.getByTestId('assign-picker-select-42').selectOption({ label: 'Apolonio Gonzalez' })
  await page.getByTestId('assign-picker-confirm-42').click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e/.tmp/scrum383-03-picking-pendiente.png', fullPage: true })

  // La tarjeta se movió a "Picking pendiente" — REQ-313 RN2, la etiqueta "Picking: Apolonio..."
  // ya la pinta `OrderCardTile` (código no tocado por este batch).
  await expect(page.getByTestId('order-card-42')).toContainText('Apolonio')

  // SCRUM-384 (REQ-314) — "Iniciar Picking" mueve a "En picking" y abre la Hoja de Picking.
  await page.getByTestId('start-picking-button-42').click()
  await page.waitForTimeout(1200)
  const sheet = page.getByTestId('picking-sheet-modal')
  await expect(sheet).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-04-hoja-picking-abierta.png', fullPage: true })

  // SCRUM-385 (REQ-315) — 2 artículos reales del fixture, ordenados por ubicación por el backend
  // (A-01 antes que B-02) — no se reordena en frontend.
  await expect(sheet).toContainText('Foco LED E2E')
  await expect(sheet).toContainText('Lampara colgante E2E')
  const rows = sheet.locator('[data-testid^="picking-row-"]')
  await expect(rows).toHaveCount(2)
  const firstRowText = await rows.nth(0).innerText()
  expect(firstRowText).toContain('Foco LED E2E') // A-01 antes que B-02

  // Pre-QA 2026-07-27 — el gap de contrato original ("Ref. fábrica"/"Observación" nunca
  // implementadas en el frontend pese a que SCRUM-385 las pedía) se cerró: ambas columnas
  // existen ahora (backend `d6555a2`, frontend cableado en la misma sesión de Pre-QA).
  await expect(sheet).toContainText('Ref. fábrica')
  await expect(sheet).toContainText('Observación')

  // SCRUM-386 (REQ-316 RN1) — no permite completar sin marcar TODOS los "Recogido". El checkbox
  // "Picking completado" es un disparador de un solo uso (nunca queda visualmente marcado si el
  // intento se rechaza, ver `PickingSheetModal.tsx`) — se usa `.click()` en vez de `.check()`
  // (que esperaría el estado `checked` resultante, y fallaría a propósito acá).
  const checkboxes = sheet.locator('[data-testid^="picking-recogido-"]')
  await checkboxes.nth(0).check()
  await page.getByTestId('picking-completado-checkbox').click()
  await expect(page.getByTestId('picking-completado-error')).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-05-completado-bloqueado.png' })

  // Marca el segundo también — ahora sí puede completar. Deja las cantidades por defecto
  // (= lo pedido, RN de "se asume que se recoge todo") sin editar ningún "Alistada".
  await checkboxes.nth(1).check()
  await page.getByTestId('picking-completado-checkbox').click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/scrum383-06-completado.png', fullPage: true })

  // REQ-316 RN2 — picking completo (sin faltantes) avanza directo a Packing, sin Revisión de
  // Inventario (esa UI es un ticket propio, fuera de este batch — ver reporte).
  await expect(page.getByTestId('picking-completed-banner')).toContainText(/avanzó a packing/i)

  await page.getByText(/^cerrar$/i).first().click()
  await page.waitForTimeout(800)

  // La tarjeta ya no está en Asignado/Picking pendiente/En picking — quedó en Packing.
  await page.reload()
  await page.waitForTimeout(1200)
  const cardInPacking = page.getByTestId('order-card-42')
  await expect(cardInPacking).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-07-en-packing.png', fullPage: true })

  // Pre-QA 2026-07-26 (CRÍTICO, SCRUM-385 Escenario 2) — antes de este fix no existía NINGÚN
  // punto de entrada para volver a ver la Hoja de Picking de un pedido que ya avanzó de etapa
  // (`OrderCardTile` solo la ofrece en picking_pendiente/en_picking). Abre el detalle del pedido
  // (clic en el número de pedido, no en la fila de acciones — esa tiene `stopPropagation`) y
  // confirma el nuevo botón "Ver hoja de picking".
  await cardInPacking.locator('p').first().click()
  const pickingSheetLink = page.getByTestId('view-picking-sheet-button')
  await expect(pickingSheetLink).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum383-08-detalle-con-link-hoja.png' })

  await pickingSheetLink.click()
  await page.waitForTimeout(1000)
  const reopenedSheet = page.getByTestId('picking-sheet-modal')
  await expect(reopenedSheet).toBeVisible()

  // RN3 (REQ-315) — modo solo lectura: sin checkbox "Recogido" ni checkbox "Picking completado".
  await expect(reopenedSheet).toContainText('Solo consulta')
  await expect(reopenedSheet.locator('[data-testid^="picking-recogido-"]')).toHaveCount(0)
  await expect(page.getByTestId('picking-completado-checkbox')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum383-09-hoja-picking-solo-lectura.png', fullPage: true })

  expect(errors).toEqual([])
})
