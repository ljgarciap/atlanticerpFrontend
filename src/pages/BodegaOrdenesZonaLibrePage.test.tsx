import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaOrdenesZonaLibrePage from './BodegaOrdenesZonaLibrePage'
import { bodegaApi } from '@/api/bodegaApi'
import { comprasApi } from '@/api/comprasApi'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/store/authStore'
import type { ZonaLibreRequestRow, ZonaLibreRequestDetail } from '@/types/bodega'

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

// SCRUM-440 — Aprobar/Rechazar (Yirena, gateado por `compras.zona-libre.approve`).
vi.mock('@/api/comprasApi', () => ({
  comprasApi: { zonaLibre: { approve: vi.fn(), reject: vi.fn() } },
}))

vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(() => false),
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi = vi.mocked(bodegaApi, true)
const mockedComprasApi = vi.mocked(comprasApi, true)
const mockedUsePermission = vi.mocked(usePermission)
const mockedAuthStore = vi.mocked(useAuthStore)

function makeRow(overrides: Partial<ZonaLibreRequestRow> = {}): ZonaLibreRequestRow {
  return {
    id: 1, order_number: '1160', provider_name: 'Zona Libre de Colón', created_at: '2026-07-10T10:00:00Z',
    products_summary: '2 productos', total_amount: 1095, estimated_arrival_date: '2026-07-24',
    shipping_type: 'terrestre', status: 'pendiente', requested_by_name: 'Jorge P.', generated_order_id: null,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BodegaOrdenesZonaLibrePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUsePermission.mockReturnValue(false)
  mockedAuthStore.mockReturnValue({ user: { id: 1, role: 'asistente_bodega' } } as never)
})

describe('BodegaOrdenesZonaLibrePage', () => {
  it('muestra el mensaje de vacío cuando no hay solicitudes', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    expect(await screen.findByText('bodega:zonaLibre.orders.empty')).toBeInTheDocument()
  })

  it('"+ Nueva orden de compra" navega a 3C', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    await screen.findByText('bodega:zonaLibre.orders.empty')

    fireEvent.click(screen.getByText('bodega:zonaLibre.orders.newOrder'))

    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre/nueva')
  })

  // SCRUM-442 (rebote de Gerencia Test 2026-08-13) — la columna Monto debe llevar separador de
  // miles (formatMoney), mismo gap que el carrito de Nueva Orden Zona Libre (SCRUM-436).
  it('rebote 2026-08-13 — la columna Monto usa separador de miles', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({
      data: [makeRow({ total_amount: 1200.5 })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    expect(await screen.findByText('$1,200.50')).toBeInTheDocument()
  })

  it('REQ-374 — sin permiso compras.zona-libre.approve (Bodega): Recordar/Ver detalle/texto, nunca Aprobar/Rechazar', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({
      data: [
        makeRow({ id: 1, status: 'pendiente' }),
        makeRow({ id: 2, status: 'aprobada', generated_order_id: 55 }),
        makeRow({ id: 3, status: 'rechazada' }),
      ],
      meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    expect(await screen.findByText('bodega:zonaLibre.orders.actions.remind')).toBeInTheDocument()
    expect(screen.getByText('bodega:zonaLibre.orders.actions.followsNormalFlow')).toBeInTheDocument()
    // SCRUM-797 CA6 — "Ver detalle" reemplaza "Ver motivo" y está disponible en TODAS las filas,
    // sin importar el estado (antes solo existía para `rechazada`).
    expect(screen.getAllByText('bodega:zonaLibre.orders.actions.viewDetail')).toHaveLength(3)
    // Sin el permiso, Bodega nunca ve Aprobar/Rechazar (SCRUM-440).
    expect(screen.queryByText('bodega:zonaLibre.orders.actions.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.orders.actions.reject')).not.toBeInTheDocument()
    // SCRUM-797 RN10 — sin ser Líder de Bodega ni tener el permiso de Compras, tampoco ve Editar.
    expect(screen.queryByText('bodega:zonaLibre.orders.actions.edit')).not.toBeInTheDocument()
  })

  it('SCRUM-797 RN10/CA7 — Líder de Bodega ve "Editar" en una fila pendiente, y navega a la ruta de edición', async () => {
    mockedAuthStore.mockReturnValue({ user: { id: 1, role: 'lider_bodega' } } as never)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({
      data: [makeRow({ id: 9, status: 'pendiente' })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.edit'))

    expect(navigateMock).toHaveBeenCalledWith('/bodega/ordenes-zona-libre/9/editar')
  })

  it('SCRUM-797 RN10/CA8 — Líder de Bodega NO ve "Editar" en una orden ya aprobada', async () => {
    mockedAuthStore.mockReturnValue({ user: { id: 1, role: 'lider_bodega' } } as never)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({
      data: [makeRow({ id: 9, status: 'aprobada', generated_order_id: 5 })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await screen.findByText('bodega:zonaLibre.orders.actions.followsNormalFlow')
    expect(screen.queryByText('bodega:zonaLibre.orders.actions.edit')).not.toBeInTheDocument()
  })

  it('SCRUM-797 RN10 — Líder de Compras (permiso compras.zona-libre.approve) también ve "Editar" en una fila pendiente', async () => {
    mockedUsePermission.mockReturnValue(true)
    mockedAuthStore.mockReturnValue({ user: { id: 2, role: 'lider_compras' } } as never)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({
      data: [makeRow({ id: 9, status: 'pendiente' })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    expect(await screen.findByText('bodega:zonaLibre.orders.actions.edit')).toBeInTheDocument()
  })

  it('SCRUM-440 — con permiso compras.zona-libre.approve (Yirena): fila pendiente muestra Aprobar/Rechazar en vez de Recordar', async () => {
    mockedUsePermission.mockReturnValue(true)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ id: 1, status: 'pendiente' })], meta: { total: 4, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()

    expect(await screen.findByText('bodega:zonaLibre.orders.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('bodega:zonaLibre.orders.actions.reject')).toBeInTheDocument()
    expect(screen.queryByText('bodega:zonaLibre.orders.actions.remind')).not.toBeInTheDocument()
  })

  it('SCRUM-440 — Aprobar exitoso llama al endpoint con el id correcto', async () => {
    mockedUsePermission.mockReturnValue(true)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ id: 7, status: 'pendiente' })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    mockedComprasApi.zonaLibre.approve.mockResolvedValue({ order_id: 99 })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.approve'))

    await waitFor(() => expect(mockedComprasApi.zonaLibre.approve).toHaveBeenCalledWith(7))
  })

  it('SCRUM-440 — Rechazar sin motivo bloquea el envío (REQ-370 Escenario 1)', async () => {
    mockedUsePermission.mockReturnValue(true)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ id: 7, status: 'pendiente' })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.reject'))
    await screen.findByText('bodega:zonaLibre.orders.rejectModal.title')
    // Enviar sin escribir motivo.
    const submitButtons = screen.getAllByText('bodega:zonaLibre.orders.actions.reject')
    fireEvent.click(submitButtons[submitButtons.length - 1])

    expect(await screen.findByText('bodega:zonaLibre.orders.rejectModal.reasonRequired')).toBeInTheDocument()
    expect(mockedComprasApi.zonaLibre.reject).not.toHaveBeenCalled()
  })

  it('SCRUM-440 — Rechazar con motivo llama al endpoint con id y motivo correctos', async () => {
    mockedUsePermission.mockReturnValue(true)
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ id: 7, status: 'pendiente' })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    mockedComprasApi.zonaLibre.reject.mockResolvedValue({ message: 'ok' })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.reject'))
    await screen.findByText('bodega:zonaLibre.orders.rejectModal.title')

    fireEvent.change(screen.getByLabelText('bodega:zonaLibre.orders.rejectModal.reasonLabel'), {
      target: { value: 'Presupuesto excedido este mes.' },
    })
    const submitButtons = screen.getAllByText('bodega:zonaLibre.orders.actions.reject')
    fireEvent.click(submitButtons[submitButtons.length - 1])

    await waitFor(() => expect(mockedComprasApi.zonaLibre.reject).toHaveBeenCalledWith(7, 'Presupuesto excedido este mes.'))
  })

  it('cambiar de chip vuelve a pedir la lista con el status correcto (REQ-373 RN1)', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    await waitFor(() => expect(mockedApi.zonaLibre.requests.list).toHaveBeenCalledWith({ status: 'todas', page: 1, per_page: 20 }))

    fireEvent.click(screen.getByText('bodega:zonaLibre.orders.chips.rechazada'))

    await waitFor(() => expect(mockedApi.zonaLibre.requests.list).toHaveBeenCalledWith({ status: 'rechazada', page: 1, per_page: 20 }))
  })

  it('Recordar exitoso muestra confirmación (REQ-375)', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ status: 'pendiente' })], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    mockedApi.zonaLibre.requests.remind.mockResolvedValue({ message: 'ok' })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.remind'))

    expect(await screen.findByText('bodega:zonaLibre.orders.actions.reminderSent')).toBeInTheDocument()
    expect(mockedApi.zonaLibre.requests.remind).toHaveBeenCalledWith(1)
  })

  it('Recordar con 422 (ya no pendiente) muestra el mensaje estructurado del backend', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ status: 'pendiente' })], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    mockedApi.zonaLibre.requests.remind.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'La solicitud ya no está pendiente.' } },
    })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.remind'))

    expect(await screen.findByText('La solicitud ya no está pendiente.')).toBeInTheDocument()
  })

  it('SCRUM-797 CA6/CA8/CA9 — Ver detalle abre el modal con el payload completo (motivo de rechazo, líneas, notas)', async () => {
    mockedApi.zonaLibre.requests.list.mockResolvedValue({ data: [makeRow({ id: 3, status: 'rechazada' })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    const detail: ZonaLibreRequestDetail = {
      ...makeRow({ id: 3, status: 'rechazada' }),
      notes: 'Entrega urgente para el cliente Hotel Riu.',
      approved_by_name: null,
      rejected_by_name: 'Yirena',
      rejection_reason: 'Ya existe una orden similar en camino.',
      lines: [
        { id: 1, catalog_product_id: 10, reference: 'REF-10', factory_reference: 'FAB-10', description: 'Bombillo LED', quantity: 5, unit_cost_snapshot: 12, subtotal: 60 },
      ],
    }
    mockedApi.zonaLibre.requests.get.mockResolvedValue(detail)
    renderPage()

    fireEvent.click(await screen.findByText('bodega:zonaLibre.orders.actions.viewDetail'))

    // Antes de SCRUM-797, este payload ya viajaba desde el backend pero el modal solo mostraba
    // `rejection_reason` — ahora también se ven notas y líneas, que antes se descartaban.
    expect(await screen.findByText('Ya existe una orden similar en camino.')).toBeInTheDocument()
    expect(screen.getByText('Entrega urgente para el cliente Hotel Riu.')).toBeInTheDocument()
    expect(screen.getByText('Bombillo LED')).toBeInTheDocument()
    expect(mockedApi.zonaLibre.requests.get).toHaveBeenCalledWith(3)
  })
})
