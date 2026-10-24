import { readFileSync } from 'node:fs'
import { test, expect, type Page, type Route } from '@playwright/test'

// SCRUM-990 — spec PERMANENTE de Bodega > Vista Bodegas > Zona Libre (catálogo de Lafayette de SOLO CONSULTA).
//
// Por qué se queda: no hay mockup en Jira; la spec visual atlanticerp-backend/docs/specs/scrum990-zona-libre-ux.md ES la referencia y este
// archivo hace verificables sus 12 criterios. También fija el CONTRATO con el backend: el mock de `GET /api/bodega/zona-libre/productos`
// valida los parámetros EXACTAMENTE como `ZonaLibreCatalogoController` (un parámetro inválido responde 422, igual que producción) y
// pagina, busca (sin acentos), filtra y ordena como el servidor real, así que un desajuste del front rompe acá y no en dev.
// Autosembrado, sin IDs reales ni entornos: la sesión se inyecta en localStorage y TODA la API se responde con page.route.
// BASE explícito por ZONA_LIBRE_BASE_URL (default: localhost del dev server, nunca dev.atlanticerp.ai).

const BASE = process.env.ZONA_LIBRE_BASE_URL ?? 'http://localhost:5173'
test.use({ baseURL: BASE })

const ES = JSON.parse(readFileSync('src/i18n/locales/es/bodega.json', 'utf-8')) as {
  warehouses: Record<string, any>
}
const W = ES.warehouses
const ZL = W.zonaLibre
const ST = (JSON.parse(readFileSync('src/i18n/locales/es/settings.json', 'utf-8')) as { global: Record<string, string> }).global
const IMG_HOST = 'https://img.lafayette-e2e.invalid'
const OK_IMG = `${IMG_HOST}/ok.png`
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

interface ApiRow {
  id: string; referencia_lafayette: string; referencia: string | null; descripcion: string | null; marca: string | null
  categoria: string | null; url_imagen: string | null; disponible: number; precio: number | null; synced_at: string | null
}

function seedRows(n: number): ApiRow[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1
    const id = `LNP${String(i).padStart(7, '0')}`
    return {
      id, referencia_lafayette: id, referencia: `REF-${String(i).padStart(4, '0')}`,
      descripcion: i === 1 ? 'Lámpara colgante nórdica' : `Luminaria de prueba ${i}`,
      marca: i % 3 === 0 ? 'Marca Tres' : 'Marca Uno', categoria: i % 2 === 0 ? 'PANELES' : 'SPOTS',
      url_imagen: i === 1 ? OK_IMG : null,
      disponible: i % 7 === 0 ? 0 : i * 3, precio: i % 11 === 0 ? null : 10 + i, synced_at: '2026-09-30T12:00:00-05:00',
    }
  })
}

const SORTS = ['referencia_lafayette', 'referencia', 'descripcion', 'marca', 'categoria', 'disponible', 'precio']

/** Reglas de `ZonaLibreCatalogoController::productos` (espejo). Devuelve la lista de violaciones (vacía = válido). `canSeePrice`: sin
 * compras.read ni superadmin.all, `sort=precio` también es 422 (ronda 2). */
function violations(q: URLSearchParams, canSeePrice = true): string[] {
  const out: string[] = []
  const allowed = ['search', 'categoria', 'solo_disponibles', 'sort', 'dir', 'page', 'per_page']
  for (const k of q.keys()) if (!allowed.includes(k)) out.push(`parámetro desconocido: ${k}`)
  const search = q.get('search')
  if (search !== null && (search.length < 2 || search.length > 100)) out.push('search debe tener 2..100 caracteres')
  const sd = q.get('solo_disponibles')
  if (sd !== null && !['true', 'false', '1', '0'].includes(sd)) out.push('solo_disponibles inválido')
  const sort = q.get('sort')
  if (sort !== null && !SORTS.includes(sort)) out.push('sort fuera de la lista blanca')
  const dir = q.get('dir')
  if (dir !== null && !['asc', 'desc'].includes(dir)) out.push('dir inválido')
  const page = q.get('page')
  if (page !== null && !(Number.isInteger(Number(page)) && Number(page) >= 1 && Number(page) <= 10000)) out.push('page inválido (1..10000)')
  if (!canSeePrice && sort === 'precio') out.push('sort=precio requiere compras.read o superadmin.all')
  const pp = q.get('per_page')
  if (pp !== null && !['25', '50', '100'].includes(pp)) out.push('per_page fuera de 25/50/100')
  return out
}

const fold = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Options {
  rows?: ApiRow[]
  /** Cuántas primeras respuestas del catálogo fallan con 500. */
  failFirst?: number
  /** Retraso (ms) de cada respuesta del catálogo, para ver el estado de carga. */
  delayMs?: number
  /** Lo que el front pidió al "backend" (query de cada GET del catálogo), para asertarlo. */
  requests?: Array<Record<string, string>>
  /** Referer de cada petición de imagen (debe ser vacío: referrerPolicy no-referrer). */
  imageReferers?: Array<string | undefined>
  /** ¿El usuario tiene compras.read o superadmin.all (ve el precio)? Defecto true. Sin él: `precio: null`, `puede_ver_precio: false`, sort=precio 422. */
  canSeePrice?: boolean
  /** Permisos de la sesión (defecto bodega.read). */
  permissions?: string[]
  /** Umbral de la guarda de Lafayette y los PATCH recibidos en /api/settings/system. */
  settings?: { ratio?: number; patches?: Array<Record<string, unknown>> }
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

function fakeUser(permissions: string[] = ['bodega.read']) {
  return {
    id: 987655, first_name: 'Usuario', last_name: 'E2E', email: 'zona-libre-e2e@example.invalid', language: 'es', role: 'lider_bodega',
    permissions, modules: {}, flags: { approve_large_amounts: false, manage_users: false }, security_level: 1,
  }
}

const WAREHOUSES = [
  { id: 6, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta', solo_consulta: false },
  // El API la devuelve EN MEDIO (por id): la pantalla la pinta al final.
  { id: 7, name: 'Bodega Zona Libre', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente', solo_consulta: true },
  { id: 8, name: 'Showroom Obarrio', responsable: null, capacidad_pct: 40, modo_detalle: 'ubicacion_exacta', solo_consulta: false },
]

async function setup(page: Page, opts: Options = {}) {
  const rows = opts.rows ?? seedRows(60)
  let failures = opts.failFirst ?? 0
  const canSeePrice = opts.canSeePrice ?? true
  const user = fakeUser(opts.permissions)

  await page.addInitScript(([u]) => {
    localStorage.setItem('accessToken', 'e2e-token')
    localStorage.setItem('atlanticerp_lang', 'es')
    localStorage.setItem('atlanticerp-auth-v3', JSON.stringify({ state: { user: u, refreshToken: 'e2e-refresh' }, version: 0 }))
  }, [user])

  // Fallback (prioridad más baja): lo demás que el shell pida al montar.
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill(json([])))
  await page.route(url => url.pathname.startsWith('/api/auth/'), route => route.fulfill(json({ user })))

  await page.route(/\/api\/bodega\/warehouses(\?.*)?$/, route => route.fulfill(json({ data: WAREHOUSES })))
  await page.route(/\/api\/bodega\/warehouses\/\d+(\?.*)?$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop())
    const w = WAREHOUSES.find(x => x.id === id)
    if (w?.solo_consulta) {
      return route.fulfill(json({
        warehouse: w,
        kpis: { responsable: null, total_products: rows.length, total_units: rows.reduce((a, r) => a + r.disponible, 0), capacidad_pct: null, last_synced_at: '2026-09-30T17:05:00Z' },
        ubicaciones: [], data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
      }))
    }
    return route.fulfill(json({
      warehouse: w ?? WAREHOUSES[0],
      kpis: { responsable: 'Jorge P.', total_products: 1, total_units: 8, capacidad_pct: 68 },
      ubicaciones: ['A-1-03'],
      data: [{
        stock_id: 1, catalog_product_id: 99, factory_reference: 'CAND-CRIS-IMP', reference: 'CRISTAL-IMPERIAL', ubicacion: 'A-1-03',
        description: 'Candelabro Cristal Imperial', categoria: 'Candelabros', unidades_en_bodega: 8, disponible: 12, por_servir: 3,
        stock_total: 15, por_ingresar: 0, en_camino: 0, stock_minimo: 10, estado: 'disponible', proveedor: 'LightCorp',
      }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    }))
  })

  await page.route(/\/api\/bodega\/zona-libre\/productos(\?.*)?$/, async route => {
    const q = new URL(route.request().url()).searchParams
    opts.requests?.push(Object.fromEntries(q.entries()))
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
    if (failures > 0) { failures--; return route.fulfill(json({ message: 'Server Error' }, 500)) }
    const bad = violations(q, canSeePrice)
    if (bad.length > 0) return route.fulfill(json({ message: bad[0], errors: { query: bad } }, 422))

    let list = [...rows]
    const search = q.get('search')
    if (search) {
      const needle = fold(search)
      list = list.filter(r => [r.referencia_lafayette, r.referencia, r.descripcion, r.marca].some(v => fold(v).includes(needle)))
    }
    const cat = q.get('categoria')
    if (cat) list = list.filter(r => r.categoria === cat)
    if (q.get('solo_disponibles') === 'true' || q.get('solo_disponibles') === '1') list = list.filter(r => r.disponible > 0)

    const sort = (q.get('sort') ?? 'referencia') as keyof ApiRow
    const dir = q.get('dir') === 'desc' ? -1 : 1
    list.sort((a, b) => {
      const av = a[sort], bv = b[sort]
      if (av === null && bv === null) return 0
      if (av === null) return 1 // NULLS LAST en ambos sentidos
      if (bv === null) return -1
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir
    })

    const perPage = Number(q.get('per_page') ?? 25)
    const pageNo = Number(q.get('page') ?? 1)
    // Sin permiso de precio el servidor ni lo serializa: `precio` null en todas las filas.
    const slice = list.slice((pageNo - 1) * perPage, pageNo * perPage).map(r => (canSeePrice ? r : { ...r, precio: null }))
    return route.fulfill(json({
      data: slice,
      meta: {
        total: list.length, per_page: perPage, current_page: pageNo, last_page: Math.max(1, Math.ceil(list.length / perPage)),
        categorias: [...new Set(rows.map(r => r.categoria).filter((c): c is string => !!c && c !== ''))].sort(),
        total_catalogo: rows.length, ultima_sincronizacion: rows.length ? '2026-09-30T17:05:00Z' : null,
        puede_ver_precio: canSeePrice,
      },
    }))
  })

  // Configuración global (SCRUM-990 ronda 2): GET devuelve el objeto de settings; PATCH aplica las reglas del backend (rango 0,5..1,0 -> 422 con error
  // en la clave; settings.global sin superadmin.all -> 403) y responde con el objeto de settings COMPLETO.
  let ratio = opts.settings?.ratio ?? 0.9
  const settingsBody = () => ({
    default_language: 'es', default_theme: 'light', session_timeout_min: 600, mfa_mode: 'optional', share_links_expiration_days: 30,
    session_inactivity_hours: 10, demo_mode_enabled: false, lafayette_guarda_min_ratio: ratio,
  })
  await page.route(/\/api\/settings\/preferences(\?.*)?$/, route => route.fulfill(json({ language: 'es', theme: 'light', session_timeout_min: 600, demo_mode_enabled: false })))
  await page.route(/\/api\/settings\/system(\?.*)?$/, route => {
    if (route.request().method() === 'GET') return route.fulfill(json(settingsBody()))
    const body = route.request().postDataJSON() as Record<string, unknown>
    opts.settings?.patches?.push(body)
    if ('lafayette_guarda_min_ratio' in body) {
      if (!user.permissions.includes('superadmin.all')) return route.fulfill(json({ message: 'Unauthorized' }, 403))
      const v = Number(body.lafayette_guarda_min_ratio)
      if (!Number.isFinite(v) || v < 0.5 || v > 1) {
        return route.fulfill(json({ message: 'invalid', errors: { lafayette_guarda_min_ratio: ['The lafayette guarda min ratio field must be between 0.5 and 1.'] } }, 422))
      }
      ratio = v
    }
    return route.fulfill(json(settingsBody()))
  })

  // Imágenes de Lafayette simuladas; se registra el Referer (debe ir vacío).
  await page.route(`${IMG_HOST}/**`, route => {
    opts.imageReferers?.push(route.request().headers()['referer'])
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 })
  })
}

async function openZonaLibre(page: Page) {
  await page.goto('/bodega/bodegas')
  await page.getByRole('button', { name: /Bodega Zona Libre/ }).click()
  await expect(page.getByTestId('zona-libre-catalogo')).toBeVisible()
}

const rowsLocator = (page: Page) => page.locator('[data-testid="zona-libre-catalogo"] table tbody tr')

test.describe('SCRUM-990 — Zona Libre de solo consulta', () => {
  test('1. la pestaña va al final con la insignia "Solo consulta"; las demás pestañas y su tabla de 15 columnas siguen intactas', async ({ page }) => {
    await setup(page)
    await page.goto('/bodega/bodegas')
    // Fila de pestañas de Vista Bodegas (el encabezado de la app también lleva border-b: se distingue por pb-3).
    const tabs = page.locator('div.border-b.pb-3').first().getByRole('button')
    await expect(tabs.first()).toContainText('Bodega Central')
    await expect(tabs.last()).toContainText('Bodega Zona Libre')
    await expect(page.getByText(ZL.badge, { exact: true })).toHaveCount(1)
    await expect(page.getByTestId('solo-consulta-tabs')).toBeVisible()
    // Bodega Central: tabla de 15 columnas con su columna "Acción" y el botón Reubicar.
    await expect(page.getByRole('columnheader')).toHaveCount(15)
    await expect(page.getByRole('columnheader', { name: W.table.action })).toBeVisible()
    await expect(page.getByRole('button', { name: W.table.relocate })).toBeVisible()
    await expect(page.getByRole('button', { name: W.relocationRequests.openButton })).toBeVisible()
  })

  test('2. al abrir Zona Libre: aviso permanente visible sin scroll, 3 KPI del catálogo (sin Responsable ni % de capacidad) y última sincronización', async ({ page }) => {
    await setup(page)
    await openZonaLibre(page)
    const note = page.getByRole('note')
    await expect(note).toContainText(ZL.noticeTitle)
    await expect(note).toContainText(ZL.noticeBody)
    const box = await note.boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)

    const zone = page.getByTestId('zona-libre-catalogo')
    for (const label of [ZL.kpis.products, ZL.kpis.available, ZL.kpis.lastSync]) {
      // Los rótulos de KPI son <div> en mayúsculas (el de "Disponible" se repite luego como columna y en las tarjetas móviles).
      await expect(zone.locator('div.uppercase', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) })).toBeVisible()
    }
    await expect(page.getByText(W.kpis.responsable, { exact: true })).toHaveCount(0)
    await expect(page.getByText(W.kpis.capacityUsed, { exact: true })).toHaveCount(0)
    await expect(page.getByText('30 sept 2026', { exact: false }).first()).toBeVisible()
  })

  test('3. 8 columnas exactas, cero botones en el cuerpo y ninguna acción de una bodega operativa', async ({ page }) => {
    await setup(page)
    await openZonaLibre(page)
    const t = ZL.table
    await expect(page.locator('[data-testid="zona-libre-catalogo"] thead th')).toHaveText([
      t.image, t.lafayetteId, t.reference, t.description, t.brand, t.category, t.available, t.price,
    ])
    await expect(rowsLocator(page).first()).toBeVisible()
    await expect(page.locator('[data-testid="zona-libre-catalogo"] tbody button')).toHaveCount(0)
    const content = (await page.locator('main, body').first().innerText())
    for (const forbidden of [W.table.action, W.table.relocate, W.table.viewDetail, W.chips.freeSpace, W.locations.manageButton, W.relocationRequests.openButton, 'Ajustar', 'Contar', 'Exportar']) {
      expect(content, `no debe aparecer "${forbidden}"`).not.toContain(forbidden)
    }
    await expect(page.getByRole('checkbox')).toHaveCount(0)
  })

  test('4. paginación del servidor: <= 25 filas, página 2 pide page=2, sin "Todos", y ninguna respuesta pasa de 100 filas', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { requests })
    await openZonaLibre(page)
    await expect(rowsLocator(page)).toHaveCount(25)
    expect(requests[0]).toEqual({ sort: 'referencia', dir: 'asc', page: '1', per_page: '25' })

    await page.getByRole('button', { name: '2', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.page).toBe('2')
    await expect(rowsLocator(page)).toHaveCount(25)

    const perPage = page.getByRole('combobox').filter({ has: page.locator('option[value="25"]') })
    await expect(perPage.locator('option')).toHaveText(['25 / pág', '50 / pág', '100 / pág']) // sin "Todos"

    await perPage.selectOption('50')
    await expect.poll(() => requests.at(-1)?.per_page).toBe('50')
    expect(requests.at(-1)?.page).toBe('1')
    for (const r of requests) expect(['25', '50', '100']).toContain(r.per_page)
  })

  test('5. búsqueda con y sin acentos filtra y vuelve a la página 1; sin resultados muestra el vacío y "Limpiar filtros" restablece', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { requests })
    await openZonaLibre(page)
    await page.getByRole('button', { name: '2', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.page).toBe('2')

    const search = page.getByRole('searchbox')
    await search.fill('lampara') // sin acento: el servidor encuentra "Lámpara"
    await search.press('Enter')
    await expect.poll(() => requests.at(-1)).toMatchObject({ search: 'lampara', page: '1' })
    await expect(rowsLocator(page)).toHaveCount(1)
    await expect(rowsLocator(page).first()).toContainText('Lámpara colgante nórdica')

    await search.fill('lámpara') // con acento
    await search.press('Enter')
    await expect(rowsLocator(page)).toHaveCount(1)

    await search.fill('zzzz-no-existe')
    await search.press('Enter')
    await expect(page.locator('td', { hasText: ZL.empty })).toBeVisible()
    await page.getByRole('button', { name: W.filters.clear }).last().click()
    await expect(rowsLocator(page)).toHaveCount(25)
    await expect(search).toHaveValue('')
  })

  test('6. los productos con disponibilidad 0 se ven sin activar ningún filtro y "Solo con disponibilidad" los oculta', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { requests })
    await openZonaLibre(page)
    expect(requests[0]).not.toHaveProperty('solo_disponibles')
    // REF-0007 tiene disponible 0 (i % 7 === 0).
    await expect(rowsLocator(page).filter({ hasText: 'REF-0007' })).toBeVisible()
    await page.getByRole('switch').click()
    await expect.poll(() => requests.at(-1)).toMatchObject({ solo_disponibles: 'true', page: '1' })
    await expect(rowsLocator(page).filter({ hasText: 'REF-0007' })).toHaveCount(0)
  })

  test('7. ordenar por Disponible/Precio alterna aria-sort ascending/descending y manda sort/dir de la lista blanca', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { requests })
    await openZonaLibre(page)
    const th = (name: string) => page.getByRole('columnheader', { name })
    await expect(th(ZL.table.reference)).toHaveAttribute('aria-sort', 'ascending')

    await page.getByRole('button', { name: ZL.table.available }).click()
    await expect(th(ZL.table.available)).toHaveAttribute('aria-sort', 'ascending')
    await expect.poll(() => requests.at(-1)).toMatchObject({ sort: 'disponible', dir: 'asc', page: '1' })
    await page.getByRole('button', { name: ZL.table.available }).click()
    await expect(th(ZL.table.available)).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(() => requests.at(-1)).toMatchObject({ sort: 'disponible', dir: 'desc' })

    await page.getByRole('button', { name: ZL.table.price }).click()
    await expect(th(ZL.table.price)).toHaveAttribute('aria-sort', 'ascending')
    await expect(th(ZL.table.available)).toHaveAttribute('aria-sort', 'none')
    // Teclado: Enter sobre un encabezado enfocado también ordena.
    await page.getByRole('button', { name: ZL.table.brand }).focus()
    await page.keyboard.press('Enter')
    await expect(th(ZL.table.brand)).toHaveAttribute('aria-sort', 'ascending')
  })

  test('8. el precio solo se rotula como "Precio Lafayette"; ningún otro rótulo de tipo de precio', async ({ page }) => {
    await setup(page)
    await openZonaLibre(page)
    const text = await page.getByTestId('zona-libre-catalogo').innerText()
    expect(text).not.toMatch(/precio[_ ]?[1-7]\b/i)
    expect(text).not.toMatch(/mayorista|distribuidor|costo|margen/i)
    await expect(page.getByRole('columnheader', { name: ZL.table.price })).toBeVisible()
    await expect(rowsLocator(page).filter({ hasText: 'REF-0001' })).toContainText('$11.00')
    await expect(rowsLocator(page).filter({ hasText: 'REF-0011' })).toContainText('—') // sin precio
  })

  test('9a. estado de carga: esqueleto de 8 filas con aria-busy y luego las filas reales', async ({ page }) => {
    await setup(page, { delayMs: 1200 })
    await page.goto('/bodega/bodegas')
    await page.getByRole('button', { name: /Bodega Zona Libre/ }).click()
    await expect(page.getByTestId('zona-libre-skeleton')).toHaveCount(8)
    await expect(page.locator('[data-testid="zona-libre-catalogo"] table')).toHaveAttribute('aria-busy', 'true')
    await expect(rowsLocator(page).first()).toContainText('REF-0001', { timeout: 10_000 })
    await expect(page.getByTestId('zona-libre-skeleton')).toHaveCount(0)
  })

  test('9b. error 500: mensaje con role=alert y "Reintentar" recupera la tabla', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    // La app reintenta una vez (src/lib/queryClient.ts, retry: 1): se necesitan DOS fallos seguidos para que aparezca el error.
    await setup(page, { failFirst: 2, requests })
    await openZonaLibre(page)
    await expect(page.getByRole('alert')).toContainText(ZL.error)
    await expect(page.locator('[data-testid="zona-libre-catalogo"] table')).toHaveCount(0)
    await page.getByRole('button', { name: ZL.retry }).click()
    await expect(rowsLocator(page).first()).toContainText('REF-0001')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(requests.length).toBeGreaterThanOrEqual(3)
  })

  test('9c. catálogo sin sincronizar (total 0): panel informativo, sin tabla ni filtros, con el aviso permanente', async ({ page }) => {
    await setup(page, { rows: [] })
    await openZonaLibre(page)
    await expect(page.getByText(ZL.notSynced)).toBeVisible()
    await expect(page.getByText(ZL.notSyncedHint)).toBeVisible()
    await expect(page.getByRole('note')).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveCount(0)
    await expect(page.locator('[data-testid="zona-libre-catalogo"] table')).toHaveCount(0)
  })

  test('10. Zona Libre no aparece como destino al reubicar desde otra bodega', async ({ page }) => {
    await setup(page)
    await page.goto('/bodega/bodegas')
    await page.getByRole('button', { name: W.table.relocate }).click()
    const select = page.locator('select', { has: page.locator('option', { hasText: W.relocateModal.selectDestination }) })
    await expect(select).toBeVisible()
    await expect(select.locator('option', { hasText: 'Bodega Zona Libre' })).toHaveCount(0)
    await expect(select.locator('option', { hasText: 'Showroom Obarrio' })).toHaveCount(1)
  })

  for (const vp of [{ w: 1280, h: 800 }, { w: 768, h: 1024 }, { w: 390, h: 844 }]) {
    test(`11. responsive ${vp.w}px: sin scroll horizontal de página y la presentación correcta`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await setup(page)
      await openZonaLibre(page)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, 'scroll horizontal de la página').toBeLessThanOrEqual(0)

      const table = page.locator('[data-testid="zona-libre-catalogo"] table')
      const cards = page.locator('[data-testid="zona-libre-catalogo"] ul')
      if (vp.w >= 1024) {
        await expect(table).toBeVisible()
        await expect(page.getByRole('columnheader', { name: ZL.table.lafayetteId })).toBeVisible()
        await expect(page.getByRole('columnheader', { name: ZL.table.brand })).toBeVisible()
      } else if (vp.w >= 768) {
        await expect(table).toBeVisible()
        await expect(page.getByRole('columnheader', { name: ZL.table.lafayetteId })).toBeHidden()
        await expect(page.getByRole('columnheader', { name: ZL.table.brand })).toBeHidden()
        await expect(page.getByRole('columnheader', { name: ZL.table.reference })).toBeVisible()
      } else {
        await expect(table).toBeHidden()
        await expect(cards).toBeVisible()
        await expect(cards.locator('li').first()).toContainText('REF-0001')
      }
    })
  }

  test('12. accesibilidad: aviso role=note, tabla con caption, búsqueda con etiqueta y modo oscuro con el aviso legible', async ({ page }) => {
    await setup(page)
    await openZonaLibre(page)
    await expect(page.getByRole('note')).toBeVisible()
    await expect(page.locator('[data-testid="zona-libre-catalogo"] table caption')).toHaveText(ZL.table.caption)
    await expect(page.getByLabel(ZL.filters.searchLabel)).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveAttribute('aria-describedby', 'zona-libre-notice')

    const lightBg = await page.getByRole('note').evaluate(el => getComputedStyle(el).backgroundColor)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const darkBg = await page.getByRole('note').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(darkBg, 'el aviso usa el remapeo oscuro de slate').not.toBe(lightBg)
    await expect(page.getByRole('note')).toBeVisible()
  })

  test('14. SIN permiso de precio (ni compras.read ni superadmin.all): 7 columnas, sin Precio ni su orden, y ningún precio en la vista', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { canSeePrice: false, requests })
    await openZonaLibre(page)
    const t = ZL.table
    await expect(page.locator('[data-testid="zona-libre-catalogo"] thead th')).toHaveText([
      t.image, t.lafayetteId, t.reference, t.description, t.brand, t.category, t.available,
    ])
    await expect(page.getByRole('button', { name: t.price })).toHaveCount(0)
    await expect(rowsLocator(page).first().locator('td')).toHaveCount(7)
    const text = await page.getByTestId('zona-libre-catalogo').innerText()
    expect(text).not.toContain('$')
    expect(text).not.toContain(t.price)
    // Ordenar por cualquier otra columna funciona y NUNCA se pide sort=precio.
    await page.getByRole('button', { name: t.available }).click()
    await expect(page.getByRole('columnheader', { name: t.available })).toHaveAttribute('aria-sort', 'ascending')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(requests.every(r => r.sort !== 'precio')).toBe(true)
  })

  test('14b. SIN permiso de precio en móvil: las tarjetas no rotulan ni muestran precio', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page, { canSeePrice: false })
    await openZonaLibre(page)
    const cards = page.locator('[data-testid="zona-libre-catalogo"] ul')
    await expect(cards.locator('li').first()).toContainText('REF-0001')
    await expect(cards.locator('dt', { hasText: ZL.table.price })).toHaveCount(0)
    expect(await cards.innerText()).not.toContain('$')
  })

  test('14c. CON permiso de precio la columna, el orden por precio y los precios siguen apareciendo (contraste de 14)', async ({ page }) => {
    const requests: Array<Record<string, string>> = []
    await setup(page, { canSeePrice: true, requests })
    await openZonaLibre(page)
    await expect(page.locator('[data-testid="zona-libre-catalogo"] thead th')).toHaveCount(8)
    await page.getByRole('button', { name: ZL.table.price }).click()
    await expect.poll(() => requests.at(-1)).toMatchObject({ sort: 'precio', dir: 'asc' })
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('13. el catálogo no contiene emojis (regla de iconografía del cliente)', async ({ page }) => {
    await setup(page)
    await openZonaLibre(page)
    const text = await page.getByTestId('zona-libre-catalogo').innerText()
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

test.describe('SCRUM-990 — datos hostiles de un tercero (Lafayette), revisión de seguridad H2', () => {
  function hostileRows(): ApiRow[] {
    const base = seedRows(3)
    const evil = (i: number, patch: Partial<ApiRow>): ApiRow => ({ ...base[0], id: `EVIL${i}`, referencia_lafayette: `EVIL${i}`, referencia: `EVIL-${i}`, ...patch })
    return [
      evil(1, { descripcion: '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>', marca: '"><svg onload=window.__xss=3>', url_imagen: OK_IMG }),
      evil(2, { url_imagen: 'javascript:window.__xss=4' }),
      evil(3, { url_imagen: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9d2luZG93Ll9feHNzPTU+' }),
      evil(4, { url_imagen: 'http://img.lafayette-e2e.invalid/inseguro.png' }),
      evil(5, { url_imagen: `${IMG_HOST}/${'a'.repeat(3000)}.png` }),
      evil(6, { url_imagen: `${IMG_HOST}/con\nsalto.png`, categoria: 'CAT\u0000‮X' }),
      evil(7, { url_imagen: 'https://user:pw@img.lafayette-e2e.invalid/cred.png' }),
    ]
  }

  test('nada se ejecuta: sin diálogos ni window.__xss, el marcado se muestra como texto y solo las imágenes https válidas se cargan sin Referer', async ({ page }) => {
    const imageReferers: Array<string | undefined> = []
    const dialogs: string[] = []
    page.on('dialog', d => { dialogs.push(d.message()); void d.dismiss() })
    const loadedImages: string[] = []
    page.on('request', r => { if (r.resourceType() === 'image') loadedImages.push(r.url()) })

    await setup(page, { rows: hostileRows(), imageReferers })
    await openZonaLibre(page)
    await expect(rowsLocator(page).first()).toBeVisible()
    await page.waitForLoadState('networkidle')

    expect(dialogs).toEqual([])
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)).toBeUndefined()
    const zone = page.getByTestId('zona-libre-catalogo')
    await expect(zone.locator('script')).toHaveCount(0)
    await expect(zone.locator('[onerror], [onload], [onclick]')).toHaveCount(0)
    await expect(zone.locator('a')).toHaveCount(0) // url_imagen jamás se enlaza
    await expect(zone.locator('[href]')).toHaveCount(0)
    // El marcado hostil aparece LITERAL como texto.
    await expect(zone).toContainText('<img src=x onerror="window.__xss=1">')

    // Solo la URL https válida llega a un <img>; ninguna imagen con javascript:/data:/http:/credenciales/control/larguísima.
    const srcs = await zone.locator('img').evaluateAll(els => els.map(e => (e as HTMLImageElement).getAttribute('src')))
    expect(new Set(srcs)).toEqual(new Set([OK_IMG]))
    for (const img of await zone.locator('img').all()) {
      await expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
      await expect(img).toHaveAttribute('loading', 'lazy')
      await expect(img).toHaveAttribute('alt', '')
    }
    // Del propio AtlanticERP (BASE) puede haber imágenes de la app; las de TERCEROS solo pueden ser la única URL https válida.
    const thirdParty = loadedImages.filter(u => !u.startsWith(BASE))
    expect(new Set(thirdParty)).toEqual(new Set([OK_IMG]))
    // Las peticiones de imagen salen sin Referer (no se filtra la dirección de AtlanticERP a un tercero).
    for (const ref of imageReferers) expect(ref).toBeFalsy()
  })
})


test.describe('SCRUM-990 — umbral de la guarda de Lafayette en la configuración global (/settings)', () => {
  const field = (page: Page) => page.getByRole('spinbutton', { name: ST.lafayetteGuarda })
  const saveButton = (page: Page) => page.locator('div.flex.flex-col.items-end', { has: field(page) }).getByRole('button', { name: ST.lafayetteGuardaSave })

  test('superadmin: ve el campo con su ayuda y el valor actual; fuera de 0,5 a 1,0 no llama al backend; dentro guarda con PATCH', async ({ page }) => {
    const patches: Array<Record<string, unknown>> = []
    await setup(page, { permissions: ['superadmin.all'], settings: { patches } })
    await page.goto('/settings')
    await expect(field(page)).toHaveValue('0.9')
    await expect(page.getByText(ST.lafayetteGuardaHelp)).toBeVisible()
    await expect(page.getByText('= 90 %')).toBeVisible()

    await field(page).fill('0.3')
    await saveButton(page).click()
    await expect(page.getByRole('alert').filter({ hasText: ST.lafayetteGuardaError })).toBeVisible()
    expect(patches).toEqual([])

    await field(page).fill('0.75')
    await expect(page.getByText('= 75 %')).toBeVisible()
    await saveButton(page).click()
    await expect.poll(() => patches.at(-1)).toEqual({ lafayette_guarda_min_ratio: 0.75 })
    await expect(field(page)).toHaveValue('0.75')
    await expect(page.getByRole('alert').filter({ hasText: ST.lafayetteGuardaError })).toHaveCount(0)
  })

  test('los extremos 0,5 y 1,0 son válidos', async ({ page }) => {
    const patches: Array<Record<string, unknown>> = []
    await setup(page, { permissions: ['superadmin.all'], settings: { patches } })
    await page.goto('/settings')
    for (const v of ['0.5', '1']) {
      await field(page).fill(v)
      await saveButton(page).click()
      await expect.poll(() => patches.at(-1)).toEqual({ lafayette_guarda_min_ratio: Number(v) })
      // Esperar a que la respuesta se procese (el borrador se limpia al guardar) antes de escribir el siguiente valor.
      await expect(field(page)).toHaveValue(String(Number(v)))
    }
  })

  test('quien solo tiene settings.global (sin superadmin.all) ve la configuración global pero NO este campo', async ({ page }) => {
    await setup(page, { permissions: ['settings.global'] })
    await page.goto('/settings')
    await expect(page.getByText(ST.shareLinksExpiration)).toBeVisible()
    await expect(page.getByText(ST.lafayetteGuarda)).toHaveCount(0)
    await expect(field(page)).toHaveCount(0)
  })
})
