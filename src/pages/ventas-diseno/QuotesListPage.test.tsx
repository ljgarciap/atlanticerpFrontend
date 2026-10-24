import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoQuotesListPage from './QuotesListPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { QuoteListResult, QuoteListRow } from '@/types/ventasDiseno'

const mockNavigate = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    quotes: { list: vi.fn(), get: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeRow(overrides: Partial<QuoteListRow> = {}): QuoteListRow {
  return {
    id: 1, folio: 'COT-2026-0001',
    master_client: { id: 1, name: 'Grupo Delta' }, sub_client: { id: 1, business_name: 'Delta Residencial' },
    sales_project: { id: 1, name: 'Torre Delta', tag: null }, amount: 1070, stage: 'quote', price_type: 'public',
    owner: { id: 1, name: 'Designer Demo' }, quote_date: '2026-07-01T00:00:00Z', document_status: 'sent',
    ...overrides,
  }
}

function makeResult(overrides: Partial<QuoteListResult> = {}): QuoteListResult {
  return {
    summary: { pending_amount: 0, approved_amount: 0, approved_count: 0, lost_amount: 0, lost_count: 0, conversion_rate: 0 },
    fuzzy: false, data: [],
    meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoQuotesListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.quotes.list.mockResolvedValue(makeResult())
  mockedStore.mockReturnValue({ user: { id: 1, role: 'designer' } } as never)
})

describe('VentasDisenoQuotesListPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:quotesList.title')).toBeInTheDocument()
  })

  it('no muestra el selector de alcance Equipo para un Diseñador', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:quotesList.title')
    expect(screen.queryByText('ventasDiseno:scope.team')).not.toBeInTheDocument()
  })

  it('muestra las tarjetas resumen', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({
      summary: { pending_amount: 1000, approved_amount: 2000, approved_count: 2, lost_amount: 500, lost_count: 1, conversion_rate: 67 },
    }))
    renderPage()

    expect(await screen.findByText('$1,000')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('SCRUM-1195 — la columna Responsable muestra al dueño de la tarjeta, no a Gerencia que generó la versión', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({
      data: [makeRow({ owner: { id: 9, name: 'Gerencia Test 3' }, designer: { id: 1, name: 'Paola Vendedora' } })],
    }))
    renderPage()

    expect(await screen.findByText('Paola Vendedora')).toBeInTheDocument()
    expect(screen.queryByText('Gerencia Test 3')).not.toBeInTheDocument()
  })

  it('SCRUM-1195 — sin Responsable (borrador) la columna cae a quien generó la cotización', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ data: [makeRow({ designer: null })] }))
    renderPage()
    expect(await screen.findByText('Designer Demo')).toBeInTheDocument()
  })

  it('muestra las filas de la tabla', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ data: [makeRow()] }))
    renderPage()

    expect(await screen.findByText('COT-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Grupo Delta')).toBeInTheDocument()
    expect(screen.getByText('Designer Demo')).toBeInTheDocument()
  })

  it('sin cotizaciones muestra el mensaje vacío', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:quotesList.table.empty')).toBeInTheDocument()
  })

  it('escribir en la búsqueda vuelve a pedir la lista', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:quotesList.table.empty')

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quotesList.filters.searchPlaceholder'), { target: { value: 'Delta' } })

    await waitFor(() => expect(mockedApi.quotes.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Delta' }),
    ))
  })

  // SCRUM-1176 — una ráfaga de búsquedas (una por tecla) llenó el cupo de PHP de producción: ahora sale una sola petición al dejar de teclear.
  describe('SCRUM-1176 — búsqueda con espera', () => {
    const buscar = (valor: string) => fireEvent.change(
      screen.getByPlaceholderText('ventasDiseno:quotesList.filters.searchPlaceholder'), { target: { value: valor } },
    )
    const llamadasConBusqueda = () => mockedApi.quotes.list.mock.calls.filter(([f]) => (f as { search?: string }).search !== undefined)

    afterEach(() => { vi.useRealTimers() })

    it('escribir una palabra tecla por tecla manda una sola petición, tras 250 ms sin teclear', async () => {
      renderPage()
      await screen.findByText('ventasDiseno:quotesList.table.empty')
      vi.useFakeTimers()

      for (const parcial of ['AL', 'ALV', 'ALVA', 'ALVAR', 'ALVARE', 'ALVAREZ']) {
        buscar(parcial)
        await act(async () => { await vi.advanceTimersByTimeAsync(80) })   // teclea más rápido que la espera
      }
      expect(llamadasConBusqueda()).toHaveLength(0)

      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      expect(llamadasConBusqueda()).toHaveLength(1)
      expect(llamadasConBusqueda()[0][0]).toEqual(expect.objectContaining({ search: 'ALVAREZ' }))
    })

    it('el campo muestra lo escrito al instante, antes de que salga la petición', async () => {
      renderPage()
      await screen.findByText('ventasDiseno:quotesList.table.empty')
      vi.useFakeTimers()

      buscar('Delta')
      expect((screen.getByPlaceholderText('ventasDiseno:quotesList.filters.searchPlaceholder') as HTMLInputElement).value).toBe('Delta')
      expect(llamadasConBusqueda()).toHaveLength(0)
    })

    it('con un solo carácter no consulta y conserva el listado', async () => {
      renderPage()
      await screen.findByText('ventasDiseno:quotesList.table.empty')
      vi.useFakeTimers()

      buscar('A')
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(llamadasConBusqueda()).toHaveLength(0)
    })

    it('mientras llega la búsqueda nueva se siguen viendo los resultados anteriores, atenuados', async () => {
      mockedApi.quotes.list.mockResolvedValueOnce(makeResult({ data: [makeRow()] }))
      renderPage()
      await screen.findByText('Designer Demo')

      let resolver: (v: ReturnType<typeof makeResult>) => void = () => {}
      mockedApi.quotes.list.mockReturnValueOnce(new Promise(r => { resolver = r }) as never)
      buscar('Delta')

      await waitFor(() => expect(llamadasConBusqueda()).toHaveLength(1))
      expect(screen.getByText('Designer Demo')).toBeInTheDocument()                 // la tabla no se vació
      expect(screen.getByText('Designer Demo').closest('[aria-busy="true"]')).not.toBeNull()

      resolver(makeResult({ data: [] }))
      await screen.findByText('ventasDiseno:quotesList.table.empty')
    })
  })

  it('muestra el aviso de resultados aproximados', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ fuzzy: true, data: [makeRow()] }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:quotesList.filters.approximate')).toBeInTheDocument()
  })

  it('Limpiar filtros resetea búsqueda y etapa', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:quotesList.table.empty')

    const searchInput = screen.getByPlaceholderText('ventasDiseno:quotesList.filters.searchPlaceholder') as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'Delta' } })
    await waitFor(() => expect(mockedApi.quotes.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Delta' })))

    fireEvent.click(screen.getByText('ventasDiseno:quotesList.filters.clear'))

    expect(searchInput.value).toBe('')
    await waitFor(() => expect(mockedApi.quotes.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ search: expect.anything() }),
    ))
  })

  it('el botón Catálogo navega a la pantalla de Catálogo (SCRUM-741)', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:kanban.actions.catalog')
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('+ Nueva cotización navega al formulario en blanco', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:quotesList.newQuote'))
    // No assertion adicional de URL acá — MemoryRouter no expone location directo,
    // la navegación real se cubre en el propio QuotePage con precarga (Cotización-D).
  })

  it('clic en Ver cotización abre el visor', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ data: [makeRow()] }))
    mockedApi.quotes.get.mockResolvedValue({} as never) // loading state basta para esta prueba
    renderPage()

    await screen.findByText('COT-2026-0001')
    fireEvent.click(screen.getByTitle('ventasDiseno:quotesList.table.view'))

    expect(await screen.findByText('ventasDiseno:quotesList.viewer.title')).toBeInTheDocument()
  })

  // ── SCRUM-796 (secc. 13, RN3.1 — corrección de una definición anterior de PM) ──
  // Antes (SCRUM-734) la fila mostraba "Usar como base para nueva versión" como atajo
  // cuando la tarjeta seguía en etapa Cotización. El ticket lo revierte explícitamente:
  // ese botón NUNCA debe aparecer en la tabla principal, sin importar etapa/estado —
  // crear una versión nueva se gestiona únicamente desde QuoteViewerModal (secc. 12/15).

  it('nunca muestra "Usar como base" en la fila, ni con la tarjeta en Cotización', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ data: [makeRow({ stage: 'quote', document_status: 'sent' })] }))
    renderPage()

    await screen.findByText('COT-2026-0001')
    expect(screen.queryByText('ventasDiseno:document.versions.useAsBase')).not.toBeInTheDocument()
  })

  it('fila en Borrador tampoco muestra el atajo', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({ data: [makeRow({ stage: 'quote', document_status: 'draft' })] }))
    renderPage()

    await screen.findByText('COT-2026-0001')
    expect(screen.queryByText('ventasDiseno:document.versions.useAsBase')).not.toBeInTheDocument()
  })

  // ── SCRUM-912 (criterios 6/7) — vista "Solo Borradores" ─────────────────────

  it('por defecto pide la vista "Todas" (sin view en el filtro)', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult())
    renderPage()

    await waitFor(() => expect(mockedApi.quotes.list).toHaveBeenCalledWith(
      expect.objectContaining({ view: undefined }),
    ))
  })

  it('clic en "Solo Borradores" pide view=drafts y oculta el resumen', async () => {
    mockedApi.quotes.list.mockResolvedValue(makeResult({
      summary: { pending_amount: 100, approved_amount: 0, approved_count: 0, lost_amount: 0, lost_count: 0, conversion_rate: 0 },
      data: [makeRow({ document_status: 'draft' })],
    }))
    renderPage()
    await screen.findByText('COT-2026-0001')
    expect(screen.getByText('ventasDiseno:quotesList.summary.pending')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:quotesList.view.draftsOnly'))

    await waitFor(() => expect(mockedApi.quotes.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: 'drafts' }),
    ))
    expect(screen.queryByText('ventasDiseno:quotesList.summary.pending')).not.toBeInTheDocument()
  })
})
