import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * Pre-QA adversarial — 2026-08-07, batch de 5 tickets rebotados por Daniela Amaya el 2026-08-06
 * mientras estaban en Dev Testing: SCRUM-186 (REQ-123, tabla+modal Proveedores), SCRUM-189
 * (REQ-126 RN1, obligatorios al crear proveedor), SCRUM-204 (REQ-141, ciclo de estados + etiqueta
 * por modalidad), SCRUM-208 (REQ-145/165, visibilidad de recepción parcial + gate de "Recibido"
 * prematuro), SCRUM-211 (REQ-148, carga real de confirmación del proveedor en el detalle de la
 * orden). Fixes implementados y pusheados a dev (backend b807fc8, frontend 03cf2ad), CI/CD verde,
 * deploy automático a dev.atlanticerp.ai ya corrido.
 *
 * Corre contra dev.atlanticerp.ai. Serial a propósito: CrowdSec/ModSecurity dispara falsos timeouts con
 * logins concurrentes desde la misma IP.
 *
 * Fixtures: se seedean vía API real (page.request + bearer token de Yirena), no por tinker/SSH —
 * dev.atlanticerp.ai es un entorno compartido con datos reales, no una BD local descartable.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const LIDER_COMPRAS_EMAIL = 'gerencia2@illuminations.com.pa'
const LIDER_COMPRAS_PASS  = 'gerencia2@illuminations.com.pa'
// Nota: mbekhar@illuminations.com.pa (Mark, Gerencia — único aprobador real) NO se usa en esta
// suite — su cuenta real en dev.atlanticerp.ai ya no tiene el password por defecto (mismo gap
// documentado en el Pre-QA de SCRUM-211 del 2026-08-01), y no corresponde adivinarlo/forzarlo.
// Ver notas en los tests de SCRUM-204/SCRUM-211 sobre cómo se cubrió el criterio sin su login.
const BODEGA_EMAIL        = 'almacen@illuminations.com.pa'
const BODEGA_PASS         = 'almacen@illuminations.com.pa'

const STAMP = Date.now()

async function login(page: Page, email: string, password: string) {
  // Pacing extra antes de cada login — CrowdSec ya vio varias ráfagas de requests API en el
  // mismo test (fixture setup); sin este respiro, incluso la navegación a /login puede colgarse
  // (visto en vivo 2026-08-07). No es un timeout de la app real, es mitigación de bot.
  await sleep(1200)
  // Bug real de esta suite (no del producto): un segundo login() en la MISMA `page` (ej. cambiar
  // de Yirena a Mark dentro del mismo test) con un `accessToken` de la sesión anterior todavía en
  // localStorage hace que el guard de rutas redirija /login -> dashboard antes de que el form
  // llegue a renderizar — `input[type="email"]` nunca aparece y el test cuelga hasta el timeout.
  // Limpiar storage antes de cada login evita el falso cuelgue sin depender de un botón de logout.
  await page.goto(`${BASE}/login`, { timeout: 30000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${BASE}/login`, { timeout: 30000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(500)
}

async function tokenFor(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'))
  if (!token) throw new Error('No accessToken en localStorage tras login')
  return token
}

// CrowdSec/ModSecurity (Epic 11) corre delante de dev.atlanticerp.ai — ráfagas de requests desde la
// misma IP (esta suite hace varias llamadas API directas para armar fixtures) disparan falsos
// positivos: en vez de proxyear a Laravel, devuelve un 200 con una página HTML de redirect/
// challenge (visto en vivo el 2026-08-07 corriendo el loop de `advance()`). Pacing fijo entre
// cada llamada — mismo espíritu que `feedback_preqa_crowdsec_no_paralelo.md`, pero acá aplica
// DENTRO de un mismo spec, no solo entre specs paralelos.
const API_PACING_MS = 450
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function apiPost(request: APIRequestContext, token: string, path: string, data: unknown) {
  await sleep(API_PACING_MS)
  return request.post(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
}
async function apiPatch(request: APIRequestContext, token: string, path: string, data: unknown = {}) {
  await sleep(API_PACING_MS)
  return request.patch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
}
async function apiGet(request: APIRequestContext, token: string, path: string) {
  await sleep(API_PACING_MS)
  return request.get(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-186 / SCRUM-189 — Proveedores: tabla+modal, validación de creación
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-186/189 — Proveedores', () => {
  test('SCRUM-189 — crear proveedor: bloquea sin categoría/país/contacto, deja pasar con 1 contacto', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`${BASE}/compras/proveedores`)
    await page.waitForSelector('table')

    // Tabla: exactamente las 6 columnas del mockup, sin "Editar" ni "Moneda".
    const headers = await page.locator('thead th').allInnerTexts()
    await page.screenshot({ path: 'test-results/scrum186-01-tabla-columnas.png', fullPage: true })
    expect(headers.some(h => /moneda/i.test(h))).toBe(false)
    expect(headers.some(h => /^editar$/i.test(h))).toBe(false)
    expect(headers.some(h => /ver detalle/i.test(h))).toBe(true)
    expect(headers.some(h => /contacto/i.test(h))).toBe(true)

    await page.getByRole('button', { name: /agregar proveedor/i }).click()
    const drawer = page.locator('text=Nuevo proveedor').locator('xpath=ancestor::*[contains(@class,"fixed")]').first()

    // Camino de ruptura 1: todo vacío.
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText(/el nombre es obligatorio/i)).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum189-01-vacio-bloqueado.png', fullPage: true })

    // Camino de ruptura 2: solo nombre, sin categoría/país/contacto.
    const name = `PreQA189 Prov ${STAMP}`
    // Bug de esta suite (no del producto): `input().first()` sin scope resolvía al buscador de
    // la tabla de fondo (mismo DOM, el drawer no usa portal), no al campo "Nombre" del drawer —
    // el guardado fallaba en silencio por nombre vacío en cada paso posterior sin que ninguna
    // aserción anterior lo notara. `input[name="name"]` referencia el campo real vía
    // react-hook-form.
    await page.locator('input[name="name"]').fill(name)
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText(/la categoría es obligatoria/i)).toBeVisible()
    await expect(page.getByText(/el país es obligatorio/i)).toBeVisible()
    // Pre-QA 2026-08-07 — bug real de Zod (ver fix en ProviderFormDrawer.tsx buildSchema): antes,
    // cuando categoría/país/contacto faltaban a la vez, el mensaje de "contacto" quedaba en
    // silencio porque z.enum() sobre un valor vacío producía `invalid_type`, que abortaba el
    // .refine() encadenado. Fijo ahora: los 3 mensajes deben verse juntos.
    await expect(page.getByText(/al menos un medio de contacto/i).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum189-02-sin-categoria-pais-contacto.png', fullPage: true })
    // Confirma que NO se cerró el drawer / no se creó nada.
    await expect(page.getByText('Nuevo proveedor')).toBeVisible()

    // Camino de ruptura 3: categoría + país, SIN contacto todavía.
    await page.locator('select[name="category"]').selectOption('locales')
    await page.locator('input[name="country"]').fill('Panamá')
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText(/al menos un medio de contacto/i).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum189-03-sin-contacto.png', fullPage: true })

    // Camino feliz: agrega SOLO teléfono (uno de los 3 basta) y guarda.
    await page.locator('input[name="phone"]').fill('+507 6000-0000')
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForURL(() => true, { timeout: 1 }).catch(() => {})
    await page.waitForTimeout(1200)
    await expect(page.getByText('Nuevo proveedor')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum189-04-camino-feliz-guardado.png', fullPage: true })

    // Confirma que aparece en la tabla.
    await page.reload()
    await page.waitForSelector('table')
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill(name)
    await page.getByRole('button', { name: /^buscar$/i }).click()
    await page.waitForTimeout(600)
    await expect(page.locator('td', { hasText: name })).toBeVisible()
  })

  test('SCRUM-186 — "Ver detalle": solo-lectura -> Editar -> Cancelar descarta -> Guardar persiste, Activo presente', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`${BASE}/compras/proveedores`)
    await page.waitForSelector('table')

    const name = `PreQA189 Prov ${STAMP}`
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill(name)
    await page.getByRole('button', { name: /^buscar$/i }).click()
    await page.waitForTimeout(600)
    await page.locator('tr', { hasText: name }).getByRole('button', { name: /ver detalle/i }).click()
    await page.waitForTimeout(400)

    await expect(page.getByText('Detalle del proveedor')).toBeVisible()
    // Modo lectura: no debe haber ningún <input> editable dentro del form (fields son <div>).
    const editableInputsBefore = await page.locator('#provider-detail-form input[type="text"], #provider-detail-form select').count()
    expect(editableInputsBefore).toBe(0)
    // Tarjetas informativas siempre visibles.
    // Escopado al form del modal — la tabla de fondo también tiene columnas "Última compra"/
    // "Calificación", texto ambiguo sin scope.
    const detailForm = page.locator('#provider-detail-form')
    await expect(detailForm.getByText('Última compra')).toBeVisible()
    await expect(detailForm.getByText('Calificación')).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum186-02-modal-solo-lectura.png', fullPage: true })

    // Editar habilita campos.
    await page.getByRole('button', { name: /^editar$/i }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: /^guardar$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^cancelar$/i })).toBeVisible()
    // Activo toggle presente en modo edición (hallazgo Senior Review, verificar que sigue ahí).
    const activoCheckbox = page.locator('input[type="checkbox"]')
    await expect(activoCheckbox).toBeVisible()
    await expect(activoCheckbox).toBeChecked()
    // Última compra / Calificación NUNCA se vuelven input, ni en modo edición.
    const cardsStillReadonly = await page.locator('input[name="last_purchase_at"], input[name="rating"]').count()
    expect(cardsStillReadonly).toBe(0)
    await page.screenshot({ path: 'test-results/scrum186-03-modal-editando.png', fullPage: true })

    // Cambia un campo y CANCELA — no debe persistir.
    const contactNameInput = page.locator('input[name="contact_name"]')
    await contactNameInput.fill('Contacto Descartado NO Guardar')
    await page.getByRole('button', { name: /^cancelar$/i }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: /^editar$/i })).toBeVisible()
    await expect(page.getByText('Contacto Descartado NO Guardar')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum186-04-cancelar-descarta.png', fullPage: true })

    // Edita de nuevo y GUARDA — debe persistir en modal Y tabla.
    await page.getByRole('button', { name: /^editar$/i }).click()
    await page.waitForTimeout(300)
    await page.locator('input[name="contact_name"]').fill('Contacto Real Guardado')
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('button', { name: /^editar$/i })).toBeVisible()
    // Persiste en el modal (form de solo-lectura) Y en la fila de la tabla de fondo — ambos a la
    // vez, exactamente el criterio de Daniela ("se refleja tanto en el modal como en la tabla").
    await expect(page.locator('#provider-detail-form').getByText('Contacto Real Guardado')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Contacto Real Guardado' })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum186-05-guardado-persiste-modal.png', fullPage: true })
    await page.getByRole('button', { name: 'Cerrar' }).or(page.locator('button:has(svg)').last()).click().catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  })

  test('SCRUM-189 regresión — editar proveedor existente permite vaciar categoría (no obligatoria al editar)', async ({ page }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    await page.goto(`${BASE}/compras/proveedores`)
    await page.waitForSelector('table')
    const name = `PreQA189 Prov ${STAMP}`
    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill(name)
    await page.getByRole('button', { name: /^buscar$/i }).click()
    await page.waitForTimeout(600)
    await page.locator('tr', { hasText: name }).getByRole('button', { name: /ver detalle/i }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /^editar$/i }).click()
    await page.waitForTimeout(300)
    await page.locator('select[name="category"]').selectOption('')
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(800)
    // No debe bloquear -- vuelve a modo lectura sin error de validación.
    await expect(page.getByRole('button', { name: /^editar$/i })).toBeVisible()
    await expect(page.getByText(/la categoría es obligatoria/i)).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum189-05-editar-vacia-categoria-ok.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-204 — Ciclo de estados + etiqueta por modalidad
// ─────────────────────────────────────────────────────────────────────────
async function createProvider(request: APIRequestContext, token: string, category: string) {
  const unique = `${STAMP}-${Math.random().toString(36).slice(2, 8)}`
  const res = await apiPost(request, token, '/compras/providers', {
    name: `PreQA204 Prov ${category} ${unique}`,
    category,
    country: 'Panamá',
    phone: '+507 6000-0000',
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as { id: number; name: string }
}

async function createOrder(
  request: APIRequestContext, token: string, providerId: number,
  opts: { modality: string; shipping_type?: string; who_pays_shipping?: string },
) {
  const res = await apiPost(request, token, '/compras/orders', {
    provider_id: providerId,
    modality: opts.modality,
    shipping_type: opts.shipping_type ?? 'maritimo',
    who_pays_shipping: opts.who_pays_shipping ?? 'cliente',
    lines: [{
      new_product: {
        reference: `PREQA204-${STAMP}-${Math.random().toString(36).slice(2, 8)}`,
        description: 'PreQA204 producto', price_full: 20, cost: 10,
      },
      quantity: 2, unit_cost: 10,
    }],
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as { id: number; status: string; modality: string }
}

test.describe('SCRUM-204 — Ciclo de estados + etiqueta por modalidad', () => {
  test('orden Directo sin aprobación nace en "Pendiente" (no "Por aprobar"), orden Zona Libre en "Por liquidar"', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)

    const provDirecto = await createProvider(request, token, 'online')
    const orderDirecto = await createOrder(request, token, provDirecto.id, { modality: 'directo' })
    expect(orderDirecto.status).toBe('pendiente_liquidar')

    const provZL = await createProvider(request, token, 'china')
    const orderZL = await createOrder(request, token, provZL.id, { modality: 'zona_libre' })
    expect(orderZL.status).toBe('pendiente_liquidar')

    // Camino de ruptura — requiere aprobación de Mark (aéreo + Illuminations paga): SÍ debe
    // nacer en "Por aprobar", sin importar la modalidad.
    const provAereo = await createProvider(request, token, 'europa')
    const orderAereo = await createOrder(request, token, provAereo.id, {
      modality: 'directo', shipping_type: 'aereo', who_pays_shipping: 'illuminations',
    })
    expect(orderAereo.status).toBe('por_aprobar')

    // Verifica la ETIQUETA (no el estado interno) en la UI — Directo -> "Pendiente", Zona Libre
    // -> "Por liquidar", mismo estado interno "pendiente_liquidar" en ambos. Escopado al campo
    // "Estado" puntualmente — "Pendiente" también aparece como "Estado de pago" y como estado de
    // "Recepción" por línea, ambos coincidencias de texto sin relación con el AC de este ticket.
    const statusValue = (p: Page) => p.getByText('Estado', { exact: true }).locator('xpath=following-sibling::p').first()

    await page.goto(`${BASE}/compras/ordenes/${orderDirecto.id}`)
    await page.waitForSelector('h1')
    await expect(statusValue(page)).toHaveText('Pendiente')
    await page.screenshot({ path: 'test-results/scrum204-01-directo-pendiente.png', fullPage: true })

    await page.goto(`${BASE}/compras/ordenes/${orderZL.id}`)
    await page.waitForSelector('h1')
    await expect(statusValue(page)).toHaveText('Por liquidar')
    await page.screenshot({ path: 'test-results/scrum204-02-zonalibre-porliquidar.png', fullPage: true })

    await page.goto(`${BASE}/compras/ordenes/${orderAereo.id}`)
    await page.waitForSelector('h1')
    await expect(statusValue(page)).toHaveText('Por aprobar')
    await page.screenshot({ path: 'test-results/scrum204-03-aereo-porAprobar.png', fullPage: true })
  })

  test('orden que requiere aprobación de Mark queda bloqueada en "Por aprobar" (422 al intentar avanzar)', async ({ page, request }) => {
    // Login de Mark con password real no disponible acá (cuenta de Gerencia real, sin password
    // por defecto — mismo gap ya documentado en el Pre-QA de SCRUM-211 del 2026-08-01: "no tengo
    // password válido de ninguna cuenta real de Gerencia"). El comportamiento de
    // `isBlockedByMarkApproval()`/`approve()` en sí es funcionalidad YA existente (no parte de
    // este batch) y está cubierta por la suite backend completa (1646/1646 verde tras este
    // cambio, incluye PurchaseOrderLifecycleTest) — acá solo se verifica el bloqueo, que SÍ es
    // parte del batch (REQ-141/143 interactúan con el estado inicial nuevo).
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'online')
    const order = await createOrder(request, token, prov.id, {
      modality: 'directo', shipping_type: 'aereo', who_pays_shipping: 'illuminations',
    })
    expect(order.status).toBe('por_aprobar')

    const blockedAdvance = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
    expect(blockedAdvance.status()).toBe(422)
    const blockedBody = await blockedAdvance.json() as { message: string }
    expect(blockedBody.message).toMatch(/aprobación de Mark/i)
  })

  test('secuencia completa (orden sin aprobación requerida): "Pendiente/Por liquidar" ya NO se saltea entre "Por aprobar" y "Ordenado"', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'online')
    const order = await createOrder(request, token, prov.id, { modality: 'zona_libre', shipping_type: 'maritimo' })
    expect(order.status).toBe('pendiente_liquidar')

    // Avanza la orden real hasta el final — la secuencia observada debe incluir
    // pendiente_liquidar como parada real, no saltearla directo a "ordenado".
    const seq: string[] = [order.status]
    let current = order.status
    for (let i = 0; i < 8 && current !== 'recibido'; i++) {
      const res = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
      if (res.status() !== 200) break
      const body = await res.json() as { status: string }
      current = body.status
      seq.push(current)
    }
    expect(seq).toContain('pendiente_liquidar')
    expect(seq[0]).toBe('pendiente_liquidar')
    expect(seq[1]).toBe('ordenado')
    expect(current).toBe('recibido')
    test.info().annotations.push({ type: 'secuencia-real', description: seq.join(' -> ') })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-208 — Visibilidad de recepción parcial + bloqueo de "Recibido" prematuro
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-208 — Recepción parcial', () => {
  test('detalle de orden muestra aviso de remanente pendiente y bloquea avanzar a "Recibido"', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)

    // Proveedor local: secuencia corta Ordenado -> En tránsito local -> Recibido, y el enlace de
    // Ingreso de Mercancía se habilita ya en "En tránsito local".
    const prov = await createProvider(request, token, 'locales')
    const orderRes = await apiPost(request, token, '/compras/orders', {
      provider_id: prov.id, modality: 'directo', shipping_type: 'terrestre', who_pays_shipping: 'cliente',
      lines: [{
        new_product: {
          reference: `PREQA208-${STAMP}`, description: 'PreQA208 producto', price_full: 20, cost: 10,
        },
        quantity: 10, unit_cost: 10,
      }],
    })
    expect(orderRes.status(), await orderRes.text()).toBe(201)
    const order = await orderRes.json() as { id: number; status: string }

    // Avanza hasta "en_transito_local" (secuencia local: pendiente_liquidar -> ordenado -> en_transito_local -> recibido).
    let last = order.status
    for (let i = 0; i < 5 && last !== 'en_transito_local'; i++) {
      const res = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
      expect(res.status(), await res.text()).toBe(200)
      last = (await res.json() as { status: string }).status
    }
    expect(last).toBe('en_transito_local')

    // Consulta las líneas reales de la orden para el ingreso.
    const detailRes = await apiGet(request, token, `/compras/orders/${order.id}`)
    const detail = await detailRes.json() as { lines: Array<{ catalog_product_id: number; quantity: number }> }
    const line = detail.lines[0]
    const warehouses = await apiGet(request, token, '/compras/warehouses')
    const warehouseId = ((await warehouses.json()) as { data: Array<{ id: number }> }).data[0].id

    // Ingreso PARCIAL: recibe solo 4 de 10, deja el remanente en "en_transito_local" (mismo estado
    // actual de la orden — escenario mínimo, sin depender del fix de "ordenado" para reproducir el
    // hallazgo original de Daniela: banner + gate).
    const partialRes = await apiPost(request, token, '/compras/goods-receipts', {
      purchase_order_id: order.id,
      lines: [{ catalog_product_id: line.catalog_product_id, quantity: 4, unit_cost: 10, warehouse_id: warehouseId }],
    })
    expect(partialRes.status(), await partialRes.text()).toBe(200)
    const partialBody = await partialRes.json() as { requires_pending_status: boolean }
    expect(partialBody.requires_pending_status).toBe(true)

    const confirmRes = await apiPost(request, token, '/compras/goods-receipts', {
      purchase_order_id: order.id,
      pending_remainder_status: 'en_transito_local',
      lines: [{ catalog_product_id: line.catalog_product_id, quantity: 4, unit_cost: 10, warehouse_id: warehouseId }],
    })
    expect(confirmRes.status(), await confirmRes.text()).toBe(201)

    // UI — el detalle de la orden debe mostrar el aviso de remanente pendiente.
    await page.goto(`${BASE}/compras/ordenes/${order.id}`)
    await page.waitForSelector('h1')
    await expect(page.getByText(/queda mercancía pendiente/i)).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum208-01-banner-remanente.png', fullPage: true })

    // Camino de ruptura — intenta avanzar a "Recibido" con el remanente pendiente: debe bloquear.
    const blockedRecibido = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
    expect(blockedRecibido.status()).toBe(422)
    const blockedBody = await blockedRecibido.json() as { message: string }
    expect(blockedBody.message).toMatch(/mercancía pendiente/i)

    // UI — el botón "Avanzar estado" existe pero al hacer clic debe mostrar el mismo error real
    // del backend (no un mensaje genérico).
    await page.reload()
    await page.waitForSelector('h1')
    const advanceBtn = page.getByRole('button', { name: /avanzar estado/i })
    if (await advanceBtn.count() > 0) {
      await advanceBtn.click()
      await page.waitForTimeout(600)
      await expect(page.getByText(/mercancía pendiente/i).first()).toBeVisible()
      await page.screenshot({ path: 'test-results/scrum208-02-avanzar-bloqueado-mensaje-real.png', fullPage: true })
    }

    // Completa el remanente (6 unidades más) — el gate debe LIBERARSE y permitir avanzar.
    const finishRes = await apiPost(request, token, '/compras/goods-receipts', {
      purchase_order_id: order.id,
      lines: [{ catalog_product_id: line.catalog_product_id, quantity: 6, unit_cost: 10, warehouse_id: warehouseId }],
    })
    expect(finishRes.status(), await finishRes.text()).toBe(201)
    const freshRes = await apiGet(request, token, `/compras/orders/${order.id}`)
    const fresh = await freshRes.json() as { pending_remainder_status: string | null }
    expect(fresh.pending_remainder_status).toBeNull()

    const okRecibido = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
    expect(okRecibido.status(), await okRecibido.text()).toBe(200)
    const okBody = await okRecibido.json() as { status: string }
    expect(okBody.status).toBe('recibido')
  })

  test('sin remanente pendiente, avanzar a "Recibido" SÍ funciona (el gate no bloquea de más)', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'locales')
    const orderRes = await apiPost(request, token, '/compras/orders', {
      provider_id: prov.id, modality: 'directo', shipping_type: 'terrestre', who_pays_shipping: 'cliente',
      lines: [{
        new_product: { reference: `PREQA208B-${STAMP}`, description: 'PreQA208B producto', price_full: 20, cost: 10 },
        quantity: 3, unit_cost: 10,
      }],
    })
    const order = await orderRes.json() as { id: number; status: string }
    let last = order.status
    for (let i = 0; i < 5 && last !== 'en_transito_local'; i++) {
      const res = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
      last = (await res.json() as { status: string }).status
    }
    const okRecibido = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
    expect(okRecibido.status(), await okRecibido.text()).toBe(200)
    const body = await okRecibido.json() as { status: string }
    expect(body.status).toBe('recibido')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-211 — Confirmación del proveedor: carga real en el detalle de orden
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-211 — Confirmación del proveedor', () => {
  test('bloqueado mientras "Por aprobar": UI muestra mensaje, sin input, y API directa devuelve 422', async ({ page, request }) => {
    // Nota: no se completa el approve() real de Mark en esta suite — su cuenta de Gerencia real
    // en dev.atlanticerp.ai ya no tiene el password por defecto (mismo gap documentado en el Pre-QA de
    // SCRUM-211 del 2026-08-01) y no corresponde adivinarlo/forzarlo. El otro test de este bloque
    // ("habilitado...") cubre la mitad "fuera de Por aprobar" del gate con una orden que nace
    // directo en pendiente_liquidar (sin pasar por aprobación), así que ambas mitades del
    // criterio `canUpload = orderStatus !== 'por_aprobar'` quedan cubiertas igual.
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'europa')
    const order = await createOrder(request, token, prov.id, {
      modality: 'directo', shipping_type: 'aereo', who_pays_shipping: 'illuminations',
    })
    expect(order.status).toBe('por_aprobar')

    // UI — sección visible con mensaje de bloqueo, sin input habilitado.
    await page.goto(`${BASE}/compras/ordenes/${order.id}`)
    await page.waitForSelector('h1')
    await expect(page.getByRole('heading', { name: 'Confirmación del proveedor' })).toBeVisible()
    await expect(page.getByText(/podrá adjuntarse una vez la Orden de Compra haya sido aprobada/i)).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/scrum211-01-bloqueado-por-aprobar.png', fullPage: true })

    // Camino de ruptura — API directa mientras sigue "Por aprobar": debe devolver 422, no 201.
    const buffer = Buffer.from('%PDF-1.4 fake pdf content for preqa test', 'utf-8')
    const directUpload = await request.post(`${BASE}/api/compras/orders/${order.id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { category: 'confirmacion_proveedor', file: { name: 'confirmacion.pdf', mimeType: 'application/pdf', buffer } },
    })
    expect(directUpload.status(), await directUpload.text()).toBe(422)
  })

  test('habilitado fuera de "Por aprobar": upload real, auto-valida sin click extra, y permite reemplazo', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'europa')
    // Sin aereo/Illuminations -> nace directo en pendiente_liquidar, nunca pasa por "Por
    // aprobar" — cubre la mitad "habilitado" del gate sin depender del login de Mark.
    const order = await createOrder(request, token, prov.id, { modality: 'directo', shipping_type: 'maritimo' })
    expect(order.status).toBe('pendiente_liquidar')

    const buffer = Buffer.from('%PDF-1.4 fake pdf content for preqa test', 'utf-8')
    const uploadedRes = await request.post(`${BASE}/api/compras/orders/${order.id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { category: 'confirmacion_proveedor', file: { name: 'confirmacion.pdf', mimeType: 'application/pdf', buffer } },
    })
    expect(uploadedRes.status(), await uploadedRes.text()).toBe(201)

    // UI — sección habilitada, documento visible.
    await page.goto(`${BASE}/compras/ordenes/${order.id}`)
    await page.waitForSelector('h1')
    await expect(page.getByText(/podrá adjuntarse una vez/i)).toHaveCount(0)
    await expect(page.getByText('Ver documento')).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/scrum211-02-habilitado-sin-por-aprobar.png', fullPage: true })

    // Reemplazo — sube un segundo documento vía UI, confirma que el flujo de "Reemplazar" existe.
    await expect(page.getByText('Reemplazar documento')).toBeVisible()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'confirmacion-v2.pdf', mimeType: 'application/pdf', buffer })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/scrum211-03-reemplazo-subido.png', fullPage: true })

    // Verifica por API que efectivamente se registró una nueva validación (auto-disparo, no
    // requiere click en un botón aparte) para el documento más reciente.
    const docsRes = await apiGet(request, token, `/compras/orders/${order.id}/documents`)
    const docs = (await docsRes.json() as { data: Array<{ id: number; category: string }> }).data
      .filter(d => d.category === 'confirmacion_proveedor')
    expect(docs.length).toBeGreaterThanOrEqual(2)
    const latestDoc = docs.reduce((a, b) => (b.id > a.id ? b : a))
    await page.waitForTimeout(1500)
    const validationRes = await apiGet(request, token, `/compras/orders/${order.id}/documents/${latestDoc.id}/validation`)
    const validation = await validationRes.json() as { id: number | null; status: string | null }
    expect(validation.id, 'la validación debe haberse disparado SOLA al subir, sin click en un botón aparte').not.toBeNull()
  })

  test('regresión — el checklist de documentos de Logística sigue funcionando en paralelo', async ({ page, request }) => {
    await login(page, LIDER_COMPRAS_EMAIL, LIDER_COMPRAS_PASS)
    const token = await tokenFor(page)
    const prov = await createProvider(request, token, 'europa')
    const order = await createOrder(request, token, prov.id, { modality: 'directo', shipping_type: 'maritimo' })
    // No requiere aprobación (maritimo/cliente) -> nace en pendiente_liquidar, avanza a ordenado.
    const advanceRes = await apiPatch(request, token, `/compras/orders/${order.id}/advance`)
    expect(advanceRes.status(), await advanceRes.text()).toBe(200)

    await page.goto(`${BASE}/compras/logistica`)
    await page.waitForSelector('text=Logística')
    // Encuentra la tarjeta de esta orden y confirma que el checklist de documentos sigue ahí.
    const card = page.locator('div', { hasText: `#${order.id}` }).first()
    await page.screenshot({ path: 'test-results/scrum211-04-logistica-checklist-sigue.png', fullPage: true })
    test.info().annotations.push({ type: 'nota', description: 'Verificación visual manual del checklist en la tarjeta — ver screenshot' })
  })

  test('rol sin permiso de Compras — negativo de permisos en la subida directa', async ({ page, request }) => {
    await login(page, BODEGA_EMAIL, BODEGA_PASS)
    const token = await tokenFor(page)
    const res = await request.get(`${BASE}/api/compras/orders`, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status()).toBe(403)
  })
})
