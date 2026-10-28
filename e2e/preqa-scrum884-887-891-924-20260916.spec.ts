import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-884 (rebote Gerencia 2026-09-16) contra el stack LOCAL (localhost:5173, proxy a
 * localhost:8090) — commit f0c4593 sin pushear todavía. Foco: Gerencia (Gerencia) debe poder quitarse
 * a sí mismo del campo "Responsable" al crear un proyecto, igual que ya podía un vendedor/diseñador
 * creador. Camino de ruptura principal: antes del fix, `UserMultiSelect` no renderizaba el chip de
 * Gerencia como removible porque `teamVendors` nunca lo incluye.
 */

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 20000, navigationTimeout: 30000 })

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  // Si ya había una sesión activa (login() llamado 2 veces en el mismo test, con otro usuario),
  // /login puede redirigir de inmediato ANTES de que el clear de arriba surta efecto — reintentar.
  if (!page.url().includes('/login')) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  }
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1000)
}

function getToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('accessToken') ?? JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.token ?? '')
}

async function apiGet(page: Page, path: string) {
  const token = await getToken(page)
  return page.evaluate(async ({ p, t }) => {
    const res = await fetch(p, { headers: { Authorization: `Bearer ${t}` } })
    return { status: res.status, body: res.ok ? await res.json() : await res.text() }
  }, { p: path, t: token })
}

const MARK = 'gerencia3@test.com'

let cardId: number

test('SCRUM-884 — Gerencia (Gerencia) crea un proyecto Lead', async ({ page }) => {
  await login(page, MARK, MARK)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /nuevo proyecto|nueva tarjeta|\+/i }).first().click()
  await page.waitForTimeout(500)

  const nameInput = page.locator('label:has-text("Nombre") + input')
  const uniqueName = 'PREQA SCRUM-884 ' + Date.now()
  await nameInput.fill(uniqueName)

  // Sin tocar el selector de Responsable — comportamiento default: la tarjeta nace asignada a
  // quien la crea (Gerencia), sin selección explícita en el modal de creación.
  await page.getByRole('button', { name: /^guardar$/i }).click()
  await page.waitForTimeout(1500)

  // Confirmar que el modal de detalle abrió (onCreated) y capturar el id real vía API.
  const token = await getToken(page)
  const search = await page.evaluate(async ({ t, name }) => {
    const res = await fetch(`/api/ventas-diseno/pipeline?search=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${t}` } })
    return res.ok ? await res.json() : null
  }, { t: token, name: uniqueName })
  const card = (search?.data ?? search ?? []).find((c: any) => c.sales_project?.name === uniqueName)
  expect(card, 'la tarjeta recién creada debe existir').toBeTruthy()
  cardId = card.id
  console.log('SCRUM-884 — card creada id=', cardId)
})

test('SCRUM-884 — precondición vía API: Gerencia quedó como owner_id (Responsable) Y como creador', async ({ page }) => {
  await login(page, MARK, MARK)
  const detail = await apiGet(page, `/api/ventas-diseno/pipeline/${cardId}`)
  expect(detail.status).toBe(200)
  console.log('SCRUM-884 — detail pre-fix-check:', JSON.stringify({ owner: detail.body.owner, assignees: detail.body.assignees, creator: detail.body.creator }))
  expect(detail.body.owner?.name ?? '').toMatch(/mark/i)
  expect((detail.body.assignees ?? []).some((a: any) => /mark/i.test(a.name))).toBe(true)
  expect(detail.body.creator?.name ?? '').toMatch(/mark/i)
})

test('SCRUM-884 — Gerencia puede quitarse del campo Responsable dejando otro asignado (chip removible)', async ({ page }) => {
  await login(page, MARK, MARK)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  // Abrir el detalle de la tarjeta directamente vía click en su nombre (buscamos por texto).
  const token = await getToken(page)
  const search = await page.evaluate(async ({ t, id }) => {
    const res = await fetch(`/api/ventas-diseno/pipeline/${id}`, { headers: { Authorization: `Bearer ${t}` } })
    return res.ok ? await res.json() : null
  }, { t: token, id: cardId })
  const cardName = search.sales_project?.name

  await page.getByText(cardName, { exact: false }).first().click()
  await page.waitForTimeout(1000)

  // Entrar en modo edición.
  await page.getByRole('button', { name: /editar/i }).first().click()
  await page.waitForTimeout(500)

  // El selector de Responsable — localizar el botón del UserMultiSelect (muestra "N seleccionados").
  const responsableSection = page.locator('label', { hasText: /responsable/i }).first().locator('..')
  await responsableSection.getByRole('button').first().click()
  await page.waitForTimeout(300);

  // ANTES del fix: el chip de Gerencia no aparecía en absoluto (users list no lo incluía) — el
  // camino de ruptura real es que el chip removible de Gerencia exista y funcione.
  const markChip = page.locator('span', { hasText: /mark/i }).first()
  await expect(markChip, 'el chip removible de Gerencia debe existir tras el fix').toBeVisible({ timeout: 5000 })

  // Cerrar el dropdown clickeando su propio overlay dedicado (`.fixed.inset-0.z-10` en
  // UserMultiSelect.tsx) — ese overlay tapa al botón toggle mientras el dropdown está abierto, y
  // clickear afuera del todo cierra el modal ENTERO (su backdrop cubre toda la pantalla).
  await page.locator('div.fixed.inset-0.z-10').click()
  await page.waitForTimeout(300)

  const chipCloseBtn = page.getByRole('button', { name: /quitar mark/i })
  await chipCloseBtn.click()
  await page.waitForTimeout(300)

  // Debe seguir habiendo al menos 1 responsable (validación min:1) — si Vendedor u otro vendedor
  // no quedó seleccionado, agregarla para poder guardar (el criterio dice "dejando otros
  // responsables asignados", no dejar la tarjeta sin nadie).
  // El resumen del botón toggle dice "N seleccionados" cuando hay al menos 1, o el placeholder
  // ("Vendedor/Diseñador") cuando quedó vacío — más confiable que contar `.rounded-full`, clase
  // reutilizada por elementos ajenos (íconos de nav, badges) en el resto de la página.
  const toggleLabel = await responsableSection.getByRole('button').first().innerText()
  const stillHasChips = /seleccionad/i.test(toggleLabel)
  if (!stillHasChips) {
    await responsableSection.getByRole('button').first().click()
    await page.waitForTimeout(300)
    const annieRow = page.locator('li', { hasText: /anelhys|annie/i }).first()
    await annieRow.locator('input[type="checkbox"]').check()
    await page.waitForTimeout(200)
    await page.locator('div.fixed.inset-0.z-10').click()
    await page.waitForTimeout(300)
  }

  const [putResponse] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/pipeline/') && r.url().includes(String(cardId))),
    page.getByRole('button', { name: /guardar/i }).click(),
  ])
  expect(putResponse.status(), 'el guardado debe confirmarse con 200, no fallar en silencio').toBe(200)
  await page.waitForTimeout(1200)
})

test('SCRUM-884 — verificación final vía API: Gerencia fuera de owner/compartido_con (comisión), Creador sigue siendo Gerencia', async ({ page }) => {
  await login(page, MARK, MARK)
  const detail = await apiGet(page, `/api/ventas-diseno/pipeline/${cardId}`)
  console.log('SCRUM-884 — detail post-fix:', JSON.stringify({ owner: detail.body.owner, assignees: detail.body.assignees, creator: detail.body.creator }))

  expect(detail.body.owner?.name ?? '', 'Gerencia ya no debe ser el owner_id (base de la comisión)').not.toMatch(/mark/i)
  expect((detail.body.assignees ?? []).some((a: any) => /mark/i.test(a.name)), 'Gerencia ya no debe estar en assignees/compartido_con').toBe(false)
  expect(detail.body.creator?.name ?? '', 'el campo Creador debe seguir mostrando a Gerencia, inmutable').toMatch(/mark/i)
  expect((detail.body.assignees ?? []).length, 'debe quedar al menos 1 responsable (validación min:1)').toBeGreaterThan(0)
})

test('SCRUM-884 — Gerencia puede optar por QUEDARSE como responsable si quiere (no se fuerza la remoción)', async ({ page }) => {
  // Criterio literal: "si Gerencia decide mantenerse como responsable... debe poder hacerlo" —
  // se prueba en una tarjeta NUEVA (Gerencia todavía es su propio responsable por default), entrando
  // a edición y guardando SIN tocar el chip de Gerencia. Distinto del test anterior (que sí lo quita).
  await login(page, MARK, MARK)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /nuevo proyecto|nueva tarjeta|\+/i }).first().click()
  await page.waitForTimeout(500)
  const nameInput = page.locator('label:has-text("Nombre") + input')
  const uniqueName = 'PREQA SCRUM-884 QUEDARSE ' + Date.now()
  await nameInput.fill(uniqueName)
  await page.getByRole('button', { name: /^guardar$/i }).click()
  await page.waitForTimeout(1500)

  const token = await getToken(page)
  const search = await page.evaluate(async ({ t, name }) => {
    const res = await fetch(`/api/ventas-diseno/pipeline?search=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${t}` } })
    return res.ok ? await res.json() : null
  }, { t: token, name: uniqueName })
  const newCard = (search?.data ?? search ?? []).find((c: any) => c.sales_project?.name === uniqueName)
  expect(newCard, 'la tarjeta nueva debe existir').toBeTruthy()
  const newCardId = newCard.id

  // `onCreated()` de NewProjectModal ya deja abierto el detalle (PipelineCardModal) de la
  // tarjeta recién creada — no hace falta volver a buscarla/clickearla en el Kanban de atrás.
  await page.getByRole('button', { name: /editar/i }).first().click()
  await page.waitForTimeout(500)

  // Confirmar que el chip de Gerencia está presente (viene por default, sin tocarlo) y guardar tal cual.
  const responsableSection = page.locator('label', { hasText: /responsable/i }).first().locator('..')
  await expect(responsableSection.getByRole('button', { name: /quitar mark/i })).toBeVisible()

  const [putResponse2] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/pipeline/') && r.url().includes(String(newCardId))),
    page.getByRole('button', { name: /guardar/i }).click(),
  ])
  expect(putResponse2.status(), 'el guardado debe confirmarse con 200 aun sin tocar el chip de Gerencia').toBe(200)
  await page.waitForTimeout(1200)

  const detailAfter = await apiGet(page, `/api/ventas-diseno/pipeline/${newCardId}`)
  expect((detailAfter.body.assignees ?? []).some((a: any) => /mark/i.test(a.name)), 'Gerencia debe seguir como responsable si nunca se lo quitó').toBe(true)
})

test('SCRUM-884 — hallazgo NO bloqueante: una vez removido, Gerencia no puede re-agregarse a sí misma desde este selector (fuera de teamVendors)', async ({ page }) => {
  // Sobre la tarjeta del test 3 (Gerencia ya removido, Vendedor quedó como responsable): el selector
  // de Responsable solo ofrece teamVendors ∪ asignados ACTUALES — Gerencia, al no ser vendedor/
  // diseñador y ya no estar entre los asignados actuales, desaparece de las opciones. No es parte
  // del criterio de aceptación de SCRUM-884 (que solo exige poder QUITARLO, no volver a
  // agregarlo después de guardado) y es consistente con el diseño original de SCRUM-849.4 (el
  // selector es "a quién de mi equipo de ventas asigno", no un picker de cualquier usuario) — se
  // deja documentado como hallazgo informativo, no bloqueante.
  await login(page, MARK, MARK)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const detail = await apiGet(page, `/api/ventas-diseno/pipeline/${cardId}`)
  const cardName = detail.body.sales_project?.name

  await page.getByRole('button', { name: /^equipo$/i }).click().catch(() => {})
  await page.waitForTimeout(500)
  await page.getByRole('textbox', { name: /buscar/i }).fill(cardName)
  await page.waitForTimeout(800)
  await page.getByText(cardName, { exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /editar/i }).first().click()
  await page.waitForTimeout(500)

  const responsableSection = page.locator('label', { hasText: /responsable/i }).first().locator('..')
  await responsableSection.getByRole('button').first().click()
  await page.waitForTimeout(300)
  const markRowCount = await page.locator('li', { hasText: /^mark/i }).count()
  console.log('INFO — filas "Gerencia" disponibles en el selector tras ser removido:', markRowCount)
  expect(markRowCount, 'confirmado: Gerencia ya no aparece como opción seleccionable en este selector').toBe(0)
})

test('SCRUM-884 — regresión: Gerencia sigue pudiendo quitar a un creador VENDEDOR/DISEÑADOR del campo Responsable (comportamiento pre-existente, no debe romperse)', async ({ page }) => {
  // Nota de diseño: solo Gerencia/superadmin ve el selector editable de Responsable
  // (`canSeeTeam` en PipelineCardModal/NewProjectModal) — un vendedor nunca lo edita él mismo.
  // El contraste real del ticket es "Gerencia SÍ podía quitar a un creador vendedor (ya estaba en
  // teamVendors) pero NO a un creador Gerencia (no estaba)" — se prueba así: Vendedor (vendedora)
  // crea el proyecto, Gerencia (Gerencia) la remueve del campo Responsable.
  const VENDOR = 'vendedor6@test.com'
  await login(page, VENDOR, VENDOR)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /nuevo proyecto|nueva tarjeta|\+/i }).first().click()
  await page.waitForTimeout(500)
  const nameInput = page.locator('label:has-text("Nombre") + input')
  const uniqueName = 'PREQA SCRUM-884 REGRESION ' + Date.now()
  await nameInput.fill(uniqueName)
  await page.getByRole('button', { name: /^guardar$/i }).click()
  await page.waitForTimeout(1500)

  const token = await getToken(page)
  const search = await page.evaluate(async ({ t, name }) => {
    const res = await fetch(`/api/ventas-diseno/pipeline?search=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${t}` } })
    return res.ok ? await res.json() : null
  }, { t: token, name: uniqueName })
  const card = (search?.data ?? search ?? []).find((c: any) => c.sales_project?.name === uniqueName)
  expect(card).toBeTruthy()
  const vendorCardId = card.id

  // Ahora como Gerencia (Gerencia) — abrir la misma tarjeta y confirmar que el chip de Vendedor
  // (vendedora, creadora) es removible, igual que antes del fix (regresión, no algo nuevo).
  await login(page, MARK, MARK)
  await page.goto('/ventas-diseno/pipeline', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^equipo$/i }).click().catch(() => {})
  await page.waitForTimeout(500)
  await page.getByRole('textbox', { name: /buscar/i }).fill(uniqueName)
  await page.waitForTimeout(800)
  await page.getByText(uniqueName, { exact: false }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /editar/i }).first().click()
  await page.waitForTimeout(500)

  const responsableSection = page.locator('label', { hasText: /responsable/i }).first().locator('..')
  await responsableSection.getByRole('button').first().click()
  await page.waitForTimeout(300)
  const annieChip = page.locator('span', { hasText: /annie|anelhys/i }).first()
  await expect(annieChip, 'el chip de un creador vendedor/diseñador debe seguir siendo removible (regresión)').toBeVisible({ timeout: 5000 })

  // Agregar a otro vendedor (Vendedor, sí está en teamVendors) ANTES de quitar a Vendedor, para poder
  // guardar sin violar min:1 — a diferencia de Gerencia (Gerencia), Vendedor sí es una opción válida acá.
  const vendedor2Row = page.locator('li', { hasText: /vendedor2/i }).first()
  await vendedor2Row.locator('input[type="checkbox"]').check()
  await page.waitForTimeout(200)
  await page.locator('div.fixed.inset-0.z-10').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /quitar anelhys|quitar annie/i }).click()
  await page.waitForTimeout(300)

  const [putResponse3] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/pipeline/') && r.url().includes(String(vendorCardId))),
    page.getByRole('button', { name: /guardar/i }).click(),
  ])
  expect(putResponse3.status(), 'quitar a un creador vendedor del campo Responsable debe seguir funcionando (200)').toBe(200)

  const detailAfter = await apiGet(page, `/api/ventas-diseno/pipeline/${vendorCardId}`)
  expect((detailAfter.body.assignees ?? []).some((a: any) => /anelhys|annie/i.test(a.name)), 'Vendedor ya no debe estar en assignees').toBe(false)
})
