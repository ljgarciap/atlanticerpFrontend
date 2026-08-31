import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Pre-QA — SCRUM-677 (REQ-597), fix "alerta de dato faltante queda pegada permanentemente"
 * (commit 0abbf69, dev local). Reportado dos veces por Gerencia Test (2026-08-03/04, con video
 * adjunto 11663) — stageError/quoteGateError en PipelineCardModal.tsx solo se limpiaban en el
 * onSuccess de SU PROPIA mutación de origen (changeStageMutation / handleCreateQuoteClick),
 * nunca cuando el dato faltante se resolvía por otra vía (Editar→Guardar, subir archivo,
 * agregar contacto). Fix agrega la limpieza también en saveMutation/uploadFileMutation/
 * addContactMutation.
 *
 * Corre LOCAL (baseURL default de playwright.config.ts, http://localhost:5173) contra el
 * working tree en dev local (no pusheado a origin/dev al momento de esta corrida).
 *
 * Nota de entorno (doc obligatoria — ver instrucción del ticket "si falla, documentá qué
 * funcionó"): el login sugerido para este ticket en la memoria del proyecto era
 * vendedordisenador10@test.com ("vendedor con data sembrada"), válido en dev.atlanticerp.ai. En el
 * Postgres LOCAL de esta sesión, VentasDisenoDemoSeeder resuelve el rol "designer" seedeado a
 * vendedordisenador2@test.com (no a idmar, que localmente no tiene ninguna tarjeta propia
 * tras `tenants:artisan db:seed`). Se usó neil.quiel (Vendedor/Diseñador real) y
 * gerencia@test.com (Gerencia real, dueña de tarjetas en Cotización/Propuesta) —
 * ambas cuentas reales, no demo, password = mismo email, mismo patrón que el resto de
 * atlanticerp-frontend/e2e/.
 */
test.describe.configure({ mode: 'serial' })

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|pipeline|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function openCard(page: Page, cardTitleOrProjectName: string) {
  await page.goto('/ventas-diseno/pipeline')
  await page.waitForTimeout(1200)
  await page.getByText(cardTitleOrProjectName, { exact: false }).first().click()
  await page.waitForTimeout(500)
}

const errBanner = (page: Page) =>
  page.locator('div.border-red-200, div.dark\\:border-red-900\\/50').filter({ hasText: /./ })

test.describe('SCRUM-677 — banner de dato faltante se limpia por CUALQUIER vía que resuelva el dato', () => {
  test('Diseño → Crear cotización: falta superficie, se resuelve vía Editar/Guardar (escenario EXACTO de Daniela)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'vendedordisenador2@test.com')
    await openCard(page, 'PreQA Lead 677')

    // Gate 1: falta superficie trabajada.
    await page.getByRole('button', { name: 'Crear cotización' }).click()
    await expect(page.getByText('Falta la superficie trabajada. Completala antes de crear la cotización.')).toBeVisible()

    // Se resuelve vía Editar → Guardar, NUNCA reintentando el mismo botón "Crear cotización".
    await page.getByRole('button', { name: 'Editar' }).click()
    const areaField = page.locator('label:has-text("Superficie")').locator('..').locator('input')
    await areaField.fill('55')

    const saveBtn = page.getByRole('button', { name: 'Guardar' })
    // Doble clic real (mismo frame, sin esperar entre uno y otro) — la mutación debe ser
    // idempotente/guardada por el disabled del botón mientras isPending, no debe romper ni
    // disparar 2 requests que dejen el banner en un estado inconsistente.
    await Promise.all([
      saveBtn.click(),
      saveBtn.click({ timeout: 1500 }).catch(() => {
        /* esperado: el 2do click puede fallar porque el botón ya quedó disabled/loading o
           desapareció al pasar a modo vista — lo que importa es que el 1er click sí aplique. */
      }),
    ])

    await expect(page.getByText('Falta la superficie trabajada. Completala antes de crear la cotización.')).not.toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'e2e/.tmp/scrum677/01-area-resuelta-editar-guardar.png', fullPage: true })

    // Recargar a mitad de flujo (ya resuelto el gate 1): el modal es estado local de React,
    // no una ruta propia -- recargar vuelve al tablero (comportamiento esperado de esta SPA,
    // no algo que este fix toque). Lo que sí importa verificar: el dato persistido (superficie)
    // sigue ahí y no queda ningún estado roto/mezclado al reabrir la tarjeta.
    await page.reload()
    await page.waitForTimeout(1200)
    await expect(page.getByText('Falta la superficie trabajada. Completala antes de crear la cotización.')).not.toBeVisible()
    await openCard(page, 'PreQA Lead 677')
    await expect(page.getByText('Falta la superficie trabajada. Completala antes de crear la cotización.')).not.toBeVisible()

    // Gate 2: ahora falta el archivo de diseño — mensaje DISTINTO, no debe mezclarse con el viejo.
    await page.getByRole('button', { name: 'Crear cotización' }).click()
    await expect(page.getByText('Falta al menos un archivo de diseño. Cargá uno para continuar.')).toBeVisible()
    await expect(page.getByText('Falta la superficie trabajada. Completala antes de crear la cotización.')).not.toBeVisible()

    // Se resuelve subiendo el archivo (uploadFileMutation), no reintentando "Crear cotización".
    await page.getByRole('button', { name: 'Editar' }).click()
    // FILE_TYPES = ['design', 'signed_quote', 'approval_proof', 'proposal', 'photo'] — el input
    // oculto de "design" es siempre el primero en el DOM (mismo orden que el array).
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(path.join(__dirname, 'guia-firmada-test.png'))

    await expect(page.getByText('Falta al menos un archivo de diseño. Cargá uno para continuar.')).not.toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: 'e2e/.tmp/scrum677/02-archivo-resuelto-upload.png', fullPage: true })
  })

  test('Cotización → Mover a Propuesta: 2 gates distintos en secuencia, cada banner se limpia sin mezclarse', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'gerencia@test.com')
    await openCard(page, '[DEMO] Amenidades Delta')

    await page.getByRole('button', { name: /Mover a Propuesta/ }).click()
    await expect(page.getByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).toBeVisible()

    await page.getByRole('button', { name: 'Editar' }).click()
    const areaField = page.locator('label:has-text("Superficie")').locator('..').locator('input')
    await areaField.fill('80')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).not.toBeVisible({ timeout: 8000 })

    // Segundo intento: gate distinto (archivo), el mensaje viejo no debe reaparecer mezclado.
    await page.getByRole('button', { name: /Mover a Propuesta/ }).click()
    await expect(page.getByText('Falta el archivo de la cotización firmada antes de mover a Propuesta.')).toBeVisible()
    await expect(page.getByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).not.toBeVisible()

    await page.getByRole('button', { name: 'Editar' }).click()
    // FILE_TYPES = ['design', 'signed_quote', 'approval_proof', 'proposal', 'photo'] — el input
    // oculto de "signed_quote" es el segundo (índice 1) en el DOM.
    const fileInput = page.locator('input[type="file"]').nth(1)
    await fileInput.setInputFiles(path.join(__dirname, 'guia-firmada-test.png'))

    // uploadFileMutation dispara auto-avance a Propuesta (REQ-016/017) — el banner debe
    // desaparecer Y la tarjeta debe reflejar la nueva etapa.
    await expect(page.getByText('Falta el archivo de la cotización firmada antes de mover a Propuesta.')).not.toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Propuesta' })).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/scrum677/03-quote-a-propuesta-autoavance.png', fullPage: true })
  })

  test('Lead → Crear cotización: falta contacto, se resuelve agregando un contacto (no reintentando el botón)', async ({ page }) => {
    test.setTimeout(60000)
    await login(page, 'vendedordisenador2@test.com')
    await openCard(page, 'PreQA SubClient 677')

    await page.getByRole('button', { name: 'Crear cotización' }).click()
    await expect(page.getByText('Este Lead no tiene contactos registrados. Agregá al menos uno antes de continuar.')).toBeVisible()

    await page.getByRole('button', { name: 'Editar' }).click()
    await page.locator('input[placeholder="Nombre"]').fill('Contacto PreQA 677')
    await page.locator('input[type="email"]').last().fill('contacto677@test.pa')
    // "+ Agregar" también es el texto de los 5 botones de subir archivo — el de contacto es el
    // último en el DOM (estilo primario, al final del mini-formulario de contacto).
    await page.getByRole('button', { name: '+ Agregar' }).last().click()

    await expect(page.getByText('Este Lead no tiene contactos registrados. Agregá al menos uno antes de continuar.')).not.toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: 'e2e/.tmp/scrum677/04-lead-contacto-resuelto.png', fullPage: true })
  })
})
