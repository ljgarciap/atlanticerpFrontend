import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VistaIcgPage from './VistaIcgPage'
import { legacyVistaIcgApi, legacyPagosApi } from '@/api/legacyMigrationApi'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyVistaIcgApi: {
    documentos: { list: vi.fn(), show: vi.fn() },
    clientes: { list: vi.fn(), show: vi.fn() },
    proveedores: { list: vi.fn(), show: vi.fn() },
    productos: { list: vi.fn(), show: vi.fn() },
  },
  legacyPagosApi: { list: vi.fn() },
}))

const mockedVistaApi = vi.mocked(legacyVistaIcgApi, true)
const mockedPagosApi = vi.mocked(legacyPagosApi, true)

const emptyList = { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1 }

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <VistaIcgPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedVistaApi.documentos.list.mockResolvedValue(emptyList)
  mockedVistaApi.clientes.list.mockResolvedValue(emptyList)
  mockedVistaApi.proveedores.list.mockResolvedValue(emptyList)
  mockedVistaApi.productos.list.mockResolvedValue(emptyList)
  mockedPagosApi.list.mockResolvedValue(emptyList)
})

describe('VistaIcgPage', () => {
  it('muestra el título y las 9 pestañas', async () => {
    renderPage()
    expect(await screen.findByText('Vista ICG')).toBeInTheDocument()
    for (const label of ['Cotizaciones', 'Pedidos', 'Albaranes', 'Albaranes de Compra', 'Facturas', 'Pagos', 'Clientes', 'Proveedores', 'Productos']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('cambiar de pestaña a Albaranes de Compra pide esa entidad', async () => {
    renderPage()
    await waitFor(() => expect(mockedVistaApi.documentos.list).toHaveBeenCalledWith('cotizaciones', expect.anything()))

    fireEvent.click(screen.getByText('Albaranes de Compra'))

    await waitFor(() => expect(mockedVistaApi.documentos.list).toHaveBeenCalledWith('albaranes_compra', expect.anything()))
  })

  it('por defecto pide la pestaña Cotizaciones', async () => {
    renderPage()
    await waitFor(() => expect(mockedVistaApi.documentos.list).toHaveBeenCalledWith('cotizaciones', expect.anything()))
  })

  it('cambiar de pestaña a Pedidos pide esa entidad', async () => {
    renderPage()
    await waitFor(() => expect(mockedVistaApi.documentos.list).toHaveBeenCalledWith('cotizaciones', expect.anything()))

    fireEvent.click(screen.getByText('Pedidos'))

    await waitFor(() => expect(mockedVistaApi.documentos.list).toHaveBeenCalledWith('pedidos', expect.anything()))
  })

  it('cambiar de pestaña a Pagos pide legacyPagosApi, no legacyVistaIcgApi', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Pagos'))

    await waitFor(() => expect(mockedPagosApi.list).toHaveBeenCalled())
  })

  it('cambiar de pestaña a Clientes pide legacyVistaIcgApi.clientes', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Clientes'))

    await waitFor(() => expect(mockedVistaApi.clientes.list).toHaveBeenCalled())
  })

  it('cambiar de pestaña a Proveedores pide legacyVistaIcgApi.proveedores', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Proveedores'))

    await waitFor(() => expect(mockedVistaApi.proveedores.list).toHaveBeenCalled())
  })

  it('cambiar de pestaña a Productos pide legacyVistaIcgApi.productos', async () => {
    renderPage()
    fireEvent.click(screen.getByText('Productos'))

    await waitFor(() => expect(mockedVistaApi.productos.list).toHaveBeenCalled())
  })
})
