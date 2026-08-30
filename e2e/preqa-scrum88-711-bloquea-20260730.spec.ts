import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA — Bloque A (daily 2026-07-30): SCRUM-88 (contacto opcional en el modal
 * "+ Nuevo Proyecto" tipo Lead) y SCRUM-711/713 (migración one-time de sidebar
 * colapsado para sesiones persistidas desde antes del fix).
 *
 * Corre contra localhost:8090 (build de producción real, nginx+Laravel). Serial a
 * proposito: CrowdSec/ModSecurity dispara falsos timeouts con logins en paralelo
 * desde la misma IP (ver CLAUDE.md, gotcha ya documentado en memoria del proyecto).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:8090'
const MGMT_EMAIL = 'management@illuminations.test'
const MGMT_PASS  = 'Password123!'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|ventas-diseno|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

test.describe('SCRUM-88 — Contacto opcional en modal Lead', () => {
  test('crea un Lead con contacto opcional y el contacto queda visible en el detalle', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(800)

    await page.getByRole('button', { name: /nuevo proyecto/i }).click()
    await page.waitForTimeout(300)

    // Scope a la ventana modal — el tablero de fondo tiene su propio buscador tipo texto.
    const modal = page.locator('div.fixed.inset-0')
    await modal.locator('input[type="text"]').first().fill(`[PRE-QA] Lead con contacto ${Date.now()}`)

    await modal.getByPlaceholder('Nombre').fill('Ana Pérez Pre-QA')
    await modal.getByPlaceholder('Teléfono').fill('+507 6000-0000')

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum88-711/88-1-modal-lead-contacto.png' })

    await modal.getByRole('button', { name: /^guardar$/i }).click()
    await page.waitForTimeout(1200)

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum88-711/88-2-post-guardar.png' })

    // El modal de detalle abre tras crear; el contacto recién creado debe estar en la lista.
    await expect(page.getByText('Ana Pérez Pre-QA')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('SCRUM-711 — sidebar colapsado por defecto (migración one-time)', () => {
  test('un navegador nuevo (sin localStorage previo) arranca con el sidebar colapsado', async ({ page }) => {
    // Contexto fresco de Playwright = localStorage vacío = simula exactamente el caso
    // "navegador que nunca pasó por la migración".
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.waitForTimeout(500)

    const collapsed = await page.evaluate(() => localStorage.getItem('sidebar-collapsed'))
    const migrated  = await page.evaluate(() => localStorage.getItem('sidebar-collapsed-migrated-v711'))
    expect(collapsed).toBe('true')
    expect(migrated).toBe('true')

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum88-711/711-1-sidebar-colapsado.png' })
  })

  test('sesión persistida (localStorage viejo sin marcador) queda migrada a colapsado en el próximo mount, sin pasar por login otra vez', async ({ page }) => {
    // 1. Login real una vez — deja la sesión persistida (zustand) + fuerza colapsado (setAuth()).
    await login(page, MGMT_EMAIL, MGMT_PASS)

    // 2. Simular el caso real reportado por Daniela: un navegador con sesión de ANTES del fix
    // de SCRUM-713 — 'sidebar-collapsed' expandido y SIN el marcador de migración nuevo.
    await page.evaluate(() => {
      localStorage.setItem('sidebar-collapsed', 'false')
      localStorage.removeItem('sidebar-collapsed-migrated-v711')
    })

    // 3. Reload (NO login de nuevo) — simula reabrir la app con la sesión ya persistida,
    // que es exactamente el camino que setAuth() nunca vuelve a tocar.
    await page.reload()
    await page.waitForTimeout(800)

    const collapsed = await page.evaluate(() => localStorage.getItem('sidebar-collapsed'))
    const migrated  = await page.evaluate(() => localStorage.getItem('sidebar-collapsed-migrated-v711'))
    expect(collapsed).toBe('true')
    expect(migrated).toBe('true')

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum88-711/711-2-sesion-vieja-migrada.png' })
  })
})
