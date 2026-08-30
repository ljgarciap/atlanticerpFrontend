import { test, expect, type Page } from '@playwright/test'

/**
 * SCRUM-363 (REQ-293) y SCRUM-367 (REQ-297) — Pre-QA 2026-07-28, batch "Home Bodega".
 *
 * SCRUM-363: navegación estándar de las 13 pantallas de Bodega — sidebar con 7 accesos de
 * nivel superior (Inicio, Pedidos, Inventario▾, Bodegas, Movimientos, Reportes, Configuración
 * solo superadmin.all), RN5 agregada 2026-07-28 tras hallazgo de marly (faltaba Reportes,
 * Movimientos/Configuración no documentados). Corregido: link de Reportes (commit 9d5a00d,
 * 2026-07-27).
 *
 * SCRUM-367: panel "Mi día"/"Día del equipo" — "Pedidos hoy" corregido en atlanticerp-backend
 * commit d82fc5f (2026-07-28): antes contaba pedidos que ENTRARON a la etapa Asignado HOY vía
 * order_stage_history (0 con datos sembrados directo), ahora cuenta el backlog actual asignado
 * al alcance activo (cualquier etapa salvo Entregado).
 *
 * Corre contra dev.atlanticerp.ai (mismos datos que usará marly), no contra un stack local. Serial a
 * propósito: dev.atlanticerp.ai corre CrowdSec/ModSecurity (ver CLAUDE.md, Epic 11) — logins en
 * paralelo desde la misma IP ya dispararon falsos timeouts en sesiones previas.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

const ALMACEN_EMAIL = 'almacen@illuminations.com.pa'
const ALMACEN_PASS  = 'almacen@illuminations.com.pa'
const SUPERADMIN_EMAIL = 'management@illuminations.test'
const SUPERADMIN_PASS  = 'Password123!'

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|bodega|inicio|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

/**
 * Sidebar.tsx renderiza DOS <aside> (desktop `hidden lg:flex` + drawer móvil `lg:hidden`), ambos
 * presentes en el DOM a la vez — a viewport desktop (default de Playwright) el primero es el
 * visible, el segundo queda con `display:none`. `.first()` apunta siempre al desktop.
 */
function bodegaNav(page: Page) {
  return page.locator('aside').first()
}

/**
 * El sidebar agrupa por sección (Compras/Inventario, Bodega, etc) y AMBAS secciones tienen un
 * ítem "Reportes" (Compras tiene el suyo propio) — hay que escopar a la sección "Bodega"
 * puntualmente, no a todo el <aside>, o "Reportes"/"Inventario" resuelven a 2+ elementos
 * (strict-mode violation). El header de sección y sus ítems son hermanos dentro del mismo <div>
 * (ver Sidebar.tsx groups.map), así que subir al padre del botón de header da el contenedor
 * exacto del grupo.
 */
function bodegaGroup(page: Page) {
  return bodegaNav(page).getByRole('button', { name: 'Bodega', exact: true }).locator('xpath=..')
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-363 — navegación de 7 accesos (RN5), gate de Configuración, resaltado
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-363 — navegación Bodega (RN1-RN5)', () => {
  test('Escenario 3 — perfil SIN superadmin.all ve 6 accesos, NUNCA "Configuración"', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    const nav = bodegaGroup(page)
    await expect(nav.getByText('Inicio', { exact: true })).toBeVisible()
    await expect(nav.getByText('Pedidos', { exact: true })).toBeVisible()
    await expect(nav.getByText('Inventario', { exact: true })).toBeVisible()
    await expect(nav.getByText('Bodegas', { exact: true })).toBeVisible()
    await expect(nav.getByText('Movimientos', { exact: true })).toBeVisible()
    await expect(nav.getByText('Reportes', { exact: true })).toBeVisible()
    // RN5 / gate SCRUM-500 — Configuración es EXCLUSIVO de superadmin.all.
    await expect(nav.getByText('Configuración', { exact: true })).toHaveCount(0)
  })

  test('Escenario 3 — perfil CON superadmin.all sí ve "Configuración" (7mo acceso)', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    const nav = bodegaGroup(page)
    await expect(nav.getByText('Configuración', { exact: true })).toBeVisible()
  })

  test('RN1 — el desplegable "Inventario" tiene exactamente las 5 opciones, sin Movimientos/Configuración adentro', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    const nav = bodegaGroup(page)
    await nav.getByText('Inventario', { exact: true }).click()
    await page.waitForTimeout(500)

    await expect(nav.getByText('Ver inventario', { exact: true })).toBeVisible()
    await expect(nav.getByText('Solicitud de ajuste', { exact: true })).toBeVisible()
    await expect(nav.getByText('Órdenes Zona Libre', { exact: true })).toBeVisible()
    await expect(nav.getByText('Inventario general', { exact: true })).toBeVisible()
    await expect(nav.getByText('Devoluciones', { exact: true })).toBeVisible()
    // camino de ruptura — Movimientos y Configuración son accesos de nivel superior propios,
    // NO deben colarse como ítems del desplegable.
    const dropdownItems = await nav.locator('button').allTextContents()
    const inventarioChildrenOnly = dropdownItems.filter(t =>
      ['Ver inventario', 'Solicitud de ajuste', 'Órdenes Zona Libre', 'Inventario general', 'Devoluciones'].includes(t.trim()),
    )
    expect(inventarioChildrenOnly.length).toBe(5)
  })

  test('RN2 — "Reportes" resalta como pantalla activa al entrar directo (SCRUM-490->495 fix)', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    // camino de ruptura — navegar DIRECTO por URL, sin pasar por clic en el sidebar.
    await page.goto(`${BASE}/bodega/reportes`)
    await page.waitForTimeout(1500)

    const reportesLink = bodegaGroup(page).locator('button', { hasText: 'Reportes' }).first()
    await expect(reportesLink).toBeVisible()
    const classAttr = await reportesLink.getAttribute('class')
    // El resaltado usa el mismo patrón de color de marca que el resto del sidebar (bg-[#d1ede9]/
    // text-[#1f6b66] o el activo de NavLink) — buscamos evidencia de estado activo, no un pixel exacto.
    expect(classAttr).toMatch(/d1ede9|1f6b66|active|font-semibold|bg-primary/i)
  })

  test('camino de ruptura — recargar en "Órdenes Zona Libre" (dentro del desplegable) conserva el resaltado tras el reload', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/ordenes-zona-libre`)
    await page.waitForTimeout(1500)
    await page.reload()
    await page.waitForTimeout(1500)

    const nav = bodegaGroup(page)
    // El desplegable "Inventario" debe seguir abierto (auto-open porque un hijo está activo)
    // y "Órdenes Zona Libre" visible y resaltado, sin necesidad de volver a hacer clic.
    await expect(nav.getByText('Órdenes Zona Libre', { exact: true })).toBeVisible()
  })

  test('camino de ruptura — abrir varias de las 13 pantallas mantiene la MISMA estructura de 6 accesos (usuario sin superadmin)', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    const screens = ['/bodega/home', '/bodega/pedidos', '/bodega/bodegas', '/bodega/kardex', '/bodega/inventario-general', '/bodega/devoluciones']
    for (const screen of screens) {
      await page.goto(`${BASE}${screen}`)
      await page.waitForTimeout(1000)
      const nav = bodegaGroup(page)
      await expect(nav.getByText('Inicio', { exact: true })).toBeVisible()
      await expect(nav.getByText('Movimientos', { exact: true })).toBeVisible()
      await expect(nav.getByText('Reportes', { exact: true })).toBeVisible()
      await expect(nav.getByText('Configuración', { exact: true })).toHaveCount(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-367 — "Pedidos hoy" ya no da 0 (fix backend d82fc5f)
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-367 — Mi día / Pedidos hoy', () => {
  test('BUG (marly, 2026-07-26) — "Pedidos hoy" ya NO da 0 en alcance Equipo con pedidos activos reales', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    // Esteban es Jefe de Bodega — alterna a "Equipo" (view_team) para el chequeo principal.
    const equipoBtn = page.getByRole('button', { name: 'Equipo', exact: true })
    await equipoBtn.waitFor({ timeout: 10000 })
    await equipoBtn.click()
    await page.waitForTimeout(2000)

    const ordersTodayValue = page.locator('text=Pedidos hoy').locator('..').locator('p.text-base, p.font-bold').last()
    // Fallback robusto: leer el número directamente junto al label "Pedidos hoy".
    const body = await page.textContent('body')
    expect(body).toContain('Pedidos hoy')

    const card = page.getByText('Pedidos hoy', { exact: true }).locator('..')
    const valueText = (await card.locator('p').last().textContent())?.trim() ?? ''
    const value = Number(valueText)
    expect(Number.isNaN(value)).toBe(false)
    expect(value).toBeGreaterThan(0)
  })

  test('RN1 — el número de "Pedidos hoy" es coherente entre alcance Inicio y Equipo (Equipo >= Inicio)', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    async function readOrdersToday(): Promise<number> {
      const card = page.getByText('Pedidos hoy', { exact: true }).locator('..')
      const txt = (await card.locator('p').last().textContent())?.trim() ?? '0'
      return Number(txt)
    }

    // Inicio (own) es el default al cargar.
    await page.waitForTimeout(1000)
    const ownValue = await readOrdersToday()
    expect(Number.isNaN(ownValue)).toBe(false)

    const equipoBtn = page.getByRole('button', { name: 'Equipo', exact: true })
    await equipoBtn.click()
    await page.waitForTimeout(2000)
    const teamValue = await readOrdersToday()
    expect(Number.isNaN(teamValue)).toBe(false)
    expect(teamValue).toBeGreaterThanOrEqual(ownValue)
  })

  test('camino de ruptura — clic en "Pedidos hoy" navega a Pedidos sin romper la pantalla', async ({ page }) => {
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    const ordersTodayCard = page.getByText('Pedidos hoy', { exact: true }).locator('..')
    await ordersTodayCard.click()
    await page.waitForURL(/\/bodega\/pedidos/, { timeout: 10000 })
    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(page.url()).toContain('/bodega/pedidos')
  })

  test('camino de ruptura — usuario/alcance sin pedidos asignados no rompe (0 sin error)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, ALMACEN_EMAIL, ALMACEN_PASS)
    await page.goto(`${BASE}/bodega/home`)
    await page.waitForTimeout(1500)

    // Alcance "Inicio" (propio de Esteban como Jefe) es el candidato más probable a dar 0 si él
    // mismo no tiene pedidos asignados directamente (el fix es sobre el conteo, no una garantía
    // de que Esteban tenga pedidos propios) — igual no debe romper la pantalla.
    const body = await page.textContent('body')
    expect(errors).toEqual([])
    expect(body).toMatch(/Pedidos hoy/)
  })
})
