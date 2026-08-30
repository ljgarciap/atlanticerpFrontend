import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review — Batch C del Epic CRM (SCRUM-332): Dashboard CRM
 * (SCRUM-684→689, REQ-604→609), exclusivo de Gerencia, sobre datos reales de Pipeline.
 *
 * Corre contra dev.atlanticerp.ai (o PREQA_BASE_URL). Serial a propósito: CrowdSec/ModSecurity
 * dispara falsos timeouts con logins en paralelo desde la misma IP (ver CLAUDE.md, gotcha
 * ya documentado en memoria del proyecto).
 *
 * Este es el gate de permiso (REQ-609) — se promueve a e2e/ permanente por regla del
 * proyecto (gates de rol/permiso que ya se probaron una vez no se borran).
 *
 * Nota sobre cuentas: daniela@atlantic.com.pa (Gerencia, reportera del ticket) no
 * autentica con la convención password=email — probablemente cambió su password a mano
 * (mismo patrón de la lección "verificar password real" en CLAUDE.md). Se usa
 * whil@atlantic.com.pa (Whileyner Contreras, Gerencia Restringida, rol `management`)
 * como cuenta Gerencia real alternativa — mismo nivel de acceso al Dashboard CRM.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const MGMT_EMAIL = 'whil@atlantic.com.pa'
const MGMT_PASS = 'whil@atlantic.com.pa'
const VENDOR_EMAIL = 'milena.e@grupolafayette.com'
const VENDOR_PASS = 'milena.e@grupolafayette.com'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/ventas-diseno|crm|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

test.describe('REQ-609 — acceso restringido a Gerencia', () => {
  test('Gerencia (whil) llega al Dashboard CRM desde el menú lateral', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    // El sidebar agrupa "Dashboard CRM" como ítem propio dentro de la sección CRM (no hay
    // un ítem padre genérico "CRM" que se expanda) — ver Sidebar.tsx.
    await page.getByRole('button', { name: /dashboard crm/i }).click()
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/\/crm\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Dashboard CRM' })).toBeVisible()
    await expect(page.getByText('Resumen de todos los proyectos del equipo')).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/1-gerencia-dashboard.png', fullPage: true })
  })

  test('Vendedor/Diseñador (Milena) NO puede acceder por URL directa — sin flash de datos reales', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASS)

    // Escucha respuestas de red: si el frontend alguna vez llega a pedir el summary real
    // como Milena, es un hallazgo (aunque redirija después) porque implica que la data
    // viajó al cliente antes del gate.
    const summaryRequests: number[] = []
    page.on('response', res => {
      if (res.url().includes('/dashboard/summary')) summaryRequests.push(res.status())
    })

    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1500)

    // No debe quedar en /crm/dashboard, y no debe mostrar el título del Dashboard CRM.
    await expect(page).not.toHaveURL(/\/crm\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Dashboard CRM' })).not.toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/2-milena-bloqueada-url-directa.png', fullPage: true })

    // Si el frontend SÍ llegó a pedir el summary, debe haber sido rechazado por el backend
    // (403) — nunca un 200 con datos reales servidos antes de redirigir.
    for (const status of summaryRequests) {
      expect(status).not.toBe(200)
    }
  })

  test('Vendedor/Diseñador (Milena) — el ítem "Dashboard CRM" no existe en su menú lateral (gate más fuerte que redirect)', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASS)
    await page.goto(`${BASE}/ventas-diseno/pipeline`)
    await page.waitForTimeout(1000)
    // Sidebar.tsx oculta el ítem completo para no-Gerencia (isGerencia gate) — Milena nunca
    // ve el link, en vez de verlo y ser redirigida al hacer clic. Confirmar que el ítem de
    // Pipeline sí está (para descartar que el sidebar entero no cargó) y que Dashboard CRM no.
    await expect(page.getByRole('button', { name: /^pipeline$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dashboard crm/i })).not.toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/3-milena-sin-item-dashboard.png', fullPage: true })
  })

  test('API — GET /dashboard/summary con token de Milena 403 a nivel de backend (no solo gate de frontend)', async ({ page, request }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASS)
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    expect(token).toBeTruthy()

    const res = await request.get(`${BASE}/api/ventas-diseno/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })

  test('API — POST /dashboard/remind con token de Milena también 403', async ({ page, request }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASS)
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))

    const res = await request.post(`${BASE}/api/ventas-diseno/dashboard/remind`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })

  test('Gerencia — sin selector de alcance Mío/Equipo en el Dashboard', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1200)
    await expect(page.getByRole('button', { name: /^mío$/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^equipo$/i })).not.toBeVisible()
  })
})

test.describe('REQ-605/606/607 — tarjetas de conteo, gráfico de barras y dona', () => {
  test('8 tarjetas de conteo + charts renderizan con datos reales, formato de dinero correcto', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1500)

    // 6 etapas en orden fijo (RN1 de REQ-606)
    for (const stage of ['Lead', 'Diseño', 'Cotización', 'Propuesta', 'Aprobado', 'Perdido']) {
      await expect(page.getByText(stage, { exact: true }).first()).toBeVisible()
    }

    // SCRUM-796 — el monto exacto de "Cerrado (ganado)" hardcodeado acá ($749,000, dato de
    // dev al 2026-07-31) derivó a $769,441 sin ningún cambio de código: el Postgres local
    // es compartido y no-fresh (ver CLAUDE.md, tabla de gotchas), así que un monto real de
    // dev crece con cada reseed/sesión. La intención original del test (mismo comentario que
    // reemplaza este) siempre fue el FORMATO (comas, sin NaN), no el valor puntual — se
    // corrige acá para no quedar roto para siempre por datos que se siguen acumulando.
    const body = await page.textContent('body')
    expect(body).toMatch(/\$\d{1,3}(,\d{3})+(\.\d{2})?/)
    expect(body).not.toMatch(/NaN/)

    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/4-stats-charts.png', fullPage: true })
  })

  test('REQ-607 — nota de "sin etiqueta" visible cuando hay proyectos sin etiqueta (fixture sembrado)', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1500)

    // Fixtures sembrados por este batch de Pre-QA vía API: 1 sin etiqueta, 1 "design", 1 "quote"
    // — antes de estos fixtures, el 100% de las tarjetas reales de dev tenían tag "both",
    // así que el gráfico de dona nunca se había ejercitado con las 3 categorías ni con la
    // nota de "sin etiqueta" contra datos reales.
    const body = await page.textContent('body')
    expect(body).toMatch(/sin etiqueta/i)
  })
})

test.describe('REQ-608 — botón "+ Nuevo Proyecto"', () => {
  test('El botón del Dashboard navega a Pipeline con el modal ya abierto', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: /\+ nuevo proyecto/i }).click()
    await page.waitForURL(/ventas-diseno\/pipeline/, { timeout: 10000 })
    await page.waitForTimeout(800)

    // El modal "+ Nuevo Proyecto" (tipo Lead/Diseño) debe estar visible sin un segundo
    // clic — RN2 de REQ-608.
    const modal = page.locator('div.fixed.inset-0')
    await expect(modal).toBeVisible()
    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/6-nuevo-proyecto-modal-abierto.png' })
  })

  test('El query param ?openNewProject=1 por sí solo abre el modal, independiente del botón', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/ventas-diseno/pipeline?openNewProject=1`)
    await page.waitForTimeout(1200)

    const modal = page.locator('div.fixed.inset-0')
    await expect(modal).toBeVisible()
  })
})

test.describe('REQ-604 — alertas dinámicas y recordatorios', () => {
  test('Alertas visibles con datos reales (propuesta vencida + clientes sin contacto)', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1500)

    const body = await page.textContent('body')
    expect(body).toMatch(/propuesta vencida/i)
    expect(body).toMatch(/sin contacto reciente/i)
    await expect(page.getByRole('button', { name: /enviar recordatorios/i })).toBeVisible()
  })

  test('Clic en "Enviar recordatorios" muestra toast real (Toaster montado en App.tsx)', async ({ page }) => {
    await login(page, MGMT_EMAIL, MGMT_PASS)
    await page.goto(`${BASE}/crm/dashboard`)
    await page.waitForTimeout(1500)

    const btn = page.getByRole('button', { name: /enviar recordatorios/i })
    await expect(btn).toBeVisible()
    await btn.click()
    await page.waitForTimeout(1000)

    // El toast lo monta Toaster.tsx con el mensaje de éxito (dashboard.remindSuccess) o,
    // si ya no quedan pendientes por un recordatorio previo en la sesión, el error 422.
    const toastVisible = await page.locator('div.pointer-events-auto').first().isVisible().catch(() => false)
    expect(toastVisible).toBe(true)
    await page.screenshot({ path: 'e2e/.tmp/preqa-dashboard-batchc/5-toast-recordatorio.png' })
  })

  test('CRÍTICO encontrado y corregido (2026-07-31) — un segundo clic el mismo día NO duplica el email/in-app real', async ({ page, request }) => {
    // Antes del fix: cada clic creaba un NotificationSend nuevo y lo entregaba de verdad
    // (confirmado en dev.atlanticerp.ai con 2 emails 'sent' reales al mismo responsable, ~20s
    // aparte). Fix: DashboardService::remind() ahora es idempotente por
    // source_ref=fecha+owner. Este test golpea el endpoint 2 veces seguidas — la segunda
    // debe reportar "ya enviado hoy", nunca un `notified` con el mismo owner otra vez.
    await login(page, MGMT_EMAIL, MGMT_PASS)
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))

    const first = await request.post(`${BASE}/api/ventas-diseno/dashboard/remind`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect([200, 422]).toContain(first.status())

    const second = await request.post(`${BASE}/api/ventas-diseno/dashboard/remind`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(second.status()).toBe(200)
    const secondBody = await second.json()
    // La segunda llamada nunca debe re-notificar a un owner que ya recibió su
    // recordatorio hoy en la primera llamada (o en una corrida anterior del mismo día).
    expect(secondBody.notified ?? []).toEqual([])
  })
})
