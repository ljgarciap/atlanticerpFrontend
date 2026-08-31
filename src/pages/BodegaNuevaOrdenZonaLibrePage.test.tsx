import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import BodegaNuevaOrdenZonaLibrePage from './BodegaNuevaOrdenZonaLibrePage'
import { bodegaApi } from '@/api/bodegaApi'
import { comprasApi } from '@/api/comprasApi'
import type { ZonaLibreRequestDetail } from '@/types/bodega'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    zonaLibre: {
      provider: vi.fn(),
      requests: { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), remind: vi.fn() },
    },
    inventory: { warehouseBreakdown: vi.fn() },
  },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    products: { search: vi.fn() },
  },
}))

const mockedBodegaApi = vi.mocked(bodegaApi, true)
const mockedComprasApi = vi.mocked(comprasApi, true)

const PROVIDER = { id: 5, name: 'Zona Libre de Colón' }
const PRODUCT = {
  id: 10, reference: 'NORDIC-40', factory_reference: 'NRD-40-BLK', name: 'Lámpara colgante Nordic 40cm', description: 'Lámpara colgante Nordic 40cm',
  brand: null, photo_url: null, price_full: 90, cost: 45, stock_quantity: 2, reorder_point: null,
}

function createdOrder(overrides: Partial<ZonaLibreRequestDetail> = {}): ZonaLibreRequestDetail {
  return {
    id: 1, order_number: '1162', provider_name: 'Zona Libre de Colón', created_at: '2026-07-24T10:00:00Z',
    products_summary: 'Lámpara colgante Nordic 40cm', total_amount: 135, estimated_arrival_date: null,
    shipping_type: 'terrestre', status: 'pendiente', requested_by_name: 'Jorge P.', generated_order_id: null,
    notes: null, rejection_reason: null, approved_by_name: null, rejected_by_name: null, lines: [],
    ...overrides,
  }
}

// SCRUM-797 — `initialEntry` opcional para ejercitar el modo edición (`useParams()` solo resuelve
// `:id` si el `MemoryRouter` realmente matchea una ruta con ese patrón, no basta con navegar a una
// URL sin declarar las 2 rutas reales — mismo par que App.tsx.
function renderPage(initialEntry = '/bodega/ordenes-zona-libre/nueva') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/bodega/ordenes-zona-libre/nueva" element={<BodegaNuevaOrdenZonaLibrePage />} />
          <Route path="/bodega/ordenes-zona-libre/:id/editar" element={<BodegaNuevaOrdenZonaLibrePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedBodegaApi.zonaLibre.provider.mockResolvedValue(PROVIDER)
  mockedComprasApi.products.search.mockResolvedValue({ fuzzy: false, data: [PRODUCT] })
})

describe('BodegaNuevaOrdenZonaLibrePage', () => {
  it('muestra el proveedor fijo y el aviso de restricción (SCRUM-433 RN2)', async () => {
    renderPage()
    await waitFor(() => expect(mockedBodegaApi.zonaLibre.provider).toHaveBeenCalled())
    expect(await screen.findAllByText('Zona Libre de Colón')).not.toHaveLength(0)
    expect(screen.getByText(/providerRestrictionNotice/)).toBeInTheDocument()
    // REQ-364 — nunca hay selector de proveedor, solo el nombre fijo.
    expect(screen.queryByRole('combobox', { name: /provider/i })).not.toBeInTheDocument()
  })

  it('agregar con cantidad 0 no agrega la línea y muestra error inline (REQ-364 RN1/Escenario 1)', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.products.errors.zeroQuantity')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.steps.lines')).not.toBeInTheDocument()
    expect(mockedBodegaApi.zonaLibre.requests.create).not.toHaveBeenCalled()
  })

  it('agregar con cantidad fraccionaria (1.5) no agrega la línea y muestra error inline (Pre-QA 2026-07-24)', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.products.errors.zeroQuantity')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.steps.lines')).not.toBeInTheDocument()
    expect(mockedBodegaApi.zonaLibre.requests.create).not.toHaveBeenCalled()
  })

  it('agregar con cantidad válida mueve el producto al carrito, ya no aparece disponible (REQ-365)', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.actions.submit')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.products.add')).not.toBeInTheDocument()
    expect(screen.getByText('bodega:zonaLibre.newOrder.products.empty')).toBeInTheDocument()
    // 3 * $45.00 = $135.00
    expect(screen.getByText('$135.00')).toBeInTheDocument()
  })

  it('editar una línea del carrito a 0 es rechazado y mantiene la cantidad anterior (REQ-366 RN1)', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    fireEvent.click(await screen.findByText('common:actions.edit'))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.lines.errors.invalidQuantity')).toBeInTheDocument()
    expect(screen.getByText('$135.00')).toBeInTheDocument()
  })

  it('editar una línea del carrito a una cantidad fraccionaria (1.5) es rechazado (Pre-QA 2026-07-24)', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    fireEvent.click(await screen.findByText('common:actions.edit'))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.lines.errors.invalidQuantity')).toBeInTheDocument()
    expect(screen.getByText('$135.00')).toBeInTheDocument()
  })

  // SCRUM-436 (rebote de Gerencia Test 2026-08-13) — Cantidad/Costo/Subtotal/Monto total deben
  // llevar separador de miles (formatMoney/formatInt de src/lib/money.ts), no solo decimales.
  it('rebote 2026-08-13 — Cantidad/Costo/Subtotal/Monto total del carrito usan separador de miles', async () => {
    mockedComprasApi.products.search.mockResolvedValue({
      fuzzy: false,
      data: [{ ...PRODUCT, id: 11, description: 'Candelabro Cristal Imperial', cost: 1200.5 }],
    })
    renderPage()
    await screen.findByText('Candelabro Cristal Imperial')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2000' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))

    await screen.findByText('bodega:zonaLibre.newOrder.actions.submit')

    // Cantidad: 2,000 (con separador de miles, no "2000").
    expect(screen.getByText('2,000')).toBeInTheDocument()
    // Costo unitario: $1,200.50.
    expect(screen.getByText('$1,200.50')).toBeInTheDocument()
    // Subtotal: 2000 * 1200.50 = $2,401,000.00.
    expect(screen.getByText('$2,401,000.00')).toBeInTheDocument()
    // Monto total (mismo valor, única línea en el carrito).
    expect(screen.getByText(/lines\.total.*\$2,401,000\.00/)).toBeInTheDocument()
  })

  it('quitar una línea del carrito la devuelve a la tabla de disponibles', async () => {
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))
    await screen.findByText('bodega:zonaLibre.newOrder.actions.submit')

    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.lines.remove'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.products.add')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.actions.submit')).not.toBeInTheDocument()
  })

  it('guardar la orden muestra el panel de confirmación con el estado pendiente (REQ-369/REQ-441)', async () => {
    mockedBodegaApi.zonaLibre.requests.create.mockResolvedValue(createdOrder())
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))
    fireEvent.click(await screen.findByText('bodega:zonaLibre.newOrder.actions.submit'))

    expect(await screen.findByText('bodega:zonaLibre.newOrder.success.pendingLabel')).toBeInTheDocument()
    expect(mockedBodegaApi.zonaLibre.requests.create).toHaveBeenCalledWith(expect.objectContaining({
      shipping_type: 'terrestre',
      lines: [{ catalog_product_id: 10, quantity: 3 }],
    }))
  })

  it('"Ir a Ver Órdenes" navega a la bandeja 3D', async () => {
    mockedBodegaApi.zonaLibre.requests.create.mockResolvedValue(createdOrder())
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))
    fireEvent.click(await screen.findByText('bodega:zonaLibre.newOrder.actions.submit'))
    await screen.findByText('bodega:zonaLibre.newOrder.success.pendingLabel')

    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.success.goToOrders'))

    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre')
  })

  it('"Crear una nueva" reinicia el formulario sin navegar (RN1 REQ-371)', async () => {
    mockedBodegaApi.zonaLibre.requests.create.mockResolvedValue(createdOrder())
    renderPage()
    await screen.findByText('Lámpara colgante Nordic 40cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.products.add'))
    fireEvent.click(await screen.findByText('bodega:zonaLibre.newOrder.actions.submit'))
    await screen.findByText('bodega:zonaLibre.newOrder.success.pendingLabel')

    fireEvent.click(screen.getByText('bodega:zonaLibre.newOrder.success.createNew'))

    expect(navigateMock).not.toHaveBeenCalled()
    expect(await screen.findByText('bodega:zonaLibre.newOrder.steps.products')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.actions.submit')).not.toBeInTheDocument()
  })

  it('muestra error cuando no hay proveedor de Zona Libre configurado (422)', async () => {
    mockedBodegaApi.zonaLibre.provider.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'No hay proveedor de Zona Libre configurado.' } },
    })
    renderPage()
    expect(await screen.findByText('No hay proveedor de Zona Libre configurado.')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.steps.products')).not.toBeInTheDocument()
  })

  // ── Modo edición (SCRUM-797, revierte SCRUM-440) ──────────────────────────────

  it('SCRUM-797 — modo edición precarga el carrito y los datos de envío desde la solicitud existente', async () => {
    mockedBodegaApi.zonaLibre.requests.get.mockResolvedValue(createdOrder({
      id: 7, order_number: '1170', status: 'pendiente', shipping_type: 'aereo', estimated_arrival_date: '2026-09-01',
      lines: [{ id: 1, catalog_product_id: 10, reference: 'NORDIC-40', factory_reference: 'NRD-40-BLK', description: 'Lámpara colgante Nordic 40cm', quantity: 4, unit_cost_snapshot: 45, subtotal: 180 }],
    }))
    renderPage('/bodega/ordenes-zona-libre/7/editar')

    // La línea precargada aparece en la tabla de "Productos en esta orden", con su cantidad real.
    expect(await screen.findByText('bodega:zonaLibre.newOrder.actions.submitEdit')).toBeInTheDocument()
    expect(screen.getAllByText('Lámpara colgante Nordic 40cm').length).toBeGreaterThan(0)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(mockedBodegaApi.zonaLibre.requests.get).toHaveBeenCalledWith(7)
  })

  it('SCRUM-797 CA7 — guardar en modo edición llama a update() con el id y navega a la bandeja (sin pantalla de éxito)', async () => {
    mockedBodegaApi.zonaLibre.requests.get.mockResolvedValue(createdOrder({
      id: 7, order_number: '1170', status: 'pendiente',
      lines: [{ id: 1, catalog_product_id: 10, reference: 'NORDIC-40', factory_reference: 'NRD-40-BLK', description: 'Lámpara colgante Nordic 40cm', quantity: 4, unit_cost_snapshot: 45, subtotal: 180 }],
    }))
    mockedBodegaApi.zonaLibre.requests.update.mockResolvedValue(createdOrder({ id: 7, status: 'pendiente' }))
    renderPage('/bodega/ordenes-zona-libre/7/editar')

    fireEvent.click(await screen.findByText('bodega:zonaLibre.newOrder.actions.submitEdit'))

    await waitFor(() => expect(mockedBodegaApi.zonaLibre.requests.update).toHaveBeenCalledWith(7, expect.objectContaining({
      lines: [{ catalog_product_id: 10, quantity: 4 }],
    })))
    expect(mockedBodegaApi.zonaLibre.requests.create).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre')
    // REQ-371/CA7 — el modo edición no muestra el panel de éxito de "Nueva Orden".
    expect(screen.queryByText('bodega:zonaLibre.newOrder.success.pendingLabel')).not.toBeInTheDocument()
  })

  it('SCRUM-797 CA8/CA9 — modo edición bloquea el formulario si la solicitud ya no está pendiente', async () => {
    mockedBodegaApi.zonaLibre.requests.get.mockResolvedValue(createdOrder({ id: 7, status: 'aprobada' }))
    renderPage('/bodega/ordenes-zona-libre/7/editar')

    expect(await screen.findByText('bodega:zonaLibre.newOrder.editBlocked:{"status":"bodega:zonaLibre.orders.status.aprobada"}')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.newOrder.steps.products')).not.toBeInTheDocument()
  })
})
