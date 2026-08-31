import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom'
import QuotePage from './QuotePage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { useUnsavedQuoteGuard } from '@/store/unsavedQuoteGuard'
import type { QuoteDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    quotes: {
      create: vi.fn(),
      get:    vi.fn(),
      update: vi.fn(),
      validate: vi.fn(),
      saveDraft: vi.fn(),
      generate: vi.fn(),
      confirm: vi.fn(),
      pdf: vi.fn(),
      contacts: { create: vi.fn(), remove: vi.fn() },
      parts: {
        create: vi.fn(), update: vi.fn(), remove: vi.fn(),
        items: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
      },
    },
    masterClients:  { list: vi.fn(), create: vi.fn() },
    subClients:     { list: vi.fn(), create: vi.fn(), contacts: { list: vi.fn(), create: vi.fn() } },
    salesProjects:  { list: vi.fn(), create: vi.fn() },
    architects:     { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pricingSettings: { get: vi.fn(), update: vi.fn() },
    quoteConditionsSettings: { get: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

// useAuthStore se usa tanto destructurado (`const { user } = useAuthStore()`, en
// QuotePage) como con selector (`useAuthStore(s => s.user?.permissions)`, dentro de
// usePermission) — el mock tiene que soportar ambos llamados, no solo devolver un
// objeto fijo ignorando el selector.
function mockAuthState(user: Record<string, unknown> | null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user }
    return selector ? selector(state) : state
  }) as never)
}

function emptyQuote(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 1, status: 'draft', folio: null, generated_at: null, confirmed_at: null,
    pipeline_card_id: null, document_status: 'draft',
    master_client: null, sub_client: null, sales_project: null,
    ruc: null, description: null, owner: { id: 1, name: 'Designer Demo' }, architect: null,
    delivery_type: null, delivery_dates: [], contacts: [], can_edit: true,
    price_type: 'public', discount_mode: 'line', global_discount_percent: 0,
    global_below_min_margin: false, can_override_min_margin: false, min_margin_percent: 30,
    parts: [], subtotal: 0,
    observations: null, includes_installation: false,
    discount_totals_type: 'percent', discount_totals_value: 0, discount_totals_amount: 0,
    net_total: 0, itbms: 0, grand_total: 0,
    conditions_text: 'Texto de condiciones', observations_preview: '',
    created_at: '2026-07-08T00:00:00Z',
    ...overrides,
  }
}

// SCRUM-723 — "Volver a Pipeline" navega de verdad (ya no hay mutation/respuesta de
// API que verificar) — se usa una ruta señuelo real en vez de mockear useNavigate,
// para no romper otros tests de este archivo que sí dependen de navegación real
// (ej. el redirect a existing_quote_id de createMutation.onError).
function PipelineRouteProbe() {
  const [params] = useSearchParams()
  return <div data-testid="pipeline-route-probe">card={params.get('card')}</div>
}

function renderPage(initialEntries = ['/ventas-diseno/quotes/1']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/ventas-diseno/quotes/:id?" element={<QuotePage />} />
          <Route path="/ventas-diseno/pipeline" element={<PipelineRouteProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

// jsdom no implementa URL.createObjectURL/revokeObjectURL — SCRUM-766, mismo patrón que
// QuoteViewerModal.test.tsx/ServiceQuoteModal.test.tsx.
const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-quote-pdf')
const revokeObjectURLMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthState({ id: 1, first_name: 'Designer', last_name: 'Demo', permissions: [] })
  useUnsavedQuoteGuard.setState({ isDirty: false })
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, configurable: true })
  mockedApi.quotes.pdf.mockResolvedValue(new Blob(['%PDF-fake'], { type: 'application/pdf' }))
})

describe('QuotePage', () => {
  it('crea una cotización vacía cuando se entra sin id', async () => {
    mockedApi.quotes.create.mockResolvedValue(emptyQuote())
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage(['/ventas-diseno/quotes'])

    await waitFor(() => expect(mockedApi.quotes.create).toHaveBeenCalledWith({}))
  })

  it('muestra el nombre del diseñador a cargo, bloqueado', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()

    expect(await screen.findByText('Designer Demo')).toBeInTheDocument()
  })

  // ── SCRUM-734 (sección 6): mensajes guía de orden de llenado ────────────────

  it('sin Cliente Master, muestra el mensaje guía bajo Subcliente', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()

    expect(await screen.findByText('ventasDiseno:quote.fillOrderHint.needsMasterClient')).toBeInTheDocument()
  })

  it('con Cliente Master pero sin Subcliente, muestra el mensaje guía bajo Proyecto y Arquitecto', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
    }))
    renderPage()
    await screen.findByText('Designer Demo')

    await waitFor(() => {
      expect(screen.queryByText('ventasDiseno:quote.fillOrderHint.needsMasterClient')).not.toBeInTheDocument()
      expect(screen.getAllByText('ventasDiseno:quote.fillOrderHint.needsSubClient')).toHaveLength(2)
    })
  })

  it('con Cliente Master y Subcliente, no muestra ningún mensaje guía', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
      sub_client: { id: 10, business_name: 'Delta Residencial' },
    }))
    renderPage()
    await screen.findByText('Designer Demo')

    await waitFor(() => {
      expect(screen.queryByText('ventasDiseno:quote.fillOrderHint.needsMasterClient')).not.toBeInTheDocument()
      expect(screen.queryByText('ventasDiseno:quote.fillOrderHint.needsSubClient')).not.toBeInTheDocument()
    })
  })

  it('al elegir un subcliente existente autocompleta el RUC', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
    }))
    mockedApi.subClients.list.mockResolvedValue([
      { id: 10, business_name: 'Delta Residencial', tax_id: '155-0000-1-2026', contacts_count: 1 },
    ])
    renderPage()
    await screen.findByText('Designer Demo')

    // "Designer Demo" viene del store de auth (síncrono) y puede aparecer ANTES de
    // que el efecto de hidratación (setMasterClient/setSubClient desde quote, ver
    // QuotePage.tsx) haya corrido — el Subcliente depende de masterClient ya
    // hidratado (disabled={!canEdit || !masterClient}). Ubicar el input por label
    // (no por índice) y esperar a que se habilite antes de interactuar, mismo
    // mecanismo de carrera que "borrar el texto de Cliente Master" más abajo.
    const subClientLabel = screen.getByText('ventasDiseno:modal.subClient')
    const subClientInput = subClientLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(subClientInput).not.toBeDisabled())

    fireEvent.focus(subClientInput)
    fireEvent.change(subClientInput, { target: { value: 'Delta' } })
    fireEvent.mouseDown(await screen.findByText('Delta Residencial'))

    await waitFor(() => {
      const rucLabel = screen.getByText('ventasDiseno:quote.ruc')
      const rucInput = rucLabel.parentElement!.querySelector('input') as HTMLInputElement
      expect(rucInput.value).toBe('155-0000-1-2026')
    })
  })

  // El backend valida que un contacto pertenezca a quote.sub_client_id — si se elige
  // un Subcliente distinto en el formulario pero todavía no se guardó, agregar un
  // contacto en ese momento sería rechazado con 422 (bug real encontrado en
  // verificación E2E, 2026-07-08).
  it('pide guardar la cotización antes de agregar contactos si el subcliente elegido no coincide con el guardado', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
    }))
    mockedApi.subClients.list.mockResolvedValue([
      { id: 10, business_name: 'Delta Residencial', tax_id: '155-0000-1-2026', contacts_count: 1 },
    ])
    renderPage()
    await screen.findByText('Designer Demo')

    // Ver comentario del test anterior: ubicar por label + esperar a que se habilite
    // antes de interactuar, en vez de asumir un índice fijo ya hidratado.
    const subClientLabel = screen.getByText('ventasDiseno:modal.subClient')
    const subClientInput = subClientLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(subClientInput).not.toBeDisabled())

    fireEvent.focus(subClientInput)
    fireEvent.change(subClientInput, { target: { value: 'Delta' } })
    fireEvent.mouseDown(await screen.findByText('Delta Residencial'))

    expect(await screen.findByText('ventasDiseno:quote.saveBeforeContacts')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:quote.addExistingContact')).not.toBeInTheDocument()
  })

  // SCRUM-122 (Gerencia Test, 2026-08-02) — el directorio de Arquitectos dejó de ser
  // global: sin Subcliente elegido no hay a qué acotar la búsqueda, mismo criterio que
  // ya aplica a Proyecto (disabled={!canEdit || !subClient}).
  it('el campo Arquitecto queda deshabilitado sin un Subcliente elegido (SCRUM-122)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    expect(architectInput).toBeDisabled()
  })

  it('ofrece "+ Crear" para Arquitecto aunque el fuzzy match traiga resultados que no son un match exacto (SCRUM-122)', async () => {
    // Bug real verificado en vivo contra dev.atlanticerp.ai: el buscador tokenizado hace match
    // con "Arq. QA Real" al escribir cualquier nombre nuevo que empiece con "QA" (comparten
    // la palabra "QA"), así que "+ Crear" nunca aparecía aunque el nombre exacto no existiera.
    // El buscador de Arquitecto depende de un Subcliente ya elegido (SCRUM-122, mismo patrón
    // que Proyecto) — sin sub_client en el fixture el campo queda disabled.
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 10, business_name: 'Delta Residencial' } }))
    mockedApi.architects.list.mockResolvedValue([
      { id: 1, name: 'Arq. QA Real', phone: null, email: null },
      { id: 2, name: 'Arq. QA Real2', phone: null, email: null },
    ])
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    // El campo depende de la hidratación async de subClient (SCRUM-122) — esperar a que
    // se habilite antes de interactuar, mismo mecanismo de carrera que subClientInput más
    // arriba en este archivo (nunca asumir que ya hidrató solo porque "Designer Demo" apareció).
    await waitFor(() => expect(architectInput).not.toBeDisabled())
    fireEvent.focus(architectInput)
    fireEvent.change(architectInput, { target: { value: 'QA Live Test Arch XYZ' } })

    expect(await screen.findByText('Arq. QA Real')).toBeInTheDocument()
    expect(await screen.findByText('ventasDiseno:modal.createNew')).toBeInTheDocument()
  })

  it('no ofrece "+ Crear" cuando el query coincide exacto con una opción existente', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 10, business_name: 'Delta Residencial' } }))
    mockedApi.architects.list.mockResolvedValue([{ id: 1, name: 'Arq. QA Real', phone: null, email: null }])
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput).not.toBeDisabled())
    fireEvent.focus(architectInput)
    fireEvent.change(architectInput, { target: { value: 'Arq. QA Real' } })

    await screen.findByText('Arq. QA Real')
    expect(screen.queryByText('ventasDiseno:modal.createNew')).not.toBeInTheDocument()
  })

  it('permite crear Arquitecto solo con Correo, sin Teléfono (SCRUM-122)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 10, business_name: 'Delta Residencial' } }))
    mockedApi.architects.list.mockResolvedValue([])
    mockedApi.architects.create.mockResolvedValue({ id: 9, name: 'Arq. Nuevo', phone: null, email: 'nuevo@arq.test' })
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput).not.toBeDisabled())
    fireEvent.focus(architectInput)
    fireEvent.change(architectInput, { target: { value: 'Arq. Nuevo' } })
    fireEvent.mouseDown(await screen.findByText('ventasDiseno:modal.createNew'))

    const emailInput = (await screen.findByPlaceholderText('common:labels.email')) as HTMLInputElement
    const architectPicker = within(architectLabel.parentElement!)
    const confirmButton = architectPicker.getByText('common:actions.confirm')
    expect(confirmButton).toBeDisabled()

    fireEvent.change(emailInput, { target: { value: 'nuevo@arq.test' } })
    expect(confirmButton).not.toBeDisabled()
    fireEvent.click(confirmButton)

    await waitFor(() => expect(mockedApi.architects.create).toHaveBeenCalledWith({
      sub_client_id: 10, name: 'Arq. Nuevo', phone: null, email: 'nuevo@arq.test',
    }))
  })

  // SCRUM-122 (root cause) — Gerencia Test (QA) reportó que, una vez elegido el
  // arquitecto, la cotización solo mostraba el nombre: teléfono/correo se
  // descartaban en searchArchitects/createArchitect antes de llegar al estado.
  it('muestra teléfono y correo del arquitecto elegido de la lista, no solo el nombre (SCRUM-122)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 10, business_name: 'Delta Residencial' } }))
    mockedApi.architects.list.mockResolvedValue([
      { id: 1, name: 'Arq. QA Real', phone: '6000-1111', email: 'qa.real@arq.test' },
    ])
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput).not.toBeDisabled())
    fireEvent.focus(architectInput)
    fireEvent.change(architectInput, { target: { value: 'Arq. QA Real' } })
    fireEvent.mouseDown(await screen.findByText('Arq. QA Real'))

    expect(await screen.findByText('6000-1111')).toBeInTheDocument()
    expect(screen.getByText('qa.real@arq.test')).toBeInTheDocument()
  })

  it('muestra teléfono y correo del arquitecto recién creado inline', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 10, business_name: 'Delta Residencial' } }))
    mockedApi.architects.list.mockResolvedValue([])
    mockedApi.architects.create.mockResolvedValue({ id: 9, name: 'Arq. Nuevo', phone: '6000-2222', email: 'nuevo@arq.test' })
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput).not.toBeDisabled())
    fireEvent.focus(architectInput)
    fireEvent.change(architectInput, { target: { value: 'Arq. Nuevo' } })
    fireEvent.mouseDown(await screen.findByText('ventasDiseno:modal.createNew'))

    const phoneInput = (await screen.findByPlaceholderText('common:labels.phone')) as HTMLInputElement
    const emailInput = screen.getByPlaceholderText('common:labels.email') as HTMLInputElement
    fireEvent.change(phoneInput, { target: { value: '6000-2222' } })
    fireEvent.change(emailInput, { target: { value: 'nuevo@arq.test' } })
    const architectPicker = within(architectLabel.parentElement!)
    fireEvent.click(architectPicker.getByText('common:actions.confirm'))

    expect(await screen.findByText('6000-2222')).toBeInTheDocument()
    expect(screen.getByText('nuevo@arq.test')).toBeInTheDocument()
  })

  // SCRUM-122 — el gap original reportado por Gerencia Test era justamente este: al
  // ABRIR una cotización ya existente con arquitecto asignado, no solo al crearlo.
  it('hidrata teléfono y correo del arquitecto al abrir una cotización ya existente', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      architect: { id: 5, name: 'Arq. Ya Asignado', phone: '6000-3333', email: 'asignado@arq.test' },
    }))
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput.value).toBe('Arq. Ya Asignado'))

    expect(await screen.findByText('6000-3333')).toBeInTheDocument()
    expect(screen.getByText('asignado@arq.test')).toBeInTheDocument()
  })

  it('no muestra nada roto cuando el arquitecto ya asignado no tiene teléfono ni correo cargado', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      architect: { id: 6, name: 'Arq. Viejo Sin Datos', phone: null, email: null },
    }))
    renderPage()
    await screen.findByText('Designer Demo')

    const architectLabel = screen.getByText('ventasDiseno:quote.architect')
    const architectInput = architectLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(architectInput.value).toBe('Arq. Viejo Sin Datos'))

    expect(screen.queryByText(/6000-/)).not.toBeInTheDocument()
    expect(screen.queryByText(/@arq.test/)).not.toBeInTheDocument()
  })

  // ── SCRUM-734 (RN8.5): edición in-place de Arquitecto ────────────────────────

  it('editar teléfono/correo de un Arquitecto ya asignado actualiza su registro real', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      architect: { id: 5, name: 'Arq. Ya Asignado', phone: '6000-3333', email: 'asignado@arq.test' },
    }))
    mockedApi.architects.update.mockResolvedValue({ id: 5, name: 'Arq. Ya Asignado', phone: '6000-4444', email: 'nuevo@arq.test' })
    renderPage()
    await screen.findByText('Designer Demo')
    await screen.findByText('6000-3333')

    fireEvent.click(screen.getByText('ventasDiseno:quote.edit'))

    const phoneInput = screen.getByPlaceholderText('common:labels.phone') as HTMLInputElement
    const emailInput = screen.getByPlaceholderText('common:labels.email') as HTMLInputElement
    expect(phoneInput.value).toBe('6000-3333')
    expect(emailInput.value).toBe('asignado@arq.test')

    fireEvent.change(phoneInput, { target: { value: '6000-4444' } })
    fireEvent.change(emailInput, { target: { value: 'nuevo@arq.test' } })
    fireEvent.click(screen.getByText('ventasDiseno:quote.save'))

    await waitFor(() => expect(mockedApi.architects.update).toHaveBeenCalledWith(
      5, { name: 'Arq. Ya Asignado', phone: '6000-4444', email: 'nuevo@arq.test' },
    ))
    expect(await screen.findByText('6000-4444')).toBeInTheDocument()
  })

  it('Cancelar la edición de Arquitecto descarta los cambios sin llamar al backend', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      architect: { id: 5, name: 'Arq. Ya Asignado', phone: '6000-3333', email: 'asignado@arq.test' },
    }))
    renderPage()
    await screen.findByText('Designer Demo')
    await screen.findByText('6000-3333')

    fireEvent.click(screen.getByText('ventasDiseno:quote.edit'))
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '9999-9999' } })
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(mockedApi.architects.update).not.toHaveBeenCalled()
    expect(await screen.findByText('6000-3333')).toBeInTheDocument()
  })

  it('error del backend al editar Arquitecto muestra el mensaje sin perder los datos tipeados', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      architect: { id: 5, name: 'Arq. Ya Asignado', phone: '6000-3333', email: null },
    }))
    mockedApi.architects.update.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'No se pudo actualizar el arquitecto.' } },
    })
    renderPage()
    await screen.findByText('Designer Demo')
    await screen.findByText('6000-3333')

    fireEvent.click(screen.getByText('ventasDiseno:quote.edit'))
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6000-5555' } })
    fireEvent.click(screen.getByText('ventasDiseno:quote.save'))

    expect(await screen.findByText('No se pudo actualizar el arquitecto.')).toBeInTheDocument()
    expect((screen.getByPlaceholderText('common:labels.phone') as HTMLInputElement).value).toBe('6000-5555')
  })

  it('ofrece "+ Crear cliente" para Cliente Master en el estado inicial, sin tipear nada (SCRUM-116)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.masterClients.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('Designer Demo')

    const masterLabel = screen.getByText('ventasDiseno:modal.masterClient')
    const masterInput = masterLabel.parentElement!.querySelector('input') as HTMLInputElement
    fireEvent.focus(masterInput)

    expect(await screen.findByText('ventasDiseno:clients.actions.createClient')).toBeInTheDocument()
  })

  it('ofrece "+ Nuevo Subcliente" aunque la búsqueda traiga resultados, no solo con 0 (SCRUM-117)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
    }))
    mockedApi.subClients.list.mockResolvedValue([
      { id: 10, business_name: 'Delta Residencial', tax_id: '155-0000-1-2026', contacts_count: 1 },
    ])
    renderPage()
    await screen.findByText('Designer Demo')

    // Ver comentario de "al elegir un subcliente existente autocompleta el RUC" más
    // arriba: ubicar por label + esperar habilitación en vez de índice fijo.
    const subClientLabel = screen.getByText('ventasDiseno:modal.subClient')
    const subClientInput = subClientLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(subClientInput).not.toBeDisabled())

    fireEvent.focus(subClientInput)
    fireEvent.change(subClientInput, { target: { value: 'Delta Nueva' } })

    expect(await screen.findByText('Delta Residencial')).toBeInTheDocument()
    expect(await screen.findByText('ventasDiseno:clients.detail.newSubClient')).toBeInTheDocument()
  })

  // ── SCRUM-734 (RN7.1): el texto tipeado precarga el modal de creación ───────

  it('el texto tipeado en Cliente Master precarga el modal de creación (RN7.1)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.masterClients.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('Designer Demo')

    const masterLabel = screen.getByText('ventasDiseno:modal.masterClient')
    const masterInput = masterLabel.parentElement!.querySelector('input') as HTMLInputElement
    fireEvent.focus(masterInput)
    fireEvent.change(masterInput, { target: { value: 'Constructora XYZ' } })

    fireEvent.mouseDown(await screen.findByText('ventasDiseno:clients.actions.createClient'))

    const modalLabel = await screen.findByText('ventasDiseno:clients.createModal.masterClient *')
    const modalInput = modalLabel.parentElement!.querySelector('input') as HTMLInputElement
    expect(modalInput.value).toBe('Constructora XYZ')
  })

  it('el texto tipeado en Subcliente precarga el modal de creación (RN7.1)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
    }))
    mockedApi.subClients.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('Designer Demo')

    const subClientLabel = screen.getByText('ventasDiseno:modal.subClient')
    const subClientInput = subClientLabel.parentElement!.querySelector('input') as HTMLInputElement
    await waitFor(() => expect(subClientInput).not.toBeDisabled())

    fireEvent.focus(subClientInput)
    fireEvent.change(subClientInput, { target: { value: 'Nueva Sede' } })

    fireEvent.mouseDown(await screen.findByText('ventasDiseno:clients.detail.newSubClient'))

    const modalLabel = await screen.findByText('ventasDiseno:clients.createModal.businessName *')
    const modalInput = modalLabel.parentElement!.querySelector('input') as HTMLInputElement
    expect(modalInput.value).toBe('Nueva Sede')
  })

  it('borrar el texto de Cliente Master limpia y deshabilita el Subcliente (SCRUM-117)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
      sub_client:    { id: 10, business_name: 'Delta Residencial' },
    }))
    mockedApi.masterClients.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('Designer Demo')

    const masterLabel = screen.getByText('ventasDiseno:modal.masterClient')
    const masterInput = masterLabel.parentElement!.querySelector('input') as HTMLInputElement
    const subClientLabel = screen.getByText('ventasDiseno:modal.subClient')
    const subClientInput = subClientLabel.parentElement!.querySelector('input') as HTMLInputElement

    // Esperar a que el fetch de la cotización (async, mockeado) se refleje en el
    // input antes de "borrarlo" — "Designer Demo" viene del store de auth (síncrono)
    // y puede aparecer antes de que `quote` resuelva, dejando el picker todavía en
    // su valor inicial vacío. Si el fireEvent.change de abajo dispara sobre un campo
    // que YA está en '', React no detecta cambio (mismo valor) y nunca llama a
    // onChange/onClear — bug real de timing encontrado corriendo este test bajo
    // carga (varios archivos de test en paralelo).
    await waitFor(() => expect(masterInput.value).toBe('Grupo Delta'))
    expect(subClientInput).not.toBeDisabled()

    fireEvent.change(masterInput, { target: { value: '' } })

    await waitFor(() => expect(subClientInput.value).toBe(''))
    await waitFor(() => expect(subClientInput).toBeDisabled())
  })

  it('permite agregar contactos una vez que el subcliente guardado coincide con el elegido', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({
      master_client: { id: 1, name: 'Grupo Delta' },
      sub_client:    { id: 10, business_name: 'Delta Residencial' },
    }))
    renderPage()
    await screen.findByText('Designer Demo')

    // "Designer Demo" (store de auth, síncrono) puede pintar antes de que el efecto
    // de hidratación (setSubClient desde quote.sub_client) corra — contactsReady
    // depende de ese subClient local, así que "addExistingContact" solo aparece en
    // el render POSTERIOR al de "Designer Demo". Causa raíz confirmada de flake
    // intermitente en CI (sesión 2026-07-31): usar findByText (async), no getByText.
    // saveBeforeContacts es seguro como chequeo síncrono: nunca aparece en ningún
    // render de este escenario (antes de hidratar, subClient local es null y esa
    // condición ya requiere subClient truthy; después de hidratar, contactsReady
    // pasa a true, que también la excluye).
    expect(screen.queryByText('ventasDiseno:quote.saveBeforeContacts')).not.toBeInTheDocument()
    expect(await screen.findByText('ventasDiseno:quote.addExistingContact')).toBeInTheDocument()
  })

  it('guarda los campos del encabezado con Guardar borrador', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.saveDraft.mockResolvedValue(emptyQuote({ description: 'Cotizacion X' }))
    renderPage()

    await screen.findByText('Designer Demo')
    // Orden en el DOM: [0] Master, [1] Sub, [2] RUC, [3] Proyecto, [4] Descripción.
    const descriptionInput = document.querySelectorAll('input[type="text"]')[4] as HTMLInputElement
    fireEvent.change(descriptionInput, { target: { value: 'Cotizacion X' } })

    fireEvent.click(screen.getByText('ventasDiseno:quote.saveDraft'))

    await waitFor(() => expect(mockedApi.quotes.saveDraft).toHaveBeenCalledWith(1, expect.objectContaining({
      description: 'Cotizacion X',
    })))
    await screen.findByText('ventasDiseno:quote.draftSaved')
  })

  it('cambiar de Entrega Parcial (2 fechas) a Única resetea a un solo campo de fecha (SCRUM-124)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const deliveryTypeLabel = screen.getByText('ventasDiseno:modal.deliveryType')
    const deliveryTypeSelect = deliveryTypeLabel.parentElement!.querySelector('select') as HTMLSelectElement

    fireEvent.change(deliveryTypeSelect, { target: { value: 'partial' } })
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(2)
    })

    fireEvent.change(deliveryTypeSelect, { target: { value: 'single' } })
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(1)
    })
  })

  // SCRUM-796 (secc. 7) — "Por definir": no exige fecha, oculta el selector de fechas.
  it('SCRUM-796 — "Por definir" oculta el selector de fechas y no las exige', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    // Rename de label (secc. 7): "Tipo de Entrega" pasa a "Fecha estimada de entrega"
    // (misma clave i18n ventasDiseno:modal.deliveryType, ya renderizada con el texto nuevo).
    const deliveryTypeLabel = screen.getByText('ventasDiseno:modal.deliveryType')
    const deliveryTypeSelect = deliveryTypeLabel.parentElement!.querySelector('select') as HTMLSelectElement

    // Primero en Parcial (2 fechas visibles) para confirmar que "Por definir" las limpia.
    fireEvent.change(deliveryTypeSelect, { target: { value: 'partial' } })
    await waitFor(() => expect(document.querySelectorAll('input[type="date"]').length).toBe(2))

    fireEvent.change(deliveryTypeSelect, { target: { value: 'tbd' } })
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(0)
      expect(screen.queryByText('ventasDiseno:modal.deliveryDates')).not.toBeInTheDocument()
    })
  })

  it('Entrega Parcial permite quitar una fecha agregada pero nunca bajar de 2 (Pre-QA SCRUM-124, REQ-032 Excel)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const deliveryTypeLabel = screen.getByText('ventasDiseno:modal.deliveryType')
    const deliveryTypeSelect = deliveryTypeLabel.parentElement!.querySelector('select') as HTMLSelectElement
    fireEvent.change(deliveryTypeSelect, { target: { value: 'partial' } })
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(2)
    })

    // Con exactamente 2 fechas (mínimo permitido), no debe haber botón de quitar.
    const datesLabel = screen.getByText('ventasDiseno:modal.deliveryDates')
    const datesContainer = datesLabel.parentElement!
    expect(datesContainer.querySelectorAll('button').length).toBe(1) // solo el "+"

    fireEvent.click(screen.getByText('+'))
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(3)
    })

    // Con 3 fechas, aparecen 2 botones de quitar además del "+".
    expect(datesContainer.querySelectorAll('button').length).toBe(4)

    fireEvent.click(datesContainer.querySelectorAll('button')[0])
    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]').length).toBe(2)
    })

    // De vuelta a 2, el botón de quitar vuelve a desaparecer — no se puede bajar de 2.
    expect(datesContainer.querySelectorAll('button').length).toBe(1)
  })

  // ── Cotización-B (REQ-033/034/041) ──────────────────────────────────────────

  it('deshabilita Precio Socio sin el permiso select_partner_price', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const partnerOption = screen.getByText('ventasDiseno:priceType.partner', { exact: false })
    expect((partnerOption as HTMLOptionElement).disabled).toBe(true)
  })

  it('permite elegir Precio Socio con el permiso select_partner_price', async () => {
    mockAuthState({ id: 1, first_name: 'Designer', last_name: 'Demo', permissions: ['ventas_diseno.select_partner_price'] })
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const partnerOption = screen.getByText('ventasDiseno:priceType.partner', { exact: false })
    expect((partnerOption as HTMLOptionElement).disabled).toBe(false)
  })

  it('cambiar el tipo de precio general actualiza la cotización de inmediato', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.update.mockResolvedValue(emptyQuote({ price_type: 'project' }))
    renderPage()
    await screen.findByText('Designer Demo')

    // Orden en el DOM: [0] tipo de entrega, [1] tipo de precio general.
    const select = document.querySelectorAll('select')[1] as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'project' } })

    await waitFor(() => expect(mockedApi.quotes.update).toHaveBeenCalledWith(1, { price_type: 'project' }))
  })

  it('cambiar a modo Global lo actualiza de inmediato', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.update.mockResolvedValue(emptyQuote({ discount_mode: 'global' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.discountGlobal'))

    await waitFor(() => expect(mockedApi.quotes.update).toHaveBeenCalledWith(1, { discount_mode: 'global' }))
  })

  it('agrega una partida nueva', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.parts.create.mockResolvedValue({ id: 1, name: 'Iluminación', position: 0, subtotal: 0, items: [] })
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.newPartName'), { target: { value: 'Iluminación' } })
    fireEvent.click(screen.getByText('ventasDiseno:quote.addPart'))

    await waitFor(() => expect(mockedApi.quotes.parts.create).toHaveBeenCalledWith(1, 'Iluminación'))
  })

  // ── Cotización-C (REQ-043/044/045/046/047) ──────────────────────────────────

  it('guarda observaciones e instalación junto con el resto del encabezado', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.saveDraft.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Nota del vendedor' } })
    fireEvent.click(screen.getByText('ventasDiseno:quote.includesInstallation'))
    fireEvent.click(screen.getByText('ventasDiseno:quote.saveDraft'))

    await waitFor(() => expect(mockedApi.quotes.saveDraft).toHaveBeenCalledWith(1, expect.objectContaining({
      observations: 'Nota del vendedor', includes_installation: true,
    })))
  })

  // SCRUM-138 — el texto de Condiciones ya no se edita por cotización (queda
  // congelado desde que se creó), sin importar el permiso del usuario.
  it('el texto de Condiciones siempre es de solo lectura en la cotización', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ conditions_text: 'Texto fijo' }))
    renderPage()
    await screen.findByText('Designer Demo')

    expect(screen.getByText('ventasDiseno:quote.conditionsLocked')).toBeInTheDocument()
    const conditionsTextarea = await screen.findByDisplayValue('Texto fijo')
    expect(conditionsTextarea).toBeDisabled()
  })

  it('no muestra el botón Configurar condiciones sin el permiso edit.conditions', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    expect(screen.queryByText('ventasDiseno:quote.conditionsConfig.toggle')).not.toBeInTheDocument()
  })

  it('muestra y abre el panel de default global de Condiciones con el permiso edit.conditions', async () => {
    mockAuthState({ id: 1, first_name: 'Designer', last_name: 'Demo', permissions: ['ventas_diseno.edit.conditions'] })
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quoteConditionsSettings.get.mockResolvedValue({ text: 'Condiciones globales' })
    renderPage()
    await screen.findByText('ventasDiseno:quote.conditionsConfig.toggle')

    fireEvent.click(screen.getByText('ventasDiseno:quote.conditionsConfig.toggle'))

    expect(await screen.findByText('ventasDiseno:quote.conditionsConfig.title')).toBeInTheDocument()
  })

  it('aplicar el descuento de Totales lo actualiza de inmediato', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.update.mockResolvedValue(emptyQuote({ discount_totals_value: 10 }))
    renderPage()
    await screen.findByText('Designer Demo')

    const discountInput = screen.getByLabelText('ventasDiseno:quote.totals.discount')
    fireEvent.change(discountInput, { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.quotes.update).toHaveBeenCalledWith(1, {
      discount_totals_type: 'percent', discount_totals_value: 10,
    }))
  })

  it('descuento de Totales acepta coma decimal y se clampa a 100% al salir del campo (SCRUM-137)', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    const discountInput = screen.getByLabelText('ventasDiseno:quote.totals.discount')
    fireEvent.change(discountInput, { target: { value: '10,5' } })
    expect(screen.getByDisplayValue('10.5')).toBeInTheDocument()

    fireEvent.change(discountInput, { target: { value: '150' } })
    fireEvent.blur(discountInput)
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('verificar la cotización muestra los campos que faltan', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.validate.mockResolvedValue({ valid: false, missing: ['Cliente Master', 'Ítems'] })
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.validation.check'))

    expect(await screen.findByText(/Cliente Master, Ítems/)).toBeInTheDocument()
  })

  it('agregar un contacto no borra campos del encabezado todavía sin guardar (regresión Cotización-D)', async () => {
    // Bug real: el refetch que dispara "agregar contacto" invalidaba la query y el
    // efecto de sincronización pisaba Descripción (y el resto del encabezado) con
    // los valores viejos del servidor, perdiendo lo recién tipeado sin guardar.
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ sub_client: { id: 1, business_name: 'Sub Demo' } }))
    mockedApi.subClients.contacts.list.mockResolvedValue([{ id: 9, name: 'Contacto X', role: 'client', phone: '6000-0000', email: null }])
    mockedApi.quotes.contacts.create.mockResolvedValue({ pivot_id: 1, id: 9, name: 'Contacto X', role: 'client', phone: '6000-0000', email: null })
    renderPage()
    await screen.findByText('Designer Demo')

    // Esperar a que "addExistingContact" aparezca (depende del mismo efecto de
    // hidratación que setea subClient desde quote.sub_client, ver comentario en
    // "permite agregar contactos..." más arriba) ANTES de tipear Descripción — si el
    // efecto todavía no corrió y recién corre después del fireEvent.change de abajo,
    // pisaría Descripción de vuelta a '' (quote.description es null en este test),
    // exactamente el bug de regresión que este test intenta cubrir.
    const addExistingContactLabel = await screen.findByText('ventasDiseno:quote.addExistingContact')

    const descriptionInput = document.querySelectorAll('input[type="text"]')[4] as HTMLInputElement
    fireEvent.change(descriptionInput, { target: { value: 'No se debe perder' } })

    const searchInput = addExistingContactLabel.closest('div')!.querySelector('input') as HTMLInputElement
    fireEvent.focus(searchInput)
    const option = await screen.findByText(/Contacto X/)
    fireEvent.mouseDown(option)

    await waitFor(() => expect(mockedApi.quotes.contacts.create).toHaveBeenCalled())
    expect(descriptionInput.value).toBe('No se debe perder')
  })

  // ── Cotización-D (REQ-047/048/051/086) ──────────────────────────────────────

  it('las pestañas de Vista Previa/Externa quedan deshabilitadas sin folio', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: null }))
    renderPage()
    await screen.findByText('Designer Demo')

    expect(screen.getByText('ventasDiseno:quote.view.preview').closest('button')).toBeDisabled()
    expect(screen.getByText('ventasDiseno:quote.view.external').closest('button')).toBeDisabled()
  })

  it('Guardar y generar cotización guarda el encabezado y luego genera', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.saveDraft.mockResolvedValue(emptyQuote())
    mockedApi.quotes.generate.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.generate'))

    await waitFor(() => expect(mockedApi.quotes.saveDraft).toHaveBeenCalled())
    await waitFor(() => expect(mockedApi.quotes.generate).toHaveBeenCalledWith(1))
    // Al generar exitosamente, la vista cambia sola a Vista Previa (mismo comportamiento que el mock).
    expect(await screen.findByText('ventasDiseno:quote.edit')).toBeInTheDocument()
  })

  it('generar bloqueado por falta de ítems muestra la lista de faltantes', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.saveDraft.mockResolvedValue(emptyQuote())
    mockedApi.quotes.generate.mockRejectedValue({
      isAxiosError: true, response: { data: { valid: false, missing: ['Ítems'] } },
    })
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.generate'))

    expect(await screen.findByText(/Ítems/)).toBeInTheDocument()
  })

  it('Guardar borrador bloqueado por falta de un campo general no llega a generar', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.quotes.saveDraft.mockRejectedValue({
      isAxiosError: true, response: { data: { valid: false, missing: ['Cliente Master'] } },
    })
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.generate'))

    expect(await screen.findByText(/Cliente Master/)).toBeInTheDocument()
    expect(mockedApi.quotes.generate).not.toHaveBeenCalled()
  })

  // SCRUM-723 — return-to-pipeline dejó de existir como ruta del backend: el botón
  // pasa a ser navegación pura (sin mutation/loading), usando el pipeline_card_id
  // que ya trae la cotización cargada.
  it('el botón Volver a Pipeline navega directo cuando la cotización ya está confirmada', async () => {
    mockedApi.quotes.get.mockResolvedValue(
      emptyQuote({ folio: 'COT-2026-0001', pipeline_card_id: 42, confirmed_at: '2026-08-05T10:00:00-04:00' }),
    )
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    const button = await screen.findByText('ventasDiseno:quote.returnToPipeline')
    fireEvent.click(button)

    expect(await screen.findByTestId('pipeline-route-probe')).toHaveTextContent('card=42')
    expect(mockedApi.quotes.confirm).not.toHaveBeenCalled()
  })

  // Pre-QA SCRUM-723 (2026-08-05, hallazgo de Daniela): con la cotización generada
  // pero SIN confirmar, "Volver a Pipeline" navegaba directo sin avisar, dejando la
  // tarjeta en Lead sin que el usuario lo esperara — el criterio de aceptación #6
  // exige la misma advertencia de "Salir sin guardar" para este botón que para
  // cualquier otra navegación. Ahora debe interceptar con el modal antes de navegar.
  it('el botón Volver a Pipeline con cotización sin confirmar pide confirmación antes de navegar', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', pipeline_card_id: 42 }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    const button = await screen.findByText('ventasDiseno:quote.returnToPipeline')
    fireEvent.click(button)

    const confirmModal = await screen.findByText('ventasDiseno:quote.exitWithoutSavingModal.title')
    expect(confirmModal).toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-route-probe')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:quote.exitWithoutSavingModal.confirm'))

    expect(await screen.findByTestId('pipeline-route-probe')).toHaveTextContent('card=42')
    expect(mockedApi.quotes.confirm).not.toHaveBeenCalled()
  })

  it('el botón Volver a Pipeline con cotización sin confirmar: Cancelar permanece en la cotización', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', pipeline_card_id: 42 }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    const button = await screen.findByText('ventasDiseno:quote.returnToPipeline')
    fireEvent.click(button)

    await screen.findByText('ventasDiseno:quote.exitWithoutSavingModal.title')
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.queryByText('ventasDiseno:quote.exitWithoutSavingModal.title')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-route-probe')).not.toBeInTheDocument()
  })

  it('sin tarjeta vinculada no muestra el botón Volver a Pipeline', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', pipeline_card_id: null }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    await screen.findByText('ventasDiseno:quote.edit')

    expect(screen.queryByText('ventasDiseno:quote.returnToPipeline')).not.toBeInTheDocument()
  })

  // ── SCRUM-723 — "Guardar" en Vista Previa / confirm() ───────────────────────

  it('muestra el botón Guardar (no el badge Guardada) en Vista Previa cuando la cotización aún no está confirmada', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))

    expect(await screen.findByText('ventasDiseno:quote.save')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:quote.saved')).not.toBeInTheDocument()
  })

  it('muestra el badge Guardada (no el botón Guardar) cuando la cotización ya está confirmada', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: '2026-08-03T00:00:00Z' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))

    expect(await screen.findByText('ventasDiseno:quote.saved')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:quote.save')).not.toBeInTheDocument()
  })

  it('clic en Guardar abre el modal de confirmación; "Cancelar" lo cierra sin llamar a confirm()', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    fireEvent.click(await screen.findByText('ventasDiseno:quote.save'))

    expect(await screen.findByText('ventasDiseno:quote.saveConfirmModal.title')).toBeInTheDocument()
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.queryByText('ventasDiseno:quote.saveConfirmModal.title')).not.toBeInTheDocument()
    expect(mockedApi.quotes.confirm).not.toHaveBeenCalled()
  })

  it('confirmar en el modal llama a quotes.confirm y cierra el modal', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    mockedApi.quotes.confirm.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: '2026-08-03T00:00:00Z' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    fireEvent.click(await screen.findByText('ventasDiseno:quote.save'))
    await screen.findByText('ventasDiseno:quote.saveConfirmModal.title')

    fireEvent.click(screen.getByText('ventasDiseno:quote.saveConfirmModal.confirm'))

    await waitFor(() => expect(mockedApi.quotes.confirm).toHaveBeenCalledWith(1, undefined))
    await waitFor(() => expect(screen.queryByText('ventasDiseno:quote.saveConfirmModal.title')).not.toBeInTheDocument())
  })

  // ── SCRUM-725 — advertencia de margen mínimo (Mark/David) al confirmar ──────

  it('confirm() con margin_warning muestra el modal de advertencia en vez de un error genérico', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    mockedApi.quotes.confirm.mockRejectedValue({
      isAxiosError: true,
      response: { data: { margin_warning: true, below_min_margin_items: [5], global_below_minimum: false } },
    })
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    fireEvent.click(await screen.findByText('ventasDiseno:quote.save'))
    await screen.findByText('ventasDiseno:quote.saveConfirmModal.title')
    fireEvent.click(screen.getByText('ventasDiseno:quote.saveConfirmModal.confirm'))

    expect(await screen.findByText('ventasDiseno:quote.marginWarningModal.title')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:quote.saveConfirmModal.title')).not.toBeInTheDocument()
  })

  it('"Continuar" en el modal de advertencia de margen reintenta confirm() con el flag explícito', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    mockedApi.quotes.confirm.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { margin_warning: true, below_min_margin_items: [5], global_below_minimum: false } },
    })
    mockedApi.quotes.confirm.mockResolvedValueOnce(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: '2026-08-05T00:00:00Z' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    fireEvent.click(await screen.findByText('ventasDiseno:quote.save'))
    await screen.findByText('ventasDiseno:quote.saveConfirmModal.title')
    fireEvent.click(screen.getByText('ventasDiseno:quote.saveConfirmModal.confirm'))
    await screen.findByText('ventasDiseno:quote.marginWarningModal.title')

    fireEvent.click(screen.getByText('ventasDiseno:quote.marginWarningModal.confirm'))

    await waitFor(() => expect(mockedApi.quotes.confirm).toHaveBeenLastCalledWith(1, true))
    await waitFor(() => expect(screen.queryByText('ventasDiseno:quote.marginWarningModal.title')).not.toBeInTheDocument())
  })

  // ── SCRUM-723 — guard de "salir sin guardar" ─────────────────────────────────

  it('marca isDirty en el store al tocar un campo del formulario', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    expect(useUnsavedQuoteGuard.getState().isDirty).toBe(false)

    const descriptionInput = document.querySelectorAll('input[type="text"]')[4] as HTMLInputElement
    fireEvent.change(descriptionInput, { target: { value: 'Cotizacion X' } })

    await waitFor(() => expect(useUnsavedQuoteGuard.getState().isDirty).toBe(true))
  })

  it('marca isDirty en Vista Previa mientras la cotización no esté confirmada, y lo limpia al confirmar', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: null }))
    mockedApi.quotes.confirm.mockResolvedValue(emptyQuote({ folio: 'COT-2026-0001', confirmed_at: '2026-08-03T00:00:00Z' }))
    renderPage()
    await screen.findByText('Designer Demo')

    fireEvent.click(screen.getByText('ventasDiseno:quote.view.preview'))
    await waitFor(() => expect(useUnsavedQuoteGuard.getState().isDirty).toBe(true))

    fireEvent.click(await screen.findByText('ventasDiseno:quote.save'))
    fireEvent.click(await screen.findByText('ventasDiseno:quote.saveConfirmModal.confirm'))

    await waitFor(() => expect(useUnsavedQuoteGuard.getState().isDirty).toBe(false))
  })

  it('crea la cotización con precarga desde una tarjeta de Pipeline (?fromPipelineCard=)', async () => {
    mockedApi.quotes.create.mockResolvedValue(emptyQuote({ master_client: { id: 5, name: 'Cliente Pipeline' } }))
    renderPage(['/ventas-diseno/quotes?fromPipelineCard=42'])

    await waitFor(() => expect(mockedApi.quotes.create).toHaveBeenCalledWith(
      expect.objectContaining({ from_pipeline_card_id: 42 }),
    ))
  })

  it('crea la cotización con precarga desde un subcliente (?fromSubClient=)', async () => {
    mockedApi.quotes.create.mockResolvedValue(emptyQuote())
    renderPage(['/ventas-diseno/quotes?fromSubClient=7'])

    await waitFor(() => expect(mockedApi.quotes.create).toHaveBeenCalledWith(
      expect.objectContaining({ from_sub_client_id: 7 }),
    ))
  })

  // SCRUM-105 — la tarjeta de Pipeline ya puede tener una cotización generada
  // vinculada (guard nuevo en el backend). Antes de este fix, este error no se
  // manejaba en ningún lado: createMutation.isError quedaba true pero la pantalla
  // seguía mostrando "Cargando..." para siempre (isLoading || !quote), porque
  // quoteId nunca cambiaba y nada volvía a intentar ni a avisar. El backend
  // devuelve el id de la cotización existente para redirigir en vez de dejar al
  // usuario varado.
  it('si la tarjeta ya tiene una cotización generada, redirige a la existente en vez de quedarse cargando', async () => {
    mockedApi.quotes.create.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'already linked', existing_quote_id: 99 } },
    })
    mockedApi.quotes.get.mockResolvedValue(emptyQuote({ id: 99 }))
    renderPage(['/ventas-diseno/quotes?fromPipelineCard=42'])

    await waitFor(() => expect(mockedApi.quotes.get).toHaveBeenCalledWith(99))
  })

  it('si la creación falla por otro motivo, muestra un error en vez de quedarse cargando', async () => {
    mockedApi.quotes.create.mockRejectedValue({
      isAxiosError: true,
      response: { data: {} },
    })
    renderPage(['/ventas-diseno/quotes?fromPipelineCard=42'])

    await screen.findByText('ventasDiseno:modal.createError')
    expect(mockedApi.quotes.get).not.toHaveBeenCalled()
  })

  // REQ-033 (2026-07-12) — panel de Configuración de fórmulas de Tipo de Precio.
  it('no muestra el botón Configurar fórmulas sin el permiso pricing.configure', async () => {
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    renderPage()
    await screen.findByText('Designer Demo')

    expect(screen.queryByText('ventasDiseno:quote.pricingConfig.toggle')).not.toBeInTheDocument()
  })

  it('muestra y abre el panel de Configuración con el permiso pricing.configure', async () => {
    mockAuthState({ id: 1, first_name: 'Designer', last_name: 'Demo', permissions: ['ventas_diseno.pricing.configure'] })
    mockedApi.quotes.get.mockResolvedValue(emptyQuote())
    mockedApi.pricingSettings.get.mockResolvedValue({
      project_discount_percent: 15, special_additional_discount_percent: 5,
      partner_divisor: 0.85, premium_divisor: 0.65, min_margin_percent: 30,
    })
    renderPage()
    await screen.findByText('ventasDiseno:quote.pricingConfig.toggle')

    fireEvent.click(screen.getByText('ventasDiseno:quote.pricingConfig.toggle'))

    expect(await screen.findByText('ventasDiseno:quote.pricingConfig.title')).toBeInTheDocument()
  })
})
