import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ServiceQuotesHistoryPage from './ServiceQuotesHistoryPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { ServiceQuoteGlobalHistoryResponse } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'nav.home': 'Inicio', 'nav.tickets': 'Tickets', 'nav.technicians': 'Técnicos',
  'nav.module': 'Servicios',
  'tickets.quotesHistory.title': 'Historial de cotizaciones',
  'tickets.quotesHistory.chips.all': 'Todas',
  'tickets.quote.draft': 'Borrador', 'tickets.quote.sent': 'Enviada',
  'tickets.quote.approved': 'Aprobada', 'tickets.quote.rejected': 'Rechazada',
  'tickets.quotesHistory.table.empty': 'Sin cotizaciones para este filtro',
  'tickets.quotesHistory.table.loading': 'Cargando...',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => LABELS[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    serviceQuotes: { globalHistory: vi.fn(), document: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Aaron', last_name: 'Leis', email: 'servicio@illuminations.com.pa',
    role: 'lider_servicios', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function response(overrides: Partial<ServiceQuoteGlobalHistoryResponse> = {}): ServiceQuoteGlobalHistoryResponse {
  return {
    data: [],
    counts: { all: 0, draft: 0, sent: 0, approved: 0, rejected: 0 },
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ServiceQuotesHistoryPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

// jsdom no implementa URL.createObjectURL/revokeObjectURL — ServiceQuotePdfViewerModal las usa al
// abrir el visor de PDF en pantalla (Batch 12). Mismo patrón ad-hoc que OrderDetailModal.test.tsx.
const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-quote-pdf')
const revokeObjectURLMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, configurable: true })
})

// Fase 4 — Servicios, resto del Batch 12 (REQ-250, SCRUM-313).
describe('ServiceQuotesHistoryPage', () => {
  it('sin resultados — muestra el estado vacío', async () => {
    mockedApi.serviceQuotes.globalHistory.mockResolvedValue(response())
    renderPage()

    expect(await screen.findByText('Sin cotizaciones para este filtro')).toBeInTheDocument()
  })

  it('renderiza N° cotización, N° ticket, cliente, total y estado por fila', async () => {
    mockedApi.serviceQuotes.globalHistory.mockResolvedValue(response({
      data: [{
        id: 1, numero: 'COT-SERV-2026-0001', estado: 'sent', total: 500,
        created_at: '2026-08-11T10:00:00Z', sent_at: '2026-08-11T12:00:00Z',
        ticket: { id: 5, numero: 'GAR-2026-0005', cliente: 'Torre Azul' },
      }],
      counts: { all: 1, draft: 0, sent: 1, approved: 0, rejected: 0 },
    }))
    renderPage()

    expect(await screen.findByText('COT-SERV-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('GAR-2026-0005')).toBeInTheDocument()
    expect(screen.getByText('Torre Azul')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.getByText('Enviada')).toBeInTheDocument()
  })

  it('chip de estado dispara globalHistory() con el filtro estructurado (REQ-250)', async () => {
    mockedApi.serviceQuotes.globalHistory.mockResolvedValue(response())
    renderPage()

    await waitFor(() => expect(mockedApi.serviceQuotes.globalHistory).toHaveBeenCalledWith(undefined))

    fireEvent.click(screen.getByText('Aprobada (0)'))
    await waitFor(() => expect(mockedApi.serviceQuotes.globalHistory).toHaveBeenCalledWith('approved'))
  })

  it('buscador filtra client-side por N° cotización/N° ticket/cliente (REQ-250)', async () => {
    mockedApi.serviceQuotes.globalHistory.mockResolvedValue(response({
      data: [
        {
          id: 1, numero: 'COT-SERV-2026-0001', estado: 'draft', total: 100,
          created_at: '2026-08-11T10:00:00Z', sent_at: null,
          ticket: { id: 5, numero: 'GAR-2026-0005', cliente: 'Torre Azul' },
        },
        {
          id: 2, numero: 'COT-SERV-2026-0002', estado: 'draft', total: 200,
          created_at: '2026-08-10T10:00:00Z', sent_at: null,
          ticket: { id: 6, numero: 'INS-2026-0006', cliente: 'Grupo Delta' },
        },
      ],
      counts: { all: 2, draft: 2, sent: 0, approved: 0, rejected: 0 },
    }))
    renderPage()

    await screen.findByText('COT-SERV-2026-0001')
    expect(screen.getByText('COT-SERV-2026-0002')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('tickets.quotesHistory.searchPlaceholder'), { target: { value: 'Delta' } })

    expect(screen.queryByText('COT-SERV-2026-0001')).not.toBeInTheDocument()
    expect(screen.getByText('COT-SERV-2026-0002')).toBeInTheDocument()
  })

  it('"acceso directo" de una fila dispara document() con ticket/cotización correctos y abre el visor en pantalla (REQ-250)', async () => {
    mockedApi.serviceQuotes.globalHistory.mockResolvedValue(response({
      data: [{
        id: 1, numero: 'COT-SERV-2026-0001', estado: 'draft', total: 100,
        created_at: '2026-08-11T10:00:00Z', sent_at: null,
        ticket: { id: 5, numero: 'GAR-2026-0005', cliente: 'Torre Azul' },
      }],
      counts: { all: 1, draft: 1, sent: 0, approved: 0, rejected: 0 },
    }))
    mockedApi.serviceQuotes.document.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    renderPage()

    await screen.findByText('COT-SERV-2026-0001')
    fireEvent.click(screen.getByRole('button', { name: 'tickets.quotesHistory.table.columns.detail' }))

    await waitFor(() => expect(mockedApi.serviceQuotes.document).toHaveBeenCalledWith(5, 1))
    // Batch 12 — mismo visor en pantalla que ServiceQuoteModal (REQ-236), no descarga a ciegas.
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalled())
  })
})
