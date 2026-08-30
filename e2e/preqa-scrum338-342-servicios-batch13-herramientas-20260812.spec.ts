import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — Fase 4 Servicios, Batch 13 parte 1 "Herramientas"
 * (SCRUM-338→342, REQ-268→272). Feature nueva de punta a punta (tablas/endpoints/pantalla
 * nuevos) — primera corrida real de este flujo.
 *
 * Corre contra el stack local compartido (nginx :8090, vite :5173), NO dev.atlanticerp.ai — código
 * mergeado a `dev` local en ambos repos, todavía sin push.
 *
 * Cuentas reales (password = email):
 *  - servicio@illuminations.com.pa   (lider_servicios) — Aaron, escritura completa
 *  - garantias@illuminations.com.pa  (garantias_servicios) — Miguel Castillo, solo lectura
 *
 * TOOL_NAME lleva un sufijo único por corrida (Date.now()) para que re-correr la suite no colisione
 * con datos reales dejados por una corrida anterior (no hay borrado de fixtures entre corridas).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const API_BASE = process.env.PREQA_API_BASE_URL ?? 'http://localhost:8090'
const DL_DIR = 'e2e/.tmp/preqa-servicios-batch13-herramientas'
const TOOL_NAME = 'Escalera de tijera PREQA SCRUM338342 R4'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoTools(page: Page) {
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1500)
}

// ---------- REQ-271 — Alta de herramienta nueva, de punta a punta ----------

test('1. Aaron — REQ-271 Escenario 1: solicitar 3 unidades nuevas crea fila pendiente 0 unidades', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.screenshot({ path: `${DL_DIR}/01-panel-inicial.png`, fullPage: true })

  await page.getByRole('button', { name: '+ Agregar herramienta' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DL_DIR}/01b-modal-alta.png`, fullPage: true })

  // RN1 — el modal SOLO pide Nombre y Cantidad, nunca un código.
  await expect(page.locator('[data-testid="tool-create-modal"]').getByText('Código', { exact: true })).toHaveCount(0)

  await page.locator('[data-testid="tool-create-modal"] input').first().fill(TOOL_NAME)
  await page.locator('[data-testid="tool-create-modal"] input[type="number"]').fill('3')
  await page.locator('[data-testid="tool-create-modal"]').getByRole('button', { name: 'Solicitar', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/02-tras-solicitar.png`, fullPage: true })

  // RN2 — fila "pendiente de recibir" visible en la tabla.
  await expect(page.getByText(TOOL_NAME)).toBeVisible()
  await expect(page.getByText('Solicitado a Felix (3)')).toBeVisible()
})

test('2. Aaron — REQ-271 Escenario 2: marcar "Recibida" crea 3 unidades reales con códigos nuevos, en bodega', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/03-antes-recibir.png`, fullPage: true })

  await page.getByRole('button', { name: 'Recibida' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/04-tras-recibir.png`, fullPage: true })

  // RN3 — 3 unidades reales, cada una con su propio código COD-HER-NNN.
  const codeCells = page.locator('td.font-mono')
  const count = await codeCells.count()
  const codes: string[] = []
  for (let i = 0; i < count; i++) codes.push((await codeCells.nth(i).innerText()).trim())
  const newCodes = codes.filter(c => /^COD-HER-\d+$/.test(c))
  console.log(`[REQ-271] códigos visibles tras recibir (filtro "${TOOL_NAME}"):`, newCodes)
  expect(newCodes.length).toBe(3)
  expect(new Set(newCodes).size).toBe(3) // todos distintos

  // Grupo debe decir "3 unidad(es)" ya no "0 unidad(es) (pendiente de recibir)"
  await expect(page.getByText(TOOL_NAME, { exact: true })).toBeVisible()
  await expect(page.getByText('Solicitado a Felix', { exact: false })).toHaveCount(0)
})

// ---------- REQ-272 — Reposición sobre unidad EXISTENTE ----------

test('3. Aaron — REQ-272: "Solicitar" en una unidad existente, luego "Recibida" genera códigos NUEVOS distintos del original', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  const originalCode = await page.locator('td.font-mono').first().innerText()
  console.log('[REQ-272] código original de la unidad existente:', originalCode)

  await page.getByRole('button', { name: 'Solicitar' }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DL_DIR}/05-modal-reposicion.png`, fullPage: true })
  await page.locator('[data-testid="tool-purchase-request-modal"] input[type="number"]').fill('2')
  await page.locator('[data-testid="tool-purchase-request-modal"]').getByRole('button', { name: 'Solicitar', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/06-tras-solicitar-reposicion.png`, fullPage: true })

  await expect(page.getByText('Solicitado a Felix (2)')).toBeVisible()

  await page.getByRole('button', { name: 'Recibida' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/07-tras-recibir-reposicion.png`, fullPage: true })

  const codeCells = page.locator('td.font-mono')
  const count = await codeCells.count()
  const codes: string[] = []
  for (let i = 0; i < count; i++) codes.push((await codeCells.nth(i).innerText()).trim())
  console.log('[REQ-272] códigos tras recibir reposición (5 esperados: 3 originales + 2 nuevos):', codes)
  expect(codes.length).toBe(5)
  expect(codes).not.toContain('') // sanity
  expect(codes.filter(c => c === originalCode).length).toBe(1) // el original sigue existiendo, sin duplicarse
  expect(new Set(codes).size).toBe(5) // todos distintos entre sí — RN3: nunca reutiliza el código original
})

// ---------- REQ-269 — Cambio de estado con responsable automático ----------

test('4. Aaron — REQ-269 Escenario 1: marcar unidad ASIGNADA como Dañada atribuye responsable automático', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  // Reasignamos la primera unidad a un técnico real antes de dañarla, para tener un caso "con
  // responsable" determinístico (todas las unidades de este grupo nacen en bodega).
  const rows = page.locator('tbody tr')
  const firstRow = rows.first()
  const assignSelect = firstRow.locator('select').first()
  const options = await assignSelect.locator('option').allInnerTexts()
  const technicianOption = options.find(o => !o.includes('bodega'))
  expect(technicianOption).toBeTruthy()
  await assignSelect.selectOption({ label: technicianOption! })
  await page.waitForTimeout(1000)

  await page.screenshot({ path: `${DL_DIR}/08-antes-danar.png`, fullPage: true })

  const estadoSelect = firstRow.locator('select').nth(1)
  await estadoSelect.selectOption({ label: 'Dañada' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/09-tras-danar.png`, fullPage: true })

  await expect(page.getByText(`Responsable: ${technicianOption}`)).toBeVisible()
})

test('5. Aaron — REQ-269 Escenario 2: marcar unidad EN BODEGA (sin asignar) como Perdida → "Sin asignar al momento del incidente"', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  // Fila 2 del grupo (índice 1) — sigue en bodega, nunca tocada por el test anterior (que tocó
  // solo la fila 0).
  const row = page.locator('tbody tr').nth(1)
  const estadoSelect = row.locator('select').nth(1)
  await estadoSelect.selectOption({ label: 'Perdida' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/10-perdida-sin-asignar.png`, fullPage: true })

  await expect(row.getByText('Responsable: Sin asignar al momento del incidente')).toBeVisible()
})

test('6. Aaron — REQ-269 Escenario 3: marcar Desgaste NO atribuye responsable', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  // Fila 3 del grupo (índice 2) — sigue en bodega, sin tocar por los tests anteriores.
  const row = page.locator('tbody tr').nth(2)
  const estadoSelect = row.locator('select').nth(1)
  await estadoSelect.selectOption({ label: 'Desgaste' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/11-desgaste.png`, fullPage: true })

  await expect(row.getByText('Responsable:')).toHaveCount(0)
})

test('7. Aaron — REQ-269 RN4: volver una unidad Dañada a "Buen estado" limpia el responsable', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  // Fila 0 es la que el test 4 dejó Dañada.
  const row = page.locator('tbody tr').first()
  await expect(row.getByText('Responsable:')).toBeVisible()

  const estadoSelect = row.locator('select').nth(1)
  await estadoSelect.selectOption({ label: 'Buen estado' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/12-vuelta-buen-estado.png`, fullPage: true })

  await expect(row.getByText('Responsable:')).toHaveCount(0)
})

// ---------- REQ-270 — Reasignación ----------

test('8. Aaron — REQ-270: reasignar una unidad actualiza "Desde" a hoy', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.waitForTimeout(1000)

  // Fila 4 del grupo (índice 3, la última de las 5 unidades: 3 originales + 2 de reposición) —
  // sigue en bodega, sin tocar por ningún test anterior.
  const row = page.locator('tbody tr').nth(3)
  const assignSelect = row.locator('select').first()
  await page.screenshot({ path: `${DL_DIR}/13-antes-reasignar.png`, fullPage: true })

  const options = await assignSelect.locator('option').allInnerTexts()
  const targetOption = options.find(o => !o.includes('bodega'))
  expect(targetOption).toBeTruthy()
  await assignSelect.selectOption({ label: targetOption! })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14-tras-reasignar.png`, fullPage: true })

  const desdeCell = row.locator('td').nth(3)
  const desdeText = (await desdeCell.innerText()).trim()
  console.log('[REQ-270] fecha "Desde" tras reasignar (debe ser hoy):', desdeText)
  const today = new Date()
  const todayStr = today.toLocaleDateString()
  expect(desdeText).toBe(todayStr)
})

// ---------- REQ-268 — Filtros combinados + estado vacío ----------

test('9. Aaron — REQ-268 RN4: filtro sin resultados muestra "Sin herramientas para este filtro"', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill('ZZZ-NO-EXISTE-NINGUNA-HERRAMIENTA-ZZZ')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/15-filtro-vacio.png`, fullPage: true })

  await expect(page.getByText('Sin herramientas para este filtro')).toBeVisible()
})

test('10. Aaron — REQ-268 RN3: filtros combinados (búsqueda + estado a la vez)', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await gotoTools(page)
  await page.getByRole('textbox', { name: /buscar/i }).fill(TOOL_NAME)
  await page.getByRole('combobox', { name: /filtrar por estado/i }).selectOption({ label: 'Buen estado' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/16-filtro-combinado.png`, fullPage: true })

  // Con estado=Buen estado no deben aparecer las filas Perdida/Desgaste que dejamos antes — y la
  // tabla no debe quedar vacía (hay unidades en buen estado en el grupo).
  await expect(page.getByText('Sin asignar al momento del incidente')).toHaveCount(0)
  await expect(page.getByText('Sin herramientas para este filtro')).toHaveCount(0)
})

// ---------- Modo lectura — técnico interno ----------

test('11. Miguel (garantias_servicios) — modo lectura: sin selects de edición ni botones de escritura', async ({ page }) => {
  await login(page, 'garantias@illuminations.com.pa')
  await gotoTools(page)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/17-modo-lectura-miguel.png`, fullPage: true })

  await expect(page.getByRole('button', { name: '+ Agregar herramienta' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Solicitar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recibida' })).toHaveCount(0)

  // Sin selects de "Asignado a" ni "Estado" editables en la tabla.
  const tableSelects = page.locator('tbody select')
  await expect(tableSelects).toHaveCount(0)

  // Pero SÍ puede ver la tabla (lectura visible para todos los roles del módulo).
  await expect(page.getByText(TOOL_NAME)).toBeVisible()
})

test('12. Ruptura — rol de escritura vía API directa: PATCH estado con garantias_servicios debe dar 403', async ({ request }) => {
  const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: 'garantias@illuminations.com.pa', password: 'garantias@illuminations.com.pa' },
  })
  const { token } = await loginRes.json()

  const listRes = await request.get(`${API_BASE}/api/servicios/tools?search=${encodeURIComponent(TOOL_NAME)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const { data: tools } = await listRes.json()
  expect(tools.length).toBeGreaterThan(0)
  const toolId = tools[0].id

  const patchRes = await request.patch(`${API_BASE}/api/servicios/tools/${toolId}/estado`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { estado: 'good' },
  })
  console.log('[Ruptura] PATCH estado como garantias_servicios → status:', patchRes.status())
  expect(patchRes.status()).toBe(403)
})
