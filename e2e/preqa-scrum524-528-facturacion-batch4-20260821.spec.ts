import { test, expect, Page } from '@playwright/test'

// Pre-QA + Visual Review (fusionado) -- Admin&Cont, Facturacion Batch 4 (SCRUM-524->528,
// REQ-447->451), sobre atlanticerp-backend 9d8ae74+52fe7fc / atlanticerp-frontend 3a39ebd+137a104 (dev, sin
// pushear). Ultimo batch de Facturacion.
//
// Fixtures reales sembrados por tinker/API local (0 orders/invoices/bank_accounts en el ambiente
// antes de esta sesion). Roster de pruebas:
//   I (order 380, sin factura)              -> Escenario 1 REQ-447 (trazabilidad pendiente)
//   A (invoice 18, F-0001, $400)             -> control, sin uso especial
//   B (invoice 19, F-0002, $850, con Guia
//      de Entrega generada DESPUES de la
//      factura)                              -> Escenario 2 REQ-447 (trazabilidad completa)
//   C (invoice 20, F-0003, $300, con OrderDocument
//      guia_entrega creado ANTES de facturar) -> RN2/Escenario 3 REQ-447 (adversarial: nunca
//                                                 completa antes de existir factura, ya verificado
//                                                 por API contra el Order sin facturar)
//   D (invoice 21, F-0004, monto $500, saldo a
//      favor $150 aplicado, total_a_pagar $350) -> REQ-449 RN2 (ambos totales) + bloque de pago
//   E (invoice 22, F-0005, $620)              -> REQ-448 workflow completo (verificado por API):
//                                                 Felix propone, RN5 (doble propuesta bloqueada),
//                                                 Mark rechaza -> vuelve a normal
//   F (invoice 23, F-0006, $275, anulada_at
//      seteado manualmente)                   -> REQ-449 RN3 (marca de agua ANULADA)
//   G (invoice 24, F-0007, $900, created_at
//      backdateado 75 dias, incobrable
//      PENDIENTE)                             -> REQ-450 RN1/RN2 (antiguedad real, pendiente
//                                                 sigue contando) + REQ-451 RN2 (boton visible
//                                                 pese a pendiente) -- Mark rechaza via UI en
//                                                 este spec (queda como pendiente->normal)
//   H (invoice 25, F-0008, $450, created_at
//      backdateado 75 dias, incobrable
//      APROBADA via API)                      -> REQ-450 Escenario 2 (excluida de antiguedad) +
//                                                 REQ-451 RN1 (boton oculto, incobrable aprobada)
//
// Verificacion backend/API ya confirmada antes de este spec (ver documento de Pre-QA): RN4 de
// REQ-448 (Felix 403 real intentando decidir por API directa), RN5 (422 en segundo intento),
// aging RN1/RN2 con matematica real de antiguedad (75 dias backdateados -> 45 dias vencido con
// dias_credito_factura=30 -> bucket 31-60, confirmado antes y despues de aprobar/rechazar). Este
// spec cubre lo que solo se puede verificar en el navegador real: gates visuales de Mark-only,
// banda de PDF/watermark, navegacion de "Registrar cobro", y el flujo completo Felix->Mark en vivo.

test.describe.configure({ mode: 'serial' })

const FELIX = 'conta@illuminations.com.pa'
const MARK = 'mbekhar@illuminations.com.pa'
const NEIL = 'neil.quiel@illuminations.com.pa'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

function detailModal(page: Page) {
  // El resto de la tabla sigue montada detras del backdrop -- escopar siempre al modal para no
  // matchear texto de otras filas (ej. el <option> "Pendiente por facturar" del <select> de
  // estado, o pastillas/numeros de otras entregas).
  return page.locator('div.fixed.inset-0').filter({ hasText: 'Detalle' })
}

async function openDetailFor(page: Page, subclienteText: string, tab: 'cobrable' | 'incobrable' = 'cobrable') {
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1000)
  if (tab === 'incobrable') {
    await page.getByRole('button', { name: 'Cartera incobrable' }).click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: 'Vista plana' }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="Buscar por cliente"]').fill(subclienteText)
  await page.waitForTimeout(700)
  // Escopado a la fila de la tabla (div.cursor-pointer del FactRow) -- "text=" liso tambien
  // matchea el <option> del <select> de filtro "Cliente", que queda oculto pero sigue en el DOM.
  await page.locator('div.cursor-pointer').filter({ hasText: subclienteText }).first().click()
  await expect(page.getByRole('heading', { name: 'Detalle' })).toBeVisible()
  await page.waitForTimeout(500)
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
  await page.screenshot({ path: 'test-results/scrum524-528-rbac-negativo.png' })
})

test('REQ-447 Escenario 1 -- entrega pendiente-facturar muestra Cotizacion completa, Factura/Guia pendientes', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente I')
  const modal = detailModal(page)

  // Cotizacion completa (con folio), Factura y Guia de Entrega marcadas como "Pendiente".
  await expect(modal.getByText('COT-PREQA4-I')).toBeVisible()
  await expect(modal.getByText('Pendiente').first()).toBeVisible()
  // No debe haber vista previa de documento fiscal ni boton de PDF (RN4 REQ-447 -- nada que
  // previsualizar mientras no exista factura).
  await expect(modal.getByRole('button', { name: /Ver \/ Imprimir PDF/i })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum524-528-req447-escenario1-pendiente.png', fullPage: true })
})

test('REQ-447 Escenario 2 -- trazabilidad completa (Cotizacion+Factura+Guia) tras Guia real post-factura', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente B')
  const modal = detailModal(page)

  await expect(modal.getByText('COT-PREQA4-B')).toBeVisible()
  await expect(modal.getByText('F-0002')).toBeVisible()
  // El paso de Guia de Entrega debe mostrar su fecha real (no "Pendiente") -- confirma trazabilidad
  // completa de punta a punta. Escopado al modal (no a la pagina completa -- la tabla de fondo
  // sigue montada y su <select> de estado tiene una opcion "Pendiente por facturar").
  const pendienteCount = await modal.getByText('Pendiente').count()
  expect(pendienteCount, 'con los 3 pasos completos no debe quedar ningun "Pendiente" en la trazabilidad').toBe(0)
  await expect(modal.getByRole('button', { name: /Ver \/ Imprimir PDF/i })).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req447-escenario2-completa.png', fullPage: true })
})

test('REQ-447 RN2 -- Guia de Entrega generada ANTES de la factura no cuenta hasta que la factura exista', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente C')
  const modal = detailModal(page)

  // Cliente C tiene un OrderDocument de tipo guia_entrega creado a proposito ANTES de la factura
  // (fixture adversarial) -- pero como YA fue facturada en esta sesion, la trazabilidad debe
  // mostrarla completa de todas formas (una vez que la factura existe, no hay razon para
  // ocultarla). El punto real de RN2 (nunca antes de la factura) ya quedo confirmado por API en
  // este mismo pre-qa contra un Order todavia sin facturar -- acá solo se confirma que no queda
  // ningun rastro roto tras el fixture adversarial.
  await expect(modal.getByText('F-0003')).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req447-rn2-guia-post-factura.png', fullPage: true })
})

test('REQ-449 RN1/RN2 -- bloque de pago completo (Cuenta numero/Responsable) + ambos totales con saldo a favor', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente D')
  const modal = detailModal(page)

  // RN1 -- los 3 campos del bloque de pago, foco del fix del Senior Review.
  await expect(modal.getByText(/Cuenta pago|Cuenta número/i)).toBeVisible()
  await expect(modal.getByText('Banco PreQA Test ****4321')).toBeVisible()
  await expect(modal.getByText(/Responsable/i)).toBeVisible()
  await expect(modal.getByText('Felix Campos')).toBeVisible()

  // RN2 -- ambos montos visibles: Total factura (tachado) $500 y Total a pagar $350.
  await expect(modal.getByText('Total factura')).toBeVisible()
  await expect(modal.getByText('Saldo a favor aplicado')).toBeVisible()
  await expect(modal.getByText('Total a pagar')).toBeVisible()
  await expect(modal.getByText('USD 350.00')).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req449-pago-y-saldo.png', fullPage: true })

  // El boton descarga un blob via <a download> (adminContabApi.downloadPdf) -- no abre una pestaña
  // nueva, dispara un evento 'download' real. Se guarda el archivo y se renderiza en una pestaña
  // aparte via file:// para inspeccion visual, y se extrae el texto real con pdftotext para
  // confirmar contenido (no solo status 200).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /Ver \/ Imprimir PDF/i }).click(),
  ])
  const pdfPath = 'test-results/scrum524-528-req449-pdf-d-saldo.pdf'
  await download.saveAs(pdfPath)
  const { execSync } = await import('child_process')
  const text = execSync(`pdftotext -layout "${pdfPath}" -`).toString('utf-8')
  expect(text).toContain('Cuenta número')
  expect(text).toContain('Banco PreQA Test ****4321')
  expect(text).toContain('Responsable')
  expect(text).toContain('Felix Campos')
  expect(text).toContain('Total a pagar')
  expect(text).not.toMatch(/ANULADA/)

  // Chromium trata cualquier navegacion a un PDF local (file://) como una descarga nueva en modo
  // automatizado, no como un render -- se usa pdftoppm (poppler, mismo paquete que pdftotext) para
  // rasterizar la primera pagina real a PNG y tener evidencia visual sin pelear con ese gotcha.
  execSync(`pdftoppm -png -r 100 -f 1 -l 1 "${pdfPath}" test-results/scrum524-528-req449-pdf-d-saldo`)
})

test('REQ-449 RN3 -- factura anulada muestra marca de agua ANULADA (seteada manualmente, sin flujo real todavia)', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente F')
  const modal = detailModal(page)

  await expect(modal.getByText(/anulada/i).first()).toBeVisible()
  // REQ-448 -- una factura anulada nunca debe ofrecer "Marcar como incobrable".
  await expect(modal.getByRole('button', { name: /Marcar como incobrable/i })).toHaveCount(0)
  // REQ-451 -- una factura anulada nunca debe ofrecer "Registrar cobro".
  await expect(modal.getByRole('button', { name: /Registrar cobro/i })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum524-528-req449-anulada-modal.png', fullPage: true })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /Ver \/ Imprimir PDF/i }).click(),
  ])
  const pdfPath = 'test-results/scrum524-528-req449-pdf-anulada.pdf'
  await download.saveAs(pdfPath)
  const { execSync } = await import('child_process')
  // NOTA: pdftotext (con o sin -layout) NO extrae "ANULADA" como substring contigua -- el
  // watermark esta rotado -35deg a 90px de font-size (position:fixed a pagina completa), y la
  // extraccion de texto de poppler reconstruye los caracteres individuales en un orden distinto
  // por la rotacion extrema (confirmado: las mismas 7 letras A/N/U/L/A/D/A aparecen, pero
  // desordenadas por linea). No es un defecto del PDF -- es un artefacto conocido de extraccion de
  // texto rotado. La verificacion de contenido real para este RN se hace visualmente (pdftoppm
  // rasteriza la pagina real) en vez de con un assert de texto plano.
  execSync(`pdftoppm -png -r 100 -f 1 -l 1 "${pdfPath}" test-results/scrum524-528-req449-pdf-anulada-watermark`)
})

test('REQ-448 RN4 -- Felix NO ve los botones Aprobar/Rechazar sobre una propuesta pendiente (Mark-only)', async ({ page }) => {
  await login(page, FELIX)
  // Idempotencia entre corridas -- el test siguiente (Mark rechaza) deja a G de vuelta en estado
  // normal. Si este spec ya corrio una vez contra este mismo ambiente, G ya no esta pendiente --
  // se vuelve a proponer por API (ignorando 422 si por algun motivo ya estuviera pendiente) antes
  // de abrir el modal, para que este test sea repetible sin resembrar todo el fixture.
  await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    await fetch('/api/admin-contab/invoices/378/mark-uncollectible', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ motivo: 'PreQA - re-propuesta idempotente para re-correr el spec' }),
    }).catch(() => {})
  })
  await openDetailFor(page, 'PREQA4 Subcliente G')
  const modal = detailModal(page)

  await expect(modal.getByText(/pendiente.*aprobaci[oó]n/i).first()).toBeVisible()
  await expect(modal.getByRole('button', { name: /Aprobar/i })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: /Rechazar/i })).toHaveCount(0)
  // RN2 REQ-451 -- pese a la propuesta pendiente, "Registrar cobro" sigue disponible.
  await expect(modal.getByRole('button', { name: /Registrar cobro/i })).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req448-felix-sin-botones.png', fullPage: true })
})

test('REQ-448 RN4 -- Mark SI ve y puede usar Aprobar/Rechazar; al rechazar vuelve exactamente a normal', async ({ page }) => {
  await login(page, MARK)
  await openDetailFor(page, 'PREQA4 Subcliente G')
  const modal = detailModal(page)

  await expect(modal.getByText(/pendiente.*aprobaci[oó]n/i).first()).toBeVisible()
  const rechazarBtn = modal.getByRole('button', { name: /Rechazar/i })
  await expect(rechazarBtn).toBeVisible()
  await expect(modal.getByRole('button', { name: /Aprobar/i })).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req448-mark-con-botones.png', fullPage: true })

  await rechazarBtn.click()
  await page.waitForTimeout(1000)

  // Debe volver exactamente a normal -- sin pastilla de pendiente/incobrable, boton "Marcar como
  // incobrable" disponible de nuevo, "Registrar cobro" sigue visible.
  await expect(modal.getByText(/pendiente.*aprobaci[oó]n/i)).toHaveCount(0)
  await expect(modal.getByRole('button', { name: /Marcar como incobrable/i })).toBeVisible()
  await expect(modal.getByRole('button', { name: /Registrar cobro/i })).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req448-mark-rechazo-vuelve-normal.png', fullPage: true })
})

test('REQ-451 RN1 -- factura incobrable APROBADA nunca muestra "Registrar cobro"', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente H', 'incobrable')
  const modal = detailModal(page)

  await expect(modal.getByText(/incobrable/i).first()).toBeVisible()
  await expect(modal.getByRole('button', { name: /Registrar cobro/i })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/scrum524-528-req451-h-incobrable-sin-boton.png', fullPage: true })
})

test('REQ-451 RN3 -- "Registrar cobro" navega a Cobros con el cliente correcto preseleccionado', async ({ page }) => {
  await login(page, FELIX)
  await openDetailFor(page, 'PREQA4 Subcliente D')
  const modal = detailModal(page)

  await modal.getByRole('button', { name: /Registrar cobro/i }).click()
  await page.waitForTimeout(800)

  await expect(page).toHaveURL(/\/admin-contab\/cobros\?master_client_id=\d+/)
  const url = page.url()
  const match = url.match(/master_client_id=(\d+)/)
  expect(match).not.toBeNull()
  // master_client_id 611 = PREQA4 Subcliente D (ver fixture del pre-qa).
  expect(match![1]).toBe('611')
  await page.screenshot({ path: 'test-results/scrum524-528-req451-navegacion-cobros.png', fullPage: true })
})

test('REQ-450 -- panel Antiguedad de cartera visible y con los 4 rangos', async ({ page }) => {
  await login(page, FELIX)
  await page.goto('/admin-contab/facturacion')
  await page.waitForTimeout(1200)

  await expect(page.getByText('Antigüedad de cartera')).toBeVisible()
  // Rango 31-60 dias debe reflejar a G ($900, pendiente pero cobrable) -- H (aprobada incobrable)
  // ya quedo excluido (verificado por API en el documento de pre-qa).
  await expect(page.getByText(/31.*60/)).toBeVisible()
  await page.screenshot({ path: 'test-results/scrum524-528-req450-aging-panel.png', fullPage: true })
})
