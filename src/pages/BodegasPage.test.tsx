import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import BodegasPage from './BodegasPage'
import { bodegaApi } from '@/api/bodegaApi'
import { comprasApi } from '@/api/comprasApi'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { makeZonaLibreResponse, zonaLibreContractViolations } from '@/test/zonaLibreContract'
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
    // SCRUM-990 — catálogo de Lafayette de solo consulta (Zona Libre).
    zonaLibre: { productos: vi.fn() },
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

// SCRUM-1154 — BodegasPage lee `?relocation=` de la URL (useSearchParams): necesita un Router; `LocationProbe` expone la URL actual.
function LocationProbe() {
  const loc = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <div data-testid="location">{loc.pathname}{loc.search}</div>
      {/* Simula el clic de la campana estando YA en esta pantalla (navegación a la misma ruta con otro parámetro). */}
      <button type="button" data-testid="go-relocation" onClick={() => navigate('/bodega/bodegas?relocation=5')}>ir</button>
    </div>
  )
}

function renderPage(initialUrl = '/bodega/bodegas') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <BodegasPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// SCRUM-1021 — BodegasPage lee `useAuthStore(s => s.user?.id)` y `usePermission(...)`: el mock evalúa el
// selector contra un usuario real (id 1) en vez de devolver siempre un valor fijo.
function mockUser(permissions: string[] = ['bodega.read', 'bodega.write']) {
  mockedUseAuthStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta', solo_consulta: false },
  { id: 2, name: 'Bodega Zona Libre', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente', solo_consulta: true },
  { id: 3, name: 'Showroom Cliente', responsable: null, capacidad_pct: null, modo_detalle: 'cliente', solo_consulta: false },
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
  mockUser()
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
  // SCRUM-990 — Zona Libre ya no usa esta tabla (es de solo consulta, ver el describe de abajo); la regla de SCRUM-752 sigue
  // vigente para cualquier bodega OPERATIVA en modo 'pendiente'.
  it('no muestra ninguna acción (ni Reubicar ni Ver detalle) en una bodega operativa modo pendiente', async () => {
    const pendienteOperativa: PhysicalWarehouse = { ...WAREHOUSES[1], solo_consulta: false }
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: [WAREHOUSES[0], pendienteOperativa] })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse({
      warehouse: pendienteOperativa,
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

  // SCRUM-990 — el destino se filtra por `solo_consulta` (no solo por el modo 'pendiente'): una bodega de solo consulta jamás recibe
  // reubicaciones aunque su modo sea otro. El backend lo rechaza igual con Warehouse::operativaRule().
  it('el selector de destino de Reubicar excluye una bodega de solo consulta aunque su modo no sea pendiente', async () => {
    const externa: PhysicalWarehouse = { id: 4, name: 'Catálogo Externo', responsable: null, capacidad_pct: null, modo_detalle: 'ubicacion_exacta', solo_consulta: true }
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: [...WAREHOUSES, externa] })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

    renderPage()
    fireEvent.click(await screen.findByText('bodega:warehouses.table.relocate'))

    const destinationSelect = await screen.findByDisplayValue('bodega:warehouses.relocateModal.selectDestination')
    expect(within(destinationSelect).queryByText('Catálogo Externo')).not.toBeInTheDocument()
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

  // SCRUM-1160 — «Ver detalle» en cada solicitud, cualquier estado, solo consulta, con el motivo COMPLETO (en la tabla se corta a 180 px).
  describe('SCRUM-1160 — Ver detalle de una solicitud de reubicación', () => {
    const MOTIVO_LARGO = 'Reorganización del piso de venta por cambio de temporada: se mueve el producto a la bodega de showroom para exhibirlo junto a la línea nueva y liberar espacio en la ubicación A-12 antes de la llegada del contenedor.'
    const filas = [
      { id: 5, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro de cristal' }, bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
        cantidad: 4, motivo: MOTIVO_LARGO, solicitado_por: 'Jorge P.', fecha: '2026-07-24T10:00:00Z', estado: 'pendiente' as const, motivo_rechazo: null, resuelto_por: null },
      { id: 6, producto: { id: 2, reference: 'NORDIC-40', description: 'Lámpara colgante' }, bodega_origen: 'Bodega Central', bodega_destino: 'Showroom',
        cantidad: 2, motivo: 'Exhibición', solicitado_por: 'Ana R.', fecha: '2026-07-23T09:00:00Z', estado: 'aprobada' as const, motivo_rechazo: null, resuelto_por: 'Mark B.' },
      { id: 7, producto: { id: 3, reference: 'SPOT-9', description: 'Spot magnético' }, bodega_origen: 'Merma', bodega_destino: 'Bodega Central',
        cantidad: 1, motivo: 'Corrección', solicitado_por: 'Luis G.', fecha: '2026-07-22T08:00:00Z', estado: 'rechazada' as const, motivo_rechazo: 'No hay espacio en destino', resuelto_por: 'Mark B.' },
    ]
    // El badge de estado traduce con el namespace aparte (`useTranslation('bodega')`): su texto en el mock no lleva el prefijo `bodega:`.
    const k = 'bodega:warehouses.relocationRequests'

    beforeEach(() => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({ data: filas, meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 } })
    })

    it('cada solicitud, sea cual sea su estado, muestra el botón «Ver detalle»', async () => {
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      await screen.findAllByText(`${k}.actions.viewDetail`)
      expect(screen.getAllByText(`${k}.actions.viewDetail`)).toHaveLength(3)
    })

    it('muestra la información completa de la reubicación, con el motivo sin recortar', async () => {
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      fireEvent.click((await screen.findAllByText(`${k}.actions.viewDetail`))[0])

      const modal = await screen.findByTestId('relocation-detail-modal')
      const dentro = within(modal)
      expect(dentro.getByText('CRISTAL-IMPERIAL')).toBeInTheDocument()
      expect(dentro.getByText('Candelabro de cristal')).toBeInTheDocument()
      expect(dentro.getByText('4')).toBeInTheDocument()
      expect(dentro.getByText('Bodega Central')).toBeInTheDocument()
      expect(dentro.getByText('Merma')).toBeInTheDocument()
      expect(dentro.getByText('Jorge P.')).toBeInTheDocument()
      expect(dentro.getByText(MOTIVO_LARGO)).toBeInTheDocument()   // completo, no truncado
      expect(dentro.getByText('warehouses.relocationRequests.status.pendiente')).toBeInTheDocument()
      // Una solicitud pendiente aún no tiene quién la resolvió ni motivo de rechazo.
      expect(dentro.queryByText(`${k}.detailModal.resolvedBy`)).not.toBeInTheDocument()
      expect(dentro.queryByText(`${k}.detailModal.rejectionReason`)).not.toBeInTheDocument()
    })

    it('una solicitud rechazada muestra además quién la resolvió y el motivo del rechazo', async () => {
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      fireEvent.click((await screen.findAllByText(`${k}.actions.viewDetail`))[2])

      const dentro = within(await screen.findByTestId('relocation-detail-modal'))
      expect(dentro.getByText('warehouses.relocationRequests.status.rechazada')).toBeInTheDocument()
      expect(dentro.getByText(`${k}.detailModal.resolvedBy`)).toBeInTheDocument()
      expect(dentro.getByText('Mark B.')).toBeInTheDocument()
      expect(dentro.getByText(`${k}.detailModal.rejectionReason`)).toBeInTheDocument()
      expect(dentro.getByText('No hay espacio en destino')).toBeInTheDocument()
    })

    it('una solicitud aprobada muestra quién la resolvió y no tiene motivo de rechazo', async () => {
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      fireEvent.click((await screen.findAllByText(`${k}.actions.viewDetail`))[1])

      const dentro = within(await screen.findByTestId('relocation-detail-modal'))
      expect(dentro.getByText('warehouses.relocationRequests.status.aprobada')).toBeInTheDocument()
      expect(dentro.getByText(`${k}.detailModal.resolvedBy`)).toBeInTheDocument()
      expect(dentro.queryByText(`${k}.detailModal.rejectionReason`)).not.toBeInTheDocument()
    })

    it('abrir y cerrar el detalle no aprueba ni rechaza nada y deja Aprobar/Rechazar intactos para Mark', async () => {
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      fireEvent.click((await screen.findAllByText(`${k}.actions.viewDetail`))[0])
      await screen.findByTestId('relocation-detail-modal')

      fireEvent.click(screen.getByLabelText('common:actions.close'))
      await waitFor(() => expect(screen.queryByTestId('relocation-detail-modal')).not.toBeInTheDocument())

      expect(mockedBodegaApi.relocations.approve).not.toHaveBeenCalled()
      expect(mockedBodegaApi.relocations.reject).not.toHaveBeenCalled()
      expect(screen.getByText(`${k}.actions.approve`)).toBeInTheDocument()
      expect(screen.getByText(`${k}.actions.reject`)).toBeInTheDocument()

      // Flujo completo del ticket: ver el detalle y recién después aprobar con base en esa información.
      fireEvent.click(screen.getByText(`${k}.actions.approve`))
      await waitFor(() => expect(mockedBodegaApi.relocations.approve).toHaveBeenCalledWith(5))
    })

    it('quien no es Mark ve el detalle aunque Aprobar/Rechazar queden ocultos', async () => {
      mockedComprasApi.settings.get.mockResolvedValue({ primary_approver_user_id: 99 } as never)
      renderPage()
      fireEvent.click(await screen.findByText(`${k}.openButton`))
      await screen.findAllByText(`${k}.actions.viewDetail`)
      await waitFor(() => expect(mockedComprasApi.settings.get).toHaveBeenCalled())

      expect(screen.queryByText(`${k}.actions.approve`)).not.toBeInTheDocument()
      expect(screen.getAllByText(`${k}.actions.viewDetail`)).toHaveLength(3)
    })
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
    mockUser()

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


// SCRUM-990 — Zona Libre / Lafayette: bodega de SOLO CONSULTA. Spec visual: atlanticerp-backend/docs/specs/scrum990-zona-libre-ux.md.
describe('BodegasPage — Zona Libre de solo consulta (SCRUM-990)', () => {
  const SOLO_CONSULTA_DETAIL: WarehouseDetailResponse = {
    warehouse: WAREHOUSES[1],
    kpis: { responsable: null, total_products: 25816, total_units: 1767865, capacidad_pct: null, last_synced_at: '2026-09-30T17:05:00Z' },
    ubicaciones: [],
    data: [],
    meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
  }

  function arrange(list: PhysicalWarehouse[] = WAREHOUSES) {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: list })
    mockedBodegaApi.warehouses.show.mockImplementation(async id => (
      list.find(w => w.id === id)?.solo_consulta ? { ...SOLO_CONSULTA_DETAIL, warehouse: list.find(w => w.id === id) as PhysicalWarehouse } : detailResponse()
    ))
    // Misma validación que el controlador real: un parámetro inválido es un rechazo (422), no se ignora.
    mockedBodegaApi.zonaLibre.productos.mockImplementation(async params => {
      const violations = zonaLibreContractViolations(params as Record<string, unknown> | undefined)
      if (violations.length > 0) throw new Error(`422 ${violations.join('; ')}`)
      return makeZonaLibreResponse()
    })
  }

  it('la pestaña de solo consulta va AL FINAL, separada por un divisor y con la insignia; las operativas no llevan insignia', async () => {
    // El API la devuelve en medio (por id): aun así se pinta al final.
    arrange(WAREHOUSES)
    renderPage()
    await screen.findByText('Bodega Central')

    const tabs = Array.from(document.querySelectorAll('.border-b > button, .border-b > div > button')).map(b => b.textContent ?? '')
    expect(tabs.map(t => t.replace('bodega:warehouses.zonaLibre.badge', '').trim())).toEqual(['Bodega Central', 'Showroom Cliente', 'Bodega Zona Libre'])
    const group = screen.getByTestId('solo-consulta-tabs')
    expect(group.className).toContain('border-l')
    expect(within(group).getByText('Bodega Zona Libre')).toBeInTheDocument()
    expect(within(group).getByText('bodega:warehouses.zonaLibre.badge')).toBeInTheDocument()
    // Sin insignia en las operativas: exactamente UNA en toda la fila de pestañas.
    expect(screen.getAllByText('bodega:warehouses.zonaLibre.badge')).toHaveLength(1)
  })

  it('la pestaña por defecto es la primera OPERATIVA aunque el API devuelva primero la de solo consulta', async () => {
    arrange([WAREHOUSES[1], WAREHOUSES[0], WAREHOUSES[2]])
    renderPage()
    await waitFor(() => expect(mockedBodegaApi.warehouses.show).toHaveBeenCalledWith(1, expect.anything()))
    expect(mockedBodegaApi.warehouses.show).not.toHaveBeenCalledWith(2, expect.anything())
    expect(mockedBodegaApi.zonaLibre.productos).not.toHaveBeenCalled()
  })

  it('al abrir Zona Libre muestra SOLO su vista de consulta: aviso, 8 columnas y ningún elemento de una bodega operativa', async () => {
    arrange()
    renderPage()
    await screen.findByText('REF-0000001').catch(() => undefined)
    fireEvent.click(await screen.findByText('Bodega Zona Libre'))

    await screen.findByTestId('zona-libre-catalogo')
    await waitFor(() => expect(screen.getAllByText('REF-0000001').length).toBeGreaterThan(0))
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(8)

    // Nada de la tabla/controles de 15 columnas de una bodega operativa.
    for (const key of [
      'bodega:warehouses.table.toServe', 'bodega:warehouses.table.relocate', 'bodega:warehouses.table.action',
      'bodega:warehouses.chips.all', 'bodega:warehouses.chips.freeSpace',
      'bodega:warehouses.kpis.responsable', 'bodega:warehouses.kpis.capacityUsed',
      'bodega:warehouses.locations.manageButton', 'bodega:warehouses.relocationRequests.openButton',
    ]) expect(screen.queryByText(key), key).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryAllByRole('button').filter(b => b.closest('tbody'))).toHaveLength(0)
  })

  it('el catálogo de Lafayette solo se pide cuando se abre la pestaña de solo consulta, y la vista de Central no lo pide nunca', async () => {
    arrange()
    renderPage()
    await screen.findByText('Bodega Central')
    await waitFor(() => expect(mockedBodegaApi.warehouses.show).toHaveBeenCalled())
    expect(mockedBodegaApi.zonaLibre.productos).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Bodega Zona Libre'))
    await waitFor(() => expect(mockedBodegaApi.zonaLibre.productos).toHaveBeenCalledTimes(1))
    expect(mockedBodegaApi.zonaLibre.productos).toHaveBeenCalledWith({ sort: 'referencia', dir: 'asc', page: 1, per_page: 25 })
  })

  it('volver a una bodega operativa restablece su vista y los botones de cabecera', async () => {
    arrange()
    renderPage()
    await screen.findByText('bodega:warehouses.relocationRequests.openButton')
    fireEvent.click(await screen.findByText('Bodega Zona Libre'))
    await screen.findByTestId('zona-libre-catalogo')
    expect(screen.queryByText('bodega:warehouses.relocationRequests.openButton')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Bodega Central'))
    expect(await screen.findByText('bodega:warehouses.relocationRequests.openButton')).toBeInTheDocument()
    expect(await screen.findByText('CRISTAL-IMPERIAL')).toBeInTheDocument()
    expect(screen.queryByTestId('zona-libre-catalogo')).not.toBeInTheDocument()
  })

  // SCRUM-1021 — el vendedor entra con bodega.warehouses.view y SIN bodega.read: consulta pura.
  describe('solo consulta por permiso (vendedor, SCRUM-1021)', () => {
    beforeEach(() => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    })

    it('sin bodega.read no aparece ningún botón de acción: ni Administrar ubicaciones, ni Solicitudes, ni Reubicar', async () => {
      mockUser(['bodega.warehouses.view'])
      renderPage()

      await screen.findByText('CRISTAL-IMPERIAL')
      expect(screen.queryByText('bodega:warehouses.locations.manageButton')).toBeNull()
      expect(screen.queryByText('bodega:warehouses.relocationRequests.openButton')).toBeNull()
      expect(screen.queryByText('bodega:warehouses.table.relocate')).toBeNull()
    })

    it('con bodega.read se conservan las acciones de siempre (no cambia para Bodega)', async () => {
      mockUser(['bodega.read', 'bodega.write'])
      renderPage()

      await screen.findByText('CRISTAL-IMPERIAL')
      expect(screen.getByText('bodega:warehouses.locations.manageButton')).toBeInTheDocument()
      expect(screen.getByText('bodega:warehouses.relocationRequests.openButton')).toBeInTheDocument()
      expect(screen.getByText('bodega:warehouses.table.relocate')).toBeInTheDocument()
    })
  })

  // SCRUM-1023 — el buscador vuelve a quedar diminuto si comparte fila con los filtros (flex-1 = flex-basis 0%).
  it('el buscador está en su propia fila con ancho garantizado, fuera de la fila flex de filtros', async () => {
    mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
    mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
    renderPage()

    const row = await screen.findByTestId('warehouses-search-row')
    expect(row.className).toContain('max-w-md')
    expect(row.className).not.toContain('flex-1')
    expect(row.className).not.toContain('flex-wrap')
    expect(row.querySelector('input')).not.toBeNull()
    // Los filtros (select) NO comparten contenedor con el buscador.
    expect(row.parentElement?.querySelector('select')).not.toBeNull()
    expect(row.querySelector('select')).toBeNull()
  })

  // SCRUM-1154 — la notificación de «Aprobaciones pendientes» de una reubicación lleva a la bandeja de Bodegas, filtrada a
  // pendientes y con la solicitud resaltada (antes llevaba a Inventario, donde no hay nada que aprobar).
  describe('navegación desde la notificación de reubicación (SCRUM-1154)', () => {
    const pendiente = (id: number) => ({
      id,
      producto: { id: 1, reference: `REF-${id}`, description: 'Candelabro' },
      bodega_origen: 'Bodega Central', bodega_destino: 'Merma',
      cantidad: 4, motivo: 'Reorganización', solicitado_por: 'Jorge P.',
      fecha: '2026-07-24T10:00:00Z', estado: 'pendiente' as const, motivo_rechazo: null, resuelto_por: null,
    })

    it('con ?relocation={id} abre la bandeja en "Pendientes" y resalta esa solicitud', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({
        data: [pendiente(4), pendiente(5)],
        meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
      })

      renderPage('/bodega/bodegas?relocation=5')

      expect(await screen.findByText('bodega:warehouses.relocationRequests.title')).toBeInTheDocument()
      await waitFor(() => expect(mockedBodegaApi.relocations.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'pendiente' })))
      const destacada = (await screen.findByText('REF-5')).closest('tr') as HTMLElement
      expect(destacada).toHaveAttribute('data-highlighted', 'true')
      expect((await screen.findByText('REF-4')).closest('tr')).not.toHaveAttribute('data-highlighted')
      // Y se puede aprobar desde ahí (flujo existente).
      expect(screen.getAllByText('bodega:warehouses.relocationRequests.actions.approve').length).toBeGreaterThan(0)
    })

    it('al cerrar la bandeja quita el parámetro de la URL, para que recargar no la reabra', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({ data: [pendiente(5)], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

      renderPage('/bodega/bodegas?relocation=5')
      const title = await screen.findByText('bodega:warehouses.relocationRequests.title')
      expect(screen.getByTestId('location')).toHaveTextContent('relocation=5')

      const modalPanel = title.closest('div.p-5') as HTMLElement
      fireEvent.click(within(modalPanel).getAllByRole('button').find(b => b.textContent === '')!)

      await waitFor(() => expect(screen.queryByText('bodega:warehouses.relocationRequests.title')).not.toBeInTheDocument())
      expect(screen.getByTestId('location')).not.toHaveTextContent('relocation=')
    })

    // Pre-QA SCRUM-1154 — la tarjeta de Aprobaciones lista primero las MÁS ANTIGUAS: con >20 pendientes la solicitud caía en la página 2 y
    // no se resaltaba. Con una solicitud de la notificación se trae toda la lista pendiente.
    it('con una solicitud de la notificación trae TODAS las pendientes (no solo la página 1) para poder resaltarla', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({ data: [pendiente(40)], meta: { total: 1, per_page: 1, current_page: 1, last_page: 1 } })

      renderPage('/bodega/bodegas?relocation=40')
      await screen.findByText('bodega:warehouses.relocationRequests.title')

      await waitFor(() => expect(mockedBodegaApi.relocations.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ estado: 'pendiente', per_page: 'all' }),
      ))
      expect(((await screen.findByText('REF-40')).closest('tr') as HTMLElement)).toHaveAttribute('data-highlighted', 'true')
      expect(screen.queryByTestId('relocation-not-pending')).not.toBeInTheDocument()
    })

    // Pre-QA SCRUM-1154 — una notificación vieja (solicitud ya aprobada/rechazada) avisa en vez de abrir la bandeja sin explicación.
    it('si la solicitud de la notificación ya no está pendiente, la bandeja lo avisa', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({ data: [pendiente(4)], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

      renderPage('/bodega/bodegas?relocation=999')

      const aviso = await screen.findByTestId('relocation-not-pending')
      expect(aviso).toHaveTextContent('bodega:warehouses.relocationRequests.notPending')
      expect(aviso).toHaveTextContent('"id":999')
      expect(screen.getByText('REF-4').closest('tr')).not.toHaveAttribute('data-highlighted')
    })

    it('estando YA en Bodegas, el clic de la campana (misma ruta, otro parámetro) abre la bandeja', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())
      mockedBodegaApi.relocations.list.mockResolvedValue({ data: [pendiente(5)], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })

      renderPage('/bodega/bodegas')
      await screen.findByText('bodega:warehouses.relocationRequests.openButton')
      expect(screen.queryByText('bodega:warehouses.relocationRequests.title')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTestId('go-relocation'))

      expect(await screen.findByText('bodega:warehouses.relocationRequests.title')).toBeInTheDocument()
      expect(((await screen.findByText('REF-5')).closest('tr') as HTMLElement)).toHaveAttribute('data-highlighted', 'true')
    })

    it('sin el parámetro la bandeja NO se abre sola y arranca en "Todas" como siempre', async () => {
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

      renderPage()
      await screen.findByText('bodega:warehouses.relocationRequests.openButton')
      expect(screen.queryByText('bodega:warehouses.relocationRequests.title')).not.toBeInTheDocument()
    })

    it('un usuario de solo consulta (sin bodega.read) no abre la bandeja aunque llegue el parámetro', async () => {
      mockUser(['bodega.warehouses.view'])
      mockedBodegaApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
      mockedBodegaApi.warehouses.show.mockResolvedValue(detailResponse())

      renderPage('/bodega/bodegas?relocation=5')
      await waitFor(() => expect(mockedBodegaApi.warehouses.list).toHaveBeenCalled())
      expect(screen.queryByText('bodega:warehouses.relocationRequests.title')).not.toBeInTheDocument()
    })
  })
})
