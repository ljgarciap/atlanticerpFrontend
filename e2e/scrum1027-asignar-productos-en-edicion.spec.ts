import { test, expect, type Page } from '@playwright/test'

/**
 * SCRUM-1027 — "Asignar productos a entrega" debe funcionar DENTRO de la edicion del proyecto
 * (Cotizacion y Propuesta), guardandose junto con el resto del formulario en un solo flujo.
 *
 * Gate que ya se rompio una vez (el modal llamaba a la API con fechas aun sin guardar y devolvia
 * 422 "Solo se pueden asignar fechas por producto en tarjetas con entrega Parcial.").
 *
 * Datos: tarjetas con cotizacion generada de 5+ items, una en Cotizacion y otra en Propuesta:
 *   E2E_CARD_QUOTE=<id>  E2E_CARD_PROPOSAL=<id>   (sembradas por quien corre el spec)
 * Entorno: E2E_BASE_URL (default http://127.0.0.1:5173), E2E_USER / E2E_PASS (default demo management).
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const USER = process.env.E2E_USER ?? 'management@atlantic.test'
const PASS = process.env.E2E_PASS ?? 'Password123!'
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/scrum1027'
const D1 = '2027-02-01'
const D2 = '2027-03-15'
const MSG = 'Asigná una fecha de entrega a todos los productos antes de aprobar el proyecto.'
const ERR = 'Solo se pueden asignar fechas por producto en tarjetas con entrega Parcial.'

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('atlanticerp_lang', 'es') }).catch(() => {})
  await page.locator('input[type="email"]').fill(USER)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1000)
}

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ([m, p, b]) => {
    const token = localStorage.getItem('accessToken')
    const res = await fetch(p as string, {
      method: m as string,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: b ? (b as string) : undefined,
    })
    let json: unknown = null
    try { json = await res.json() } catch { /* sin cuerpo */ }
    return { status: res.status, json }
  }, [method, path, body ? JSON.stringify(body) : null] as const)
}

async function assignments(page: Page, cardId: number) {
  const r = await api(page, 'GET', `/api/ventas-diseno/pipeline/${cardId}/product-delivery-assignments`)
  return (r.json as { data: { code: string; assigned_delivery_date: string | null }[] }).data
}

async function resetCard(page: Page, cardId: number) {
  await api(page, 'PUT', `/api/ventas-diseno/pipeline/${cardId}`, { delivery_type: null, delivery_dates: [], observations: null })
}

async function startPartialEdit(page: Page, cardId: number) {
  await page.goto(`${BASE}/ventas-diseno/pipeline?card=${cardId}`)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  const select = page.locator('label:text-is("Fecha estimada de entrega")').locator('xpath=following-sibling::select[1]')
  await select.selectOption({ label: 'Parcial' })
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill(D1)
  await dateInputs.nth(1).fill(D2)
  return { select, dateInputs }
}

const stages: [string, string][] = [['Cotizacion', 'E2E_CARD_QUOTE'], ['Propuesta', 'E2E_CARD_PROPOSAL']]

for (const [stageName, envKey] of stages) {
  const cardId = Number(process.env[envKey] ?? 0)

  test.describe(`SCRUM-1027 — ${stageName}`, () => {
    test.skip(!cardId, `${envKey} no definido`)
    test.describe.configure({ mode: 'serial' })

    test('asignar dentro de la edicion + guardar en un solo flujo, sin 422 y sin aviso residual', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      const apiCalls: string[] = []
      page.on('request', r => { if (/product-delivery-assignments/.test(r.url()) && r.method() === 'PUT') apiCalls.push('PUT assignments') })

      await startPartialEdit(page, cardId)
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      const table = page.locator('table')
      await expect(table.locator('tbody tr').first()).toBeVisible()
      const selects = table.locator('select')
      const n = await selects.count()
      expect(n).toBeGreaterThanOrEqual(3)
      for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ label: i % 2 === 0 ? D1 : D2 })
      await page.screenshot({ path: `${SHOTS}-${stageName}-1-modal.png` })
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()

      // Sin error, el modal se cierra y NO hubo PUT contra el endpoint de asignaciones en edicion.
      await expect(page.getByText(ERR)).toHaveCount(0)
      await expect(table).toHaveCount(0)
      expect(apiCalls).toEqual([])

      // Reabrir en la misma edicion conserva el borrador.
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(table.locator('tbody tr').first()).toBeVisible()
      for (let i = 0; i < n; i++) await expect(table.locator('select').nth(i)).toHaveValue(i % 2 === 0 ? D1 : D2)
      await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

      // Guardar el proyecto: un solo guardado, con product_deliveries en el mismo PUT.
      const putPromise = page.waitForResponse(r => /\/pipeline\/\d+$/.test(r.url()) && r.request().method() === 'PUT')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      const put = await putPromise
      expect(put.status()).toBe(200)
      expect(put.request().postDataJSON().product_deliveries).toHaveLength(n)

      await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toBeVisible()
      await expect(page.getByText(MSG)).toHaveCount(0)   // se refresca sin recargar la pagina
      await page.screenshot({ path: `${SHOTS}-${stageName}-2-guardado.png` })
      const saved = await assignments(page, cardId)
      expect(saved.every(r => r.assigned_delivery_date !== null)).toBe(true)
    })

    test('asignacion incompleta: el aviso PERMANECE tras guardar', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      await startPartialEdit(page, cardId)
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      const selects = page.locator('table select')
      const n = await selects.count()
      for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ label: 'Sin asignar' })
      await selects.nth(0).selectOption({ label: D1 })
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Asignar productos a entrega' })).toBeVisible()
      await expect(page.getByText(MSG)).toBeVisible()
    })

    test('guardar el proyecto con las mismas fechas y otra nota NO borra asignaciones ya guardadas', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      await api(page, 'PUT', `/api/ventas-diseno/pipeline/${cardId}`, { delivery_type: 'partial', delivery_dates: [D1, D2] })
      const list = (await api(page, 'GET', `/api/ventas-diseno/pipeline/${cardId}/product-delivery-assignments`)).json as { data: { quote_item_id: number }[] }
      await api(page, 'PUT', `/api/ventas-diseno/pipeline/${cardId}`, {
        delivery_type: 'partial', delivery_dates: [D1, D2],
        product_deliveries: list.data.map(r => ({ quote_item_id: r.quote_item_id, delivery_date: D1 })),
      })
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === D1)).toBe(true)

      await page.goto(`${BASE}/ventas-diseno/pipeline?card=${cardId}`)
      await page.getByRole('button', { name: 'Editar', exact: true }).click()
      await page.locator('textarea').last().fill('nota nueva sin tocar fechas')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === D1)).toBe(true)
      await expect(page.getByText(MSG)).toHaveCount(0)
    })

    test('quitar una fecha asignada en el borrador no rompe el guardado y avisa lo faltante', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      const { dateInputs } = await startPartialEdit(page, cardId)
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      const selects = page.locator('table select')
      const n = await selects.count()
      for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ label: D2 })
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
      // Cambiar la fecha D2 por otra DESPUES de asignarla.
      await dateInputs.nth(1).fill('2027-04-20')
      const putPromise = page.waitForResponse(r => /\/pipeline\/\d+$/.test(r.url()) && r.request().method() === 'PUT')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      expect((await putPromise).status()).toBe(200)
      await expect(page.getByText(MSG)).toBeVisible()
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === null)).toBe(true)
    })

    test('segunda edicion en la MISMA sesion: el modal muestra lo ya guardado y guardar sin tocar no pisa asignaciones', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      await startPartialEdit(page, cardId)
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      const selects = page.locator('table select')
      const n = await selects.count()
      for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ label: D1 })
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === D1)).toBe(true)

      // Segunda edicion SIN recargar la pagina (misma cache de react-query), mismas fechas.
      await page.getByRole('button', { name: 'Editar', exact: true }).click()
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      await page.waitForTimeout(1000)
      for (let i = 0; i < n; i++) await expect(page.locator('table select').nth(i)).toHaveValue(D1)
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === D1)).toBe(true)
    })

    test('cancelar la edicion descarta el borrador', async ({ page }) => {
      await login(page)
      await resetCard(page, cardId)
      await startPartialEdit(page, cardId)
      await page.getByRole('button', { name: 'Asignar productos a entrega' }).click()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      const selects = page.locator('table select')
      const n = await selects.count()
      for (let i = 0; i < n; i++) await selects.nth(i).selectOption({ label: D1 })
      await page.getByRole('button', { name: 'Guardar', exact: true }).last().click()
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      expect((await assignments(page, cardId)).every(r => r.assigned_delivery_date === null)).toBe(true)
    })

    test('permisos: usuario sin edit recibe 403 (no 500) al guardar asignaciones en el PUT del proyecto', async ({ page }) => {
      await page.context().clearCookies()
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
      await page.locator('input[type="email"]').fill('readonly@atlantic.test')
      await page.locator('input[type="password"]').fill(PASS)
      await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
      await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
      const r = await api(page, 'PUT', `/api/ventas-diseno/pipeline/${cardId}`, { product_deliveries: [{ quote_item_id: 1, delivery_date: D1 }] })
      expect(r.status).toBe(403)
    })
  })
}
