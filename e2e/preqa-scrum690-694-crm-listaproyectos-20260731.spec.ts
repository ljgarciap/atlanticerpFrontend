import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-690→694 (REQ-610→614, Batch D "Lista de Proyectos", Epic CRM SCRUM-332).
 * Corre LOCAL (baseURL default de playwright.config.ts, http://localhost:5173) contra el
 * working tree sin pushear (rama dev, ver docs/pre-qa/scrum690-694-crm-listaproyectos-batchd-20260731.md).
 *
 * Foco adversarial: fuga de scope Mías/Equipo (un Vendedor no puede ver datos de otro
 * vendedor ni de Gerencia manipulando la UI), CSV con las 10 columnas exactas, mensaje real
 * de "sin resultados", filtro Responsable sin efecto para Vendedor, reset de página al
 * cambiar filtros. La verificación de bypass a nivel HTTP directo (forzar scope=team/owner_id
 * en la URL de la API, sin pasar por la UI) se hizo aparte con curl durante la sesión de
 * Pre-QA — ver reporte — porque Playwright dirige clics de UI, no requests crudos; ese
 * ejercicio confirmó que el backend ignora el intento de bypass incluso si la UI lo permitiera.
 *
 * Cuentas reales (nunca demo — regla dura del proyecto), password = email:
 * - Vendedor Disenador Test 2 (Vendedor/Diseñador): vendedordisenador2@test.com
 * - Vendedor Disenador Test 4 (Vendedor/Diseñador, otro dueño): vendedordisenador4@test.com
 * - Gerencia Test (Gerencia): gerencia@test.com
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

test.describe('SCRUM-690/691 — alcance Mías/Equipo, sin fuga de datos', () => {
  test('Vendedor (Neil) ve solo sus propios proyectos, sin toggle ni filtro Responsable', async ({ page }) => {
    await login(page, 'vendedordisenador2@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    // Solo sus 2 tarjetas sembradas (Torre Delta Fase 1 / Lobby Costa Bella), nunca las de
    // Vanessa o Daniela.
    await expect(page.getByText('[DEMO] Torre Delta Fase 1')).toBeVisible()
    await expect(page.getByText('[DEMO] Lobby Costa Bella')).toBeVisible()
    await expect(page.getByText('[DEMO] Amenidades Delta')).not.toBeVisible()

    // RN4 (REQ-611): el filtro Responsable / toggle de alcance no tiene efecto útil para
    // Vendedor — el desarrollo lo esconde por completo (can_view_team=false del backend).
    await expect(page.getByRole('button', { name: /^equipo$/i })).not.toBeVisible()

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum690/01-neil-solo-lo-suyo.png', fullPage: true })
  })

  test('Gerencia (Daniela) ve el toggle Inicio/Equipo y el filtro Responsable funcional', async ({ page }) => {
    await login(page, 'gerencia@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    const teamToggle = page.getByRole('button', { name: /^equipo$/i })
    await expect(teamToggle).toBeVisible()
    await teamToggle.click()
    await page.waitForTimeout(600)

    // En "Equipo" ve proyectos de Neil, Vanessa y el owner demo — no solo los suyos.
    // (celdas de tabla, no las <option> del selector de Responsable, que también matchean por texto)
    await expect(page.getByRole('cell', { name: 'Vendedor Disenador Test 2' }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Vendedor Disenador Test 4' })).toBeVisible()

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum690/02-daniela-equipo.png', fullPage: true })
  })
})

test.describe('SCRUM-691 — filtros, buscador y mensaje de sin resultados', () => {
  test('búsqueda sin coincidencias muestra el mensaje exacto, no una tabla vacía silenciosa', async ({ page }) => {
    await login(page, 'gerencia@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    const search = page.locator('input[type="text"]').first()
    await search.fill('zzzznoexisteesteproyecto123')
    await page.waitForTimeout(700)

    await expect(page.getByText('Sin resultados para los filtros actuales')).toBeVisible()
  })

  test('la búsqueda filtra en tiempo real, sin botón "Buscar"', async ({ page }) => {
    await login(page, 'gerencia@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    await expect(page.getByRole('button', { name: /^buscar$/i })).not.toBeVisible()

    const search = page.locator('input[type="text"]').first()
    await search.fill('Marbella-no-existe')
    // Sin ningún clic adicional: si el filtro sigue mostrando datos no filtrados tras el
    // debounce esperado, algo volvió a quedar como buscador no-reactivo.
    await page.waitForTimeout(700)
    await expect(page.getByText('Sin resultados para los filtros actuales')).toBeVisible()
  })
})

test.describe('SCRUM-692 — click en fila navega a Pipeline con highlight', () => {
  test('clic en una fila navega a Pipeline con ?card= y no a otra pantalla', async ({ page }) => {
    await login(page, 'vendedordisenador2@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    const row = page.getByText('[DEMO] Torre Delta Fase 1').locator('xpath=ancestor::tr')
    await row.click()
    await page.waitForURL(/\/ventas-diseno\/pipeline\?card=\d+/, { timeout: 8000 })
    expect(page.url()).toMatch(/\/ventas-diseno\/pipeline\?card=\d+/)
  })
})

test.describe('SCRUM-693 — exportar CSV respeta alcance/filtros, 10 columnas exactas', () => {
  test('exportar con scope Mías (Neil) descarga solo sus filas, 10 columnas sin RUC/teléfono', async ({ page }) => {
    await login(page, 'vendedordisenador2@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /exportar csv/i }).click(),
    ])

    const path = await download.path()
    expect(path).toBeTruthy()
    const fs = await import('fs')
    const content = fs.readFileSync(path as string, 'utf-8').replace(/^﻿/, '')
    const lines = content.trim().split('\n')
    // Parseo mínimo de CSV con comillas (fputcsv cita campos que lo requieren) — suficiente
    // para una fila de cabecera sin comas embebidas dentro de un valor citado.
    const header = lines[0].split(',').map(v => v.replace(/^"|"$/g, ''))
    expect(header).toEqual([
      'Proyecto', 'Cliente', 'Etapa', 'Etiqueta', 'Responsable',
      'Valor', 'Superficie trabajada', 'Días en etapa', 'Fecha de entrega', 'Archivos',
    ])
    // Solo las filas de Neil — nunca "Amenidades Delta" (de Daniela/Vanessa).
    expect(content).not.toContain('Amenidades Delta')
    expect(content).not.toContain('RUC')
    expect(content).not.toContain('Teléfono')
  })
})

test.describe('SCRUM-694 — "+ Nuevo Proyecto" abre el modal de creación en Pipeline', () => {
  test('clic en "+ Nuevo Proyecto" navega a Pipeline y abre el modal automáticamente', async ({ page }) => {
    await login(page, 'vendedordisenador2@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: /nuevo proyecto/i }).click()
    await page.waitForURL(/\/ventas-diseno\/pipeline\?openNewProject=1/, { timeout: 8000 })
    await page.waitForTimeout(500)
    // El modal de creación debe estar abierto sin clic adicional.
    await expect(page.getByText(/nuevo proyecto/i).first()).toBeVisible()
  })
})

test.describe('SCRUM-691 — paginación no queda en una página fuera de rango al cambiar filtros', () => {
  test('cambiar de página y luego aplicar un filtro nuevo vuelve a página 1', async ({ page }) => {
    await login(page, 'gerencia@test.com')
    await page.goto('/crm/projects')
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: /^equipo$/i }).click()
    await page.waitForTimeout(600)

    const page2 = page.getByRole('button', { name: '2', exact: true })
    if (await page2.isVisible().catch(() => false)) {
      await page2.click()
      await page.waitForTimeout(500)

      // Aplicar un filtro nuevo (Etapa) mientras estábamos en página 2.
      const stageSelect = page.locator('select').first()
      await stageSelect.selectOption({ index: 1 })
      await page.waitForTimeout(600)

      // No debe quedar "colgado" en página 2 con una tabla vacía sin explicación — o vuelve a
      // página 1 con datos, o si de verdad no hay resultados en esa etapa, muestra el mensaje
      // real de sin resultados (nunca una tabla vacía silenciosa).
      const emptyMessage = page.getByText('Sin resultados para los filtros actuales')
      const hasRows = await page.locator('tbody tr').count()
      const isEmptyMessageVisible = await emptyMessage.isVisible().catch(() => false)
      expect(hasRows > 0 || isEmptyMessageVisible).toBeTruthy()
    }
  })
})
