import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommissionsPanel from './CommissionsPanel'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { CommissionsSummary } from '@/types/ventasDiseno'

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
      commissions: { summary: vi.fn(), markPaid: vi.fn() },
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function mockAuthState(user: Record<string, unknown> | null) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user }
    return selector ? selector(state) : state
  }) as never)
}

function makeSummary(overrides: Partial<CommissionsSummary> = {}): CommissionsSummary {
  return { paid: 0, pending: 0, final_stage: 0, cohorts: [], ...overrides }
}

function renderPanel(scope: 'own' | 'team' = 'own') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CommissionsPanel scope={scope} period="month" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthState({ id: 1, role: 'designer', permissions: [] })
})

describe('CommissionsPanel', () => {
  it('muestra Pagadas/Por Pagar/Final Stage', async () => {
    mockedApi.reports.commissions.summary.mockResolvedValue(makeSummary({ paid: 100, pending: 200, final_stage: 50 }))
    renderPanel()

    expect(await screen.findByText('$100')).toBeInTheDocument()
    expect(screen.getByText('$200')).toBeInTheDocument()
    expect(screen.getByText('$50')).toBeInTheDocument()
  })

  it('sin cohortes muestra el mensaje vacío', async () => {
    mockedApi.reports.commissions.summary.mockResolvedValue(makeSummary())
    renderPanel()

    expect(await screen.findByText('ventasDiseno:reports.commissions.empty')).toBeInTheDocument()
  })

  it('sin el permiso mark_paid no muestra el botón de marcar pagada', async () => {
    mockedApi.reports.commissions.summary.mockResolvedValue(makeSummary({
      cohorts: [{
        id: 5, owner_id: 1, owner_name: 'Designer Demo', month: '2026-05',
        total_amount: 25000, commission_percent: 2, commission_amount: 500, paid_at: null,
      }],
    }))
    renderPanel()

    await screen.findByText('Designer Demo')
    expect(screen.queryByText('ventasDiseno:reports.commissions.markPaid')).not.toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:reports.commissions.statusPending')).toBeInTheDocument()
  })

  it('con el permiso marca una cohorte como pagada', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: ['ventas_diseno.commissions.mark_paid'] })
    mockedApi.reports.commissions.summary.mockResolvedValue(makeSummary({
      cohorts: [{
        id: 5, owner_id: 1, owner_name: 'Designer Demo', month: '2026-05',
        total_amount: 25000, commission_percent: 2, commission_amount: 500, paid_at: null,
      }],
    }))
    mockedApi.reports.commissions.markPaid.mockResolvedValue({ id: 5, paid_at: '2026-07-08T00:00:00Z' })
    renderPanel()

    fireEvent.click(await screen.findByText('ventasDiseno:reports.commissions.markPaid'))

    await waitFor(() => expect(mockedApi.reports.commissions.markPaid).toHaveBeenCalledWith(5))
  })

  it('una cohorte ya pagada no muestra el botón', async () => {
    mockAuthState({ id: 1, role: 'management', permissions: ['ventas_diseno.commissions.mark_paid'] })
    mockedApi.reports.commissions.summary.mockResolvedValue(makeSummary({
      cohorts: [{
        id: 5, owner_id: 1, owner_name: 'Designer Demo', month: '2026-05',
        total_amount: 25000, commission_percent: 2, commission_amount: 500, paid_at: '2026-06-01T00:00:00Z',
      }],
    }))
    renderPanel()

    await screen.findByText('Designer Demo')
    expect(screen.queryByText('ventasDiseno:reports.commissions.markPaid')).not.toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:reports.commissions.statusPaid')).toBeInTheDocument()
  })
})
