import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SubClientIcgHistoryModal from './SubClientIcgHistoryModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { LegacyHistoryResult, LegacyDocumentResult } from '@/types/ventasDiseno'

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

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { subClients: { history: vi.fn(), historyShow: vi.fn() } },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeResult(overrides: Partial<LegacyHistoryResult> = {}): LegacyHistoryResult {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function makeDocument(overrides: Partial<LegacyDocumentResult> = {}): LegacyDocumentResult {
  return {
    entidad: 'cotizaciones',
    header: {
      folio: 'A-500-1-1', cliente: { id: 1, nombre_comercial: 'Delta SA', razon_social: 'Delta SA', cif: '123' },
      icg_codcliente: 2001, icg_codvendedor: 45, fecha: '2026-08-01', estado: 'A',
      total_neto: '1000.00', orphan: false,
    },
    items: [],
    ...overrides,
  }
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SubClientIcgHistoryModal subClientId={10} subClientName="Delta Residencial" onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.subClients.history.mockResolvedValue(makeResult())
  mockedApi.subClients.historyShow.mockResolvedValue(makeDocument())
})

describe('SubClientIcgHistoryModal', () => {
  it('pide cotizaciones por defecto', async () => {
    renderModal()
    await waitFor(() => expect(mockedApi.subClients.history).toHaveBeenCalledWith(10, 'cotizaciones', 1, 20))
  })

  it('sin historial muestra el estado vacío, nunca un error', async () => {
    renderModal()
    expect(await screen.findByText('ventasDiseno:clients.icgHistoryModal.empty')).toBeInTheDocument()
  })

  it('cambiar de pestaña vuelve a pedir la entidad correcta y resetea a página 1', async () => {
    renderModal()
    await waitFor(() => expect(mockedApi.subClients.history).toHaveBeenCalledWith(10, 'cotizaciones', 1, 20))

    fireEvent.click(screen.getByText('ventasDiseno:clients.icgHistoryModal.entidad.albaranes'))

    await waitFor(() => expect(mockedApi.subClients.history).toHaveBeenLastCalledWith(10, 'albaranes', 1, 20))
  })

  it('muestra las filas devueltas, sin ningún control de edición/creación', async () => {
    mockedApi.subClients.history.mockResolvedValue(makeResult({
      data: [{ id: 1, numero: 'A-500', fecha: '2026-08-01', total: '1000.00', estado: 'A' }],
      total: 1,
    }))
    renderModal()

    expect(await screen.findByText('A-500')).toBeInTheDocument()
    expect(screen.getByText('$1,000')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar|editar|agregar|crear/i })).not.toBeInTheDocument()
  })

  it('una fila sin fecha/total/estado muestra un guion, nunca un valor roto', async () => {
    mockedApi.subClients.history.mockResolvedValue(makeResult({
      data: [{ id: 2, numero: 'A-501', fecha: null, total: null, estado: null }],
      total: 1,
    }))
    renderModal()

    await screen.findByText('A-501')
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  // Vista "gemela" tipo documento (SCRUM-749, 2026-09-02) — clic en una fila abre la ficha
  // (cabecera + líneas) en vez de navegar a otra pantalla.
  it('clic en una fila pide el detalle y muestra cabecera + líneas', async () => {
    mockedApi.subClients.history.mockResolvedValue(makeResult({
      data: [{ id: 1, numero: 'A-500-1-1', fecha: '2026-08-01', total: '1000.00', estado: 'A' }],
      total: 1,
    }))
    mockedApi.subClients.historyShow.mockResolvedValue(makeDocument({
      items: [{ codigo_articulo: 9001, referencia: 'REF-1', descripcion: 'Lámpara LED', cantidad: '2.00', precio: '100.00', total: '180.00' }],
    }))
    renderModal()

    fireEvent.click(await screen.findByText('A-500-1-1'))

    await waitFor(() => expect(mockedApi.subClients.historyShow).toHaveBeenCalledWith(10, 'cotizaciones', 1))
    expect(await screen.findByText('Delta SA')).toBeInTheDocument()
    expect(screen.getByText('REF-1')).toBeInTheDocument()
    expect(screen.getByText('Lámpara LED')).toBeInTheDocument()
  })

  it('facturas nunca traen líneas — se muestra la nota, no una tabla vacía', async () => {
    mockedApi.subClients.history.mockResolvedValue(makeResult({
      data: [{ id: 3, numero: 'A-40', fecha: '2026-08-01', total: '75.00', estado: null }],
      total: 1,
    }))
    mockedApi.subClients.historyShow.mockResolvedValue(makeDocument({ entidad: 'facturas', items: null }))
    renderModal()

    fireEvent.click(await screen.findByText('A-40'))

    expect(await screen.findByText('ventasDiseno:clients.icgHistoryModal.document.sinLineasOrigen')).toBeInTheDocument()
  })

  it('"volver" regresa a la lista sin volver a pedir el detalle', async () => {
    mockedApi.subClients.history.mockResolvedValue(makeResult({
      data: [{ id: 1, numero: 'A-500-1-1', fecha: '2026-08-01', total: '1000.00', estado: 'A' }],
      total: 1,
    }))
    renderModal()

    fireEvent.click(await screen.findByText('A-500-1-1'))
    await waitFor(() => expect(mockedApi.subClients.historyShow).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('ventasDiseno:clients.icgHistoryModal.back'))

    expect(await screen.findByText('A-500-1-1')).toBeInTheDocument()
    expect(mockedApi.subClients.historyShow).toHaveBeenCalledTimes(1)
  })
})
