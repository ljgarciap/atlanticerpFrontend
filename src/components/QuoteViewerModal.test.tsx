import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import QuoteViewerModal from './QuoteViewerModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { QuoteDetail, QuoteVersionsResult } from '@/types/ventasDiseno'

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
    quotes: { get: vi.fn(), versions: vi.fn(), duplicate: vi.fn(), pdf: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

// jsdom no implementa URL.createObjectURL/revokeObjectURL — SCRUM-766, mismo patrón que
// ServiceQuotePdfViewerModal/ServiceQuoteModal.test.tsx.
const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-quote-pdf')
const revokeObjectURLMock = vi.fn()

function makeQuote(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 1, status: 'draft', folio: 'COT-2026-0001', generated_at: '2026-07-01T00:00:00Z', confirmed_at: null,
    pipeline_card_id: null, document_status: 'sent',
    master_client: { id: 1, name: 'Grupo Delta' }, sub_client: { id: 1, business_name: 'Delta Residencial' },
    sales_project: { id: 1, name: 'Torre Delta', tag: null },
    ruc: '155-0000-1-2026', description: 'Sala Principal', owner: { id: 1, name: 'Designer Demo' },
    architect: null, delivery_type: 'single', delivery_dates: ['2026-09-01'],
    contacts: [{ pivot_id: 1, id: 1, name: 'Contacto Demo', role: 'client', phone: '6000-0000', email: null }],
    can_edit: true,
    price_type: 'public', discount_mode: 'line', global_discount_percent: 0,
    global_below_min_margin: false, can_override_min_margin: false, min_margin_percent: 30,
    parts: [], subtotal: 0,
    observations: null, includes_installation: false,
    discount_totals_type: 'percent', discount_totals_value: 0, discount_totals_amount: 0,
    net_total: 0, itbms: 0, grand_total: 0,
    conditions_text: 'Texto de condiciones', observations_preview: '',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function makeVersions(overrides: Partial<QuoteVersionsResult> = {}): QuoteVersionsResult {
  return {
    card_stage: 'quote',
    versions: [
      { id: 1, version: 1, folio: 'COT-2026-0001', confirmed_at: '2026-07-01T00:00:00Z', generated_by: 'Designer Demo', grand_total: 100 },
      { id: 2, version: 2, folio: 'COT-2026-0002', confirmed_at: '2026-08-01T00:00:00Z', generated_by: 'Designer Demo', grand_total: 214 },
    ],
    ...overrides,
  }
}

function renderModal(quoteId = 1, onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuoteViewerModal quoteId={quoteId} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, configurable: true })
  mockedApi.quotes.pdf.mockResolvedValue(new Blob(['%PDF-fake'], { type: 'application/pdf' }))
})

describe('QuoteViewerModal', () => {
  it('muestra el documento con el folio en el título, PDF real embebido (no React)', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote())
    renderModal()

    expect((await screen.findAllByText(/COT-2026-0001/)).length).toBeGreaterThan(0)
    // SCRUM-766 — ya no hay render React del documento (QuoteDocument, eliminado): el
    // contenido es un PDF real embebido en iframe, pedido con external=false siempre.
    await waitFor(() => expect(mockedApi.quotes.pdf).toHaveBeenCalledWith(1, false))
    await waitFor(() => expect(document.querySelector('iframe')).toHaveAttribute('src', 'blob:mock-quote-pdf'))
  })

  it('el botón Cerrar dispara onClose', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote())
    const onClose = vi.fn()
    renderModal(1, onClose)

    await screen.findAllByText(/COT-2026-0001/)
    fireEvent.click(screen.getByText('ventasDiseno:quotesList.viewer.close'))

    expect(onClose).toHaveBeenCalled()
  })

  it('un borrador muestra el botón Editar y navega al formulario (SCRUM-143)', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ document_status: 'draft' }))
    renderModal(42)

    await screen.findAllByText(/COT-2026-0001/)
    fireEvent.click(screen.getByText('ventasDiseno:quotesList.viewer.edit'))

    expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes/42')
  })

  it('una cotización ya Enviada NO muestra el botón Editar', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ document_status: 'sent' }))
    renderModal()

    await screen.findAllByText(/COT-2026-0001/)
    expect(screen.queryByText('ventasDiseno:quotesList.viewer.edit')).not.toBeInTheDocument()
  })

  // ── SCRUM-734 (sección 3): "Versiones de este proyecto" ─────────────────────

  it('con 1 sola versión confirmada, no muestra la sección de versiones', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions({ versions: [makeVersions().versions[0]] }))
    renderModal()

    await screen.findAllByText(/COT-2026-0001/)
    expect(screen.queryByText('ventasDiseno:document.versions.title')).not.toBeInTheDocument()
  })

  it('con 2+ versiones confirmadas, muestra la sección con ambas filas', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions())
    renderModal()

    expect(await screen.findByText('ventasDiseno:document.versions.title')).toBeInTheDocument()
    expect(screen.getByText('COT-2026-0002')).toBeInTheDocument()
  })

  it('"Usar como base para nueva versión" no aparece si la tarjeta ya no está en Cotización', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions({ card_stage: 'proposal' }))
    renderModal()

    await screen.findByText('ventasDiseno:document.versions.title')
    expect(screen.queryByText('ventasDiseno:document.versions.useAsBase')).not.toBeInTheDocument()
  })

  it('"Usar como base" duplica, navega al nuevo borrador y cierra el modal', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions())
    mockedApi.quotes.duplicate.mockResolvedValue(makeQuote({ id: 99, confirmed_at: null, document_status: 'draft' }))
    const onClose = vi.fn()
    renderModal(1, onClose)

    await screen.findByText('ventasDiseno:document.versions.title')
    fireEvent.click(screen.getAllByText('ventasDiseno:document.versions.useAsBase')[0])

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes/99'))
    expect(onClose).toHaveBeenCalled()
  })

  it('"Usar como base" bloqueado por el backend muestra el mensaje de error', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions())
    mockedApi.quotes.duplicate.mockRejectedValue(
      new AxiosError('blocked', '422', undefined, undefined, {
        status: 422, data: { message: 'Solo se puede crear una versión nueva mientras el proyecto está en etapa Cotización.' },
      } as never),
    )
    renderModal()

    await screen.findByText('ventasDiseno:document.versions.title')
    fireEvent.click(screen.getAllByText('ventasDiseno:document.versions.useAsBase')[0])

    expect(await screen.findByText('Solo se puede crear una versión nueva mientras el proyecto está en etapa Cotización.')).toBeInTheDocument()
  })

  // ── SCRUM-796 (secc. 15) — caso especial, una sola versión ───────────────────

  it('con 1 sola versión y tarjeta en Cotización, muestra "Nueva versión" junto a "Cerrar"', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions({ versions: [makeVersions().versions[0]] }))
    mockedApi.quotes.duplicate.mockResolvedValue(makeQuote({ id: 99, confirmed_at: null, document_status: 'draft' }))
    const onClose = vi.fn()
    renderModal(1, onClose)

    await screen.findAllByText(/COT-2026-0001/)
    // No hay tabla de "Versiones de este proyecto" con solo 1 versión (ya cubierto arriba)
    // — "Nueva versión" es el único punto de entrada para crear la segunda.
    expect(screen.queryByText('ventasDiseno:document.versions.title')).not.toBeInTheDocument()
    const button = await screen.findByText('ventasDiseno:document.versions.newVersion')
    expect(button.closest('button')).not.toBeDisabled()

    fireEvent.click(button)

    // Usa el id REAL de la única versión (1), no un valor asumido.
    await waitFor(() => expect(mockedApi.quotes.duplicate).toHaveBeenCalledWith(1))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes/99'))
    expect(onClose).toHaveBeenCalled()
  })

  it('sin ninguna versión confirmada, NO muestra "Nueva versión"', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: null }))
    renderModal()

    await screen.findAllByText(/COT-2026-0001/)
    expect(screen.queryByText('ventasDiseno:document.versions.newVersion')).not.toBeInTheDocument()
  })

  it('con 1 sola versión pero la tarjeta ya avanzó de Cotización, NO muestra "Nueva versión"', async () => {
    mockedApi.quotes.get.mockResolvedValue(makeQuote({ confirmed_at: '2026-07-01T00:00:00Z' }))
    mockedApi.quotes.versions.mockResolvedValue(makeVersions({ versions: [makeVersions().versions[0]], card_stage: 'approved' }))
    renderModal()

    await screen.findAllByText(/COT-2026-0001/)
    expect(screen.queryByText('ventasDiseno:document.versions.newVersion')).not.toBeInTheDocument()
  })

  it('"Ver esta versión" cambia de versión sin cerrar el modal', async () => {
    mockedApi.quotes.get.mockImplementation((id: number) =>
      Promise.resolve(makeQuote({ id, folio: id === 1 ? 'COT-2026-0001' : 'COT-2026-0002', confirmed_at: '2026-07-01T00:00:00Z' })),
    )
    mockedApi.quotes.versions.mockResolvedValue(makeVersions())
    renderModal(1)

    await screen.findByText('ventasDiseno:document.versions.title')
    fireEvent.click(screen.getByText('ventasDiseno:document.versions.view'))

    await waitFor(() => expect(mockedApi.quotes.get).toHaveBeenCalledWith(2))
    // El PDF también se re-pide para la versión elegida, no se queda con el de la v1.
    await waitFor(() => expect(mockedApi.quotes.pdf).toHaveBeenCalledWith(2, false))
  })
})
