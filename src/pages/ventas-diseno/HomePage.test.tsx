import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import VentasDisenoHomePage from './HomePage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { HomeSummary, PipelineCard, Vendor } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: { list: vi.fn(), get: vi.fn(), update: vi.fn(), changeStage: vi.fn(), uploadFile: vi.fn(), contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() } },
    home: { vendors: vi.fn(), summary: vi.fn() },
    calendar: { list: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeSummary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    final_stage: [],
    pendientes: [],
    events_today_count: 0,
    performance: { goal_amount: null, current_amount: 0, progress_percent: null, commission_amount: 0 },
    ...overrides,
  }
}

function makeCard(overrides: Partial<PipelineCard> = {}): PipelineCard {
  return {
    id: 1, stage: 'lead',
    sales_project: { id: 1, name: 'Proyecto Alfa', tag: null },
    master_client: { id: 1, name: 'Grupo Delta' },
    sub_client: { id: 1, business_name: 'Delta Residencial' },
    owner: { id: 1, name: 'Ana Diaz' },
    assignees: [{ id: 1, name: 'Ana Diaz' }],
    amount: null, worked_area_m2: null, days_in_stage: 2, is_stagnant: false,
    stage_changed_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function ReportsProbe() {
  const location = useLocation()
  return <div>REPORTS_PROBE {location.hash}</div>
}

function PipelineProbe() {
  const location = useLocation()
  return <div>PIPELINE_PROBE {location.search}</div>
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoHomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.home.summary.mockResolvedValue(makeSummary())
  mockedApi.home.vendors.mockResolvedValue([])
  mockedApi.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
  mockedApi.pipeline.list.mockResolvedValue([])
  mockedStore.mockReturnValue({ user: { id: 1, role: 'designer', first_name: 'Ana', last_name: 'Diaz' } } as never)
})

describe('VentasDisenoHomePage', () => {
  it('muestra el saludo personalizado con solo el primer nombre del usuario (SCRUM-835/SCRUM-863)', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:home.greeting:Ana')).toBeInTheDocument()
  })

  it('rebote QA (Gerencia, 2026-09-14) — recorta a la primera palabra cuando first_name trae un nombre compuesto', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'designer', first_name: 'Ana Maria', last_name: 'Diaz' } } as never)
    renderPage()
    expect(await screen.findByText('ventasDiseno:home.greeting:Ana')).toBeInTheDocument()
  })

  it('muestra el monto acumulado por etapa en el Pipeline (SCRUM-834)', async () => {
    mockedApi.pipeline.list.mockResolvedValue([
      makeCard({ id: 1, stage: 'lead', amount: 120000 }),
      makeCard({ id: 2, stage: 'lead', amount: 90000 }),
      makeCard({ id: 3, stage: 'design', amount: null }),
    ])
    renderPage()

    // Etapas sin proyectos (o con amount null) muestran $0 — varias etapas vacías coinciden con
    // el mismo texto, por eso se cuenta en vez de exigir una sola coincidencia.
    expect(await screen.findByText('$210,000')).toBeInTheDocument()
    expect((await screen.findAllByText('$0')).length).toBeGreaterThan(0)
  })

  it('el botón Catálogo navega a la pantalla de Catálogo (SCRUM-741)', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:clients.actions.catalog')
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('muestra la tarjeta Mi desempeño', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:home.performance.title')).toBeInTheDocument()
  })

  it('no muestra el selector Equipo/vendedor para un Diseñador', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.home.summary).toHaveBeenCalled())
    expect(screen.queryByText('ventasDiseno:scope.team')).not.toBeInTheDocument()
  })

  it('muestra el selector Equipo/vendedor para Gerencia', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    const vendors: Vendor[] = [{ id: 2, name: 'Vendedor Demo' }]
    mockedApi.home.vendors.mockResolvedValue(vendors)

    renderPage()
    expect(await screen.findByText('ventasDiseno:scope.team')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:scope.team'))
    expect(await screen.findByText('Vendedor Demo')).toBeInTheDocument()
  })

  it('lista pendientes y abre el detalle al hacer clic', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: [{
        type: 'no_contact', priority: 'high', card_id: 1, client: 'Constructora del Istmo',
        project: 'Proyecto Alfa', assignee: 'Ana Diaz', days: 20, suggestion: 'Priorizar el contacto.',
      }],
    }))
    renderPage()

    const item = await screen.findByText(/home\.pendientes\.text\.no_contact/)
    fireEvent.click(item)

    expect(await screen.findByText('ventasDiseno:home.pendientes.detailTitle')).toBeInTheDocument()
    expect(screen.getByText('Priorizar el contacto.')).toBeInTheDocument()
  })

  it('SCRUM-67/SCRUM-871 — "Ver más" abre el listado completo con drill-down al detalle', async () => {
    const pendientes = Array.from({ length: 7 }, (_, i) => ({
      type: 'no_contact' as const, priority: 'medium' as const, card_id: i + 1,
      client: `Cliente ${i + 1}`, project: `Proyecto ${i + 1}`, assignee: 'Ana Diaz',
      days: 10 + i, suggestion: `Sugerencia ${i + 1}`,
    }))
    mockedApi.home.summary.mockResolvedValue(makeSummary({ pendientes }))
    renderPage()

    // Máx. 5 visibles en la tarjeta (SCRUM-871), badge muestra el total real (7).
    expect(await screen.findAllByText(/home\.pendientes\.text\.no_contact/)).toHaveLength(5)

    fireEvent.click(screen.getByText('common:actions.viewMore'))

    const listTitle = await screen.findByText('ventasDiseno:home.pendientes.listTitle')
    const listModal = listTitle.closest('[class*="max-w-md"]') as HTMLElement
    // El listado completo muestra los 7 (la tarjeta de fondo sigue en el DOM con sus 5, por eso
    // se acota la búsqueda al modal).
    expect(within(listModal).getAllByText(/home\.pendientes\.text\.no_contact/)).toHaveLength(7)

    // Drill-down: clic en un item del listado abre el detalle individual y cierra el listado.
    fireEvent.click(within(listModal).getAllByText(/home\.pendientes\.text\.no_contact/)[6])
    expect(await screen.findByText('ventasDiseno:home.pendientes.detailTitle')).toBeInTheDocument()
    expect(screen.getByText('Sugerencia 7')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:home.pendientes.listTitle')).not.toBeInTheDocument()
  })

  it('lista Final Stage y abre el detalle con etapa/días/valor (SCRUM-68)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      final_stage: [{
        id: 1, project_name: 'Proyecto Alfa', client_name: 'Grupo Delta', notes: 'Falta firma',
        days_in_stage: 3, amount: 4275.5,
      }],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('Proyecto Alfa'))
    expect(await screen.findByText('Falta firma')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:home.finalStage.nextStep:3')).toBeInTheDocument()
    expect(screen.getByText('$4,275.5')).toBeInTheDocument()
  })

  it('SCRUM-871 — Final Stage con más de 5 muestra badge, cap y "Ver más"', async () => {
    const finalStage = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, project_name: `Proyecto ${i + 1}`, client_name: `Cliente ${i + 1}`,
      notes: null, days_in_stage: 1, amount: null,
    }))
    mockedApi.home.summary.mockResolvedValue(makeSummary({ final_stage: finalStage }))
    renderPage()

    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(screen.getAllByText(/Proyecto \d/)).toHaveLength(5)

    fireEvent.click(screen.getByText('common:actions.viewMore'))
    expect(screen.getAllByText(/Proyecto \d/)).toHaveLength(5 + 6)
  })

  // SCRUM-765 — desde el detalle de Final Stage, el botón "Ver" lleva al Pipeline con el
  // mismo deep-link `?card=<id>` que ya usan Lista de Proyectos y el propio Pipeline.
  it('SCRUM-765 — el botón "Ver" del detalle de Final Stage navega a Pipeline con ?card=<id>', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      final_stage: [{
        id: 42, project_name: 'Proyecto Alfa', client_name: 'Grupo Delta', notes: 'Falta firma',
        days_in_stage: 3, amount: 4275.5,
      }],
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/ventas-diseno/home']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/ventas-diseno/home" element={<VentasDisenoHomePage />} />
            <Route path="/ventas-diseno/pipeline" element={<PipelineProbe />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('Proyecto Alfa'))
    fireEvent.click(await screen.findByText('common:actions.view'))

    expect(await screen.findByText('PIPELINE_PROBE ?card=42')).toBeInTheDocument()
  })

  // SCRUM-796 (secc. 2) — mismo mecanismo que el botón "Ver" de Final Stage, ahora en el
  // detalle de un Pendiente: "Ir" navega directo al proyecto en Pipeline con su card_id.
  it('SCRUM-796 — el botón "Ir" del detalle de un pendiente navega a Pipeline con ?card=<card_id>', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: [{
        type: 'missing_architect', priority: 'high', card_id: 77, client: 'Constructora del Istmo',
        project: 'Proyecto Alfa', assignee: 'Ana Diaz', days: 5, suggestion: 'Solicitar el contacto del arquitecto.',
      }],
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/ventas-diseno/home']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/ventas-diseno/home" element={<VentasDisenoHomePage />} />
            <Route path="/ventas-diseno/pipeline" element={<PipelineProbe />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText(/home\.pendientes\.text\.missing_architect/))
    fireEvent.click(await screen.findByText('ventasDiseno:home.pendientes.go'))

    expect(await screen.findByText('PIPELINE_PROBE ?card=77')).toBeInTheDocument()
  })

  it('Mi desempeño muestra meta, avance y comisión reales', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: 10000, current_amount: 4000, progress_percent: 40, commission_amount: 80 },
    }))
    renderPage()

    expect(await screen.findByText('$80')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '$4,000 / $10,000')).toBeInTheDocument()
  })

  it('sin meta configurada muestra el aviso en vez de un $0 fijo', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: null, current_amount: 0, progress_percent: null, commission_amount: 0 },
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:home.performance.noGoal')).toBeInTheDocument()
  })

  it('sin meta configurada el label dice "Avance", no "Meta" (SCRUM-65)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: null, current_amount: 500, progress_percent: null, commission_amount: 0 },
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:home.performance.progress')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:home.performance.goal')).not.toBeInTheDocument()
  })

  it('con meta configurada el label sigue diciendo "Meta del período"', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: 10000, current_amount: 4000, progress_percent: 40, commission_amount: 80 },
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:home.performance.goal')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:home.performance.progress')).not.toBeInTheDocument()
  })

  it('el ícono de ojo de comisiones navega sin errores', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: 10000, current_amount: 4000, progress_percent: 40, commission_amount: 80 },
    }))
    renderPage()

    fireEvent.click(await screen.findByTitle('ventasDiseno:home.performance.viewCommissions'))
  })

  it('el ícono de ojo de comisiones navega al detalle real de Admin&Cont (SCRUM-712)', async () => {
    // SCRUM-712 (2026-09-01): antes navegaba a /ventas-diseno/reports#commissions (panel
    // embebido, solo resumen) — ahora apunta a Comisiones Internas de Admin&Contab, que ya
    // filtra por vendedor salvo Gerencia (view_team). El panel viejo de Reportes se deja intacto
    // (decisión explícita de Luis), esto solo cambia a dónde navega el ícono de ojo.
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      performance: { goal_amount: 10000, current_amount: 4000, progress_percent: 40, commission_amount: 80 },
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/ventas-diseno/home']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/ventas-diseno/home" element={<VentasDisenoHomePage />} />
            <Route path="/admin-contab/comisiones/internas" element={<ReportsProbe />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByTitle('ventasDiseno:home.performance.viewCommissions'))
    expect(await screen.findByText('REPORTS_PROBE')).toBeInTheDocument()
  })

  it('el resumen de Pipeline cuenta las tarjetas por etapa', async () => {
    mockedApi.pipeline.list.mockResolvedValue([makeCard({ stage: 'design' }), makeCard({ id: 2, stage: 'design' })])
    renderPage()

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalled())
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('el subtítulo refleja reuniones y pendientes del resumen', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      events_today_count: 3,
      pendientes: [
        { type: 'missing_architect', priority: 'medium', card_id: 1, client: 'A', project: 'P1', assignee: 'X', days: 1, suggestion: 's' },
      ],
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:home.subtitle:3,1')).toBeInTheDocument()
  })
})
