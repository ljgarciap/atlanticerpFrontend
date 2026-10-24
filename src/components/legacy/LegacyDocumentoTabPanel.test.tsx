import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import { LegacyDocumentoTabPanel } from './LegacyDocumentoTabPanel'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import type { VistaIcgDocumentoListResult } from '@/types/legacyMigration'
import type { LegacyDocumentResult } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
  }),
}))

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyVistaIcgApi: { documentos: { list: vi.fn(), show: vi.fn() } },
}))

const mockedApi = vi.mocked(legacyVistaIcgApi, true)

function makeList(overrides: Partial<VistaIcgDocumentoListResult> = {}): VistaIcgDocumentoListResult {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeDocument(overrides: Partial<LegacyDocumentResult> = {}): LegacyDocumentResult {
  return {
    entidad: 'cotizaciones',
    header: {
      folio: 'A-1-1-1', cliente: { id: 1, nombre_comercial: 'Delta SA', razon_social: 'Delta SA', cif: '123' },
      icg_codcliente: 1, icg_codvendedor: 1, fecha: '2026-01-01', total_neto: '100.00', orphan: false,
    },
    items: [],
    ...overrides,
  }
}

function renderPanel(props: Partial<ComponentProps<typeof LegacyDocumentoTabPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <LegacyDocumentoTabPanel entidad="cotizaciones" {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.documentos.list.mockResolvedValue(makeList())
  mockedApi.documentos.show.mockResolvedValue(makeDocument())
})

describe('LegacyDocumentoTabPanel', () => {
  it('sin registros muestra el estado vacío', async () => {
    renderPanel()
    expect(await screen.findByText('Sin registros para este filtro.')).toBeInTheDocument()
  })

  it('muestra las filas con el nombre del cliente', async () => {
    mockedApi.documentos.list.mockResolvedValue(makeList({
      data: [{ id: 1, numero: 'A-100', cliente: 'Delta SA', fecha: '2026-01-01', total: '100.00', estado: 'A' }],
      total: 1,
    }))
    renderPanel()

    expect(await screen.findByText('A-100')).toBeInTheDocument()
    expect(screen.getByText('Delta SA')).toBeInTheDocument()
  })

  it('buscar vuelve a pedir la lista con q', async () => {
    renderPanel()
    await waitFor(() => expect(mockedApi.documentos.list).toHaveBeenCalledWith('cotizaciones', expect.objectContaining({ page: 1 })))

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'Delta' } })

    await waitFor(() => expect(mockedApi.documentos.list).toHaveBeenLastCalledWith(
      'cotizaciones', expect.objectContaining({ q: 'Delta' }),
    ))
  })

  it('clic en una fila pide el detalle y muestra la ficha, con botón para volver', async () => {
    mockedApi.documentos.list.mockResolvedValue(makeList({
      data: [{ id: 1, numero: 'A-100', cliente: 'Delta SA', fecha: '2026-01-01', total: '100.00', estado: 'A' }],
      total: 1,
    }))
    renderPanel()

    fireEvent.click(await screen.findByText('A-100'))

    await waitFor(() => expect(mockedApi.documentos.show).toHaveBeenCalledWith('cotizaciones', 1))
    expect(await screen.findByText('Delta SA')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volver a la lista'))
    expect(await screen.findByText('A-100')).toBeInTheDocument()
  })

  // SCRUM-840 — Albaranes de Compra usa ownerLabel="Proveedor", la fila trae `proveedor` en vez
  // de `cliente`.
  it('con ownerLabel="Proveedor" muestra la columna y el nombre del proveedor', async () => {
    mockedApi.documentos.list.mockResolvedValue(makeList({
      data: [{ id: 1, numero: 'B-200', proveedor: 'Proveedor XYZ', fecha: '2026-01-01', total: '50.00', estado: 'pendiente' }],
      total: 1,
    }))
    renderPanel({ entidad: 'albaranes_compra', ownerLabel: 'Proveedor' })

    expect(await screen.findByText('B-200')).toBeInTheDocument()
    expect(screen.getByText('Proveedor XYZ')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Proveedor' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar por proveedor o folio…')).toBeInTheDocument()
  })
})
