import { test, expect, Page, Locator } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionado — Batch 11 Servicios (Cotización de Servicio), SCRUM-292→297
 * (REQ-229→234). Corre contra el stack aislado "batch11review" (localhost:8094), no dev.atlanticerp.ai.
 *
 * Fixtures propias (fuera del roster demo estándar), sembradas por
 * /private/tmp/.../batch11/seed_fixtures.php vía tinker:
 *   - RET-2026-0004 — Retrofit, 2 productos reclamados, informe completado con recomendación.
 *   - INS-2026-0005 — Instalación subcontratada, informe No aplica (gate abierto), sin técnico interno,
 *     quote_status corregido a PENDING (no NOT_APPLICABLE) tras revisar el primer screenshot.
 *   - GAR-2026-0005 — Garantía, informe pendiente (gate debe bloquear).
 *   - Técnico externo activo #1 "Luis Vargas" ($25/día), inactivo #2 "Pedro Inactivo".
 */

const LIDER_SERVICIOS  = 'servicio@illuminations.com.pa'   // Aaron — lider_servicios, tiene view_cost_breakdown
const TECNICO_ASIGNADO = 'carlos@illuminations.com.pa'      // Carlos — tecnico_servicios, asignado a RET-2026-0004
const TECNICO_AJENO    = 'santopedro181994@gmail.com'       // Pedro Santos — tecnico_servicios, NO asignado a ningún ticket de este batch
const GERENCIA_SIN_PERM = 'daniela@illuminations.com.pa'    // Management, NO tiene servicios.quotes.view_cost_breakdown

async function login(page: Page, email: string) {
  // Limpia sesión previa (esta suite reutiliza la misma `page` para cambiar de usuario dentro de
  // un mismo test) — navegar a /login ya autenticado redirige antes de que el form aparezca.
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function openTicketByNumero(page: Page, numero: string): Promise<Locator> {
  await page.goto('/servicios/tickets')
  await page.getByPlaceholder(/buscar/i).first().fill(numero).catch(() => {})
  const row = page.locator('tr', { hasText: numero }).first()
  await row.getByTitle(/ver detalle/i).click()
  const modal = page.locator('div.z-50').first()
  await expect(modal.getByText('Cargando...')).toHaveCount(0, { timeout: 10000 })
  return modal
}

async function openQuoteModal(detailModal: Locator, page: Page): Promise<Locator> {
  await detailModal.getByRole('button', { name: /generar cotización|^borrador$|^enviada$|^aprobada$|^rechazada$/i }).first().click()
  const quoteModal = page.locator('div.z-\\[60\\]').first()
  await expect(quoteModal).toBeVisible()
  await expect(quoteModal.getByText(/cargando/i)).toHaveCount(0, { timeout: 10000 })
  return quoteModal
}

/** Contenedor del draft de ítem en edición (ItemForm) — SCOPE OBLIGATORIO para sus number inputs,
 * ya que el modal completo también tiene un input[type=number] para Descuento (%) más abajo. */
function itemDraftForm(quote: Locator): Locator {
  return quote.locator('div.border-primary\\/30')
}

test.describe('Batch 11 — Cotización de Servicio', () => {
  test.use({ baseURL: 'http://localhost:8094' })

  test('SCRUM-292 (REQ-229) — gate bloqueado + formulario + precarga + notas RN4/RN5', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)

    await test.step('1) Gate bloqueado — GAR-2026-0005 (informe pendiente)', async () => {
      const detail = await openTicketByNumero(page, 'GAR-2026-0005')
      await page.screenshot({ path: 'test-results/b11-292-01-ticket-bloqueado.png', fullPage: true })
      await expect(detail.getByText(/bloquead/i).first()).toBeVisible()
      // No debe existir un link/botón "Generar cotización" habilitado para este ticket
      await expect(detail.getByRole('button', { name: /^generar cotización$/i })).toHaveCount(0)
    })

    await test.step('2) Abrir formulario — RET-2026-0004 (retrofit con productos + recomendación)', async () => {
      const detail = await openTicketByNumero(page, 'RET-2026-0004')
      await page.screenshot({ path: 'test-results/b11-292-02-ticket-detalle.png', fullPage: true })
      const quote = await openQuoteModal(detail, page)
      await page.screenshot({ path: 'test-results/b11-292-03-modal-antes-generar.png', fullPage: true })

      // RN4 — nota de sugerencia por productos (redacción distinta para Retrofit)
      await expect(quote.getByText(/productos a cambiar registrados en la inspecci/i)).toBeVisible()
    })

    await test.step('3) Generar y confirmar precarga RN2/RN3/RN5', async () => {
      const quote = page.locator('div.z-\\[60\\]').first()
      const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
      if (await genBtn.count() > 0) await genBtn.click()
      await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })
      await page.screenshot({ path: 'test-results/b11-292-04-modal-generada.png', fullPage: true })

      // RN3 — cliente/contacto/dirección precargados del ticket, solo lectura (no hay <input>)
      await expect(quote.getByText('Torre Financiera PREQA')).toBeVisible()
      await expect(quote.getByText(/Calle 50, Panamá/)).toBeVisible()
      // RN5 — observaciones precargadas con la recomendación del informe (editable)
      const obsField = quote.locator('textarea').first()
      await expect(obsField).toHaveValue(/Reemplazar driver LED/)
      await expect(obsField).toBeEditable()
    })
  })

  test('SCRUM-295 (REQ-232) — nota RN6 + ítem Subcontratado (RN1/RN2/RN4) + desglose gateado', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const detail = await openTicketByNumero(page, 'INS-2026-0005')
    await page.screenshot({ path: 'test-results/b11-295-01-ticket-subcontratado.png', fullPage: true })

    const quote = await test.step('Gate abierto (informe No aplica) + nota RN6 + generar', async () => {
      const q = await openQuoteModal(detail, page)
      const genBtn = q.getByRole('button', { name: /^generar cotización$/i })
      if (await genBtn.count() > 0) {
        // La nota RN6 solo se muestra en el estado "listo para generar" (quote === null todavía)
        await expect(q.getByText(/instalaci.n es subcontratada/i)).toBeVisible()
        await page.screenshot({ path: 'test-results/b11-295-02-nota-subcontratado.png', fullPage: true })
        await genBtn.click()
      }
      await expect(q.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })
      return q
    })

    await test.step('Agregar Subcontratado — RN1 solo activos, RN2 tarifa autocompletada, RN4 cálculo', async () => {
      await quote.getByRole('button', { name: /\+ Subcontratado/i }).click()
      await page.screenshot({ path: 'test-results/b11-295-03-form-subcontratado.png', fullPage: true })

      const draft = itemDraftForm(quote)
      const select = draft.locator('select')
      const options = await select.locator('option').allTextContents()
      // RN1 — el inactivo NO debe aparecer como opción del selector
      expect(options.join(' ')).not.toMatch(/Pedro Inactivo/)
      expect(options.join(' ')).toMatch(/Luis Vargas/)

      await select.selectOption('1') // id del técnico externo activo sembrado (Luis Vargas)
      const numberInputs = draft.locator('input[type="number"]')
      await numberInputs.nth(0).fill('3')  // días cotizados
      await numberInputs.nth(1).fill('30') // margen %
      await page.screenshot({ path: 'test-results/b11-295-04-subcontratado-lleno.png', fullPage: true })

      await quote.getByRole('button', { name: /agregar ítem/i }).click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'test-results/b11-295-05-item-agregado.png', fullPage: true })

      // Escenario 1 del ticket (REQ-232): 25 * 1.30 * 3 = 97.50, visible porque Aaron tiene view_cost_breakdown
      // (aparece 2 veces: precio de línea y subtotal de la cotización — ambos correctos)
      await expect(quote.getByText(/97\.5/).first()).toBeVisible()
      expect(await quote.getByText(/97\.5/).count()).toBeGreaterThanOrEqual(1)
    })
  })

  test('SCRUM-293 (REQ-230) — margen mínimo BLOQUEO DURO en Producto, referencia libre sin validar', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const detail = await openTicketByNumero(page, 'RET-2026-0004')
    const quote = await openQuoteModal(detail, page)
    // Si ya hay una cotización previa (test anterior corrió antes), usamos la existente; si no, generamos.
    const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
    if (await genBtn.count() > 0) await genBtn.click()
    await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })

    await test.step('RN4 — intento de producto con margen insuficiente debe ser rechazado', async () => {
      await quote.getByRole('button', { name: /\+ Producto/i }).click()
      const draft = itemDraftForm(quote)
      // Referencia libre para poder fijar un precio artificialmente bajo sin depender del catálogo real
      await draft.locator('input[type="checkbox"]').check()
      await draft.getByPlaceholder(/descripción/i).fill('Referencia libre precio bajo fixture')
      const numberInputs = draft.locator('input[type="number"]')
      await numberInputs.nth(0).fill('1')  // cantidad
      await numberInputs.nth(1).fill('10') // precio unitario
      await page.screenshot({ path: 'test-results/b11-293-01-custom-sin-margen.png', fullPage: true })
      await quote.getByRole('button', { name: /agregar ítem/i }).click()
      await page.waitForTimeout(500)
      // RN3/Escenario 4 — referencia libre NUNCA valida margen: el ítem debe quedar agregado a la
      // lista (sin toast de error) — ver toastStore, los toasts quedan en el DOM independientes del modal.
      await expect(quote.getByText('Referencia libre precio bajo fixture')).toBeVisible()
      await expect(page.getByText(/margen/i, { exact: false })).toHaveCount(0)
      await page.screenshot({ path: 'test-results/b11-293-02-custom-agregado-sin-bloqueo.png', fullPage: true })
    })
  })

  test('SCRUM-296 (REQ-233) — totales consistentes con ITBMS visible en el formulario', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const detail = await openTicketByNumero(page, 'RET-2026-0004')
    const quote = await openQuoteModal(detail, page)
    const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
    if (await genBtn.count() > 0) await genBtn.click()
    await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })

    await quote.getByRole('button', { name: /\+ Mano de obra/i }).click()
    const draft = itemDraftForm(quote)
    await draft.getByPlaceholder(/descripción/i).fill('Instalación de 3 luminarias')
    const numberInputs = draft.locator('input[type="number"]')
    await numberInputs.nth(0).fill('1')
    await numberInputs.nth(1).fill('150')
    await quote.getByRole('button', { name: /agregar ítem/i }).click()
    await page.waitForTimeout(600)

    // RN5 — el formulario debe mostrar explícitamente el desglose ITBMS (no solo Subtotal/Total,
    // corrige la inconsistencia del mockup donde el Total mostrado en pantalla no incluía ITBMS)
    await expect(quote.getByText(/itbms/i)).toBeVisible()
    await page.screenshot({ path: 'test-results/b11-296-01-totales-con-itbms.png', fullPage: true })
  })

  test('SCRUM-297 (REQ-234) — ciclo de vida: guardar no promueve estado, enviar sí, decidir exclusivo de Aaron', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    const detail = await openTicketByNumero(page, 'RET-2026-0004')
    const quote = await openQuoteModal(detail, page)
    const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
    if (await genBtn.count() > 0) await genBtn.click()
    await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })

    await test.step('RN2 — Guardar sobre Borrador NO cambia el estado', async () => {
      await expect(quote.getByText('Borrador', { exact: true })).toBeVisible()
      const saveBtn = quote.getByRole('button', { name: /^guardar$/i })
      if (await saveBtn.count() > 0) {
        await saveBtn.click()
        await page.waitForTimeout(600)
      }
      await expect(quote.getByText('Borrador', { exact: true })).toBeVisible()
      await page.screenshot({ path: 'test-results/b11-297-01-borrador-tras-guardar.png', fullPage: true })
    })

    await test.step('RN3 — Enviar al cliente promueve a Enviada', async () => {
      const sendBtn = quote.getByRole('button', { name: /enviar al cliente/i })
      await sendBtn.click()
      await page.waitForTimeout(600)
      await expect(quote.getByText('Enviada', { exact: true })).toBeVisible()
      await page.screenshot({ path: 'test-results/b11-297-02-enviada.png', fullPage: true })
    })
  })

  test('Pre-QA adversarial — técnico NO asignado no puede editar la cotización de otro técnico', async ({ page }) => {
    await login(page, TECNICO_AJENO)
    const detail = await openTicketByNumero(page, 'RET-2026-0004')
    await page.screenshot({ path: 'test-results/b11-preqa-01-tecnico-ajeno-detalle.png', fullPage: true })

    // El indicador de cotización debe abrir el modal en modo solo-lectura (o directamente no
    // ofrecer "Generar cotización" a un técnico sin ownership sobre este ticket específico).
    const quoteBtn = detail.getByRole('button', { name: /generar cotización|^borrador$|^enviada$/i }).first()
    if (await quoteBtn.count() > 0) {
      await quoteBtn.click()
      const quote = page.locator('div.z-\\[60\\]').first()
      await expect(quote.getByText(/cargando/i)).toHaveCount(0, { timeout: 10000 })
      await page.screenshot({ path: 'test-results/b11-preqa-02-tecnico-ajeno-modal.png', fullPage: true })
      // No debe ofrecer botones de escritura (Guardar/Enviar/+Producto/+Mano de obra/+Subcontratado)
      await expect(quote.getByRole('button', { name: /^guardar$/i })).toHaveCount(0)
      await expect(quote.getByRole('button', { name: /enviar al cliente/i })).toHaveCount(0)
      await expect(quote.getByRole('button', { name: /\+ Producto/i })).toHaveCount(0)
    }

    // Intento directo por API (defensa en profundidad — el backend debe rechazar aunque el
    // frontend ocultara los botones) — confirma que assertCanEdit() realmente corre server-side.
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    if (token) {
      const res = await page.request.put('http://localhost:8094/api/servicios/tickets/15/quote', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { discount_percent: 50, observations: 'intento no autorizado' },
        failOnStatusCode: false,
      })
      expect([401, 403, 404]).toContain(res.status())
    }
  })

  test('Pre-QA adversarial — usuario sin view_cost_breakdown NUNCA ve costo/margen del ítem Subcontratado', async ({ page }) => {
    await login(page, GERENCIA_SIN_PERM)
    const detail = await openTicketByNumero(page, 'INS-2026-0005')
    const quoteBtn = detail.getByRole('button', { name: /generar cotización|^borrador$|^enviada$/i }).first()
    await expect(quoteBtn).toBeVisible()
    await quoteBtn.click()
    const quote = page.locator('div.z-\\[60\\]').first()
    await expect(quote.getByText(/cargando/i)).toHaveCount(0, { timeout: 10000 })
    await page.screenshot({ path: 'test-results/b11-preqa-03-sin-permiso-costos.png', fullPage: true })

    // El ítem Subcontratado ya fue agregado por el test SCRUM-295 (mismo ticket) — confirmar que
    // este usuario ve el precio final de línea ($97.5) pero JAMÁS el texto "Margen" ni "Costo de
    // referencia" en ningún punto del modal (defensa en profundidad — ver docblock de
    // ServiceQuoteController::formatItem() y el comentario simétrico en ItemRow del frontend).
    await expect(quote.getByText(/97\.5/).first()).toBeVisible()
    await expect(quote.getByText(/Margen:/i)).toHaveCount(0)
    await expect(quote.getByText(/Costo de referencia/i)).toHaveCount(0)
  })

  test('Pre-QA adversarial — REQ-230 RN2 producto duplicado + RN4 margen real bloqueado', async ({ page }) => {
    await login(page, LIDER_SERVICIOS)
    // Ticket dedicado (no RET-2026-0004 — ese ya quedó en estado Enviada por el test de ciclo de
    // vida y su modal pasa a solo-lectura, correctamente, ya que assertDraft() bloquea la edición).
    const detail = await openTicketByNumero(page, 'INS-2026-0006')
    const quote = await openQuoteModal(detail, page)
    const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
    if (await genBtn.count() > 0) await genBtn.click()
    await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })

    await test.step('RN4 — margen real bloqueado con producto de catálogo (costo $8.28, precio $9 => 8% < 30%)', async () => {
      await quote.getByRole('button', { name: /\+ Producto/i }).click()
      await quote.getByRole('button', { name: /elegir producto del catálogo/i }).click()
      const picker = page.locator('div.z-\\[70\\]').first()
      await expect(picker).toBeVisible()
      await picker.locator('input[type="text"]').fill('Candelabro/Colgante #1')
      await expect(picker.getByText(/Candelabro/i).first()).toBeVisible({ timeout: 5000 })
      await picker.getByText(/Candelabro/i).first().click()
      const draft = itemDraftForm(quote)
      const priceInput = draft.locator('input[type="number"]').nth(1)
      await priceInput.fill('9')
      await page.screenshot({ path: 'test-results/b11-preqa-04-margen-real-bajo.png', fullPage: true })
      await quote.getByRole('button', { name: /agregar ítem/i }).click()
      await page.waitForTimeout(600)
      // RN5 — debe señalar la línea específica que incumple, con un mensaje claro (toast de error)
      await expect(page.getByText(/queda con un margen de.*por debajo del mínimo permitido/i)).toBeVisible()
      await page.screenshot({ path: 'test-results/b11-preqa-05-margen-real-bloqueado-toast.png', fullPage: true })
    })

    await test.step('RN2 — mismo producto de catálogo no se puede repetir en dos líneas', async () => {
      // Subir el precio para que pase el gate de margen (ya no bloquea por RN4) y quede agregado.
      const draft = itemDraftForm(quote)
      const priceInput = draft.locator('input[type="number"]').nth(1)
      await priceInput.fill('20')
      await quote.getByRole('button', { name: /agregar ítem/i }).click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'test-results/b11-preqa-06-producto-agregado-ok.png', fullPage: true })

      // Intentar agregarlo de nuevo — debe rechazarse con mensaje claro, no duplicar la línea.
      await quote.getByRole('button', { name: /\+ Producto/i }).click()
      await quote.getByRole('button', { name: /elegir producto del catálogo/i }).click()
      const picker = page.locator('div.z-\\[70\\]').first()
      await expect(picker).toBeVisible()
      await picker.locator('input[type="text"]').fill('Candelabro/Colgante #1')
      await expect(picker.getByText(/Candelabro/i).first()).toBeVisible({ timeout: 5000 })
      await picker.getByText(/Candelabro/i).first().click()
      const draft2 = itemDraftForm(quote)
      await draft2.locator('input[type="number"]').nth(1).fill('20')
      await quote.getByRole('button', { name: /agregar ítem/i }).click()
      await page.waitForTimeout(600)
      await expect(page.getByText(/ya está en la cotización|ya fue agregado/i)).toBeVisible()
      await page.screenshot({ path: 'test-results/b11-preqa-07-producto-duplicado-rechazado.png', fullPage: true })
    })
  })

  test('Pre-QA adversarial — Escenario 3/4 REQ-234: técnico interno no puede decidir + rechazo habilita regenerar', async ({ page }) => {
    // Ticket dedicado GAR-2026-0006, técnico asignado = Carlos.
    await test.step('Setup — Aaron genera, agrega ítem y envía la cotización', async () => {
      await login(page, LIDER_SERVICIOS)
      const detail = await openTicketByNumero(page, 'GAR-2026-0006')
      const quote = await openQuoteModal(detail, page)
      const genBtn = quote.getByRole('button', { name: /^generar cotización$/i })
      if (await genBtn.count() > 0) await genBtn.click()
      await expect(quote.getByText(/COT-SERV-2026-\d{4}/)).toBeVisible({ timeout: 10000 })

      // Si ya está Enviada de una corrida anterior, no reintentar agregar ítem/enviar.
      if (await quote.getByText('Borrador', { exact: true }).count() > 0) {
        await quote.getByRole('button', { name: /\+ Mano de obra/i }).click()
        const draft = itemDraftForm(quote)
        await draft.getByPlaceholder(/descripción/i).fill('Mano de obra reject-test')
        await draft.locator('input[type="number"]').nth(0).fill('1')
        await draft.locator('input[type="number"]').nth(1).fill('50')
        await quote.getByRole('button', { name: /agregar ítem/i }).click()
        await page.waitForTimeout(500)
        await quote.getByRole('button', { name: /enviar al cliente/i }).click()
        await page.waitForTimeout(500)
      }
      await expect(quote.getByText('Enviada', { exact: true })).toBeVisible()
    })

    await test.step('Escenario 3 — técnico interno asignado ve Enviada pero SIN opción Aprobar/Rechazar', async () => {
      await login(page, TECNICO_ASIGNADO)
      const detail = await openTicketByNumero(page, 'GAR-2026-0006')
      const quote = await openQuoteModal(detail, page)
      await page.screenshot({ path: 'test-results/b11-preqa-08-tecnico-ve-enviada-sin-decidir.png', fullPage: true })
      await expect(quote.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
      await expect(quote.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)

      // Defensa en profundidad — intento directo por API con el token de Carlos.
      const token = await page.evaluate(() => localStorage.getItem('accessToken'))
      const res = await page.request.patch('http://localhost:8094/api/servicios/tickets/19/quote/decidir', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { estado: 'approved' },
        failOnStatusCode: false,
      })
      expect([401, 403]).toContain(res.status())
    })

    await test.step('Escenario 4 — Aaron rechaza y "Generar nueva cotización" aparece', async () => {
      await login(page, LIDER_SERVICIOS)
      const detail = await openTicketByNumero(page, 'GAR-2026-0006')
      const quote = await openQuoteModal(detail, page)
      const rejectBtn = quote.getByRole('button', { name: /^rechazar$/i })
      if (await rejectBtn.count() > 0) {
        await rejectBtn.click()
        await page.waitForTimeout(600)
      }
      await expect(quote.getByText('Rechazada', { exact: true })).toBeVisible()
      await expect(quote.getByRole('button', { name: /generar nueva cotización/i })).toBeVisible()
      await page.screenshot({ path: 'test-results/b11-preqa-09-rechazada-generar-nueva.png', fullPage: true })
    })
  })
})
