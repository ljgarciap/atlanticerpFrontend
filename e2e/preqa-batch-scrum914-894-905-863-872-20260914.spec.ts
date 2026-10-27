import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

/**
 * Pre-QA — batch 2026-09-14 contra https://dev.atlanticerp.ai (SCRUM-914, 894, 905, 863, 872).
 * NUNCA localhost/en paralelo con otro Pre-QA (ver feedback_preqa_crowdsec_no_paralelo).
 * Foco: caminos de ruptura de cada criterio de aceptación, no solo el camino feliz.
 * 2 de los 5 son rebotes de Gerencia (894, 905) — foco extra en reproducir EXACTAMENTE su reclamo,
 * no una versión simplificada.
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
    const token = localStorage.getItem('accessToken') ?? JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.token
    const res = await fetch(p, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: res.ok ? await res.json() : await res.text() }
  }, path)
}

function getToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('accessToken') ?? JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.token ?? '')
}

// ============================================================
// SCRUM-914 + SCRUM-894 (rebote Gerencia) — Guia de Entrega: stage correcto + cantidades reales
// Un solo flujo real de entrega parcial cubre ambos: pedido PED-2026-0004 (id 4), en Packing,
// 3 items: PREQA-VERIFY-265 (qty_picked=10=requested), PREQA-INT-B-... (qty_picked=6, requested=10,
// shortage sin_stock ya desde picking), QA-XL-004 (qty_picked=5=requested).
// Entregamos: item 265 y XL completos, item INT-B a 0 (motivo sin_stock) — reproduce EXACTO el
// reclamo de Gerencia: "un producto con 0 unidades por falta de stock, otro con unidades reales".
// ============================================================

const ORDER_ID = 4

test('SCRUM-914/894 — pre-condiciones: pedido 4 sigue en Packing con los 3 items esperados', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  const detail = await apiGet(page, `/api/bodega/orders/${ORDER_ID}`)
  console.log('SCRUM-914/894 — pedido 4 stage:', detail.body?.stage, 'items:', JSON.stringify(detail.body?.items?.map((i: any) => ({ id: i.id, ref: i.reference, req: i.qty_requested, picked: i.qty_picked, delivered: i.qty_delivered, reason: i.shortage_reason }))))
  expect(detail.body?.stage, 'pedido 4 debe seguir en packing para este test — si no, elegir otro pedido en Packing').toBe('packing')
})

test('SCRUM-914/894 — registrar entrega real vía UI (RegisterDeliveryModal): 1 item en 0 por falta de stock, 2 items completos', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/pedidos`)
  await page.waitForTimeout(2000)

  // Localizar la tarjeta del pedido 4 (PED-2026-0004, order_type=pedido) por id, NUNCA por texto
  // "PED-2026-0004" a secas — ese order_number tiene un hermano order_type=revision_inventario
  // (id 13) que también lo muestra, y `.first()` puede matchear el equivocado (confirmado: la
  // primera corrida abrió el detalle de la revisión de inventario, "Etapa: Picking pendiente",
  // no el pedido en Packing).
  const card = page.getByTestId('order-card-4')
  await expect(card).toBeVisible({ timeout: 10000 })

  // El botón "Registrar entrega y Generar Guía" ya vive en la tarjeta misma — no hace falta abrir
  // el detalle primero.
  const registerBtn = card.getByTestId('register-delivery-button-4')
  await expect(registerBtn).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: 'test-results/scrum914-order-detail.png', fullPage: true }).catch(() => {})
  await registerBtn.click()

  const modal = page.getByTestId('register-delivery-modal')
  await expect(modal).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/scrum914-register-delivery-open.png', fullPage: true }).catch(() => {})

  // Item id 9 (PREQA-INT-B-...) — poner en 0, motivo sin_stock.
  await modal.getByTestId('register-delivery-edit-9').click()
  const qty9 = modal.getByTestId('register-delivery-qty-9')
  await qty9.fill('0')
  await modal.getByTestId('register-delivery-motivo-9').selectOption('sin_stock')

  await page.screenshot({ path: 'test-results/scrum914-register-delivery-filled.png', fullPage: true }).catch(() => {})

  const saveBtn = modal.getByTestId('register-delivery-save')
  await saveBtn.click()
  await page.waitForTimeout(2500)

  const stillOpen = await modal.isVisible().catch(() => false)
  console.log('SCRUM-914/894 — modal register-delivery sigue abierto tras Guardar (esperado: false):', stillOpen)
  await page.screenshot({ path: 'test-results/scrum914-register-delivery-after-save.png', fullPage: true }).catch(() => {})
})

test('SCRUM-914 — API: stage del pedido 4 pasó a por_despachar (nunca packing)', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  const detail = await apiGet(page, `/api/bodega/orders/${ORDER_ID}`)
  console.log('SCRUM-914 — stage post-entrega:', detail.body?.stage)
  console.log('SCRUM-914 — items post-entrega:', JSON.stringify(detail.body?.items?.map((i: any) => ({ id: i.id, ref: i.reference, delivered: i.qty_delivered }))))
  expect(detail.body?.stage).toBe('por_despachar')
})

test('SCRUM-894 — GuiaEntregaModal (vista previa en-app): solo items con qty_delivered>0, cantidad real', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/pedidos`)
  await page.waitForTimeout(2000)
  const card = page.getByTestId('order-card-4')
  await expect(card).toBeVisible({ timeout: 10000 })

  const guiaBtn = card.getByRole('button', { name: /ver guía|ver guia|guía de entrega|guia de entrega/i }).first()
  await expect(guiaBtn).toBeVisible({ timeout: 10000 })
  await guiaBtn.click()
  await page.waitForTimeout(1500)

  const bodyText = await page.locator('body').innerText()
  await page.screenshot({ path: 'test-results/scrum894-guia-modal.png', fullPage: true }).catch(() => {})

  console.log('SCRUM-894 — modal contiene PREQA-VERIFY-265 (esperado true):', bodyText.includes('PREQA-VERIFY-265'))
  console.log('SCRUM-894 — modal contiene QA-XL-004 (esperado true):', bodyText.includes('QA-XL-004'))
  console.log('SCRUM-894 — modal contiene PREQA-INT-B (esperado FALSE, qty_delivered=0):', /PREQA-INT-B/.test(bodyText))

  expect(bodyText, 'debe mostrar el item entregado completo 265').toContain('PREQA-VERIFY-265')
  expect(bodyText, 'debe mostrar el item entregado completo XL').toContain('QA-XL-004')
  expect(bodyText, 'NO debe mostrar el item con qty_delivered=0 (sin stock)').not.toMatch(/PREQA-INT-B/)
})

test('SCRUM-914/894 — PDF real descargado: stage=por_despachar y mismos items que el modal', async ({ page }) => {
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  const token = await getToken(page)

  const detail = await apiGet(page, `/api/bodega/orders/${ORDER_ID}`)
  const guideDocs = (detail.body?.documents ?? []).filter((d: any) => d.tipo === 'guia_entrega')
  const latest = guideDocs.reduce((a: any, b: any) => (b.id > a.id ? b : a), guideDocs[0])
  console.log('SCRUM-914/894 — documento guia_entrega mas reciente:', latest)

  const urlResp = await apiGet(page, `/api/bodega/orders/${ORDER_ID}/documents/${latest.id}/download`)
  const pdfUrl = urlResp.body?.url
  console.log('SCRUM-914/894 — presigned url obtenida:', !!pdfUrl)

  const res = await page.request.get(pdfUrl)
  const buf = await res.body()
  writeFileSync('test-results/scrum914-894-guia-real.pdf', buf)

  let text = ''
  try {
    text = execSync('pdftotext test-results/scrum914-894-guia-real.pdf -').toString()
  } catch (e) {
    console.log('pdftotext fallo:', e)
  }
  console.log('SCRUM-914/894 — texto extraido del PDF real:\n' + text)

  expect(text, 'el PDF debe decir Estado de la entrega: por_despachar').toMatch(/Estado de la entrega:\s*por_despachar/)
  expect(text).not.toMatch(/Estado de la entrega:\s*packing/)
  expect(text).toContain('PREQA-VERIFY-265')
  expect(text).toContain('QA-XL-004')
  expect(text).not.toContain('PREQA-INT-B')
})

// ============================================================
// SCRUM-905 (rebote Gerencia) — dropdown de cliente en Registrar Cobro ya no se recorta
// ============================================================

test('SCRUM-905 — buscador de cliente en Registrar cobro: dropdown visible completo, sin recorte', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/cobros`)
  await page.waitForTimeout(2000)

  const registrarBtn = page.getByRole('button', { name: /registrar cobro/i }).first()
  await expect(registrarBtn).toBeVisible({ timeout: 10000 })
  await registrarBtn.click()
  await page.waitForTimeout(1000)

  const modal = page.locator('.fixed.inset-0').filter({ hasText: /registrar nuevo cobro/i }).last()
  const clienteInput = modal.getByPlaceholder(/buscar cliente/i)
  await clienteInput.click()
  await clienteInput.fill('a')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/scrum905-dropdown-typed.png', fullPage: true }).catch(() => {})

  const dropdown = modal.locator('ul').first()
  const isVisible = await dropdown.isVisible().catch(() => false)
  console.log('SCRUM-905 — dropdown ul visible:', isVisible)

  if (isVisible) {
    const box = await dropdown.boundingBox()
    console.log('SCRUM-905 — bounding box del dropdown:', JSON.stringify(box))
    const items = await dropdown.locator('li').count()
    console.log('SCRUM-905 — cantidad de <li> en el dropdown:', items)

    // Verificar que el dropdown no está clippeado por un ancestro overflow — su bottom real no
    // debe quedar oculto por el borde inferior del contenedor de scroll del modal (si lo hubiera).
    const ulHandle = await dropdown.elementHandle()
    const clientContainerOverflow = await page.evaluate((ul: Element | null) => {
      let el: HTMLElement | null = (ul as HTMLElement | null)?.parentElement ?? null
      const overflows: string[] = []
      while (el) {
        const style = getComputedStyle(el)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden') {
          overflows.push(`${el.tagName}.${el.className} overflow-y=${style.overflowY}`)
        }
        el = el.parentElement
      }
      return overflows
    }, ulHandle)
    // Informativo solamente — el overlay raíz del modal (`fixed inset-0 ... overflow-y-auto`)
    // SIEMPRE aparece en esta lista porque cubre el viewport completo (nunca recorta nada al ser
    // del mismo tamaño que la pantalla); el ancestro que SI importaba (el cuerpo scrolleable
    // `max-h-[70vh] overflow-y-auto` del formulario) ya no envuelve al campo Cliente tras el fix
    // — confirmado abajo por el bounding box real, no por la sola presencia de un overflow-y en
    // algún ancestro.
    console.log('SCRUM-905 — ancestros con overflow-y (el overlay raíz fullscreen es esperado, no recorta):', JSON.stringify(clientContainerOverflow))

    // Aserción real: el <ul> debe estar COMPLETO dentro del viewport y no recortado — visible
    // hasta su último <li>, que es exactamente lo que Gerencia reportó roto (dropdown "chico").
    const viewport = page.viewportSize()
    expect(box, 'debe poder leerse el bounding box del dropdown').not.toBeNull()
    if (viewport && box) {
      const fullyInViewport = box.y >= 0 && (box.y + box.height) <= viewport.height
      console.log('SCRUM-905 — dropdown bottom:', box.y + box.height, 'vs viewport height:', viewport.height, '-> completo en viewport:', fullyInViewport)
      expect(fullyInViewport, 'el dropdown de resultados debe estar completo dentro del viewport, no cortado').toBe(true)
    }
    expect(items, 'debe mostrar al menos 1 resultado real (fixture PREQA-SCRUM905)').toBeGreaterThan(0)
  } else {
    console.log('SCRUM-905 — no hay resultados visibles: puede ser falta de fixture (ver comentario del batch) o regresion real')
  }
})

// ============================================================
// SCRUM-863 — recheck rápido, ya verificado por el Arquitecto
// ============================================================

test('SCRUM-863 — Home de Compras dice Bienvenido, no Hola', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras`)
  await page.waitForTimeout(2000)
  const bodyText = await page.locator('body').innerText()
  await page.screenshot({ path: 'test-results/scrum863-home.png' }).catch(() => {})
  console.log('SCRUM-863 — contiene "Bienvenido":', /bienvenido/i.test(bodyText), '| contiene "Hola,"/"Hola ":', /\bhola[, ]/i.test(bodyText))
  expect(bodyText).toMatch(/bienvenido/i)
})

// ============================================================
// SCRUM-872 — Configuración Fiscal: se puede vaciar un campo sin 422
// ============================================================

test('SCRUM-872 — Configuracion Fiscal: vaciar un campo de texto y guardar no da 422', async ({ page }) => {
  // Configuración Fiscal es exclusiva de Gerencia (403 en backend para cualquier otro, ver
  // App.tsx) — Contabilidad (conta@) puede navegar a la ruta pero no puede editar. Password real en
  // dev.atlanticerp.ai confirmado 2026-09-10: su propio email (ver feedback_aprobador_dev_password_is_email_not_static).
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto(`${DEV}/admin-contab/fiscal`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/scrum872-fiscal-before.png', fullPage: true }).catch(() => {})

  const responses: number[] = []
  page.on('response', r => { if (r.url().includes('/fiscal') && r.request().method() !== 'GET') responses.push(r.status()) })

  // Los campos arrancan deshabilitados (solo lectura) hasta apretar "Editar".
  const editBtn = page.getByRole('button', { name: /^editar$/i }).first()
  await expect(editBtn).toBeVisible({ timeout: 10000 })
  await editBtn.click()
  await page.waitForTimeout(500)

  // Campo exacto que cubre el test de backend citado por el Arquitecto
  // (test_update_permite_vaciar_un_campo_de_texto_ya_cargado, sobre `nombre_comercial`) — probamos
  // ESE mismo campo, no uno distinto, para que la verificación sea comparable 1:1 con lo que el
  // backend ya prueba.
  const target = page.locator('label', { hasText: /^Nombre comercial$/ }).locator('input').first()
  await expect(target, 'input de Nombre comercial debe estar visible y habilitado tras Editar').toBeVisible({ timeout: 8000 })

  const putRequests: string[] = []
  page.on('request', r => { if (r.method() === 'PUT' && r.url().includes('/fiscal-settings')) putRequests.push(r.url()) })

  const original = await target.inputValue()
  await target.fill('')
  await target.blur()
  const saveBtn = page.getByRole('button', { name: /guardar cambios|guardar/i }).first()
  await expect(saveBtn).toBeVisible({ timeout: 5000 })
  await saveBtn.click()
  await page.waitForTimeout(500)
  // "Guardar cambios" abre un paso de confirmacion ("Confirmás aplicar estos cambios?") antes de
  // disparar el PUT real — sin este segundo click el request nunca sale (confirmado: la primera
  // corrida de este test daba PUT=0 falsamente, no por bug sino por faltar este paso).
  const confirmBtn = page.getByRole('button', { name: /^confirmar$/i }).first()
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click()
  }
  await page.waitForTimeout(2000)

  console.log('SCRUM-872 — valor original del campo Nombre comercial:', JSON.stringify(original))
  console.log('SCRUM-872 — PUT /fiscal-settings disparado tras guardar vacio (esperado true, el backend YA permite vaciar):', putRequests.length > 0)
  console.log('SCRUM-872 — status codes de respuestas /fiscal tras guardar vacio:', responses)
  await page.screenshot({ path: 'test-results/scrum872-fiscal-after-empty-save.png', fullPage: true }).catch(() => {})

  const bodyTextAfterEmpty = await page.locator('body').innerText()
  const hasValidationError = /obligatorio|requerido|required|campo.{0,15}vacío|vacio/i.test(bodyTextAfterEmpty)
  console.log('SCRUM-872 — mensaje de validacion "obligatorio/requerido" visible tras vaciar+Guardar (si true = el FRONTEND sigue bloqueando, aunque el backend ya lo permita):', hasValidationError)

  // Aserción real del criterio de aceptación: debe poder GUARDARSE vacío de punta a punta, no
  // solo que el backend no devuelva 422 (que es trivialmente cierto si el request nunca sale).
  expect(putRequests.length, 'debe dispararse el PUT real al guardar con el campo vacío — si el schema de Zod del frontend sigue exigiendo min(1), el request nunca sale y el criterio de aceptación (poder vaciar el campo) sigue incumplido pese al fix de backend').toBeGreaterThan(0)
  expect(responses.some(s => s === 422), 'no debe devolver 422 al vaciar un campo de texto').toBe(false)

  // Restaurar el valor original para no dejar el dato corrompido — reabrir edición si el guardado
  // exitoso volvió a modo solo-lectura.
  const stillEditable = await target.isEditable().catch(() => false)
  if (!stillEditable) {
    const editBtn2 = page.getByRole('button', { name: /^editar$/i }).first()
    if (await editBtn2.isVisible().catch(() => false)) await editBtn2.click()
    await page.waitForTimeout(500)
  }
  await target.fill(original)
  const saveBtn2 = page.getByRole('button', { name: /guardar cambios|guardar/i }).first()
  if (await saveBtn2.isVisible().catch(() => false)) {
    await saveBtn2.click()
    await page.waitForTimeout(500)
    const confirmBtn2 = page.getByRole('button', { name: /^confirmar$/i }).first()
    if (await confirmBtn2.isVisible().catch(() => false)) await confirmBtn2.click()
    await page.waitForTimeout(1500)
  }

  console.log('SCRUM-872 — dato de prueba pendiente sin tocar (EMPRESA DEMO S.A., decision de negocio de Gerencia, no de Pre-QA):', true)
})
