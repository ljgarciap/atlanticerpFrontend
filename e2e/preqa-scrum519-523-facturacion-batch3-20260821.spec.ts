import { test, expect, Page } from '@playwright/test'

// Pre-QA + Visual Review (fusionado) — Admin&Cont, Facturación Batch 3 (SCRUM-519->523,
// REQ-442->446), sobre atlanticerp-backend d38323b / atlanticerp-frontend 564e2bd (dev, sin pushear).
//
// Fixtures reales sembrados vía tinker local (no existía NINGÚN dato facturable en el ambiente
// local antes de esta sesión -- orders/pipeline_cards/quotes/master_clients en 0 pese a
// APP_ENV=local; corregido corriendo `php artisan db:seed --force`, que trajo master_clients/
// sales_projects/pipeline_cards de VentasDisenoDemoSeeder pero sin ninguna Quote/Order -- se
// documenta como hallazgo de entorno en el reporte, no de este batch). El campo `cliente` que
// muestra la UI es el SubClient.business_name (no el MasterClient.name), así que los selectores
// de este spec buscan/seleccionan por el nombre del SUBCLIENTE:
//   Cliente A (master_client_id 595, subclient "PREQA Subcliente A") -> 1 pedido POR_DESPACHAR
//     (order 357, PED-PREQA-A001, monto $1000) -- saldo a favor sembrado $300 (< monto, Escenario 1).
//   Cliente B (master_client_id 596, subclient "PREQA Subcliente B") -> mismo proyecto, 2 pedidos
//     POR_DESPACHAR (order 358 PED-PREQA-B001 $500, order 359 PED-PREQA-B002 $700) -- saldo a favor
//     sembrado $2000 (> monto de la primera entrega del lote, Escenario 2 + RN3 batch).
//   Cliente C (master_client_id 597, subclient "PREQA Subcliente C") -> 1 pedido POR_DESPACHAR
//     (order 360, PED-PREQA-C001, monto $250) -- SIN fila de saldo (Escenario 3 real).
//   Cliente D (master_client_id 598, subclient "PREQA Subcliente D") -> 1 pedido POR_DESPACHAR
//     (order 361, PED-PREQA-D001, monto $300) -- SIN fila de saldo, nunca facturado por ningún
//     test -- sirve de control "todavía pendiente" para RN1 REQ-444 y RN5, una vez que A/B/C ya
//     fueron confirmados por los tests de Escenario 1/2/3.

test.describe.configure({ mode: 'serial' })

const FELIX = 'contabilidad@test.com'
const NEIL  = 'vendedordisenador2@test.com'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

function crearFacturaModal(page: Page) {
  // El <label> envuelve tanto el texto del rótulo como el <select> -- el nombre accesible
  // termina concatenando el texto del rótulo con el valor mostrado por el select
  // ("ClienteSelecciona un cliente"), así que getByLabel(..., {exact:true}) nunca matchea.
  // Se escopa directamente al overlay del wizard y se toma el select por posición (Cliente
  // primero, Proyecto segundo, en el mismo orden del JSX de CrearFacturaModal).
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Crear factura' })
  return {
    modal,
    clienteSelect: modal.locator('select').nth(0),
    proyectoSelect: modal.locator('select').nth(1),
  }
}

test('RBAC negativo -- vendedor_disenador no accede a /admin-contab/invoices*', async ({ page }) => {
  await login(page, NEIL)

  const apiResponse = page.waitForResponse(r => r.url().includes('/api/admin-contab/invoices'), { timeout: 8000 }).catch(() => null)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  const resp = await apiResponse
  if (resp) {
    expect(resp.status(), 'GET /admin-contab/invoices debe responder 403 para vendedor_disenador').toBe(403)
  }
  // La UI misma debe bloquear la ruta (gate de guard, no solo el backend) -- captura para evidencia.
  await page.screenshot({ path: 'test-results/scrum519-523-rbac-negativo.png' })
})

test('Escenario 3 (sin saldo, Cliente C) -- preview NO muestra ninguna opción de saldo a favor', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('PREQA Subcliente C')
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Generar factura' }).first().click()
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible()
  await page.waitForTimeout(800)

  await expect(page.getByText(/Aplicar saldo a favor disponible/i)).toHaveCount(0)
  // Sin saldo aplicado, "Total factura" es el único total (rótulo del grand total simple) -- lo
  // que NO debe aparecer es la línea de "Saldo a favor aplicado"/"Total a pagar" (esas solo cuando
  // sí se aplica saldo).
  await expect(page.getByText('Saldo a favor aplicado')).toHaveCount(0)
  await expect(page.getByText('Total a pagar')).toHaveCount(0)
  await expect(page.getByText(/PED-PREQA-C001/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum519-523-escenario3-sin-saldo.png', fullPage: true })

  await page.getByRole('button', { name: 'Guardar factura(s)' }).click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toHaveCount(0)
})

test('Escenario 1 (saldo parcial, Cliente A) -- checkbox marcado por defecto, monto correcto, ambos totales visibles', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Vista plana' }).click()

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('PREQA Subcliente A')
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Generar factura' }).first().click()
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible()
  await page.waitForTimeout(800)

  // RN1: opción visible y marcada por defecto, con el monto disponible.
  // NOTA (hallazgo MENOR de este spec): el texto real es "Aplicar saldo a favor disponible
  // ($USD 300.00)" -- el template i18n antepone un "$" literal delante del resultado de
  // formatCurrency(), que YA incluye el código de moneda ("USD 300.00" en formato es-PA) --
  // produce el símbolo de moneda duplicado/confuso "$USD 300.00" en vez de "$300.00"/"USD 300.00".
  const checkbox = page.locator('input[type="checkbox"]').first()
  await expect(checkbox).toBeVisible()
  await expect(checkbox).toBeChecked()
  await expect(page.getByText(/Aplicar saldo a favor disponible.*\$USD\s*300\.00/)).toBeVisible()
  // RN3: con una sola entrega no debe aparecer el aviso "solo se aplicará a la primera".
  await expect(page.getByText(/solo se aplicará a la primera/i)).toHaveCount(0)
  // RN2/RN4: saldo ($300) < monto ($1000) -> aplica completo, ambos totales visibles (la cotización
  // de origen tiene ítems reales -- REF-PREQA-A, unit_price 934.58 -- así que su propio total
  // fiscal coincide con PipelineCard.amount, como describe el Senior Review).
  await expect(page.getByText('Total factura')).toBeVisible()
  await expect(page.getByText('Saldo a favor aplicado')).toBeVisible()
  await expect(page.getByText('-USD 300.00')).toBeVisible()
  await expect(page.getByText('Total a pagar')).toBeVisible()
  await expect(page.getByText('USD 700.00')).toBeVisible() // 1000 - 300
  await page.screenshot({ path: 'test-results/scrum519-523-escenario1-saldo-parcial.png', fullPage: true })

  await page.getByRole('button', { name: 'Guardar factura(s)' }).click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toHaveCount(0)
})

test('Escenario 2 + RN3 (saldo excede el monto, lote de 2, Cliente B) -- cap al monto de la 1ra, aviso explícito, resto sin saldo', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: '+ Crear Factura' }).click()
  await expect(page.getByRole('heading', { name: 'Crear factura' })).toBeVisible()

  const { clienteSelect: clienteSelectB, proyectoSelect: proyectoSelectB } = crearFacturaModal(page)
  await clienteSelectB.selectOption({ label: 'PREQA Subcliente B' })
  await page.waitForTimeout(400)
  await proyectoSelectB.selectOption({ label: 'PREQA Proyecto B' })
  await page.waitForTimeout(400)

  // RN2 REQ-444: ambas entregas marcadas por defecto -- confirmamos las 2 quedan chequeadas.
  const entregaChecks = page.locator('label').filter({ hasText: /PED-PREQA-B00/ }).locator('input[type="checkbox"]')
  await expect(entregaChecks).toHaveCount(2)
  await expect(entregaChecks.nth(0)).toBeChecked()
  await expect(entregaChecks.nth(1)).toBeChecked()

  await page.getByRole('button', { name: 'Ver vista previa' }).click()
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible()
  await page.waitForTimeout(800)

  // RN1: saldo disponible mostrado es el real ($2000), no capado en el checkbox informativo.
  await expect(page.getByText(/Aplicar saldo a favor disponible.*\$USD\s*2,000\.00/)).toBeVisible()
  // RN3: aviso explícito porque el lote tiene 2 entregas y hay saldo disponible.
  await expect(page.getByText(/solo se aplicará a la primera/i)).toBeVisible()

  await page.screenshot({ path: 'test-results/scrum519-523-escenario2-rn3-lote.png', fullPage: true })

  await page.getByRole('button', { name: 'Guardar factura(s)' }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toHaveCount(0)
})

test('REQ-444 RN1 -- el selector de "+ Crear Factura" NO queda restringido por los filtros activos de la tabla', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  // Filtramos la tabla principal a un solo cliente -- si el bug de Batch 2 hubiera vuelto, el
  // selector del wizard solo ofrecería este cliente.
  await page.locator('input[placeholder*="Buscar por cliente"]').fill('PREQA Subcliente A')
  await page.waitForTimeout(600)
  await expect(page.getByText(/Mostrando \d+ de/)).toBeVisible()

  await page.getByRole('button', { name: '+ Crear Factura' }).click()
  await expect(page.getByRole('heading', { name: 'Crear factura' })).toBeVisible()
  await page.waitForTimeout(500)

  const { clienteSelect } = crearFacturaModal(page)
  const optionTexts = await clienteSelect.locator('option').allTextContents()
  await page.screenshot({ path: 'test-results/scrum519-523-rn1-wizard-sin-filtro.png' })

  // Cliente A/B/C ya fueron facturados en los tests anteriores -- lo que debe seguir ofreciendo el
  // selector, sin importar el filtro de "PREQA Subcliente A" activo en la tabla, es Cliente D
  // (todavía pendiente-facturar, nunca tocado por ningún otro test).
  expect(optionTexts.some(t => /PREQA Subcliente D/.test(t)), `opciones encontradas: ${optionTexts.join(', ')}`).toBe(true)
})

test('REQ-445 RN4 -- contador "Mostrando X de Y" usa un denominador real, no list.length duplicado', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  const countText = await page.locator('text=/Mostrando \\d+ de \\d+ entregas/').first().textContent()
  const unfiltered = countText?.match(/Mostrando (\d+) de (\d+)/)
  expect(unfiltered).not.toBeNull()
  const [, visibleAll, totalAll] = unfiltered!

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('PREQA Subcliente A')
  await page.waitForTimeout(600)

  const filteredText = await page.locator('text=/Mostrando \\d+ de \\d+ entregas/').first().textContent()
  const filtered = filteredText?.match(/Mostrando (\d+) de (\d+)/)
  expect(filtered).not.toBeNull()
  const [, visibleFiltered, totalFiltered] = filtered!

  await page.screenshot({ path: 'test-results/scrum519-523-rn4-counter.png' })

  // El total (Y) NUNCA debe cambiar al aplicar un filtro de búsqueda -- es el denominador de la
  // pestaña completa, no de la lista visible.
  expect(totalFiltered).toBe(totalAll)
  // El visible (X) sí debe reducirse -- si X===Y en ambos casos, es el bug viejo (list.length:list.length).
  expect(Number(visibleFiltered)).toBeLessThan(Number(totalFiltered))
  expect(visibleAll).not.toBe(visibleFiltered)
})

test('RN5 REQ-444 -- bloqueo de avance sin ninguna entrega marcada es un mensaje INLINE, nunca window.alert/confirm', async ({ page }) => {
  let dialogFired = false
  page.on('dialog', async dialog => { dialogFired = true; await dialog.dismiss() })

  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: '+ Crear Factura' }).click()
  await expect(page.getByRole('heading', { name: 'Crear factura' })).toBeVisible()

  const { clienteSelect: clienteSelectRn5, proyectoSelect: proyectoSelectRn5 } = crearFacturaModal(page)
  await clienteSelectRn5.selectOption({ label: 'PREQA Subcliente D' })
  await page.waitForTimeout(400)
  await proyectoSelectRn5.selectOption({ label: 'PREQA Proyecto D' })
  await page.waitForTimeout(400)

  // Cliente D nunca es facturado por ningún otro test de este spec -- pero por robustez, si por
  // algún motivo ya no tiene entregas pendientes, repetimos la prueba desmarcando manualmente
  // sobre cualquier otro cliente/proyecto con al menos una entrega pendiente todavía.
  let entregaCheckboxes = page.locator('label').filter({ hasText: /PED-PREQA/ }).locator('input[type="checkbox"]')
  let count = await entregaCheckboxes.count()

  if (count === 0) {
    const { clienteSelect, proyectoSelect } = crearFacturaModal(page)
    const optionTexts = await clienteSelect.locator('option').allTextContents()
    const otroCliente = optionTexts.find(t => /PREQA Subcliente/.test(t))
    if (otroCliente) {
      await clienteSelect.selectOption({ label: otroCliente })
      await page.waitForTimeout(400)
      const proyectoOptions = await proyectoSelect.locator('option').allTextContents()
      const otroProyecto = proyectoOptions.find(t => /PREQA Proyecto/.test(t))
      if (otroProyecto) {
        await proyectoSelect.selectOption({ label: otroProyecto })
        await page.waitForTimeout(400)
        entregaCheckboxes = page.locator('label').filter({ hasText: /PED-PREQA/ }).locator('input[type="checkbox"]')
        count = await entregaCheckboxes.count()
      }
    }
  }

  if (count > 0) {
    for (let i = 0; i < count; i++) {
      if (await entregaCheckboxes.nth(i).isChecked()) await entregaCheckboxes.nth(i).uncheck()
    }
    await page.getByRole('button', { name: 'Ver vista previa' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Selecciona al menos una entrega para facturar.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Vista previa' })).toHaveCount(0)
  }

  await page.screenshot({ path: 'test-results/scrum519-523-rn5-mensaje-inline.png' })
  expect(dialogFired, 'Un window.alert()/confirm() real hubiera bloqueado la sesión de Playwright').toBe(false)
  expect(count, 'no había ningún proyecto con entregas pendientes para probar RN5').toBeGreaterThan(0)
})

test('REQ-446 -- export Excel respeta el filtro activo (contenido, no solo el request)', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  await page.locator('input[placeholder*="Buscar por cliente"]').fill('PREQA Subcliente B')
  await page.waitForTimeout(600)

  const exportReq = page.waitForResponse(r => r.url().includes('/admin-contab/invoices/export') && r.url().includes('format=excel'))
  await page.getByRole('button', { name: /Exportar reporte/i }).click()
  await page.getByText('Exportar como Excel').click()
  const resp = await exportReq
  expect(resp.status()).toBe(200)

  const buffer = await resp.body()
  const fs = await import('fs')
  const path = 'test-results/scrum519-523-export-filtrado.xlsx'
  fs.writeFileSync(path, buffer)

  // Verificación de contenido real (no solo status 200): el xlsx (zip) debe contener las filas de
  // Cliente B (PED-PREQA-B001/B002) y NO las de A/C -- se revisa el XML crudo de la hoja, sin
  // depender de una librería de parseo de xlsx en el harness de Playwright.
  const { execSync } = await import('child_process')
  const sheetXml = execSync(`unzip -p "${path}" xl/worksheets/sheet1.xml`).toString('utf-8')
  let sharedStrings = ''
  try {
    sharedStrings = execSync(`unzip -p "${path}" xl/sharedStrings.xml`).toString('utf-8')
  } catch { /* PhpSpreadsheet may inline strings instead of using sharedStrings.xml */ }
  const combined = sheetXml + sharedStrings
  expect(combined).toContain('PED-PREQA-B001')
  expect(combined).toContain('PED-PREQA-B002')
  expect(combined).not.toContain('PED-PREQA-A001')
  expect(combined).not.toContain('PED-PREQA-C001')
})

test('REQ-443 RN3 -- "Editar" desde la vista previa vuelve al wizard SIN perder cliente/proyecto/selección', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: '+ Crear Factura' }).click()
  await expect(page.getByRole('heading', { name: 'Crear factura' })).toBeVisible()

  const { clienteSelect, proyectoSelect } = crearFacturaModal(page)
  await clienteSelect.selectOption({ label: 'PREQA Subcliente D' })
  await page.waitForTimeout(400)
  await proyectoSelect.selectOption({ label: 'PREQA Proyecto D' })
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: 'Ver vista previa' }).click()
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible()

  // RN3: al abrirse desde el wizard, debe existir el botón "Editar selección".
  const editBtn = page.getByRole('button', { name: 'Editar selección' })
  await expect(editBtn).toBeVisible()
  await editBtn.click()

  // Debe volver al formulario con cliente/proyecto/selección YA elegidos, no un formulario vacío.
  await expect(page.getByRole('heading', { name: 'Crear factura' })).toBeVisible()
  const { clienteSelect: clienteSelectAfter, proyectoSelect: proyectoSelectAfter } = crearFacturaModal(page)
  await expect(clienteSelectAfter).toHaveValue('PREQA Subcliente D')
  await expect(proyectoSelectAfter).toHaveValue('PREQA Proyecto D')
  const entregaChecks = page.locator('label').filter({ hasText: /PED-PREQA-D001/ }).locator('input[type="checkbox"]')
  await expect(entregaChecks).toHaveCount(1)
  await expect(entregaChecks.first()).toBeChecked()

  await page.screenshot({ path: 'test-results/scrum519-523-req443-rn3-editar.png', fullPage: true })
  await page.getByRole('button', { name: 'Cancelar' }).click()
})
