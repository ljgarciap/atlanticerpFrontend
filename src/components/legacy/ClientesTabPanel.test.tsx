import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClientesTabPanel } from './ClientesTabPanel'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import type { VistaIcgClienteListResult, VistaIcgClienteDetail } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyVistaIcgApi: { clientes: { list: vi.fn(), show: vi.fn() } },
}))

const mockedApi = vi.mocked(legacyVistaIcgApi, true)

function makeList(overrides: Partial<VistaIcgClienteListResult> = {}): VistaIcgClienteListResult {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeDetail(overrides: Partial<VistaIcgClienteDetail> = {}): VistaIcgClienteDetail {
  return {
    entidad: 'clientes',
    header: {
      icg_codcliente: 1, nombre_comercial: 'Ferretería Delta', razon_social: 'Delta SA', cif: '123',
      direccion: null, poblacion: null, provincia: null, pais: null, telefono1: null, telefono2: null,
      mobil: null, email: null, icg_codvendedor: null, match_status: 'matched', sub_client_id: 1,
      bloqueado: false, fecha_modificado_icg: null,
    },
    contactos: [],
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientesTabPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.clientes.list.mockResolvedValue(makeList())
  mockedApi.clientes.show.mockResolvedValue(makeDetail())
})

describe('ClientesTabPanel', () => {
  it('muestra las filas y busca por nombre/CIF', async () => {
    mockedApi.clientes.list.mockResolvedValue(makeList({
      data: [{ id: 1, nombre_comercial: 'Ferretería Delta', razon_social: 'Delta SA', cif: '123', match_status: 'matched', bloqueado: false }],
      total: 1,
    }))
    renderPanel()

    expect(await screen.findByText('Ferretería Delta')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'Delta' } })
    await waitFor(() => expect(mockedApi.clientes.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Delta' })))
  })

  it('clic en una fila muestra la ficha con los contactos', async () => {
    mockedApi.clientes.list.mockResolvedValue(makeList({
      data: [{ id: 1, nombre_comercial: 'Ferretería Delta', razon_social: 'Delta SA', cif: '123', match_status: 'matched', bloqueado: false }],
      total: 1,
    }))
    mockedApi.clientes.show.mockResolvedValue(makeDetail({
      contactos: [{ cargo: 'Gerente', nombre: 'Juan Pérez', telefono: '123', mobil: null, email: 'juan@example.test' }],
    }))
    renderPanel()

    fireEvent.click(await screen.findByText('Ferretería Delta'))

    await waitFor(() => expect(mockedApi.clientes.show).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('Gerente')).toBeInTheDocument()
  })

  it('sin contactos muestra la nota, no una tabla vacía', async () => {
    mockedApi.clientes.list.mockResolvedValue(makeList({
      data: [{ id: 1, nombre_comercial: 'Ferretería Delta', razon_social: 'Delta SA', cif: '123', match_status: 'matched', bloqueado: false }],
      total: 1,
    }))
    renderPanel()

    fireEvent.click(await screen.findByText('Ferretería Delta'))

    expect(await screen.findByText('Sin contactos')).toBeInTheDocument()
  })
})
