import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ComprasHomePage from './ComprasHomePage'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import type { ComprasHomeSummary } from '@/types/compras'

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

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    home:     { summary: vi.fn() },
    calendar: { list: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi = vi.mocked(comprasApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeSummary(overrides: Partial<ComprasHomeSummary> = {}): ComprasHomeSummary {
  return {
    resumen_mes: {
      comprado_mes: 0, entregado_a_tiempo_percent: null,
      productos_retrasados: 0, bajo_stock: 0, sin_stock: 0,
    },
    pendientes: [],
    ordenes_criticas: [],
    estado_compras: [],
    por_reordenar: [],
    events_today_count: 0,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ComprasHomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.home.summary.mockResolvedValue(makeSummary())
  mockedApi.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
  mockedStore.mockReturnValue({ user: { id: 1, first_name: 'Yirena' } } as never)
})

describe('ComprasHomePage', () => {
  it('muestra el saludo con el nombre como título principal, sin "Inicio" (SCRUM-175)', async () => {
    renderPage()
    expect(await screen.findByText('compras:home.greeting:Yirena')).toBeInTheDocument()
    expect(screen.queryByText('compras:home.title')).not.toBeInTheDocument()
  })

  it('muestra el monto comprado del mes', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      resumen_mes: { comprado_mes: 4500, entregado_a_tiempo_percent: 80, productos_retrasados: 2, bajo_stock: 1, sin_stock: 0 },
    }))
    renderPage()

    expect(await screen.findByText('$4,500')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('sin datos de entrega muestra el aviso, no un porcentaje inventado', async () => {
    renderPage()
    expect(await screen.findByText('compras:home.resumenMes.onTimeUnavailable')).toBeInTheDocument()
  })

  it('clic en "Productos retrasados" navega a Ver Órdenes con chip=critical (REQ-112)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      resumen_mes: { comprado_mes: 0, entregado_a_tiempo_percent: null, productos_retrasados: 3, bajo_stock: 0, sin_stock: 0 },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('3'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes?chip=critical')
  })

  it('clic en "Bajo stock" navega a Inventario con chip=bajo_stock (REQ-112)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      resumen_mes: { comprado_mes: 0, entregado_a_tiempo_percent: null, productos_retrasados: 0, bajo_stock: 5, sin_stock: 0 },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('5'))
    expect(navigateMock).toHaveBeenCalledWith('/inventario?chip=bajo_stock')
  })

  it('lista pendientes y abre el detalle al hacer clic', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: [{
        type: 'orden_sin_aprobar', priority: 'media', order_id: 42,
        provider: 'LightCorp', amount: 500, days: 3, suggestion: 'Aprobar o rechazar la orden.',
      }],
    }))
    renderPage()

    const item = await screen.findByText(/home\.pendientes\.text\.orden_sin_aprobar/)
    fireEvent.click(item)

    expect(await screen.findByText('compras:home.pendientes.detailTitle')).toBeInTheDocument()
    expect(screen.getByText('Aprobar o rechazar la orden.')).toBeInTheDocument()
  })

  it('lista órdenes críticas y abre el detalle al hacer clic', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      ordenes_criticas: [{ order_id: 7, motivo: '9 días sobre el lead time', provider: 'LightCorp', amount: 1200 }],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('#7'))
    expect(await screen.findByText('9 días sobre el lead time')).toBeInTheDocument()
  })

  it('el título de Órdenes críticas navega a Ver Órdenes filtrado (RN1)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('compras:home.ordenesCriticas.title'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes?chip=critical')
  })

  it('Estado de compras muestra las 7 etapas sin navegación (no lo pide REQ-117)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      estado_compras: [
        { stage: 'por_aprobar', count: 2, amount: 300 },
        { stage: 'ordenado', count: 1, amount: 100 },
      ],
    }))
    renderPage()

    expect(await screen.findByText('compras:orders.status.por_aprobar')).toBeInTheDocument()
    expect(screen.getByText('compras:orders.status.ordenado')).toBeInTheDocument()
  })

  it('Generar orden desde Por reordenar navega a Nueva Orden con el mismo formulario completo (REQ-118)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      por_reordenar: [{
        catalog_product_id: 9, reference: 'REORDER-9', description: 'Reflector LED 50W',
        stock_quantity: 2, disponible: 2, reorder_point: 5,
        provider_id: 3, provider_name: 'LightCorp', suggested_quantity: 3, unit_cost: 15,
      }],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('compras:home.porReordenar.generateOrder'))

    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/nueva', {
      state: {
        providerId: 3,
        product: { id: 9, reference: 'REORDER-9', description: 'Reflector LED 50W', unitCost: 15, quantity: 3 },
      },
    })
  })

  it('Generar orden deshabilitado cuando no hay proveedor sugerido', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      por_reordenar: [{
        catalog_product_id: 9, reference: 'REORDER-9', description: 'Reflector LED 50W',
        stock_quantity: 2, disponible: 2, reorder_point: 5,
        provider_id: null, provider_name: null, suggested_quantity: 3, unit_cost: 15,
      }],
    }))
    renderPage()

    const btn = await screen.findByText('compras:home.porReordenar.generateOrder')
    expect(btn.closest('button')).toBeDisabled()
  })

  it('los botones Proveedores y Nueva orden navegan correctamente', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/compras/inicio']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/compras/inicio" element={<ComprasHomePage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('compras:home.actions.providers'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/proveedores')

    fireEvent.click(screen.getByText('compras:home.actions.newOrder'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/nueva')
  })
})
