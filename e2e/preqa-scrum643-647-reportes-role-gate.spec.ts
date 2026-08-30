import { test, expect, Page } from '@playwright/test'

// PROMOVIDO A PERMANENTE — Pre-QA/Visual Review fusionado, Batch 22 Admin&Cont
// (SCRUM-643->647, REQ-566->570), 2026-08-27. Mismo criterio que
// preqa-scrum684-689-dashboard-crm-batchc.spec.ts (gate de rol que ya se rompio una vez, ver
// feedback_e2e_permanent_tests_must_self_seed.md).
//
// Hallazgo real: el comentario original de App.tsx asumia que vendedor_disenador no tiene
// `admin_contab.view` y por eso no hacia falta un gate de rol adicional en la ruta
// /admin-contab/reportes -- falso: ese rol SI tiene `admin_contab.view=true` en su JWT (lo
// necesita para Comisiones Internas, ver Batch 14/15), asi que llegaba a la pantalla completa por
// URL directa (sidebar y ruta), viendo el shell (titulos/selector/layout) mientras las 4 queries
// quedaban en 403 para siempre sin salir nunca del skeleton de carga. El backend YA bloqueaba
// bien (role:superadmin,lider_admin_contab,asistente_administrativa,management en
// routes/admin-contab.php) -- el gap era solo de frontend. Fix: RequireRole anidado dentro de
// RequirePermission en App.tsx, mismo patron ya usado en /crm/dashboard (SCRUM-674, 2026-07-31).

const FELIX = 'conta@illuminations.com.pa'
const DESIGNER = 'neil.quiel@illuminations.com.pa'

async function login(page: Page, email: string): Promise<boolean> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1800)
  return !page.url().includes('/login')
}

test('vendedor_disenador NO puede entrar a /admin-contab/reportes por URL directa pese a tener admin_contab.view', async ({ page }) => {
  const reportsCalls: string[] = []
  page.on('request', req => { if (req.url().includes('/api/admin-contab/reports/')) reportsCalls.push(req.url()) })

  const ok = await login(page, DESIGNER)
  expect(ok).toBeTruthy()

  await page.goto('/admin-contab/reportes')
  await page.waitForTimeout(1200)

  // RequireRole debe expulsarlo ANTES de montar ReportesPage — nunca deberia llegar a disparar
  // ninguna de las 4 queries de reportes.
  expect(page.url()).not.toContain('/admin-contab/reportes')
  expect(reportsCalls.length).toBe(0)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain('Comisión por gestión de cartera +90 días')
})

test('roster con acceso real (Felix) sigue entrando sin regresion', async ({ page }) => {
  const ok = await login(page, FELIX)
  expect(ok).toBeTruthy()

  await page.goto('/admin-contab/reportes')
  await page.waitForTimeout(1500)

  expect(page.url()).toContain('/admin-contab/reportes')
  await expect(page.getByText('Comisión por gestión de cartera +90 días — Felix')).toBeVisible()
})
