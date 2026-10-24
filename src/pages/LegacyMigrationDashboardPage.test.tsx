import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LegacyMigrationDashboardPage from './LegacyMigrationDashboardPage'
import { legacyMigrationApi } from '@/api/legacyMigrationApi'
import type { CountsResponse, ExcludedResponse, SyncRunsResponse } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyMigrationApi: { runs: vi.fn(), counts: vi.fn(), excluded: vi.fn() },
  // SCRUM-1114 — el panel de stock vive en la misma página; sin respuesta queda en "Cargando...".
  legacyStockSyncApi: { get: vi.fn(() => new Promise(() => {})), update: vi.fn() },
}))

const mockedApi = vi.mocked(legacyMigrationApi, true)

function makeRuns(overrides: Partial<SyncRunsResponse> = {}): SyncRunsResponse {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeCounts(overrides: Partial<CountsResponse> = {}): CountsResponse {
  return {
    data: [
      { entidad: 'productos', staging: 10, resuelto: 8 },
      { entidad: 'pagos', staging: 5, resuelto: null },
    ],
    ...overrides,
  }
}

function makeExcluded(overrides: Partial<ExcludedResponse> = {}): ExcludedResponse {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <LegacyMigrationDashboardPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.runs.mockResolvedValue(makeRuns())
  mockedApi.counts.mockResolvedValue(makeCounts())
  mockedApi.excluded.mockResolvedValue(makeExcluded())
})

describe('LegacyMigrationDashboardPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('Migración ICG')).toBeInTheDocument()
  })

  it('Bloque 2 — muestra staging vs resuelto, y "sin destino/matching" cuando resuelto es null', async () => {
    renderPage()

    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('8 resueltos')).toBeInTheDocument()
    expect(screen.getByText('sin destino/matching')).toBeInTheDocument()
  })

  it('Bloque 1 — sin corridas muestra el estado vacío', async () => {
    renderPage()
    expect(await screen.findByText('Sin corridas registradas todavía.')).toBeInTheDocument()
  })

  it('Bloque 1 — filtrar por entidad vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.runs).toHaveBeenCalled())

    // Bloque 1 (runs) y Bloque 3 (excluded) tienen cada uno su propio select "Todas las
    // entidades" — el primero en el DOM es el de Bloque 1.
    fireEvent.change(screen.getAllByDisplayValue('Todas las entidades')[0], { target: { value: 'facturas' } })

    await waitFor(() => expect(mockedApi.runs).toHaveBeenLastCalledWith(
      expect.objectContaining({ entidad: 'facturas' }),
    ))
  })

  it('Bloque 3 — sin excluidos muestra el estado vacío positivo', async () => {
    renderPage()
    expect(await screen.findByText('Sin registros excluidos')).toBeInTheDocument()
  })

  it('Bloque 3 — muestra una fila excluida con motivo', async () => {
    mockedApi.excluded.mockResolvedValue(makeExcluded({
      data: [{ id: 1, entidad: 'facturas', referencia: 'A-9001', status: 'orphan', motivo: 'sin match', created_at: '2026-09-02T12:00:00Z' }],
    }))
    renderPage()

    expect(await screen.findByText('A-9001')).toBeInTheDocument()
    expect(screen.getByText('sin match')).toBeInTheDocument()
  })

  it('Bloque 1 — la paginación pide la página siguiente', async () => {
    mockedApi.runs.mockResolvedValue(makeRuns({
      data: [{
        id: 1, entidad: 'productos', extraidos: 1, staged: 1, mapeados: 1, cargados: 1,
        excluidos: 0, errores: 0, duracion_ms: 500, status: 'success',
        started_at: '2026-09-02T12:00:00Z', finished_at: '2026-09-02T12:00:01Z',
      }],
      current_page: 1, last_page: 2,
    }))
    renderPage()

    fireEvent.click(await screen.findByText('Siguiente'))

    await waitFor(() => expect(mockedApi.runs).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))
  })
})
