import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AiUsagePage from './AiUsagePage'
import { aiUsageApi, type AiUsageResponse } from '@/api/aiUsageApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'aiUsage:totals.tokens' && opts) return `${opts.input} in / ${opts.output} out`
      return key
    },
  }),
}))

vi.mock('@/api/aiUsageApi', () => ({
  aiUsageApi: { list: vi.fn(), pricing: vi.fn(), updatePricing: vi.fn() },
}))

const mockedApi = vi.mocked(aiUsageApi)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AiUsagePage />
    </QueryClientProvider>,
  )
}

const EMPTY_RESPONSE: AiUsageResponse = {
  data: [],
  meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
  totals: {
    current_month: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    all_time:       { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiUsagePage', () => {
  it('muestra el estado vacío cuando no hay consumo', async () => {
    mockedApi.list.mockResolvedValue(EMPTY_RESPONSE)
    renderPage()
    expect(await screen.findByText('aiUsage:empty')).toBeInTheDocument()
  })

  it('lista los requests con usuario, módulo, documento y costo', async () => {
    mockedApi.list.mockResolvedValue({
      ...EMPTY_RESPONSE,
      data: [{
        id: 'abc-123',
        created_at: '2026-07-20T15:00:00Z',
        analysis_type: 'goods_receipt_invoice_match',
        analysis_label: 'Detección de factura',
        model: 'claude-sonnet-5',
        input_tokens: 1000,
        output_tokens: 300,
        estimated_cost_usd: 0.0075,
        document_name: 'factura-123.pdf',
        status: 'completed',
        requested_by: { id: 7, name: 'Lider Compras Test' },
      }],
      totals: {
        current_month: { input_tokens: 1000, output_tokens: 300, estimated_cost_usd: 0.0075 },
        all_time:       { input_tokens: 1000, output_tokens: 300, estimated_cost_usd: 0.0075 },
      },
    })

    renderPage()

    expect(await screen.findByText('Lider Compras Test')).toBeInTheDocument()
    expect(screen.getByText('Detección de factura')).toBeInTheDocument()
    expect(screen.getByText('factura-123.pdf')).toBeInTheDocument()
    expect(screen.getAllByText('$0.0075').length).toBeGreaterThan(0)
  })

  it('muestra "Usuario desconocido" cuando requested_by es null', async () => {
    mockedApi.list.mockResolvedValue({
      ...EMPTY_RESPONSE,
      data: [{
        id: 'no-user',
        created_at: '2026-07-20T15:00:00Z',
        analysis_type: 'summarize',
        analysis_label: 'Resumen de proyecto',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: 500,
        output_tokens: 200,
        estimated_cost_usd: 0.0015,
        document_name: null,
        status: 'completed',
        requested_by: null,
      }],
    })

    renderPage()
    expect(await screen.findByText('aiUsage:unknownUser')).toBeInTheDocument()
  })
})
