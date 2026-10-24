import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CompensacionesPage from './CompensacionesPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { CompensacionesResult, CompensacionClienteDetalle } from '@/types/adminContab'

// SCRUM-1168 F3 — Compensaciones: lista por cliente y panel de cruce.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) if (k !== 'defaultValue') out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    compensaciones: { clientes: vi.fn(), cliente: vi.fn(), preview: vi.fn(), confirm: vi.fn(), downloadPdf: vi.fn() },
    reversals: { requestRefund: vi.fn() },
    bankAccounts: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function lista(overrides: Partial<CompensacionesResult> = {}): CompensacionesResult {
  return {
    indicadores: { saldo_a_favor_total: 900, clientes_con_saldo: 2 },
    rows: [
      { master_client_id: 7, cliente: 'Vitrio Retail, S.A.', saldo_a_favor: 700, pendiente: 300, neto: 400, signo: 'positivo', facturas_pendientes: 1, ultimo_movimiento: '2026-10-18T10:00:00Z' },
      { master_client_id: 8, cliente: 'Casa Miramar', saldo_a_favor: 200, pendiente: 900, neto: -700, signo: 'negativo', facturas_pendientes: 3, ultimo_movimiento: null },
    ],
    total: 2,
    meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function detalle(overrides: Partial<CompensacionClienteDetalle> = {}): CompensacionClienteDetalle {
  return {
    master_client_id: 7, cliente: 'Vitrio Retail, S.A.', saldo_a_favor: 70, pendiente: 175,
    fuentes: [{ source_type: 'cobro', source_id: 11, etiqueta: 'Cobro REC-011', referencia: 'TRF-1', fecha: '2026-10-17T00:00:00Z', disponible: 70, factura_sugerida_id: null }],
    facturas: [
      { id: 1, numero: 'F-0001', fecha: '2026-09-01T00:00:00Z', monto: 100, saldo_aplicado: 0, pendiente: 100, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
      { id: 2, numero: 'F-0002', fecha: '2026-09-10T00:00:00Z', monto: 50, saldo_aplicado: 0, pendiente: 50, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
      { id: 3, numero: 'F-0003', fecha: '2026-09-20T00:00:00Z', monto: 25, saldo_aplicado: 0, pendiente: 25, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ],
    sugerencia: [
      { source_type: 'cobro', source_id: 11, invoice_id: 1, monto: 70 },
    ],
    movimientos: [], compensaciones: [],
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><CompensacionesPage /></QueryClientProvider>)
}

async function abrirCliente() {
  renderPage()
  fireEvent.click((await screen.findAllByText('compensaciones.compensar'))[0])
  await screen.findByTestId('compensacion-modal')
  await screen.findByTestId('comp-factura-1')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.compensaciones.clientes.mockResolvedValue(lista())
  mockedApi.compensaciones.cliente.mockResolvedValue(detalle())
})

describe('CompensacionesPage — lista por cliente', () => {
  it('muestra los clientes con su saldo a favor, lo que deben y el neto, y los indicadores', async () => {
    renderPage()

    expect(await screen.findByText('Vitrio Retail, S.A.')).toBeInTheDocument()
    expect(screen.getByText('Casa Miramar')).toBeInTheDocument()
    expect(screen.getByTestId('comp-cliente-7')).toHaveTextContent('700')
    expect(screen.getByTestId('comp-cliente-8')).toHaveTextContent(/-.*700\.00/)
    expect(screen.getByText(/900\.00/, { selector: 'div' })).toBeInTheDocument()
  })

  it('filtra por signo y por nombre mandándolos al servidor y volviendo a la página 1', async () => {
    renderPage()
    await screen.findByText('Vitrio Retail, S.A.')

    fireEvent.change(screen.getByLabelText('compensaciones.filtroSigno'), { target: { value: 'negativo' } })
    await waitFor(() => expect(mockedApi.compensaciones.clientes).toHaveBeenLastCalledWith(expect.objectContaining({ signo: 'negativo', page: 1 })))

    fireEvent.change(screen.getByPlaceholderText('compensaciones.searchPlaceholder'), { target: { value: 'Casa' } })
    await waitFor(() => expect(mockedApi.compensaciones.clientes).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Casa', signo: 'negativo' })))
  })

  it('sin clientes lo dice', async () => {
    mockedApi.compensaciones.clientes.mockResolvedValue(lista({ rows: [], total: 0, meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } }))
    renderPage()
    expect(await screen.findByText('compensaciones.vacio')).toBeInTheDocument()
  })
})

describe('CompensacionClienteModal — cruce de un cliente', () => {
  it('SCRUM-1168 F5 — «Devolver» pide cuenta, referencia, motivo y comprobante antes de poder enviar, y manda un formulario', async () => {
    mockedApi.bankAccounts.list.mockResolvedValue([{ id: 4, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1234' }] as never)
    mockedApi.reversals.requestRefund.mockResolvedValue({ id: 1 } as never)
    await abrirCliente()

    fireEvent.click(screen.getByTestId('devolver-cobro-11'))
    const enviar = screen.getByText('compensaciones.devolucion.enviar')
    expect(enviar).toBeDisabled()

    fireEvent.change(screen.getByLabelText('compensaciones.devolucion.monto'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('compensaciones.devolucion.cuenta'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('compensaciones.devolucion.referencia'), { target: { value: 'TRF-5' } })
    fireEvent.change(screen.getByPlaceholderText('compensaciones.devolucion.motivo'), { target: { value: 'Pago de más' } })
    expect(enviar).toBeDisabled()   // falta el comprobante
    fireEvent.change(screen.getByLabelText('compensaciones.devolucion.comprobante'), { target: { files: [new File(['x'], 'c.pdf', { type: 'application/pdf' })] } })
    expect(enviar).not.toBeDisabled()
    fireEvent.click(enviar)

    await waitFor(() => expect(mockedApi.reversals.requestRefund).toHaveBeenCalled())
    const [clienteId, form] = mockedApi.reversals.requestRefund.mock.calls[0]
    expect(clienteId).toBe(7)
    expect((form as FormData).get('source_type')).toBe('cobro')
    expect((form as FormData).get('monto')).toBe('30')
    expect(await screen.findByTestId('devolucion-enviada')).toBeInTheDocument()
  })


  it('«Usar sugerencia» llena los montos, nada se aplica hasta revisar y confirmar', async () => {
    await abrirCliente()

    fireEvent.click(screen.getByText('compensaciones.modal.usarSugerencia'))

    expect((screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0001') as HTMLInputElement).value).toBe('70')
    expect(screen.getByTestId('comp-total-aplicar')).toHaveTextContent('70')
    expect(mockedApi.compensaciones.confirm).not.toHaveBeenCalled()
    expect(mockedApi.compensaciones.preview).not.toHaveBeenCalled()
  })

  it('el ejemplo de Luis: 70 disponibles, aplica 25 a la factura de 25 → manda una sola línea fuente→factura de 25', async () => {
    mockedApi.compensaciones.preview.mockResolvedValue({
      master_client_id: 7, total_aplicado: 25, saldo_a_favor_antes: 70, saldo_a_favor_despues: 45,
      facturas: [{ id: 3, numero: 'F-0003', pendiente_antes: 25, aplicado: 25, pendiente_despues: 0 }], fuentes: [],
    })
    await abrirCliente()

    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0003'), { target: { value: '25' } })
    fireEvent.click(screen.getByText('compensaciones.modal.revisar'))

    await waitFor(() => expect(mockedApi.compensaciones.preview).toHaveBeenCalledWith(7, [{ source_type: 'cobro', source_id: 11, invoice_id: 3, monto: 25 }]))
    expect(await screen.findByTestId('comp-vista-previa')).toBeInTheDocument()
    expect(screen.getByText(/compensaciones\.modal\.previaSaldo/)).toHaveTextContent(/despues=.*45\.00/)
    expect(mockedApi.compensaciones.confirm).not.toHaveBeenCalled()
  })

  it('confirma recién tras la vista previa y muestra el folio con su documento', async () => {
    mockedApi.compensaciones.preview.mockResolvedValue({
      master_client_id: 7, total_aplicado: 25, saldo_a_favor_antes: 70, saldo_a_favor_despues: 45,
      facturas: [{ id: 3, numero: 'F-0003', pendiente_antes: 25, aplicado: 25, pendiente_despues: 0 }], fuentes: [],
    })
    mockedApi.compensaciones.confirm.mockResolvedValue({
      id: 99, folio: 'CMP-001', estado: 'confirmado', master_client_id: 7, cliente: 'Vitrio', monto_total: 25, confirmed_at: '2026-10-19T00:00:00Z', registrado_por: 'Contabilidad', lineas: [],
    })
    await abrirCliente()
    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0003'), { target: { value: '25' } })
    fireEvent.click(screen.getByText('compensaciones.modal.revisar'))
    fireEvent.click(await screen.findByText('compensaciones.modal.confirmar'))

    await waitFor(() => expect(mockedApi.compensaciones.confirm).toHaveBeenCalledWith(7, [{ source_type: 'cobro', source_id: 11, invoice_id: 3, monto: 25 }]))
    expect(await screen.findByTestId('comp-confirmada')).toHaveTextContent('CMP-001')
    fireEvent.click(screen.getByText('compensaciones.modal.descargarDocumento'))
    expect(mockedApi.compensaciones.downloadPdf).toHaveBeenCalledWith(99, 'CMP-001')
  })

  it('no deja revisar si una factura recibe más de lo que debe o si se pide más que el saldo a favor', async () => {
    await abrirCliente()

    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0003'), { target: { value: '30' } })   // debe 25
    expect(screen.getByText('compensaciones.modal.excedeFactura')).toBeInTheDocument()
    expect(screen.getByText('compensaciones.modal.revisar')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0003'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0001'), { target: { value: '60' } })   // 25+60 = 85 > 70
    expect(await screen.findByTestId('comp-faltante')).toBeInTheDocument()
    expect(screen.getByText('compensaciones.modal.revisar')).toBeDisabled()
  })

  it('reparte el dinero entre varias fuentes de la más antigua a la más reciente', async () => {
    mockedApi.compensaciones.cliente.mockResolvedValue(detalle({
      saldo_a_favor: 120,
      fuentes: [
        { source_type: 'abono', source_id: 5, etiqueta: 'Abono ABN-005', referencia: null, fecha: '2026-08-01T00:00:00Z', disponible: 40, factura_sugerida_id: null },
        { source_type: 'cobro', source_id: 11, etiqueta: 'Cobro REC-011', referencia: null, fecha: '2026-10-17T00:00:00Z', disponible: 80, factura_sugerida_id: null },
      ],
    }))
    mockedApi.compensaciones.preview.mockResolvedValue({ master_client_id: 7, total_aplicado: 100, saldo_a_favor_antes: 120, saldo_a_favor_despues: 20, facturas: [], fuentes: [] })
    await abrirCliente()

    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0001'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('compensaciones.modal.revisar'))

    await waitFor(() => expect(mockedApi.compensaciones.preview).toHaveBeenCalledWith(7, [
      { source_type: 'abono', source_id: 5, invoice_id: 1, monto: 40 },
      { source_type: 'cobro', source_id: 11, invoice_id: 1, monto: 60 },
    ]))
  })

  it('muestra el mensaje del servidor si el cruce ya no es válido', async () => {
    mockedApi.compensaciones.preview.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'Cobro REC-011 solo tiene $10.00 disponibles.' } } }))
    await abrirCliente()
    fireEvent.change(screen.getByLabelText('compensaciones.modal.montoAAplicar:numero=F-0003'), { target: { value: '25' } })
    fireEvent.click(screen.getByText('compensaciones.modal.revisar'))

    expect(await screen.findByRole('alert')).toHaveTextContent('REC-011')
  })

  it('un cliente sin dinero disponible o sin facturas lo dice', async () => {
    mockedApi.compensaciones.cliente.mockResolvedValue(detalle({ fuentes: [], facturas: [], sugerencia: [], saldo_a_favor: 0, pendiente: 0 }))
    renderPage()
    fireEvent.click((await screen.findAllByText('compensaciones.compensar'))[0])

    expect(await screen.findByTestId('comp-sin-fuentes')).toBeInTheDocument()
    expect(screen.getByTestId('comp-sin-facturas')).toBeInTheDocument()
  })
})
