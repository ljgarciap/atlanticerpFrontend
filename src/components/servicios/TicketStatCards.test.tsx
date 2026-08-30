import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TicketStatCards from './TicketStatCards'
import { serviciosApi } from '@/api/serviciosApi'

const LABELS: Record<string, string> = {
  'tickets.stats.abiertosSub':    'de {{total}} totales',
  'tickets.stats.sinAgendarSub':  'hace más de {{dias}} días',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      return out
    },
  }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: { tickets: { stats: vi.fn() } },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function renderCards() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TicketStatCards />
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

// REQ-222 — 4 tarjetas de estadísticas.
describe('TicketStatCards', () => {
  it('renderiza los 4 valores y el umbral configurable en el subtítulo de "Sin agendar"', async () => {
    mockedApi.tickets.stats.mockResolvedValue({
      tickets_abiertos: 7, total_tickets: 9, cotizaciones_por_generar: 5,
      informes_por_generar: 4, sin_agendar: 2, sin_agendar_umbral_dias: 3,
    })

    renderCards()

    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument())
    expect(screen.getByText('de 9 totales')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // Nunca hardcodear "3 días" — debe venir del backend (sin_agendar_umbral_dias).
    expect(screen.getByText('hace más de 3 días')).toBeInTheDocument()
  })

  it('respeta un umbral configurable distinto sin hardcodear "3"', async () => {
    mockedApi.tickets.stats.mockResolvedValue({
      tickets_abiertos: 0, total_tickets: 0, cotizaciones_por_generar: 0,
      informes_por_generar: 0, sin_agendar: 0, sin_agendar_umbral_dias: 7,
    })

    renderCards()

    await waitFor(() => expect(screen.getByText('hace más de 7 días')).toBeInTheDocument())
  })
})
