import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — SCRUM-286 (REQ-223: Navegación entre Tabla/Tablero y las
 * demás vistas de la pantalla, dentro de Tickets). Código NO es de un batch nuevo — ya existía
 * repartido entre Batch 1/2/3/12/19. Este check verifica en vivo RN1-RN4 + Escenarios 1-3 contra
 * el stack local (http://localhost:8090 backend / :5173 frontend).
 *
 * Mockup: 5A__Servicios_Tickets.html (Jira attachment 10534), mismo mockup ya validado en
 * Batch 1/2 — confirma toggle Tabla/Tablero, botón "Ver cotizaciones", "Técnicos externos",
 * "+ Nuevo ticket", "+ Agregar técnico externo".
 *
 * Nota de arquitectura (decisión ya tomada por el Arquitecto, no se objeta acá): la implementación
 * usa 3 rutas React Router separadas (/servicios/tickets, /servicios/cotizaciones,
 * /servicios/tickets/externos), en vez de un único archivo con tabs internos — mismo patrón que
 * el resto de pantallas del módulo. Se trata como equivalencia funcional válida: lo que se
 * verifica es el comportamiento real (sin pasos intermedios, sin perder contexto, header
 * correcto), no la forma literal "un solo archivo".
 * SCRUM-774 (2026-08-19) — el menú de navegación de Servicios (Inicio/Tickets/Técnicos/Insumos/
 * Reportes) se movió del menú superior (ServiciosNavMenu, eliminado) al panel lateral izquierdo,
 * mismo patrón que el resto de los módulos — el test 4 abre la sección "Servicios" del sidebar
 * antes de navegar por "Técnicos".
 *
 * Cuenta real (password = email, ver memory/feedback_testing_uses_real_users_not_demo.md):
 *  - servicio@illuminations.com.pa (lider_servicios, Aaron) — acceso completo a Servicios.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'

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

test('1. RN4/Escenario 2 — encabezado de Tickets tiene toggle Tabla/Tablero + Ver cotizaciones + Nuevo ticket', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)
  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tabla', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tablero', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Ver cotizaciones/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Nuevo ticket/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum286/01-tickets-header.png', fullPage: true })
})

test('2. RN1/Escenario 1 — filtro Estado=Agendado sobrevive al toggle Tabla→Tablero', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)

  // Aplicar filtro Estado=Agendado en la barra de filtros (vista Tabla, default).
  // aria-label real: t('tickets.filters.statusLabel') = "Filtrar por estado".
  const estadoSelect = page.getByLabel('Filtrar por estado')
  await estadoSelect.selectOption('scheduled')
  await page.waitForTimeout(800)

  const filterBarText = await page.locator('body').innerText()
  const filteredCountMatch = filterBarText.match(/Mostrando (\d+) de (\d+)/i)

  await page.screenshot({ path: 'e2e/.tmp/scrum286/02-tabla-filtro-agendado.png', fullPage: true })

  // Cambiar a Tablero.
  await page.getByRole('button', { name: 'Tablero', exact: true }).click()
  await page.waitForTimeout(800)

  // El select de Estado debe seguir mostrando "Agendado" tras cambiar de vista (RN1 — el toggle
  // no reinicia filtros).
  await expect(page.getByLabel('Filtrar por estado')).toHaveValue('scheduled')
  await page.screenshot({ path: 'e2e/.tmp/scrum286/03-tablero-filtro-persistido.png', fullPage: true })

  const boardText = await page.locator('body').innerText()
  const boardCountMatch = boardText.match(/Mostrando (\d+) de (\d+)/i)

  // El contador "Mostrando X de Y" (mismo componente TicketFiltersBar en ambas vistas) debe ser
  // idéntico entre Tabla filtrada y Tablero — confirma que el filtro no se reseteó al cambiar de
  // vista (RN1). Si no hay datos "Agendado" en el fixture, al menos confirmamos que el filtro
  // sigue mostrando "Agendado" seleccionado en ambas vistas.
  if (filteredCountMatch && boardCountMatch) {
    expect(boardCountMatch[1]).toBe(filteredCountMatch[1])
    expect(boardCountMatch[2]).toBe(filteredCountMatch[2])
  }
})

test('3. RN2/Escenario 2 — "Ver cotizaciones" navega a Historial de cotizaciones y cambia el encabezado', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets`)
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /Ver cotizaciones/i }).click()
  await page.waitForTimeout(1200)

  expect(page.url()).toContain('/servicios/cotizaciones')
  // Encabezado cambia: título de Historial de cotizaciones, y los botones de Tickets (Tabla/
  // Tablero toggle, Nuevo ticket) ya no están presentes.
  await expect(page.getByRole('heading', { name: /Historial de cotizaciones|Cotizaciones/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tabla', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Nuevo ticket/i })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/.tmp/scrum286/04-historial-cotizaciones-header.png', fullPage: true })
})

test('4. RN3/Escenario 3 — "Técnicos" → "Técnicos externos" navega directo, sin pasos intermedios, desde cualquier pantalla del módulo', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  // Arrancar desde una pantalla DISTINTA de Tickets (Inicio) para confirmar "desde cualquier
  // pantalla del módulo Servicios", no solo desde Tickets.
  await page.goto(`${BASE}/servicios/inicio`)
  await page.waitForTimeout(1200)

  // SCRUM-774 (2026-08-19) — el menú de Servicios se mudó del menú superior (ServiciosNavMenu,
  // eliminado) al panel lateral, mismo patrón que "Inventario" de Bodega: la sección "Servicios"
  // nace colapsada (SCRUM-711) y hay que abrirla antes de llegar a "Técnicos".
  await page.getByRole('button', { name: 'Servicios', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Técnicos', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Técnicos externos', exact: true }).click()
  await page.waitForTimeout(1200)

  expect(page.url()).toContain('/servicios/tickets/externos')
  await page.screenshot({ path: 'e2e/.tmp/scrum286/05-tecnicos-externos-directo.png', fullPage: true })
})

test('5. RN4/Escenario 3 — encabezado de Técnicos externos: Ver cotizaciones/Nuevo ticket desaparecen, aparece Agregar técnico externo', async ({ page }) => {
  await login(page, 'servicio@illuminations.com.pa')
  await page.goto(`${BASE}/servicios/tickets/externos`)
  await page.waitForTimeout(1500)

  await expect(page.getByRole('button', { name: /Ver cotizaciones/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^\+ Nuevo ticket$|^Nuevo ticket$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Agregar técnico externo/i })).toBeVisible()
  await page.screenshot({ path: 'e2e/.tmp/scrum286/06-tecnicos-externos-header.png', fullPage: true })
})
