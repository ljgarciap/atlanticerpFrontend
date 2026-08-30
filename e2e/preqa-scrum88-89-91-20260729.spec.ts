import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Pre-QA 2026-07-29 — batch chico Ventas & Diseño / Pipeline, 3 fixes recién desplegados a
 * dev.atlanticerp.ai: SCRUM-91 (REQ-022, colapso de columna "Aprobado" desde Reportes), SCRUM-88
 * (REQ-019, campos opcionales de Lead: Etiqueta/Observaciones/Foto), SCRUM-89 (REQ-020,
 * Archivos de diseño múltiples en el modal de creación).
 *
 * Corre contra dev.atlanticerp.ai. Serial a propósito (mismo gotcha de CrowdSec que el resto de la
 * suite Pre-QA de este proyecto: logins concurrentes desde la misma IP disparan falsos timeouts).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const EMAIL = 'management@atlantic.test'
const PASSWORD = 'Password123!'

const FIXTURES = path.join(__dirname, 'fixtures')

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/ventas-diseno|dashboard|inicio/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

// El modal "Nuevo Proyecto" se monta DESPUÉS del toolbar de Pipeline en el DOM, así que
// `input[type="text"]`/`select`/`textarea` sin acotar matchean el buscador/orden del toolbar
// antes que los campos del modal. Todo lo que apunte al modal se acota a este contenedor.
function modalOf(page: Page) {
  return page.locator('div.fixed.inset-0.z-50')
}

// ---------------------------------------------------------------------------------------------
// SCRUM-91 — REQ-022: llegar desde "Mejores clientes" en Reportes debe mostrar SOLO la columna
// Aprobado, ordenada por valor desc, respetando el scope activo. El chip "Todos" debe poder
// volver a las 6 columnas.
// ---------------------------------------------------------------------------------------------
test('SCRUM-91 — Mejores clientes colapsa a solo columna Aprobado, "Todos" la revierte', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  await login(page)
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(2000)

  // Forzar scope Equipo si está disponible (management puede verlo) para maximizar datos.
  const teamScopeBtn = page.getByRole('button', { name: 'Equipo', exact: true })
  if (await teamScopeBtn.count() > 0) {
    await teamScopeBtn.click()
    await page.waitForTimeout(1000)
  }

  await page.screenshot({ path: 'e2e/.tmp/scrum91-reports-before-click.png' })

  const bestClientsPanel = page.locator('text=Mejores clientes').first()
  await expect(bestClientsPanel).toBeVisible({ timeout: 10000 })

  // Fila de un cliente dentro del panel — buscamos el <li> con el ícono de "ver".
  const row = page.locator('li', { hasText: '$' }).first()
  const hasRow = await row.count()
  console.log('SCRUM-91: fila de Mejores clientes encontrada?', hasRow > 0)

  test.skip(hasRow === 0, 'No hay datos en Mejores clientes en este entorno — no se puede ejercitar el flujo real')

  await row.click()
  await page.waitForURL(/\/ventas-diseno\/pipeline\?stage=approved/, { timeout: 10000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/.tmp/scrum91-pipeline-collapsed.png' })

  // Debe verse SOLO la columna Aprobado — buscamos los headers de columna del kanban (el label
  // de etapa, no el badge de conteo que está en un <span> hermano distinto).
  const columnHeaders = page.locator('.grid > div > div.flex.justify-between.items-center .flex.items-center.gap-1\\.5 span.text-xs.font-medium')
  const visibleStageLabels = await columnHeaders.allTextContents()
  console.log('SCRUM-91: columnas visibles tras el clic =', visibleStageLabels)
  expect(visibleStageLabels).toEqual(['Aprobado'])

  // Confirmar orden desc por valor entre las tarjetas de esa columna (si hay >= 2) — escaneamos
  // cada tile de tarjeta (no el total de la columna) y tomamos el último "$..." de su texto.
  const tileTexts = await page.locator('div.cursor-pointer.select-none').allTextContents()
  const values = tileTexts
    .map(txt => {
      const matches = [...txt.matchAll(/\$[\d,]+/g)]
      if (matches.length === 0) return null
      return Number(matches[matches.length - 1][0].replace(/[^0-9]/g, ''))
    })
    .filter((n): n is number => n !== null && !Number.isNaN(n))
  console.log('SCRUM-91: valores de tarjetas en el orden mostrado =', values)
  const sortedDesc = [...values].sort((a, b) => b - a)
  expect(values).toEqual(sortedDesc)

  // Camino de ruptura: el chip "Todos" debe permitir volver a las 6 columnas.
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await page.waitForTimeout(1000)
  const allStageLabels = await columnHeaders.allTextContents()
  console.log('SCRUM-91: columnas tras clic en "Todos" =', allStageLabels)
  expect(allStageLabels.length).toBe(6)
  await page.screenshot({ path: 'e2e/.tmp/scrum91-pipeline-todos-restored.png' })

  expect(errors).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// SCRUM-88 — REQ-019: tipo Lead, campos opcionales Etiqueta/Observaciones/Foto.
// ---------------------------------------------------------------------------------------------
test.describe('SCRUM-88 — Nuevo Proyecto tipo Lead', () => {
  test('camino feliz — crear Lead solo con Nombre, sin bloquear el guardado', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Lead Solo Nombre')
    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await modalOf(page).locator('input[type="text"]').first().fill(name)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-solo-nombre-antes.png' })

    const saveBtn = page.getByRole('button', { name: 'Guardar', exact: true })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // El modal debe cerrarse (createMutation onSuccess llama onCreated → abre detalle).
    const modalStillOpen = await page.getByText('Nuevo Proyecto', { exact: true }).count()
    console.log('SCRUM-88 camino feliz: modal "Nuevo Proyecto" sigue abierto?', modalStillOpen > 0)
    expect(modalStillOpen).toBe(0)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-solo-nombre-creado.png' })
    expect(errors).toEqual([])
  })

  test('adversarial — Etiqueta+Observaciones+Foto: persisten? el archivo Foto se ve en el detalle?', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Lead Full')
    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await modalOf(page).locator('input[type="text"]').first().fill(name)

    await modalOf(page).locator('select').first().selectOption('both')
    await modalOf(page).locator('textarea').fill('Observaciones de prueba Pre-QA SCRUM-88')

    // Adjuntar foto válida (extensión permitida, dentro del accept del input).
    const fileInput = modalOf(page).locator('input[type="file"]').first()
    await fileInput.setInputFiles(`${FIXTURES}/foto1.png`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-full-antes-guardar.png' })

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-full-tras-guardar.png' })

    // El modal debería haberse cerrado (POST create → luego POST files type=photo → onCreated
    // abre el detalle). Si sigue abierto, algo del flujo de guardado se rompió.
    const modalStillOpen = await page.getByText('Nuevo Proyecto', { exact: true }).count()
    const rawBodyText = (await page.textContent('body')) ?? ''
    const looksLikeSqlError = /SQLSTATE|Connection: pgsql|violates check constraint/i.test(rawBodyText)
    console.log('SCRUM-88 full: modal sigue abierto tras Guardar?', modalStillOpen > 0)
    console.log('SCRUM-88 full: se ve un error crudo de SQL/DB en pantalla?', looksLikeSqlError)

    if (looksLikeSqlError) {
      console.log('HALLAZGO CRÍTICO: subir una Foto válida (.png) en el alta de Lead dispara una excepción SQL cruda mostrada tal cual en la UI (SQLSTATE/nombre de tabla/conexión visibles) — ver screenshot scrum88-lead-full-tras-guardar.png. La tarjeta puede haberse creado igual (sin el archivo) mientras el modal queda "colgado" mostrando el stack trace.')
    }

    // Cerrar el modal si quedó abierto (por el error) para poder ir a verificar el estado real
    // de la tarjeta en el pipeline (¿quedó huérfana, sin la foto, pero con tag/observaciones?).
    if (modalStillOpen > 0) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(500)
    }

    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)
    await page.locator('input[placeholder]').first().fill(name)
    await page.waitForTimeout(1000)
    const cardTile = page.locator('div.cursor-pointer.select-none', { hasText: name }).first()
    const cardCreatedAnyway = await cardTile.count()
    console.log('SCRUM-88 full: quedó creada una tarjeta con este nombre pese al error de Foto?', cardCreatedAnyway > 0)

    if (cardCreatedAnyway > 0) {
      await cardTile.click()
      await page.waitForTimeout(1500)
      const detailBody = (await page.textContent('body')) ?? ''
      console.log('SCRUM-88 full: en el detalle real (tras recargar), Observaciones persistió?', detailBody.includes('Observaciones de prueba Pre-QA SCRUM-88'))
      console.log('SCRUM-88 full: en el detalle real, Etiqueta "Ambos" persistió?', /Ambos/i.test(detailBody))
      console.log('SCRUM-88 full: en el detalle real, aparece foto1.png en algún lado?', detailBody.includes('foto1.png'))
      await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-full-detalle-real.png' })
    }
  })

  test('adversarial — extensión inválida como Foto: rechazo visible, no silencioso; confirmar si queda tarjeta huérfana', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Lead ExtInvalida')
    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await modalOf(page).locator('input[type="text"]').first().fill(name)

    const fileInput = modalOf(page).locator('input[type="file"]').first()
    await fileInput.setInputFiles(`${FIXTURES}/invalid.txt`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-ext-invalida-antes.png' })

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-ext-invalida-despues.png' })

    const bodyText = await page.textContent('body')
    const modalStillOpen = await page.getByText('Nuevo Proyecto', { exact: true }).count()
    console.log('SCRUM-88 ext inválida: modal sigue abierto (indicando error visible)?', modalStillOpen > 0)
    console.log('SCRUM-88 ext inválida: bodyText snippet =', bodyText?.slice(0, 2000))

    // Cerrar el modal si sigue abierto, para ir a buscar si la tarjeta quedó creada igual.
    if (modalStillOpen > 0) {
      const closeBtn = page.locator('button:has(svg)').first()
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(500)
    }

    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)
    await page.locator('input[placeholder]').first().fill(name).catch(() => {})
    await page.waitForTimeout(1000)
    const orphanBody = await page.textContent('body')
    const orphanExists = orphanBody?.includes(name) ?? false
    console.log(`SCRUM-88 ext inválida: quedó una tarjeta huérfana "${name}" creada sin la foto?`, orphanExists)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-lead-ext-invalida-orphan-check.png' })
  })

  test('adversarial — doble clic en Guardar no crea 2 tarjetas', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Lead DobleClick')
    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await modalOf(page).locator('input[type="text"]').first().fill(name)

    const saveBtn = page.getByRole('button', { name: 'Guardar', exact: true })
    // 2 clics "físicos" disparados en la misma vuelta de evento, con timeout corto cada uno —
    // un Promise.all con .click() normal sin timeout puede quedar esperando para siempre si el
    // primer clic ya cerró el modal (botón removido del DOM) antes de que el segundo alcance a
    // considerarlo "actionable".
    await Promise.all([
      saveBtn.click({ timeout: 3000 }).catch(() => {}),
      saveBtn.click({ timeout: 3000 }).catch(() => {}),
    ])
    await page.waitForTimeout(2500)

    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)
    await page.locator('input[placeholder]').first().fill(name)
    await page.waitForTimeout(1000)
    const cards = page.locator('div.cursor-pointer', { hasText: name })
    const count = await cards.count()
    console.log('SCRUM-88 doble-click: cantidad de tarjetas creadas con el mismo nombre =', count)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-doble-click-result.png' })
    expect(count).toBeLessThanOrEqual(1)
  })

  test('adversarial — cambiar Lead→Diseño→Lead no arrastra Observaciones/Foto anteriores', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)

    await modalOf(page).locator('textarea').fill('Observaciones que NO deben sobrevivir el cambio de tipo')
    const fileInput = modalOf(page).locator('input[type="file"]').first()
    await fileInput.setInputFiles(`${FIXTURES}/foto1.png`)
    await page.waitForTimeout(300)

    // Cambiar a Diseño y volver a Lead.
    await page.getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Lead', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum88-tipo-switch-back-to-lead.png' })

    const textareaValue = await modalOf(page).locator('textarea').inputValue()
    console.log('SCRUM-88 tipo switch: textarea Observaciones tras Lead→Diseño→Lead =', JSON.stringify(textareaValue))
    expect(textareaValue).toBe('')

    // El botón de Foto debería volver a mostrar el placeholder "+ Agregar" (no el nombre de archivo previo).
    const addOrFileLabel = await page.locator('button', { hasText: /foto1\.png/i }).count()
    console.log('SCRUM-88 tipo switch: sigue mostrando "foto1.png" como si el archivo previo persistiera?', addOrFileLabel > 0)
    expect(addOrFileLabel).toBe(0)

    await page.keyboard.press('Escape')
  })
})

// ---------------------------------------------------------------------------------------------
// SCRUM-89 — REQ-020: tipo Diseño, archivos de diseño múltiples en el modal de creación.
// ---------------------------------------------------------------------------------------------
test.describe('SCRUM-89 — Nuevo Proyecto tipo Diseño', () => {
  test('camino feliz — Subcliente+Nombre+2 archivos de diseño → tarjeta en Diseño con ambos adjuntos', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Diseno Full')
    const masterName = uniqueName('MasterPreQA')
    const subName = uniqueName('SubPreQA')

    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.waitForTimeout(300)
    await modalOf(page).locator('input[type="text"]').first().fill(name)

    // Cliente Master — crear nuevo.
    const masterInput = modalOf(page).locator('label:text("Cliente Master")').locator('..').locator('input')
    await masterInput.fill(masterName)
    await page.waitForTimeout(700)
    await page.getByText(`+ Crear "${masterName}"`, { exact: false }).click()
    await page.waitForTimeout(800)

    // Subcliente — crear nuevo (requiere RUC extra).
    const subInput = modalOf(page).locator('label:text("Subcliente")').locator('..').locator('input')
    await subInput.fill(subName)
    await page.waitForTimeout(700)
    await page.getByText(`+ Crear "${subName}"`, { exact: false }).click()
    await page.waitForTimeout(300)
    await modalOf(page).locator('input[placeholder="RUC"]').fill('RUC-TEST-91011')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-diseno-clientes-creados.png' })

    // 2 archivos de diseño.
    await page.getByRole('button', { name: '+ Agregar' }).click()
    await modalOf(page).locator('input[type="file"]').first().setInputFiles(`${FIXTURES}/design1.png`)
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ Agregar' }).click()
    await modalOf(page).locator('input[type="file"]').first().setInputFiles(`${FIXTURES}/design2.png`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-diseno-2-archivos.png' })

    // Puede haber warning "sin contactos" (subcliente recién creado, 0 contactos) — primer
    // clic solo arma la confirmación.
    const saveBtn = page.getByRole('button', { name: /Guardar|Confirmar y crear/ })
    await saveBtn.click()
    await page.waitForTimeout(500)
    const needsConfirm = await page.getByRole('button', { name: 'Confirmar y crear', exact: true }).count()
    if (needsConfirm > 0) {
      console.log('SCRUM-89: subcliente recién creado sin contactos → segundo clic de confirmación necesario (esperado)')
      await page.getByRole('button', { name: 'Confirmar y crear', exact: true }).click()
    }
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-diseno-creado.png' })

    const bodyText = await page.textContent('body')
    const mentionsD1 = bodyText?.includes('design1.png') ?? false
    const mentionsD2 = bodyText?.includes('design2.png') ?? false
    console.log('SCRUM-89 camino feliz: design1.png visible en detalle?', mentionsD1, '| design2.png visible en detalle?', mentionsD2)
    expect(mentionsD1).toBe(true)
    expect(mentionsD2).toBe(true)
  })

  test('adversarial — agregar 2 archivos, eliminar 1 antes de guardar → solo se sube el que queda', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    const name = uniqueName('PreQA Diseno EliminaUno')
    const masterName = uniqueName('MasterPreQA2')
    const subName = uniqueName('SubPreQA2')

    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.waitForTimeout(300)
    await modalOf(page).locator('input[type="text"]').first().fill(name)

    const masterInput = modalOf(page).locator('label:text("Cliente Master")').locator('..').locator('input')
    await masterInput.fill(masterName)
    await page.waitForTimeout(700)
    await page.getByText(`+ Crear "${masterName}"`, { exact: false }).click()
    await page.waitForTimeout(800)

    const subInput = modalOf(page).locator('label:text("Subcliente")').locator('..').locator('input')
    await subInput.fill(subName)
    await page.waitForTimeout(700)
    await page.getByText(`+ Crear "${subName}"`, { exact: false }).click()
    await page.waitForTimeout(300)
    await modalOf(page).locator('input[placeholder="RUC"]').fill('RUC-TEST-22222')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: '+ Agregar' }).click()
    await modalOf(page).locator('input[type="file"]').first().setInputFiles(`${FIXTURES}/design1.png`)
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ Agregar' }).click()
    await modalOf(page).locator('input[type="file"]').first().setInputFiles(`${FIXTURES}/design3.png`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-antes-de-eliminar.png' })

    // Eliminar design1.png de la lista (primer "Eliminar").
    await page.getByRole('button', { name: 'Eliminar' }).first().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-tras-eliminar.png' })

    const saveBtn = page.getByRole('button', { name: /Guardar|Confirmar y crear/ })
    await saveBtn.click()
    await page.waitForTimeout(500)
    const needsConfirm = await page.getByRole('button', { name: 'Confirmar y crear', exact: true }).count()
    if (needsConfirm > 0) await page.getByRole('button', { name: 'Confirmar y crear', exact: true }).click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'e2e/.tmp/scrum89-elimina-uno-resultado.png' })

    const bodyText = await page.textContent('body')
    const mentionsD1 = bodyText?.includes('design1.png') ?? false
    const mentionsD3 = bodyText?.includes('design3.png') ?? false
    console.log('SCRUM-89 elimina-uno: design1.png (eliminado antes de guardar) NO debería aparecer =', mentionsD1)
    console.log('SCRUM-89 elimina-uno: design3.png (el que quedó) debería aparecer =', mentionsD3)
    expect(mentionsD1).toBe(false)
    expect(mentionsD3).toBe(true)
  })

  test('regresión — sin Subcliente, Guardar sigue bloqueado', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: '+ Nuevo Proyecto' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.waitForTimeout(300)
    await modalOf(page).locator('input[type="text"]').first().fill(uniqueName('PreQA Diseno SinSub'))

    const saveBtn = page.getByRole('button', { name: 'Guardar', exact: true })
    await expect(saveBtn).toBeDisabled()
    await page.screenshot({ path: 'e2e/.tmp/scrum89-sin-subcliente-bloqueado.png' })
    await page.keyboard.press('Escape')
  })
})
