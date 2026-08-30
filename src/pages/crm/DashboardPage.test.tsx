import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Chart as ChartJS } from 'chart.js'
import CrmDashboardPage from './DashboardPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useToastStore } from '@/store/toastStore'
import type { DashboardSummary } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`
      if (opts?.summary !== undefined) return `${key}:${opts.summary}`
      return key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    dashboard: { summary: vi.fn(), remind: vi.fn() },
  },
}))

vi.mock('@/store/toastStore', () => ({ useToastStore: vi.fn() }))

// Chart.js necesita un <canvas> real (getContext) que jsdom no implementa — mismo criterio
// que ReportsPage.test.tsx: reemplazar por un placeholder, no probar el render interno.
vi.mock('react-chartjs-2', () => ({ Chart: () => <div data-testid="mock-chart" /> }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedToast = vi.mocked(useToastStore)

function mockToast(showSpy: (msg: string, type?: 'success' | 'error') => void = vi.fn()) {
  mockedToast.mockImplementation(((selector?: (s: { show: typeof showSpy }) => unknown) => {
    const state = { show: showSpy }
    return selector ? selector(state) : state
  }) as never)
  return showSpy
}

function makeSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    alerts: { overdue_proposals: null, cold_clients: null },
    stage_counts: { lead: 0, design: 0, quote: 0, proposal: 0, approved: 0, lost: 0 },
    totals: { active_pipeline: 0, closed_won: 0 },
    by_tag: { tagged: { design: 0, quote: 0, both: 0 }, untagged_count: 0 },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CrmDashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.dashboard.summary.mockResolvedValue(makeSummary())
  mockToast()
})

describe('CrmDashboardPage', () => {
  it('registra los controllers bar y doughnut de Chart.js', () => {
    // REQ-606 (barras) + REQ-607 (dona, primer uso en la app) — sin ArcElement/
    // DoughnutController registrados, Chart.js revienta al montar el <Chart type="doughnut">.
    expect(() => ChartJS.registry.getController('bar')).not.toThrow()
    expect(() => ChartJS.registry.getController('doughnut')).not.toThrow()
  })

  it('muestra el título y subtítulo fijo (REQ-609 RN4)', async () => {
    renderPage()
    expect(await screen.findByText('dashboard.title')).toBeInTheDocument()
    expect(screen.getByText('dashboard.subtitle')).toBeInTheDocument()
  })

  it('sin avisos, no muestra ningún banner de alerta (REQ-604 RN3)', async () => {
    renderPage()
    await screen.findByText('dashboard.title')
    expect(screen.queryByText('alerts.sendReminders')).not.toBeInTheDocument()
  })

  it('con propuestas vencidas muestra el aviso, el top 3 y el botón de recordatorios (SCRUM-796 secc. 3)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: {
        overdue_proposals: {
          count: 2,
          items: [
            { card_id: 10, project_name: 'Proyecto A', days: 20 },
            { card_id: 11, project_name: 'Proyecto B', days: 18 },
          ],
        },
        cold_clients: null,
      },
    }))
    renderPage()

    expect(await screen.findByText('dashboard.overdueTitle:2')).toBeInTheDocument()
    expect(screen.getByText('Proyecto A')).toBeInTheDocument()
    expect(screen.getByText('Proyecto B')).toBeInTheDocument()
    expect(screen.getByText('alerts.sendReminders')).toBeInTheDocument()
    // 2 ítems, no hay más de 3 — "Ver más" no debe aparecer.
    expect(screen.queryByText('dashboard.viewMore')).not.toBeInTheDocument()
  })

  it('con más de 3 propuestas vencidas, "Ver más" abre el modal con la lista completa y navega a la tarjeta elegida (SCRUM-796 secc. 3)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: {
        overdue_proposals: {
          count: 4,
          items: [
            { card_id: 10, project_name: 'Proyecto A', days: 30 },
            { card_id: 11, project_name: 'Proyecto B', days: 25 },
            { card_id: 12, project_name: 'Proyecto C', days: 20 },
            { card_id: 13, project_name: 'Proyecto D', days: 16 },
          ],
        },
        cold_clients: null,
      },
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/crm/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/crm/dashboard" element={<CrmDashboardPage />} />
            <Route path="/ventas-diseno/pipeline" element={<div>PIPELINE_PROBE</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    // Solo el top 3 se ve antes de abrir el modal.
    await screen.findByText('Proyecto A')
    expect(screen.queryByText('Proyecto D')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('dashboard.viewMore'))
    expect(await screen.findByText('Proyecto D')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Proyecto D'))
    expect(await screen.findByText('PIPELINE_PROBE')).toBeInTheDocument()
  })

  it('con clientes sin contacto reciente muestra el top 3 y navega a la tarjeta puntual (SCRUM-796 secc. 4)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: {
        overdue_proposals: null,
        cold_clients: { count: 1, items: [{ card_id: 20, project_name: 'Proyecto Frío', client_name: 'Cliente Frío SA', days: 16 }] },
      },
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/crm/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/crm/dashboard" element={<CrmDashboardPage />} />
            <Route path="/ventas-diseno/pipeline" element={<div>PIPELINE_PROBE</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('dashboard.coldTitle:1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cliente Frío SA — Proyecto Frío'))
    expect(await screen.findByText('PIPELINE_PROBE')).toBeInTheDocument()
  })

  it('clickear una tarjeta de indicador navega al Pipeline filtrado por esa etapa (SCRUM-796 secc. 1.1)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      stage_counts: { lead: 3, design: 1, quote: 2, proposal: 4, approved: 5, lost: 1 },
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/crm/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/crm/dashboard" element={<CrmDashboardPage />} />
            <Route path="/ventas-diseno/pipeline" element={<div>PIPELINE_PROBE</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('stages.lead'))
    expect(await screen.findByText('PIPELINE_PROBE')).toBeInTheDocument()
  })

  it('muestra los 6 conteos de etapa y los 2 totales monetarios (REQ-605)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      stage_counts: { lead: 3, design: 1, quote: 2, proposal: 4, approved: 5, lost: 1 },
      totals: { active_pipeline: 12345, closed_won: 6789 },
    }))
    renderPage()

    await screen.findByText('dashboard.title')
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    // SCRUM-685 (2026-08-04): se eliminaron las tarjetas grandes duplicadas debajo de los
    // gráficos — el total ahora aparece una sola vez, en el grid chico de arriba.
    expect(screen.getAllByText('$12,345')).toHaveLength(1)
    expect(screen.getAllByText('$6,789')).toHaveLength(1)
  })

  it('con proyectos etiquetados muestra la leyenda de la dona con conteos (REQ-607)', async () => {
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      by_tag: { tagged: { design: 3, quote: 2, both: 1 }, untagged_count: 4 },
    }))
    renderPage()

    expect(await screen.findByText('dashboard.tagLabels.design (3)')).toBeInTheDocument()
    expect(screen.getByText('dashboard.tagLabels.quote (2)')).toBeInTheDocument()
    expect(screen.getByText('dashboard.tagLabels.both (1)')).toBeInTheDocument()
    expect(screen.getByText('dashboard.untaggedNote:4')).toBeInTheDocument()
  })

  it('sin ningún proyecto etiquetado, no muestra la nota de "sin etiqueta" (RN3 implícita)', async () => {
    renderPage()
    await screen.findByText('dashboard.title')
    expect(screen.queryByText(/untaggedNote/)).not.toBeInTheDocument()
    expect(screen.getByText('dashboard.noTagged')).toBeInTheDocument()
  })

  it('"+ Nuevo Proyecto" navega a Pipeline con el modal en auto-apertura (REQ-608)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/crm/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/crm/dashboard" element={<CrmDashboardPage />} />
            <Route path="/ventas-diseno/pipeline" element={<div>PIPELINE_PROBE</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('kanban.actions.newProject'))

    expect(await screen.findByText('PIPELINE_PROBE')).toBeInTheDocument()
  })

  it('"Enviar recordatorios" llama al endpoint y muestra un toast de éxito', async () => {
    const showSpy = mockToast()
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: { overdue_proposals: { count: 1, items: [{ card_id: 1, project_name: 'Proyecto A', days: 16 }] }, cold_clients: null },
    }))
    mockedApi.dashboard.remind.mockResolvedValue({
      notified: [{ owner_id: 1, owner_name: 'Carlos Ruiz', projects_count: 1 }],
    })
    renderPage()

    fireEvent.click(await screen.findByText('alerts.sendReminders'))

    await waitFor(() => expect(mockedApi.dashboard.remind).toHaveBeenCalled())
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(
      expect.stringContaining('Carlos Ruiz (1)'),
    ))
  })

  it('"Enviar recordatorios" — si ya se recordó hoy, muestra el mensaje del backend en vez de un resumen vacío (hallazgo Pre-QA 2026-07-31)', async () => {
    const showSpy = mockToast()
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: { overdue_proposals: { count: 1, items: [{ card_id: 1, project_name: 'Proyecto A', days: 16 }] }, cold_clients: null },
    }))
    // Respuesta 200 sin `notified` (o vacío) — backend detectó que este owner ya recibió su
    // recordatorio hoy (idempotencia por source_ref, ver DashboardService::remind()).
    mockedApi.dashboard.remind.mockResolvedValue({
      already_sent_today: [1],
      message: 'Ya se envió un recordatorio hoy a cada responsable de las propuestas vencidas.',
    })
    renderPage()

    fireEvent.click(await screen.findByText('alerts.sendReminders'))

    await waitFor(() => expect(showSpy).toHaveBeenCalledWith(
      'Ya se envió un recordatorio hoy a cada responsable de las propuestas vencidas.',
    ))
  })

  it('"Enviar recordatorios" sin propuestas vencidas muestra el toast de error del backend', async () => {
    const showSpy = mockToast()
    mockedApi.dashboard.summary.mockResolvedValue(makeSummary({
      alerts: { overdue_proposals: { count: 1, items: [{ card_id: 1, project_name: 'Proyecto A', days: 16 }] }, cold_clients: null },
    }))
    mockedApi.dashboard.remind.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'No hay propuestas vencidas para recordar.' } },
    })
    renderPage()

    fireEvent.click(await screen.findByText('alerts.sendReminders'))

    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('No hay propuestas vencidas para recordar.', 'error'))
  })

  it('muestra el mensaje de error si el resumen falla', async () => {
    mockedApi.dashboard.summary.mockRejectedValue(new Error('network error'))
    renderPage()

    expect(await screen.findByText('dashboard.loadError')).toBeInTheDocument()
  })
})
