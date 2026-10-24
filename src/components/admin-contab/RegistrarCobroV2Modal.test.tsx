import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegistrarCobroV2Modal from './RegistrarCobroV2Modal'
import { adminContabApi } from '@/api/adminContabApi'
import type { OpenInvoicesResult, PaymentClientOption, BankAccount } from '@/types/adminContab'

// SCRUM-1168 F2 — «Registrar cobro» del concepto nuevo: dinero que entra, con o sin factura.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    payments: { searchClients: vi.fn(), openInvoices: vi.fn(), defaultBankAccount: vi.fn(), registerV2: vi.fn() },
    bankAccounts: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CLIENT: PaymentClientOption = { id: 7, name: 'Vitrio Retail, S.A.' }
const CORRIENTE: BankAccount = { id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1111', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 }

function makeOpenInvoices(overrides: Partial<OpenInvoicesResult> = {}): OpenInvoicesResult {
  return {
    invoices: [
      { id: 1, numero: 'F-0001', monto: 100, saldo_pendiente: 100, abono_obligatorio: null, neto_a_cobrar: 100, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
      { id: 2, numero: 'F-0002', monto: 50, saldo_pendiente: 50, abono_obligatorio: null, neto_a_cobrar: 50, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
      { id: 3, numero: 'F-0003', monto: 25, saldo_pendiente: 25, abono_obligatorio: null, neto_a_cobrar: 25, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ],
    credit_balance: 0,
    master_client_name: null,
    ...overrides,
  }
}

function renderModal(props: Partial<React.ComponentProps<typeof RegistrarCobroV2Modal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RegistrarCobroV2Modal onClose={vi.fn()} onRegistered={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

async function selectClient() {
  const input = screen.getByPlaceholderText('cobros.registrarModal.clientePlaceholder')
  fireEvent.change(input, { target: { value: 'Vitrio' } })
  fireEvent.focus(input)
  fireEvent.mouseDown(await screen.findByText('Vitrio Retail, S.A.'))
}

function escribirMonto(valor: string) {
  fireEvent.change(screen.getByTestId('cobro-monto'), { target: { value: valor } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.payments.searchClients.mockResolvedValue([CLIENT])
  mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices())
  mockedApi.payments.defaultBankAccount.mockResolvedValue({ id: CORRIENTE.id, label: 'Banco General — Cuenta Corriente' })
  mockedApi.bankAccounts.list.mockResolvedValue([CORRIENTE])
})

describe('RegistrarCobroV2Modal', () => {
  it('busca entre TODOS los clientes (no solo los que deben) y pide primero el cliente', async () => {
    renderModal()
    await selectClient()
    expect(mockedApi.payments.searchClients).toHaveBeenCalledWith(expect.any(String), false, false)
    expect(await screen.findByTestId('cobro-monto')).toBeInTheDocument()
  })

  it('un cobro SIN factura se registra con solo cliente, monto y cuenta; todo queda como saldo a favor', async () => {
    mockedApi.payments.registerV2.mockResolvedValue({} as never)
    const onRegistered = vi.fn()
    renderModal({ onRegistered })
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('700')

    expect(screen.getByTestId('cobro-saldo-a-favor')).toHaveTextContent('700')
    await waitFor(() => expect(screen.getByText('cobros.v2.registrar')).not.toBeDisabled())
    fireEvent.click(screen.getByText('cobros.v2.registrar'))

    await waitFor(() => expect(mockedApi.payments.registerV2).toHaveBeenCalled())
    const payload = mockedApi.payments.registerV2.mock.calls[0][0]
    expect(payload).toMatchObject({ master_client_id: 7, monto_recibido: 700, metodo_pago: 'transferencia', aplicaciones: [] })
    await waitFor(() => expect(onRegistered).toHaveBeenCalled())
  })

  it('el ejemplo de Luis: paga 70 y aplica solo 25 a la factura de 25 → quedan 45 de saldo a favor, y lo muestra antes de registrar', async () => {
    mockedApi.payments.registerV2.mockResolvedValue({} as never)
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('70')

    fireEvent.change(screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0003'), { target: { value: '25' } })

    expect(screen.getByTestId('cobro-aplicado')).toHaveTextContent('25')
    expect(screen.getByTestId('cobro-saldo-a-favor')).toHaveTextContent('45')
    expect(screen.getByText(/cobros\.v2\.implicacionSaldo/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('cobros.v2.registrar'))
    await waitFor(() => expect(mockedApi.payments.registerV2).toHaveBeenCalled())
    expect(mockedApi.payments.registerV2.mock.calls[0][0].aplicaciones).toEqual([{ invoice_id: 3, monto: 25 }])
  })

  it('«Aplicar todo» aplica el pendiente de la factura o lo que queda del cobro, lo que sea menor (pago parcial)', async () => {
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('120')

    const filaF1 = screen.getByTestId('cobro-factura-1')
    fireEvent.click(filaF1.querySelector('button') as HTMLButtonElement)   // F-0001 pendiente 100 → aplica 100
    fireEvent.click(screen.getByTestId('cobro-factura-2').querySelector('button') as HTMLButtonElement) // F-0002 pendiente 50, quedan 20 → aplica 20

    expect((screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0001') as HTMLInputElement).value).toBe('100')
    expect((screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0002') as HTMLInputElement).value).toBe('20')
    expect(screen.getByTestId('cobro-saldo-a-favor')).toHaveTextContent('0')
  })

  it('no deja registrar si una factura recibe más de lo que debe o si se aplica más de lo recibido', async () => {
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('500')

    fireEvent.change(screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0003'), { target: { value: '30' } })   // debe 25
    expect(screen.getByText('cobros.v2.excedeFactura')).toBeInTheDocument()
    expect(screen.getByText('cobros.v2.registrar')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0003'), { target: { value: '25' } })
    escribirMonto('10')
    expect(screen.getByText('cobros.v2.aplicaMasQueElCobro')).toBeInTheDocument()
    expect(screen.getByText('cobros.v2.registrar')).toBeDisabled()
  })

  it('un método que espera confirmación avisa que lo aplicado a facturas se aplicará al confirmar', async () => {
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('100')
    fireEvent.change(screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0001'), { target: { value: '100' } })

    expect(screen.getByText('cobros.v2.implicacionConfirmacion')).toBeInTheDocument()
  })

  it('retención de impuestos exige aplicar todo a facturas (no deja saldo) y no pide cuenta bancaria', async () => {
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('50')
    fireEvent.change(screen.getByDisplayValue('cobros.metodos.transferencia'), { target: { value: 'retencion_impuestos' } })

    expect(screen.getByText('cobros.v2.sinCuentaAplicarTodo')).toBeInTheDocument()
    expect(screen.getByText('cobros.v2.registrar')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('cobros.v2.montoAAplicar:numero=F-0002'), { target: { value: '50' } })
    expect(screen.queryByText('cobros.v2.sinCuentaAplicarTodo')).not.toBeInTheDocument()
    expect(screen.getByText('cobros.v2.registrar')).not.toBeDisabled()
  })

  it('muestra el mensaje del servidor si rechaza el cobro', async () => {
    mockedApi.payments.registerV2.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'La factura F-0001 tiene pendiente $100.00 y se intenta aplicar $120.00.' } } }))
    renderModal()
    await selectClient()
    await screen.findByTestId('cobro-monto')
    escribirMonto('200')
    fireEvent.click(screen.getByText('cobros.v2.registrar'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
