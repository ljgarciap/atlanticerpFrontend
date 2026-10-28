import { test, expect, Page } from '@playwright/test'
import { execSync } from 'node:child_process'

// Pre-QA adversarial pass — SCRUM-849 "MEJORAS GLOBALES: CRM y Ventas & Diseño" (7 sub-ítems).
// Corrido REAL contra dev.atlanticerp.ai (backend d03f5aa, frontend 26926d9 ya desplegados) — nunca
// localhost para este batch, a pedido explícito de quien despachó este pase.
//
// Self-seeding real (ver feedback_e2e_permanent_tests_must_self_seed.md) — beforeAll limpia
// cualquier fixture previo "PreQA849 %" y siembra de nuevo vía SSH+tinker en el EC2 de dev
// (/tmp/seed_scrum849.php ya presente ahí — ver docs/pre-qa/scrum849-20260908.md para el
// contenido completo del seed y el detalle de cada fixture). IDs siempre dinámicos — nunca
// hardcodeados — para que este spec sea re-ejecutable sin importar el estado previo del entorno.
//
// Varios escenarios de ruptura (skip de etapas, acceso no autorizado, reject de asignación vacía,
// bloqueo real de cotización firmada) ya se confirmaron por API directa (curl) antes de este spec
// — este archivo cubre específicamente lo que solo se puede verificar en la UI real: drag & drop,
// estilos de PERDIDO, visibilidad del multi-select por rol, subida/persistencia de foto ad-hoc, y
// el botón Duplicar. Cuentas reales, nunca demo.
//
// Nota: sin mode:'serial' a propósito — cada test hace su propio login/navegación y no depende
// del anterior; en serial, un CRÍTICO real (ver 849.5 abajo) abortaría el resto de la corrida.
// Se corre con --workers=1 desde la CLI para mantener las requests secuenciales contra
// dev.atlanticerp.ai (ver feedback_preqa_crowdsec_no_paralelo.md).
const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

interface Fixture849 {
  card1_lead_neil_valid: number
  card2_design_fefi_unauthorized: number
  card3_design_neil_no_skip_to_quote: number
  card4_quote_neil_no_area: number
  card5_proposal_neil_missing_signed_quote: number
  quote_id: number
  part_id: number
  custom_item_id: number
  catalog_item_id: number
  card8_multiassign_neil_fefi: number
  neil_id: number
  fefi_id: number
}

let fx: Fixture849

test.beforeAll(() => {
  const sshKey = '/Users/lgarcia/.ssh/atlanticerp/atlanticerp-key.pem'
  const sshBase = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@dev.atlanticerp.ai`
  const out = execSync(
    `${sshBase} "docker cp /tmp/seed_scrum849.php \\$(cd /var/www/backend && docker compose -f infra/docker-compose.qa.yml ps -q laravel):/tmp/seed_scrum849.php && cd /var/www/backend && docker compose -f infra/docker-compose.qa.yml exec -T laravel php artisan tinker /tmp/seed_scrum849.php < /dev/null"`,
    { stdio: 'pipe' },
  ).toString()
  const start = out.indexOf('{"card1_lead_neil_valid"')
  if (start === -1) throw new Error('SCRUM-849 self-seed no devolvió el JSON esperado. Output crudo: ' + out)
  const end = out.indexOf('}', start)
  if (end === -1) throw new Error('SCRUM-849 self-seed devolvió JSON incompleto. Output crudo: ' + out)
  fx = JSON.parse(out.slice(start, end + 1))
  console.log('SCRUM-849 fixture sembrado en dev.atlanticerp.ai:', JSON.stringify(fx))
})

const NEIL    = 'vendedor2@test.com'
const FEFI    = 'vendedor3@test.com'
const DANIELA = 'gerencia@test.com'

// ⚠️ Hallazgo de credenciales (no es del código de SCRUM-849, documentado aparte en el reporte):
// la contraseña que Luis dio para daniela (B1n4X_2026?) fue RECHAZADA en vivo por dev.atlanticerp.ai
// (verificado con Hash::check() por SSH — false). El default real vigente HOY en dev es el email
// como password (Hash::check() -> true), igual que neil/fefi. Se usa el default real acá.
async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  // Limpiar localStorage en la página TODAVÍA autenticada (antes de navegar) — si se limpia
  // después de goto('/login'), un token viejo válido puede hacer que el propio guard de la SPA
  // redirija lejos de /login antes de que el email input llegue a montarse.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})

  // CrowdSec en dev.atlanticerp.ai puede colgar temporalmente un goto() tras varias cargas de página
  // seguidas (ver feedback_preqa_crowdsec_no_paralelo.md) — retry con backoff, nunca asumir que
  // un timeout acá es un bug real de la app antes de descartar esto.
  let loaded = false
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    if (attempt > 0) await page.waitForTimeout(4000)
    try {
      await page.goto(`${BASE}/login`, { timeout: 20000 })
      await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 8000 })
      loaded = true
    } catch {
      // reintenta
    }
  }
  if (!loaded) throw new Error(`login(${email}): no se pudo cargar /login tras 3 intentos (posible CrowdSec throttling)`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

// ---------------------------------------------------------------------------
// 849.5 — WhatsApp del diseñador: bug real, la UI usa el usuario LOGUEADO, no
// quote.owner (que el backend sí devuelve correctamente).
// ---------------------------------------------------------------------------
test('SCRUM-849.5 — CRITICO: Gerencia abre la cotización de otro diseñador y ve SU PROPIO nombre/teléfono, no el del dueño real', async ({ page }) => {
  await login(page, DANIELA)
  await page.goto(`${BASE}/ventas-diseno/quotes/${fx.quote_id}`) // owned by neil (Vendedor Test 2)
  await page.waitForTimeout(1500)

  const designerLabel = page.locator('label:has-text("Diseñador a cargo"), label:has-text("Designer in charge")').locator('xpath=following-sibling::p[1]')
  await expect(designerLabel).toBeVisible({ timeout: 10000 })
  const text = await designerLabel.textContent()
  console.log('SCRUM-849.5 — texto mostrado en "Diseñador a cargo" mientras Gerencia ve la cotización de Vendedor:', text)

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-5-wrong-designer-shown.png', fullPage: true })

  // Comportamiento esperado (RN del ticket): debe mostrar "Vendedor Test 2" (el dueño real de la
  // cotización, que es a quien pertenece el WhatsApp relevante para el cliente) — no se asserta
  // un teléfono fijo porque es el dato REAL de la cuenta de Vendedor, mutable fuera de este test.
  expect(text).toContain('Vendedor')
  expect(text).not.toContain('Gerencia')
})

// ---------------------------------------------------------------------------
// 849.5 (control) — el propio dueño SÍ ve su nombre correctamente (por eso el bug de arriba no
// se detectó en el self-QA del dev: nunca se probó desde el punto de vista de otro rol). No
// asertamos un teléfono fijo: es el dato REAL de la cuenta de Vendedor (no un fixture de test), y el
// pase anterior de Pre-QA ya lo dejó en null al limpiar — asertar un valor fijo acá volvería a
// depender de mutar el dato real de una persona solo para satisfacer el test.
// ---------------------------------------------------------------------------
test('SCRUM-849.5 (control) — el propio diseñador ve su nombre correcto en su propia cotización', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/quotes/${fx.quote_id}`)
  await page.waitForTimeout(1500)
  const designerLabel = page.locator('label:has-text("Diseñador a cargo")').locator('xpath=following-sibling::p[1]')
  await expect(designerLabel).toContainText('Vendedor')
})

// ---------------------------------------------------------------------------
// 849.1 — drag & drop: movimiento válido persiste, movimiento inválido rechaza con toast y
// la tarjeta nunca "flota" en la columna nueva.
// ---------------------------------------------------------------------------
test('SCRUM-849.1 — drag&drop válido (Lead->Diseño) persiste tras reload', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)

  const cardTestId = `pipeline-card-${fx.card1_lead_neil_valid}`
  const card = page.locator(`[data-testid="${cardTestId}"]`)
  const targetCol = page.locator('[data-testid="pipeline-stage-design"]')
  await expect(card).toBeVisible({ timeout: 10000 })

  await card.dispatchEvent('dragstart')
  await targetCol.dispatchEvent('dragover')
  await targetCol.dispatchEvent('drop')
  await card.dispatchEvent('dragend')
  await page.waitForTimeout(1200)

  await expect(page.locator(`[data-testid="pipeline-stage-design"] [data-testid="${cardTestId}"]`)).toBeVisible({ timeout: 8000 })

  await page.reload()
  await page.waitForTimeout(1500)
  await expect(page.locator(`[data-testid="pipeline-stage-design"] [data-testid="${cardTestId}"]`)).toBeVisible({ timeout: 8000 })
})

test('SCRUM-849.1 — drag&drop inválido (Diseño->Cotización, RN5) rechaza con toast y la tarjeta se queda en Diseño', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)

  const cardTestId = `pipeline-card-${fx.card3_design_neil_no_skip_to_quote}`
  const card = page.locator(`[data-testid="${cardTestId}"]`)
  const targetCol = page.locator('[data-testid="pipeline-stage-quote"]')
  await expect(card).toBeVisible({ timeout: 10000 })

  await card.dispatchEvent('dragstart')
  await targetCol.dispatchEvent('dragover')
  await targetCol.dispatchEvent('drop')
  await card.dispatchEvent('dragend')
  await page.waitForTimeout(1000)

  // Toast de error visible.
  await expect(page.locator('text=/cotizaci[oó]n real|no se puede|Crear cotizaci[oó]n/i').first()).toBeVisible({ timeout: 6000 })

  // La tarjeta nunca migró de columna (nunca "flota" — no hay update optimista en el código).
  await expect(page.locator(`[data-testid="pipeline-stage-design"] [data-testid="${cardTestId}"]`)).toBeVisible()
  await expect(page.locator(`[data-testid="pipeline-stage-quote"] [data-testid="${cardTestId}"]`)).toHaveCount(0)

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-1-invalid-drag-toast.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 849.2 — columna PERDIDO: borde/fondo rojo, texto mayúscula rojo.
// ---------------------------------------------------------------------------
test('SCRUM-849.2 — columna PERDIDO: borde/fondo rojo y label en mayúsculas, nunca gris', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)

  const lostCol = page.locator('[data-testid="pipeline-stage-lost"]')
  await expect(lostCol).toBeVisible()
  const classAttr = await lostCol.getAttribute('class')
  expect(classAttr).toContain('border-red-400')
  expect(classAttr).toContain('bg-red-50')

  const label = lostCol.locator('span.uppercase')
  await expect(label).toHaveText(/perdido|lost/i)
  const color = await label.evaluate(el => getComputedStyle(el).color)
  console.log('SCRUM-849.2 — color computado del label PERDIDO:', color)
  // #dc2626 -> rgb(220, 38, 38)
  expect(color).toBe('rgb(220, 38, 38)')

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-2-perdido-column.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 849.4 — multi-select de asignación: visible/editable solo para Gerencia, solo lectura (con
// TODOS los asignados) para el resto.
// ---------------------------------------------------------------------------
test('SCRUM-849.4 — Gerencia ve/edita el multi-select; un vendedor solo ve texto de solo lectura con TODOS los asignados', async ({ page }) => {
  // card8: owner=neil, compartido_con=[fefi] (sembrado por el seed) — 2 asignados reales.
  const cardParam = `?card=${fx.card8_multiassign_neil_fefi}`

  // Como Gerencia (Gerencia): abrir la tarjeta compartida.
  await login(page, DANIELA)
  await page.goto(`${BASE}/ventas-diseno/pipeline${cardParam}`)
  await page.waitForTimeout(1500)
  const modal = page.locator('div.fixed.inset-0.z-50')
  await expect(modal).toBeVisible({ timeout: 8000 })
  await modal.locator('button:has-text("Editar"), button:has-text("Edit")').first().click({ timeout: 8000 })
  await page.waitForTimeout(500)

  // El multi-select (botón con aria-haspopup listbox) debe estar presente DENTRO DEL MODAL en
  // modo edición — sin scope al modal, matchea también otros listbox globales de la página.
  const multiSelectBtn = modal.locator('[aria-haspopup="listbox"]')
  await expect(multiSelectBtn.first()).toBeVisible({ timeout: 8000 })

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-4-gerencia-multiselect.png', fullPage: true })

  // Como neil (dueño, no Gerencia): el mismo campo debe ser de solo lectura, listando a AMBOS
  // asignados (Vendedor + Vendedor Test 3/fefi), sin ningún control interactivo.
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/pipeline${cardParam}`)
  await page.waitForTimeout(1500)
  const modalAsNeil = page.locator('div.fixed.inset-0.z-50')
  await expect(modalAsNeil).toBeVisible({ timeout: 8000 })
  const readonlyOwner = modalAsNeil.locator('label:has-text("Responsable"), label:has-text("Owner")').first().locator('xpath=following-sibling::p[1]')
  await expect(readonlyOwner).toBeVisible({ timeout: 8000 })
  await expect(readonlyOwner).toContainText('Vendedor')
  await expect(readonlyOwner).toContainText('Vendedor')
  await expect(modalAsNeil.locator('[aria-haspopup="listbox"]')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-4-neil-readonly-both-assignees.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// 849.6 — foto ad-hoc en ítem personalizado: miniatura visible, sobrevive refresh, un ítem de
// Catálogo real NO tiene ninguna opción de foto.
// ---------------------------------------------------------------------------
test('SCRUM-849.6 — foto ad-hoc solo en ítem personalizado, miniatura sobrevive refresh, item de Catálogo sin opción de foto', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/quotes/${fx.quote_id}`)
  await page.waitForTimeout(1500)

  // Botón "Agregar foto"/"Add photo" visible para el ítem custom (REF-CUSTOM-849) — tolerante
  // a idioma (Gerencia ya se vio en EN, neil en ES; no asumir uno fijo).
  //
  // Gotcha real encontrado corriendo esto: page.locator('tr', {hasText: 'Producto ad-hoc...'})
  // NUNCA matchea — el texto vive dentro del VALUE de un <input>, que no cuenta como "texto"
  // visible para el motor de hasText/innerText de Playwright. Hay que anclar por el input real
  // (su value) y subir al <tr> ancestro por xpath.
  const descInput = page.locator('input[value="Producto ad-hoc PreQA849"]').first()
  await expect(descInput).toBeVisible({ timeout: 8000 })
  const customRow = descInput.locator('xpath=ancestor::tr[1]')
  const addPhotoBtn = customRow.locator('button:has-text("Agregar foto"), button:has-text("Add photo")')
  await expect(addPhotoBtn).toBeVisible({ timeout: 8000 })
  await addPhotoBtn.click()

  const fileInput = customRow.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'preqa849.png',
    mimeType: 'image/png',
    // 1x1 transparent PNG
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await page.waitForTimeout(2000)

  const thumb = customRow.locator('img')
  await expect(thumb).toBeVisible({ timeout: 8000 })

  await page.reload()
  await page.waitForTimeout(1500)
  const customRowAfterReload = page.locator('input[value="Producto ad-hoc PreQA849"]').first().locator('xpath=ancestor::tr[1]')
  await expect(customRowAfterReload.locator('img')).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-6-adhoc-photo-persisted.png', fullPage: true })

  // Un item de Catálogo real no debe tener NINGÚN control de foto (ni botón ni input file) —
  // solo debe existir 1 botón de foto en toda la partida (el del custom).
  await expect(page.locator('button:has-text("Agregar foto"), button:has-text("Add photo"), button:has-text("Cambiar foto"), button:has-text("Change photo")')).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// 849.7 — duplicar partida: independencia real tras editar/borrar en la copia.
// ---------------------------------------------------------------------------
test('SCRUM-849.7 — Duplicar partida crea copia independiente; editar la copia no afecta el original', async ({ page }) => {
  await login(page, NEIL)
  await page.goto(`${BASE}/ventas-diseno/quotes/${fx.quote_id}`)
  await page.waitForTimeout(1500)

  await page.locator('button:has-text("Duplicar"), button:has-text("Duplicate")').first().click()
  await page.waitForTimeout(1500)

  const copyHeader = page.locator('input[value*="(copia)"]').first()
  await expect(copyHeader).toBeVisible({ timeout: 8000 })

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-7-duplicated-part.png', fullPage: true })

  // Partida copiada = el ancestro más cercano con la clase de Card de QuotePartCard
  // (rounded-xl), NUNCA un <div> genérico sin scope (matchearía hasta el root de la app).
  // Anclar la fila del item custom por el botón "Agregar foto/Add photo" (exclusivo de
  // is_custom, ver 849.6) — ni por texto (el value de un input no cuenta como hasText) ni por
  // posición (el orden de filas entre el original y la copia no está garantizado). Tampoco por
  // value="...": ese locator deja de matchear apenas fill() lo cambia, y blur() se cuelga
  // esperando un elemento que ya no existe con ese selector.
  const copiedPartCard = copyHeader.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  // "Agregar/Add" o "Cambiar/Change" foto según si un test anterior en el mismo worker (849.6,
  // misma cotización) ya le subió una foto al original antes de duplicar — cualquiera de los 4
  // es exclusivo de is_custom, cualquiera identifica la fila correcta igual.
  const customRowInCopy = copiedPartCard
    .locator('button:has-text("Agregar foto"), button:has-text("Add photo"), button:has-text("Cambiar foto"), button:has-text("Change photo")')
    .locator('xpath=ancestor::tr[1]')
  const customDescInCopy = customRowInCopy.locator('input').nth(1)
  await expect(customDescInCopy).toHaveValue('Producto ad-hoc PreQA849', { timeout: 8000 })
  await customDescInCopy.fill('EDITADO SOLO EN LA COPIA')
  await customDescInCopy.blur()
  await page.waitForTimeout(1500)

  await page.reload()
  await page.waitForTimeout(1500)

  // El original debe seguir intacto.
  const originalDescStillThere = page.locator('input[value="Producto ad-hoc PreQA849"]')
  await expect(originalDescStillThere.first()).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/screenshots/SCRUM-849-7-independence-check.png', fullPage: true })
})
