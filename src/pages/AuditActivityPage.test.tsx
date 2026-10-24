import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { AuditActivitySummary } from '@/api/auditLogsApi'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Se reemplaza Chart.js por un placeholder que expone sus props (datos y onClick) — no se prueba el
// render del canvas, solo lo que la página le entrega. Mismo enfoque que DashboardPage.test.tsx.
type MockChartProps = {
  data: { labels: string[]; datasets: { data: number[] }[] }
  options: { onClick?: (e: unknown, els: { index: number }[]) => void }
}
const charts: MockChartProps[] = []
vi.mock('react-chartjs-2', () => ({
  Chart: (props: MockChartProps) => { charts.push(props); return <div data-testid="mock-chart" /> },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let out = key
      if (opts) for (const [k, v] of Object.entries(opts)) if (k !== 'defaultValue') out += `|${k}=${String(v)}`
      return out
    },
    i18n: { language: 'es', changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/auditLogsApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/auditLogsApi')>('@/api/auditLogsApi')
  return { ...actual, auditActivityApi: { summary: vi.fn() } }
})

import AuditActivityPage from './AuditActivityPage'
import { auditActivityApi } from '@/api/auditLogsApi'

const mockedApi = vi.mocked(auditActivityApi, true)

function makeSummary(overrides: Partial<AuditActivitySummary> = {}): AuditActivitySummary {
  return {
    from: '2026-09-10', to: '2026-09-12',
    totals: { interactions: 1234, active_users: 7, data_changes: 900, data_changes_pct: 72.9, access_denied: 5 },
    by_user: [
      { user_id: 3, name: 'Ana Pérez', count: 500 },
      { user_id: null, name: null, count: 40 },
    ],
    by_type: { created: 100, updated: 700, deleted: 100, exported: 10, downloaded: 20, login: 200, login_failed: 4, access_denied: 5, other: 95 },
    by_module: [{ module: 'ventas_diseno', count: 800 }, { module: 'admin_contab', count: 434 }],
    by_day: [{ date: '2026-09-10', count: 400 }, { date: '2026-09-11', count: 500 }, { date: '2026-09-12', count: 334 }],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuditActivityPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const todayPanama = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Panama' })
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000

function chartByTitle(title: string): MockChartProps {
  // Cada BarsCard renderiza su título; el último Chart montado de ese card es el que corresponde.
  const idx = ['logs:activity.charts.byUser', 'logs:activity.charts.byType', 'logs:activity.charts.byModule', 'logs:activity.charts.byDay'].indexOf(title)
  return charts.slice(-4)[idx]
}

beforeEach(() => {
  vi.clearAllMocks()
  charts.length = 0
  mockedApi.summary.mockResolvedValue(makeSummary())
})

describe('AuditActivityPage — SCRUM-1020', () => {
  it('por defecto consulta los últimos 7 días terminando hoy (hora de Panamá)', async () => {
    renderPage()

    await waitFor(() => expect(mockedApi.summary).toHaveBeenCalledTimes(1))
    const [from, to] = mockedApi.summary.mock.calls[0]
    expect(to).toBe(todayPanama())
    expect(daysBetween(from, to) + 1).toBe(7)
  })

  it('muestra las tarjetas con los totales', async () => {
    renderPage()

    expect(await screen.findByTestId('stat-interactions')).toHaveTextContent(/1.?234/)
    expect(screen.getByTestId('stat-users')).toHaveTextContent('7')
    expect(screen.getByTestId('stat-changes')).toHaveTextContent('72.9%')
    expect(screen.getByTestId('stat-denied')).toHaveTextContent('5')
  })

  it('entrega a los gráficos los datos por usuario, tipo, módulo y día', async () => {
    renderPage()
    await screen.findByTestId('chart-by-user')

    const byUser = chartByTitle('logs:activity.charts.byUser')
    expect(byUser.data.labels).toEqual(['Ana Pérez', 'logs:activity.system'])
    expect(byUser.data.datasets[0].data).toEqual([500, 40])

    const byType = chartByTitle('logs:activity.charts.byType')
    expect(byType.data.labels).toHaveLength(9)
    expect(byType.data.datasets[0].data).toEqual([100, 700, 100, 10, 20, 200, 4, 5, 95])

    const byModule = chartByTitle('logs:activity.charts.byModule')
    expect(byModule.data.labels).toEqual(['logs:module.ventas_diseno', 'logs:module.admin_contab'])

    expect(chartByTitle('logs:activity.charts.byDay').data.datasets[0].data).toEqual([400, 500, 334])
  })

  it('un preset recalcula el rango', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.summary).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('logs:activity.presetDays|count=30'))

    await waitFor(() => expect(mockedApi.summary).toHaveBeenCalledTimes(2))
    const [from, to] = mockedApi.summary.mock.calls[1]
    expect(daysBetween(from, to) + 1).toBe(30)
    expect(to).toBe(todayPanama())
  })

  it('un rango de más de 90 días muestra el error y no consulta', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.summary).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('logs:activity.from'), { target: { value: '2025-01-01' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('logs:activity.errors.tooLong|max=90')
    expect(mockedApi.summary).toHaveBeenCalledTimes(1)
  })

  it('un rango invertido muestra el error y no consulta', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.summary).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('logs:activity.to'), { target: { value: '2020-01-01' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('logs:activity.errors.inverted')
    expect(mockedApi.summary).toHaveBeenCalledTimes(1)
  })

  it('clic en una barra de usuario abre Logs filtrado por ese usuario y el mismo rango', async () => {
    renderPage()
    await screen.findByTestId('chart-by-user')
    const [from, to] = mockedApi.summary.mock.calls[0]

    chartByTitle('logs:activity.charts.byUser').options.onClick?.({}, [{ index: 0 }])

    expect(mockNavigate).toHaveBeenCalledWith(`/auditoria/logs?${new URLSearchParams({ from, to, user_id: '3' }).toString()}`)
  })

  it('la barra de "Sistema" (sin usuario) no navega', async () => {
    renderPage()
    await screen.findByTestId('chart-by-user')

    chartByTitle('logs:activity.charts.byUser').options.onClick?.({}, [{ index: 1 }])

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clic en un módulo y en un día abren Logs con ese filtro', async () => {
    renderPage()
    await screen.findByTestId('chart-by-module')
    const [from, to] = mockedApi.summary.mock.calls[0]

    chartByTitle('logs:activity.charts.byModule').options.onClick?.({}, [{ index: 1 }])
    expect(mockNavigate).toHaveBeenLastCalledWith(`/auditoria/logs?${new URLSearchParams({ from, to, module: 'admin_contab' }).toString()}`)

    chartByTitle('logs:activity.charts.byDay').options.onClick?.({}, [{ index: 2 }])
    expect(mockNavigate).toHaveBeenLastCalledWith('/auditoria/logs?from=2026-09-12&to=2026-09-12')
  })

  it('sin actividad muestra el texto vacío en los gráficos', async () => {
    mockedApi.summary.mockResolvedValue(makeSummary({
      totals: { interactions: 0, active_users: 0, data_changes: 0, data_changes_pct: 0, access_denied: 0 },
      by_user: [], by_module: [], by_day: [{ date: '2026-09-10', count: 0 }],
      by_type: { created: 0, updated: 0, deleted: 0, exported: 0, downloaded: 0, login: 0, login_failed: 0, access_denied: 0, other: 0 },
    }))
    renderPage()

    await screen.findByTestId('chart-by-user')
    expect(screen.getAllByText('logs:activity.empty')).toHaveLength(4)
    expect(screen.queryByTestId('mock-chart')).toBeNull()
  })

  it('un error del servidor se muestra al usuario', async () => {
    mockedApi.summary.mockRejectedValue(Object.assign(new Error('x'), {
      isAxiosError: true, response: { status: 422, data: { message: 'El rango máximo es de 90 días.' } },
    }))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('El rango máximo es de 90 días.')
  })
})
