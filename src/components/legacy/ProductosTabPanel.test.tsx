import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductosTabPanel } from './ProductosTabPanel'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import type { VistaIcgProductoListResult, VistaIcgProductoDetail } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyVistaIcgApi: { productos: { list: vi.fn(), show: vi.fn() } },
}))

const mockedApi = vi.mocked(legacyVistaIcgApi, true)

function makeList(overrides: Partial<VistaIcgProductoListResult> = {}): VistaIcgProductoListResult {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeDetail(overrides: Partial<VistaIcgProductoDetail> = {}): VistaIcgProductoDetail {
  return {
    entidad: 'productos',
    header: {
      icg_codarticulo: 701, descripcion: 'Lámpara LED', marca_nombre: 'MarcaX', familia_nombre: 'FamiliaY',
      ref_proveedor: null, descatalogado: false, catalog_product_id: null,
    },
    precios: [],
    costos: [],
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductosTabPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.productos.list.mockResolvedValue(makeList())
  mockedApi.productos.show.mockResolvedValue(makeDetail())
})

describe('ProductosTabPanel', () => {
  it('muestra las filas y busca por descripción/marca/código', async () => {
    mockedApi.productos.list.mockResolvedValue(makeList({
      data: [{ id: 1, icg_codarticulo: 701, descripcion: 'Lámpara LED', marca_nombre: 'MarcaX', familia_nombre: 'FamiliaY', catalog_product_id: null }],
      total: 1,
    }))
    renderPanel()

    expect(await screen.findByText('Lámpara LED')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'Lámpara' } })
    await waitFor(() => expect(mockedApi.productos.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Lámpara' })))
  })

  it('clic en una fila muestra precios por tarifa y costos por proveedor', async () => {
    mockedApi.productos.list.mockResolvedValue(makeList({
      data: [{ id: 1, icg_codarticulo: 701, descripcion: 'Lámpara LED', marca_nombre: 'MarcaX', familia_nombre: 'FamiliaY', catalog_product_id: null }],
      total: 1,
    }))
    mockedApi.productos.show.mockResolvedValue(makeDetail({
      precios: [{ idtarifav: 1, price_type: 'public', precio_neto: 100, precio_bruto: 118, descuento: null }],
      costos: [{ codproveedor: 5, costo_neto: 60 }],
    }))
    renderPanel()

    fireEvent.click(await screen.findByText('Lámpara LED'))

    await waitFor(() => expect(mockedApi.productos.show).toHaveBeenCalledWith(1))
    expect(await screen.findByText('public')).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('$60')).toBeInTheDocument()
  })
})
