import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Pre-QA — SCRUM-944/945 (vista consolidada de superadmin `/configuracion/global`, umbrales CRM y
 * tramos de comisión de vendedores), contra https://dev.atlanticerp.ai. Gates que se prueban: acceso
 * SOLO superadmin (UI y API), Fiscal sigue exclusiva de Gerencia en su pantalla original, solo la tab
 * activa monta su panel, y qué ve el usuario cuando el backend rechaza un valor (422).
 *
 * SESIÓN: dev ya bloqueó una IP por ráfaga de logins (memoria project-dev-atlanticerp-ip-blocked-login-
 * burst-20260904). Este spec NO loguea por cada test: si PREQA_LOGIN_DIR apunta a una carpeta con
 * su.json / conta.json / alm.json (respuesta de POST /api/auth/login), reutiliza esa sesión; si no,
 * hace UN login por cuenta, una sola vez, y lo cachea. Además espacia las llamadas API (~1s).
 *
 * Cuentas (password = email): superadmin superadmin3@test.com, Admin&Cont
 * contabilidad@test.com (lider_admin_contab), Bodega liderbodega@test.com.
 *
 * Todo lo que el spec modifica se restaura en afterAll a los valores de la línea base
 * (crm_settings 3/7/21 y los tramos leídos al empezar).
 */
const DEV = 'https://dev.atlanticerp.ai'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })
test.setTimeout(90000)

type Key = 'su' | 'conta' | 'alm'
const ACCOUNT: Record<Key, string> = {
  su: 'superadmin3@test.com',
  conta: 'contabilidad@test.com',
  alm: 'liderbodega@test.com',
}
interface LoginResp { token: string; refresh_token: string; user: unknown }
const sessions: Partial<Record<Key, LoginResp>> = {}

async function session(api: APIRequestContext, key: Key): Promise<LoginResp> {
  if (sessions[key]) return sessions[key]!
  const dir = process.env.PREQA_LOGIN_DIR
  if (dir) {
    sessions[key] = JSON.parse(readFileSync(`${dir}/${key}.json`, 'utf8')) as LoginResp
    return sessions[key]!
  }
  const r = await api.post(`${DEV}/api/auth/login`, { data: { email: ACCOUNT[key], password: ACCOUNT[key] } })
  expect(r.status(), `login ${key}`).toBe(200)
  sessions[key] = (await r.json()) as LoginResp
  return sessions[key]!
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

async function call(api: APIRequestContext, key: Key, method: 'get' | 'put' | 'post' | 'patch' | 'delete', path: string, data?: unknown) {
  const s = await session(api, key)
  await sleep(3000)
  return api[method](`${DEV}/api${path}`, {
    headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/json' },
    ...(data !== undefined ? { data } : {}),
  })
}

/** Inyecta la sesión ya obtenida en el navegador (mismo contrato que authStore: `accessToken` + `atlanticerp-auth-v3`). */
async function openAs(page: Page, api: APIRequestContext, key: Key, path: string): Promise<void> {
  const s = await session(api, key)
  await page.addInitScript(([token, refresh, user]) => {
    localStorage.setItem('accessToken', token as string)
    localStorage.setItem('atlanticerp-auth-v3', JSON.stringify({ state: { user, refreshToken: refresh }, version: 0 }))
    localStorage.setItem('sidebar-collapsed', 'false')
  }, [s.token, s.refresh_token, s.user])
  await page.goto(`${DEV}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
}

let originalCrm: Record<string, number> = {}
let originalTiers: Array<Record<string, unknown>> = []
let originalGlobal: Record<string, number> = {}
let originalLanguage = 'es'

test.beforeAll(async ({ request }) => {
  originalCrm = await (await call(request, 'su', 'get', '/crm/settings')).json()
  originalTiers = await (await call(request, 'su', 'get', '/ventas-diseno/sales-commission-tiers')).json()
  const g = await (await call(request, 'su', 'get', '/admin/global-settings')).json()
  // El toggle ES/EN del TopBar PERSISTE la preferencia del usuario en el backend: se guarda y se restaura.
  originalLanguage = ((await (await call(request, 'su', 'get', '/settings/preferences')).json()) as { language?: string }).language ?? 'es'
  originalGlobal = Object.fromEntries((g.data as Array<{ key: string; value: number }>).map(r => [r.key, r.value]))
})

test.afterAll(async ({ request }) => {
  // Restauración: el guardado de tramos ahora es ATÓMICO (PUT de la tabla completa, conserva ids);
  // los POST/PUT/DELETE individuales se retiraron (405/404), así que ya no sirven para restaurar.
  await call(request, 'su', 'put', '/crm/settings', originalCrm)
  await call(request, 'su', 'put', '/ventas-diseno/sales-commission-tiers', {
    tiers: originalTiers.map(t => ({
      id: t.id, monto_minimo: Number(t.monto_minimo),
      monto_maximo: t.monto_maximo === null ? null : Number(t.monto_maximo), porcentaje: Number(t.porcentaje),
    })),
  })
  for (const [key, value] of Object.entries(originalGlobal)) {
    await call(request, 'su', 'put', `/admin/global-settings/${key}`, { value })
  }
  await call(request, 'su', 'patch', '/settings/preferences', { language: originalLanguage })
})

// ---------------------------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------------------------

test('API — settings de CRM y tramos: 403 para Admin&Cont y Bodega, 401 anónimo', async ({ request }) => {
  for (const key of ['conta', 'alm'] as const) {
    for (const [m, p] of [['get', '/crm/settings'], ['put', '/crm/settings'], ['get', '/ventas-diseno/sales-commission-tiers'], ['put', '/ventas-diseno/sales-commission-tiers']] as const) {
      const r = await call(request, key, m, p, m === 'get' ? undefined : {})
      expect(r.status(), `${key} ${m.toUpperCase()} ${p}`).toBe(403)
    }
  }
  await sleep(3000)
  expect((await request.get(`${DEV}/api/crm/settings`, { headers: { Accept: 'application/json' } })).status()).toBe(401)
})

test('UI — Admin&Cont no ve "Configuración global" en el Sidebar ni entra por URL directa', async ({ page, request }) => {
  await openAs(page, request, 'conta', '/configuracion/global')
  await expect(page.getByRole('heading', { name: 'Configuración global' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Configuración global' })).toHaveCount(0)
})

test('UI — Fiscal sigue exclusiva de Gerencia: Admin&Cont (Contabilidad) no ve el contenido en /admin-contab/fiscal', async ({ page, request }) => {
  await openAs(page, request, 'conta', '/admin-contab/fiscal')
  // El gate real es el 403 del backend: la pantalla no debe mostrar el formulario fiscal editable.
  await expect(page.getByRole('button', { name: /guardar/i })).toHaveCount(0)
})

// ---------------------------------------------------------------------------------------------
// Vista consolidada
// ---------------------------------------------------------------------------------------------

test('UI — superadmin: 12 tabs y solo la tab activa monta su panel', async ({ page, request }) => {
  const crmCalls: string[] = []
  page.on('request', r => { if (r.url().includes('/api/crm/settings')) crmCalls.push(r.method()) })
  await openAs(page, request, 'su', '/configuracion/global')
  await expect(page.getByRole('heading', { name: 'Configuración global' })).toBeVisible()
  const tabs = ['Fiscal', 'Alertas de fraude', 'Compras', 'Precios', 'Pedidos', 'Condiciones', 'Reportes', 'Bodega', 'Servicios', 'CRM', 'Comisión de vendedores', 'Global']
  for (const name of tabs) await expect(page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible()
  expect(crmCalls, 'CRM no debe pedirse antes de abrir su tab').toHaveLength(0)
  await page.getByRole('main').getByRole('button', { name: 'CRM', exact: true }).click()
  await expect(page.getByText('Umbrales de CRM')).toBeVisible()
  expect(crmCalls.length).toBeGreaterThan(0)
})

test('UI — cada una de las 12 tabs monta sin error de render y sin pantalla en blanco', async ({ page, request }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await openAs(page, request, 'su', '/configuracion/global')
  const tabs = ['Fiscal', 'Alertas de fraude', 'Compras', 'Precios', 'Pedidos', 'Condiciones', 'Reportes', 'Bodega', 'Servicios', 'CRM', 'Comisión de vendedores', 'Global']
  for (const name of tabs) {
    await page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
    await page.waitForTimeout(1200)
    const len = (await page.locator('main, #root').first().innerText()).length
    expect(len, `tab ${name} vacía`).toBeGreaterThan(80)
  }
  expect(pageErrors, 'errores JS no capturados').toEqual([])
})

// ---------------------------------------------------------------------------------------------
// Feedback ante un 422 (hallazgo B) y textos (hallazgo D)
// ---------------------------------------------------------------------------------------------

test('UI — CRM: valor inválido (0) → ¿el usuario ve el rechazo? (evidencia hallazgo B)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'CRM', exact: true }).click()
  const input = page.locator('input[type="number"]').first()
  await expect(input).toHaveValue('3') // esperar a que el panel cargue (si no, su useEffect pisa el valor)
  await input.fill('0')
  const put = page.waitForResponse(r => r.url().includes('/api/crm/settings') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar/i }).click()
  expect((await put).status()).toBe(422)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/__screenshots__/scrum945-crm-422-sin-feedback.png', fullPage: true })
  const visible = await page.locator('[role="alert"], [role="status"], .toast, [data-sonner-toast], .text-red-600, .text-red-500').count()
  expect.soft(visible, 'debe mostrarse un mensaje de error visible tras el 422').toBeGreaterThan(0)
  const after = await (await call(request, 'su', 'get', '/crm/settings')).json()
  expect(after).toEqual(originalCrm)
})

test('UI — Tramos: max <= min → el usuario ve el rechazo del guardado atómico (hallazgos A y B) y el confirm sin voseo (D)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'Comisión de vendedores' }).click()
  await expect(page.getByLabel('Monto mínimo 1')).toBeVisible() // tabla cargada
  const n = originalTiers.length
  await page.getByText('Agregar tramo').click()
  await page.getByLabel(`Monto mínimo ${n + 1}`).fill('500000')
  await page.getByLabel(`Monto máximo ${n + 1}`).fill('400000')
  await page.getByLabel(`% de comisión ${n + 1}`).fill('6')

  let dialogText = ''
  page.once('dialog', d => { dialogText = d.message(); void d.accept() })
  const put = page.waitForResponse(r => r.url().includes('/sales-commission-tiers') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar tramos/i }).click()
  expect((await put).status()).toBe(422)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/__screenshots__/scrum945-tramo-422-con-feedback.png', fullPage: true })
  const visible = await page.locator('[role="alert"]').count()
  expect(visible, 'debe mostrarse un mensaje de error visible tras el 422').toBeGreaterThan(0)
  expect(dialogText, 'texto del confirm de guardado en voseo').not.toMatch(/Confirmás/)

  // Descartar: no queda nada guardado, los tramos originales siguen intactos en el backend.
  await page.getByRole('button', { name: /cancelar/i }).click()
  const after = (await (await call(request, 'su', 'get', '/ventas-diseno/sales-commission-tiers')).json()) as unknown[]
  expect(after).toHaveLength(originalTiers.length)
})

test('UI — CRM: cambio válido (30) se guarda y cambia el filtro urgency=proximo (efecto real)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'CRM', exact: true }).click()
  await expect(page.locator('input[type="number"]').first()).toHaveValue('3')
  await page.locator('input[type="number"]').first().fill('30')
  const put = page.waitForResponse(r => r.url().includes('/api/crm/settings') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar/i }).click()
  expect((await put).status()).toBe(200)
  const proximo = async () => {
    const r = await call(request, 'su', 'get', '/crm/projects?urgency=proximo&per_page=100')
    const j = await r.json()
    return (j.data ?? j.rows ?? []).length as number
  }
  const con30 = await proximo()
  await call(request, 'su', 'put', '/crm/settings', originalCrm)
  const con3 = await proximo()
  expect(con30, 'con 30 días entran más proyectos que con 3').toBeGreaterThan(con3)
})

// ---------------------------------------------------------------------------------------------
// 3ª pasada (fixes A, B, C, E) — guardado atómico de tramos, freshness y tab Global
// ---------------------------------------------------------------------------------------------

test('UI — Tramos: un hueco se rechaza en el guardado atómico y el usuario ve el motivo; descartar deja todo intacto (hallazgo A)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'Comisión de vendedores' }).click()
  await expect(page.getByLabel('Monto mínimo 1')).toBeVisible()
  const n = originalTiers.length
  await page.getByLabel(`Monto mínimo ${n}`).fill('200000') // deja un hueco 119999.99 → 200000
  page.once('dialog', d => { void d.accept() })
  const put = page.waitForResponse(r => r.url().includes('/sales-commission-tiers') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar tramos/i }).click()
  expect((await put).status()).toBe(422)
  await expect(page.getByRole('alert').filter({ hasText: /hueco/i }).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/__screenshots__/scrum945-tramo-hueco-422.png', fullPage: true })
  await page.getByRole('button', { name: /cancelar/i }).click()
  await expect(page.getByLabel(`Monto mínimo ${n}`)).toHaveValue('120000')
  const after = (await (await call(request, 'su', 'get', '/ventas-diseno/sales-commission-tiers')).json()) as Array<Record<string, unknown>>
  expect(after.map(t => [t.id, Number(t.monto_minimo)])).toEqual(originalTiers.map(t => [t.id, Number(t.monto_minimo)]))
})

test('UI — Tramos: error por fila (`tiers.N.porcentaje`) visible y guardado válido de ida y vuelta conserva los ids (hallazgos A y B)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'Comisión de vendedores' }).click()
  await expect(page.getByLabel('Monto mínimo 1')).toBeVisible()
  // 1) porcentaje 101 → 422 por fila
  await page.getByLabel('% de comisión 1').fill('101')
  page.once('dialog', d => { void d.accept() })
  let put = page.waitForResponse(r => r.url().includes('/sales-commission-tiers') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar tramos/i }).click()
  expect((await put).status()).toBe(422)
  const rowAlert = page.getByRole('alert').filter({ hasText: /porcentaje|100/i }).first()
  await expect(rowAlert).toBeVisible()
  // Texto legible por fila (6ª pasada): "porcentaje (fila 1)", nunca la ruta cruda `tiers.0.porcentaje`.
  await expect(rowAlert).toContainText('porcentaje (fila 1)')
  await expect(rowAlert).not.toContainText('tiers.0')
  await page.screenshot({ path: 'e2e/__screenshots__/scrum945-tramo-error-por-fila-legible.png', fullPage: true })
  await page.getByRole('button', { name: /cancelar/i }).click()
  // 2) cambio válido 2 % → 2.5 %, luego vuelta a 2 %
  await page.getByLabel('% de comisión 2').fill('2.5')
  page.once('dialog', d => { void d.accept() })
  put = page.waitForResponse(r => r.url().includes('/sales-commission-tiers') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar tramos/i }).click()
  expect((await put).status()).toBe(200)
  let now = (await (await call(request, 'su', 'get', '/ventas-diseno/sales-commission-tiers')).json()) as Array<Record<string, unknown>>
  expect(now.map(t => t.id)).toEqual(originalTiers.map(t => t.id))
  expect(Number(now[1].porcentaje)).toBe(2.5)
  await page.getByLabel('% de comisión 2').fill('2')
  page.once('dialog', d => { void d.accept() })
  put = page.waitForResponse(r => r.url().includes('/sales-commission-tiers') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar tramos/i }).click()
  expect((await put).status()).toBe(200)
  now = (await (await call(request, 'su', 'get', '/ventas-diseno/sales-commission-tiers')).json()) as Array<Record<string, unknown>>
  expect(now.map(t => [t.id, Number(t.porcentaje)])).toEqual(originalTiers.map(t => [t.id, Number(t.porcentaje)]))
})

test('UI — CRM: recent >= stale muestra el rechazo (hallazgo C)', async ({ page, request }) => {
  await openAs(page, request, 'su', '/configuracion/global')
  await page.getByRole('main').getByRole('button', { name: 'CRM', exact: true }).click()
  const inputs = page.locator('input[type="number"]')
  await expect(inputs.nth(1)).toHaveValue('7')
  await inputs.nth(1).fill('60')
  await inputs.nth(2).fill('10')
  const put = page.waitForResponse(r => r.url().includes('/api/crm/settings') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar/i }).click()
  expect((await put).status()).toBe(422)
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByRole('alert').first()).toContainText(/reciente|frío/i)
  expect(await (await call(request, 'su', 'get', '/crm/settings')).json()).toEqual(originalCrm)
})

test('UI — tab Global (12ª): lazy-load, labels ES/EN sin claves crudas, rango local y guardado válido (hallazgo E)', async ({ page, request }) => {
  const globalCalls: string[] = []
  page.on('request', r => { if (r.url().includes('/api/admin/global-settings')) globalCalls.push(r.method()) })
  await openAs(page, request, 'su', '/configuracion/global')
  expect(globalCalls, 'Global no debe pedirse antes de abrir su tab').toHaveLength(0)
  await page.getByRole('main').getByRole('button', { name: 'Global', exact: true }).click()
  await expect(page.getByText('Tamaño máximo de documento (MB)')).toBeVisible()
  await expect(page.getByText('Archivar notificaciones leídas después de (días)')).toBeVisible()
  await expect(page.getByText('Retención de logs de auditoría en caliente (meses)')).toBeVisible()
  expect(globalCalls.length).toBeGreaterThan(0)
  const raw = /globalSettings\.|globalTab\.|labels\.|documents_max_size_mb|audit_logs_retention_months/
  expect(await page.getByRole('main').innerText(), 'claves i18n crudas en ES').not.toMatch(raw)

  // Rango mínimo de retención (12) validado en el cliente, sin request de escritura.
  const putsBefore = globalCalls.filter(m => m === 'PUT').length
  await page.getByLabel('Retención de logs de auditoría en caliente (meses)').fill('11')
  await page.getByRole('button', { name: /guardar/i }).click()
  await expect(page.getByRole('alert').first()).toContainText(/12/)
  expect(globalCalls.filter(m => m === 'PUT').length).toBe(putsBefore)
  await page.getByLabel('Retención de logs de auditoría en caliente (meses)').fill(String(originalGlobal['audit_logs.retention_months']))

  // Guardado válido (se restaura en afterAll): archivado de notificaciones +1 día.
  const notif = originalGlobal['notifications.archive_read_after_days']
  await page.getByLabel('Archivar notificaciones leídas después de (días)').fill(String(notif + 1))
  const put = page.waitForResponse(r => r.url().includes('/api/admin/global-settings/notifications.archive_read_after_days') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /guardar/i }).click()
  expect((await put).status()).toBe(200)

  // EN: mismos labels traducidos, sin claves crudas.
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByText('Maximum document size (MB)')).toBeVisible()
  await expect(page.getByText('Hot retention of audit logs (months)')).toBeVisible()
  expect(await page.getByRole('main').innerText(), 'claves i18n crudas en EN').not.toMatch(raw)
  const back = page.waitForResponse(r => r.url().includes('/api/settings/preferences') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'ES', exact: true }).click()
  await back
})

test('UI — Admin&Cont y Bodega no llegan a la tab Global (API 403)', async ({ request }) => {
  for (const key of ['conta', 'alm'] as const) {
    expect((await call(request, key, 'get', '/admin/global-settings')).status(), key).toBe(403)
    expect((await call(request, key, 'put', '/admin/global-settings/documents.max_size_mb', { value: 100 })).status(), key).toBe(403)
  }
})
