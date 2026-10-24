import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReportesPage from './ReportesPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { ReportsFelixCommission, ReportsCartera, ReportsVentas, ReportsFlujoCaja, ReportsComisiones, ReportsNotasCredito } from '@/types/adminContab'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

// Batch 22 (SCRUM-643→647, REQ-566→570) + Batch 23 completo (SCRUM-648→650, REQ-571→573) — home
// de Reportes, 11 tarjetas: las 7 con dato/gráfico propio (Comisión Contabilidad, Cartera por cobrar,
// Cobrado de cartera +90 días, Ventas, Arqueo de Caja, Comisiones, Notas de Crédito) + 4 de
// navegación pura a los sub-reportes (REQ-573). Cubre: render básico de las 7 con datos mockeados,
// la regla más importante de cada batch — el selector de período recalcula Ventas+Arqueo de
// Caja+Comisiones, nunca Comisión Contabilidad/Cartera/Notas de Crédito — y que las 4 tarjetas de
// navegación estén presentes y naveguen a su ruta real.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// Chart.js necesita un <canvas> real (getContext) que jsdom no implementa — mismo criterio que
// pages/compras/ReportsPage.test.tsx / pages/ventas-diseno/ReportsPage.test.tsx.
vi.mock('react-chartjs-2', () => ({
  Chart: () => <div data-testid="mock-chart" />,
}))

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    reports: {
      felixCommission: vi.fn(),
      cartera: vi.fn(),
      ventas: vi.fn(),
      flujoCaja: vi.fn(),
      comisiones: vi.fn(),
      notasCredito: vi.fn(),
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Contabilidad', last_name: 'Test', email: 'felix@atlantic.com.pa',
    role: 'lider_admin_contab', permissions: [],
    modules: { admin_contab: { view: true, view_team: true, edit: false, approve: false } },
    ...overrides,
  } as UserInfo
}

function makeFelixCommission(overrides: Partial<ReportsFelixCommission> = {}): ReportsFelixCommission {
  return {
    cobrado_mes: 8400, rango_actual: 'Menos de $15K', porcentaje: 1, comision: 84,
    tiers: [
      // Topes exclusivos con .99 como en la tabla paramétrica real (cartera_commission_tiers),
      // no boundaries redondos — SCRUM-870 p2: "Menos de $14999.99" debe leerse "$15K", no "$14K".
      { monto_minimo: 0, monto_maximo: 14999.99, porcentaje: 1, orden: 1, es_actual: true },
      { monto_minimo: 15000, monto_maximo: 19999.99, porcentaje: 1.5, orden: 2, es_actual: false },
      { monto_minimo: 20000, monto_maximo: null, porcentaje: 2, orden: 3, es_actual: false },
    ],
    ...overrides,
  }
}

function makeCartera(overrides: Partial<ReportsCartera> = {}): ReportsCartera {
  return {
    aging: {
      ranges: [
        { desde_dias: 0, hasta_dias: 30, cantidad: 5, monto: 22100 },
        { desde_dias: 31, hasta_dias: 60, cantidad: 2, monto: 11300 },
        { desde_dias: 61, hasta_dias: 90, cantidad: 1, monto: 5600 },
        { desde_dias: 91, hasta_dias: null, cantidad: 1, monto: 2800 },
      ],
    },
    cobrado_90: { cobrado_mes: 8400, pendiente: 2800 },
    ...overrides,
  }
}

function makeVentasHoy(): ReportsVentas {
  return { periodo: 'hoy', tipo: 'hoy', hoy: 3100, promedio_diario_mes_anterior: 2831.8 }
}

function makeFlujoCajaHoy(): ReportsFlujoCaja {
  return { saldo_disponible_hoy: 28740, saldo_proyectado_30_dias: 40740, periodo: 'hoy', tipo: 'hoy', hoy: { entradas: 2200, salidas: 1500, neto: 700 } }
}

function makeComisionesHoy(): ReportsComisiones {
  return { periodo: 'hoy', tipo: 'hoy', hoy: { internas: 133, externas: 25 } }
}

function makeNotasCredito(): ReportsNotasCredito {
  return {
    motivos: [
      { motivo: 'Devolución de mercancía', monto: 2082 },
      { motivo: 'Descuento comercial', monto: 612 },
      { motivo: 'Anulación — Pedido cancelado', monto: 8250 },
      { motivo: 'Anulación — Corrección de datos', monto: 4000 },
    ],
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReportesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  navigateMock.mockClear()
  mockedApi.reports.felixCommission.mockResolvedValue(makeFelixCommission())
  mockedApi.reports.cartera.mockResolvedValue(makeCartera())
  mockedApi.reports.ventas.mockResolvedValue(makeVentasHoy())
  mockedApi.reports.flujoCaja.mockResolvedValue(makeFlujoCajaHoy())
  mockedApi.reports.comisiones.mockResolvedValue(makeComisionesHoy())
  mockedApi.reports.notasCredito.mockResolvedValue(makeNotasCredito())
  mockedStore.mockReturnValue({ user: makeUser() } as ReturnType<typeof useAuthStore>)
})

describe('ReportesPage', () => {
  it('renders the 7 cards with fetched data', async () => {
    renderPage()

    await waitFor(() => expect(screen.getAllByText(/8,400\.00/).length).toBeGreaterThan(0)) // Contabilidad + Cartera 90 comparten el monto
    expect(screen.getByText('Menos de $15K')).toBeInTheDocument()
    expect(screen.getByText(/84\.00/)).toBeInTheDocument()
    expect(screen.getByText(/3,100\.00/)).toBeInTheDocument() // Ventas hoy
    expect(screen.getByText(/28,740\.00/)).toBeInTheDocument() // saldo hoy
    expect(screen.getByText(/40,740\.00/)).toBeInTheDocument() // proyectado 30 días
    expect(screen.getByText(/133\.00/)).toBeInTheDocument() // Comisiones internas hoy
    expect(screen.getByText(/25\.00/)).toBeInTheDocument() // Comisiones externas hoy
    // Notas de Crédito siempre renderiza como gráfico (los 4 motivos van en las labels del chart,
    // no como texto DOM aparte) — Cartera por cobrar también siempre es gráfico (donut). Con
    // período "hoy" (Ventas/Arqueo/Comisiones muestran KPIs, no barras), estos 2 son los únicos
    // `mock-chart` esperados.
    expect(screen.getAllByTestId('mock-chart')).toHaveLength(2)
  })

  it('SCRUM-870: Contabilidad commission tiers show the compact K format, not full USD amounts', async () => {
    renderPage()
    // tiers: [0–14999.99 @1%, 15000–19999.99 @1.5%, 20000–null @2%] — ver makeFelixCommission().
    // "Menos de" usa tope exclusivo (ceil) → $15K; los cerrados/pisos truncan → $15K–$19K / $20K.
    expect(await screen.findByText('adminContab:reportes.felixCommission.tramoMenosDe:hasta=$15K:pct=1')).toBeInTheDocument()
    expect(screen.getByText('adminContab:reportes.felixCommission.tramoRango:desde=$15K:hasta=$19K:pct=1.5')).toBeInTheDocument()
    expect(screen.getByText('adminContab:reportes.felixCommission.tramoDesde:desde=$20K:pct=2')).toBeInTheDocument()
  })

  it('changing the period refetches Ventas, Arqueo de Caja and Comisiones, never Contabilidad commission, Cartera or Notas de Crédito', async () => {
    renderPage()

    await waitFor(() => expect(mockedApi.reports.ventas).toHaveBeenCalledTimes(1))
    expect(mockedApi.reports.ventas).toHaveBeenCalledWith('hoy')
    expect(mockedApi.reports.flujoCaja).toHaveBeenCalledWith('hoy')
    expect(mockedApi.reports.comisiones).toHaveBeenCalledWith('hoy')
    expect(mockedApi.reports.felixCommission).toHaveBeenCalledTimes(1)
    expect(mockedApi.reports.cartera).toHaveBeenCalledTimes(1)
    expect(mockedApi.reports.notasCredito).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6m' } })

    await waitFor(() => expect(mockedApi.reports.ventas).toHaveBeenCalledWith('6m'))
    expect(mockedApi.reports.flujoCaja).toHaveBeenCalledWith('6m')
    expect(mockedApi.reports.comisiones).toHaveBeenCalledWith('6m')

    // Comisión Contabilidad, Cartera y Notas de Crédito nunca vuelven a pedirse — su query key no depende del período.
    expect(mockedApi.reports.felixCommission).toHaveBeenCalledTimes(1)
    expect(mockedApi.reports.cartera).toHaveBeenCalledTimes(1)
    expect(mockedApi.reports.notasCredito).toHaveBeenCalledTimes(1)
  })

  it('renders the 4 sub-report navigation cards (REQ-573) and navigates to their real routes', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText(/8,400\.00/)).toBeInTheDocument())

    expect(screen.getByText('adminContab:reportes.subReportes.mensualCliente.title')).toBeInTheDocument()
    expect(screen.getByText('adminContab:reportes.subReportes.acumulado.title')).toBeInTheDocument()
    expect(screen.getByText('adminContab:reportes.subReportes.libroFacturas.title')).toBeInTheDocument()
    expect(screen.getByText('adminContab:reportes.subReportes.ventasMedioPago.title')).toBeInTheDocument()

    fireEvent.click(screen.getByText('adminContab:reportes.subReportes.libroFacturas.title'))
    expect(navigateMock).toHaveBeenCalledWith('/admin-contab/reportes/libro-facturas')
  })

  // SCRUM-881 (Pre-QA, 2026-09-11) -- rebote: el backend ya bloqueaba GET /reports/felix-commission
  // para asistente_administrativa (routes/admin-contab.php), pero esta tarjeta se renderizaba sin
  // ningun gate de rol -- Asistente Administrativa veia el titulo "-- Contabilidad" con el cuerpo vacio (fetch en 403).
  it('hides the Contabilidad commission card for asistente_administrativa (SCRUM-881)', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'asistente_administrativa' }) } as ReturnType<typeof useAuthStore>)
    renderPage()

    await waitFor(() => expect(screen.getAllByText(/22,100\.00/).length).toBeGreaterThan(0)) // Cartera por cobrar SI se ve
    expect(screen.queryByText('adminContab:reportes.felixCommission.title')).not.toBeInTheDocument()
    expect(mockedApi.reports.felixCommission).not.toHaveBeenCalled()
  })

  it('keeps showing the Contabilidad commission card for lider_admin_contab and management', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'management' }) } as ReturnType<typeof useAuthStore>)
    renderPage()

    await waitFor(() => expect(screen.getByText('adminContab:reportes.felixCommission.title')).toBeInTheDocument())
  })
})
