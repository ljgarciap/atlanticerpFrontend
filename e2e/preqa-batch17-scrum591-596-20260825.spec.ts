import { test, expect, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// Pre-QA + Visual Review — Batch 17 Admin&Cont (SCRUM-591→596, REQ-514→519), Comisiones Externas
// continuación. Corrido en vivo contra dev.atlanticerp.ai el 2026-08-25, recién desplegado.
//
// Ningún proyecto real tenía cobro 100% al momento de esta verificación (todos "aun_no_generada")
// — se completó el cobro de PED-2026-0019 (factura F-0001, saldo 5,737.31, proyecto de
// "[PREQA-B12] Arquitecto"/"[PREQA-B12] Subcliente Correccion") vía el flujo real de Cobros +
// confirmación manual (Batch 7), para poder ejercitar REQ-515/516/517/518 sobre un proyecto
// elegible de verdad. Evidencia completa en e2e/screenshots/batch17-*.png.
//
// HALLAZGO REAL encontrado y corregido durante esta corrida (ver commit db9e41a): el modal de
// detalle guardaba una copia congelada del proyecto/arquitecto al abrirse — una mutación exitosa
// DENTRO del modal (proponer %, subir cuenta de cobro, marcar pagado) invalidaba la query pero el
// modal seguía mostrando los props viejos. `ArchitectCommissionDetailModal.test.tsx` no lo
// detectó porque monta el modal directo con props fijos; solo una verificación en vivo end-to-end
// como esta lo expuso. Corregido en `ComisionesExternasPage.tsx` (deriva `architect`/`project` en
// vivo de `summary` por id, en vez de guardar el objeto completo) + test de regresión agregado en
// `ComisionesExternasPage.test.tsx` ("REQ-519 modal de detalle refleja mutaciones...").

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const MARK  = 'gerencia3@test.com' // Mark Approver real
const MARK_PASSWORD = 'B1n4X_2026?'

async function login(page: Page, email: string, password?: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password ?? email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
  expect(page.url()).not.toContain('/login')
}

async function openDetail(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin-contab/comisiones/externas`)
  await page.waitForTimeout(800)
  await page.locator('td', { hasText: '[PREQA-B12] Arquitecto' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('tr', { hasText: 'PED-2026-0019' }).getByText(/ver detalle/i).first().click()
  await page.waitForTimeout(500)
}

test('REQ-508→512 — el proyecto refleja "Pendiente de factura" tras el cobro completo (fixture ya aplicada)', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto(`${BASE}/admin-contab/comisiones/externas`)
  await page.waitForTimeout(800)

  await page.locator('td', { hasText: '[PREQA-B12] Arquitecto' }).first().click()
  await page.waitForTimeout(400)
  await expect(page.getByText('PED-2026-0019')).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/batch17-proyecto-pendiente-factura.png', fullPage: true })
})

test('REQ-519 — modal de detalle: campos de Batch 17 presentes, comprobante de retención ausente (régimen con_itbms)', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await openDetail(page)

  await expect(page.getByText('% de comisión')).toBeVisible()
  await expect(page.getByText('Cuenta de pago')).toBeVisible()
  await expect(page.getByText('Banco General')).toBeVisible()
  // RN1 REQ-514 — régimen con_itbms, la sección de comprobante de retención no debe aparecer.
  await expect(page.getByText('Comprobante de retención')).toHaveCount(0)

  await page.screenshot({ path: 'e2e/screenshots/batch17-modal-detalle.png' })
})

// REQ-516 RN3/RN4 y REQ-513/515 se ejercitaron en vivo, paso a paso, ANTES de escribir la versión
// final de este archivo (propuesta de 12% con motivo → Mark aprueba, sin cerrar el modal → Felix
// sube cuenta-cobro-preqa.pdf → Marcar como pagado) — evidencia en batch17-propuesta-pendiente.png/
// batch17-porcentaje-aprobado.png/batch17-marcar-pagado-habilitado.png. El proyecto de fixture
// (PED-2026-0019) ya quedó en estado final "Pagada" como resultado — este test documenta/verifica
// ESE estado final persistido, no repite las acciones (ya no son repetibles sobre el mismo
// proyecto: % ya aprobado, comisión ya pagada).
test('REQ-516/515 — estado final tras aprobar % y marcar pagado: 12% aplicado, comisión pagada', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await openDetail(page)

  await expect(page.getByText('12%')).toBeVisible()
  await expect(page.getByText(/pendiente de aprobación/i)).toHaveCount(0)
  await expect(page.getByText('Marcar como pagado')).toHaveCount(0) // solo existe mientras pendiente_factura_arquitecto
  await expect(page.getByText('cuenta-cobro-preqa.pdf').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/batch17-post-pago-readonly.png' })
})

test('REQ-515 RN3 — proyecto pagado: cuenta de pago ya no editable, Marcar pagado/Recordar desaparecen', async ({ page }) => {
  await login(page, MARK, MARK_PASSWORD)
  await page.goto(`${BASE}/admin-contab/comisiones/externas`)
  await page.waitForTimeout(800)
  await page.locator('td', { hasText: '[PREQA-B12] Arquitecto' }).first().click()
  await page.waitForTimeout(400)
  await expect(page.locator('tr', { hasText: 'PED-2026-0019' }).getByText('Pagada')).toBeVisible()

  await page.locator('tr', { hasText: 'PED-2026-0019' }).getByText(/ver detalle/i).first().click()
  await page.waitForTimeout(500)

  await expect(page.getByText('Marcar como pagado')).toHaveCount(0)
  await expect(page.getByText('Recordar', { exact: true })).toHaveCount(0)
  // RN3 REQ-517 — cuenta de pago pasa a texto estático una vez pagada: solo quedan los 3
  // <select> de filtros de la pantalla base (mes/arquitecto/estado), ninguno nuevo del modal.
  await expect(page.locator('select')).toHaveCount(3)
  await expect(page.getByText('Banco General — corriente ****0000')).toBeVisible()
})
