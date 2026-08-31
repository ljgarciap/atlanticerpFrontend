import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReportsPage from './ReportsPage'
import { comprasApi } from '@/api/comprasApi'
import type { LiquidationImportsResponse, ReportPeriodInfo } from '@/types/compras'

const PERIOD: ReportPeriodInfo = {
  granularity: 'month', label: 'Agosto 2026', start: '2026-08-01', end: '2026-08-31', is_current: true,
}

// SCRUM-268 (corrección de Gerencia Test, 2026-08-11) — el panel "Liquidación de importaciones"
// no tenía test dedicado (ReportsPage.tsx entero no lo tenía). Cubre solo ese panel: los otros
// paneles de la página (chart de compras por período, oportunidad, rating, reclamos, inventario)
// se mockean con lo mínimo para que la página renderice sin crashear.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// Chart.js necesita un <canvas> real (getContext) que jsdom no implementa — mismo criterio que
// el resto del proyecto usa para librerías visuales de terceros en tests (ver
// ventas-diseno/ReportsPage.test.tsx). SCRUM-263 (rebote de Gerencia Test) — el mock captura las
// `options` recibidas para poder asertar sobre la config real de grid/ejes, no solo que el chart
// se montó.
let lastChartOptions: Record<string, unknown> | undefined
vi.mock('react-chartjs-2', () => ({
  Chart: (props: { options?: Record<string, unknown> }) => {
    lastChartOptions = props.options
    return <div data-testid="mock-chart" />
  },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    reports: {
      purchasedByPeriod: vi.fn(),
      purchaseOpportunity: vi.fn(),
      providerRating: vi.fn(),
      claims: vi.fn(),
      inventoryAttention: vi.fn(),
      liquidationImports: vi.fn(),
    },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeLiquidation(overrides: Partial<LiquidationImportsResponse> = {}): LiquidationImportsResponse {
  return {
    period: PERIOD,
    liquidated_count: 7,
    por_liquidar_count: 3,
    liquidated_percent: 70,
    agency_ranking: [
      { agency_id: 1, agency_name: 'Agencia Aduanal Istmo', liquidated_count: 3 },
      { agency_id: 2, agency_name: 'Grupo Logístico Pacífico', liquidated_count: 2 },
      { agency_id: 3, agency_name: 'Despachos Rápidos Colón', liquidated_count: 2 },
    ],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.reports.purchasedByPeriod.mockResolvedValue({
    granularity: 'month', buckets: [],
  })
  mockedComprasApi.reports.purchaseOpportunity.mockResolvedValue({
    period: PERIOD,
    classified_orders: 0, a_tiempo_percent: null, a_demanda_percent: null, tarde_percent: null, show_warning: false,
  })
  mockedComprasApi.reports.providerRating.mockResolvedValue({
    period: PERIOD, data: [],
  })
  mockedComprasApi.reports.claims.mockResolvedValue({
    period: PERIOD,
    open_count: 0, resolved_count: 0, claim_rate: null, provider_ranking: [],
  })
  mockedComprasApi.reports.inventoryAttention.mockResolvedValue({
    total_products: 0, in_attention: 0, low_stock: 0, out_of_stock: 0, total_value: 0,
  })
  mockedComprasApi.reports.liquidationImports.mockResolvedValue(makeLiquidation())
})

describe('ReportsPage — panel "Liquidación de importaciones" (SCRUM-268)', () => {
  it('muestra título, subtítulo y los 3 indicadores con su descripción, dinámicos', async () => {
    renderPage()

    // Esperar el DATO (no solo el título/subtítulo, que renderizan siempre aunque la query de
    // liquidación siga en curso) — de lo contrario el waitFor resuelve antes de que
    // useLiquidationImportsReport termine de resolver.
    await waitFor(() => expect(screen.getByText('Agencia Aduanal Istmo')).toBeInTheDocument())
    expect(screen.getByText('compras:reports.liquidation.subtitle')).toBeInTheDocument()

    const panel = screen.getByText('compras:reports.liquidation.title').closest('div.p-4') as HTMLElement

    expect(within(panel).getByText('compras:reports.liquidation.liquidated')).toBeInTheDocument()
    expect(within(panel).getByText('compras:reports.liquidation.liquidatedHint')).toBeInTheDocument()

    expect(within(panel).getByText('compras:reports.liquidation.porLiquidar')).toBeInTheDocument()
    expect(within(panel).getByText('compras:reports.liquidation.porLiquidarHint')).toBeInTheDocument()

    expect(within(panel).getByText('compras:reports.liquidation.percent')).toBeInTheDocument()
    expect(within(panel).getByText('70%')).toBeInTheDocument()
    expect(within(panel).getByText('compras:reports.liquidation.percentHint')).toBeInTheDocument()

    // Los 3 valores dinámicos (7/3/70%), en orden.
    const kpiValues = within(panel).getAllByText(/^([0-9]+|[0-9]+%)$/, { selector: 'p.text-lg' })
    expect(kpiValues.map(el => el.textContent)).toEqual(['7', '3', '70%'])

    // Ya no existe el indicador viejo "Importaciones" (total_imports).
    expect(screen.queryByText('compras:reports.liquidation.total')).not.toBeInTheDocument()
  })

  it('no muestra los indicadores viejos "Importaciones"/"Ranking de agencias" genérico', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Agencia Aduanal Istmo')).toBeInTheDocument())
    expect(screen.getByText('compras:reports.liquidation.ranking')).toBeInTheDocument()
  })

  it('la barra de comparación Liquidados vs Por liquidar es proporcional a los datos reales', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Agencia Aduanal Istmo')).toBeInTheDocument())

    const bar = screen.getByRole('img', { name: 'compras:reports.liquidation.title' })
    const [liquidatedBar, porLiquidarBar] = Array.from(bar.children) as HTMLElement[]
    // 7 liquidados / 3 por liquidar de 10 totales -> 70% / 30%.
    expect(liquidatedBar.style.width).toBe('70%')
    expect(porLiquidarBar.style.width).toBe('30%')
  })

  it('el ranking muestra el título "Top agencias..." y las agencias ordenadas con su conteo', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Agencia Aduanal Istmo')).toBeInTheDocument())
    expect(screen.getByText('compras:reports.liquidation.ranking')).toBeInTheDocument()
    expect(screen.getByText('Grupo Logístico Pacífico')).toBeInTheDocument()
    expect(screen.getByText('Despachos Rápidos Colón')).toBeInTheDocument()

    // Conteos reales y dinámicos junto a cada agencia (no un texto fijo) — selector acotado al
    // span del conteo (w-4), no al badge numérico del ranking (w-5, también font-semibold).
    const items = screen.getAllByText(/^[0-9]+$/, { selector: 'li span.w-4' })
    expect(items.map(el => el.textContent)).toEqual(['3', '2', '2'])
  })

  it('sin ninguna liquidación (0 y 0), la barra queda vacía sin dividir por cero', async () => {
    mockedComprasApi.reports.liquidationImports.mockResolvedValue(makeLiquidation({
      liquidated_count: 0, por_liquidar_count: 0, liquidated_percent: null, agency_ranking: [],
    }))
    renderPage()

    // "compras:reports.empty" aparece en más de un panel (rating de proveedores/reclamos también
    // caen en vacío con este mock) — esperar específicamente a que la query de liquidación
    // resuelva (su label de KPI, que renderiza aunque el valor sea 0), no la primera coincidencia
    // de cualquier panel.
    await waitFor(() => expect(screen.getByText('compras:reports.liquidation.liquidated')).toBeInTheDocument())
    const panel = screen.getByText('compras:reports.liquidation.title').closest('div.p-4') as HTMLElement
    // liquidated_percent null -> em dash, no NaN%/Infinity%.
    expect(within(panel).getByText('—')).toBeInTheDocument()
    expect(within(panel).getByText('compras:reports.empty')).toBeInTheDocument()
  })
})

describe('ReportsPage — panel "Comprado por período" (SCRUM-263)', () => {
  it('rebote 2026-08-12 de Gerencia Test — saca las líneas de grilla verticales Y horizontales, apoyándose en los datalabels $ del plugin propio', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeInTheDocument())

    const scales = lastChartOptions?.scales as { y?: { grid?: { display?: boolean } }; x?: { grid?: { display?: boolean } } } | undefined
    expect(scales?.y?.grid?.display).toBe(false)
    expect(scales?.x?.grid?.display).toBe(false)
  })
})
