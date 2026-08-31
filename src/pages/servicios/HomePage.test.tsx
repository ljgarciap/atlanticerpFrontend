import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import HomePage from './HomePage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { HomeSummary, TicketDetail } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'
import { toDateKey } from '@/lib/dateGrid'

const LABELS: Record<string, string> = {
  'home.title':                       'Inicio de Servicios',
  'home.greeting':                    'Bienvenido, {{name}}',
  'home.greetingFallback':            'Bienvenido',
  'home.subtitle':                    '{{fecha}} · tienes {{visitas}} visitas y {{pendientes}} pendientes hoy',
  'home.quickActions.agenda':         'Agenda',
  'tickets.create.newTicket':         'Nuevo ticket',
  'tickets.create.title':             'Nuevo ticket',
  'home.routes.title':                'Rutas del día',
  'home.routes.seeFullAgenda':        'Ver agenda completa',
  'home.routes.navigate':             'Waze / Maps',
  'home.calendar.title':              'Mi calendario',
  'home.pending.title':               'Pendientes',
  'home.indicators.title':            'Indicadores del mes',
  'home.indicators.goalModal.title':      'Ajustar meta de instalaciones',
  'home.indicators.goalModal.valueLabel': 'Meta de instalaciones del mes',
  'home.indicators.goalModal.cancel':     'Cancelar',
  'home.indicators.goalModal.confirm':    'Guardar',
  'tickets.types.installation':       'Instalación',
  'tickets.types.warranty':           'Garantía',
}

const navigateMock = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      return out
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    home: { summary: vi.fn(), updateInstallationGoal: vi.fn(), estadoTickets: vi.fn() },
    tickets: { create: vi.fn(), stats: vi.fn(), get: vi.fn() },
    internalTechnicians: { stats: vi.fn() },
    lookup: { masterClients: vi.fn(), subClients: vi.fn(), projects: vi.fn(), products: vi.fn() },
    calendar: { list: vi.fn() },
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

function makeSummary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    rutas_dia: { visitas: [], total: 0, has_more: false },
    pendientes: { count: 0, items: [] },
    indicadores_mes: {
      instalaciones: { completadas: 0, meta: 36, meta_source: 'manual_default', progreso_pct: 0 },
      resuelto_primera_visita_pct: null,
      tiempo_promedio_resolucion_dias: null,
      ingresos_instalaciones: { value: null, available: false },
    },
    sin_responder: { count: 0, items: [] },
    insumos_pendientes: { count: 0, items: [] },
    ...overrides,
  }
}

function makeTicketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 30, numero: 'INS-2026-0030', tipo: 'installation', subtipo: 'installation',
    tipo_instalacion: 'internal', cliente_master: 'Grupo Delta', subcliente: 'Grupo Delta',
    email: null, sales_project_id: null, proyecto: null, contacto: null, telefono: null, direccion: null,
    scheduled_at: null, scheduled_ends_at: null, requerimientos_especiales: { catalog: [], otros: [] },
    productos: [], inspection_report_status: 'not_applicable', quote_status: 'not_applicable',
    observaciones: null, adjuntos: [], estado: 'reported', cancellation_reason: null, internal_technician: null,
    reschedule_history: [],
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <HomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
  // ServiciosHomeHeader (REQ-206) consulta estos 2 endpoints para el resumen del saludo —
  // resueltos acá con defaults neutros, ninguno de los tests de este archivo asertan sobre ellos.
  mockedApi.internalTechnicians.stats.mockResolvedValue({
    activos_hoy: 0, total_tecnicos: 0, visitas_hoy_total: 0, promedio_primera_visita: null,
  })
  mockedApi.tickets.stats.mockResolvedValue({
    tickets_abiertos: 0, total_tickets: 0, cotizaciones_por_generar: 0,
    informes_por_generar: 0, sin_agendar: 0, sin_agendar_umbral_dias: 3,
  })
  // EstadoTicketsPanel (REQ-215) consulta este endpoint aparte del summary — resuelto acá con
  // defaults neutros, ninguno de los tests preexistentes de este archivo asertan sobre él.
  mockedApi.home.estadoTickets.mockResolvedValue({
    counts: { reported: 0, scheduled: 0, on_site: 0, resolved: 0, closed: 0, cancelled: 0 },
    tipo: null,
  })
  // ServiciosMyCalendarPanel (REQ-209) consulta este endpoint aparte del summary — resuelto acá
  // con default vacío, salvo el test dedicado de más abajo.
  mockedApi.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
})

// REQ-207/208/210/211 (Batch 15) — pantalla "Inicio" de Servicios.
describe('ServiciosHomePage', () => {
  it('REQ-207 RN2 — el botón "Agenda" navega a Técnicos Internos → Agenda equipo sin filtro', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    renderPage()

    await waitFor(() => expect(screen.getByText('Rutas del día')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Agenda'))

    expect(navigateMock).toHaveBeenCalledWith('/servicios/tecnicos?view=agenda')
  })

  it('REQ-209 — "Mi calendario" pide el propio calendario Outlook (sin scope/owner_id) y lo muestra', async () => {
    // Fix (encontrado al validar SCRUM-764): la vista "day" de MiniCalendarCard filtra los eventos
    // por la fecha REAL del sistema (`new Date()`, sin inyectar `today` acá) — un start_at fijo
    // ("2026-08-14") deja de caer en "hoy" apenas pasa esa fecha y el test empieza a fallar solo,
    // sin que nadie haya tocado el código. Se calcula la fecha de HOY en cada corrida, con el mismo
    // helper de fecha LOCAL que usa el propio componente (toDateKey), no toISOString() — evita un
    // desfase UTC/local cerca de medianoche en corridas locales fuera de UTC.
    const todayKey = toDateKey(new Date())
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    mockedApi.calendar.list.mockResolvedValue({
      data: [{
        id: 'evt-1', title: 'Instalación — Torres Pacífico', start_at: `${todayKey}T13:30:00Z`,
        end_at: `${todayKey}T14:30:00Z`, all_day: false, location: null, organizer: null,
        owner_email: 'tecnico@atlantic.com.pa', owner_name: null,
      }],
      source_unavailable: false,
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Mi calendario')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Instalación — Torres Pacífico')).toBeInTheDocument())

    // RN1/PERMISOS (SCRUM-272) — a diferencia de Bodega/Compras/Ventas & Diseño, este panel nunca
    // pide el calendario de otra persona: sin `scope` ni `owner_id` en ningún llamado.
    for (const call of mockedApi.calendar.list.mock.calls) {
      expect(call[0]).not.toHaveProperty('scope')
      expect(call[0]).not.toHaveProperty('owner_id')
    }
  })

  it('REQ-207 RN1 — "+ Nuevo ticket" abre EXACTAMENTE el formulario real de Tickets (TicketCreateModal)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    renderPage()

    await waitFor(() => expect(screen.getByText('Rutas del día')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Nuevo ticket'))

    // El modal real (TicketCreateModal) renderiza su propio título "Nuevo ticket" también —
    // ahora deben existir 2 nodos con ese texto (botón + título del modal).
    expect(screen.getAllByText('Nuevo ticket').length).toBeGreaterThan(1)
  })

  it('REQ-208 RN2 — más de 5 visitas muestra el enlace "Ver agenda completa"', async () => {
    const visita = {
      ticket_id: 1, numero: 'INS-2026-0001', hora: '09:00', tipo: 'installation' as const,
      cliente: 'Grupo Delta', descripcion: null, direccion: 'Calle 50', contacto: 'Juan Pérez',
      telefono: '6000-0000', tecnico: { id: 1, nombre: 'Tecnico Servicios Test', color: '#3B82F6' },
    }
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      rutas_dia: { visitas: [visita], total: 8, has_more: true },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Grupo Delta')).toBeInTheDocument())
    expect(screen.getByText('Ver agenda completa')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Ver agenda completa'))
    expect(navigateMock).toHaveBeenCalledWith('/servicios/tecnicos?view=agenda')
  })

  it('REQ-210 RN4 — el badge de Pendientes muestra el conteo real del backend', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: {
        count: 2,
        items: [
          { type: 'ticket_sin_agendar', ticket_id: 10, numero: 'INS-2026-0010', dias: 4, message: 'Ticket INS-2026-0010 sin agendar hace 4 días' },
          { type: 'ticket_sin_agendar', ticket_id: 11, numero: 'INS-2026-0011', dias: 5, message: 'Ticket INS-2026-0011 sin agendar hace 5 días' },
        ],
      },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    expect(screen.getByText('Ticket INS-2026-0010 sin agendar hace 4 días')).toBeInTheDocument()
  })

  // Senior Review 2026-08-11 (Batch 15) — el botón se renderizaba sin gate de rol, a diferencia
  // del mismo botón en TicketsPage.tsx (REQ-245 RN4: técnico interno/garantías no pueden crear).
  it('REQ-245 RN4 — un técnico interno NO ve el botón "+ Nuevo ticket"', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    renderPage()

    await waitFor(() => expect(screen.getByText('Rutas del día')).toBeInTheDocument())
    expect(screen.queryByText('Nuevo ticket')).not.toBeInTheDocument()
  })

  it('REQ-211 — indicadores del mes renderiza meta/progreso e "ingresos" como stub cuando no está disponible', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      indicadores_mes: {
        instalaciones: { completadas: 34, meta: 35, meta_source: 'calculated', progreso_pct: 97.1 },
        resuelto_primera_visita_pct: 70,
        tiempo_promedio_resolucion_dias: 3.5,
        ingresos_instalaciones: { value: null, available: false },
      },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('34 / 35')).toBeInTheDocument())
    expect(screen.getByText('70%')).toBeInTheDocument()
    // Nunca $0 disfrazado de dato real cuando ingresos_instalaciones.available === false.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // REQ-211 RN2a(c) — resolución del CRÍTICO de Batch 15 (2026-08-12): control de UI para que
  // Gerencia sobrescriba la meta del mes, antes ausente pese a que el backend ya lo soportaba.
  it('REQ-211 RN2a(c) — management ve el ícono de editar meta y puede guardar un valor nuevo', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'management' }) })
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      indicadores_mes: {
        instalaciones: { completadas: 34, meta: 35, meta_source: 'calculated', progreso_pct: 97.1 },
        resuelto_primera_visita_pct: 70,
        tiempo_promedio_resolucion_dias: 3.5,
        ingresos_instalaciones: { value: 1500, available: true },
      },
    }))
    mockedApi.home.updateInstallationGoal.mockResolvedValue({ value: 40, source: 'manual_override' })
    renderPage()

    await waitFor(() => expect(screen.getByText('34 / 35')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Ajustar meta de instalaciones'))

    const input = await screen.findByLabelText('Meta de instalaciones del mes')
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => expect(mockedApi.home.updateInstallationGoal).toHaveBeenCalledWith(
      expect.objectContaining({ value: 40 }),
    ))
  })

  it('REQ-211 RN2a(c) — un rol sin superadmin/management NO ve el ícono de editar meta', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      indicadores_mes: {
        instalaciones: { completadas: 34, meta: 35, meta_source: 'calculated', progreso_pct: 97.1 },
        resuelto_primera_visita_pct: 70,
        tiempo_promedio_resolucion_dias: 3.5,
        ingresos_instalaciones: { value: 1500, available: true },
      },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('34 / 35')).toBeInTheDocument())
    expect(screen.queryByTitle('Ajustar meta de instalaciones')).not.toBeInTheDocument()
  })

  // REQ-212 (Grupo C, SCRUM-275) — panel "Servicios sin responder".
  it('REQ-212 RN4 — el badge de Servicios sin responder muestra el conteo real del backend', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      sin_responder: {
        count: 1,
        items: [
          { ticket_id: 20, numero: 'GAR-2026-0020', cliente: 'Torre Azul', descripcion: 'Luces parpadean', tipo: 'warranty', tipo_label: 'Garantía', dias: 3 },
        ],
      },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Torre Azul')).toBeInTheDocument())
    expect(screen.getByText('Luces parpadean')).toBeInTheDocument()
    expect(screen.getByText('Garantía')).toBeInTheDocument()
  })

  // REQ-213 (Grupo C, SCRUM-276) — panel "Insumos y herramientas pendientes".
  it('REQ-213 RN2 — llegada_estimada null muestra "Por confirmar", nunca una fecha inventada', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      insumos_pendientes: {
        count: 1,
        items: [{
          ticket_id: 30, numero: 'INS-2026-0030', cliente: 'Grupo Delta',
          producto: { marca: 'Philips', referencia: 'LED-100', descripcion: null },
          solicitado_hace_dias: 5, llegada_estimada: null,
        }],
      },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('Philips · LED-100')).toBeInTheDocument())
    expect(screen.getByText('home.insumosPendientes.llegadaPorConfirmar')).toBeInTheDocument()
  })

  // REQ-214 RN3/RN4 (Grupo C, SCRUM-277) — "Ver ticket" desde Insumos pendientes abre
  // TicketDetailModal en modo de solo lectura (sin Editar/Cancelar).
  it('REQ-214 — "Ver ticket" en Insumos pendientes abre el detalle de solo lectura', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      insumos_pendientes: {
        count: 1,
        items: [{
          ticket_id: 30, numero: 'INS-2026-0030', cliente: 'Grupo Delta',
          producto: { marca: 'Philips', referencia: 'LED-100', descripcion: null },
          solicitado_hace_dias: 5, llegada_estimada: null,
        }],
      },
    }))
    mockedApi.tickets.get.mockResolvedValue(makeTicketDetail())
    renderPage()

    await waitFor(() => expect(screen.getByText('home.insumosPendientes.viewTicket')).toBeInTheDocument())
    fireEvent.click(screen.getByText('home.insumosPendientes.viewTicket'))

    await waitFor(() => expect(mockedApi.tickets.get).toHaveBeenCalledWith(30))
    expect(screen.queryByText('tickets.detail.edit')).not.toBeInTheDocument()
  })

  // REQ-215 (Grupo C, SCRUM-278) — panel "Estado de tickets", 6 tarjetas (incluye Cancelado).
  it('REQ-215 — Estado de tickets muestra las 6 etapas, incluido Cancelado', async () => {
    mockedApi.home.estadoTickets.mockResolvedValue({
      counts: { reported: 2, scheduled: 1, on_site: 0, resolved: 3, closed: 5, cancelled: 1 },
      tipo: null,
    })
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    renderPage()

    await waitFor(() => expect(screen.getByText('tickets.statuses.cancelled')).toBeInTheDocument())
    expect(screen.getByText('tickets.statuses.reported')).toBeInTheDocument()
    // "Cerrado" es la ÚNICA tarjeta con sub-etiqueta de período ("este mes") — su texto va
    // partido en 2 nodos dentro del mismo span, por eso el matcher es un regex (substring), no
    // el string exacto que sí alcanza para las otras 5 tarjetas.
    expect(screen.getByText(/tickets\.statuses\.closed/)).toBeInTheDocument()
    expect(screen.getByText(/home\.estadoTickets\.closedThisMonth/)).toBeInTheDocument()
  })

  it('REQ-215 — cambiar el chip de tipo re-consulta el endpoint de estado-tickets con ese tipo', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary())
    renderPage()

    await waitFor(() => expect(mockedApi.home.estadoTickets).toHaveBeenCalledWith(''))
    fireEvent.click(screen.getByText('home.estadoTickets.chips.installation'))

    await waitFor(() => expect(mockedApi.home.estadoTickets).toHaveBeenCalledWith('installation'))
  })
})
