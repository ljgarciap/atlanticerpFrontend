import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportsConfigPanel from './ReportsConfigPanel'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SalesGoalRow, ReportSettingsValue } from '@/types/ventasDiseno'

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
      goals: { list: vi.fn(), upsert: vi.fn() },
      settings: { get: vi.fn(), update: vi.fn() },
    },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeGoal(overrides: Partial<SalesGoalRow> = {}): SalesGoalRow {
  return { user_id: 1, user_name: 'Designer Demo', goal_amount: null, goal_plus_amount: null, ...overrides }
}

function makeSettings(overrides: Partial<ReportSettingsValue> = {}): ReportSettingsValue {
  return { low_sales_threshold: 20000, low_sales_months: 3, quote_probability_percent: 40, proposal_probability_percent: 70, ...overrides }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsConfigPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.reports.goals.list.mockResolvedValue([makeGoal()])
  mockedApi.reports.settings.get.mockResolvedValue(makeSettings())
})

describe('ReportsConfigPanel', () => {
  it('muestra el vendedor y permite guardar una meta nueva', async () => {
    mockedApi.reports.goals.upsert.mockResolvedValue(makeGoal({ goal_amount: 15000 }))
    renderPanel()

    await screen.findByText('Designer Demo')
    const goalInput = document.querySelectorAll('input[inputmode="decimal"]')[0] as HTMLInputElement
    fireEvent.change(goalInput, { target: { value: '15000' } })

    fireEvent.click(screen.getByText('ventasDiseno:reports.config.save'))

    await waitFor(() => expect(mockedApi.reports.goals.upsert).toHaveBeenCalledWith(1, {
      goal_amount: 15000, goal_plus_amount: null,
    }))
  })

  it('carga los parámetros configurados y permite actualizarlos', async () => {
    mockedApi.reports.settings.update.mockResolvedValue(makeSettings({ low_sales_months: 4 }))
    renderPanel()

    await screen.findByText('Designer Demo')
    const monthsInput = screen.getByDisplayValue('3')
    fireEvent.change(monthsInput, { target: { value: '4' } })

    fireEvent.click(screen.getAllByText('ventasDiseno:reports.config.save').slice(-1)[0])

    await waitFor(() => expect(mockedApi.reports.settings.update).toHaveBeenCalledWith(expect.objectContaining({
      low_sales_months: 4,
    })))
  })

  it('acepta coma decimal al tipear una Meta, en vez de descartarla (SCRUM-146)', async () => {
    renderPanel()
    await screen.findByText('Designer Demo')
    const goalInput = document.querySelectorAll('input[inputmode="decimal"]')[0] as HTMLInputElement
    fireEvent.change(goalInput, { target: { value: '1,5' } })
    expect(goalInput.value).toBe('1.5')
  })

  it('muestra el error del backend si falla al guardar una meta, en vez de perderlo en silencio (SCRUM-146)', async () => {
    mockedApi.reports.goals.upsert.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Error', errors: { goal_amount: ['El campo goal amount no debe ser mayor que 9999999999.99.'] } } },
    })
    renderPanel()

    await screen.findByText('Designer Demo')
    const goalInput = document.querySelectorAll('input[inputmode="decimal"]')[0] as HTMLInputElement
    fireEvent.change(goalInput, { target: { value: '999999999999999' } })
    fireEvent.click(screen.getByText('ventasDiseno:reports.config.save'))

    expect(await screen.findByText('El campo goal amount no debe ser mayor que 9999999999.99.')).toBeInTheDocument()
  })
})
