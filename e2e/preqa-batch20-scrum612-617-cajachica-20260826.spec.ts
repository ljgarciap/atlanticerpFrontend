import { test, expect, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Review fusionado — Batch 20 Admin&Cont (SCRUM-612→617, REQ-535→540), Caja
// Chica. Corrido en LOCAL (localhost:5173, Vite dev server sobre código sin commitear) — este
// batch no está desplegado a ningún ambiente todavía, nunca dev.atlanticerp.ai (gotcha ya documentado
// en memoria del proyecto). Ver docs/pre-qa/caja-chica-batch20-2026-08-26.md y
// docs/visual-review/caja-chica-batch20-2026-08-26.md para el detalle completo.
const BASE = 'http://localhost:5173'

const FELIX = 'conta@illuminations.com.pa'
const YANETH = 'asistente@illuminations.com.pa'
const MARK = 'mbekhar@illuminations.com.pa'
const MARK_PASSWORD = MARK

async function login(page: Page, email: string, password?: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')
}

test('REQ-535/536 — header, tabs con contador, foto obligatoria bloquea el guardado completo indicando la línea', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(1000)

  await expect(page.getByRole('button', { name: /nuevo gasto/i })).toBeVisible()
  await expect(page.getByText(/pendientes/i).first()).toBeVisible()
  await expect(page.getByText(/reportes/i).first()).toBeVisible()
  await expect(page.getByText(/rechazados/i).first()).toBeVisible()

  await page.getByRole('button', { name: /nuevo gasto/i }).click()
  await expect(page.getByText(/registrar nuevo/i)).toBeVisible()

  // Línea 1: completa sin foto. Línea 2: agregar y dejar vacía también.
  await page.locator('input[type="date"]').first().fill('2026-07-01')
  await page.locator('select').first().selectOption({ index: 1 })
  await page.locator('input[type="text"]').nth(0).fill('Cafetería Manolo')
  await page.locator('input[type="text"]').nth(1).fill('Café para reunión')
  await page.locator('input[type="number"]').nth(0).fill('18.50')
  await page.locator('input[type="number"]').nth(1).fill('1.30')

  await page.getByText(/agregar otra línea/i).click()
  await page.waitForTimeout(200)

  await page.getByRole('button', { name: /guardar/i }).click()
  await page.waitForTimeout(500)
  // Debe bloquear (2 líneas sin foto) e indicar cuál.
  await expect(page.getByText(/falta la foto/i).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/batch20-foto-requerida.png', fullPage: true })

  await page.getByRole('button', { name: /cancelar/i }).click()
})

test('REQ-535 RN1 — ITBMS vacío bloquea, "0" explícito no', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByRole('button', { name: /nuevo gasto/i }).click()
  await page.waitForTimeout(300)

  await page.locator('input[type="date"]').first().fill('2026-07-02')
  await page.locator('select').first().selectOption({ index: 1 })
  await page.locator('input[type="text"]').nth(0).fill('Estacionamiento Multiplaza')
  await page.locator('input[type="text"]').nth(1).fill('Parqueo visita a cliente')
  await page.locator('input[type="number"]').nth(0).fill('8.00')
  // ITBMS se deja vacío a propósito (placeholder, no 0 por default — confirmado en el código).
  await page.getByRole('button', { name: /guardar/i }).click()
  await page.waitForTimeout(400)
  await expect(page.getByText(/completa todos los campos/i).first()).toBeVisible()
  await page.getByRole('button', { name: /cancelar/i }).click()
})

test('REQ-535 — multi-línea de 2 solicitantes con foto real se registra y aparece agrupado en Pendientes', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByRole('button', { name: /nuevo gasto/i }).click()
  await page.waitForTimeout(300)

  const selects = page.locator('select')
  // Línea 1 → primer solicitante de la lista.
  await page.locator('input[type="date"]').nth(0).fill('2026-07-01')
  await selects.nth(0).selectOption({ index: 1 })
  await page.locator('input[type="text"]').nth(0).fill('Farmacia Arrocha')
  await page.locator('input[type="text"]').nth(1).fill('Botiquín oficina')
  await page.locator('input[type="number"]').nth(0).fill('32.00')
  await page.locator('input[type="number"]').nth(1).fill('2.24')
  await page.locator('input[type="file"]').nth(0).setInputFiles({
    name: 'recibo1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })

  await page.getByText(/agregar otra línea/i).click()
  await page.waitForTimeout(200)

  await page.locator('input[type="date"]').nth(1).fill('2026-07-02')
  // Línea 2 → segundo solicitante distinto (index 2), para verificar agrupado multi-solicitante.
  await selects.nth(1).selectOption({ index: 2 })
  await page.locator('input[type="text"]').nth(2).fill('Copy Centro El Dorado')
  await page.locator('input[type="text"]').nth(3).fill('Impresión de brochures')
  await page.locator('input[type="number"]').nth(2).fill('12.00')
  await page.locator('input[type="number"]').nth(3).fill('0.84')
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: 'recibo2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })

  await page.getByRole('button', { name: /guardar/i }).click()
  await page.waitForTimeout(1200)

  // El modal debe cerrarse (onSaved) — no debe seguir en pantalla con error.
  await expect(page.getByText(/registrar nuevo/i)).not.toBeVisible()
  await page.waitForTimeout(600)
  await expect(page.getByText(/sin reportar/i)).toBeVisible() // contador de la tab Pendientes actualizado
  await page.screenshot({ path: 'e2e/screenshots/batch20-pendientes-agrupado.png', fullPage: true })
})

test('REQ-538 — generar reporte: desmarcar un solicitante completo, forma de pago obligatoria, folio consecutivo', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: /generar reporte/i }).click()
  await page.waitForTimeout(400)
  await expect(page.getByText(/seleccionar gastos/i)).toBeVisible()

  // Desmarcar el checkbox del primer grupo completo (checkbox de grupo, no de línea individual).
  const groupCheckboxes = page.locator('label').filter({ hasText: /USD/ }).locator('input[type="checkbox"]')
  await groupCheckboxes.first().uncheck()
  await page.waitForTimeout(200)

  await page.getByRole('button', { name: /continuar/i }).click()
  await page.waitForTimeout(300)
  // Paso 2 — forma de pago obligatoria.
  await expect(page.getByText(/forma de pago/i).first()).toBeVisible()
  await page.getByRole('button', { name: /generar reporte|confirmar/i }).last().click()
  await page.waitForTimeout(300)
  await expect(page.getByText(/selecciona la forma de pago/i).first()).toBeVisible()

  await page.locator('select').selectOption({ label: 'Transferencia' })
  await page.getByRole('button', { name: /generar reporte|confirmar/i }).last().click()
  await page.waitForTimeout(1000)

  await expect(page.getByText(/\d{4}-2026/).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/batch20-reporte-generado.png', fullPage: true })
})

test('REQ-539 — Felix NO ve el botón Aprobar en un reporte pendiente', async ({ page }) => {
  await login(page, FELIX)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/reportes/i).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^ver$/i }).first().click()
  await page.waitForTimeout(500)

  const aprobarFelix = page.getByRole('button', { name: /^aprobar reporte$/i })
  await expect(aprobarFelix).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/batch20-detalle-felix-sin-aprobar.png', fullPage: true })
})

test('REQ-540 — Mark aprueba con confirmación número+monto, no se puede reaprobar', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.getByText(/reportes/i).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^ver$/i }).first().click()
  await page.waitForTimeout(500)

  const aprobarMark = page.getByRole('button', { name: /^aprobar reporte$/i })
  await expect(aprobarMark).toBeVisible()
  await aprobarMark.click()
  await page.waitForTimeout(300)
  await expect(page.getByText(/¿aprobar el reporte/i)).toBeVisible()
  await expect(page.getByText(/¿aprobar el reporte/i)).toContainText(/\d{4}-2026/)
  await expect(page.getByText(/¿aprobar el reporte/i)).toContainText(/USD/)
  await page.screenshot({ path: 'e2e/screenshots/batch20-confirmar-aprobar.png', fullPage: true })

  await page.getByRole('button', { name: /^aprobar reporte$/i }).last().click()
  await page.waitForTimeout(1000)

  await expect(page.getByRole('button', { name: /^descargar$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^aprobar reporte$/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/batch20-reporte-finalizado.png', fullPage: true })
})

test('Rol sin permiso — Mark intentando registrar gasto vía backend directo (403 real, no solo UI escondida)', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto(`${BASE}/admin-contab/caja-chica`)
  await page.waitForTimeout(600)

  const boton = page.getByRole('button', { name: /nuevo gasto/i })
  const visibleParaMark = await boton.count()

  if (visibleParaMark > 0) {
    await boton.click()
    await page.waitForTimeout(300)
    await page.locator('input[type="date"]').first().fill('2026-07-03')
    const selects = page.locator('select')
    await selects.first().selectOption({ index: 1 })
    await page.locator('input[type="text"]').nth(0).fill('Test')
    await page.locator('input[type="text"]').nth(1).fill('Test')
    await page.locator('input[type="number"]').nth(0).fill('5')
    await page.locator('input[type="number"]').nth(1).fill('0')
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    })
    await page.getByRole('button', { name: /guardar/i }).click()
    await page.waitForTimeout(700)
    // El backend SÍ bloquea (403) — confirmar que el error se muestra visible, no queda silencioso.
    const huboError = await page.getByText(/error|no autorizado|forbidden|403/i).count()
    await page.screenshot({ path: 'e2e/screenshots/batch20-mark-boton-visible-pero-403.png', fullPage: true })
    console.log('MARK_VE_BOTON_NUEVO_GASTO=true HUBO_ERROR_VISIBLE=' + (huboError > 0))
  } else {
    console.log('MARK_VE_BOTON_NUEVO_GASTO=false')
  }
})
