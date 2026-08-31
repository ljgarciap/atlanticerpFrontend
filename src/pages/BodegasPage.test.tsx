import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BodegasPage from './BodegasPage'
import { bodegaApi } from '@/api/bodegaApi'
import { comprasApi } from '@/api/comprasApi'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { PhysicalWarehouse, RelocationRequestListResponse, WarehouseDetailResponse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    warehouses: {
      list: vi.fn(),
      show: vi.fn(),
      locations: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
    relocations: { list: vi.fn(), create: vi.fn(), approve: vi.fn(), reject: vi.fn() },
  },
}))

// SCRUM-458 — "Mark" (`compras_settings.primary_approver_user_id`) es un concepto compartido entre
// Compras y Bodega (mismo patrón ya probado en PurchaseOrderPaymentsPanel.test.tsx).
vi.mock('@/api/comprasApi', () => ({
  comprasApi: { settings: { get: vi.fn() } },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { catalogProductFamilies: { list: vi.fn() } },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedBodegaApi = vi.mocked(bodegaApi, true)
const mockedComprasApi = vi.mocked(comprasApi, true)
const mockedVentasDisenoApi = vi.mocked(ventasDisenoApi, true)
const mockedUseAuthStore = vi.mocked(useAuthStore)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BodegasPage />
    </QueryClientProvider>,
  )
}

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta' },
  { id: 2, name: 'Bodega Zona Libre', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente' },
  { id: 3, name: 'Showroom Cliente', responsable: null, capacidad_pct: null, modo_detalle: 'cliente' },
]

function detailResponse(overrides: Partial<WarehouseDetailResponse> = {}): WarehouseDetailResponse {
  return {
    warehouse: WAREHOUSES[0],
    kpis: { responsable: 'Jorge P.', total_products: 1, total_units: 8, capacidad_pct: 68 },
    ubicaciones: ['A-1-03'],
    data: [{
      stock_id: 1, catalog_product_id: 99, factory_reference: 'CAND-CRIS-IMP', reference: 'CRISTAL-IMPERIAL',
      ubicacion: 'A-1-03', description: 'Candelabro Cristal Imperial', categoria: 'Candelabros y Colgantes',
      unidades_en_bodega: 8,
      disponible: 12, por_servir: 3, stock_total: 15, por_ingresar: 0, en_camino: 0,
      stock_minimo: 10, estado: 'disponible', proveedor: 'LightCorp',
    }],
    // SCRUM-754 (rebote 2026-08-18) — "Bodega → Bodegas" pasa a paginar desde el backend.
    meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

const EMPTY_RELOCATIONS: RelocationRequestListResponse = {
  data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedVentasDisenoApi.catalogProductFamilies.list.mockResolvedValue({ data: [] })
  mockedBodegaApi.relocations.list.mockResolvedValue(EMPTY_RELOCATIONS)
  mockedBodegaApi.warehouses.locations.list.mockResolvedValue({ data: [] })
  // Default: `primary_approver_user_id` sin configurar todavía — Aprobar/Rechazar quedan visibles
  // para no bloquear un entorno sin ese ajuste hecho (mismo default que PurchaseOrderPaymentsPanel).
  mockedComprasApi.settings.get.mockResolvedValue({ primary_approver_user_id: null } as never)
  mockedUseAuthStore.mockReturnValue(1 as never)
})

describe('BodegasPage', () => {
  it('lista las 7 pestañas de bodega y selecciona Bodega Central por defecto', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()

    expect(await screen.findByText('Bodega Central')).toBeInTheDocument()
    expect(screen.getByText('Bodega Zona Libre')).toBeInTheDocument()
    expect(screen.getByText('Showroom Cliente')).toBeInTheDocument()
    await waitFor(() => expect(mockedBodegaApi.warehouses.show).toHaveBeenCalledWith(1, expect.anything()))
  })

  // Mejora SCRUM-752 RN2 (Gerencia Test 2026-08-13) — rebote sobre el comportamiento anterior
  // (Visual Review 2026-07-24): antes esta celda mostraba "Ver detalle" deshabilitado en bodegas
  // modo "pendiente" (Zona Libre); ahora no debe existir NINGUNA acción, ni "Reubicar" ni
  // "Ver detalle" — celda vacía.
  it('no muestra ninguna acción (ni Reubicar ni Ver detalle) en una bodega modo pendiente', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse({
      warehouse: WAREHOUSES[1],
      data: [{
        stock_id: 3, catalog_product_id: 77, factory_reference: null, reference: 'PENDIENTE-1',
        ubicacion: null, description: 'Producto en Zona Libre', categoria: null,
        unidades_en_bodega: 5, disponible: 5,
        por_servir: 0, stock_total: 5, por_ingresar: 0, en_camino: 0, stock_minimo: null,
        estado: 'disponible', proveedor: null,
      }],
    }))

    renderPage()

    await waitFor(() => expect(screen.getByText('PENDIENTE-1')).toBeInTheDocument())
    expect(screen.queryByText('bodega:warehouses.table.viewDetail')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.table.relocate')).not.toBeInTheDocument()
  })

  // Mejora SCRUM-752 RN4/RN5 — tope client-side sobre las unidades reales de la bodega de origen.
  it('rechaza client-side una cantidad mayor a las unidades disponibles en la bodega de origen', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse()) // unidades_en_bodega: 8

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.table.relocate'))
    await screen.findByText('bodega:warehouses.relocateModal.title')

    const quantityInput = screen.getByRole('spinbutton')
    fireEvent.change(quantityInput, { target: { value: '20' } })
    fireEvent.click(screen.getByText('bodega:warehouses.relocateModal.submit'))

    expect(await screen.findByText('bodega:warehouses.relocateModal.errors.maxQuantity:{"max":8}')).toBeInTheDocument()
    expect(mockedBodegaApi.relocations.create).not.toHaveBeenCalled()
  })

  it('muestra "Sin dato (pendiente)" cuando capacidad_pct es null', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(
      detailResponse({ kpis: { responsable: null, total_products: 0, total_units: 0, capacidad_pct: null } }),
    )

    renderPage()

    expect(await screen.findByText('bodega:warehouses.kpis.noData')).toBeInTheDocument()
  })

  it('muestra columna Cliente en vez de Ubicación en modo cliente', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse({
      warehouse: WAREHOUSES[2],
      data: [{
        stock_id: 2, catalog_product_id: 55, factory_reference: null, reference: 'BAUHAUS', ubicacion: null,
        description: 'Lámpara de mesa Bauhaus', categoria: null, unidades_en_bodega: 14, disponible: 14, por_servir: 0,
        stock_total: 14, por_ingresar: 0, en_camino: 0, stock_minimo: 8, estado: 'disponible',
        proveedor: 'LightCorp', cliente: 'Constructora Pacífico SA',
      }],
    }))

    renderPage()

    expect(await screen.findByText('Constructora Pacífico SA')).toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.table.location')).not.toBeInTheDocument()
  })

  // SCRUM-454 — el chip "Espacio libre" ahora trae datos reales (ubicaciones vacías), el backend
  // ya no responde `not_implemented`.
  it('chip Espacio libre renderiza la tabla de ubicaciones vacías, no el panel "not implemented"', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockImplementation((_id, params) => {
      if (params?.chip === 'espacio_libre') {
        return Promise.resolve(detailResponse({
          data: [{ id: 10, ubicacion: 'B-2-01', estado: 'disponible' }],
          ubicaciones: [],
        }))
      }
      return Promise.resolve(detailResponse())
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.chips.freeSpace'))

    expect(await screen.findByText('B-2-01')).toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.notImplemented')).not.toBeInTheDocument()
  })

  it('chip Espacio libre muestra el mensaje de vacío cuando no hay ubicaciones libres', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockImplementation((_id, params) => {
      if (params?.chip === 'espacio_libre') {
        return Promise.resolve(detailResponse({ data: [], ubicaciones: [] }))
      }
      return Promise.resolve(detailResponse())
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.chips.freeSpace'))

    expect(await screen.findByText('bodega:warehouses.freeSpace.empty')).toBeInTheDocument()
  })

  // SCRUM-457 — el botón "Reubicar" ya no está deshabilitado; abre el modal y excluye la bodega
  // actual del selector de destino.
  it('el botón Reubicar abre el modal y excluye la bodega actual del selector de destino', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()

    const relocateButton = await screen.findByText('bodega:warehouses.table.relocate')
    expect(relocateButton.closest('button')).not.toBeDisabled()
    fireEvent.click(relocateButton)

    expect(await screen.findByText('bodega:warehouses.relocateModal.title')).toBeInTheDocument()
    // Bodega Central (id 1, la bodega activa) no debe aparecer como opción de destino.
    // Mejora SCRUM-752 RN1 — Bodega Zona Libre ('pendiente') tampoco, en ningún caso.
    const destinationSelect = screen.getByDisplayValue('bodega:warehouses.relocateModal.selectDestination')
    expect(within(destinationSelect).queryByText('Bodega Central')).not.toBeInTheDocument()
    expect(within(destinationSelect).queryByText('Bodega Zona Libre')).not.toBeInTheDocument()
    expect(within(destinationSelect).getByText('Showroom Cliente')).toBeInTheDocument()
  })

  it('el modal Reubicar no envía sin cantidad, destino o motivo', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.table.relocate'))
    fireEvent.click(await screen.findByText('bodega:warehouses.relocateModal.submit'))

    expect(await screen.findByText('bodega:warehouses.relocateModal.errors.quantity')).toBeInTheDocument()
    expect(mockedBodegaApi.relocations.create).not.toHaveBeenCalled()
  })

  it('el modal Reubicar envía la solicitud con los ids correctos cuando todo el formulario es válido', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.relocations.create.mockResolvedValue({ id: 1 })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.table.relocate'))

    await screen.findByText('bodega:warehouses.relocateModal.title')

    // Mejora SCRUM-752 RN1 — destino '2' (Bodega Zona Libre) ya no existe como opción, se usa
    // '3' (Showroom Cliente) como destino válido en su lugar.
    const destinationSelect = screen.getByDisplayValue('bodega:warehouses.relocateModal.selectDestination')
    fireEvent.change(destinationSelect, { target: { value: '3' } })

    const quantityInput = screen.getByRole('spinbutton')
    fireEvent.change(quantityInput, { target: { value: '3' } })

    const reasonTextarea = screen.getByPlaceholderText('bodega:warehouses.relocateModal.reasonPlaceholder')
    fireEvent.change(reasonTextarea, { target: { value: 'Reorganización de piso' } })

    fireEvent.click(screen.getByText('bodega:warehouses.relocateModal.submit'))

    await waitFor(() => expect(mockedBodegaApi.relocations.create).toHaveBeenCalledWith({
      catalog_product_id: 99,
      origin_warehouse_id: 1,
      destination_warehouse_id: 3,
      cantidad: 3,
      motivo: 'Reorganización de piso',
    }))
  })

  // SCRUM-459 — el filtro de la bandeja de solicitudes siempre vuelve a "Todas" al reabrir.
  it('la bandeja de Solicitudes de reubicación reinicia el filtro a "Todas" cada vez que se abre', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()

    const openButton = await screen.findByText('bodega:warehouses.relocationRequests.openButton')

    fireEvent.click(openButton)
    await screen.findByText('bodega:warehouses.relocationRequests.title')
    fireEvent.click(screen.getByText('bodega:warehouses.relocationRequests.chips.pendiente'))
    await waitFor(() => expect(mockedBodegaApi.relocations.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'pendiente' }),
    ))

    // Cerrar el modal — el único botón sin texto dentro del panel es el ícono de cerrar (X).
    const modalTitle = screen.getByText('bodega:warehouses.relocationRequests.title')
    const modalPanel = modalTitle.closest('div.p-5') as HTMLElement
    const closeButton = within(modalPanel).getAllByRole('button').find(b => b.textContent === '')
    fireEvent.click(closeButton!)
    await waitFor(() => expect(screen.queryByText('bodega:warehouses.relocationRequests.title')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('bodega:warehouses.relocationRequests.openButton'))
    await screen.findByText('bodega:warehouses.relocationRequests.title')

    await waitFor(() => expect(mockedBodegaApi.relocations.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'todas' }),
    ))
  })

  it('aprobar/rechazar en la bandeja de Solicitudes de reubicación', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.relocations.list.mockResolvedValue({
      data: [{
        id: 5,
        producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
        cantidad: 4, motivo: 'Reorganización', solicitado_por: 'Jorge P.',
        fecha: '2026-07-24T10:00:00Z', estado: 'pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.relocationRequests.openButton'))

    expect(await screen.findByText('bodega:warehouses.relocationRequests.actions.approve')).toBeInTheDocument()
    fireEvent.click(screen.getByText('bodega:warehouses.relocationRequests.actions.approve'))
    await waitFor(() => expect(mockedBodegaApi.relocations.approve).toHaveBeenCalledWith(5))

    fireEvent.click(screen.getByText('bodega:warehouses.relocationRequests.actions.reject'))
    fireEvent.click(await screen.findByText('bodega:warehouses.relocationRequests.rejectModal.confirm'))
    expect(await screen.findByText('bodega:warehouses.relocationRequests.rejectModal.required')).toBeInTheDocument()
    expect(mockedBodegaApi.relocations.reject).not.toHaveBeenCalled()
  })

  // SCRUM-458 (rebote de Gerencia Test 2026-08-13) — Aprobar/Rechazar quedaban visibles para
  // CUALQUIER perfil de Bodega (ej. Esteban, Líder de Bodega), aunque el backend ya bloqueaba con
  // 403. Ahora deben OCULTARSE (no solo deshabilitarse) para quien no es Mark.
  it('rebote 2026-08-13 — Aprobar/Rechazar quedan ocultos para un perfil de Bodega que no es Mark', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.relocations.list.mockResolvedValue({
      data: [{
        id: 5,
        producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
        cantidad: 4, motivo: 'Reorganización', solicitado_por: 'Jorge P.',
        fecha: '2026-07-24T10:00:00Z', estado: 'pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    // Mark es el usuario 99 — el actor logueado (mockedUseAuthStore, default id 1) no lo es.
    mockedComprasApi.settings.get.mockResolvedValue({ primary_approver_user_id: 99 } as never)

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.relocationRequests.openButton'))
    await screen.findByText('bodega:warehouses.relocationRequests.title')

    await waitFor(() => expect(mockedComprasApi.settings.get).toHaveBeenCalled())
    expect(screen.queryByText('bodega:warehouses.relocationRequests.actions.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:warehouses.relocationRequests.actions.reject')).not.toBeInTheDocument()
  })

  it('rebote 2026-08-13 — Aprobar/Rechazar siguen visibles para el actor que SÍ es Mark', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.relocations.list.mockResolvedValue({
      data: [{
        id: 5,
        producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
        cantidad: 4, motivo: 'Reorganización', solicitado_por: 'Jorge P.',
        fecha: '2026-07-24T10:00:00Z', estado: 'pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })
    mockedComprasApi.settings.get.mockResolvedValue({ primary_approver_user_id: 1 } as never)
    mockedUseAuthStore.mockReturnValue(1 as never)

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.relocationRequests.openButton'))

    expect(await screen.findByText('bodega:warehouses.relocationRequests.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('bodega:warehouses.relocationRequests.actions.reject')).toBeInTheDocument()
  })

  // SCRUM-459 (rebote de Gerencia Test 2026-08-13) — "Ver motivo" era texto estático (solo
  // tooltip vía `title`), sin ninguna interacción real.
  it('rebote 2026-08-13 — "Ver motivo" es clickeable y muestra el motivo real del rechazo', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.relocations.list.mockResolvedValue({
      data: [{
        id: 6,
        producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
        cantidad: 4, motivo: 'Reorganización', solicitado_por: 'Jorge P.',
        fecha: '2026-07-24T10:00:00Z', estado: 'rechazada',
        motivo_rechazo: 'No hay espacio disponible en Merma esta semana.', resuelto_por: 'Mark',
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 },
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.relocationRequests.openButton'))

    const viewReasonButton = await screen.findByRole('button', { name: 'bodega:warehouses.relocationRequests.table.viewReason' })
    fireEvent.click(viewReasonButton)

    expect(await screen.findByText('No hay espacio disponible en Merma esta semana.')).toBeInTheDocument()
    expect(screen.getByText('bodega:warehouses.relocationRequests.reasonModal.title')).toBeInTheDocument()
  })

  // SCRUM-454 — "Administrar ubicaciones" solo aparece en bodegas con modo_detalle ubicacion_exacta.
  it('el botón "Administrar ubicaciones" solo aparece en bodegas modo ubicacion_exacta', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()

    expect(await screen.findByText('bodega:warehouses.locations.manageButton')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Showroom Cliente'))
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse({ warehouse: WAREHOUSES[2] }))

    await waitFor(() => expect(screen.queryByText('bodega:warehouses.locations.manageButton')).not.toBeInTheDocument())
  })

  it('Administrar ubicaciones agrega un código nuevo y permite desactivar uno existente', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    mockedBodegaApi.warehouses.locations.list.mockResolvedValue({
      data: [{ id: 1, warehouse_id: 1, codigo: 'C-9-09', is_active: true }],
    })
    mockedBodegaApi.warehouses.locations.create.mockResolvedValue({ id: 2, codigo: 'A-1-04', is_active: true })
    mockedBodegaApi.warehouses.locations.update.mockResolvedValue({ id: 1, codigo: 'C-9-09', is_active: false })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.locations.manageButton'))

    await screen.findByText('C-9-09')

    const addInput = screen.getByPlaceholderText('bodega:warehouses.locations.addPlaceholder')
    fireEvent.change(addInput, { target: { value: 'A-1-04' } })
    fireEvent.click(screen.getByText('bodega:warehouses.locations.add'))
    await waitFor(() => expect(mockedBodegaApi.warehouses.locations.create).toHaveBeenCalledWith(1, 'A-1-04'))

    fireEvent.click(screen.getByText('bodega:warehouses.locations.deactivate'))
    await waitFor(() => expect(mockedBodegaApi.warehouses.locations.update).toHaveBeenCalledWith(
      1, 1, { is_active: false },
    ))
  })

  it('Administrar ubicaciones no agrega un código vacío', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.locations.manageButton'))
    fireEvent.click(await screen.findByText('bodega:warehouses.locations.add'))

    expect(await screen.findByText('bodega:warehouses.locations.errors.required')).toBeInTheDocument()
    expect(mockedBodegaApi.warehouses.locations.create).not.toHaveBeenCalled()
  })
})
