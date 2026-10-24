import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StockSyncPanel from './StockSyncPanel'
import { legacyStockSyncApi } from '@/api/legacyMigrationApi'
import type { StockSyncStatusResponse } from '@/types/legacyMigration'

vi.mock('@/api/legacyMigrationApi', () => ({
  legacyStockSyncApi: { get: vi.fn(), update: vi.fn() },
}))

const api = vi.mocked(legacyStockSyncApi, true)

function status(overrides: Partial<StockSyncStatusResponse> = {}): StockSyncStatusResponse {
  return {
    settings: {
      activo: false,
      baseline_inicializada_at: '2026-10-06T16:00:00-05:00',
      max_productos_con_delta_pct: 30,
      max_unidades_abs_por_producto: 2000,
      max_unidades_abs_total: 30000,
      min_filas_icg_pct: 80,
      horas_aviso_apagado: 48,
      correos_alerta: [],
    },
    ultimas_corridas: [],
    ...overrides,
  }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><StockSyncPanel /></QueryClientProvider>)
}

describe('StockSyncPanel (SCRUM-1114)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra los ajustes actuales y no deja guardar sin cambios', async () => {
    api.get.mockResolvedValue(status())
    renderPanel()

    expect(await screen.findByDisplayValue('2000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
    expect(screen.getByText(/Línea base inicializada el/)).toBeInTheDocument()
  })

  it('avisa si la línea base no está inicializada', async () => {
    api.get.mockResolvedValue(status({ settings: { ...status().settings, baseline_inicializada_at: null } }))
    renderPanel()

    expect(await screen.findByTestId('stock-sync-sin-base')).toBeInTheDocument()
  })

  it('guarda el interruptor, los umbrales y los correos (uno por línea)', async () => {
    api.get.mockResolvedValue(status())
    api.update.mockResolvedValue(status())
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.click(screen.getByRole('switch', { name: 'Corridas programadas activas' }))
    fireEvent.change(screen.getByLabelText('Máx. unidades por producto'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Correos adicionales de alerta'), { target: { value: 'ops@atlantic.com.pa\nti@atlantic.com.pa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }))

    // Solo viaja lo que cambió: no se pisa un campo que otro superadmin acaba de editar.
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({
      activo: true,
      max_unidades_abs_por_producto: 500,
      correos_alerta: ['ops@atlantic.com.pa', 'ti@atlantic.com.pa'],
    }))
  })

  it('bloquea el guardado con valores o correos inválidos', async () => {
    api.get.mockResolvedValue(status())
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.change(screen.getByLabelText('Máx. % de productos con delta'), { target: { value: '51' } }) // tope del backend: 50
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Máx. % de productos con delta'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Máx. unidades por producto'), { target: { value: '50001' } })
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Máx. unidades por producto'), { target: { value: '2000' } })

    fireEvent.change(screen.getByLabelText('Máx. % de productos con delta'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Correos adicionales de alerta'), { target: { value: 'no-es-correo' } })
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
  })

  it('muestra el motivo cuando la última corrida quedó retenida por el circuit breaker', async () => {
    api.get.mockResolvedValue(status({
      ultimas_corridas: [{
        id: 1, origen: 'scheduler', status: 'held_for_review', extraidos: 100, con_delta: 40, aplicados: 0, errores: 0,
        duracion_ms: 10, started_at: '2026-10-06T21:00:00-05:00',
        resumen: { circuit_breaker: '40.0% de los productos elegibles tienen delta (umbral 30.0%)', unidades_positivas: 10, unidades_negativas: -200 },
      }],
    }))
    renderPanel()

    expect(await screen.findByText(/Retenida por el circuit breaker: 40.0%/)).toBeInTheDocument()
    expect(screen.getAllByText('retenida').length).toBeGreaterThan(0)
  })

  it('muestra el error del servidor si el guardado falla', async () => {
    api.get.mockResolvedValue(status())
    api.update.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'Sin permiso' } } }))
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.click(screen.getByRole('switch', { name: 'Corridas programadas activas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('no deja encender el sync mientras la línea base no esté inicializada', async () => {
    api.get.mockResolvedValue(status({ settings: { ...status().settings, baseline_inicializada_at: null } }))
    renderPanel()

    await screen.findByTestId('stock-sync-sin-base')
    expect(screen.getByRole('switch', { name: 'Corridas programadas activas' })).toBeDisabled()
  })

  it('guarda el guard de respuesta parcial y las horas de aviso', async () => {
    api.get.mockResolvedValue(status())
    api.update.mockResolvedValue(status())
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.change(screen.getByLabelText('Mín. % de filas de ICG'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Horas apagado antes de avisar'), { target: { value: '24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }))

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ min_filas_icg_pct: 90, horas_aviso_apagado: 24 })))
  })

  it('dice qué campo falla y por qué en vez de dejar el botón deshabilitado sin explicación', async () => {
    api.get.mockResolvedValue(status())
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.change(screen.getByLabelText('Máx. % de productos con delta'), { target: { value: '51' } })
    fireEvent.change(screen.getByLabelText('Máx. unidades por producto'), { target: { value: '60000' } })
    fireEvent.change(screen.getByLabelText('Correos adicionales de alerta'), { target: { value: 'ok@atlantic.com.pa\na@x' } })

    expect(screen.getByText('Debe ser un número entre 0 y 50.')).toBeInTheDocument()
    expect(screen.getByText('Debe ser un entero entre 1 y 50.000.')).toBeInTheDocument()
    expect(screen.getByText('Correo inválido: a@x')).toBeInTheDocument()
    expect(screen.getByText('Corrija los campos marcados para poder guardar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
    expect(screen.getByLabelText('Máx. % de productos con delta')).toHaveAttribute('aria-invalid', 'true')
  })

  it('acepta la coma decimal y avisa de correos repetidos', async () => {
    api.get.mockResolvedValue(status())
    api.update.mockResolvedValue(status())
    renderPanel()

    await screen.findByDisplayValue('2000')
    fireEvent.change(screen.getByLabelText('Máx. % de productos con delta'), { target: { value: '12,5' } })
    expect(screen.queryByText('Debe ser un número entre 0 y 50.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({ max_productos_con_delta_pct: 12.5 }))

    fireEvent.change(screen.getByLabelText('Correos adicionales de alerta'), { target: { value: 'a@x.com\nA@X.com' } })
    expect(screen.getByText('Hay correos repetidos.')).toBeInTheDocument()
  })

  it('muestra los miles con el formato es-PA, igual que las fechas', async () => {
    api.get.mockResolvedValue(status({
      ultimas_corridas: [{
        id: 1, origen: 'manual', status: 'success', extraidos: 64036, con_delta: 3502, aplicados: 3502, errores: 0,
        duracion_ms: 10, started_at: '2026-10-06T13:34:00-05:00', resumen: null,
      }],
    }))
    renderPanel()

    const esperado = (3502).toLocaleString('es-PA')
    expect((await screen.findAllByText(esperado)).length).toBeGreaterThan(0)
  })

  it('muestra cuánto se aleja AtlanticERP de ICG y separa lo explicado por el kardex de lo que no', async () => {
    api.get.mockResolvedValue(status({
      ultimas_corridas: [{
        id: 2, origen: 'manual', status: 'success', extraidos: 100, con_delta: 5, aplicados: 5, errores: 0,
        duracion_ms: 10, started_at: '2026-10-06T13:34:00-05:00',
        resumen: {
          unidades_positivas: 10, unidades_negativas: -4,
          divergencia_atlanticerp: {
            total: 3, atlanticerp_con_mas: 2, atlanticerp_con_menos: 1, unidades_mas: 910, unidades_menos: -100,
            sin_movimientos: 1, explicados_por_kardex: 1, con_residuo: 1, unidades_sin_explicar: 910,
            mayores: [
              { icg_codarticulo: 68002, catalog_product_id: 1, icg: 0, atlanticerp: 456, diferencia: 456, kardex_atlanticerp: 0, sin_explicar: 456, con_movimientos_atlanticerp: false },
              { icg_codarticulo: 68986, catalog_product_id: 3, icg: 0, atlanticerp: 454, diferencia: 454, kardex_atlanticerp: -3, sin_explicar: 457, con_movimientos_atlanticerp: true },
              { icg_codarticulo: 53361, catalog_product_id: 2, icg: 1700, atlanticerp: 1600, diferencia: -100, kardex_atlanticerp: -100, sin_explicar: 0, con_movimientos_atlanticerp: true },
            ],
          },
        },
      }],
    }))
    renderPanel()

    const bloque = await screen.findByTestId('stock-sync-divergencia')
    expect(bloque).toHaveTextContent('AtlanticERP difiere de ICG en 3 producto(s)')
    expect(bloque).toHaveTextContent('1 se explican por el kardex de AtlanticERP')
    expect(bloque).toHaveTextContent('1 tienen movimientos de AtlanticERP que no alcanzan a explicarla')
    expect(bloque).toHaveTextContent('1 no tienen ningún movimiento de kardex de AtlanticERP')
    expect(bloque).toHaveTextContent('910 unidades quedan sin explicar')
    expect(bloque).toHaveTextContent('68002')
    expect(bloque).toHaveTextContent('sin movimientos')   // el 68002 no tiene kardex
    expect(bloque).toHaveTextContent('+457')              // residuo del 68986
  })

  it('dice que coincide con ICG cuando no hay divergencia', async () => {
    api.get.mockResolvedValue(status({
      ultimas_corridas: [{
        id: 3, origen: 'scheduler', status: 'success', extraidos: 100, con_delta: 0, aplicados: 0, errores: 0,
        duracion_ms: 10, started_at: '2026-10-06T21:00:00-05:00',
        resumen: { unidades_positivas: 0, unidades_negativas: 0, divergencia_atlanticerp: { total: 0, atlanticerp_con_mas: 0, atlanticerp_con_menos: 0, unidades_mas: 0, unidades_menos: 0, sin_movimientos: 0, explicados_por_kardex: 0, con_residuo: 0, unidades_sin_explicar: 0, mayores: [] } },
      }],
    }))
    renderPanel()

    expect(await screen.findByTestId('stock-sync-sin-divergencia')).toBeInTheDocument()
  })
})
