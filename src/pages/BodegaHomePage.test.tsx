import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaHomePage from './BodegaHomePage'
import { bodegaApi } from '@/api/bodegaApi'
import { useAuthStore } from '@/store/authStore'
import type { BodegaHomeSummary } from '@/types/bodega'

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
    home:     { team: vi.fn(), summary: vi.fn() },
    calendar: { list: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(bodegaApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeSummary(overrides: Partial<BodegaHomeSummary> = {}): BodegaHomeSummary {
  return {
    saludo:              { nombre: 'Asistente Bodega Test 2', fecha: '2026-07-23', resumen: '' },
    mi_dia:              { asignados_hoy: 0, despachados_hoy: 0, percent_despachado_hoy: null, percent_a_tiempo: null },
    mi_calendario:       { events_today_count: 0 },
    pendientes:          { count: 0, items: [] },
    despachos_urgentes:  [],
    estado_pedidos:      { stages: [], urgentes_count: 0 },
    por_recibir:         [],
    mayor_rotacion:      [],
    articulos_criticos:  [],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BodegaHomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.home.summary.mockResolvedValue(makeSummary())
  mockedApi.home.team.mockResolvedValue({ data: [] })
  mockedApi.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
  mockedStore.mockReturnValue({
    user: { id: 1, first_name: 'Asistente Bodega', last_name: 'Test 2', modules: { bodega: { view: true, view_team: false, edit: false, approve: false } } },
  } as never)
})

describe('BodegaHomePage', () => {
  it('saluda con el nombre real del usuario en sesión (REQ-294)', async () => {
    renderPage()
    expect(await screen.findByText('bodega:home.greeting:Asistente Bodega Test 2')).toBeInTheDocument()
  })

  it('muestra el resumen de una línea que viene del backend', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      saludo: { nombre: 'Asistente Bodega Test 2', fecha: '2026-07-23', resumen: 'Tienes 3 pedidos asignados y 2 pendientes hoy.' },
    }))
    renderPage()
    expect(await screen.findByText('Tienes 3 pedidos asignados y 2 pendientes hoy.')).toBeInTheDocument()
  })

  it('no muestra el toggle Equipo para un usuario sin view_team (REQ-295 RN2)', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.home.summary).toHaveBeenCalled())
    expect(screen.queryByText('bodega:home.scope.team')).not.toBeInTheDocument()
  })

  it('muestra el toggle Equipo y "Equipo completo" seleccionado por defecto (REQ-295/296)', async () => {
    mockedStore.mockReturnValue({
      user: { id: 2, first_name: 'Lider Bodega', last_name: 'Test', modules: { bodega: { view: true, view_team: true, edit: false, approve: false } } },
    } as never)
    mockedApi.home.team.mockResolvedValue({ data: [{ id: 10, name: 'Asistente Bodega Test' }] })

    renderPage()
    expect(await screen.findByText('bodega:home.scope.team')).toBeInTheDocument()

    fireEvent.click(screen.getByText('bodega:home.scope.team'))
    expect(await screen.findByText('Asistente Bodega Test')).toBeInTheDocument()
    expect(screen.getByText('bodega:home.team.wholeTeam')).toBeInTheDocument()
  })

  it('SCRUM-797 RN1 — un Líder de Bodega (view_team) arranca en Inicio con scope "team" sin tocar el toggle', async () => {
    mockedStore.mockReturnValue({
      user: { id: 2, first_name: 'Lider Bodega', last_name: 'Test', modules: { bodega: { view: true, view_team: true, edit: false, approve: false } } },
    } as never)

    renderPage()
    await waitFor(() => expect(mockedApi.home.summary).toHaveBeenCalled())
    expect(mockedApi.home.summary).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team' }))
  })

  it('SCRUM-797 RN2 — un usuario regular (sin view_team) arranca en Inicio con scope "own" (comportamiento sin cambios)', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.home.summary).toHaveBeenCalled())
    expect(mockedApi.home.summary).toHaveBeenCalledWith(expect.objectContaining({ scope: 'own' }))
  })

  it('calcula la barra de "Mi día" con datos reales — 5/11 despachados (REQ-297 Escenario 1)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      mi_dia: { asignados_hoy: 11, despachados_hoy: 5, percent_despachado_hoy: 45.5, percent_a_tiempo: 80 },
    }))
    renderPage()

    expect(await screen.findByText('bodega:home.miDia.dispatched:5,11')).toBeInTheDocument()
    expect(await screen.findByText('80%')).toBeInTheDocument()
    expect(await screen.findByText('11')).toBeInTheDocument()
  })

  it('clic en "Pedidos hoy" navega a Pedidos (REQ-297 Escenario 2)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      mi_dia: { asignados_hoy: 11, despachados_hoy: 5, percent_despachado_hoy: 45.5, percent_a_tiempo: 80 },
    }))
    renderPage()

    fireEvent.click(await screen.findByText('11'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/pedidos')
  })

  it('lista pendientes reales con prioridad y contador (REQ-299)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: {
        count: 2,
        items: [
          { type: 'picking_no_iniciado', order_id: 1, order_number: '1001', cliente: 'Constructora del Istmo', horas: 3, suggestion: 'Asignar un picker.' },
          { type: 'guia_sin_subir', order_id: 2, order_number: '1002', cliente: 'Torre Delta', dias: 2, suggestion: 'Subir la guía.' },
        ],
      },
    }))
    renderPage()

    expect(await screen.findByText('bodega:home.pendientes.text.picking_no_iniciado:1001,Constructora del Istmo,3')).toBeInTheDocument()
    expect(await screen.findByText('bodega:home.pendientes.text.guia_sin_subir:1002,Torre Delta,2')).toBeInTheDocument()
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('SCRUM-369 (REQ-299, corrección 2026-08-11) — un pendiente de pedido es clickeable, muestra el detalle y navega al pedido puntual', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: {
        count: 1,
        items: [
          { type: 'picking_no_iniciado', order_id: 77, order_number: '1001', cliente: 'Constructora del Istmo', horas: 3, suggestion: 'Asignar un picker.' },
        ],
      },
    }))
    renderPage()

    fireEvent.click(await screen.findByTestId('pendiente-item-0'))

    const modal = await screen.findByTestId('pendiente-detail-modal')
    expect(modal).toHaveTextContent('#1001')
    expect(modal).toHaveTextContent('Constructora del Istmo')

    fireEvent.click(screen.getByTestId('pendiente-detail-navigate'))
    // RN4 — navega al REGISTRO puntual, no a la pantalla general de Pedidos.
    expect(navigateMock).toHaveBeenCalledWith('/bodega/pedidos?order=77')
    expect(screen.queryByTestId('pendiente-detail-modal')).not.toBeInTheDocument()
  })

  it('SCRUM-369 (REQ-299, corrección 2026-08-11) — un pendiente de ajuste de inventario navega a la línea puntual de Solicitud de Ajuste', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      pendientes: {
        count: 1,
        items: [
          { type: 'ajuste_inventario_pendiente', adjustment_request_line_id: 55, producto: 'Candelabro', bodega: 'Bodega Central', solicitante: 'Jorge P.', dias: 4, suggestion: 'Revisar.' },
        ],
      },
    }))
    renderPage()

    fireEvent.click(await screen.findByTestId('pendiente-item-0'))
    const modal = await screen.findByTestId('pendiente-detail-modal')
    expect(modal).toHaveTextContent('Candelabro')
    expect(modal).toHaveTextContent('Bodega Central')

    fireEvent.click(screen.getByTestId('pendiente-detail-navigate'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/solicitud-ajuste?line=55')
  })

  it('Estado de pedidos: conteos reales por etapa y chip Urgentes recalcula desde despachos_urgentes (REQ-302)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      estado_pedidos: {
        stages: [
          { stage: 'asignado', count: 4 }, { stage: 'picking_pendiente', count: 2 }, { stage: 'en_picking', count: 1 },
          { stage: 'packing', count: 0 }, { stage: 'por_despachar', count: 0 }, { stage: 'despachado', count: 3 },
          { stage: 'entregado', count: 9 },
        ],
        urgentes_count: 1,
      },
      despachos_urgentes: [
        { order_id: 1, order_number: '1001', cliente: 'Constructora del Istmo', fecha_entrega_comprometida: '2026-07-23T17:00:00Z', stage: 'asignado' },
      ],
    }))
    renderPage()

    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(await screen.findByText('9')).toBeInTheDocument()

    fireEvent.click(screen.getByText('bodega:home.estadoPedidos.chips.urgent'))

    await waitFor(() => expect(screen.queryByText('9')).not.toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('"más filtros" navega a Pedidos', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('bodega:home.estadoPedidos.moreFilters'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/pedidos')
  })

  it('Despachos urgentes lista pedidos reales con su etapa (REQ-300)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      despachos_urgentes: [
        { order_id: 5, order_number: '2050', cliente: 'Torre Delta', fecha_entrega_comprometida: '2026-07-23T17:00:00Z', stage: 'packing' },
      ],
    }))
    renderPage()
    expect(await screen.findByText('#2050')).toBeInTheDocument()
    expect(await screen.findByText('Torre Delta', { exact: false })).toBeInTheDocument()
  })

  it('Por recibir marca Zona Libre y navega al detalle de la orden en Compras (REQ-301)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      por_recibir: [
        {
          purchase_order_id: 77, factory_reference: 'REF-1', reference: 'CAND-1', description: 'Candelabro',
          quantity: 10, status: 'en_transito', estimated_arrival_date: '2026-06-29', provider_name: 'LightCorp', is_zona_libre: true,
        },
      ],
    }))
    renderPage()

    expect(await screen.findByText('bodega:home.porRecibir.freeZoneBadge')).toBeInTheDocument()
    fireEvent.click(screen.getByText('bodega:home.porRecibir.viewOrder'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/77')
  })

  it('"Ver los N artículos" de Mayor rotación navega a Inventario filtrado (REQ-303)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      mayor_rotacion: [
        { catalog_product_id: 1, factory_reference: 'F-1', reference: 'REF-1', description: 'Lámpara X', total_salidas: 124 },
      ],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('bodega:home.mayorRotacion.viewAll:1'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/inventario?filter=rotacion')
  })

  it('"Ver los N artículos" de Artículos críticos navega a Inventario filtrado (REQ-304)', async () => {
    mockedApi.home.summary.mockResolvedValue(makeSummary({
      articulos_criticos: [
        { catalog_product_id: 2, factory_reference: 'F-2', reference: 'REF-2', description: 'Foco Y', disponible: 1, reorder_point: 5, estado: 'bajo_stock' },
      ],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('bodega:home.articulosCriticos.viewAll:1'))
    expect(navigateMock).toHaveBeenCalledWith('/bodega/inventario?filter=criticos')
  })
})
