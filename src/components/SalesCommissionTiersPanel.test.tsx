import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesCommissionTiersPanel from './SalesCommissionTiersPanel'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SalesCommissionTier } from '@/types/ventasDiseno'

// SCRUM-944/945 — la tabla de comisión de vendedores estaba hardcodeada en
// SalesTotalsService::percentFor(). Pre-QA (hallazgos A y B): la tabla se edita completa en local y
// se guarda de forma atómica (`replaceAll`) para que el backend valide solapamientos/huecos sobre
// el conjunto; cualquier 422 se muestra en la tabla.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    salesCommissionTiers: {
      list: vi.fn(), replaceAll: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeTier(overrides: Partial<SalesCommissionTier> = {}): SalesCommissionTier {
  return { id: 1, monto_minimo: 0, monto_maximo: 19999.99, porcentaje: 1.5, orden: 1, ...overrides }
}

const TWO_TIERS = [
  makeTier(),
  makeTier({ id: 2, monto_minimo: 20000, monto_maximo: null, porcentaje: 2, orden: 2 }),
]

const MIN = 'ventasDiseno:salesCommissionTiers.form.montoMinimo'
const MAX = 'ventasDiseno:salesCommissionTiers.form.montoMaximo'
const PCT = 'ventasDiseno:salesCommissionTiers.columnas.porcentaje'
const SAVE = 'ventasDiseno:salesCommissionTiers.guardar'
const ADD = 'ventasDiseno:salesCommissionTiers.agregar'
const REMOVE = 'ventasDiseno:salesCommissionTiers.quitarFila'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SalesCommissionTiersPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('SalesCommissionTiersPanel', () => {
  it('lista los tramos ordenados como filas editables', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue([TWO_TIERS[1], TWO_TIERS[0]])
    renderPanel()

    expect(await screen.findByLabelText(`${PCT} 1`)).toHaveValue(1.5)
    expect(screen.getByLabelText(`${PCT} 2`)).toHaveValue(2)
    expect(screen.getByLabelText(`${MAX} 2`)).toHaveValue(null) // último tramo, sin tope
  })

  it('no muestra Guardar tramos hasta que hay un cambio', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    expect(screen.queryByText(SAVE)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '1.8' } })
    expect(screen.getByText(SAVE)).toBeInTheDocument()
  })

  it('guarda la tabla completa en UN solo request, con orden por posición', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockResolvedValue(TWO_TIERS)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '1.8' } })
    fireEvent.click(screen.getByText(SAVE))

    await waitFor(() => expect(mockedApi.salesCommissionTiers.replaceAll).toHaveBeenCalledTimes(1))
    expect(mockedApi.salesCommissionTiers.replaceAll).toHaveBeenCalledWith([
      { id: 1, monto_minimo: 0, monto_maximo: 19999.99, porcentaje: 1.8, orden: 1 },
      { id: 2, monto_minimo: 20000, monto_maximo: null, porcentaje: 2, orden: 2 },
    ])
  })

  // Senior Review S3: sin id, cada guardado recreaba todas las filas y el audit_logs mostraba las 6 como nuevas.
  it('reenvía el id de cada fila existente y las filas nuevas van SIN id', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockResolvedValue(TWO_TIERS)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.click(screen.getByText(ADD))
    fireEvent.change(screen.getByLabelText(`${MIN} 3`), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText(`${PCT} 3`), { target: { value: '3' } })
    fireEvent.click(screen.getByText(SAVE))

    await waitFor(() => expect(mockedApi.salesCommissionTiers.replaceAll).toHaveBeenCalledTimes(1))
    const sent = mockedApi.salesCommissionTiers.replaceAll.mock.calls[0][0]
    expect(sent.map(r => r.id)).toEqual([1, 2, undefined])
    expect(sent[2]).not.toHaveProperty('id')
  })

  it('al quitar una fila existente, su id deja de enviarse y las demás conservan el suyo', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockResolvedValue([])
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.click(screen.getByLabelText(`${REMOVE} 1`))
    fireEvent.click(screen.getByText(SAVE))

    await waitFor(() => expect(mockedApi.salesCommissionTiers.replaceAll).toHaveBeenCalledTimes(1))
    const sent = mockedApi.salesCommissionTiers.replaceAll.mock.calls[0][0]
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ id: 2, orden: 1 })
  })

  it('agrega y quita filas solo en local: nada se envía hasta Guardar tramos', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockResolvedValue([])
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.click(screen.getByText(ADD))
    expect(screen.getByLabelText(`${PCT} 3`)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(`${REMOVE} 1`))

    expect(mockedApi.salesCommissionTiers.replaceAll).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(SAVE))

    await waitFor(() => expect(mockedApi.salesCommissionTiers.replaceAll).toHaveBeenCalledTimes(1))
    const sent = mockedApi.salesCommissionTiers.replaceAll.mock.calls[0][0]
    expect(sent).toHaveLength(2)
    expect(sent.map(r => r.orden)).toEqual([1, 2])
  })

  it('pide confirmación antes de guardar y NO llama al backend si se cancela', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '9' } })
    fireEvent.click(screen.getByText(SAVE))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(mockedApi.salesCommissionTiers.replaceAll).not.toHaveBeenCalled()
  })

  it('cancelar descarta los cambios locales y vuelve a los valores guardados', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '9' } })
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.getByLabelText(`${PCT} 1`)).toHaveValue(1.5)
    expect(screen.queryByText(SAVE)).not.toBeInTheDocument()
  })

  it('muestra el 422 del backend en la fila indicada por la ruta tiers.N.campo', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: {
        message: 'The given data was invalid.',
        errors: { 'tiers.1.monto_minimo': ['El tramo 2 se solapa con el tramo 1.'] },
      } },
    })
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${MIN} 2`), { target: { value: '10000' } })
    fireEvent.click(screen.getByText(SAVE))

    const alert = await screen.findByText('El tramo 2 se solapa con el tramo 1.')
    expect(alert).toBeInTheDocument()
    expect(screen.getByLabelText(`${MIN} 2`)).toHaveAttribute('aria-invalid', 'true')
    // Lo digitado no se pierde para poder corregirlo.
    expect(screen.getByLabelText(`${MIN} 2`)).toHaveValue(10000)
  })

  it('muestra el mensaje general cuando el 422 no es por fila (huecos/solapamientos del conjunto)', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Los tramos dejan un hueco entre 19999.99 y 30000.' } },
    })
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${MIN} 2`), { target: { value: '30000' } })
    fireEvent.click(screen.getByText(SAVE))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Los tramos dejan un hueco entre 19999.99 y 30000.')).toBeInTheDocument()
  })

  // Senior Review S4: el backend puede devolver varios mensajes bajo `tiers` en un mismo guardado.
  it('muestra TODOS los mensajes del conjunto (clave tiers), no solo el primero', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: {
        message: 'The given data was invalid.',
        errors: { tiers: ['El primer tramo debe empezar en 0.', 'Hay un hueco entre los tramos 1 y 2.', 'El último tramo debe quedar abierto.'] },
      } },
    })
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${MIN} 2`), { target: { value: '30000' } })
    fireEvent.click(screen.getByText(SAVE))

    expect(await screen.findByText('El primer tramo debe empezar en 0.')).toBeInTheDocument()
    expect(screen.getByText('Hay un hueco entre los tramos 1 y 2.')).toBeInTheDocument()
    expect(screen.getByText('El último tramo debe quedar abierto.')).toBeInTheDocument()
  })

  it('muestra todos los mensajes de un mismo campo de fila', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Inválido.', errors: { 'tiers.0.porcentaje': ['Debe ser mayor a 0.', 'Máximo 100.'] } } },
    })
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '150' } })
    fireEvent.click(screen.getByText(SAVE))

    expect(await screen.findByText(/Debe ser mayor a 0\..*Máximo 100\./)).toBeInTheDocument()
  })

  it('un error que no es de validación muestra el mensaje genérico', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    mockedApi.salesCommissionTiers.replaceAll.mockRejectedValue(new Error('Network Error'))
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '3' } })
    fireEvent.click(screen.getByText(SAVE))

    expect(await screen.findByText('ventasDiseno:salesCommissionTiers.errores.guardar')).toBeInTheDocument()
  })

  it('un valor no numérico se rechaza en el cliente y no llega al backend', async () => {
    mockedApi.salesCommissionTiers.list.mockResolvedValue(TWO_TIERS)
    renderPanel()
    await screen.findByLabelText(`${PCT} 1`)

    fireEvent.change(screen.getByLabelText(`${PCT} 1`), { target: { value: '' } })
    fireEvent.click(screen.getByText(SAVE))

    expect(await screen.findByText('ventasDiseno:salesCommissionTiers.errores.numeroRequerido')).toBeInTheDocument()
    expect(mockedApi.salesCommissionTiers.replaceAll).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  })
})
