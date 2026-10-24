import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — batch SCRUM-873, 874, 894, 909, 911, 912 (2026-09-13) contra https://dev.atlanticerp.ai.
 * NUNCA localhost/en paralelo con otro Pre-QA (ver feedback_preqa_crowdsec_no_paralelo).
 * Foco: caminos de ruptura de cada criterio de aceptación, no solo el camino feliz.
 */

const DEV = 'https://dev.atlanticerp.ai'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${DEV}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

async function apiGet(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const token = localStorage.getItem('accessToken')
    const res = await fetch(p, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: res.ok ? await res.json() : null }
  }, path)
}

// ============================================================
// SCRUM-912 — Nueva cotizacion no persiste huerfana + Solo Borradores
// ============================================================

test('SCRUM-912.a — abrir Nueva cotizacion, no tocar nada, navegar afuera: no debe crear registro', async ({ page }) => {
  await login(page, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')

  const before = await apiGet(page, '/api/ventas-diseno/quotes?per_page=1')
  const totalBefore = before.body?.meta?.total ?? before.body?.total ?? null
  console.log('SCRUM-912.a total ANTES:', totalBefore, JSON.stringify(before.body?.meta ?? {}))

  const createRequests: string[] = []
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/api/ventas-diseno/quotes') && !req.url().includes('save-draft')) {
      createRequests.push(req.url())
    }
  })

  await page.goto(`${DEV}/ventas-diseno/quotes`)
  await page.waitForTimeout(2500)
  await expect(page.getByText(/^Cotización$/).first()).toBeVisible({ timeout: 10000 })

  // Salir sin tocar nada — navegación directa (mas agresivo que un boton "volver").
  await page.goto(`${DEV}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(2000)

  const after = await apiGet(page, '/api/ventas-diseno/quotes?per_page=1')
  const totalAfter = after.body?.meta?.total ?? after.body?.total ?? null
  console.log('SCRUM-912.a total DESPUES:', totalAfter, 'POST /quotes disparados:', createRequests.length)

  expect(createRequests.length, 'no debe haber disparado ningun POST de creacion sin tocar nada').toBe(0)
  expect(totalAfter, 'el total de cotizaciones no debe aumentar').toBe(totalBefore)
})

test('SCRUM-912.b — tipear 1 caracter y borrar rapido, salir: verificar si queda huerfano semi-vacio', async ({ page }) => {
  await login(page, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')

  const before = await apiGet(page, '/api/ventas-diseno/quotes?per_page=1')
  const totalBefore = before.body?.meta?.total ?? before.body?.total ?? null

  await page.goto(`${DEV}/ventas-diseno/quotes`)
  await page.waitForTimeout(2000)

  // Campo Descripcion (texto libre, no dispara busquedas de cliente).
  const descInput = page.locator('input[type="text"]').nth(0)
  await descInput.click()
  await descInput.type('x', { delay: 50 })
  await page.waitForTimeout(300)
  await descInput.fill('')
  await page.waitForTimeout(2000)

  const url = page.url()
  console.log('SCRUM-912.b URL tras tipear+borrar:', url)

  await page.goto(`${DEV}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(2000)
  const after = await apiGet(page, '/api/ventas-diseno/quotes?per_page=1')
  const totalAfter = after.body?.meta?.total ?? after.body?.total ?? null
  console.log('SCRUM-912.b total ANTES/DESPUES:', totalBefore, totalAfter)
})

test('SCRUM-912.c — vista Solo Borradores existe y responde', async ({ page }) => {
  await login(page, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')
  await page.goto(`${DEV}/ventas-diseno/quotes-list`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/scrum912c-list-all.png', fullPage: true }).catch(() => {})

  const draftsTab = page.getByText(/solo borradores/i).first()
  await expect(draftsTab).toBeVisible({ timeout: 8000 })
  await draftsTab.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/scrum912c-list-drafts.png', fullPage: true }).catch(() => {})

  const resp = await apiGet(page, '/api/ventas-diseno/quotes?view=drafts&per_page=50')
  console.log('SCRUM-912.c drafts view status/count:', resp.status, resp.body?.data?.length)
})

// ============================================================
// SCRUM-873 — Cotizaciones: no-Lead al crear Cliente Master+Subcliente, contacto ok, Arquitecto opcional
// ============================================================

test('SCRUM-873.1/2 — crear Cliente Master+Subcliente nuevos desde Cotizacion: sin Lead duplicado, contacto sin error prematuro', async ({ page }) => {
  await login(page, 'vendedordisenador5@test.com', 'vendedordisenador5@test.com')

  const suffix = Date.now().toString().slice(-6)
  const masterName = `PREQA MASTER ${suffix}`
  const subName = `PREQA SUB ${suffix}`

  await page.goto(`${DEV}/ventas-diseno/quotes`)
  await page.waitForTimeout(2000)

  // Abrir picker de Cliente Master, escribir nombre nuevo, elegir "+ Crear cliente".
  const masterInput = page.locator('label:text-is("Cliente Master") + input').first()
  await masterInput.click()
  await masterInput.fill(masterName)
  await page.waitForTimeout(700)
  await page.getByText('+ Crear cliente', { exact: true }).click()
  await page.waitForTimeout(800)

  // Modal CreateClientModal (mode=client) abierto — escopar todo a su contenedor propio
  // (fixed inset-0 z-50) para no matchear por accidente el mismo campo "RUC"/"Razón Social"
  // que existe detras, en el formulario principal de la cotizacion.
  const masterModal = page.locator('div.fixed.z-50', { hasText: 'Crear cliente' })
  await expect(masterModal.getByText('Guardar cliente')).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'test-results/scrum873-modal-master.png' }).catch(() => {})

  await masterModal.locator('label:has-text("Razón Social") + input').fill(`${masterName} SA`)
  await masterModal.locator('label:has-text("RUC") + input').fill(`RUC-${suffix}`)
  // Contacto obligatorio: nombre + (telefono o email).
  await masterModal.getByPlaceholder('Nombre').first().fill('Contacto PreQA')
  await masterModal.getByPlaceholder(/correo|email/i).first().fill(`preqa${suffix}@example.com`)

  await masterModal.getByRole('button', { name: 'Guardar cliente' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/scrum873-after-master-saved.png' }).catch(() => {})
  await expect(masterModal).toHaveCount(0, { timeout: 8000 })

  // Ahora crear Subcliente nuevo del Master recien creado.
  const subInput = page.locator('label:text-is("Subcliente") + input').first()
  await subInput.click()
  await subInput.fill(subName)
  await page.waitForTimeout(700)
  await page.getByText('+ Nuevo subcliente', { exact: true }).click()
  await page.waitForTimeout(800)

  const subModal = page.locator('div.fixed.z-50', { hasText: 'Nuevo subcliente' })
  await expect(subModal.getByText('Guardar subcliente')).toBeVisible({ timeout: 8000 })

  await subModal.locator('label:has-text("Razón Social") + input').fill(subName)
  await subModal.locator('label:has-text("RUC") + input').fill(`RUC-SUB-${suffix}`)
  await subModal.getByPlaceholder('Nombre').first().fill('Contacto Sub PreQA')
  await subModal.getByPlaceholder(/correo|email/i).first().fill(`preqasub${suffix}@example.com`)

  await subModal.getByRole('button', { name: 'Guardar subcliente' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/scrum873-after-sub-saved.png' }).catch(() => {})
  await expect(subModal).toHaveCount(0, { timeout: 8000 })

  // Criterio 2 — el mensaje "Guarda la cotización antes de agregar contactos..." NO debe aparecer.
  const bodyText = await page.locator('body').innerText()
  const hasBlockingMsg = /todavía no está guardado/i.test(bodyText)
  console.log('SCRUM-873.2 — mensaje "Subcliente no guardado" presente:', hasBlockingMsg)
  expect(hasBlockingMsg, 'no debe aparecer el mensaje de "Subcliente todavía no está guardado"').toBe(false)

  // Criterio 3 — Arquitecto opcional: hint visible, guardar borrador sin llenarlo no bloquea.
  await expect(page.getByText('(incluir arquitecto si va a comisionar)')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.waitForTimeout(1500)
  const bodyAfterSave = await page.locator('body').innerText()
  const hasValidationBlock = /falta|obligatorio|architect/i.test(bodyAfterSave) && !/Guardado/i.test(bodyAfterSave)
  await page.screenshot({ path: 'test-results/scrum873-after-draft-save.png' }).catch(() => {})
  console.log('SCRUM-873.3 — guardado con Arquitecto vacio, mensaje de bloqueo visible:', hasValidationBlock)

  // Criterio 1 (re-chequeo tras el guardado real) — NO se creó ningún Lead con el nombre del
  // Master/Subcliente nuevos, ni antes ni despues de persistir la cotizacion via save-draft.
  const leadsMaster = await apiGet(page, `/api/ventas-diseno/pipeline?search=${encodeURIComponent(masterName)}`)
  const leadsSub    = await apiGet(page, `/api/ventas-diseno/pipeline?search=${encodeURIComponent(subName)}`)
  console.log('SCRUM-873.1 — pipeline cards encontradas para Master:', leadsMaster.body?.data?.length, 'para Sub:', leadsSub.body?.data?.length)
  expect(leadsMaster.body?.data?.length ?? 0, 'no debe existir ningun Lead/tarjeta de Pipeline para el Cliente Master nuevo').toBe(0)
  expect(leadsSub.body?.data?.length ?? 0, 'no debe existir ningun Lead/tarjeta de Pipeline para el Subcliente nuevo').toBe(0)
})

// ============================================================
// SCRUM-874 — Fecha estimada de entrega en Lead/Diseño/Cotización (y regresion en Propuesta)
// ============================================================

async function testDeliveryTypeToggle(page: Page, cardId: number, stageLabel: string) {
  test.setTimeout(60000)
  await page.goto(`${DEV}/ventas-diseno/pipeline?card=${cardId}`)
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.waitForTimeout(500)

  const select = page.locator('label:text-is("Fecha estimada de entrega")').locator('xpath=following-sibling::select[1]')
  await expect(select).toBeVisible({ timeout: 8000 })

  // 1) Seleccionar "Única" -> debe aparecer 1 input de fecha.
  await select.selectOption({ label: 'Única' })
  await page.waitForTimeout(400)
  let dateInputs = page.locator('input[type="date"]')
  await expect(dateInputs).toHaveCount(1, { timeout: 5000 })
  console.log(`SCRUM-874 [${stageLabel}] Única -> 1 input de fecha: OK`)

  // 2) Completar la fecha y Guardar -> sin error.
  await dateInputs.nth(0).fill('2027-01-15')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `test-results/scrum874-${stageLabel}-after-save-unica.png` }).catch(() => {})
  let bodyText = await page.locator('body').innerText()
  const hadErrorAfterFilled = /error|falló|invalido/i.test(bodyText) && !/Guardado/i.test(bodyText)
  console.log(`SCRUM-874 [${stageLabel}] guardar con fecha Única completa -> error visible:`, hadErrorAfterFilled)
  console.log(`SCRUM-874 [${stageLabel}] URL tras guardar Unica:`, page.url())

  // 3) Reabrir edicion, cambiar a "Parcial" -> deben aparecer >=2 inputs de fecha.
  // Si el modal se cerro solo (invalidacion de la lista no deberia cerrarlo, pero por las dudas
  // reabrimos por URL si "Editar" no aparece de entrada).
  if (!(await page.getByRole('button', { name: 'Editar' }).isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log(`SCRUM-874 [${stageLabel}] modal se cerro tras Guardar -> reabriendo por URL`)
    await page.goto(`${DEV}/ventas-diseno/pipeline?card=${cardId}`)
    await page.waitForTimeout(2000)
  }
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.waitForTimeout(400)
  const select2 = page.locator('label:text-is("Fecha estimada de entrega")').locator('xpath=following-sibling::select[1]')
  await select2.selectOption({ label: 'Parcial' })
  await page.waitForTimeout(400)
  dateInputs = page.locator('input[type="date"]')
  const partialCount = await dateInputs.count()
  console.log(`SCRUM-874 [${stageLabel}] Parcial -> inputs de fecha visibles:`, partialCount)
  expect(partialCount, 'Parcial debe mostrar al menos 2 campos de fecha').toBeGreaterThanOrEqual(2)

  // 4) Revertir a "-" (vacio) SIN completar las fechas parciales, e intentar guardar: no debe
  //    quedar ningun error de validacion atascado (criterio explicito del ticket).
  const select3 = page.locator('label:text-is("Fecha estimada de entrega")').locator('xpath=following-sibling::select[1]')
  await select3.selectOption({ label: '—' })
  await page.waitForTimeout(300)
  dateInputs = page.locator('input[type="date"]')
  await expect(dateInputs).toHaveCount(0, { timeout: 5000 })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.waitForTimeout(1200)
  bodyText = await page.locator('body').innerText()
  const stuckError = /error|falló|invalido|obligator/i.test(bodyText)
  console.log(`SCRUM-874 [${stageLabel}] revertir a vacio y guardar -> error atascado:`, stuckError)
  expect(stuckError, `[${stageLabel}] revertir Parcial a vacio y guardar no debe dejar error atascado`).toBe(false)

  await page.screenshot({ path: `test-results/scrum874-${stageLabel}-final.png` }).catch(() => {})
}

test('SCRUM-874 — Lead: deliveryType single/partial/blank sin error atascado', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const leads = await apiGet(page, '/api/ventas-diseno/pipeline?scope=team')
  const leadCard = (leads.body?.data ?? []).find((c: { stage: string }) => c.stage === 'lead')
  console.log('SCRUM-874 Lead card elegida:', leadCard?.id, leadCard?.name)
  test.skip(!leadCard, 'no se encontro ninguna tarjeta en etapa Lead en todo el equipo')
  if (leadCard) await testDeliveryTypeToggle(page, leadCard.id, 'lead')
})

test('SCRUM-874 — Cotización: deliveryType single/partial/blank sin error atascado', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const cards = await apiGet(page, '/api/ventas-diseno/pipeline?scope=team')
  const quoteCard = (cards.body?.data ?? []).find((c: { stage: string }) => c.stage === 'quote')
  console.log('SCRUM-874 Cotizacion card elegida:', quoteCard?.id, quoteCard?.name)
  test.skip(!quoteCard, 'no se encontro ninguna tarjeta en etapa Cotizacion en todo el equipo')
  if (quoteCard) await testDeliveryTypeToggle(page, quoteCard.id, 'quote')
})

test('SCRUM-874 — Propuesta: regresion, comportamiento debe seguir igual (sin cambios)', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const cards = await apiGet(page, '/api/ventas-diseno/pipeline?scope=team')
  const proposalCard = (cards.body?.data ?? []).find((c: { stage: string }) => c.stage === 'proposal')
  console.log('SCRUM-874 Propuesta card elegida:', proposalCard?.id, proposalCard?.name)
  test.skip(!proposalCard, 'no se encontro ninguna tarjeta en etapa Propuesta en todo el equipo')
  if (proposalCard) await testDeliveryTypeToggle(page, proposalCard.id, 'proposal')
})

// ============================================================
// SCRUM-909 — Asignar productos a entrega: exploracion de datos reales
// ============================================================

test('SCRUM-909.explore — buscar tarjetas con delivery_type=partial y su tabla de asignacion', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const cards = await apiGet(page, '/api/ventas-diseno/pipeline?scope=team')
  const all = cards.body?.data ?? []
  console.log('SCRUM-909.explore total cards:', all.length)
  const partials = all.filter((c: { delivery_type?: string }) => c.delivery_type === 'partial')
  console.log('SCRUM-909.explore cards con delivery_type=partial:', partials.map((c: { id: number; stage: string }) => `${c.id}(${c.stage})`))

  // Ninguna tarjeta tiene hoy delivery_type=partial — buscar candidatas en etapas avanzadas
  // (quote/proposal/approved) que YA tengan una cotizacion generada con items, para elegir una
  // y setearle delivery_type=partial manualmente via la UI.
  const candidates = all.filter((c: { stage: string }) => ['quote', 'proposal', 'approved'].includes(c.stage))
  console.log('SCRUM-909.explore candidatas quote/proposal/approved:', candidates.length)
  const withItems: number[] = []
  for (const c of candidates.slice(0, 25)) {
    const rows = await apiGet(page, `/api/ventas-diseno/pipeline/${c.id}/product-delivery-assignments`)
    if ((rows.body?.data?.length ?? 0) > 0) withItems.push(c.id)
  }
  console.log('SCRUM-909.explore cards con items de cotizacion ya generada:', withItems)

  for (const id of withItems) {
    const detail = await apiGet(page, `/api/ventas-diseno/pipeline/${id}`)
    const rows = await apiGet(page, `/api/ventas-diseno/pipeline/${id}/product-delivery-assignments`)
    const items = rows.body?.data ?? []
    const shortItem = items.find((r: { quantity_available: number | null; quantity_ordered: number }) => r.quantity_available !== null && r.quantity_available < r.quantity_ordered)
    if (shortItem) {
      console.log(`>>> card ${id} stage=${detail.body?.stage} owner=${detail.body?.owner?.name} tiene un item con faltante:`, JSON.stringify(shortItem), 'total items:', items.length)
    }
  }

  for (const c of partials.slice(0, 8)) {
    const detail = await apiGet(page, `/api/ventas-diseno/pipeline/${c.id}`)
    const rows = await apiGet(page, `/api/ventas-diseno/pipeline/${c.id}/product-delivery-assignments`)
    console.log(
      `card ${c.id} stage=${c.stage} delivery_dates=${JSON.stringify(detail.body?.delivery_dates)}`,
      `rows=${rows.status}`,
      JSON.stringify(rows.body?.data?.map((r: { code: string; quantity_ordered: number; quantity_available: number | null; assigned_delivery_date: string | null; suggested_delivery_date: string | null }) => ({
        code: r.code, ordered: r.quantity_ordered, avail: r.quantity_available, assigned: r.assigned_delivery_date, suggested: r.suggested_delivery_date,
      }))),
    )
  }
})

test('SCRUM-909 — flujo completo: boton, modal, preseleccion, edicion, y gate de Aprobado (card 164)', async ({ page }) => {
  test.setTimeout(90000)
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const CARD_ID = 164

  // Reset defensivo: una corrida previa pudo haber dejado esta tarjeta en delivery_type=partial.
  await page.evaluate(async (id) => {
    const token = localStorage.getItem('accessToken')
    await fetch(`/api/ventas-diseno/pipeline/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_type: null, delivery_dates: [] }),
    })
  }, CARD_ID)

  // Estado inicial: sin delivery_type -> boton NO debe aparecer.
  await page.goto(`${DEV}/ventas-diseno/pipeline?card=${CARD_ID}`)
  await page.waitForTimeout(2000)
  await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toHaveCount(0)
  console.log('SCRUM-909 — sin deliveryType: boton ausente OK')

  await page.getByRole('button', { name: 'Editar' }).click()
  await page.waitForTimeout(400)

  // Probar "Única" primero -> boton tampoco debe aparecer.
  const select = page.locator('label:text-is("Fecha estimada de entrega")').locator('xpath=following-sibling::select[1]')
  await select.selectOption({ label: 'Única' })
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toHaveCount(0)
  console.log('SCRUM-909 — con deliveryType=Unica: boton ausente OK')

  // Cambiar a "Parcial" con 2 fechas futuras reales.
  await select.selectOption({ label: 'Parcial' })
  await page.waitForTimeout(300)
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill('2027-02-01')
  await dateInputs.nth(1).fill('2027-03-15')
  await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toBeVisible()
  console.log('SCRUM-909 — con deliveryType=Parcial (sin guardar): boton visible OK')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.waitForTimeout(1200)

  // Reabrir si el modal se cerro solo (mismo comportamiento visto en SCRUM-874).
  if (!(await page.getByRole('button', { name: 'Asignar productos a entrega' }).isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.goto(`${DEV}/ventas-diseno/pipeline?card=${CARD_ID}`)
    await page.waitForTimeout(2000)
  }
  await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toBeVisible({ timeout: 8000 })

  // Abrir el modal de asignacion.
  await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/scrum909-modal-open.png' }).catch(() => {})

  const table = page.locator('table')
  await expect(table.getByRole('columnheader', { name: 'Código' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Nombre' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Pedido' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Disponible' })).toBeVisible()
  console.log('SCRUM-909 — columnas de la tabla del modal: OK')

  // Fila de QA-CAB-003 (quantity_available=0 < quantity_ordered=7) debe venir preseleccionada
  // con la fecha MAS LEJANA (2027-03-15), no la mas cercana.
  const row = table.locator('tr', { hasText: 'QA-CAB-003' });
  await expect(row).toBeVisible()
  const rowSelect = row.locator('select')
  const preselected = await rowSelect.inputValue()
  console.log('SCRUM-909 — preseleccion para QA-CAB-003 (esperado 2027-03-15):', preselected)
  expect(preselected).toBe('2027-03-15')

  // El select solo debe ofrecer las 2 fechas parciales definidas (+ "sin asignar").
  const options = await rowSelect.locator('option').allTextContents()
  console.log('SCRUM-909 — opciones del selector de fecha:', options)
  expect(options.some(o => o.includes('2027-02-01'))).toBe(true)
  expect(options.some(o => o.includes('2027-03-15'))).toBe(true)
  expect(options.length).toBe(3) // "Sin asignar" + las 2 fechas parciales, ninguna otra.

  // Editable: cambiar la preseleccion a la otra fecha.
  await rowSelect.selectOption({ label: '2027-02-01' })
  await expect(rowSelect).toHaveValue('2027-02-01')
  console.log('SCRUM-909 — preseleccion editable manualmente: OK')

  // Cerrar SIN guardar (dejar el resto de items sin asignar) y verificar que "Mover a Aprobado"
  // queda bloqueado.
  await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await page.waitForTimeout(600)
  const moveBtn = page.getByRole('button', { name: 'Mover a Aprobado' })
  await expect(moveBtn).toBeVisible()
  await expect(moveBtn).toBeDisabled()
  await expect(page.getByText('Asigná una fecha de entrega a todos los productos antes de aprobar el proyecto.')).toBeVisible()
  console.log('SCRUM-909 — gate de Aprobado CON items sin asignar: boton deshabilitado + aviso visible OK')

  // Ahora asignar TODOS los items y confirmar que el gate se libera.
  await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
  await page.waitForTimeout(800)
  const allSelects = page.locator('table select')
  const count = await allSelects.count()
  for (let i = 0; i < count; i++) {
    const val = await allSelects.nth(i).inputValue()
    if (!val) await allSelects.nth(i).selectOption({ index: 1 }) // primera fecha real disponible
  }
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/scrum909-all-assigned.png' }).catch(() => {})

  const moveBtnAfter = page.getByRole('button', { name: 'Mover a Aprobado' })
  await expect(moveBtnAfter).toBeVisible({ timeout: 8000 })
  await expect(moveBtnAfter).toBeEnabled()
  console.log('SCRUM-909 — gate de Aprobado CON todos los items asignados: boton habilitado OK')

  // Criterio 4 — aprobar de verdad y confirmar que Bodega recibe SOLO los productos
  // asignados a cada fecha (nunca la lista completa) en cada tarjeta parcial resultante.
  const assignmentsBefore = await apiGet(page, `/api/ventas-diseno/pipeline/${CARD_ID}/product-delivery-assignments`)
  const assignedByDate: Record<string, string[]> = {}
  for (const r of assignmentsBefore.body?.data ?? []) {
    const d = r.assigned_delivery_date
    if (!d) continue
    assignedByDate[d] = assignedByDate[d] ?? []
    assignedByDate[d].push(r.code)
  }
  console.log('SCRUM-909 — asignacion por fecha antes de aprobar:', JSON.stringify(assignedByDate))

  await moveBtnAfter.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/scrum909-approved.png' }).catch(() => {})

  const cardDetail = await apiGet(page, `/api/ventas-diseno/pipeline/${CARD_ID}`)
  console.log('SCRUM-909 — stage tras aprobar:', cardDetail.body?.stage)

  const orders = await apiGet(page, `/api/bodega/orders?search=${encodeURIComponent(cardDetail.body?.name ?? '')}`)
  const orderRows = orders.body?.data ?? []
  console.log('SCRUM-909 — pedidos de Bodega generados:', orderRows.length, JSON.stringify(orderRows.map((o: { id: number; folio?: string; family_position?: string }) => o)))

  for (const o of orderRows) {
    const detail = await apiGet(page, `/api/bodega/orders/${o.id}`)
    const codes = (detail.body?.items ?? []).map((i: { catalog_product_ref?: string; code?: string; reference?: string }) => i.code ?? i.reference ?? i.catalog_product_ref)
    console.log(`SCRUM-909 — pedido ${o.id} items:`, JSON.stringify(codes))
  }
})

// ============================================================
// SCRUM-894 — Guia de Entrega refleja qty_delivered real, nunca el pedido completo
// ============================================================

test('SCRUM-894 — Guia de Entrega: buscar PED-2026-0049 y validar cantidades reales', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')

  const search = await apiGet(page, '/api/bodega/orders?search=PED-2026-0049')
  const target = (search.body?.cards ?? [])[0]
  console.log('SCRUM-894 — PED-2026-0049 encontrado:', !!target, target?.id, target?.stage)

  if (target) {
    const detail = await apiGet(page, `/api/bodega/orders/${target.id}`)
    const items = detail.body?.items ?? []
    console.log('SCRUM-894 — items del pedido (ref/qty_requested/qty_delivered):', JSON.stringify(
      items.map((i: { reference?: string | null; qty_requested?: number; qty_delivered?: number }) => ({ ref: i.reference, req: i.qty_requested, del: i.qty_delivered })),
    ))

    await page.goto(`${DEV}/bodega/pedidos`)
    await page.waitForTimeout(2500)
    const cardOnBoard = page.getByText('PED-2026-0049').first()
    if (await cardOnBoard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cardOnBoard.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'test-results/scrum894-order-detail.png' }).catch(() => {})

      const guiaBtn = page.getByRole('button', { name: /generar guía y registrar entrega|ver guía|guía de entrega/i }).first()
      if (await guiaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await guiaBtn.click()
        await page.waitForTimeout(1500)
        await page.screenshot({ path: 'test-results/scrum894-guia-modal.png' }).catch(() => {})
        const bodyText = await page.locator('body').innerText()
        console.log('SCRUM-894 — BARRA-COC-601 aparece en la Guia renderizada (no debería, si qty_delivered=0):', /BARRA-COC-601/.test(bodyText))
      } else {
        console.log('SCRUM-894 — boton de Guia de Entrega no visible (posible stage != Packing/PorDespachar)')
      }
    } else {
      console.log('SCRUM-894 — tarjeta PED-2026-0049 no visible en el tablero con los filtros default')
    }
  }

  // Verificacion de codigo/diseño (independiente de si el caso original sigue vivo en dev):
  // buscar CUALQUIER pedido real con al menos un item en qty_delivered=0 pero qty_requested>0,
  // y confirmar que la Guia de Entrega generada para ese pedido no listaria ese item con cantidad
  // > 0 (server-side, via el propio JSON de detalle que alimenta la plantilla).
  const board = await apiGet(page, '/api/bodega/orders?chip=sin_stock')
  const candidates = (board.body?.cards ?? []).slice(0, 10)
  console.log('SCRUM-894 — candidatos adicionales (chip sin_stock):', candidates.length)
  for (const c of candidates) {
    const d = await apiGet(page, `/api/bodega/orders/${c.id}`)
    const zeroItems = (d.body?.items ?? []).filter((i: { qty_requested?: number; qty_delivered?: number }) => (i.qty_requested ?? 0) > 0 && (i.qty_delivered ?? 0) === 0)
    if (zeroItems.length > 0) {
      console.log(`SCRUM-894 — pedido ${c.id} (${c.order_number ?? c.folio}) stage=${c.stage} tiene ${zeroItems.length} item(s) en qty_delivered=0 -> deberian quedar excluidos de su Guia de Entrega`)
    }
  }
})

test('SCRUM-894.b — Guia de Entrega: layout general con un pedido real en Por Despachar+', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')

  let target = null
  for (const stage of ['por_despachar', 'despachado', 'entregado']) {
    const res = await apiGet(page, `/api/bodega/orders?estado=${stage}`)
    const cards = res.body?.cards ?? []
    if (cards.length > 0) { target = cards[0]; console.log('SCRUM-894.b usando pedido', target.id, target.order_number, 'stage', stage); break }
  }
  test.skip(!target, 'no se encontro ningun pedido en por_despachar/despachado/entregado en dev')
  if (!target) return

  const detail = await apiGet(page, `/api/bodega/orders/${target.id}`)
  const items = detail.body?.items ?? []
  const zeroQty = items.filter((i: { qty_requested?: number; qty_delivered?: number }) => (i.qty_requested ?? 0) > (i.qty_delivered ?? 0))
  console.log('SCRUM-894.b items totales:', items.length, 'items con qty_delivered < qty_requested:', zeroQty.length)
  console.log('SCRUM-894.b detalle completo de items:', JSON.stringify(items.map((i: { reference?: string | null; description?: string | null; qty_requested?: number; qty_delivered?: number }) => ({ ref: i.reference, desc: i.description, req: i.qty_requested, del: i.qty_delivered }))))

  await page.goto(`${DEV}/bodega/pedidos`)
  await page.waitForTimeout(2500)
  const orderText = target.order_number ?? `#${target.id}`
  const cardEl = page.getByText(orderText).first()
  if (await cardEl.isVisible({ timeout: 5000 }).catch(() => false)) {
    // "Ver guía" vive directamente en la tarjeta del tablero (stopPropagation, no abre el
    // detalle) — no hace falta entrar al detalle del pedido primero.
    const guiaBtn = page.getByRole('button', { name: 'Ver guía' }).first()
    if (await guiaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guiaBtn.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'test-results/scrum894b-guia-real.png' }).catch(() => {})
      const modalBody = page.locator('div.fixed', { hasText: 'GUÍA DE ENTREGA' })
      await modalBody.locator('table').scrollIntoViewIfNeeded().catch(() => {})
      await page.screenshot({ path: 'test-results/scrum894b-guia-real-table.png' }).catch(() => {})
      const tableText = await modalBody.locator('table').innerText().catch(() => 'NO TABLE FOUND')
      console.log('SCRUM-894.b — tabla de items renderizada:\n' + tableText)
      const bodyText = await page.locator('body').innerText()
      console.log('SCRUM-894.b — layout: tiene "CORREO":', /correo/i.test(bodyText), 'tiene "CANTIDAD":', /cantidad/i.test(bodyText), 'tiene "ESTADO DE LA ENTREGA":', /estado de la entrega/i.test(bodyText))
      // Ninguna cantidad mostrada en la guia debe exceder qty_delivered real de ningun item.
      for (const i of items) {
        if ((i.qty_delivered ?? 0) === 0 && i.reference) {
          const stillShown = bodyText.includes(i.reference)
          console.log(`SCRUM-894.b — item ${i.reference} (qty_delivered=0) aparece en la guia renderizada:`, stillShown)
        }
      }
    } else {
      console.log('SCRUM-894.b — boton Guia de Entrega no encontrado para este pedido')
    }
  } else {
    console.log('SCRUM-894.b — tarjeta no visible en el tablero (posible filtro por defecto)')
  }
})

// ============================================================
// SCRUM-911 — Reportes Servicios: filtro general sincroniza panel Tecnico Servicios Test
// ============================================================

test('SCRUM-911 — filtro general sincroniza el panel, navegacion local del panel no afecta al general', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  await page.goto(`${DEV}/servicios/reportes`)
  await page.waitForTimeout(2500)

  const commissionHeading = page.getByText(/comisión.*carlos vergara/i).first()
  const visible = await commissionHeading.isVisible().catch(() => false)
  test.skip(!visible, 'panel Comision Tecnico Servicios Test no visible para este usuario/entorno')
  if (!visible) return

  // Selector general de la pagina — 1er <select> visible en la pantalla.
  const generalSelect = page.locator('select').first()
  const initialGeneral = await generalSelect.inputValue()
  console.log('SCRUM-911 — selector general inicial:', initialGeneral)

  // Tomar nota del mes mostrado en la tarjeta de Comision (span distintivo min-w-[130px] junto
  // a las flechas de navegacion local, unico en toda la pagina).
  const monthLabel = page.locator('span.min-w-\\[130px\\]').first()
  const panelMonthBefore = await monthLabel.innerText().catch(() => '')
  console.log('SCRUM-911 — mes mostrado en panel Tecnico Servicios Test ANTES:', panelMonthBefore)

  // Cambiar el selector GENERAL a una opcion distinta.
  const options = await generalSelect.locator('option').all()
  let targetValue = initialGeneral
  for (const opt of options) {
    const v = await opt.getAttribute('value')
    if (v && v !== initialGeneral) { targetValue = v; break }
  }
  await generalSelect.selectOption(targetValue)
  await page.waitForTimeout(2000)

  const panelMonthAfterGeneralChange = await monthLabel.innerText().catch(() => '')
  console.log('SCRUM-911 — selector general cambiado a:', targetValue, '| mes en panel Tecnico Servicios Test DESPUES:', panelMonthAfterGeneralChange)
  expect(panelMonthAfterGeneralChange, 'el panel debe sincronizarse con el filtro general al cambiarlo (criterio central de SCRUM-911 / UAT-046)').not.toBe(panelMonthBefore)

  // Ahora usar la navegacion LOCAL del panel (flecha "<-") y confirmar que el selector
  // GENERAL de la pagina NO cambia (solo la tarjeta se mueve).
  const generalBeforeLocalNav = await generalSelect.inputValue()
  const prevArrow = page.getByRole('button', { name: 'Mes anterior' }).first()
  await prevArrow.click()
  await page.waitForTimeout(1200)
  const panelMonthAfterLocalNav = await monthLabel.innerText().catch(() => '')
  const generalAfterLocalNav = await generalSelect.inputValue()
  console.log('SCRUM-911 — tras navegacion LOCAL (flecha atras): panel=', panelMonthAfterLocalNav, 'selector general (debe seguir igual)=', generalAfterLocalNav, 'era:', generalBeforeLocalNav)
  expect(generalAfterLocalNav, 'la navegacion local del panel no debe tocar el filtro general de la pagina').toBe(generalBeforeLocalNav)
  expect(panelMonthAfterLocalNav, 'la flecha local si debe mover el mes mostrado EN el panel').not.toBe(panelMonthAfterGeneralChange)

  await page.screenshot({ path: 'test-results/scrum911-final.png', fullPage: true }).catch(() => {})
})

test('CLEANUP — resetear card 164 (Vendedor Disenador Test 6, fixture QA) a su estado sin delivery_type', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken')
    const res = await fetch('/api/ventas-diseno/pipeline/164', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_type: null, delivery_dates: [] }),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  })
  console.log('CLEANUP card 164 reset status:', result.status, 'stage:', result.body?.stage, 'delivery_type:', result.body?.delivery_type)
})

test('CLEANUP.verify — confirmar que cards 158/178/145/164 quedaron con delivery_type=null', async ({ page }) => {
  await login(page, 'superadmin2@test.com', 'superadmin2@test.com')
  for (const id of [158, 178, 145, 164]) {
    const d = await apiGet(page, `/api/ventas-diseno/pipeline/${id}`)
    console.log(`card ${id} stage=${d.body?.stage} delivery_type=${d.body?.delivery_type} delivery_dates=${JSON.stringify(d.body?.delivery_dates)}`)
  }
})
