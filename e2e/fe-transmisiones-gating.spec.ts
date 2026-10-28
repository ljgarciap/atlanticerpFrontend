import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// SCRUM-1004 (seguimiento de SCRUM-987) — spec PERMANENTE del gating del visor de transmisiones al
// PAC. Regla del proyecto: un smoke que verifica un gate/permiso que ya se rompió una vez no se
// descarta. Este gate se rompió dos veces en la Senior Review de SCRUM-987 (fuga vía
// mark-uncollectible; el visor desaparecía al aprobar una NC).
//
// Diseño (sin consumir el sandbox de MSL ni depender de datos previos):
//  - API real: el 403 para cualquier actor que no sea Gerencia/superadmin vive en el middleware
//    `primary_approver_only`, que corre ANTES del controlador — no depende de que el documento exista.
//  - UI: se parcha la respuesta REAL del detalle de una factura (page.route) para forzar un estado
//    fiscal `rechazado`, y se responde el historial con un registro sintético con payload XSS.
//    Nunca se emite ni se reintenta nada contra el PAC.
//  - No modifica datos de negocio ni pac_ambiente (solo los logins dejan sus filas de sesión/auditoría).
//  - Sin IDs ni folios hardcodeados: toma la primera factura `facturada` que devuelva la API.
//
// Cobertura que queda en vitest (InvoiceDetailModal/DetalleNotaCreditoModal .test.tsx) y no aquí:
// "el visor sigue tras aprobar/rechazar una NC" — exige mutar una NC real.
//
// BASE explícito: PREQA_BASE_URL (default localhost). Se niega a correr contra producción.

const BASE = process.env.PREQA_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const MARK = process.env.E2E_FE_MARK_EMAIL ?? 'gerencia3@test.com'
const CONTABILIDAD = process.env.E2E_FE_NOMARK_EMAIL ?? 'contabilidad@test.com'
// En los entornos con roster real la contraseña de las cuentas de prueba es su propio email.
const passwordOf = (email: string) => process.env.E2E_FE_PASSWORD ?? email

const XSS = '<img src=x onerror="window.__xss=1">'
// CrowdSec banea la IP tras ~3 rutas distintas con 4xx en 10 s (feedback_preqa_crowdsec_no_paralelo): espaciar.
const espaciar = () => new Promise(resolve => setTimeout(resolve, 4000))
const VER = /Ver transmisiones al PAC|View PAC transmissions/i

test.use({ baseURL: BASE })
test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  const host = new URL(BASE).hostname
  if (!['localhost', '127.0.0.1', ...(process.env.E2E_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)].includes(host)) {
    throw new Error(`fe-transmisiones-gating solo corre contra local, dev o test (BASE=${BASE})`)
  }
})

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('/api/auth/login', { data: { email, password: passwordOf(email) } })
  expect(res.ok(), `login API de ${email}`).toBeTruthy()
  return (await res.json()).token as string
}

async function uiLogin(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(passwordOf(email))
  await page.getByRole('button', { name: /iniciar sesión|login|sign in/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

/** Primera factura `facturada` visible para Gerencia; null si el entorno no tiene ninguna. */
async function primeraFacturada(request: APIRequestContext, token: string) {
  const res = await request.get('/api/admin-contab/invoices', {
    headers: { Authorization: `Bearer ${token}` },
    params: { view: 'plana', per_page: 100 },
  })
  expect(res.ok()).toBeTruthy()
  const rows = ((await res.json()).rows ?? []) as Array<{ order_id: number; estado: string; numero_factura: string | null }>
  return rows.find(r => r.estado === 'facturada' && r.numero_factura) ?? null
}

/** Fuerza fe_estado=rechazado sobre el detalle REAL; el flag puede_ver_fe_transmisiones queda como lo mandó el backend. */
async function forzarEstadoRechazado(page: Page) {
  await page.route('**/api/admin-contab/invoices/*/detail*', async route => {
    const resp = await route.fetch()
    const body = await resp.json()
    await route.fulfill({ response: resp, json: { ...body, fe_estado: 'rechazado', fe_detalle: null } })
  })
}

async function abrirFactura(page: Page, folio: string) {
  await page.goto('/admin-contab/facturacion')
  await page.getByRole('button', { name: /Vista plana|Flat view/i }).click()
  await page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i]').first().fill(folio)
  await page.getByText(folio, { exact: false }).first().click()
}

test('API: un actor que no es Gerencia recibe 403 en ambos endpoints de transmisiones; Gerencia no', async ({ request }) => {
  const contabilidad = await apiToken(request, CONTABILIDAD)
  const mark = await apiToken(request, MARK)

  // ID arbitrario a propósito: `primary_approver_only` responde antes de resolver el documento.
  for (const path of ['/api/admin-contab/invoices/1/fe-transmisiones', '/api/admin-contab/notas-credito/1/fe-transmisiones']) {
    const denegado = await request.get(path, { headers: { Authorization: `Bearer ${contabilidad}` } })
    expect(denegado.status(), `${path} con Contabilidad`).toBe(403)
    await espaciar()

    const permitido = await request.get(path, { headers: { Authorization: `Bearer ${mark}` } })
    expect([200, 404], `${path} con Gerencia`).toContain(permitido.status())
    await espaciar()
  }
})

test('API: el detalle de una factura solo trae el flag y fe_detalle para Gerencia', async ({ request }) => {
  const mark = await apiToken(request, MARK)
  const fila = await primeraFacturada(request, mark)
  test.skip(fila === null, 'el entorno no tiene ninguna factura facturada para inspeccionar')

  const contabilidad = await apiToken(request, CONTABILIDAD)
  const resApprover = await request.get(`/api/admin-contab/invoices/${fila!.order_id}/detail`, { headers: { Authorization: `Bearer ${mark}` } })
  const resContabilidad = await request.get(`/api/admin-contab/invoices/${fila!.order_id}/detail`, { headers: { Authorization: `Bearer ${contabilidad}` } })
  expect(resApprover.status()).toBe(200)
  expect(resContabilidad.status()).toBe(200)
  const conApprover = await resApprover.json()
  const conContabilidad = await resContabilidad.json()

  expect(conApprover.puede_ver_fe_transmisiones).toBe(true)
  expect(conContabilidad.puede_ver_fe_transmisiones ?? false).toBe(false)
  // Deny-by-default: el motivo del rechazo del PAC nunca llega a quien no es Gerencia.
  expect(conContabilidad.fe_detalle ?? null).toBeNull()
})

test('UI: Gerencia ve el visor en una factura rechazada y el payload se muestra escapado (XSS)', async ({ page, request }) => {
  const mark = await apiToken(request, MARK)
  const fila = await primeraFacturada(request, mark)
  test.skip(fila === null, 'el entorno no tiene ninguna factura facturada para abrir')

  let dialogos = 0
  page.on('dialog', d => { dialogos += 1; void d.dismiss() })
  await forzarEstadoRechazado(page)
  await page.route('**/api/admin-contab/invoices/*/fe-transmisiones*', route => route.fulfill({
    json: {
      data: [{
        id: 1, created_at: new Date().toISOString(), provider: 'msl', ambiente: 'testing',
        operacion: 'certificar', origen: 'certificacion', endpoint: '/v1/documentos',
        serie: '001', numero_fiscal: '0001', resultado: 'rechazado', http_status: 422,
        duracion_ms: 120, request_id: 'e2e-gating',
        request_payload: { receptor: { razonSocial: XSS } },
        response_body: { codigo: '9026', mensaje: XSS },
      }],
    },
  }))

  await uiLogin(page, MARK)
  await abrirFactura(page, fila!.numero_factura!)

  const boton = page.getByRole('button', { name: VER })
  await expect(boton).toBeVisible()
  await boton.click()

  await expect(page.locator('pre').filter({ hasText: '9026' })).toBeVisible()
  // Se ve como texto literal, jamás como elemento ni ejecutado.
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  expect(dialogos).toBe(0)
  await expect(page.locator('body')).toContainText('<img src=x')
})

test('UI: un usuario que no es Gerencia no ve el visor ni dispara la petición de transmisiones', async ({ page, request }) => {
  const mark = await apiToken(request, MARK)
  const fila = await primeraFacturada(request, mark)
  test.skip(fila === null, 'el entorno no tiene ninguna factura facturada para abrir')

  const llamadas: string[] = []
  page.on('request', r => { if (r.url().includes('fe-transmisiones')) llamadas.push(r.url()) })
  await forzarEstadoRechazado(page)

  await uiLogin(page, CONTABILIDAD)
  const detalle = page.waitForResponse(r => /\/admin-contab\/invoices\/\d+\/detail/.test(r.url()))
  await abrirFactura(page, fila!.numero_factura!)
  expect((await detalle).status()).toBe(200)

  // El modal ya cargó con el estado forzado (el badge fiscal dice "rechazado"), pero sin visor.
  await expect(page.getByText(/rechazad|rejected/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: VER })).toHaveCount(0)
  expect(llamadas).toHaveLength(0)
})
