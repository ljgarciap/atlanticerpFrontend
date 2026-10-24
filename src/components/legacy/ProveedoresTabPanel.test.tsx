import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProveedoresTabPanel } from './ProveedoresTabPanel'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import type { VistaIcgProveedorListResult, VistaIcgProveedorDetail } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyVistaIcgApi: { proveedores: { list: vi.fn(), show: vi.fn() } },
}))

const mockedApi = vi.mocked(legacyVistaIcgApi, true)

function makeList(overrides: Partial<VistaIcgProveedorListResult> = {}): VistaIcgProveedorListResult {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeDetail(overrides: Partial<VistaIcgProveedorDetail> = {}): VistaIcgProveedorDetail {
  return {
    entidad: 'proveedores',
    header: {
      icg_codproveedor: 1, nombre: 'Proveedor Uno', nombre_comercial: null, cif: 'P1',
      direccion: null, telefono1: null, email: null, match_status: 'unmatched', provider_id: null,
    },
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProveedoresTabPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.proveedores.list.mockResolvedValue(makeList())
  mockedApi.proveedores.show.mockResolvedValue(makeDetail())
})

describe('ProveedoresTabPanel', () => {
  it('muestra las filas y busca por nombre/CIF', async () => {
    mockedApi.proveedores.list.mockResolvedValue(makeList({
      data: [{ id: 1, nombre: 'Proveedor Uno', nombre_comercial: null, cif: 'P1', match_status: 'unmatched' }],
      total: 1,
    }))
    renderPanel()

    expect(await screen.findByText('Proveedor Uno')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'Uno' } })
    await waitFor(() => expect(mockedApi.proveedores.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Uno' })))
  })

  it('clic en una fila muestra la ficha, sin ninguna tabla de líneas', async () => {
    mockedApi.proveedores.list.mockResolvedValue(makeList({
      data: [{ id: 1, nombre: 'Proveedor Uno', nombre_comercial: null, cif: 'P1', match_status: 'unmatched' }],
      total: 1,
    }))
    renderPanel()

    fireEvent.click(await screen.findByText('Proveedor Uno'))

    await waitFor(() => expect(mockedApi.proveedores.show).toHaveBeenCalledWith(1))
    expect(await screen.findByText('P1')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
