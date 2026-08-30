import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaReportesPage from './BodegaReportesPage'
import { bodegaApi } from '@/api/bodegaApi'
import type {
  BodegaProductivityReport, BodegaAdjustmentAccuracyReport,
  BodegaWarehouseCapacityReport, BodegaInventorySummaryReport,
} from '@/types/bodega'

// SCRUM-490→495 (REQ-420→425, epic SCRUM-329) — "Reportes de Bodega". Cubre: selector de
// período compartido (RN1 de REQ-420 — los 4 reportes se recalculan juntos al cambiar), estado
// "sin datos" de Productividad (Escenario 2 de REQ-421), aviso de concentración condicional
// (REQ-423) y navegación específica de cada tarjeta (REQ-425).

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

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

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    reports: {
      productivity: vi.fn(),
      adjustmentAccuracy: vi.fn(),
      warehouseCapacity: vi.fn(),
      inventorySummary: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function makeProductivity(overrides: Partial<BodegaProductivityReport> = {}): BodegaProductivityReport {
  return {
    period: { key: 'month', from: '2026-07-01', to: '2026-07-27' },
    has_data: true,
    data: [
      { assistant_id: 1, assistant_name: 'Mariano Sandoval', orders_count: 34, percent_of_top: 100 },
      { assistant_id: 2, assistant_name: 'Osvaldo Santos', orders_count: 27, percent_of_top: 79.4 },
    ],
    ...overrides,
  }
}

function makeAccuracy(overrides: Partial<BodegaAdjustmentAccuracyReport> = {}): BodegaAdjustmentAccuracyReport {
  return {
    period: { key: 'month', from: '2026-07-01', to: '2026-07-27' },
    total: 14,
    aprobadas: 9,
    rechazadas: 3,
    pendientes: 2,
    motivos: [{ motivo: 'Producto dañado / roto', count: 6 }],
    ...overrides,
  }
}

function makeCapacity(overrides: Partial<BodegaWarehouseCapacityReport> = {}): BodegaWarehouseCapacityReport {
  return {
    period: { key: 'month', from: '2026-07-01', to: '2026-07-27' },
    warehouses: [
      { warehouse_id: 1, name: 'Bodega Central', products_count: 10, units_count: 96, percent_of_total: 90 },
      { warehouse_id: 2, name: 'Showroom Obarrio', products_count: 1, units_count: 2, percent_of_total: 2 },
    ],
    total_units: 100,
    concentration_alert: null,
    ...overrides,
  }
}

function makeInventorySummary(overrides: Partial<BodegaInventorySummaryReport> = {}): BodegaInventorySummaryReport {
  return {
    period: { key: 'month', from: '2026-07-01', to: '2026-07-27' },
    total_products: 52,
    in_attention: 4,
    committed_units: 37,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BodegaReportesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.reports.productivity.mockResolvedValue(makeProductivity())
  mockedApi.reports.adjustmentAccuracy.mockResolvedValue(makeAccuracy())
  mockedApi.reports.warehouseCapacity.mockResolvedValue(makeCapacity())
  mockedApi.reports.inventorySummary.mockResolvedValue(makeInventorySummary())
})

describe('BodegaReportesPage', () => {
  it('renderiza las 4 tarjetas con datos', async () => {
    renderPage()

    expect(await screen.findByText('Mariano Sandoval')).toBeInTheDocument()
    expect(screen.getByText('Producto dañado / roto')).toBeInTheDocument()
    expect(screen.getByText('Bodega Central')).toBeInTheDocument()
    expect(screen.getByText('52')).toBeInTheDocument()
  })

  it('el selector de período recalcula los 4 reportes a la vez (RN1 REQ-420)', async () => {
    renderPage()
    await screen.findByText('Mariano Sandoval')

    expect(mockedApi.reports.productivity).toHaveBeenCalledWith('month')

    fireEvent.click(screen.getByText('reports.period.quarter'))

    await waitFor(() => {
      expect(mockedApi.reports.productivity).toHaveBeenCalledWith('quarter')
      expect(mockedApi.reports.adjustmentAccuracy).toHaveBeenCalledWith('quarter')
      expect(mockedApi.reports.warehouseCapacity).toHaveBeenCalledWith('quarter')
      expect(mockedApi.reports.inventorySummary).toHaveBeenCalledWith('quarter')
    })
  })

  it('Productividad — sin datos en el período muestra el mensaje, no un ranking vacío (Escenario 2)', async () => {
    mockedApi.reports.productivity.mockResolvedValue(makeProductivity({ has_data: false, data: [] }))
    renderPage()

    expect(await screen.findByText('bodega:reports.productivity.empty')).toBeInTheDocument()
    expect(screen.queryByText('Mariano Sandoval')).not.toBeInTheDocument()
  })

  it('Capacidad por bodega — muestra el aviso de concentración cuando viene del backend', async () => {
    mockedApi.reports.warehouseCapacity.mockResolvedValue(makeCapacity({
      concentration_alert: {
        warehouse_id: 1, warehouse_name: 'Bodega Central', percent: 90,
        threshold_pct: 75, suggested_targets: ['Showroom Obarrio', 'Showroom SM'],
      },
    }))
    renderPage()

    expect(await screen.findByText(/reports.warehouseCapacity.concentrationAlert/)).toBeInTheDocument()
  })

  it('Capacidad por bodega — sin concentración no muestra ningún aviso (Escenario 2)', async () => {
    renderPage()
    await screen.findByText('Bodega Central')

    expect(screen.queryByText(/reports.warehouseCapacity.concentrationAlert/)).not.toBeInTheDocument()
  })

  it('Inventario: rotación y atención — 0 en atención no rompe ni deja espacio en blanco', async () => {
    mockedApi.reports.inventorySummary.mockResolvedValue(makeInventorySummary({ in_attention: 0 }))
    renderPage()

    await screen.findByText('52')
    // El KPI "En atención" debe mostrar 0 explícito.
    const attentionValues = screen.getAllByText('0')
    expect(attentionValues.length).toBeGreaterThan(0)
  })

  it('REQ-425 — cada tarjeta navega a su pantalla específica al hacer clic', async () => {
    renderPage()
    await screen.findByText('Mariano Sandoval')

    fireEvent.click(screen.getByText('bodega:reports.productivity.title'))
    expect(navigateMock).toHaveBeenLastCalledWith('/bodega/pedidos')

    fireEvent.click(screen.getByText('bodega:reports.adjustmentAccuracy.title'))
    expect(navigateMock).toHaveBeenLastCalledWith('/bodega/solicitud-ajuste')

    fireEvent.click(screen.getByText('bodega:reports.warehouseCapacity.title'))
    expect(navigateMock).toHaveBeenLastCalledWith('/bodega/bodegas')

    fireEvent.click(screen.getByText('bodega:reports.inventorySummary.title'))
    expect(navigateMock).toHaveBeenLastCalledWith('/bodega/inventario')
  })

  it('SCRUM-490 — el label de período se muestra bajo el título y cambia al seleccionar otro período', async () => {
    renderPage()
    await screen.findByText('Mariano Sandoval')

    // Verifica que el label de mes está presente inicialmente (ej: "julio de 2026")
    // Busca específicamente en el párrafo de clase "mt-1" (que es donde está el label)
    const monthLabel = screen.getByText(/de 20\d{2}/)
    expect(monthLabel.textContent).toMatch(/de 20\d{2}/)

    // Cambia a trimestre
    fireEvent.click(screen.getByText('reports.period.quarter'))

    // Verifica que el label se actualizó (ahora debe tener "Q" + año + rango de meses)
    await waitFor(() => {
      expect(screen.getByText(/Q[1-4] 20\d{2} \([a-z]{3}-[a-z]{3}\)/)).toBeInTheDocument()
    })

    // Cambia a año
    fireEvent.click(screen.getByText('reports.period.year'))

    // Verifica que el label se actualizó de nuevo (solo año)
    // Pero sin el "de" que aparece en el label de mes
    await waitFor(() => {
      const allTextElements = screen.queryAllByText(/20\d{2}/)
      // Buscar específicamente uno que NO tiene "de" (i.e., es solo el año)
      const yearOnlyLabel = allTextElements.find(el => /^20\d{2}$/.test(el.textContent ?? ''))
      expect(yearOnlyLabel).toBeInTheDocument()
    })
  })
})
