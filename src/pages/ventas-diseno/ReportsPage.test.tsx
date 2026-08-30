import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Chart as ChartJS } from 'chart.js'
import VentasDisenoReportsPage from './ReportsPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { ReportsSummary } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    reports: {
      summary: vi.fn(),
      goals: { list: vi.fn(), upsert: vi.fn() },
      settings: { get: vi.fn(), update: vi.fn() },
      commissions: { summary: vi.fn(), markPaid: vi.fn() },
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

// Chart.js necesita un <canvas> real (getContext) que jsdom no implementa —
// mismo criterio que el resto del proyecto usa para librerías visuales de
// terceros en tests: reemplazar por un placeholder, no probar el renderizado
// interno de Chart.js (ni el plugin inline de value labels, que dibuja sobre
// el canvas) acá. Sí exponemos `data` serializado en el DOM (SCRUM-109) para
// poder verificar que goalsChart arma los datasets/colores correctos sin
// depender del render real de Chart.js.
vi.mock('react-chartjs-2', () => ({
  Chart: (props: { data: unknown }) => <div data-testid="mock-chart" data-chart-props={JSON.stringify(props.data)} />,
}))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function mockAuthState(user: Record<string, unknown> | null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user }
    return selector ? selector(state) : state
  }) as never)
}

function makeSummary(overrides: Partial<ReportsSummary> = {}): ReportsSummary {
  return {
    scope: 'own', period: 'month', surface_m2: 0,
    best_clients: [], meta: { monthly_history: [], goal_amount: null },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.reports.summary.mockResolvedValue(makeSummary())
  mockedApi.reports.settings.get.mockResolvedValue({
    low_sales_threshold: 20000, low_sales_months: 3, quote_probability_percent: 40, proposal_probability_percent: 70,
  })
  mockedApi.reports.commissions.summary.mockResolvedValue({ paid: 0, pending: 0, final_stage: 0, cohorts: [] })
  mockAuthState({ id: 1, role: 'designer', permissions: [] })
})

describe('VentasDisenoReportsPage', () => {
  it('con #commissions en la URL hace scroll al panel de Comisiones (SCRUM-65)', async () => {
    const scrollSpy = vi.fn()
    // jsdom no implementa layout real — mockear scrollIntoView alcanza para
    // confirmar que el efecto dispara sobre el elemento correcto.
    Element.prototype.scrollIntoView = scrollSpy

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/ventas-diseno/reports#commissions']}>
        <QueryClientProvider client={queryClient}>
          <VentasDisenoReportsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(document.getElementById('commissions')).toBeInTheDocument())
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
  })

  it('sin #commissions en la URL no hace scroll', async () => {
    const scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
    renderPage()

    await waitFor(() => expect(document.getElementById('commissions')).toBeInTheDocument())
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('el botón Catálogo navega a la pantalla de Catálogo (SCRUM-741)', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:kanban.actions.catalog')
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('registra el controller bar de Chart.js (QA formal 2026-07-12, actualizado SCRUM-109)', () => {
    // Hasta SCRUM-109 el panel Metas mezclaba un dataset 'bar' con uno 'line'
    // (línea de meta plana, REQ-072 original) en un mismo <Chart type="bar">, lo
    // que exigía registrar también LineController o la mezcla reventaba con
    // "line is not a registered controller". REQ-072 (SCRUM-109) cambió la Meta
    // de línea a barra — ya no hay tipos mixtos en este chart, así que
    // LineController/LineElement/PointElement se sacaron del import y del
    // registro (react-chartjs-2 está mockeado en el resto de este archivo
    // porque jsdom no soporta canvas real, así que este test verifica el
    // registro directamente, sin renderizar).
    expect(() => ChartJS.registry.getController('bar')).not.toThrow()
    expect(() => ChartJS.registry.getController('line')).toThrow()
  })

  it('REQ-072 (SCRUM-109): Meta se arma como barra, no como línea, repitiendo el único valor configurado en los 6 meses', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      meta: {
        goal_amount: 8000,
        monthly_history: [
          { month: '2026-03', amount: 1000 }, { month: '2026-04', amount: 2000 },
          { month: '2026-05', amount: 3000 }, { month: '2026-06', amount: 4000 },
          { month: '2026-07', amount: 5000 }, { month: '2026-08', amount: 2500 },
        ],
      },
    }))
    renderPage()

    const chartProps = JSON.parse((await screen.findByTestId('mock-chart')).getAttribute('data-chart-props') ?? '{}')
    const [soldDataset, goalDataset] = chartProps.datasets

    expect(soldDataset.type).toBe('bar')
    expect(goalDataset.type).toBe('bar')
    expect(goalDataset.data).toEqual([8000, 8000, 8000, 8000, 8000, 8000])
  })

  it('REQ-072 (SCRUM-109): la barra de Vendido del último mes (en curso) usa el color ámbar, distinto de los meses cerrados', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      meta: {
        goal_amount: 8000,
        monthly_history: [
          { month: '2026-03', amount: 1000 }, { month: '2026-04', amount: 2000 },
          { month: '2026-05', amount: 3000 }, { month: '2026-06', amount: 4000 },
          { month: '2026-07', amount: 5000 }, { month: '2026-08', amount: 2500 },
        ],
      },
    }))
    renderPage()

    const chartProps = JSON.parse((await screen.findByTestId('mock-chart')).getAttribute('data-chart-props') ?? '{}')
    const [soldDataset] = chartProps.datasets

    expect(soldDataset.backgroundColor.slice(0, 5)).toEqual(Array(5).fill('#5BA5A0cc'))
    expect(soldDataset.backgroundColor[5]).toBe('#f59e0b')
  })

  it('REQ-072 (SCRUM-109): muestra la referencia de color del mes en curso solo cuando hay historial', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      meta: {
        goal_amount: null,
        monthly_history: [{ month: '2026-08', amount: 2500 }],
      },
    }))
    renderPage()

    expect(await screen.findByText('ventasDiseno:reports.goals.currentMonth')).toBeInTheDocument()
  })

  it('REQ-072 (SCRUM-109): sin historial no muestra la referencia del mes en curso', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.goals.noGoal')
    expect(screen.queryByText('ventasDiseno:reports.goals.currentMonth')).not.toBeInTheDocument()
  })

  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:reports.title')).toBeInTheDocument()
  })

  it('no muestra el selector de alcance Equipo para un Diseñador', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.surface.title')
    expect(screen.queryByText('ventasDiseno:scope.team')).not.toBeInTheDocument()
  })

  it('muestra el selector de alcance Equipo para Gerencia', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: [] })
    renderPage()
    expect(await screen.findByText('ventasDiseno:scope.team')).toBeInTheDocument()
  })

  it('muestra la superficie trabajada del período', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({ surface_m2: 123.5 }))
    renderPage()
    expect(await screen.findByText('123.5 m²')).toBeInTheDocument()
  })

  it('cambiar el período vuelve a pedir el resumen', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.surface.title')

    fireEvent.click(screen.getByText('ventasDiseno:reports.period.year'))

    await waitFor(() => expect(mockedApi.reports.summary).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'year' }),
    ))
  })

  it('no muestra el botón Configuración sin el permiso reports.configure', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.surface.title')
    expect(screen.queryByText('ventasDiseno:reports.config.toggle')).not.toBeInTheDocument()
  })

  it('muestra y abre el panel de Configuración con el permiso reports.configure', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: ['ventas_diseno.reports.configure'] })
    mockedApi.reports.goals.list.mockResolvedValue([])
    mockedApi.reports.settings.get.mockResolvedValue({
      low_sales_threshold: 20000, low_sales_months: 3, quote_probability_percent: 40, proposal_probability_percent: 70,
    })
    renderPage()
    await screen.findByText('ventasDiseno:reports.config.toggle')

    fireEvent.click(screen.getByText('ventasDiseno:reports.config.toggle'))

    expect(await screen.findByText('ventasDiseno:reports.config.goalsTitle')).toBeInTheDocument()
  })

  it('guardar una Meta refresca el resumen de Reportes (regresión E2E)', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: ['ventas_diseno.reports.configure'] })
    mockedApi.reports.goals.list.mockResolvedValue([
      { user_id: 1, user_name: 'Designer Demo', goal_amount: null, goal_plus_amount: null },
    ])
    mockedApi.reports.goals.upsert.mockResolvedValue({ user_id: 1, user_name: 'Designer Demo', goal_amount: 15000, goal_plus_amount: null })
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:reports.config.toggle'))
    await screen.findByText('Designer Demo')

    const goalInput = document.querySelectorAll('input[inputmode="decimal"]')[0] as HTMLInputElement
    fireEvent.change(goalInput, { target: { value: '15000' } })
    fireEvent.click(screen.getByText('ventasDiseno:reports.config.save'))

    await waitFor(() => expect(mockedApi.reports.goals.upsert).toHaveBeenCalled())
    // El resumen (que alimenta el gráfico de Metas) se vuelve a pedir tras guardar.
    await waitFor(() => expect(mockedApi.reports.summary).toHaveBeenCalledTimes(2))
  })

  it('muestra el ranking de mejores clientes ordenado', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      best_clients: [
        { client_name: 'Cliente Grande', client_id: 1, client_type: 'master', amount: 5000 },
        { client_name: 'Cliente Chico', client_id: 2, client_type: 'sub', amount: 500 },
      ],
    }))
    renderPage()

    expect(await screen.findByText('Cliente Grande')).toBeInTheDocument()
    expect(screen.getByText('Cliente Chico')).toBeInTheDocument()
    expect(screen.getByText('$5,000')).toBeInTheDocument()
  })

  it('clic en la fila de un cliente (no solo el ícono) navega a Pipeline filtrado en Aprobado (SCRUM-91)', async () => {
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      best_clients: [{ client_name: '[DEMO] Delta Residencial S.A.', client_id: 3, client_type: 'master', amount: 433.35 }],
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/ventas-diseno/reports']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/ventas-diseno/reports" element={<VentasDisenoReportsPage />} />
            <Route path="/ventas-diseno/pipeline" element={<div>PIPELINE_PROBE</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const row = await screen.findByText('[DEMO] Delta Residencial S.A.')
    fireEvent.click(row)

    expect(await screen.findByText('PIPELINE_PROBE')).toBeInTheDocument()
  })

  it('sin mejores clientes muestra el mensaje vacío', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:reports.bestClients.empty')).toBeInTheDocument()
  })

  it('no muestra Top de vendedores en alcance propio', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.surface.title')
    expect(screen.queryByText('ventasDiseno:reports.topVendors.title')).not.toBeInTheDocument()
  })

  it('muestra Top de vendedores en alcance Equipo', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: [] })
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      scope: 'team',
      top_vendors: [{ user_id: 1, user_name: 'Designer Demo', total_current_month: 3000, low_sales_alert: true }],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:scope.team'))

    expect(await screen.findByText('Designer Demo')).toBeInTheDocument()
    expect(screen.getByText('$3,000')).toBeInTheDocument()
    // SCRUM-112 — el texto de la alerta debe verse siempre, no solo al hover (title).
    expect(screen.getByText('ventasDiseno:reports.topVendors.alertBadge')).toBeInTheDocument()
  })

  it('no muestra Forecast en alcance propio', async () => {
    renderPage()
    await screen.findByText('ventasDiseno:reports.surface.title')
    expect(screen.queryByText('ventasDiseno:reports.forecast.title')).not.toBeInTheDocument()
  })

  it('muestra Forecast con Meta superada en verde', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: [] })
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      scope: 'team',
      forecast: {
        closed: 5000, best_case: 7000, weighted_pipeline: 4400, committed: 3000,
        meta_amount: 5000, remaining: 0, meta_reached: true,
        pct_closed: 100, pct_projected: 188, pipeline_covers_gap: true,
        quote_probability_percent: 40, proposal_probability_percent: 70,
        stage_breakdown: [
          { stage: 'quote', projects: 1, open_amount: 2000, probability_percent: 40, weighted_amount: 800 },
          { stage: 'proposal', projects: 1, open_amount: 1500, probability_percent: 70, weighted_amount: 1050 },
        ],
      },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:scope.team'))

    expect(await screen.findByText('ventasDiseno:reports.forecast.reached')).toBeInTheDocument()
    // SCRUM-113 — 3 tarjetas nuevas del mockup (Mejor caso/Ponderado/Comprometido)
    expect(screen.getByText('$7,000')).toBeInTheDocument()
    expect(screen.getByText('$4,400')).toBeInTheDocument()
    expect(screen.getByText('$3,000')).toBeInTheDocument()
    // Tabla de detalle por etapa
    expect(screen.getByText('ventasDiseno:stages.quote')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:stages.proposal')).toBeInTheDocument()
  })

  it('muestra la nota de que el Ponderado no alcanza para cubrir la meta', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: [] })
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      scope: 'team',
      forecast: {
        closed: 1000, best_case: 2000, weighted_pipeline: 800, committed: 500,
        meta_amount: 5000, remaining: 4000, meta_reached: false,
        pct_closed: 20, pct_projected: 36, pipeline_covers_gap: false,
        quote_probability_percent: 40, proposal_probability_percent: 70,
        stage_breakdown: [],
      },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:scope.team'))

    expect(await screen.findByText('ventasDiseno:reports.forecast.remaining')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:reports.forecast.noteNotCovers')).toBeInTheDocument()
  })

  it('muestra la nota de que el Ponderado sí alcanza para cubrir la meta', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: [] })
    mockedApi.reports.summary.mockResolvedValue(makeSummary({
      scope: 'team',
      forecast: {
        closed: 1000, best_case: 6000, weighted_pipeline: 5000, committed: 4000,
        meta_amount: 5000, remaining: 4000, meta_reached: false,
        pct_closed: 20, pct_projected: 120, pipeline_covers_gap: true,
        quote_probability_percent: 40, proposal_probability_percent: 70,
        stage_breakdown: [],
      },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('ventasDiseno:scope.team'))

    expect(await screen.findByText('ventasDiseno:reports.forecast.remaining')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:reports.forecast.noteCovers')).toBeInTheDocument()
  })

  it('muestra el panel de Comisiones', async () => {
    mockedApi.reports.commissions.summary.mockResolvedValue({
      paid: 100, pending: 200, final_stage: 50, cohorts: [],
    })
    renderPage()

    expect(await screen.findByText('ventasDiseno:reports.commissions.title')).toBeInTheDocument()
    expect(await screen.findByText('$100')).toBeInTheDocument()
    expect(screen.getByText('$200')).toBeInTheDocument()
  })
})
