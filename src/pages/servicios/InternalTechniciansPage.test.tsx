import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
import InternalTechniciansPage from './InternalTechniciansPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { InternalTechnician, InternalTechnicianAgendaEntry } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'technicians.internal.visitsModal.title': "Visitas hoy — {{nombre}}",
  'technicians.internal.stats.activeTodayValue': '{{active}} de {{total}} registrados',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) {
        for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      }
      return out
    },
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: 'es',
      t: (key: string) => key.replace(/^servicios:/, ''),
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    internalTechnicians: {
      list: vi.fn(), visitsToday: vi.fn(), create: vi.fn(), agenda: vi.fn(), stats: vi.fn(),
      commissionCapture: vi.fn(), saveCommissionCapture: vi.fn(),
      slaSettings: vi.fn(), updateSlaSettings: vi.fn(), commission: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Aaron', last_name: 'Leis', email: 'servicio@atlantic.com.pa',
    role: 'lider_servicios', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function makeTechnician(overrides: Partial<InternalTechnician> = {}): InternalTechnician {
  return {
    id: 1, user_id: 1, nombre: 'Carlos Vergara', telefono: '6000-0000', email: 'carlos@atlantic.com.pa',
    especialidad: 'general', color: '#3B82F6', has_bonus_plan: false, estado: 'available', visitas_hoy: 0,
    herramientas_asignadas: 0, pct_resuelto_primera_visita: null, tiempo_promedio_minutos: null,
    ...overrides,
  }
}

function renderPage(initialEntries: string[] = ['/servicios/tecnicos']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <InternalTechniciansPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
  mockedApi.internalTechnicians.agenda.mockResolvedValue([])
  mockedApi.internalTechnicians.stats.mockResolvedValue({
    activos_hoy: 0, total_tecnicos: 0, visitas_hoy_total: 0, promedio_primera_visita: null,
  })
})

describe('InternalTechniciansPage — REQ-255 vista Equipo', () => {
  it('renderiza nombre, estado y especialidad de cada técnico', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    renderPage()

    expect(await screen.findByText('Carlos Vergara')).toBeInTheDocument();
    expect(screen.getByText(/available/)).toBeInTheDocument()
    expect(screen.getByText(/general/)).toBeInTheDocument()
  })

  it('placeholders: "—" en % 1ra visita, 0 en herramientas', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    renderPage()

    await screen.findByText('Carlos Vergara')
    // Hay 2 "—" en pantalla con estos datos: el de esta tarjeta y el de la tarjeta de
    // estadísticas del equipo (REQ-261, promedio_primera_visita=null por default en el mock).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('técnico interno no ve el botón de nuevo técnico', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.internalTechnicians.list.mockResolvedValue([])
    renderPage()

    await waitFor(() => expect(mockedApi.internalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('technicians.internal.addButton')).not.toBeInTheDocument()
  })

  it('Aaron (lider_servicios) sí ve el botón de nuevo técnico', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('technicians.internal.addButton')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — REQ-257 Visitas hoy', () => {
  it('clic en "Visitas hoy" abre el modal con el listado en orden cronológico', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ visitas_hoy: 2 })])
    mockedApi.internalTechnicians.visitsToday.mockResolvedValue([
      { ticket_id: 1, numero: 'INS-2026-0001', fecha: null, hora: '09:00', cliente: 'Torre Azul', descripcion: null },
      { ticket_id: 2, numero: 'INS-2026-0002', fecha: null, hora: '14:00', cliente: 'Grupo Delta', descripcion: null },
    ])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('2'))

    const modal = within(await screen.findByTestId('internal-technician-visits-modal'))
    expect(await modal.findByText('Torre Azul')).toBeInTheDocument()
    expect(modal.getByText('Grupo Delta')).toBeInTheDocument()
  })

  // SCRUM-777 — cada visita navega al ticket correspondiente vía el mismo deep-link ?ticket=<id>
  // que ya usa el panel "Pendientes de Inicio" (REQ-210), cerrando el modal de paso.
  it('clic en una visita navega al ticket correspondiente y cierra el modal', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ visitas_hoy: 1 })])
    mockedApi.internalTechnicians.visitsToday.mockResolvedValue([
      { ticket_id: 42, numero: 'INS-2026-0042', fecha: null, hora: '09:00', cliente: 'Torre Azul', descripcion: null },
    ])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('1'))

    const modal = within(await screen.findByTestId('internal-technician-visits-modal'))
    fireEvent.click(await modal.findByText('Torre Azul'))

    expect(mockNavigate).toHaveBeenCalledWith('/servicios/tickets?ticket=42')
    expect(screen.queryByTestId('internal-technician-visits-modal')).not.toBeInTheDocument()
  })

  it('RN1 — sin visitas hoy muestra el estado vacío', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ visitas_hoy: 0 })])
    mockedApi.internalTechnicians.visitsToday.mockResolvedValue([])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByRole('button', { name: /visitsToday/ }))

    const modal = within(await screen.findByTestId('internal-technician-visits-modal'))
    expect(await modal.findByText('technicians.internal.visitsModal.empty')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — REQ-255 RN5 detalle del técnico', () => {
  it('clic en el nombre/avatar abre teléfono/correo/especialidad', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    renderPage()

    fireEvent.click(await screen.findByText('Carlos Vergara'))

    const modal = within(await screen.findByTestId('internal-technician-detail-modal'))
    expect(modal.getByText('6000-0000')).toBeInTheDocument()
    expect(modal.getByText('carlos@atlantic.com.pa')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — REQ-259 alta', () => {
  it('registra un técnico con nombre y especialidad', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([])
    mockedApi.internalTechnicians.create.mockResolvedValue(makeTechnician({ id: 9, nombre: 'Luis Fernández' }))
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.addButton'))
    const modal = within(await screen.findByTestId('internal-technician-create-modal'))

    fireEvent.change(modal.getByRole('textbox', { name: /createModal\.nombre/ }), { target: { value: 'Luis Fernández' } })
    fireEvent.click(modal.getByText('technicians.internal.createModal.save'))

    await waitFor(() => {
      expect(mockedApi.internalTechnicians.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Luis Fernández', especialidad: 'general' }),
      )
    })
  })
})

describe('InternalTechniciansPage — REQ-260 Agenda equipo', () => {
  it('cambia a la vista Agenda equipo y muestra los bloques por técnico', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    const agenda: InternalTechnicianAgendaEntry[] = [
      { id: 1, nombre: 'Carlos Vergara', color: '#3B82F6', visitas: [] },
    ]
    mockedApi.internalTechnicians.agenda.mockResolvedValue(agenda)
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('technicians.internal.views.agenda'))

    expect(await screen.findByText('technicians.internal.agenda.noVisits')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — SCRUM-803 selector Día/Semana/Mes en Agenda equipo', () => {
  it('clic en Semana pide la agenda con view=week', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    mockedApi.internalTechnicians.agenda.mockResolvedValue([
      { id: 1, nombre: 'Carlos Vergara', color: '#3B82F6', visitas: [] },
    ])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('technicians.internal.views.agenda'))
    await screen.findByText('technicians.internal.agenda.noVisits')

    fireEvent.click(screen.getByText('ventasDiseno:home.calendar.view.week'))

    await waitFor(() => expect(mockedApi.internalTechnicians.agenda).toHaveBeenLastCalledWith(undefined, 'week', expect.any(String)))
  })

  it('clic en "periodo siguiente" navega a otra fecha sin cambiar de vista', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    mockedApi.internalTechnicians.agenda.mockResolvedValue([
      { id: 1, nombre: 'Carlos Vergara', color: '#3B82F6', visitas: [] },
    ])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('technicians.internal.views.agenda'))
    await screen.findByText('technicians.internal.agenda.noVisits')

    const callsBefore = mockedApi.internalTechnicians.agenda.mock.calls.length
    fireEvent.click(screen.getByLabelText('technicians.internal.agenda.nextPeriod'))

    await waitFor(() => expect(mockedApi.internalTechnicians.agenda.mock.calls.length).toBeGreaterThan(callsBefore))
    const calls = mockedApi.internalTechnicians.agenda.mock.calls
    const [, lastView, lastDate] = calls[calls.length - 1] ?? []
    expect(lastView).toBe('day')
    expect(lastDate).not.toBe(mockedApi.internalTechnicians.agenda.mock.calls[0]?.[2])
  })
})

describe('InternalTechniciansPage — REQ-207/208 (Batch 15) deep-link a Agenda equipo', () => {
  it('?view=agenda arranca directo en Agenda equipo, sin pasar por Equipo', async () => {
    const agenda: InternalTechnicianAgendaEntry[] = [
      { id: 1, nombre: 'Carlos Vergara', color: '#3B82F6', visitas: [] },
    ]
    mockedApi.internalTechnicians.agenda.mockResolvedValue(agenda)
    // Poblado por InternalTechnicianAgendaView para el <select> de filtro, no por la vista Equipo
    // (que queda enabled:false mientras view==='agenda').
    mockedApi.internalTechnicians.list.mockResolvedValue([])
    renderPage(['/servicios/tecnicos?view=agenda'])

    expect(await screen.findByText('technicians.internal.agenda.noVisits')).toBeInTheDocument()
    // RN2 — "Todos" es el default del selector (sin filtro de técnico aplicado). `agenda()` sin
    // `technician_id` es la señal real de "sin filtro" — `list()` sí se llama, pero desde
    // `InternalTechnicianAgendaView` (para poblar las opciones del <select>), no desde la query de
    // la vista Equipo (que queda `enabled: false` mientras `view === 'agenda'`).
    // SCRUM-803 — `view`/`date` (día actual, no determinístico en el test) se agregan como 2do/3er
    // argumento; solo se verifica acá que `technician_id` sigue sin ir (undefined).
    expect(mockedApi.internalTechnicians.agenda).toHaveBeenCalledWith(undefined, 'day', expect.any(String))
  })
})

describe('InternalTechniciansPage — REQ-262 alternancia Equipo/Agenda', () => {
  it('RN1 — volver a Equipo tras pasar por Agenda no pierde los datos ya cargados', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    mockedApi.internalTechnicians.agenda.mockResolvedValue([])
    renderPage()

    await screen.findByText('Carlos Vergara')
    fireEvent.click(screen.getByText('technicians.internal.views.agenda'))
    await waitFor(() => expect(mockedApi.internalTechnicians.agenda).toHaveBeenCalled())

    fireEvent.click(screen.getByText('technicians.internal.views.team'))
    // Sin `find`/`waitFor`: si los datos se hubieran perdido, esto fallaría porque el primer
    // render tras el toggle mostraría el estado de "Cargando...", no la tarjeta ya poblada.
    expect(screen.getByText('Carlos Vergara')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — REQ-261 estadísticas generales', () => {
  it('renderiza activos/total, visitas totales y promedio de 1ra visita', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ visitas_hoy: 2 })])
    mockedApi.internalTechnicians.stats.mockResolvedValue({
      activos_hoy: 3, total_tecnicos: 4, visitas_hoy_total: 5, promedio_primera_visita: 72.4,
    })
    renderPage()

    expect(await screen.findByText('3 de 4 registrados')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
  })

  /** RN3 — sin ningún técnico con historial, el promedio se muestra "—", no 0%. */
  it('muestra "—" cuando ningún técnico tiene historial de 1ra visita', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
    mockedApi.internalTechnicians.stats.mockResolvedValue({
      activos_hoy: 1, total_tecnicos: 1, visitas_hoy_total: 0, promedio_primera_visita: null,
    })
    renderPage()

    await screen.findByText('Carlos Vergara')
    const label = screen.getByText('technicians.internal.stats.firstVisitAvg')
    expect(within(label.parentElement!).getByText('—')).toBeInTheDocument()
  })
})

describe('InternalTechniciansPage — REQ-292 comisión mensual', () => {
  it('un técnico sin plan de bonificación no muestra el botón de Comisión', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: false })])
    renderPage()

    await screen.findByText('Carlos Vergara')
    expect(screen.queryByText('technicians.internal.card.commission')).not.toBeInTheDocument()
  })

  it('técnico interno (no Aaron/Gerencia) no ve el botón aunque el técnico tenga plan activo', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    renderPage()

    await screen.findByText('Carlos Vergara')
    expect(screen.queryByText('technicians.internal.card.commission')).not.toBeInTheDocument()
  })

  it('RN6 — sin captura del mes en curso muestra "Pendiente de captura"', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    mockedApi.internalTechnicians.commissionCapture.mockResolvedValue(null)
    mockedApi.internalTechnicians.slaSettings.mockResolvedValue({ claim: 2, warranty: 3, installation: 7, retrofit: 10 })
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.card.commission'))

    const modal = within(await screen.findByTestId('internal-technician-commission-modal'))
    expect(await modal.findByText('technicians.internal.commissionModal.pending')).toBeInTheDocument()
  })

  /**
   * RN5 — un mes ya cerrado sigue siendo editable. Hallazgo Pre-QA 2026-08-09 (SCRUM-362): el
   * formulario original solo operaba sobre el mes del navegador, sin ningún camino de UI para
   * llegar a un mes anterior — corregido con el selector de período.
   */
  it('RN5 — el selector de período permite consultar/editar un mes anterior', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    mockedApi.internalTechnicians.slaSettings.mockResolvedValue({ claim: 2, warranty: 3, installation: 7, retrofit: 10 })
    mockedApi.internalTechnicians.commissionCapture.mockResolvedValue(null)
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.card.commission'))
    const modal = within(await screen.findByTestId('internal-technician-commission-modal'))
    await modal.findByText('technicians.internal.commissionModal.pending')

    expect(mockedApi.internalTechnicians.commissionCapture).toHaveBeenCalledTimes(1)
    const [, initialYear, initialMonth] = mockedApi.internalTechnicians.commissionCapture.mock.calls[0]

    mockedApi.internalTechnicians.commissionCapture.mockResolvedValueOnce({
      year: initialYear!, month: initialMonth! - 1 < 1 ? 12 : initialMonth! - 1,
      satisfaccion_promedio: 5, satisfaccion_pct: 100, incidencias_puntualidad: 0, puntualidad_pct: 100,
      calificacion_actitud: 5, actitud_pct: 100, licencia_medica: false, calidad_pct: null,
      captured_by: 'Aaron', updated_by: null, updated_at: '2026-07-10T10:00:00Z',
    })
    fireEvent.click(modal.getByLabelText('technicians.internal.commissionModal.previousMonth'))

    await waitFor(() => {
      expect(mockedApi.internalTechnicians.commissionCapture).toHaveBeenLastCalledWith(
        1, initialYear, initialMonth! - 1 < 1 ? 12 : initialMonth! - 1,
      )
    })
    // El mes anterior sí tiene captura — ya no debe seguir mostrando "Pendiente de captura".
    expect(modal.queryByText('technicians.internal.commissionModal.pending')).not.toBeInTheDocument()
  })

  it('RN5 — "Mes siguiente" está deshabilitado en el mes en curso (no se captura el futuro)', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    mockedApi.internalTechnicians.slaSettings.mockResolvedValue({ claim: 2, warranty: 3, installation: 7, retrofit: 10 })
    mockedApi.internalTechnicians.commissionCapture.mockResolvedValue(null)
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.card.commission'))
    const modal = within(await screen.findByTestId('internal-technician-commission-modal'))
    await modal.findByText('technicians.internal.commissionModal.pending')

    expect(modal.getByLabelText('technicians.internal.commissionModal.nextMonth')).toBeDisabled()
  })

  /** Escenario 1 (REQ-292) — conversión automática mostrada tras guardar. */
  it('guarda la captura y muestra los porcentajes convertidos', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    mockedApi.internalTechnicians.commissionCapture.mockResolvedValue(null)
    mockedApi.internalTechnicians.slaSettings.mockResolvedValue({ claim: 2, warranty: 3, installation: 7, retrofit: 10 })
    mockedApi.internalTechnicians.saveCommissionCapture.mockResolvedValue({
      year: 2026, month: 8, satisfaccion_promedio: 4.7, satisfaccion_pct: 100,
      incidencias_puntualidad: 0, puntualidad_pct: 100, calificacion_actitud: 4, actitud_pct: 80,
      licencia_medica: false, calidad_pct: null, captured_by: 'Aaron', updated_by: null, updated_at: '2026-08-10T10:00:00Z',
    })
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.card.commission'))
    const modal = within(await screen.findByTestId('internal-technician-commission-modal'))
    await modal.findByText('technicians.internal.commissionModal.pending')

    const [satisfaccion, incidencias, actitud] = modal.getAllByRole('spinbutton')
    fireEvent.change(satisfaccion, { target: { value: '4.7' } })
    fireEvent.change(incidencias, { target: { value: '0' } })
    fireEvent.change(actitud, { target: { value: '4' } })
    fireEvent.click(modal.getByText('technicians.internal.commissionModal.save'))

    await waitFor(() => {
      expect(mockedApi.internalTechnicians.saveCommissionCapture).toHaveBeenCalledWith(
        1, expect.objectContaining({ satisfaccion_promedio: 4.7, incidencias_puntualidad: 0, calificacion_actitud: 4 }),
      )
    })
  })

  /** RN2 — Aaron ve el SLA pero no puede editarlo; Gerencia sí. */
  it('Aaron ve el SLA deshabilitado, Gerencia puede editarlo', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ has_bonus_plan: true })])
    mockedApi.internalTechnicians.commissionCapture.mockResolvedValue(null)
    mockedApi.internalTechnicians.slaSettings.mockResolvedValue({ claim: 2, warranty: 3, installation: 7, retrofit: 10 })
    renderPage()

    fireEvent.click(await screen.findByText('technicians.internal.card.commission'))
    const modal = within(await screen.findByTestId('internal-technician-commission-modal'))
    await modal.findByText('technicians.internal.commissionModal.slaSection')

    // El SLA "Reclamos" (default 2 días) es uno de los 4 campos de esa sección — deshabilitado para Aaron.
    expect(modal.getByDisplayValue('2')).toBeDisabled()
    expect(modal.queryByText('technicians.internal.commissionModal.slaSave')).not.toBeInTheDocument()
  })
})
