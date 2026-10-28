import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// Humo de Atlantic contra el stack local (E2E_BASE_URL, por defecto http://localhost:8092) con los datos del seed demo.
// Cubre lo construido en las fases 6 a 9 sin depender de datos de ningún cliente anterior:
//   A. cada rol demo inicia sesión y recorre las pantallas clave sin caídas (errores de página) ni 5xx de la API;
//   B. viajes de ida y vuelta por API como superadmin (región, catálogos, almacenes), con limpieza propia;
//   C. la interfaz de Catálogos y Almacenes se ve, y las pantallas de productos no traen vocabulario de otro sector.
// Correr con UN worker (npm run e2e:humo): nginx limita la API a 10 conexiones simultáneas (load shedding) y varios navegadores en paralelo reciben 503 por diseño.
// Las cuentas demo usan como contraseña su propio correo (seeder de identidades genéricas).

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8092'
const pass = (email: string) => process.env.E2E_DEMO_PASSWORD ?? email

const ROLES = [
  'superadmin', 'gerencia', 'contabilidad', 'asistenteadministrativa', 'lidercompras', 'liderbodega', 'asistentebodega',
  'auxiliarbodega', 'transporte', 'liderservicios', 'tecnico', 'tecnicogarantias', 'vendedor', 'lideroperaciones',
].map(r => `${r}@test.com`)

// Rutas que un rol puede o no tener: lo que se exige es que ninguna rompa la app ni devuelva 5xx.
const RUTAS = [
  '/', '/settings', '/configuracion/global', '/ventas-diseno/home', '/ventas-diseno/catalog', '/compras/configuracion',
  '/bodega/home', '/bodega/inventario', '/bodega/configuracion', '/inventario', '/servicios/ajustes',
  '/admin-contab/fiscal', '/admin-contab/empresa', '/admin-contab/datos-fiscales-clientes', '/crm/dashboard',
]

// Vocabulario de otro sector que el contrato de neutralidad prohíbe en el repo; se arma por fragmentos para que este archivo no lo nombre.
const VOCABULARIO_AJENO = new RegExp(
  [['show', 'room'], ['obar', 'rio'], ['dia', 'lux'], ['l[aá]m', 'para'], ['cande', 'labro'], ['lumi', 'naria'], ['bomb', 'illo']].map(p => p.join('')).join('|'),
  'i',
)

async function entrar(page: Page, email: string) {
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('atlanticerp_lang', 'es') })
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pass(email))
  await page.getByRole('button', { name: /iniciar sesión|login|sign in/i }).click()
  await expect(page).not.toHaveURL(/login/, { timeout: 15_000 })
}

async function token(request: APIRequestContext, email: string) {
  const r = await request.post(`${BASE}/api/auth/login`, { data: { email, password: pass(email) }, headers: { Accept: 'application/json' } })
  expect(r.status(), `login API de ${email}`).toBe(200)
  return (await r.json()).token as string
}

// ── A. matriz de roles ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('A. cada rol demo recorre las pantallas clave sin caídas', () => {
  for (const email of ROLES) {
    test(email, async ({ page }) => {
      test.setTimeout(120_000)
      const caidas: string[] = []
      const serverErrors: string[] = []
      page.on('pageerror', e => caidas.push(`${page.url()} → ${e.message}`))
      page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`) })

      await entrar(page, email)
      for (const ruta of RUTAS) {
        await page.goto(`${BASE}${ruta}`)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
        await expect(page.locator('body'), `${email} en ${ruta}`).not.toBeEmpty()
      }
      expect(caidas, 'errores de página').toEqual([])
      expect(serverErrors, 'respuestas 5xx de la API').toEqual([])
    })
  }
})

// ── B. viajes de ida y vuelta por API ───────────────────────────────────────────────────────────────────────────────────────
test.describe('B. superadmin: región, catálogos y almacenes por API', () => {
  test('la región de la empresa viaja en /auth/me con impuesto e identificación fiscal', async ({ request }) => {
    const t = await token(request, 'superadmin@test.com')
    const me = await request.get(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } })
    const u = (await me.json()) as { region?: { country: string; currency: string }; tax_label?: string; fiscal_id?: { label: string } }
    expect(u.region?.country).toBeTruthy()
    expect(u.region?.currency).toBeTruthy()
    expect(u.tax_label).toBeTruthy()
    expect(u.fiscal_id?.label).toBeTruthy()
  })

  test('catálogo de categorías: crear una propia, verla en la lista pública y borrarla; la de sistema no se borra', async ({ request }) => {
    const t = await token(request, 'superadmin@test.com')
    const h = { Authorization: `Bearer ${t}`, Accept: 'application/json' }
    const clave = `humo_${Date.now()}`
    const alta = await request.post(`${BASE}/api/admin/catalogs/product_category`, { headers: h, data: { key: clave, label: 'Categoría de humo' } })
    expect(alta.status()).toBe(201)
    const id = (await alta.json()).id as number
    try {
      const lista = await request.get(`${BASE}/api/catalogs/product_category`, { headers: h })
      expect(JSON.stringify(await lista.json())).toContain(clave)
    } finally {
      expect((await request.delete(`${BASE}/api/admin/catalogs/product_category/${id}`, { headers: h })).status()).toBe(204)
    }
    const todas = await (await request.get(`${BASE}/api/admin/catalogs/product_category`, { headers: h })).json() as { id: number; is_system: boolean }[]
    const sistema = todas.find(c => c.is_system)
    expect(sistema, 'existe una categoría de sistema («General»)').toBeTruthy()
    expect((await request.delete(`${BASE}/api/admin/catalogs/product_category/${sistema!.id}`, { headers: h })).status()).toBe(422)
  })

  test('almacenes: alta, renombre, desactivar y baja; los de sistema y el de despacho por defecto están protegidos', async ({ request }) => {
    const t = await token(request, 'superadmin@test.com')
    const h = { Authorization: `Bearer ${t}`, Accept: 'application/json' }
    const url = `${BASE}/api/bodega/settings/warehouses`
    const nombre = `Almacén humo ${Date.now()}`
    const alta = await request.post(url, { headers: h, data: { name: nombre, tipo: 'bodega' } })
    expect(alta.status()).toBeLessThan(300)
    const creado = await alta.json()
    const id = (creado.data ?? creado).id as number
    try {
      const ren = await request.put(`${url}/${id}`, { headers: h, data: { name: `${nombre} B`, tipo: 'exhibicion' } })
      expect(ren.status()).toBe(200)
      expect((await request.put(`${url}/${id}`, { headers: h, data: { is_active: false } })).status()).toBe(200)
    } finally {
      expect((await request.delete(`${url}/${id}`, { headers: h })).status()).toBeLessThan(300)
    }
    const lista = await (await request.get(url, { headers: h })).json()
    const almacenes = (lista.data ?? lista) as { id: number; name: string; funcion: string | null; despacho_por_defecto: boolean }[]
    expect(almacenes.map(a => a.name)).not.toContain(`${nombre} B`)
    const protegido = almacenes.find(a => a.funcion || a.despacho_por_defecto)
    expect(protegido, 'hay un almacén de sistema o de despacho por defecto').toBeTruthy()
    expect((await request.delete(`${url}/${protegido!.id}`, { headers: h })).status()).toBeGreaterThanOrEqual(400)
  })

  test('un rol sin permiso no puede administrar catálogos ni almacenes', async ({ request }) => {
    const t = await token(request, 'vendedor@test.com')
    const h = { Authorization: `Bearer ${t}`, Accept: 'application/json' }
    expect((await request.post(`${BASE}/api/admin/catalogs/product_category`, { headers: h, data: { key: 'no', label: 'No' } })).status()).toBe(403)
    expect((await request.post(`${BASE}/api/bodega/settings/warehouses`, { headers: h, data: { name: 'No permitido' } })).status()).toBe(403)
  })
})

// ── C. interfaz ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('C. interfaz de superadmin', () => {
  test('Configuración global ofrece la pestaña Catálogos con los dominios de vocabulario', async ({ page }) => {
    await entrar(page, 'superadmin@test.com')
    await page.goto(`${BASE}/configuracion/global`)
    await page.getByRole('tab', { name: /catálogos/i }).or(page.getByRole('button', { name: /catálogos/i })).first().click()
    await expect(page.getByText(/catálogos de vocabulario/i).first()).toBeVisible()
  })

  test('Configuración de Bodega lista los almacenes con los nombres neutros', async ({ page }) => {
    await entrar(page, 'superadmin@test.com')
    await page.goto(`${BASE}/bodega/configuracion`)
    await expect(page.getByText('Almacenes').first()).toBeVisible()
    await expect(page.getByText('Sala de exhibición 1').first()).toBeVisible()
  })

  for (const ruta of ['/bodega/inventario', '/bodega/configuracion', '/ventas-diseno/catalog', '/inventario']) {
    test(`sin vocabulario de otro sector en ${ruta}`, async ({ page }) => {
      await entrar(page, 'superadmin@test.com')
      await page.goto(`${BASE}${ruta}`)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      const visible = await page.locator('body').innerText()
      expect(visible.match(VOCABULARIO_AJENO)?.[0] ?? null).toBeNull()
    })
  }
})
