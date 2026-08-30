import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
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
})
