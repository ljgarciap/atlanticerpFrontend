import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ZonaLibreCatalogoTable from './ZonaLibreCatalogoTable'
import { bodegaApi } from '@/api/bodegaApi'
import type { WarehouseKpis, ZonaLibreCatalogoParams, ZonaLibreCatalogoResponse } from '@/types/bodega'
import {
  ZONA_LIBRE_META_KEYS, ZONA_LIBRE_ROW_KEYS, makeZonaLibreResponse, makeZonaLibreResponseSinPrecio, makeZonaLibreRow,
  zonaLibreContractViolations,
} from '@/test/zonaLibreContract'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: { zonaLibre: { productos: vi.fn() } },
}))

const productos = vi.mocked(bodegaApi.zonaLibre.productos)

const KPIS: WarehouseKpis = {
  responsable: null, total_products: 25816, total_units: 1767865, capacidad_pct: null, last_synced_at: '2026-09-30T17:05:00Z',
}

type Handler = (params: ZonaLibreCatalogoParams | undefined) => ZonaLibreCatalogoResponse | Promise<ZonaLibreCatalogoResponse>

/** Instala el mock de la API aplicando las MISMAS reglas de validación que el controlador real: un parámetro inválido es un rechazo
 * (422), así que un test que ve la tabla ya demuestra que el front mandó parámetros válidos. */
function installApi(handler: Handler = () => makeZonaLibreResponse(), opts: { puedeVerPrecio?: boolean } = {}) {
  productos.mockImplementation(async params => {
    const violations = zonaLibreContractViolations(params as Record<string, unknown> | undefined, opts)
    if (violations.length > 0) throw new Error(`422 ${violations.join('; ')}`)
    return handler(params)
  })
}

/** `kpis`: por defecto los de ejemplo; `null` = todavía sin KPIs (un `undefined` activaría el valor por defecto). */
function renderTable(kpis: WarehouseKpis | null = KPIS) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ZonaLibreCatalogoTable kpis={kpis ?? undefined} />
    </QueryClientProvider>,
  )
}

const lastParams = () => { const calls = productos.mock.calls; return calls[calls.length - 1]?.[0] }
/** Cada fila existe DOS veces en el DOM (tabla de escritorio y tarjeta móvil; el CSS muestra una): esperar a la primera. */
const waitForRows = () => screen.findAllByText('REF-0000001')
const paramsList = () => productos.mock.calls.map(c => c[0])

beforeEach(() => {
  vi.clearAllMocks()
  installApi()
})

describe('ZonaLibreCatalogoTable — contrato con el backend', () => {
  it('el fixture respeta las claves exactas y en orden de fila y meta (espejo de ZonaLibreCatalogoContractTest)', () => {
    const r = makeZonaLibreResponse()
    expect(Object.keys(r.data[0])).toEqual([...ZONA_LIBRE_ROW_KEYS])
    expect(Object.keys(r.meta)).toEqual([...ZONA_LIBRE_META_KEYS])
    // `puede_ver_precio` va al FINAL de meta (después de ultima_sincronizacion).
    const metaKeys = Object.keys(r.meta)
    expect(metaKeys[metaKeys.length - 1]).toBe('puede_ver_precio')
    const sinPrecio = makeZonaLibreResponseSinPrecio()
    expect(Object.keys(sinPrecio.meta)).toEqual([...ZONA_LIBRE_META_KEYS])
    expect(sinPrecio.meta.puede_ver_precio).toBe(false)
    expect(sinPrecio.data.every(row => row.precio === null)).toBe(true)
  })

  it('el primer pedido manda SOLO los parámetros por defecto: orden por referencia asc, página 1, 25 filas, sin search ni solo_disponibles', async () => {
    renderTable()
    await waitForRows()
    expect(paramsList()).toEqual([{ sort: 'referencia', dir: 'asc', page: 1, per_page: 25 }])
  })

  it('el mock rechaza parámetros que el backend rechazaría (la guarda del propio test)', () => {
    expect(zonaLibreContractViolations({ search: 'a' })).not.toEqual([])
    expect(zonaLibreContractViolations({ per_page: 10 })).not.toEqual([])
    expect(zonaLibreContractViolations({ per_page: 'all' })).not.toEqual([])
    expect(zonaLibreContractViolations({ sort: 'price' })).not.toEqual([])
    expect(zonaLibreContractViolations({ mime: 'x' })).not.toEqual([])
    // Ronda 2: page <= 10000 y sort=precio solo con permiso de precio (compras.read / superadmin.all).
    expect(zonaLibreContractViolations({ page: 10001 })).not.toEqual([])
    expect(zonaLibreContractViolations({ page: 10000 })).toEqual([])
    expect(zonaLibreContractViolations({ page: 0 })).not.toEqual([])
    expect(zonaLibreContractViolations({ sort: 'precio' })).toEqual([])
    expect(zonaLibreContractViolations({ sort: 'precio' }, { puedeVerPrecio: false })).not.toEqual([])
    expect(zonaLibreContractViolations({ sort: 'disponible' }, { puedeVerPrecio: false })).toEqual([])
    expect(zonaLibreContractViolations({ sort: 'precio', dir: 'desc', page: 2, per_page: 50, solo_disponibles: true })).toEqual([])
  })
})

describe('ZonaLibreCatalogoTable — presentación (spec UX SCRUM-990)', () => {
  it('muestra el aviso permanente "solo consulta" con role=note y los 3 KPI del catálogo externo', async () => {
    renderTable()
    await waitForRows()
    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('bodega:warehouses.zonaLibre.noticeTitle')
    expect(notice).toHaveTextContent('bodega:warehouses.zonaLibre.noticeBody')
    expect(screen.getByText('bodega:warehouses.zonaLibre.kpis.products')).toBeInTheDocument()
    expect(screen.getByText('25,816')).toBeInTheDocument()
    expect(screen.getByText('bodega:warehouses.zonaLibre.kpis.available')).toBeInTheDocument()
    expect(screen.getByText('1,767,865')).toBeInTheDocument()
    expect(screen.getByText('bodega:warehouses.zonaLibre.kpis.lastSync')).toBeInTheDocument()
    // Sin Responsable ni % de capacidad (no aplican a un catálogo externo).
    expect(screen.queryByText('bodega:warehouses.kpis.responsable')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.kpis.capacityUsed')).not.toBeInTheDocument()
  })

  it('sin KPIs todavía muestra "—" en los tres', async () => {
    renderTable(null)
    await waitForRows()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('la tabla tiene las 8 columnas exactas y un caption accesible', async () => {
    renderTable()
    await waitForRows()
    const table = screen.getByRole('table')
    expect(within(table).getByText('bodega:warehouses.zonaLibre.table.caption')).toBeInTheDocument()
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map(h => h.textContent)).toEqual([
      'bodega:warehouses.zonaLibre.table.image',
      'bodega:warehouses.zonaLibre.table.lafayetteId',
      'bodega:warehouses.zonaLibre.table.reference',
      'bodega:warehouses.zonaLibre.table.description',
      'bodega:warehouses.zonaLibre.table.brand',
      'bodega:warehouses.zonaLibre.table.category',
      'bodega:warehouses.zonaLibre.table.available',
      'bodega:warehouses.zonaLibre.table.price',
    ])
  })

  it('NO existe ninguna acción: cero botones en el cuerpo de la tabla, sin columna Acción ni Reubicar/Ver detalle/Ajustar/Contar/exportar', async () => {
    const { container } = renderTable()
    await waitForRows()
    const table = screen.getByRole('table')
    expect(within(table.querySelector('tbody') as HTMLElement).queryAllByRole('button')).toHaveLength(0)
    // Con el mock de i18n el texto son las CLAVES: ninguna clave de las acciones de una bodega operativa debe usarse acá.
    expect(container.textContent).not.toMatch(/warehouses\.table\.(relocate|action)|relocationRequests|relocateModal|locations\.manageButton|export/i)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('muestra 0 sin resaltar como alerta (texto atenuado) y el precio con formato de moneda; sin precio ni referencia, "—"', async () => {
    installApi(() => makeZonaLibreResponse([
      makeZonaLibreRow(1, { disponible: 0, precio: 1234.5 }),
      makeZonaLibreRow(2, { precio: null, referencia: null }),
    ]))
    renderTable()
    await waitForRows()
    const row1 = screen.getAllByText('REF-0000001')[0].closest('tr') as HTMLElement
    const cells1 = within(row1).getAllByRole('cell')
    expect(cells1[6]).toHaveTextContent('0')
    expect(cells1[6].className).toContain('text-slate-400')
    expect(cells1[7]).toHaveTextContent('$1,234.50')
    const row2 = screen.getAllByRole('row').find(r => r.textContent?.includes('LNP0000002')) as HTMLElement
    const cells2 = within(row2).getAllByRole('cell')
    expect(cells2[2]).toHaveTextContent('—')
    expect(cells2[7]).toHaveTextContent('—')
  })

  it('la imagen es decorativa (alt vacío, carga diferida) y si falla la carga muestra el cuadro neutro', async () => {
    const { container } = renderTable()
    await waitForRows()
    const img = container.querySelector('tbody img') as HTMLImageElement
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    fireEvent.error(img)
    await waitFor(() => expect(container.querySelector('tbody tr img')).not.toBe(img))
  })

  it('muestra el pie de ayuda de alta manual en AtlanticERP (sin botón de precarga)', async () => {
    renderTable()
    await waitForRows()
    expect(screen.getByText('bodega:warehouses.zonaLibre.help')).toBeInTheDocument()
  })
})

describe('ZonaLibreCatalogoTable — filtros, orden y paginación (todo en el servidor)', () => {
  it('con 1 carácter NO pide nada nuevo; con 2 o más, tras el debounce, manda search y vuelve a la página 1', async () => {
    renderTable()
    await waitForRows()
    const callsBefore = productos.mock.calls.length
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'a' } })
    await new Promise(r => setTimeout(r, 600))
    expect(productos.mock.calls.length).toBe(callsBefore)

    fireEvent.change(input, { target: { value: 'panel' } })
    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'panel', page: 1 }), { timeout: 2000 })
  })

  it('Enter aplica la búsqueda de inmediato, sin esperar el debounce, y la recorta', async () => {
    renderTable()
    await waitForRows()
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: '  led  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(lastParams()).toMatchObject({ search: 'led' }), { timeout: 300 })
  })

  it('"Solo con disponibilidad" apagado NO manda el parámetro; encendido manda solo_disponibles=true y vuelve a página 1', async () => {
    renderTable()
    await waitForRows()
    expect(lastParams()).not.toHaveProperty('solo_disponibles')
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(lastParams()).toMatchObject({ solo_disponibles: true, page: 1 }))
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(lastParams()).not.toHaveProperty('solo_disponibles'))
  })

  it('el filtro de categoría sale de meta.categorias y manda categoria con el valor exacto', async () => {
    renderTable()
    await waitForRows()
    const select = screen.getAllByRole('combobox').find(s => within(s).queryByText('SPOTS')) as HTMLSelectElement
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual([
      'bodega:warehouses.filters.category', 'PANELES', 'SPOTS',
    ])
    fireEvent.change(select, { target: { value: 'SPOTS' } })
    await waitFor(() => expect(lastParams()).toMatchObject({ categoria: 'SPOTS', page: 1 }))
  })

  it('sin categorías en meta se omite el select de categoría', async () => {
    installApi(() => makeZonaLibreResponse(undefined, { categorias: [] }))
    renderTable()
    await waitForRows()
    expect(screen.queryByText('SPOTS')).not.toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(1) // solo el de filas por página
  })

  it('ordenar: el encabezado alterna ascending/descending con aria-sort y otra columna arranca ascendente', async () => {
    renderTable()
    await waitForRows()
    const th = (name: string) => screen.getByRole('button', { name }).closest('th') as HTMLElement
    const price = 'bodega:warehouses.zonaLibre.table.price'
    const available = 'bodega:warehouses.zonaLibre.table.available'

    expect(th('bodega:warehouses.zonaLibre.table.reference')).toHaveAttribute('aria-sort', 'ascending')
    expect(th(price)).toHaveAttribute('aria-sort', 'none')

    fireEvent.click(screen.getByRole('button', { name: price }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'precio', dir: 'asc', page: 1 }))
    expect(th(price)).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(screen.getByRole('button', { name: price }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'precio', dir: 'desc' }))
    expect(th(price)).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(screen.getByRole('button', { name: available }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'disponible', dir: 'asc' }))
    expect(th(price)).toHaveAttribute('aria-sort', 'none')
  })

  it('las columnas ordenables mandan EXACTAMENTE las claves de la lista blanca del backend', async () => {
    renderTable()
    await waitForRows()
    const cases: Array<[string, string]> = [
      ['lafayetteId', 'referencia_lafayette'], ['description', 'descripcion'], ['brand', 'marca'], ['category', 'categoria'],
    ]
    for (const [col, sort] of cases) {
      fireEvent.click(screen.getByRole('button', { name: `bodega:warehouses.zonaLibre.table.${col}` }))
      await waitFor(() => expect(lastParams()).toMatchObject({ sort }))
    }
  })

  it('paginación: solo ofrece 25/50/100 (sin "Todos"); cambiar el tamaño vuelve a la página 1 y manda per_page; el botón de página manda page', async () => {
    installApi(() => makeZonaLibreResponse(undefined, { total: 120, last_page: 5, total_catalogo: 120 }))
    renderTable()
    await waitForRows()
    const perPage = screen.getAllByRole('combobox').find(s => within(s).queryByText(/^25 /)) as HTMLSelectElement
    expect(within(perPage).getAllByRole('option').map(o => (o as HTMLOptionElement).value)).toEqual(['25', '50', '100'])

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2, per_page: 25 }))

    fireEvent.change(perPage, { target: { value: '50' } })
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, per_page: 50 }))
  })

  it('un cambio de filtro estando en la página 3 vuelve a la página 1', async () => {
    installApi(() => makeZonaLibreResponse(undefined, { total: 200, last_page: 8, total_catalogo: 200 }))
    renderTable()
    await waitForRows()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 3 }))
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(lastParams()).toMatchObject({ solo_disponibles: true, page: 1 }))
  })
})

describe('ZonaLibreCatalogoTable — estados', () => {
  it('cargando: esqueleto con aria-busy y sin filas reales', async () => {
    let release: (r: ZonaLibreCatalogoResponse) => void = () => {}
    installApi(() => new Promise<ZonaLibreCatalogoResponse>(res => { release = res }))
    const { container } = renderTable()
    await waitFor(() => expect(container.querySelectorAll('[data-testid="zona-libre-skeleton"]')).toHaveLength(8))
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    release(makeZonaLibreResponse())
    await waitForRows()
    expect(container.querySelectorAll('[data-testid="zona-libre-skeleton"]')).toHaveLength(0)
  })

  it('sin resultados con filtros: muestra el texto de vacío y "Limpiar filtros" restablece búsqueda, categoría y disponibilidad', async () => {
    installApi(p => (p?.search || p?.categoria || p?.solo_disponibles)
      ? makeZonaLibreResponse([], { total: 0, total_catalogo: 500 })
      : makeZonaLibreResponse(undefined, { total_catalogo: 500 }))
    renderTable()
    await waitForRows()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    await screen.findAllByText(/bodega:warehouses\.zonaLibre\.empty/)

    fireEvent.click(screen.getAllByRole('button', { name: 'bodega:warehouses.filters.clear' })[0])
    await waitForRows()
    expect(lastParams()).toEqual({ sort: 'referencia', dir: 'asc', page: 1, per_page: 25 })
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('catálogo aún sin sincronizar (total_catalogo 0 y sin filtros): panel informativo, sin KPI ni filtros, con el aviso permanente', async () => {
    installApi(() => makeZonaLibreResponse([], { total: 0, total_catalogo: 0, categorias: [], ultima_sincronizacion: null }))
    renderTable()
    await screen.findByText('bodega:warehouses.zonaLibre.notSynced')
    expect(screen.getByText('bodega:warehouses.zonaLibre.notSyncedHint')).toBeInTheDocument()
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.zonaLibre.kpis.products')).not.toBeInTheDocument()
  })

  it('error: muestra role=alert y "Reintentar" vuelve a pedir y recupera la tabla', async () => {
    let fail = true
    installApi(() => { if (fail) throw new Error('500'); return makeZonaLibreResponse() })
    renderTable()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('bodega:warehouses.zonaLibre.error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'bodega:warehouses.zonaLibre.retry' }))
    await waitForRows()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('anuncia la cantidad de resultados en una región aria-live', async () => {
    installApi(() => makeZonaLibreResponse(undefined, { total: 42 }))
    const { container } = renderTable()
    await waitForRows()
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    expect(live.textContent).toContain('"count":42')
  })
})


describe('ZonaLibreCatalogoTable — datos hostiles de un tercero (Lafayette), revisión de seguridad H2', () => {
  const VALID = 'https://img.lafayette-e2e.invalid/ok.jpg'
  const LONG = `https://img.lafayette-e2e.invalid/${'a'.repeat(3000)}.jpg`
  const BAD_URLS = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
    'http://insecure.lafayette-e2e.invalid/x.jpg',
    'blob:https://x.invalid/abc',
    '//proto-relative.invalid/x.jpg',
    '/relativa/x.jpg',
    'https://user:pw@img.lafayette-e2e.invalid/x.jpg',
    'https://img.lafayette-e2e.invalid/a\nb.jpg',
    'https://img.lafayette-e2e.invalid/a\u0000b.jpg',
    ' https://img.lafayette-e2e.invalid/espacio.jpg',
    LONG,
    '',
  ]
  const XSS = {
    descripcion: '<script>window.__xss = "descripcion"</script><b>negrita</b>',
    marca: '<img src=x onerror="window.__xss=\'marca\'">',
    categoria: '"><svg onload="window.__xss=\'categoria\'">',
    referencia: 'javascript:window.__xss=\'referencia\'',
  }

  function hostileResponse(): ZonaLibreCatalogoResponse {
    const rows = [
      makeZonaLibreRow(1, { ...XSS, url_imagen: VALID }),
      ...BAD_URLS.map((u, i) => makeZonaLibreRow(10 + i, { referencia: `BAD-${i}`, url_imagen: u })),
      makeZonaLibreRow(99, { referencia: 'CTRL', descripcion: 'uno\u0000dos‮tres\n\ncuatro', marca: null, categoria: '', url_imagen: null }),
    ]
    return makeZonaLibreResponse(rows, { categorias: ['<img src=x onerror=1>', 'OK'] })
  }

  beforeEach(() => { delete (window as unknown as Record<string, unknown>).__xss })

  it('el texto de un tercero se pinta como TEXTO: ningún <script>, ningún elemento creado desde los datos y nada se ejecuta', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('BAD-0')

    expect(container.querySelectorAll('script')).toHaveLength(0)
    // Los datos hostiles aparecen LITERALES como texto (escapados por React).
    expect(container.textContent).toContain('<script>window.__xss = "descripcion"</script><b>negrita</b>')
    expect(container.textContent).toContain('<img src=x onerror="window.__xss=\'marca\'">')
    expect(container.querySelectorAll('b')).toHaveLength(0)
    expect(container.querySelectorAll('svg[onload]')).toHaveLength(0)
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined()
    // La opción de categoría hostil también es texto, no marcado.
    expect(container.querySelectorAll('option img')).toHaveLength(0)
  })

  it('ningún atributo del DOM trae un manejador de eventos ni un esquema javascript:/data: proveniente de los datos', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('BAD-0')

    for (const el of Array.from(container.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith('on'), `${el.tagName}[${attr.name}]`).toBe(false)
        expect(attr.value.toLowerCase(), `${el.tagName}[${attr.name}]`).not.toMatch(/^\s*(javascript|data|vbscript):/)
      }
    }
  })

  it('url_imagen: solo https válido llega a <img src>; javascript:, data:, http:, relativas, con credenciales, con control, con espacios, larguísima o vacía -> cuadro neutro', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('BAD-0')

    const srcs = Array.from(container.querySelectorAll('img')).map(i => i.getAttribute('src'))
    expect(srcs.length).toBeGreaterThan(0)
    // Solo la fila VALIDA tiene imagen (dos veces: tabla y tarjeta móvil); las otras 13 hostiles + la de control no.
    expect(new Set(srcs)).toEqual(new Set([VALID]))
    expect(srcs).toHaveLength(2)
    for (const src of srcs) expect(src).toMatch(/^https:\/\//)
  })

  it('cada <img> lleva referrerPolicy no-referrer, carga diferida y alt vacío; la URL jamás se enlaza ni se abre', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('BAD-0')

    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img).toHaveAttribute('alt', '')
    }
    // Sin enlaces en toda la vista: url_imagen nunca va en un href.
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('[href]')).toHaveLength(0)
    expect(container.querySelectorAll('[target]')).toHaveLength(0)
  })

  it('los caracteres de control y los controles de dirección del texto se limpian al pintar; null o vacío -> "—"', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('CTRL')

    const row = screen.getAllByText('CTRL')[0].closest('tr') as HTMLElement
    expect(row.textContent).toContain('uno dostres cuatro')
    expect(row.textContent).not.toMatch(/[\u0000-\u001F‪-‮]/)
    const cells = within(row).getAllByRole('cell')
    expect(cells[4]).toHaveTextContent('—') // marca null
    expect(cells[5]).toHaveTextContent('—') // categoria ''
    expect(container.querySelector('tbody tr[title], tbody [title*="\u0000"]')).toBeNull()
  })

  it('el atributo title de la descripción es el texto saneado, nunca marcado', async () => {
    installApi(hostileResponse)
    const { container } = renderTable()
    await screen.findAllByText('BAD-0')
    const span = Array.from(container.querySelectorAll('tbody span[title]')).find(s => s.getAttribute('title')?.includes('negrita'))
    expect(span?.getAttribute('title')).toBe('<script>window.__xss = "descripcion"</script><b>negrita</b>')
    expect(span?.children).toHaveLength(0)
  })
})


describe('ZonaLibreCatalogoTable — precio según permiso (SCRUM-990 ronda 2: compras.read o superadmin.all)', () => {
  const PRICE_KEY = 'bodega:warehouses.zonaLibre.table.price'

  it('CON permiso: muestra la columna Precio, su encabezado ordenable y el precio en cada fila y tarjeta', async () => {
    installApi(() => makeZonaLibreResponse(), { puedeVerPrecio: true })
    const { container } = renderTable()
    await waitForRows()
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(8)
    expect(screen.getByRole('button', { name: PRICE_KEY })).toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr:first-child td')).toHaveLength(8)
    expect(screen.getAllByText('$13.50').length).toBeGreaterThanOrEqual(2) // tabla + tarjeta móvil
  })

  it('SIN permiso: 7 columnas, sin columna Precio ni encabezado ordenable, y NINGÚN precio (ni "—" en una columna que no existe)', async () => {
    installApi(() => makeZonaLibreResponseSinPrecio(), { puedeVerPrecio: false })
    const { container } = renderTable()
    await waitForRows()

    const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
    expect(headers).toHaveLength(7)
    expect(headers.map(h => h.textContent)).not.toContain(PRICE_KEY)
    expect(screen.queryByRole('button', { name: PRICE_KEY })).not.toBeInTheDocument()
    // Cada fila tiene 7 celdas; la última es Disponible, no una celda de precio vacía.
    for (const tr of Array.from(container.querySelectorAll('tbody tr'))) expect(tr.querySelectorAll('td')).toHaveLength(7)
    // Las tarjetas móviles tampoco rotulan ni muestran precio.
    expect(Array.from(container.querySelectorAll('ul dt')).map(d => d.textContent)).not.toContain(PRICE_KEY)
    expect(container.textContent).not.toContain('$')
  })

  it('SIN permiso: ningún pedido lleva sort=precio, aunque se ordene por cualquier otra columna', async () => {
    installApi(() => makeZonaLibreResponseSinPrecio(), { puedeVerPrecio: false })
    renderTable()
    await waitForRows()
    for (const col of ['available', 'brand', 'category', 'description', 'lafayetteId']) {
      fireEvent.click(screen.getByRole('button', { name: `bodega:warehouses.zonaLibre.table.${col}` }))
    }
    await waitFor(() => expect(paramsList().length).toBeGreaterThan(5))
    expect(paramsList().every(p => p?.sort !== 'precio')).toBe(true)
  })

  it('SIN permiso: el estado vacío y el esqueleto usan 7 columnas', async () => {
    let release: (r: ZonaLibreCatalogoResponse) => void = () => {}
    installApi(p => (p?.search ? makeZonaLibreResponseSinPrecio([], { total: 0, total_catalogo: 500 }) : new Promise<ZonaLibreCatalogoResponse>(res => {
      release = res
    })), { puedeVerPrecio: false })
    const { container } = renderTable()
    // Esqueleto (aún sin respuesta: se asume sin permiso y no se reserva sitio para el precio).
    await waitFor(() => expect(container.querySelectorAll('[data-testid="zona-libre-skeleton"]')).toHaveLength(8))
    expect(container.querySelector('[data-testid="zona-libre-skeleton"]')?.querySelectorAll('td')).toHaveLength(7)
    release(makeZonaLibreResponseSinPrecio([makeZonaLibreRow(1)], { total_catalogo: 500 }))
    await waitForRows()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    const empty = await screen.findAllByText(/bodega:warehouses\.zonaLibre\.empty/)
    expect(empty[0].closest('td')).toHaveAttribute('colspan', '7')
  })

  it('CON permiso: el estado vacío abarca las 8 columnas y se puede ordenar por precio (sort=precio) sin error', async () => {
    installApi(() => makeZonaLibreResponse(), { puedeVerPrecio: true })
    renderTable()
    await waitForRows()
    fireEvent.click(screen.getByRole('button', { name: PRICE_KEY }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'precio', dir: 'asc' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un usuario sin permiso que pidiera sort=precio recibiría el 422 del backend: el espejo del contrato lo rechaza', async () => {
    installApi(() => makeZonaLibreResponseSinPrecio(), { puedeVerPrecio: false })
    await expect(bodegaApi.zonaLibre.productos({ sort: 'precio', dir: 'asc', page: 1, per_page: 25 })).rejects.toThrow(/sort=precio/)
  })
})
