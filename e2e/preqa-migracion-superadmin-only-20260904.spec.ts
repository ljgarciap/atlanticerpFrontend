import { test, expect, Page } from '@playwright/test'

// Pre-QA — ajuste rápido pedido por Luis 2026-09-04 (sin ticket Jira): la sección "Migración" del
// Sidebar y sus 2 ítems internos (Dashboard, Vista ICG) pasan a ser exclusivos de superadmin —
// antes "Dashboard" también era visible/accesible para management (Gerencia). Se tocaron 3 gates
// (Sidebar.tsx, App.tsx RequireRole, routes/legacy.php role:superadmin) — este spec verifica los 2
// de frontend en navegador real; el de backend ya está cubierto por
// LegacyMigrationDashboardControllerTest::test_management_ya_no_puede_ver_el_dashboard.
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:5173'

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('Password123!')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  expect(page.url()).not.toContain('/login')

  // SCRUM-711 — setAuth() fuerza sidebar-collapsed=true en TODO login real, a propósito (ver
  // authStore.ts). En modo colapsado los labels de sección no se renderizan como texto (solo
  // ícono), así que hay que expandir para poder aserir sobre ellos como lo haría un usuario real.
  await page.getByTitle('Expandir menú').click()
  await page.waitForTimeout(300)
}

test('management — no ve "Migración" en el Sidebar (con el resto expandido) y la URL directa lo redirige', async ({ page }) => {
  await login(page, 'management@atlantic.test')

  // Control: confirma que el sidebar está genuinamente expandido (no colapsado) antes de aserir
  // la ausencia de "Migración" — sin esto, un falso negativo por seguir colapsado pasaría igual.
  await expect(page.getByTitle('Colapsar menú')).toBeVisible()
  await expect(page.getByText('Migración', { exact: true })).not.toBeVisible()

  // Camino de ruptura: acceso directo por URL, no solo ocultar el menú.
  await page.goto(`${BASE}/migracion/dashboard`)
  await page.waitForTimeout(800)
  expect(page.url()).not.toContain('/migracion/dashboard')
})

test('superadmin — ve "Migración" con sus 2 ítems y puede acceder a ambos', async ({ page }) => {
  await login(page, 'superadmin@atlantic.test')

  // El Sidebar renderiza variantes desktop/mobile en simultáneo (una oculta vía CSS, ambas en el
  // DOM) — escopar a la visible.
  const migracionLabel = page.locator('span:visible', { hasText: /^Migración$/ })
  await expect(migracionLabel).toBeVisible()
  await migracionLabel.first().click()
  await page.waitForTimeout(400)

  // Los ítems (a diferencia del header de sección) son botones con el label como texto directo,
  // sin <span> propio — ver dump de markup real, no asumido.
  await expect(page.locator('button:visible', { hasText: 'Migración ICG' })).toBeVisible()
  await expect(page.locator('button:visible', { hasText: 'Vista ICG' })).toBeVisible()

  await page.goto(`${BASE}/migracion/dashboard`)
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/migracion/dashboard')

  // La ruta es exactamente /migracion/vista (sin sub-path) — la pestaña de entidad es estado
  // interno de VistaIcgPage, no un segmento de URL.
  await page.goto(`${BASE}/migracion/vista`)
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/migracion/vista')
})
