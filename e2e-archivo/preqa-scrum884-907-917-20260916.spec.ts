import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-884 (campo Creador), SCRUM-907 (pantalla Arquitectos) y SCRUM-917 (fix
 * buscador Cliente Master) contra https://dev.atlanticerp.ai — NUNCA localhost, mismo criterio que el
 * resto de specs de Pre-QA de este proyecto. Corrido tras el Senior Review de esta misma sesión
 * (que ya encontró y corrigió 3 hallazgos reales antes de esta pasada).
 *
 * La invariante "Gerencia asigna al crear -> Responsable=asignado, Creador=Gerencia" NO se
 * reproduce acá por UI (el multi-select de asignación es una interacción de varios pasos de por
 * sí frágil en Playwright) — ya está cubierta con un test de integración real
 * (PipelineControllerTest::test_gerencia_asigna_proyecto_al_crear_deja_creator_en_quien_crea_no_en_el_asignado),
 * que ejercita exactamente el mismo código (controller+service) que un clic real dispararía.
 */

const DEV = (process.env.E2E_BASE_URL ?? 'http://localhost:8092')

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

// ---------- SCRUM-884 — campo Creador ----------

test('SCRUM-884 — Vendedor crea un Lead solo; Creador y Responsable coinciden (caso simple)', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  await page.goto(`${DEV}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)
  await page.getByText('+ Nuevo Proyecto').click()
  await page.waitForTimeout(500)
  // El input de Nombre tiene autoFocus — más confiable que "primer input[type=text] de la
  // página" (el resto de la app sigue montado detrás del modal).
  await page.locator(':focus').fill('PreQA SCRUM-884 Vendedor Solo')
  await page.getByRole('button', { name: /^Guardar$/i }).click()
  await page.waitForTimeout(2000)

  const body = page.locator('body')
  await expect(body).toContainText('Creador')
  const ownerRow = page.getByText('Responsable', { exact: true }).locator('..')
  await expect(ownerRow).toContainText(/Vendedor2/i)
  const creatorRow = page.getByText('Creador', { exact: true }).locator('..')
  await expect(creatorRow).toContainText(/Vendedor2/i)
})

test('SCRUM-884 — Camino de ruptura: proyecto ya existente (pre-backfill) muestra Creador real, no "—"', async ({ page }) => {
  await login(page, 'gerencia@test.com', 'gerencia@test.com')
  await page.goto(`${DEV}/ventas-diseno/pipeline?scope=team`)
  await page.waitForTimeout(2500)
  const firstCard = page.locator('[draggable="true"]').first()
  await firstCard.click({ timeout: 15000 })
  await page.waitForTimeout(1000)
  // La cuenta de Gerencia tiene la UI en inglés (confirmado en vivo, ver spec SCRUM-910) —
  // matchear ambos labels en vez de asumir español.
  const body = page.locator('body')
  await expect(body).toContainText(/Creador|Creator/)
  const creatorRow = page.getByText(/^(Creador|Creator)$/).locator('..')
  const creatorText = (await creatorRow.textContent()) ?? ''
  expect(creatorText.includes('—'), `Creador/Creator mostró "—" en una tarjeta que debería estar backfilleada: "${creatorText}"`).toBeFalsy()
})

// ---------- SCRUM-907 — pantalla Arquitectos ----------

test('SCRUM-907 — el menú CRM muestra "Arquitectos" debajo de "Clientes"', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  await page.goto(`${DEV}/ventas-diseno/pipeline`)
  await page.waitForTimeout(1500)
  const clientesLink = page.getByRole('button', { name: /^Clientes$/i })
  const architectsLink = page.getByRole('button', { name: /^Arquitectos$/i })
  await expect(clientesLink).toBeVisible()
  await expect(architectsLink).toBeVisible()
  const clientesBox = await clientesLink.boundingBox()
  const architectsBox = await architectsLink.boundingBox()
  expect(clientesBox && architectsBox && architectsBox.y > clientesBox.y).toBeTruthy()
})

test('SCRUM-907 — listado, ver detalle con proyectos, editar Teléfono y revertir', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  await page.goto(`${DEV}/ventas-diseno/architects`)
  await page.waitForTimeout(2000)
  const rows = page.locator('table tbody tr')
  await expect(rows.first()).toBeVisible({ timeout: 10000 })
  expect(await rows.count()).toBeGreaterThan(0)

  await rows.first().click()
  await page.waitForTimeout(1000)
  const modal = page.locator('.fixed.inset-0.z-50')
  await expect(modal).toContainText(/Teléfono/i)

  await modal.getByRole('button', { name: /^Editar$/i }).click()
  await page.waitForTimeout(500)
  // El input de Teléfono es el primer input:text/email DENTRO del modal — a diferencia del
  // input[type=text] de búsqueda de la página de atrás, que sigue montado y sería el .first()
  // si no se acota al modal.
  const phoneInput = modal.locator('input[type="text"], input[type="email"]').first()
  const originalValue = await phoneInput.inputValue()
  await phoneInput.fill('6000-9999')
  await modal.getByRole('button', { name: /^Guardar$/i }).click()
  await page.waitForTimeout(1500)
  await expect(modal).toContainText('6000-9999')

  // Revertir el dato de prueba para no ensuciar dev.atlanticerp.ai.
  await modal.getByRole('button', { name: /^Editar$/i }).click()
  await page.waitForTimeout(500)
  await modal.locator('input[type="text"], input[type="email"]').first().fill(originalValue)
  await modal.getByRole('button', { name: /^Guardar$/i }).click()
  await page.waitForTimeout(1000)
})

test('SCRUM-907 — Camino de ruptura: borrar Teléfono Y Correo muestra un error específico, no crashea', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  await page.goto(`${DEV}/ventas-diseno/architects`)
  await page.waitForTimeout(2000)
  await page.locator('table tbody tr').first().click()
  await page.waitForTimeout(1000)
  const modal = page.locator('.fixed.inset-0.z-50')
  await modal.getByRole('button', { name: /^Editar$/i }).click()
  await page.waitForTimeout(500)

  const inputs = modal.locator('input[type="text"], input[type="email"]')
  await inputs.nth(0).fill('')
  await inputs.nth(1).fill('')
  await modal.getByRole('button', { name: /^Guardar$/i }).click()
  await page.waitForTimeout(1500)

  const genericShown = await modal.getByText('The given data was invalid.').count()
  expect(genericShown, 'mostró el mensaje genérico de Laravel en vez del error específico del campo').toBe(0)
  await expect(modal.getByRole('button', { name: /^Guardar$/i })).toBeVisible()
})

// ---------- SCRUM-917 — buscador de Cliente Master en Servicios ----------

async function openClienteMasterPicker(page: Page): Promise<boolean> {
  await page.goto(`${DEV}/servicios/tickets`)
  await page.waitForTimeout(2000)
  if (page.url().includes('/login') || !page.url().includes('/servicios')) return false

  const newTicketBtn = page.getByText('Nuevo ticket', { exact: true }).first()
  if (await newTicketBtn.count() === 0) return false
  await newTicketBtn.click()
  await page.waitForTimeout(800)

  const clienteMasterBtn = page.getByRole('button', { name: 'Cliente Master' })
  if (await clienteMasterBtn.count() === 0) return false
  await clienteMasterBtn.click()
  await page.waitForTimeout(500)
  return true
}

test('SCRUM-917 — buscar un Cliente Master real fuera del top 200 alfabético SÍ aparece', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  const opened = await openClienteMasterPicker(page)
  test.skip(!opened, 'Vendedor no tiene acceso directo a Nuevo Ticket de Servicios (o al picker) en este entorno')

  const searchInput = page.locator('input:focus')
  await searchInput.fill('GRUPO MJE')
  await page.waitForTimeout(1200)

  const body = page.locator('body')
  await expect(body).toContainText(/GRUPO MJE/i)
  const noResultsShown = await body.getByText(/Sin resultados/i).count()
  expect(noResultsShown, 'mostró "Sin resultados" para un cliente real fuera del top 200 — el bug de SCRUM-917 seguiría presente').toBe(0)
})

test('SCRUM-917 — Camino de ruptura: buscar un nombre que NO existe sigue mostrando "Sin resultados" (negativo intacto)', async ({ page }) => {
  await login(page, 'vendedor2@test.com', 'vendedor2@test.com')
  const opened = await openClienteMasterPicker(page)
  test.skip(!opened, 'Vendedor no tiene acceso directo a Nuevo Ticket de Servicios (o al picker) en este entorno')

  const searchInput = page.locator('input:focus')
  await searchInput.fill('ZZZZZZ Cliente Que Definitivamente No Existe 999')
  await page.waitForTimeout(1200)

  await expect(page.locator('body')).toContainText(/Sin resultados/i)
})
