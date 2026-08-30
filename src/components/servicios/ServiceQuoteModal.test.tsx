import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ServiceQuoteModal from './ServiceQuoteModal'
import { serviciosApi } from '@/api/serviciosApi'
import { useToastStore } from '@/store/toastStore'
import type { ServiceQuoteDetail } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    serviceQuotes: {
      get:      vi.fn(),
      generate: vi.fn(),
      save:     vi.fn(),
      send:     vi.fn(),
      decide:   vi.fn(),
      document: vi.fn(),
      history:  vi.fn(),
      items: { store: vi.fn(), update: vi.fn(), destroy: vi.fn() },
    },
    externalTechnicians: { list: vi.fn() },
    lookup: { products: vi.fn() },
  },
}))

vi.mock('@/store/toastStore', () => ({ useToastStore: vi.fn() }))

const mockedApi   = vi.mocked(serviciosApi, true)
const mockedToast = vi.mocked(useToastStore)

function mockToast() {
  const showSpy = vi.fn()
  mockedToast.mockImplementation(((selector?: (s: { show: typeof showSpy }) => unknown) => {
    const state = { show: showSpy }
    return selector ? selector(state) : state
  }) as never)
  return showSpy
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ServiceQuoteModal ticketId={1} ticketNumero="GAR-2026-0001" onClose={vi.fn()} onChanged={vi.fn()} />
    </QueryClientProvider>,
  )
}

const NO_QUOTE_READY: ServiceQuoteDetail = {
  ticket_id: 1, notes: [], min_margin_percent: 30, itbms_percent: 7,
  can_view_cost_breakdown: false, can_generate: true, conditions_preview: 'Condiciones vigentes', quote: null,
}

const NO_QUOTE_BLOCKED: ServiceQuoteDetail = {
  ...NO_QUOTE_READY, can_generate: false,
}

function draftQuote(overrides: Partial<ServiceQuoteDetail['quote']> = {}): ServiceQuoteDetail {
  return {
    ticket_id: 1, notes: [], min_margin_percent: 30, itbms_percent: 7,
    can_view_cost_breakdown: false, can_generate: false, conditions_preview: 'Condiciones vigentes',
    quote: {
      id: 10, numero: 'COT-SERV-2026-0001', estado: 'draft', subtotal: 0, discount_percent: 0,
      itbms: 0, total: 0, observations: null, conditions: null, sent_at: null, decided_at: null,
      created_at: '2026-08-11T10:00:00Z', cliente: 'Cliente X', contacto: 'Juan Pérez',
      telefono: '6000-0000', direccion: 'Panamá', can_edit: true, can_send: true, can_decide: false,
      items: [],
      ...overrides,
    },
  }
}

// REQ-229/230/231/232/233/234 — Cotización de Servicio.
// jsdom no implementa URL.createObjectURL/revokeObjectURL — ServiceQuoteModal/ServiceQuotePdfViewerModal
// los usan al abrir el visor de PDF en pantalla (Batch 12, ver docblock de ese componente). Mismo
// patrón ad-hoc que OrderDetailModal.test.tsx.
const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-quote-pdf')
const revokeObjectURLMock = vi.fn()

describe('ServiceQuoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToast()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, configurable: true })
    // Batch 12 (REQ-236) — la sección de historial solo hace su propio fetch cuando ya existe una
    // cotización (`quote !== null`); default vacío para no dejarlo "pending" para siempre en los
    // tests que no ejercitan esta sección a propósito.
    mockedApi.serviceQuotes.history.mockResolvedValue([])
  })

  it('sin cotización y gate listo — muestra "Generar cotización" y dispara generate() (REQ-229)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(NO_QUOTE_READY)
    mockedApi.serviceQuotes.generate.mockResolvedValue(draftQuote())
    renderModal()

    const btn = await screen.findByText('tickets.quoteModal.generate')
    fireEvent.click(btn)

    await waitFor(() => expect(mockedApi.serviceQuotes.generate).toHaveBeenCalledWith(1))
  })

  it('sin cotización y gate bloqueado por informe pendiente — no ofrece "Generar" (REQ-229 RN1)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(NO_QUOTE_BLOCKED)
    renderModal()

    await screen.findByText('tickets.quoteModal.blockedByInspection')
    expect(screen.queryByText('tickets.quoteModal.generate')).not.toBeInTheDocument()
  })

  /**
   * SCRUM-296 (rebote QA 2026-08-13) — ITBMS/Total mostraban siempre el último valor PERSISTIDO
   * (quote.itbms/quote.total), así que cambiar el % de descuento no los recalculaba hasta el
   * próximo Guardar — el usuario guardaba viendo un total distinto al real. Mismo ejemplo exacto
   * que reprodujo QA: subtotal $1000, descuento 10%→20%, ITBMS/Total deben pasar de $63/$963 a
   * $56/$856 EN VIVO, sin ningún guardado de por medio.
   */
  it('recalcula ITBMS/Total en vivo al cambiar el % de descuento, sin esperar a Guardar (SCRUM-296)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote({
      subtotal: 1000, discount_percent: 10, itbms: 63, total: 963,
    }))
    renderModal()

    await screen.findByText('$63')
    expect(screen.getByText('$963')).toBeInTheDocument()

    const discountInput = screen.getByRole('spinbutton')
    fireEvent.change(discountInput, { target: { value: '20' } })

    await waitFor(() => {
      expect(screen.getByText('$56')).toBeInTheDocument()
      expect(screen.getByText('$856')).toBeInTheDocument()
    })
    // Nunca llamó a save()/generate() — el recálculo es puramente local, no un round-trip.
    expect(mockedApi.serviceQuotes.save).not.toHaveBeenCalled()
  })

  it('cotización en Borrador sin ítems — "Enviar al cliente" queda deshabilitado (REQ-234)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    renderModal()

    const sendBtn = await screen.findByText('tickets.quoteModal.send')
    expect(sendBtn).toBeDisabled()
  })

  it('agregar ítem Mano de obra dispara items.store() con el payload correcto (REQ-231)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    mockedApi.serviceQuotes.items.store.mockResolvedValue({ id: 99 })
    renderModal()

    fireEvent.click(await screen.findByText('+ tickets.quoteModal.itemTypes.labor'))

    const descInput = screen.getByPlaceholderText('tickets.quoteModal.description')
    fireEvent.change(descInput, { target: { value: 'Instalación eléctrica' } })

    const [qtyInput, priceInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(qtyInput, { target: { value: '2' } })
    fireEvent.change(priceInput, { target: { value: '50' } })

    fireEvent.click(screen.getByText('tickets.quoteModal.addItem'))

    await waitFor(() => expect(mockedApi.serviceQuotes.items.store).toHaveBeenCalledWith(1, expect.objectContaining({
      tipo: 'labor', description: 'Instalación eléctrica', quantity: 2, unit_price: 50,
    })))
  })

  it('desglose de costo NUNCA se renderiza sin can_view_cost_breakdown (REQ-232)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote({
      can_edit: false, can_send: false,
      items: [{
        id: 1, tipo: 'subcontracted', catalog_product_id: null, is_custom: false,
        external_technician_id: 5, description: 'Instalación subcontratada — X (Y)',
        quantity: 2, unit_price: 130, margin_percent: 30, subtotal: 260, cost_reference: 100,
      }],
    }))
    renderModal()

    await screen.findByText('Instalación subcontratada — X (Y)')
    expect(screen.queryByText(/costReference/)).not.toBeInTheDocument()
    // Regresión (Senior Review, Batch 11) — con unit_price ya visible, mostrar margin_percent sin
    // can_view_cost_breakdown permite recalcular cost_reference (tarifa_dia); defensa en
    // profundidad simétrica al gate de cost_reference de arriba, aunque el mock (a propósito)
    // simule un backend que igual mandara el valor.
    expect(screen.queryByText(/quoteModal\.margin/)).not.toBeInTheDocument()
  })

  it('desglose de costo SÍ se renderiza con can_view_cost_breakdown (REQ-232)', async () => {
    // `draftQuote(overrides)` solo mergea `overrides` DENTRO de `quote` (anidado) — para
    // `can_view_cost_breakdown` (campo top-level de `ServiceQuoteDetail`, no de `quote`) hace
    // falta pisarlo aparte, o el helper lo deja en su default `false` en silencio. La primera
    // versión de este test lo pasaba dentro de `draftQuote({...})` y por eso nunca ejercitó el
    // caso `true` — quedó pasando igual porque el otro test (negativo, arriba) nunca depende de
    // esta rama.
    mockedApi.serviceQuotes.get.mockResolvedValue({
      ...draftQuote({
        can_edit: false, can_send: false,
        items: [{
          id: 1, tipo: 'subcontracted', catalog_product_id: null, is_custom: false,
          external_technician_id: 5, description: 'Instalación subcontratada — X (Y)',
          quantity: 2, unit_price: 130, margin_percent: 30, subtotal: 260, cost_reference: 100,
        }],
      }),
      can_view_cost_breakdown: true,
    })
    renderModal()

    await screen.findByText('Instalación subcontratada — X (Y)')
    expect(screen.getByText(/costReference/)).toBeInTheDocument()
    expect(screen.getByText(/quoteModal\.margin/)).toBeInTheDocument()
  })

  // SCRUM-781 (punto 3) — costo/día editable por ítem subcontratado, mismo gate que
  // margin_percent/cost_reference de arriba (can_view_cost_breakdown). Prefill inicial = tarifa
  // del técnico elegido, editable después, nunca toca el maestro.
  it('Costo se prefilla con la tarifa del técnico y viaja en el payload de store() (REQ-232)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue({
      ...draftQuote(),
      can_view_cost_breakdown: true,
    })
    mockedApi.externalTechnicians.list.mockResolvedValue({
      data: [
        { id: 5, nombre: 'Luis Vargas', empresa: 'LV Instalaciones', especialidad: 'general', telefono: null, tarifa_dia: 90, tarifa_visible: true, estado: 'active', proyectos_activos: 0 },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 },
      counts: { active: 1, inactive: 0, total: 1 },
    })
    mockedApi.serviceQuotes.items.store.mockResolvedValue({ id: 99 })
    renderModal()

    fireEvent.click(await screen.findByText('+ tickets.quoteModal.itemTypes.subcontracted'))
    const techSelect = await screen.findByRole('combobox')
    fireEvent.change(techSelect, { target: { value: '5' } })

    // Prefill: el costo ya muestra la tarifa real del técnico sin que el usuario la escriba.
    const costoInput = screen.getByLabelText('tickets.quoteModal.costReference') as HTMLInputElement
    expect(costoInput.value).toBe('90')

    fireEvent.click(screen.getByText('tickets.quoteModal.addItem'))

    await waitFor(() => expect(mockedApi.serviceQuotes.items.store).toHaveBeenCalledWith(1, expect.objectContaining({
      tipo: 'subcontracted', external_technician_id: 5, cost_reference: 90,
    })))
  })

  it('Costo no se muestra al agregar Subcontratado sin can_view_cost_breakdown (REQ-232)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    mockedApi.externalTechnicians.list.mockResolvedValue({
      data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 },
      counts: { active: 0, inactive: 0, total: 0 },
    })
    renderModal()

    fireEvent.click(await screen.findByText('+ tickets.quoteModal.itemTypes.subcontracted'))
    await screen.findByRole('combobox')

    expect(screen.queryByLabelText('tickets.quoteModal.costReference')).not.toBeInTheDocument()
  })

  it('Aprobar/Rechazar solo aparecen cuando can_decide es true (REQ-234)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote({ estado: 'sent', can_edit: false, can_send: false, can_decide: true }))
    renderModal()

    await screen.findByText('tickets.quoteModal.approve')
    expect(screen.getByText('tickets.quoteModal.reject')).toBeInTheDocument()
  })

  it('botón "Ver/Imprimir" de cabecera dispara document() con la cotización vigente y abre el visor en pantalla (REQ-235)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    mockedApi.serviceQuotes.document.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    renderModal()

    const printBtn = await screen.findByText('tickets.quoteModal.print')
    fireEvent.click(printBtn)

    await waitFor(() => expect(mockedApi.serviceQuotes.document).toHaveBeenCalledWith(1, 10))
    // Batch 12 — ya no descarga a ciegas, abre ServiceQuotePdfViewerModal (vista en pantalla, ver
    // docblock del componente: un <a download> no cumple "vista en pantalla" de REQ-235 RN4).
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalled())
    expect(await screen.findByTitle(/tickets\.quoteModal\.pdfViewerTitle/)).toBeInTheDocument()
  })

  it('sin cotización — el botón "Ver/Imprimir" no se muestra (REQ-235)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(NO_QUOTE_READY)
    renderModal()

    await screen.findByText('tickets.quoteModal.generate')
    expect(screen.queryByText('tickets.quoteModal.print')).not.toBeInTheDocument()
  })

  it('historial con una sola versión no muestra la sección (REQ-236)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    mockedApi.serviceQuotes.history.mockResolvedValue([
      { id: 10, numero: 'COT-SERV-2026-0001', estado: 'draft', total: 0, created_at: '2026-08-11T10:00:00Z', sent_at: null, decided_at: null },
    ])
    renderModal()

    await screen.findByText('tickets.quoteModal.itemsSection')
    expect(screen.queryByText('tickets.quoteModal.historySection')).not.toBeInTheDocument()
  })

  it('historial con 2+ versiones se muestra, resalta la vigente y cada fila dispara document() (REQ-236)', async () => {
    mockedApi.serviceQuotes.get.mockResolvedValue(draftQuote())
    mockedApi.serviceQuotes.history.mockResolvedValue([
      { id: 10, numero: 'COT-SERV-2026-0001', estado: 'draft', total: 0, created_at: '2026-08-11T10:00:00Z', sent_at: null, decided_at: null },
      { id: 9, numero: 'COT-SERV-2026-0000', estado: 'rejected', total: 500, created_at: '2026-08-01T10:00:00Z', sent_at: '2026-08-02T10:00:00Z', decided_at: '2026-08-03T10:00:00Z' },
    ])
    mockedApi.serviceQuotes.document.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    renderModal()

    await screen.findByText('tickets.quoteModal.historySection')
    expect(screen.getByText('COT-SERV-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('COT-SERV-2026-0000')).toBeInTheDocument()
    // Solo la fila vigente (id === quote.id) trae el badge "Vigente".
    expect(screen.getByText('tickets.quoteModal.historyCurrent')).toBeInTheDocument()

    fireEvent.click(screen.getByText('COT-SERV-2026-0000'))
    // REQ-236 RN2/Escenario 2 — un clic en una entrada anterior del historial "abre esa cotización
    // específica en modo de solo lectura": abre el mismo visor en pantalla, no una descarga.
    await waitFor(() => expect(mockedApi.serviceQuotes.document).toHaveBeenCalledWith(1, 9))
    expect(await screen.findByTitle(/tickets\.quoteModal\.pdfViewerTitle/)).toBeInTheDocument()
  })
})
