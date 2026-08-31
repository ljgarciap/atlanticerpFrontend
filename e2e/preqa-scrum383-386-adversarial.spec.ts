import { test, expect } from '@playwright/test'

/**
 * SCRUM-383/384/385/386 — Pre-QA adversarial pass, SEGUNDA PASADA (2026-07-26 noche), sobre los
 * fixes que salieron de la primera pasada (misma fecha, ver `docs/pre-qa/
 * scrum383-386-picking-flow-2026-07-26.md`):
 *   1. CRÍTICO — `PickingService::startPicking()`/`updatePickingSheet()`/`completePicking()` ahora
 *      exigen `BodegaRoles::CAN_PICK` (Jefe/Asistentes/Picker, deliberadamente sin Courier).
 *   2. CRÍTICO — `OrderDetailModal` ahora tiene "Ver hoja de picking" (visible si `order.picker !==
 *      null`), único entry point para reabrir la hoja en modo solo lectura fuera de en_picking.
 *   3. MEDIO — el botón/form "Asignar Picker" en `OrderCardTile` ahora solo se muestra si
 *      `user.modules.bodega.view_team === true` (oculto para Picker/Repartidor).
 *
 * Los 3 tests de la primera pasada documentaban el estado ROTO (selector vacío pero visible, sin
 * entry point) — ya no aplican tal cual: se reescriben acá para confirmar el estado CORREGIDO.
 *
 * Fixtures sembrados a mano para esta pasada (`atlantic_bodega.orders`, ver reporte de la
 * tarea para el script `tinker` exacto) — IDs reales de esta corrida (cambian si se resetea el
 * schema de tenant, `infra/test.sh` comparte Postgres con Docker local, ver memoria
 * `feedback_local_test_db_no_es_fresh.md` — sembrados DESPUÉS del último `infra/test.sh` de la
 * sesión):
 *  - Order #34 "PED-PREQA2-A" — asignado, sin picker — RN3 (botón "Asignar Picker" oculto/visible)
 *  - Order #37 "PED-PREQA2-D" — en_picking, picker=Apolonio, 3 ítems (3/A-01, 2/B-02, 4/C-03) —
 *    picking parcial + edición de "Alistada"
 *  - Order #40 "PED-PREQA2-G" — packing, picker=Apolonio, 1 ítem ya completo — modo solo consulta
 *  - Order #41 "PED-PREQA2-H" — packing, SIN picker (sintético, forzado en BD) — botón ausente
 *
 * Igual que el resto de specs `preqa-*`: si el fixture no existe en el entorno, el test se salta
 * en vez de fallar en falso.
 */

const FIXTURES = { A: 34, D: 37, G: 40, H: 41 }

async function login(page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

/**
 * MEDIO corregido — el botón "Asignar Picker" ya no se renderiza para un actor sin
 * `modules.bodega.view_team` (Picker/Repartidor). Antes de este fix el botón SÍ aparecía, el
 * selector llegaba vacío (`useBodegaHomeTeam` gateado por `canViewTeamV2(BODEGA)`) y "Confirmar"
 * disparaba el error de "campo requerido" en vez del 403 real. Verifica también que el backend
 * sigue rechazando con 403 vía API directa (defensa en profundidad).
 */
test('SCRUM-383 RN3 (corregido) — el botón "Asignar Picker" no se muestra para un Picker, y el backend igual responde 403 vía API directa', async ({ page }) => {
  await login(page, 'ayudantegeneralbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)

  const card = page.getByTestId(`order-card-${FIXTURES.A}`)
  if ((await card.count()) === 0) {
    test.skip(true, `Fixture Order #${FIXTURES.A} (PED-PREQA2-A) no está sembrado en este entorno.`)
    return
  }
  await expect(card).toBeVisible()

  // Corregido: el botón "Asignar Picker" ya NO existe en el árbol para este rol.
  await expect(card.getByRole('button', { name: /asignar picker/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa2-01-boton-oculto-picker.png' })

  // Defensa en profundidad: el backend sigue rechazando con 403 real aunque el frontend ya
  // no ofrezca el camino de UI para llegar ahí.
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  const apiResponse = await page.request.post(`/api/bodega/orders/${FIXTURES.A}/assign-picker`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { picker_id: 15 },
  })
  expect(apiResponse.status()).toBe(403)
  const body = await apiResponse.json()
  expect(body.message).toMatch(/jefe de bodega|asistentes/i)
})

/** Regresión — el mismo botón SÍ debe seguir visible para un Jefe/Asistente (view_team=true). */
test('SCRUM-383 RN3 — regresión: el botón "Asignar Picker" sigue visible para el Jefe de Bodega', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)

  const card = page.getByTestId(`order-card-${FIXTURES.A}`)
  if ((await card.count()) === 0) {
    test.skip(true, `Fixture Order #${FIXTURES.A} (PED-PREQA2-A) no está sembrado en este entorno.`)
    return
  }
  await expect(card.getByRole('button', { name: /asignar picker/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa2-02-boton-visible-jefe.png' })
})

test('SCRUM-385/386 — picking parcial dispara Revisión de Inventario, edición de Alistada respeta tope', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)

  const card = page.getByTestId(`order-card-${FIXTURES.D}`)
  if ((await card.count()) === 0) {
    test.skip(true, `Fixture Order #${FIXTURES.D} (PED-PREQA2-D) no está sembrado en este entorno.`)
    return
  }
  await expect(card).toBeVisible()

  await card.getByTestId(`open-picking-sheet-button-${FIXTURES.D}`).click()
  await page.waitForTimeout(1000)
  const sheet = page.getByTestId('picking-sheet-modal')
  await expect(sheet).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa2-03-hoja-3-items.png', fullPage: true })

  const rows = sheet.locator('[data-testid^="picking-row-"]')
  await expect(rows).toHaveCount(3)

  // RN2 de REQ-315 — "Alistada" arranca bloqueada, sin botón "Editar" no hay input.
  await expect(sheet.locator('[data-testid^="picking-alistada-input-"]')).toHaveCount(0)
  await expect(sheet.locator('[data-testid^="picking-alistada-locked-"]').first()).toBeVisible()

  // Habilita edición del primer ítem (pedido = 3, ubicación A-01) e intenta poner un valor MAYOR a
  // lo pedido — el frontend debe topear en el máximo.
  const editButtons = sheet.locator('[data-testid^="picking-edit-btn-"]')
  await editButtons.nth(0).click()
  const qtyInputs = sheet.locator('[data-testid^="picking-alistada-input-"]')
  await qtyInputs.nth(0).fill('999')
  await qtyInputs.nth(0).blur()
  await page.waitForTimeout(500)
  await expect(qtyInputs.nth(0)).toHaveValue('3') // clampado a qty_requested
  await page.screenshot({ path: 'e2e/.tmp/preqa2-04-clamp-exceso.png' })

  // Reduce el primer ítem a 1 (de 3 pedidos) — picking parcial deliberado.
  await qtyInputs.nth(0).fill('1')
  await qtyInputs.nth(0).blur()
  await page.waitForTimeout(500)

  // RN1 de REQ-316 — marca "Recogido" en 1 de 3 e intenta completar: debe bloquear.
  const checkboxes = sheet.locator('[data-testid^="picking-recogido-"]')
  await checkboxes.nth(0).check()
  await page.getByTestId('picking-completado-checkbox').click()
  await expect(page.getByTestId('picking-completado-error')).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa2-05-bloqueado-2-faltantes.png' })

  await checkboxes.nth(1).check()
  await checkboxes.nth(2).check()
  await page.getByTestId('picking-completado-checkbox').click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa2-06-completado-con-review.png', fullPage: true })

  const banner = page.getByTestId('picking-completed-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/revisión de inventario/i)
})

/**
 * CRÍTICO corregido (SCRUM-385 Escenario 2) — antes de este fix NO existía ningún botón/link en
 * toda la SPA para reabrir la Hoja de Picking de un pedido ya en Packing+. Ahora `OrderDetailModal`
 * expone "Ver hoja de picking" cuando `order.picker !== null`, y se abre en modo solo lectura.
 * También confirma que el botón NO aparece para un pedido que nunca tuvo picker asignado (fixture
 * sintético, forzado directo en BD solo para ejercitar esta rama del render — el flujo real de
 * negocio no permite llegar a Packing sin pasar por asignación de picker).
 */
test('SCRUM-385 RN3 (corregido) — "Ver hoja de picking" reabre la hoja en modo solo lectura desde el detalle del pedido', async ({ page }) => {
  await login(page, 'liderbodega@test.com')
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)

  const cardG = page.getByTestId(`order-card-${FIXTURES.G}`)
  if ((await cardG.count()) === 0) {
    test.skip(true, `Fixture Order #${FIXTURES.G} (PED-PREQA2-G) no está sembrado en este entorno.`)
    return
  }

  // Orden #G — packing, CON picker asignado: el botón debe aparecer y abrir modo solo lectura.
  await cardG.locator('p').first().click()
  await page.waitForTimeout(1000)
  const pickingSheetLink = page.getByTestId('view-picking-sheet-button')
  await expect(pickingSheetLink).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/preqa2-07-detalle-con-link-hoja.png' })

  await pickingSheetLink.click()
  await page.waitForTimeout(1000)
  const reopenedSheet = page.getByTestId('picking-sheet-modal')
  await expect(reopenedSheet).toBeVisible()
  await expect(reopenedSheet).toContainText(/solo consulta/i)
  await expect(reopenedSheet.locator('[data-testid^="picking-recogido-"]')).toHaveCount(0)
  await expect(page.getByTestId('picking-completado-checkbox')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa2-08-hoja-solo-lectura.png', fullPage: true })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const closeButtons = page.getByText(/^cerrar$/i)
  if (await closeButtons.count() > 0) await closeButtons.first().click()
  await page.waitForTimeout(500)

  // Orden #H — packing, SIN picker asignado nunca (sintético): el botón no debe aparecer.
  await page.goto('/bodega/pedidos')
  await page.waitForTimeout(1200)
  const cardH = page.getByTestId(`order-card-${FIXTURES.H}`)
  if ((await cardH.count()) === 0) {
    test.skip(true, `Fixture Order #${FIXTURES.H} (PED-PREQA2-H) no está sembrado en este entorno.`)
    return
  }
  await cardH.locator('p').first().click()
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('view-picking-sheet-button')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/preqa2-09-sin-picker-sin-boton.png' })
})
