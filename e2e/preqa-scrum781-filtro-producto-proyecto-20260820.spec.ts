import { test, expect, Page } from '@playwright/test'

// Pre-QA — SCRUM-781, punto 4.2 (REQ-247, "Mejora"): filtro de productos por proyecto en el
// buscador de "Productos reclamados/afectados" de Tickets. Verifica el único punto pendiente del
// ticket (los otros 8 ya se verificaron limpios el 2026-08-20 mismo,
// docs/pre-qa/scrum777-781-tecnicos-tickets-20260820.md).
//
// Fixture real sembrado en dev.atlanticerp.ai vía tinker (no existía en el entorno la cadena
// sales_project -> pipeline_card -> order(entregado) -> order_item -> catalog_product):
//   Cliente Master "PreQA SCRUM781 Filtro" -> Subcliente "PreQA SCRUM781 Subcliente"
//   -> Proyecto "PreQA SCRUM781 Proyecto" (id 166), con 1 Pedido ENTREGADO (order id 24) con 2
//   ítems: ICG-62272 (id 5201) e ICG-62270 (id 5199). Controles negativos, mismo texto de
//   búsqueda cada uno, NO entregados a este proyecto: ICG-62271 (id 5200) e ICG-62269 (id 5198).
//
// La regresión del punto 3 (ítem Producto de Cotización de Servicio NO debe filtrar por
// proyecto) se confirmó por curl directo contra la API real + lectura de código
// (ServiceQuoteModal.tsx / InsumoCreateModal.tsx llaman serviciosApi.lookup.products() sin el
// 3er argumento sales_project_id) — ver reporte de Pre-QA, no se repite acá vía UI.

test.describe.configure({ mode: 'serial' })

const EMAIL = 'servicio@atlantic.com.pa'

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(EMAIL)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

async function selectFixtureProject(page: Page) {
  await page.getByRole('button', { name: 'Cliente Master' }).click()
  await page.locator('input[type="text"]').last().fill('PreQA SCRUM781')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /PreQA SCRUM781 Filtro/i }).click()

  await page.getByRole('button', { name: 'Subcliente' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /PreQA SCRUM781 Subcliente/i }).click()

  await page.getByLabel('Proyecto').selectOption({ label: 'PreQA SCRUM781 Proyecto' })
}

async function openProductPickerAndAssertFiltered(
  page: Page, triggerName: RegExp, searchTerm: string, expectedRef: string,
) {
  await page.getByRole('button', { name: triggerName }).click()
  await expect(page.getByRole('heading', { name: /buscar producto en inventario/i })).toBeVisible()
  const searchInput = page.locator('input[type="text"]').last()
  await searchInput.fill(searchTerm)
  await page.waitForTimeout(700) // debounce de 250ms + round-trip real a dev.atlanticerp.ai

  const results = page.locator('ul li button')
  await expect(results).toHaveCount(1, { timeout: 10000 })
  await expect(results.first()).toContainText(expectedRef)
  return results.first()
}

let createdTicketId: string | null = null

test('crear ticket: buscador de productos filtra por proyecto tras elegir Cliente Master->Subcliente->Proyecto', async ({ page }) => {
  await login(page)
  await page.goto('/servicios/tickets')
  await page.getByRole('button', { name: /nuevo ticket/i }).click()
  await expect(page.getByRole('heading', { name: /nuevo ticket/i })).toBeVisible()

  await selectFixtureProject(page)
  const filteredResult = await openProductPickerAndAssertFiltered(
    page, /Buscar producto en inventario/i, 'lampara canasta', 'ICG-62272',
  )

  // Elegimos el único resultado filtrado — cierra el picker (mismo flujo real: pickProduct()
  // llama setActivePicker(null)) y de paso confirma que el producto filtrado es seleccionable.
  await filteredResult.click()
  await expect(page.getByText('ICG-62272')).toBeVisible()

  await page.getByPlaceholder('Ej: Apto 14B — Lobby').fill('PreQA SCRUM781 — filtro por proyecto')

  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/servicios/tickets') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Crear ticket' }).click(),
  ])
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  createdTicketId = String(body.id)
  expect(createdTicketId).toBeTruthy()
})

test('editar ticket recién creado: el buscador de productos aplica el mismo filtro (ticket.sales_project_id)', async ({ page }) => {
  test.skip(!createdTicketId, 'El test de creación no produjo un ticket id — ver test anterior')
  await login(page)
  await page.goto(`/servicios/tickets?ticket=${createdTicketId}`)
  // El heading muestra el folio (ej. "Ticket REC-2026-0007"), no el id numérico — solo
  // confirmamos que el modal cargó el ticket (no quedó en el estado "Cargando...").
  await expect(page.getByRole('heading', { name: /^Ticket /i })).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Editar' }).click()
  // Búsqueda distinta a la del primer test (ICG-62272 ya quedó agregado al ticket y por lo tanto
  // excluido del picker, RN3 no-duplicados — el segundo producto entregado al mismo proyecto,
  // ICG-62270, sembrado aparte para no confundir "excluido por ya agregado" con "excluido por
  // filtro de proyecto roto"). Control negativo: ICG-62269, mismo texto de búsqueda, NO entregado
  // a este proyecto.
  await openProductPickerAndAssertFiltered(
    page, /\+ ?Agregar producto/i, 'sal del himalaya', 'ICG-62270',
  )
})

test('ticket viejo sin proyecto (sales_project_id null): el buscador de productos sigue funcionando sin filtrar', async ({ page }) => {
  // Ticket real de dev.atlanticerp.ai, id 1 (INS-2026-0001, estado scheduled, sales_project_id NULL —
  // confirmado por API antes de este test: son tickets creados antes de Batch 3 parte 2, cuando
  // sales_project_id todavía no era obligatorio). Caso de borde explícito del checklist: el
  // picker no debe romperse ni quedar vacío por falta de proyecto.
  await login(page)
  await page.goto('/servicios/tickets?ticket=1')
  await expect(page.getByRole('heading', { name: /^Ticket /i })).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByRole('button', { name: /\+ ?Agregar producto/i }).click()
  await expect(page.getByRole('heading', { name: /buscar producto en inventario/i })).toBeVisible()

  const searchInput = page.locator('input[type="text"]').last()
  await searchInput.fill('lampara canasta')
  await page.waitForTimeout(700)

  // Sin sales_project_id, el picker debe comportarse como catálogo completo — AMBOS productos
  // con este texto de búsqueda deben aparecer, no solo el "entregado" (que ni siquiera aplica
  // acá, este ticket no tiene proyecto).
  const results = page.locator('ul li button')
  await expect(results).toHaveCount(2, { timeout: 10000 })
})

test('regresion: item Producto de Cotizacion de Servicio (ticket 25, OTRO proyecto) NO filtra por proyecto', async ({ page }) => {
  // Ticket real 25 (GAR-2026-0007) — sales_project_id=44 ("QA I Designer"), completamente
  // distinto del proyecto fixture (166) que sí tiene ICG-62272/ICG-62270 entregados. Si el ítem
  // Producto de Cotización quedara filtrado por accidente al proyecto del ticket, esta búsqueda
  // devolvería 0 resultados (proyecto 44 nunca tuvo ese producto entregado). El comportamiento
  // correcto es catálogo completo — mismos 2 resultados que sin ningún filtro.
  await login(page)
  await page.goto('/servicios/tickets?ticket=25')
  await expect(page.getByRole('heading', { name: /^Ticket /i })).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Borrador' }).click()
  await expect(page.getByRole('heading', { name: /cotizaci[oó]n/i }).first()).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: '+ Producto' }).click()
  await page.getByRole('button', { name: 'Elegir producto del catálogo' }).click()
  await expect(page.getByRole('heading', { name: /elegir producto del cat[aá]logo/i })).toBeVisible()

  const searchInput = page.locator('input[type="text"]').last()
  await searchInput.fill('lampara canasta')
  await page.waitForTimeout(700)

  const results = page.locator('ul li button')
  await expect(results).toHaveCount(2, { timeout: 10000 })
})
