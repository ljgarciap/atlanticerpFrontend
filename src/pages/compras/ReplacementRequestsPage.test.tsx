import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReplacementRequestsPage from './ReplacementRequestsPage'
import { comprasApi } from '@/api/comprasApi'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    replacementRequests: {
      list: vi.fn(), generateOrder: vi.fn(), create: vi.fn(), search: vi.fn(), getSearch: vi.fn(),
      approve: vi.fn(), reject: vi.fn(),
    },
    products: { search: vi.fn() },
    approvedProjects: { search: vi.fn() },
  },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    catalogProductFamilies: { list: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)
const mockedVentasDisenoApi = vi.mocked(ventasDisenoApi, true)

// Lote 4 (SCRUM-246) — `name` y `description` deliberadamente distintos: el rebote de Gerencia
// (2026-08-16) era justo que la pantalla mostraba `description` en vez de `name` en estos 2
// lugares — un test que los deja iguales no puede detectar esa regresión si vuelve a aparecer.
const ORIGINAL = { id: 1, reference: 'REF-ORIG', factory_reference: null, name: 'Artículo decorativo E27 Ámbar', description: 'Descripción larga del original, no debe mostrarse', brand: null, photo_url: null, price_full: 20, cost: 12, stock_quantity: 3, reorder_point: null }
const CANDIDATE = { id: 2, reference: 'REF-CAND', factory_reference: null, name: 'Artículo genérico E27', description: 'Descripción larga del candidato, no debe mostrarse', brand: null, photo_url: null, price_full: 18, cost: 10, stock_quantity: 7, reorder_point: null }

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReplacementRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.replacementRequests.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
  mockedComprasApi.products.search.mockResolvedValue({ fuzzy: false, data: [] })
  mockedComprasApi.approvedProjects.search.mockResolvedValue({ data: [] })
  mockedVentasDisenoApi.catalogProductFamilies.list.mockResolvedValue({ data: [{ id: 5, name: 'Accesorios', description: null, products_count: 2 }] })
})

async function goToSearchTab() {
  fireEvent.click(screen.getByText('compras:replacements.tabs.search'))
  await waitFor(() => expect(screen.getByText('compras:replacements.search.originalLabel')).toBeInTheDocument())
}

async function pickOriginal() {
  mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [ORIGINAL] })
  fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.originalPlaceholder'), { target: { value: 'artículo' } })
  await waitFor(() => expect(screen.getByText('Artículo decorativo E27 Ámbar')).toBeInTheDocument())
  expect(screen.queryByText(ORIGINAL.description)).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('common:actions.select'))
  await waitFor(() => expect(screen.getByText('compras:replacements.search.methodLabel')).toBeInTheDocument())
}

describe('ReplacementRequestsPage', () => {
  it('la pestaña Solicitudes es la que se muestra por defecto', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('compras:replacements.table.empty')).toBeInTheDocument())
  })

  it('el paso "método de búsqueda" permanece oculto hasta elegir el producto original', async () => {
    renderPage()
    await goToSearchTab()
    expect(screen.queryByText('compras:replacements.search.methodLabel')).not.toBeInTheDocument()
  })

  it('REQ-182 — buscar en catálogo (sin IA) muestra resultados con stock y precio reales', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [CANDIDATE] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })

    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())
    expect(screen.getByText('7')).toBeInTheDocument() // stock_quantity
    expect(screen.getByText('$18.00')).toBeInTheDocument()
  })

  it('SCRUM-246 (rebote de Gerencia Test 2026-08-09) — columnas Categoría y % de similitud siempre presentes, sin columna de Costo', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({
      fuzzy: false, data: [{ ...CANDIDATE, category: 'general' }],
    })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })

    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())

    // Encabezados: Categoría y % de similitud siempre presentes (no condicionados a method !== 'catalog').
    expect(screen.getByText('compras:replacements.search.resultsTable.category')).toBeInTheDocument()
    expect(screen.getByText('compras:replacements.search.resultsTable.similarity')).toBeInTheDocument()
    // Costo sale de la tabla — el key ya no se renderiza en ningún lado.
    expect(screen.queryByText('compras:replacements.search.resultsTable.cost')).not.toBeInTheDocument()

    // Categoría de la fila, con el mismo catálogo de labels que el resto de Compras.
    expect(screen.getByText('General')).toBeInTheDocument()
    // Sin similarity_percent (búsqueda por catálogo, sin IA) — em dash, nunca 0%.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-246) — el método catálogo SÍ muestra similarity_percent cuando el backend lo calcula', async () => {
    // Antes de este batch, `fromCatalogProduct` hardcodeaba `similarity_percent: null` sin mirar
    // el campo real del backend (el cálculo no existía todavía) — ahora debe pasarlo tal cual.
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({
      fuzzy: false, data: [{ ...CANDIDATE, similarity_percent: 92.1 }],
    })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })

    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())
    expect(screen.getByText('92.1%')).toBeInTheDocument()
  })

  it('la búsqueda por catálogo excluye el propio producto original de los resultados', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [ORIGINAL, CANDIDATE] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'artículo' } })

    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())
    // Aparece 1 sola vez: el header "Producto a reemplazar" ya seleccionado — nunca en la
    // tabla de resultados (se excluye a sí mismo como candidato de su propio reemplazo).
    expect(screen.getAllByText('Artículo decorativo E27 Ámbar')).toHaveLength(1)
  })

  it('SCRUM-245 (hallazgo QA 2026-07-20) — muestra "Buscando…" en vez de una tabla en blanco mientras la búsqueda está en curso', async () => {
    // Antes de este fix, mientras catalogFetching era true la tabla no mostraba ni el estado
    // vacío ni resultados — un cuerpo completamente en blanco, indistinguible de "no pasó nada".
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    let resolveSearch: (value: { fuzzy: boolean; data: typeof CANDIDATE[] }) => void = () => {}
    mockedComprasApi.products.search.mockImplementationOnce(
      () => new Promise(resolve => { resolveSearch = resolve }),
    )

    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })

    await waitFor(() => expect(screen.getByText('compras:replacements.search.resultsLoading')).toBeInTheDocument())
    expect(screen.queryByText('compras:replacements.search.resultsEmpty')).not.toBeInTheDocument()

    resolveSearch({ fuzzy: false, data: [] })
    await waitFor(() => expect(screen.getByText('compras:replacements.search.resultsEmpty')).toBeInTheDocument())
  })

  it('REQ-182 — subir foto sin elegir familia muestra error, no dispara la búsqueda', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    fireEvent.click(screen.getByText('compras:replacements.search.methodPhoto'))
    await waitFor(() => expect(screen.getByText('compras:replacements.search.familyLabel')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.search.searchButton'))

    await waitFor(() => expect(screen.getByText('compras:replacements.search.chooseFamilyRequired')).toBeInTheDocument())
    expect(mockedComprasApi.replacementRequests.search).not.toHaveBeenCalled()
  })

  it('REQ-182/183 — búsqueda por foto completa y muestra el ranking con similarity_percent', async () => {
    mockedComprasApi.replacementRequests.search.mockResolvedValue({ job_id: 'job-1' })
    mockedComprasApi.replacementRequests.getSearch.mockResolvedValue({
      id: 'job-1', status: 'completed', error: null,
      results: [{
        catalog_product_id: 2, reference: 'REF-CAND', name: 'Artículo genérico E27', description: 'Descripción larga, no debe mostrarse',
        photo_url: null, price_full: 18, cost: 10, stock_quantity: 7,
        similarity_percent: 87.5, reasoning: 'Mismo tipo de rosca.',
      }],
    })

    renderPage()
    await goToSearchTab()
    await pickOriginal()

    fireEvent.click(screen.getByText('compras:replacements.search.methodPhoto'))
    await waitFor(() => expect(screen.getByText('Accesorios')).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } })
    const file = new File(['fake'], 'foto.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('compras:replacements.search.searchButton'))

    await waitFor(() => expect(mockedComprasApi.replacementRequests.search).toHaveBeenCalledWith(1, 5, file))
    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())
    expect(screen.getByText('87.5%')).toBeInTheDocument()
  })

  it('SCRUM-818 (CA06) — "Generar solicitud" sin elegir proyecto de venta queda deshabilitado, no llama a la API', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [CANDIDATE] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })
    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.actions.generateRequest'))
    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.title')).toBeInTheDocument())

    expect(screen.getByText('compras:replacements.generateModal.submit')).toBeDisabled()

    fireEvent.click(screen.getByText('compras:replacements.generateModal.submit'))
    expect(mockedComprasApi.replacementRequests.create).not.toHaveBeenCalled()
  })

  it('SCRUM-818 (CA06) — sin ningún proyecto para el producto original, el picker muestra el mensaje específico', async () => {
    mockedComprasApi.approvedProjects.search.mockResolvedValue({ data: [] })
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [CANDIDATE] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })
    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.actions.generateRequest'))
    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.generateModal.projectPlaceholder'))

    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.noProjectForProduct')).toBeInTheDocument())
    // El picker se llama con el catalog_product_id del producto ORIGINAL (el que se reemplaza).
    expect(mockedComprasApi.approvedProjects.search).toHaveBeenCalledWith('', ORIGINAL.id)
  })

  // SCRUM-818 (rebote 2026-09-03, Hallazgo 5) — el margen que se muestra en el modal es el que
  // manda el backend (`margin_percent`, calculado sobre Costo Total), NUNCA una fórmula propia
  // recalculada con price_full/cost — margin_percent=30 deliberadamente distinto de lo que daría
  // (price_full-cost)/price_full con este candidato (18-10)/18×100 ≈ 44.44%, para probar que no
  // se recalcula acá.
  it('SCRUM-818 — el margen mostrado en el modal es el que manda el backend, no uno recalculado', async () => {
    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [{ ...CANDIDATE, margin_percent: 30 }] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })
    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.actions.generateRequest'))
    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.title')).toBeInTheDocument())

    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.queryByText('44.44%')).not.toBeInTheDocument()
  })

  it('REQ-184 — genera la solicitud con el proyecto elegido vía el picker restringido (nunca prompt())', async () => {
    mockedComprasApi.approvedProjects.search.mockResolvedValue({ data: [{ sales_project_id: 9, folio: 'F-001', project_name: 'Proyecto Norte', client_name: 'Cliente X' }] })
    mockedComprasApi.replacementRequests.create.mockResolvedValue({
      id: 100, original_product_id: 1, original_product_name: ORIGINAL.description,
      proposed_product_id: 2, proposed_product_name: CANDIDATE.description,
      sales_project_id: 9, sales_project_name: 'Proyecto Norte',
      margin_percent: 44.44, status: 'pendiente', requested_by_name: 'Designer',
      generated_order_id: null, created_at: '2026-07-18T00:00:00Z', can_decide: false,
    })

    renderPage()
    await goToSearchTab()
    await pickOriginal()

    mockedComprasApi.products.search.mockResolvedValueOnce({ fuzzy: false, data: [CANDIDATE] })
    fireEvent.change(screen.getByPlaceholderText('compras:replacements.search.catalogPlaceholder'), { target: { value: 'generico' } })
    await waitFor(() => expect(screen.getByText('Artículo genérico E27')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.actions.generateRequest'))
    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.title')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:replacements.generateModal.projectPlaceholder'))
    await waitFor(() => expect(screen.getByText(/Proyecto Norte/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Proyecto Norte/))

    fireEvent.click(screen.getByText('compras:replacements.generateModal.submit'))

    await waitFor(() => expect(mockedComprasApi.replacementRequests.create).toHaveBeenCalledWith({
      original_catalog_product_id: 1, proposed_catalog_product_id: 2, sales_project_id: 9,
    }))
    await waitFor(() => expect(screen.getByText('compras:replacements.generateModal.success')).toBeInTheDocument())
  })

  // SCRUM-818 — Aprobar/Rechazar en la pestaña Solicitudes (default), gateado por can_decide
  // (calculado server-side, nunca reimplementado acá).
  const REQUEST = {
    id: 10, original_product_id: 1, original_product_name: 'Artículo decorativo E27 Ámbar',
    proposed_product_id: 2, proposed_product_name: 'Artículo genérico E27',
    sales_project_id: 9, sales_project_name: 'Proyecto Norte',
    margin_percent: 20, status: 'pendiente' as const, requested_by_name: 'Designer',
    generated_order_id: null, created_at: '2026-08-31T00:00:00Z', can_decide: true,
  }

  it('SCRUM-818 — muestra Aprobar/Rechazar cuando can_decide es true, y el margen en la tabla', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [REQUEST], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('20%')).toBeInTheDocument())
    expect(screen.getByText('compras:replacements.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('compras:replacements.actions.reject')).toBeInTheDocument()
  })

  it('SCRUM-818 — no muestra Aprobar/Rechazar cuando can_decide es false', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [{ ...REQUEST, can_decide: false }], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Artículo decorativo E27 Ámbar')).toBeInTheDocument())
    expect(screen.queryByText('compras:replacements.actions.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('compras:replacements.actions.reject')).not.toBeInTheDocument()
  })

  it('SCRUM-818 — clic en Aprobar llama a la API con el id de la solicitud', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [REQUEST], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.replacementRequests.approve.mockResolvedValue({ ...REQUEST, status: 'aprobada', can_decide: false })
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:replacements.actions.approve')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:replacements.actions.approve'))

    await waitFor(() => expect(mockedComprasApi.replacementRequests.approve).toHaveBeenCalledWith(10))
  })

  it('Fase 12a — Rechazar abre un modal que exige el motivo y lo envía a la API junto al id', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [REQUEST], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.replacementRequests.reject.mockResolvedValue({ ...REQUEST, status: 'rechazada', can_decide: false })
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:replacements.actions.reject')).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:replacements.actions.reject'))

    // el clic solo abre el modal: nada se llama todavía
    expect(mockedComprasApi.replacementRequests.reject).not.toHaveBeenCalled()
    const confirmar = await screen.findByText('replacements.rejectModal.confirm')
    expect(confirmar.closest('button')).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ok' } })
    expect(confirmar.closest('button')).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  El cliente prefiere el original  ' } })
    expect(confirmar.closest('button')).not.toBeDisabled()
    fireEvent.click(confirmar)

    await waitFor(() => expect(mockedComprasApi.replacementRequests.reject).toHaveBeenCalledWith(10, 'El cliente prefiere el original'))
  })

  // SCRUM-818 (rebote 2026-09-03, Hallazgo 3) — "Generar orden" gateado por can_generate_order
  // (calculado server-side, nunca por status/generated_order_id solos como antes — eso mostraba
  // el botón a cualquiera con la fila visible, incluido Vendedor/Operaciones).
  const REJECTED_REQUEST = { ...REQUEST, status: 'rechazada' as const, can_decide: false }

  it('SCRUM-818 — muestra "Generar orden" cuando can_generate_order es true', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [{ ...REJECTED_REQUEST, can_generate_order: true }], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('compras:replacements.actions.generateOrder')).toBeInTheDocument())
  })

  it('SCRUM-818 — NUNCA muestra "Generar orden" cuando can_generate_order es false, aunque esté Rechazada', async () => {
    mockedComprasApi.replacementRequests.list.mockResolvedValue({
      data: [{ ...REJECTED_REQUEST, can_generate_order: false }], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Artículo decorativo E27 Ámbar')).toBeInTheDocument())
    expect(screen.queryByText('compras:replacements.actions.generateOrder')).not.toBeInTheDocument()
  })
})
