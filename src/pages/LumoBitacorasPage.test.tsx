import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LumoBitacorasPage from './LumoBitacorasPage'
import { lumoApi } from '@/api/lumoApi'
import { lumoIdentityBridge } from '@/lib/lumoIdentityBridge'

// SCRUM-925 — cubre el happy path (código de AtlanticERP -> exchange con LUMO -> tabla de bitácoras) y
// el estado de error explícito cuando cualquiera de los dos falla (LUMO/lumo-backend caído).
// El CORS de LUMO hoy solo autoriza atlanticerp.ai/www.atlanticerp.ai, así que el exchange/bitácoras real
// contra dev.atlanticerp.ai/localhost no se puede probar end-to-end — todo el HTTP está mockeado acá.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/lumoApi', () => ({
  lumoApi: { getBitacorasCode: vi.fn() },
}))

vi.mock('@/lib/lumoIdentityBridge', () => ({
  lumoIdentityBridge: { exchange: vi.fn(), bitacoras: vi.fn(), vendedores: vi.fn() },
  buildOrdering: (field: string, dir: string) => (dir === 'desc' ? `-${field}` : field),
}))

const mockedLumoApi = vi.mocked(lumoApi, true)
const mockedBridge   = vi.mocked(lumoIdentityBridge, true)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <LumoBitacorasPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedBridge.vendedores.mockResolvedValue([])
})

describe('LumoBitacorasPage', () => {
  it('carga el código de AtlanticERP, hace exchange con LUMO y muestra la tabla', async () => {
    mockedLumoApi.getBitacorasCode.mockResolvedValue({ code: 'abc123', expires_at: '2026-09-16T23:18:01+00:00' })
    mockedBridge.exchange.mockResolvedValue({ access: 'jwt-access-token' })
    mockedBridge.bitacoras.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 42,
        vendedor_id: 3,
        vendedor_nombre: 'Contabilidad Test',
        fecha: '2026-09-16',
        cliente: 'Cliente X',
        proyecto: 'Proyecto Y',
        motivo: 'Seguimiento',
        tipo_atencion: 'Llamada',
        observaciones: 'Sin novedad',
        created_at: '2026-09-16T14:32:00Z',
      }],
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('Contabilidad Test')).toBeInTheDocument())

    expect(mockedLumoApi.getBitacorasCode).toHaveBeenCalledTimes(1)
    expect(mockedBridge.exchange).toHaveBeenCalledWith('abc123')
    expect(mockedBridge.bitacoras).toHaveBeenCalledWith('jwt-access-token', expect.objectContaining({ page: 1 }))
    expect(screen.getByText('Cliente X')).toBeInTheDocument()
  })

  it('muestra el estado de error si AtlanticERP devuelve 503 (LUMO caído)', async () => {
    mockedLumoApi.getBitacorasCode.mockRejectedValue(new Error('503'))

    renderPage()

    await waitFor(() => expect(screen.getByText('lumo:unavailable')).toBeInTheDocument())
    expect(mockedBridge.exchange).not.toHaveBeenCalled()
  })

  it('muestra el estado de error si el exchange contra LUMO falla', async () => {
    mockedLumoApi.getBitacorasCode.mockResolvedValue({ code: 'abc123', expires_at: '2026-09-16T23:18:01+00:00' })
    mockedBridge.exchange.mockRejectedValue(new Error('401'))

    renderPage()

    await waitFor(() => expect(screen.getByText('lumo:unavailable')).toBeInTheDocument())
    expect(mockedBridge.bitacoras).not.toHaveBeenCalled()
  })
})

// SCRUM-946 — los mismos 3 filtros que la vista de bitácoras de LUMO standalone (Vendedor, Desde,
// Hasta): se combinan, se aplican al instante, vuelven a la página 1 y no hay botón "Limpiar"
// (LUMO no lo tiene). El HTTP real contra LUMO está mockeado, igual que arriba.
describe('LumoBitacorasPage — filtros (SCRUM-946)', () => {
  const ROW = {
    id: 42,
    vendedor_id: 3,
    vendedor_nombre: 'Contabilidad Test',
    fecha: '2026-09-16',
    cliente: 'Cliente X',
    proyecto: 'Proyecto Y',
    motivo: 'Seguimiento',
    tipo_atencion: 'Llamada',
    observaciones: 'Sin novedad',
    created_at: '2026-09-16T14:32:00Z',
  }

  function mockLumo(count = 1) {
    mockedLumoApi.getBitacorasCode.mockResolvedValue({ code: 'abc123', expires_at: '2026-09-16T23:18:01+00:00' })
    mockedBridge.exchange.mockResolvedValue({ access: 'jwt-access-token' })
    mockedBridge.vendedores.mockResolvedValue([
      { id: 3, nombre: 'Contabilidad Test' },
      { id: 7, nombre: 'Ana Pérez' },
    ])
    mockedBridge.bitacoras.mockResolvedValue({ count, next: null, previous: null, results: [ROW] })
  }

  const lastBitacorasParams = () => {
    const calls = mockedBridge.bitacoras.mock.calls
    return calls[calls.length - 1]?.[1]
  }

  it('muestra Vendedor / Desde / Hasta y el select lista "Todos" + los vendedores de LUMO', async () => {
    mockLumo()
    renderPage()

    await waitFor(() => expect(screen.getByText('Contabilidad Test', { selector: 'td' })).toBeInTheDocument())

    expect(mockedBridge.vendedores).toHaveBeenCalledWith('jwt-access-token')
    const select = screen.getByLabelText('lumo:filters.vendedor')
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3))
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toEqual(['lumo:filters.todos', 'Contabilidad Test', 'Ana Pérez'])
    expect(screen.getByLabelText('lumo:filters.desde')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('lumo:filters.hasta')).toHaveAttribute('type', 'date')
  })

  it('sin filtros no manda vendedor/desde/hasta al API de LUMO', async () => {
    mockLumo()
    renderPage()
    await waitFor(() => expect(mockedBridge.bitacoras).toHaveBeenCalled())

    expect(lastBitacorasParams()).toEqual(
      expect.objectContaining({ vendedor: undefined, desde: undefined, hasta: undefined }),
    )
  })

  it('combina Vendedor + Desde + Hasta en una sola consulta', async () => {
    mockLumo()
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('lumo:filters.vendedor').querySelectorAll('option')).toHaveLength(3))

    await userEvent.selectOptions(screen.getByLabelText('lumo:filters.vendedor'), '7')
    fireEvent.change(screen.getByLabelText('lumo:filters.desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('lumo:filters.hasta'), { target: { value: '2026-09-30' } })

    await waitFor(() =>
      expect(lastBitacorasParams()).toEqual(
        expect.objectContaining({ vendedor: 7, desde: '2026-09-01', hasta: '2026-09-30' }),
      ),
    )
  })

  it('cambiar un filtro vuelve a la página 1', async () => {
    mockLumo(60) // 60 filas / 20 por página = 3 páginas
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(lastBitacorasParams()).toEqual(expect.objectContaining({ page: 2 })))

    fireEvent.change(screen.getByLabelText('lumo:filters.desde'), { target: { value: '2026-09-01' } })
    await waitFor(() =>
      expect(lastBitacorasParams()).toEqual(expect.objectContaining({ page: 1, desde: '2026-09-01' })),
    )
  })

  it('"Todos" y vaciar las fechas restablecen la consulta completa (sin botón Limpiar)', async () => {
    mockLumo()
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('lumo:filters.vendedor').querySelectorAll('option')).toHaveLength(3))

    await userEvent.selectOptions(screen.getByLabelText('lumo:filters.vendedor'), '7')
    fireEvent.change(screen.getByLabelText('lumo:filters.desde'), { target: { value: '2026-09-01' } })
    await waitFor(() => expect(lastBitacorasParams()).toEqual(expect.objectContaining({ vendedor: 7, desde: '2026-09-01' })))

    await userEvent.selectOptions(screen.getByLabelText('lumo:filters.vendedor'), '')
    fireEvent.change(screen.getByLabelText('lumo:filters.desde'), { target: { value: '' } })

    await waitFor(() =>
      expect(lastBitacorasParams()).toEqual(
        expect.objectContaining({ vendedor: undefined, desde: undefined, hasta: undefined }),
      ),
    )
    // Paridad exacta con LUMO: no se agrega ningún control que LUMO no tenga.
    expect(screen.queryByRole('button', { name: /limpiar|clear|reset/i })).not.toBeInTheDocument()
  })

  it('sin resultados con filtro activo muestra el mensaje de filtro y la barra de filtros sigue visible', async () => {
    mockLumo()
    mockedBridge.bitacoras.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('lumo:empty')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('lumo:filters.desde'), { target: { value: '2030-01-01' } })

    await waitFor(() => expect(screen.getByText('lumo:emptyFiltered')).toBeInTheDocument())
    // Se puede corregir el filtro sin recargar: la barra no desaparece con la tabla vacía.
    expect(screen.getByLabelText('lumo:filters.desde')).toBeInTheDocument()
  })

  it('si falla la carga de vendedores, la tabla sigue funcionando y el select queda solo con "Todos"', async () => {
    mockLumo()
    mockedBridge.vendedores.mockRejectedValue(new Error('403'))
    renderPage()

    await waitFor(() => expect(screen.getByText('Cliente X')).toBeInTheDocument())
    expect(screen.queryByText('lumo:unavailable')).not.toBeInTheDocument()
    const select = screen.getByLabelText('lumo:filters.vendedor')
    expect(select.querySelectorAll('option')).toHaveLength(1)
  })

  it('con LUMO no disponible no se muestran filtros', async () => {
    mockedLumoApi.getBitacorasCode.mockRejectedValue(new Error('503'))
    renderPage()

    await waitFor(() => expect(screen.getByText('lumo:unavailable')).toBeInTheDocument())
    expect(screen.queryByLabelText('lumo:filters.vendedor')).not.toBeInTheDocument()
  })
})
