import { test, expect, Page } from '@playwright/test'

// Pre-QA — SCRUM-826 (ban de CrowdSec en Logística para roles sin compras.read). Corrido en LOCAL
// contra http://localhost:8090, no dev.atlanticerp.ai — reproduce el escenario real del incidente:
// un usuario con SOLO compras.limited.view (ej. Líder de Operaciones, único permiso de los 2 que
// el gate de frontend de /compras/logistica realmente admite — bodega.read no está en ese
// RequirePermission, así que no es alcanzable por esta pantalla en la práctica, aunque el backend
// lo siga aceptando por consistencia con show()) carga Logística con >=11 órdenes visibles.
//
// Datos sembrados vía tinker antes de esta corrida (después del último `infra/test.sh` de la
// sesión): 1 Provider + 12 PurchaseOrder en estado "ordenado" (entra en active_shipments), y
// `extra_permissions: ["compras.limited.view"]` en designer@atlantic.test (sin compras.read).
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:8090'

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
}

test('compras.limited.view (sin compras.read) carga Logística con 12 órdenes sin ningún 403 en /documents', async ({ page }) => {
  const documentRequests: { url: string; status: number }[] = []
  page.on('response', res => {
    if (res.url().includes('/documents') && !res.url().includes('/validation')) {
      documentRequests.push({ url: res.url(), status: res.status() })
    }
  })

  await login(page, 'designer@atlantic.test')
  await page.goto(`${BASE}/compras/logistica`)
  await page.waitForTimeout(2000)

  // Confirma que la pantalla cargó de verdad (no quedó bloqueada por RequirePermission) y que
  // las 12 órdenes sembradas están visibles — si esto falla, el resto del test es irrelevante.
  await expect(page.getByRole('heading', { name: 'Logística' })).toBeVisible()

  expect(documentRequests.length).toBeGreaterThanOrEqual(11)
  const forbidden = documentRequests.filter(r => r.status === 403)
  expect(forbidden).toEqual([])
  const allOk = documentRequests.every(r => r.status === 200)
  expect(allOk).toBe(true)
})

test('compras.read (regresión) sigue viendo la sección de documentos normalmente', async ({ page }) => {
  const documentRequests: number[] = []
  page.on('response', res => {
    if (res.url().includes('/documents') && !res.url().includes('/validation')) {
      documentRequests.push(res.status())
    }
  })

  await login(page, 'management@atlantic.test')
  await page.goto(`${BASE}/compras/logistica`)
  await page.waitForTimeout(2000)

  await expect(page.getByRole('heading', { name: 'Logística' })).toBeVisible()
  expect(documentRequests.length).toBeGreaterThan(0)
  expect(documentRequests.every(s => s === 200)).toBe(true)
})
