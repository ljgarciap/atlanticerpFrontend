import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review — SCRUM-109 (2026-08-01), commit 5b29342 en dev (no pusheado).
 * Daniela pidio el 31/07 que el panel Metas de Reportes muestre Meta como barra (no linea
 * plana), valores en $ siempre visibles arriba de cada barra, y el mes en curso distinguido
 * en ambar por ser venta parcial. Corre LOCAL (5173 + docker backend 8090) porque el fix no
 * esta pusheado a dev.atlanticerp.ai todavia.
 *
 * Cuentas reales usadas (password = email, ver memoria project_roster_usuarios_reales_atlanticerp.md):
 *  - vendedordisenador2@test.com (Vendedor/Diseñador) — Meta $603.28, $0 vendido, mas un
 *    approved card sembrado a mano en el mes en curso para el caso de valor grande (ver sesion).
 *  - vendedordisenador6@test.com (Vendedor/Diseñador) — SIN fila en sales_goals (goal_amount null).
 *  - gerencia@test.com (management) — unica con el toggle Resumen personal/Equipo.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoReports(page: Page) {
  await page.goto(`${BASE}/ventas-diseno/reports`)
  await page.waitForTimeout(1500)
}

test('1. Neil (con Meta, $0 vendido) — barras + labels $ visibles, mes en curso ambar', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/01-neil-meta-configurada.png', fullPage: true })

  await expect(page.getByText(/sin meta configurada/i)).toHaveCount(0)
  await expect(page.getByText(/mes en curso \(parcial\)/i)).toBeVisible()
})

test('2. Annie (SIN Meta configurada) — resto del grafico sigue funcionando', async ({ page }) => {
  await login(page, 'vendedordisenador6@test.com')
  await gotoReports(page)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/02-annie-sin-meta.png', fullPage: true })

  await expect(page.getByText(/sin meta configurada/i)).toBeVisible()
  // El resto del panel (barras de Vendido + mes en curso) no debe romperse solo porque
  // falta el dataset de Meta.
  await expect(page.getByText(/mes en curso \(parcial\)/i)).toBeVisible()
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
})

test('3. Daniela (management) — toggle Inicio(personal) / Equipo re-renderiza sin quedar pegado', async ({ page }) => {
  // Nota: el toggle de scope en la UI real dice "Inicio"/"Equipo" (no "Resumen
  // personal"/"Equipo" como en el mockup viejo de Daniela) — variante de layout
  // preexistente, no forma parte del alcance de SCRUM-109.
  await login(page, 'gerencia@test.com')
  await gotoReports(page)
  // Scope toggle es el primer div "rounded-lg border" dentro del Card de filtros
  // (canSeeTeam) — "Inicio" tambien matchea el link del sidebar, hay que acotar.
  const scopeToggle = page.locator('div.rounded-lg.border.border-slate-200').first()
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/03a-daniela-inicio-personal.png', fullPage: true })

  await scopeToggle.getByRole('button', { name: /^equipo$/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/03b-daniela-equipo.png', fullPage: true })

  await scopeToggle.getByRole('button', { name: /^inicio$/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/03c-daniela-vuelta-personal.png', fullPage: true })
})

test('4. Neil — selector de periodo (Mes/Trimestre/Año) no rompe el panel Metas', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)

  await page.getByRole('button', { name: /trimestre/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/04a-neil-trimestre.png', fullPage: true })

  await page.getByRole('button', { name: /^año/i }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/04b-neil-anio.png', fullPage: true })
})

test('5. Neil — modo oscuro, labels $ (#475569 fijo) siguen legibles', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)

  // El theme es una preferencia persistida por cuenta (no solo localStorage) — no
  // asumir que arranca en claro. Forzar a oscuro sea cual sea el estado inicial.
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  if (!isDark) {
    await page.locator('button[title*="modo" i]').first().click()
    await page.waitForTimeout(800)
  }
  await expect(page.evaluate(() => document.documentElement.classList.contains('dark'))).resolves.toBe(true)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/05-neil-dark-mode.png', fullPage: true })

  // Dejar la cuenta de Neil como estaba (claro) al terminar, para no dejar un
  // side-effect de testing en un usuario real.
  await page.locator('button[title*="modo" i]').first().click()
  await page.waitForTimeout(500)
})

test('6. Neil — valor grande (sembrado a mano) no corta ni superpone el label', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/06-neil-valor-grande.png', fullPage: true })
})

test('7. Neil — reload (F5) hidrata el chart sin parpadeo/plugin roto en el primer render', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)
  await page.reload()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/07-neil-reload.png', fullPage: true })
  await expect(page.locator('canvas').first()).toBeVisible()
})

test('8. Neil — tooltip on hover no choca visualmente con el label fijo de arriba', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com')
  await gotoReports(page)
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    // La barra de agosto (mes en curso, $250,000) queda cerca del borde derecho del
    // chart — apuntar ahi directamente en vez del centro del canvas (que puede caer
    // en un hueco entre barras y nunca disparar el tooltip).
    const x = box.x + box.width * 0.90
    const y = box.y + box.height * 0.55
    await page.mouse.move(x, y)
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum109/08-neil-tooltip-hover.png', fullPage: true })
  }
})
