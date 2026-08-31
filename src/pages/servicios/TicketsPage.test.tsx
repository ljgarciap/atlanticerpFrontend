import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TicketsPage from './TicketsPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { Ticket } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'tickets.filters.showing': 'Mostrando {{shown}} de {{total}} tickets',
}

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) {
        for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      }
      return out
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Droppable: ({ children }: { children: (p: object, s: object) => React.ReactNode }) =>
    children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: object, s: object) => React.ReactNode }) =>
    children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tickets: {
      list: vi.fn(), changeStatus: vi.fn(), stats: vi.fn(), get: vi.fn(), update: vi.fn(), schedule: vi.fn(),
      cancel: vi.fn(),
    },
    technicians: { internalOptions: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Lider Servicios', last_name: 'Test', email: 'liderservicios@test.com',
    role: 'lider_servicios', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 1, numero: 'INS-2026-0001', tipo: 'installation', subtipo: 'installation',
    tipo_instalacion: 'internal', cliente: 'Grupo Delta', descripcion: 'Instalación de lámparas',
    estado: 'reported', internal_technician: { id: 5, first_name: 'Tecnico Servicios', last_name: 'Test' },
    quote_status: 'pending', quote_amount: null, inspection_report_status: 'pending',
    scheduled_at: null, created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function renderPage(initialEntries: string[] = ['/servicios/tickets']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <TicketsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
  mockedApi.technicians.internalOptions.mockResolvedValue([
    { id: 5, first_name: 'Tecnico Servicios', last_name: 'Test' },
    { id: 6, first_name: 'Garantias Servicios', last_name: 'Test' },
  ])
  // REQ-222 (Batch 2) — TicketsPage ahora siempre monta TicketStatCards; default razonable para
  // no repetir este mock en cada test que no le importa el contenido de las tarjetas.
  mockedApi.tickets.stats.mockResolvedValue({
    tickets_abiertos: 0, total_tickets: 0, cotizaciones_por_generar: 0,
    informes_por_generar: 0, sin_agendar: 0, sin_agendar_umbral_dias: 3,
  })
})

describe('TicketsPage — REQ-216 tabla', () => {
  it('renderiza N° ticket, cliente, tipo, técnico y guion en subtipo cuando no aplica', async () => {
    mockedApi.tickets.list.mockResolvedValue([
      makeTicket({ id: 1, numero: 'REC-2026-0001', tipo: 'claim', subtipo: null, cliente: 'Torre Azul' }),
    ])
    renderPage()

    expect(await screen.findByText('REC-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Torre Azul')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('muestra "Sin tickets para este filtro" cuando no hay resultados', async () => {
    mockedApi.tickets.list.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('tickets.table.empty')).toBeInTheDocument()
  })

  it('muestra "Sin asignar" cuando el ticket no tiene técnico interno', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ internal_technician: null })])
    renderPage()
    expect(await screen.findByText('tickets.table.unassigned')).toBeInTheDocument()
  })
})

describe('TicketsPage — REQ-223 RN2 (SCRUM-286) botón "Ver cotizaciones"', () => {
  it('navega al historial de cotizaciones (REQ-250) ahora que Cotización de Servicio existe', async () => {
    mockedApi.tickets.list.mockResolvedValue([])
    renderPage()

    const button = await screen.findByText('tickets.quotesHistory.button')
    expect(button.closest('button')).not.toBeDisabled()

    fireEvent.click(button)
    expect(navigateMock).toHaveBeenCalledWith('/servicios/cotizaciones')
  })
})

describe('TicketsPage — REQ-210 (Batch 15) deep-link a detalle del ticket', () => {
  it('?ticket=<id> abre el mismo TicketDetailModal que un clic en la tabla', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ id: 42 })])
    mockedApi.tickets.get.mockResolvedValue({
      id: 42, numero: 'INS-2026-0042', tipo: 'installation', subtipo: 'installation', tipo_instalacion: 'internal',
      cliente_master: 'Grupo Delta', subcliente: 'Grupo Delta', email: null, sales_project_id: null, proyecto: null, contacto: null,
      telefono: null, direccion: null, scheduled_at: null, scheduled_ends_at: null,
      requerimientos_especiales: { catalog: [], otros: [] }, productos: [], inspection_report_status: 'not_applicable',
      quote_status: 'not_applicable', observaciones: null, adjuntos: [], estado: 'reported', cancellation_reason: null,
      internal_technician: null, reschedule_history: [], created_at: '2026-08-01T10:00:00Z',
    })
    renderPage(['/servicios/tickets?ticket=42'])

    await waitFor(() => expect(mockedApi.tickets.get).toHaveBeenCalledWith(42))
  })
})

// SCRUM-781 — "Generar cotización"/"Generar informe" en Lista y Tablero no abrían nada (onOpen
// nunca se pasaba a QuoteIndicator/InspectionReportIndicator). Mismo assert débil que ya usa el
// test de REQ-210 arriba (mockedApi.tickets.get llamado con el id correcto) — confirma que el
// clic abre TicketDetailModal para ESE ticket, sin tener que mockear toda la superficie de API
// que consume ServiceQuoteModal/InspectionReportModal por dentro.
describe('TicketsPage — SCRUM-781 acciones Generar cotización/informe', () => {
  it('Lista — clic en "Generar cotización" abre el detalle del ticket correspondiente', async () => {
    mockedApi.tickets.list.mockResolvedValue([
      makeTicket({ id: 7, quote_status: 'pending', inspection_report_status: 'completed' }),
    ])
    renderPage()

    fireEvent.click(await screen.findByText('tickets.quote.generate'))

    await waitFor(() => expect(mockedApi.tickets.get).toHaveBeenCalledWith(7))
  })

  it('Lista — clic en "Generar informe" abre el detalle del ticket correspondiente', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ id: 8, inspection_report_status: 'pending' })])
    renderPage()

    fireEvent.click(await screen.findByText('tickets.inspectionReport.generate'))

    await waitFor(() => expect(mockedApi.tickets.get).toHaveBeenCalledWith(8))
  })

  it('Tablero — clic en "Generar cotización" de una tarjeta abre el detalle de ese ticket', async () => {
    mockedApi.tickets.list.mockResolvedValue([
      makeTicket({ id: 9, estado: 'reported', quote_status: 'pending', inspection_report_status: 'completed' }),
    ])
    renderPage()

    fireEvent.click(screen.getByText('tickets.views.board'))
    fireEvent.click(await screen.findByText('tickets.quote.generate'))

    await waitFor(() => expect(mockedApi.tickets.get).toHaveBeenCalledWith(9))
  })
})

describe('TicketsPage — REQ-217 filtros', () => {
  it('el buscador filtra por N° ticket, cliente o técnico (contiene, case-insensitive) combinando con los selects', async () => {
    mockedApi.tickets.list.mockResolvedValue([
      makeTicket({ id: 1, numero: 'INS-2026-0001', cliente: 'Grupo Delta' }),
      makeTicket({ id: 2, numero: 'GAR-2026-0002', cliente: 'Torre Azul', internal_technician: { id: 6, first_name: 'Garantias Servicios', last_name: 'Test' } }),
    ])
    renderPage()

    await screen.findByText('INS-2026-0001')
    expect(screen.getByText('Mostrando 2 de 2 tickets')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('tickets.filters.searchPlaceholder'), { target: { value: 'delta' } })

    await waitFor(() => {
      expect(screen.queryByText('GAR-2026-0002')).not.toBeInTheDocument()
    })
    expect(screen.getByText('INS-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 1 de 2 tickets')).toBeInTheDocument()
  })

  it('no crashea al buscar cuando un ticket tiene cliente=null (Pre-QA 2026-08-03)', async () => {
    // REQ-249 (endpoint mínimo de creación) permite cliente nulo — un estado real y alcanzable
    // en este batch, no un caso teórico. matchesSearch() llamaba .toLowerCase() directo sobre
    // cliente sin guard, tirando la pantalla entera en blanco al escribir cualquier caracter.
    mockedApi.tickets.list.mockResolvedValue([
      makeTicket({ id: 1, numero: 'INS-2026-0001', cliente: null }),
    ])
    renderPage()
    await screen.findByText('INS-2026-0001')

    fireEvent.change(screen.getByPlaceholderText('tickets.filters.searchPlaceholder'), { target: { value: 'x' } })

    await waitFor(() => {
      expect(screen.getByText('Mostrando 0 de 1 tickets')).toBeInTheDocument()
    })
  })

  it('"Limpiar filtros" resetea todo a Todos en un clic', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket()])
    renderPage()
    await screen.findByText('INS-2026-0001')

    const search = screen.getByPlaceholderText('tickets.filters.searchPlaceholder') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'algo' } })
    expect(await screen.findByText('tickets.filters.clear')).toBeInTheDocument()

    fireEvent.click(screen.getByText('tickets.filters.clear'))
    expect(search.value).toBe('')
    expect(screen.queryByText('tickets.filters.clear')).not.toBeInTheDocument()
  })

  it('los filtros persisten al alternar entre Tabla y Tablero', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ cliente: 'Grupo Delta' })])
    renderPage()
    await screen.findByText('INS-2026-0001')

    fireEvent.change(screen.getByPlaceholderText('tickets.filters.searchPlaceholder'), { target: { value: 'delta' } })
    await waitFor(() => expect(screen.getByText('Mostrando 1 de 1 tickets')).toBeInTheDocument())

    fireEvent.click(screen.getByText('tickets.views.board'))
    expect((screen.getByPlaceholderText('tickets.filters.searchPlaceholder') as HTMLInputElement).value).toBe('delta')
  })
})

describe('TicketsPage — REQ-218 gate de cambio de estado', () => {
  it('Aaron (lider_servicios) puede cambiar el estado; éxito refresca la lista', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket()])
    mockedApi.tickets.changeStatus.mockResolvedValue(makeTicket({ estado: 'scheduled' }))
    renderPage()
    await screen.findByText('INS-2026-0001')

    const select = screen.getByLabelText('tickets.table.columns.status') as HTMLSelectElement
    expect(select).not.toBeDisabled()
    fireEvent.change(select, { target: { value: 'scheduled' } })

    await waitFor(() => expect(mockedApi.tickets.changeStatus).toHaveBeenCalledWith(1, 'scheduled'))
  })

  // SCRUM-781 (punto 2, REQ-227 RN6) — elegir "Cancelado" en el select ya no llama a
  // changeStatus() directo, pide motivo primero (mismo modal que el botón "Cancelar" explícito).
  it('elegir "Cancelado" en el select pide motivo — no cancela sin él (SCRUM-781)', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket()])
    renderPage()
    await screen.findByText('INS-2026-0001')

    const select = screen.getByLabelText('tickets.table.columns.status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cancelled' } })

    expect(await screen.findByText('tickets.cancelModal.motivoLabel')).toBeInTheDocument()
    expect(mockedApi.tickets.changeStatus).not.toHaveBeenCalled()

    // Sin motivo, el botón de confirmar sigue deshabilitado.
    expect(screen.getByText('tickets.cancelModal.confirm')).toBeDisabled()

    const textarea = screen.getByPlaceholderText('tickets.cancelModal.motivoPlaceholder')
    fireEvent.change(textarea, { target: { value: 'Cliente desistió' } })
    mockedApi.tickets.cancel.mockResolvedValue(undefined as never)
    fireEvent.click(screen.getByText('tickets.cancelModal.confirm'))

    await waitFor(() => expect(mockedApi.tickets.cancel).toHaveBeenCalledWith(1, 'Cliente desistió'))
  })

  it('un rol sin permiso (Vendedor/Diseñador) ve el select deshabilitado', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'vendedor_disenador' }) })
    mockedApi.tickets.list.mockResolvedValue([makeTicket()])
    renderPage()
    await screen.findByText('INS-2026-0001')

    expect(screen.getByLabelText('tickets.table.columns.status')).toBeDisabled()
  })

  it('si el backend bloquea el cierre (422), el select vuelve al valor anterior y muestra el mensaje específico', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ estado: 'on_site' })])
    mockedApi.tickets.changeStatus.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'No se puede cerrar: falta aprobar la cotización' } },
    })
    renderPage()
    await screen.findByText('INS-2026-0001')

    const select = screen.getByLabelText('tickets.table.columns.status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'closed' } })

    expect(await screen.findByText('No se puede cerrar: falta aprobar la cotización')).toBeInTheDocument()
    await waitFor(() => expect(select.value).toBe('on_site'))
  })

  it('un error genérico (sin 422) muestra el mensaje genérico, no vacío', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ estado: 'on_site' })])
    mockedApi.tickets.changeStatus.mockRejectedValue({ isAxiosError: true, response: { status: 500 } })
    renderPage()
    await screen.findByText('INS-2026-0001')

    fireEvent.change(screen.getByLabelText('tickets.table.columns.status'), { target: { value: 'closed' } })
    expect(await screen.findByText('tickets.status.changeError')).toBeInTheDocument()
  })
})

describe('TicketsPage — REQ-221 tablero', () => {
  it('renderiza las 6 columnas del tablero, reflejando los filtros activos', async () => {
    mockedApi.tickets.list.mockResolvedValue([makeTicket({ estado: 'reported' })])
    renderPage()
    await screen.findByText('INS-2026-0001')

    fireEvent.click(screen.getByText('tickets.views.board'))

    const board = within(screen.getByTestId('ticket-board'))
    expect(board.getByText('tickets.board.columns.reported')).toBeInTheDocument()
    expect(board.getByText('tickets.board.columns.scheduled')).toBeInTheDocument()
    expect(board.getByText('tickets.board.columns.on_site')).toBeInTheDocument()
    expect(board.getByText('tickets.board.columns.resolved')).toBeInTheDocument()
    expect(board.getByText('tickets.board.columns.closed')).toBeInTheDocument()
    expect(board.getByText('tickets.board.columns.cancelled')).toBeInTheDocument()
    // 5 columnas vacías (solo "reported" tiene el ticket)
    expect(board.getAllByText('tickets.board.empty')).toHaveLength(5)
  })
})

// REQ-245 RN4 — quién ve el botón "+ Nuevo ticket".
describe('TicketsPage — REQ-245 botón Nuevo ticket', () => {
  it('lider_servicios ve el botón y al hacer clic abre el formulario', async () => {
    mockedApi.tickets.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('tickets.table.empty')

    const newTicketBtn = screen.getByText('tickets.create.newTicket')
    fireEvent.click(newTicketBtn)

    expect(await screen.findByText('tickets.create.title')).toBeInTheDocument()
  })

  it('vendedor_disenador (solo lectura general) también ve el botón — única excepción de REQ-245 RN4', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'vendedor_disenador' }) })
    mockedApi.tickets.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('tickets.table.empty')

    expect(screen.getByText('tickets.create.newTicket')).toBeInTheDocument()
  })

  it('técnico interno no ve el botón — no tiene el botón de Nuevo ticket disponible', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tickets.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('tickets.table.empty')

    expect(screen.queryByText('tickets.create.newTicket')).not.toBeInTheDocument()
  })
})
