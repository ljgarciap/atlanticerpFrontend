import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA — SCRUM-925 (LUMO) y SCRUM-923 (Soporte), contra localhost (stack local Docker +
 * Vite dev server), NUNCA dev/test.atlanticerp.ai para este batch (spec nueva, sin código en
 * ningún entorno remoto todavía).
 *
 * Limitación de entorno conocida y aceptada (ver docs/specs/lumo-bitacoras-atlanticerp-integracion.md):
 * el CORS de lumo.atlanticerp.ai solo autoriza https://atlanticerp.ai/https://www.atlanticerp.ai — el exchange y la
 * lectura de bitácoras (pasos 2/3, cross-origin directo desde el navegador) van a fallar contra
 * localhost. Lo que se puede validar acá: sidebar gating, ruta gating, estado de error legible
 * (no un iframe/tabla colgada en blanco), y que ninguna respuesta de red exponga las API keys.
 */

const LOCAL = 'http://localhost:5173'

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${LOCAL}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 20000, navigationTimeout: 30000 })

test('SCRUM-925 — Mark (lumo.view) ve el item LUMO en el sidebar y /lumo carga (estado error esperado por CORS local)', async ({ page }) => {
  const responses: { url: string; body: string }[] = []
  page.on('response', async (res) => {
    if (res.url().includes('/api/lumo/') || res.url().includes('lumo.atlanticerp.ai')) {
      try { responses.push({ url: res.url(), body: (await res.text()).slice(0, 500) }) } catch { /* noop */ }
    }
  })

  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await expect(page.getByRole('button', { name: /^lumo$/i })).toBeVisible({ timeout: 10000 })

  await page.goto(`${LOCAL}/lumo`)
  await page.waitForTimeout(3000)

  // No debe quedar en blanco / crashear — o carga la tabla o muestra el estado de error legible.
  const body = page.locator('body')
  const hasError = await page.getByText(/no está disponible|not available/i).isVisible().catch(() => false)
  const hasTable = await page.locator('table').isVisible().catch(() => false)
  expect(hasError || hasTable, 'ni tabla ni estado de error visibles — pantalla en blanco').toBeTruthy()

  // La API key de AtlanticERP nunca debe aparecer en ninguna respuesta observada.
  for (const r of responses) {
    expect(r.body).not.toContain('LUMO_API_KEY')
    expect(r.body.toLowerCase()).not.toMatch(/x-atlanticerp-api-key|"api_key"/i)
  }

  // El endpoint de AtlanticERP (paso 1, server-to-server) debe haber devuelto un code real, no la key.
  const atlanticerpCodeResp = responses.find(r => r.url.includes('/api/lumo/bitacoras-code'))
  expect(atlanticerpCodeResp, 'no se observó ninguna llamada a /api/lumo/bitacoras-code').toBeTruthy()
  if (atlanticerpCodeResp) {
    expect(atlanticerpCodeResp.body).toMatch(/"code"/)
  }
})

test('SCRUM-925 — Neil (sin lumo.view) NO ve el item LUMO y /lumo por URL directa no muestra la tabla', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com', 'vendedordisenador2@test.com')
  await expect(page.getByRole('button', { name: /^lumo$/i })).toHaveCount(0)

  await page.goto(`${LOCAL}/lumo`)
  await page.waitForTimeout(2000)
  // RequirePermission debe bloquear la ruta — no debe verse la tabla de bitácoras.
  await expect(page.locator('table')).toHaveCount(0)
})

test('SCRUM-923 — Cualquier usuario autenticado ve Soporte en el sidebar y /soporte no expone la API key', async ({ page }) => {
  const responses: { url: string; body: string }[] = []
  page.on('response', async (res) => {
    if (res.url().includes('/api/soporte/')) {
      try { responses.push({ url: res.url(), body: (await res.text()).slice(0, 500) }) } catch { /* noop */ }
    }
  })

  await login(page, 'vendedordisenador2@test.com', 'vendedordisenador2@test.com')
  await expect(page.getByRole('button', { name: /soporte/i })).toBeVisible({ timeout: 10000 })

  await page.goto(`${LOCAL}/soporte`)
  await page.waitForTimeout(4000)

  const hasError = await page.getByText(/no está disponible|not available/i).isVisible().catch(() => false)
  const hasWidget = await page.locator('#soporte-widget').isVisible().catch(() => false)
  expect(hasError || hasWidget, 'ni widget ni estado de error visibles').toBeTruthy()

  for (const r of responses) {
    expect(r.body).not.toContain('TICKETS_API_KEY')
    expect(r.body.toLowerCase()).not.toMatch(/"api_key"|bearer /i)
  }
  const codeResp = responses.find(r => r.url.includes('/api/soporte/widget-code'))
  expect(codeResp, 'no se observó ninguna llamada a /api/soporte/widget-code').toBeTruthy()
})

test('SCRUM-925/923 — recargar /lumo y /soporte a mitad de carga no deja estado roto', async ({ page }) => {
  await login(page, 'gerencia3@test.com', 'gerencia3@test.com')
  await page.goto(`${LOCAL}/lumo`)
  await page.waitForTimeout(300)
  await page.reload()
  await page.waitForTimeout(2500)
  const stillBroken = await page.evaluate(() => document.body.innerText.trim().length === 0)
  expect(stillBroken, 'pantalla completamente vacía tras recargar a mitad de carga').toBeFalsy()

  await page.goto(`${LOCAL}/soporte`)
  await page.waitForTimeout(300)
  await page.reload()
  await page.waitForTimeout(2500)
  const stillBroken2 = await page.evaluate(() => document.body.innerText.trim().length === 0)
  expect(stillBroken2, 'pantalla completamente vacía tras recargar a mitad de carga (soporte)').toBeFalsy()
})
