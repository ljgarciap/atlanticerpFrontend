import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegistrarCobroModal from './RegistrarCobroModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { OpenInvoicesResult, PaymentClientOption, BankAccount, Payment } from '@/types/adminContab'

// Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467).

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
    payments: {
      summary: vi.fn(), searchClients: vi.fn(), openInvoices: vi.fn(), defaultBankAccount: vi.fn(), register: vi.fn(),
    },
    bankAccounts: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CLIENT: PaymentClientOption = { id: 7, name: 'Vitrio Retail, S.A.' }
const CORRIENTE: BankAccount = { id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1111', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 }
const TARJETA: BankAccount = { id: 2, banco: 'Banistmo', tipo_cuenta: 'tarjeta_credito', ultimos_4_digitos: '2222', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 }

function makeOpenInvoices(overrides: Partial<OpenInvoicesResult> = {}): OpenInvoicesResult {
  return {
    invoices: [
      {
        id: 1, numero: 'F-0001', monto: 4000, saldo_pendiente: 4000, abono_obligatorio: null, neto_a_cobrar: 4000,
        sales_project_id: 10, proyecto: 'Torre Azul', quote_id: 100, cotizacion_folio: 'COT-2026-0100',
      },
      {
        id: 2, numero: 'F-0002', monto: 2200, saldo_pendiente: 2200, abono_obligatorio: null, neto_a_cobrar: 2200,
        sales_project_id: 20, proyecto: 'Casa Miramar', quote_id: 200, cotizacion_folio: 'COT-2026-0200',
      },
    ],
    credit_balance: 0,
    master_client_name: null,
    ...overrides,
  }
}

function renderModal(props: Partial<React.ComponentProps<typeof RegistrarCobroModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RegistrarCobroModal onClose={vi.fn()} onRegistered={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

async function selectClient() {
  const input = screen.getByPlaceholderText('cobros.registrarModal.clientePlaceholder')
  fireEvent.change(input, { target: { value: 'Vitrio' } })
  fireEvent.focus(input)
  fireEvent.mouseDown(await screen.findByText('Vitrio Retail, S.A.'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.payments.searchClients.mockResolvedValue([CLIENT])
  mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices())
  mockedApi.payments.defaultBankAccount.mockResolvedValue({ id: CORRIENTE.id, label: 'Banco General — Cuenta Corriente' })
  mockedApi.bankAccounts.list.mockResolvedValue([CORRIENTE, TARJETA])
})

describe('RegistrarCobroModal — REQ-464 selección de cliente y facturas', () => {
  it('al elegir un cliente lista sus facturas con saldo pendiente', async () => {
    renderModal()
    await selectClient()

    expect(await screen.findByText('F-0001')).toBeInTheDocument()
    expect(screen.getByText('F-0002')).toBeInTheDocument()
    expect(mockedApi.payments.openInvoices).toHaveBeenCalledWith(7)
  })

  it('cliente sin facturas pendientes muestra el mensaje explícito, no una lista vacía', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ invoices: [] }))
    renderModal()
    await selectClient()
    expect(await screen.findByText('cobros.registrarModal.sinFacturasPendientes')).toBeInTheDocument()
  })

  // SCRUM-905 — el buscador debe pedir solo clientes con facturas pendientes de cobro, no la
  // lista completa de clientes del sistema.
  it('busca clientes filtrando solo los que tienen facturas pendientes de cobro', async () => {
    renderModal()
    const input = screen.getByPlaceholderText('cobros.registrarModal.clientePlaceholder')
    fireEvent.change(input, { target: { value: 'Vitrio' } })
    await waitFor(() => expect(mockedApi.payments.searchClients).toHaveBeenCalledWith('Vitrio', false, true))
  })

  it('Escenario 2 — seleccionar 2 facturas ($4,000 + $2,200) muestra el total en tiempo real', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')

    fireEvent.click(screen.getByRole('checkbox', { name: /F-0001/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /F-0002/ }))

    expect(await screen.findByTestId('total-facturas')).toHaveTextContent(/6,200\.00/)
  })
})

describe('RegistrarCobroModal — SCRUM-931 filtro cruzado Proyecto/# Cotización', () => {
  it('elegir un Proyecto filtra las opciones de Cotización y la lista de facturas al de ese proyecto', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.proyectoLabel'), { target: { value: '10' } })

    // Solo F-0001 (proyecto 10) queda visible; F-0002 (proyecto 20) desaparece de la lista.
    expect(screen.getByText('F-0001')).toBeInTheDocument()
    expect(screen.queryByText('F-0002')).not.toBeInTheDocument()

    // El select de Cotización solo ofrece la cotización del proyecto elegido.
    const cotizacionSelect = screen.getByLabelText('cobros.registrarModal.cotizacionLabel') as HTMLSelectElement
    const opciones = Array.from(cotizacionSelect.options).map(o => o.textContent)
    expect(opciones).toContain('COT-2026-0100')
    expect(opciones).not.toContain('COT-2026-0200')
  })

  it('elegir una Cotización autocompleta/filtra el Proyecto al de esa cotización', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.cotizacionLabel'), { target: { value: '200' } })

    const proyectoSelect = screen.getByLabelText('cobros.registrarModal.proyectoLabel') as HTMLSelectElement
    expect(proyectoSelect.value).toBe('20')
    expect(screen.getByText('F-0002')).toBeInTheDocument()
    expect(screen.queryByText('F-0001')).not.toBeInTheDocument()
  })

  it('limpiar la selección de Proyecto/Cotización (volver a "Todos"/"Todas") restaura la lista completa', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.proyectoLabel'), { target: { value: '10' } })
    expect(screen.queryByText('F-0002')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.proyectoLabel'), { target: { value: '' } })
    expect(screen.getByText('F-0001')).toBeInTheDocument()
    expect(screen.getByText('F-0002')).toBeInTheDocument()
  })

  /**
   * Bug real encontrado en Senior Review (2026-09-20): el total y el payload de registro usaban
   * `selectedInvoiceIds` contra la lista COMPLETA de facturas, no contra `visibleInvoices` — una
   * factura tildada y luego ocultada por el filtro seguía "cobrándose" sin checkbox visible.
   */
  it('tildar F-0001, filtrar a un Proyecto que la oculta, y el total dejar de incluirla', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')

    fireEvent.click(screen.getByRole('checkbox', { name: /F-0001/ }))
    expect(await screen.findByTestId('total-facturas')).toHaveTextContent(/4,000\.00/)

    // Filtrar a Proyecto 20 (Casa Miramar) — oculta F-0001 (proyecto 10), que seguía tildada.
    fireEvent.change(screen.getByLabelText('cobros.registrarModal.proyectoLabel'), { target: { value: '20' } })

    expect(screen.queryByText('F-0001')).not.toBeInTheDocument()
    // La única factura tildada quedó oculta por el filtro → la selección se podó a vacío → el
    // bloque de total (gateado por selectedInvoiceIds.size > 0) desaparece por completo. Antes del
    // fix, el total seguía en pantalla mostrando 4,000.00 pese a que F-0001 ya no era visible.
    expect(screen.queryByTestId('total-facturas')).not.toBeInTheDocument()
  })
})

describe('RegistrarCobroModal — SCRUM-902 §4.4 saldo a favor a nivel Cliente master', () => {
  it('Escenario 9 — aplicar $500 de saldo cliente sobre $6,200 de facturas deja el monto recibido en $5,700', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ credit_balance: 500 }))
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /F-0002/ }))

    // A diferencia del viejo checkbox todo-o-nada, nunca arranca aplicado — es un monto que el
    // usuario decide y escribe.
    expect(await screen.findByTestId('monto-recibido')).toHaveTextContent(/6,200\.00/)
    fireEvent.change(screen.getByLabelText(/saldoClienteLabel/), { target: { value: '500' } })

    expect(await screen.findByTestId('monto-recibido')).toHaveTextContent(/5,700\.00/)
  })

  it('Escenario 8 — un monto de saldo cliente mayor al disponible bloquea el registro con mensaje explícito', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ credit_balance: 400 }))
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))

    fireEvent.change(screen.getByLabelText(/saldoClienteLabel/), { target: { value: '500' } })

    expect(await screen.findByText(/saldoClienteExcede/)).toBeInTheDocument()
    expect(screen.getByText('cobros.registrarModal.confirm')).toBeDisabled()
  })

  it('saldo cliente que cubre el 100% de la factura: monto recibido $0, cuenta bancaria deja de ser obligatoria', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({
      invoices: [{
        id: 1, numero: 'F-0001', monto: 6200, saldo_pendiente: 6200, abono_obligatorio: null, neto_a_cobrar: 6200,
        sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null,
      }],
      credit_balance: 6200,
    }))
    mockedApi.payments.register.mockResolvedValue({ id: 1, estado: 'confirmado' } as Payment)
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    fireEvent.change(screen.getByLabelText(/saldoClienteLabel/), { target: { value: '6200' } })

    expect(await screen.findByTestId('monto-recibido')).toHaveTextContent(/^(?:USD|\$)\s?0\.00$/)

    // RN4 REQ-465/467 — el campo SIGUE visible/editable (RN3 de REQ-466 — "sigue siendo editable
    // manualmente"), solo deja de ser OBLIGATORIO: el registro queda habilitado sin elegir cuenta.
    fireEvent.click(screen.getByText('cobros.registrarModal.confirm'))
    await waitFor(() => expect(mockedApi.payments.register).toHaveBeenCalledWith(expect.objectContaining({
      bank_account_id: null, monto_recibido_estimado: 0,
    })))
  })
})

describe('RegistrarCobroModal — REQ-466 método de pago y cuenta bancaria', () => {
  it('Tarjeta autocompleta Banistmo — Tarjeta de Crédito', async () => {
    mockedApi.payments.defaultBankAccount.mockImplementation((metodo) =>
      Promise.resolve(metodo === 'tarjeta' ? { id: TARJETA.id, label: 'x' } : { id: CORRIENTE.id, label: 'x' }))
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.metodoPagoLabel'), { target: { value: 'tarjeta' } })

    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(TARJETA.id))
    })
  })

  it('el método por defecto (Transferencia) ya trae Banco General — Cuenta Corriente sin tocar nada', async () => {
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))

    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(CORRIENTE.id))
    })
  })

  // SCRUM-955 §3 — antes ocultaba el campo por completo; ahora lo muestra bloqueado en "Otros"
  // (el payload sigue mandando bank_account_id: null, sin cambio de contrato con backend).
  it('Retención de impuestos bloquea el campo de cuenta bancaria en "Otros"', async () => {
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    fireEvent.change(screen.getByLabelText('cobros.registrarModal.metodoPagoLabel'), { target: { value: 'retencion_impuestos' } })

    const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
    expect(select).toBeDisabled()
    expect(select.value).toBe('otros')
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['cobros.registrarModal.cuentaBancariaOtros'])
    expect(screen.getByLabelText('cobros.registrarModal.numeroDocumentoRetencionLabel')).toBeInTheDocument()
  })
})

describe('RegistrarCobroModal — REQ-467 campos condicionales y validación', () => {
  it('Ajustes de cuenta bloquea el registro sin comentario, lo habilita al escribirlo', async () => {
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    fireEvent.change(screen.getByLabelText('cobros.registrarModal.metodoPagoLabel'), { target: { value: 'ajuste_cuenta' } })

    const confirmBtn = screen.getByText('cobros.registrarModal.confirm')
    expect(confirmBtn).toBeDisabled()

    // regex, no string exacto — el <label> también envuelve el hint de "obligatorio" debajo del
    // textarea, así que el nombre accesible calculado incluye ambos textos.
    fireEvent.change(screen.getByLabelText(/comentarioAjusteLabel/), { target: { value: 'Ajuste por diferencia cambiaria' } })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('sin ninguna factura seleccionada, el botón de registrar queda deshabilitado', async () => {
    renderModal()
    await selectClient()
    await screen.findByText('F-0001')
    expect(screen.getByText('cobros.registrarModal.confirm')).toBeDisabled()
  })

  it('registro exitoso llama a register() con el payload correcto y cierra el modal', async () => {
    mockedApi.payments.register.mockResolvedValue({ id: 1, estado: 'confirmado' } as Payment)
    const onRegistered = vi.fn()
    renderModal({ onRegistered })
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))

    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(CORRIENTE.id))
    })

    fireEvent.click(screen.getByText('cobros.registrarModal.confirm'))

    await waitFor(() => expect(mockedApi.payments.register).toHaveBeenCalledWith({
      master_client_id: 7,
      invoice_ids: [1],
      monto_saldo_cliente_aplicado: 0,
      metodo_pago: 'transferencia',
      monto_recibido_estimado: 4000,
      bank_account_id: CORRIENTE.id,
      numero_documento_retencion: null,
      comentario_ajuste: null,
      referencia: null,
      comprobante: null,
    }))
    await waitFor(() => expect(onRegistered).toHaveBeenCalled())
  })
})

describe('RegistrarCobroModal — REQ-468/470/471 referencia y comprobante', () => {
  it('escribir una referencia la manda en el payload de registro', async () => {
    mockedApi.payments.register.mockResolvedValue({ id: 1, estado: 'confirmado' } as Payment)
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(CORRIENTE.id))
    })

    fireEvent.change(screen.getByLabelText('cobros.registrarModal.referenciaLabel'), { target: { value: 'TRF-88213' } })
    fireEvent.click(screen.getByText('cobros.registrarModal.confirm'))

    await waitFor(() => expect(mockedApi.payments.register).toHaveBeenCalledWith(
      expect.objectContaining({ referencia: 'TRF-88213' }),
    ))
  })

  it('Escenario 1 REQ-468 — adjuntar un PDF lo deja visible y lo manda en el payload', async () => {
    mockedApi.payments.register.mockResolvedValue({ id: 1, estado: 'confirmado' } as Payment)
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(CORRIENTE.id))
    })

    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('comprobante.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByText('cobros.registrarModal.confirm'))

    await waitFor(() => expect(mockedApi.payments.register).toHaveBeenCalledWith(
      expect.objectContaining({ comprobante: file }),
    ))
  })

  it('Escenario 2 REQ-468 — sin comprobante adjunto el registro se manda igual', async () => {
    mockedApi.payments.register.mockResolvedValue({ id: 1, estado: 'confirmado' } as Payment)
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))
    await waitFor(() => {
      const select = screen.getByLabelText('cobros.registrarModal.cuentaBancariaLabel') as HTMLSelectElement
      expect(select.value).toBe(String(CORRIENTE.id))
    })

    fireEvent.click(screen.getByText('cobros.registrarModal.confirm'))

    await waitFor(() => expect(mockedApi.payments.register).toHaveBeenCalledWith(
      expect.objectContaining({ comprobante: null }),
    ))
  })

  it('un archivo con tipo no aceptado muestra el error y no lo adjunta', async () => {
    renderModal()
    await selectClient()
    fireEvent.click(await screen.findByRole('checkbox', { name: /F-0001/ }))

    const file = new File(['contenido'], 'comprobante.txt', { type: 'text/plain' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('cobros.registrarModal.comprobanteInvalidType')).toBeInTheDocument()
    expect(screen.queryByText('comprobante.txt')).not.toBeInTheDocument()
  })
})

// Batch 7 del cuerpo principal (SCRUM-551, REQ-474) — apertura automática desde Facturación.
describe('RegistrarCobroModal — REQ-474 apertura automática desde Facturación', () => {
  it('Escenario 1 — cliente preseleccionado válido: el nombre se completa y sus facturas se ven', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ master_client_name: 'Vitrio Retail, S.A.' }))
    renderModal({ initialMasterClientId: 7 })

    expect(await screen.findByDisplayValue('Vitrio Retail, S.A.')).toBeInTheDocument()
    expect(await screen.findByText('F-0001')).toBeInTheDocument()
  })

  it('Escenario 2 — id preseleccionado inválido: sin error visible, cae a comportamiento manual', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ invoices: [], master_client_name: null }))
    renderModal({ initialMasterClientId: 999999 })

    // Sin nombre resuelto, la sección de facturas (ligada a `masterClientId !== null`)
    // desaparece — se comporta como recién abierto manualmente — sin error visible.
    await waitFor(() => expect(screen.queryByText('cobros.registrarModal.facturasLabel')).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText('cobros.registrarModal.clientePlaceholder')).toHaveValue('')
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
  })
})
