import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LegacyPagosPage from './LegacyPagosPage'
import { legacyPagosApi } from '@/api/legacyMigrationApi'
import type { PagosResponse } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyPagosApi: { list: vi.fn() },
}))

const mockedApi = vi.mocked(legacyPagosApi, true)

function makePagos(overrides: Partial<PagosResponse> = {}): PagosResponse {
  return { data: [], total: 0, per_page: 20, current_page: 1, last_page: 1, ...overrides }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <LegacyPagosPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.list.mockResolvedValue(makePagos())
})

describe('LegacyPagosPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('Pagos ICG')).toBeInTheDocument()
  })

  it('muestra la nota de hipótesis sin confirmar', async () => {
    renderPage()
    expect(await screen.findByText(/NO confirmadas/)).toBeInTheDocument()
  })

  it('sin registros muestra el estado vacío', async () => {
    renderPage()
    expect(await screen.findByText('Sin registros para este filtro.')).toBeInTheDocument()
  })

  it('muestra una fila con los códigos crudos, sin traducir', async () => {
    mockedApi.list.mockResolvedValue(makePagos({
      data: [{
        id: 1, icg_origen: 'C', icg_tipodocumento: 'F', icg_serie: 'A', icg_numero: 100,
        icg_n: '1', icg_posicion: 1, fecha_documento: '2024-01-15', fecha_vencimiento: '2024-02-15',
        importe: '495.00', icg_codformapago: 1, estado: 'S', fecha_saldado: '2024-01-20',
      }],
    }))
    renderPage()

    expect(await screen.findByText('A-100-1/1')).toBeInTheDocument()
    expect(screen.getByText('495.00')).toBeInTheDocument()
    // El código crudo se muestra tal cual, no la hipótesis "Saldado".
    expect(screen.getAllByText('S').length).toBeGreaterThan(0)
    expect(screen.queryByText('hipótesis: Saldado')).not.toBeInTheDocument()
  })

  it('marca visualmente una fecha centinela absurda', async () => {
    mockedApi.list.mockResolvedValue(makePagos({
      data: [{
        id: 1, icg_origen: 'C', icg_tipodocumento: 'F', icg_serie: 'A', icg_numero: 100,
        icg_n: '1', icg_posicion: 1, fecha_documento: '2024-01-15', fecha_vencimiento: '2024-02-15',
        importe: '495.00', icg_codformapago: 1, estado: 'P', fecha_saldado: '9202-04-02',
      }],
    }))
    renderPage()

    expect(await screen.findByTitle('Fecha centinela de ICG, no representa una fecha real')).toBeInTheDocument()
  })

  it('filtrar por estado vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'P' } })

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'P' }),
    ))
  })

  it('filtrar por rango de fecha vuelve a pedir la lista con el filtro', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Fecha desde'), { target: { value: '2024-01-01' } })

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ fecha_desde: '2024-01-01' }),
    ))
  })

  // Ficha "gemela" al hacer click en una fila (SCRUM-749, 2026-09-02) — sin líneas, TESORERIA es
  // un movimiento contable. No pide datos nuevos al backend, usa la fila ya cargada.
  it('clic en una fila abre la ficha con los campos del movimiento', async () => {
    mockedApi.list.mockResolvedValue(makePagos({
      data: [{
        id: 1, icg_origen: 'C', icg_tipodocumento: 'F', icg_serie: 'A', icg_numero: 100,
        icg_n: '1', icg_posicion: 1, fecha_documento: '2024-01-15', fecha_vencimiento: '2024-02-15',
        importe: '495.00', icg_codformapago: 1, estado: 'S', fecha_saldado: '2024-01-20',
      }],
    }))
    renderPage()

    fireEvent.click(await screen.findByText('A-100-1/1'))

    const ficha = within(await screen.findByTestId('pago-ficha'))
    expect(ficha.getByText('C — hipótesis: Cobro')).toBeInTheDocument()
    expect(ficha.getByText('F — hipótesis: Factura')).toBeInTheDocument()
    expect(ficha.getByText('S — hipótesis: Saldado')).toBeInTheDocument()
    expect(ficha.getByText('$495')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cerrar'))
    await waitFor(() => expect(screen.queryByTestId('pago-ficha')).not.toBeInTheDocument())
  })

  it('la paginación pide la página siguiente', async () => {
    mockedApi.list.mockResolvedValue(makePagos({
      data: [{
        id: 1, icg_origen: 'C', icg_tipodocumento: 'F', icg_serie: 'A', icg_numero: 100,
        icg_n: '1', icg_posicion: 1, fecha_documento: '2024-01-15', fecha_vencimiento: null,
        importe: '495.00', icg_codformapago: null, estado: 'S', fecha_saldado: null,
      }],
      current_page: 1, last_page: 2,
    }))
    renderPage()

    fireEvent.click(await screen.findByText('Siguiente'))

    await waitFor(() => expect(mockedApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))
  })
})
