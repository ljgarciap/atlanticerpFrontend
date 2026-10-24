import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegistrarAbonoModal from './RegistrarAbonoModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { Abono, BankAccount } from '@/types/adminContab'

// SCRUM-902 — "Registrar abono" (4O): detalle SIEMPRE abre bloqueado, edición inline, y la
// regla de obligatoriedad condicional (sub-cliente elegido -> proyecto obligatorio).

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
    payments: { searchClients: vi.fn(), defaultBankAccount: vi.fn() },
    bankAccounts: { list: vi.fn() },
    abonos: {
      list: vi.fn(), detail: vi.fn(), subClientes: vi.fn(), proyectos: vi.fn(), facturas: vi.fn(),
      invoicesForSubClient: vi.fn(),
      register: vi.fn(), update: vi.fn(), confirm: vi.fn(), downloadReceiptPdf: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CORRIENTE: BankAccount = { id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1111', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 }

function makeAbono(overrides: Partial<Abono> = {}): Abono {
  return {
    id: 5, fecha_registro: '2026-07-09', master_client_id: 3, cliente: 'Torres Pacífico',
    sub_client_id: null, sub_cliente: null, sales_project_id: null, proyecto: null,
    invoice_id: null, factura: null, nivel_asociacion: 'cliente',
    monto_original: 250, monto_usado: 0, monto_disponible: 250, estado_saldo: 'disponible',
    metodo_pago: 'yappy', cuenta_bancaria_id: 1,
    referencia: 'YP-4471', comprobante_url: null, estado: 'por_confirmar',
    registrado_por: 'Felix', confirmado_por: null, fecha_confirmacion: null, abono_origen_id: null,
    numero_recibo: null,
    ...overrides,
  }
}

function renderModal(abonoId: number | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <RegistrarAbonoModal abonoId={abonoId} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  )
  return { onClose, onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.abonos.subClientes.mockResolvedValue([{ id: 1, name: 'Torre B' }])
  mockedApi.abonos.proyectos.mockResolvedValue([{ id: 10, name: 'Remodelación pisos 4-6' }])
  mockedApi.abonos.facturas.mockResolvedValue([])
  mockedApi.abonos.invoicesForSubClient.mockResolvedValue([])
  mockedApi.payments.searchClients.mockResolvedValue([{ id: 3, name: 'Torres Pacífico' }])
  mockedApi.payments.defaultBankAccount.mockResolvedValue({ id: 1, label: 'Banco General — Cuenta Corriente' })
  mockedApi.bankAccounts.list.mockResolvedValue([CORRIENTE])
})

describe('RegistrarAbonoModal — Escenario 4: detalle siempre abre bloqueado', () => {
  it('un abono "por_confirmar" abre bloqueado pero con botón Editar visible', async () => {
    mockedApi.abonos.detail.mockResolvedValue(makeAbono())
    renderModal(5)

    const referencia = await screen.findByDisplayValue('YP-4471') as HTMLInputElement
    expect(referencia).toBeDisabled()
    expect(screen.getByText('abonos.form.editar')).toBeInTheDocument()
  })

  it('un abono confirmado nunca muestra el botón Editar', async () => {
    mockedApi.abonos.detail.mockResolvedValue(makeAbono({ estado: 'confirmado' }))
    renderModal(5)

    await screen.findByDisplayValue('YP-4471')
    expect(screen.queryByText('abonos.form.editar')).not.toBeInTheDocument()
    expect(screen.getByText('abonos.form.bannerConfirmado')).toBeInTheDocument()
  })

  it('Editar habilita los campos y Cancelar los vuelve a bloquear con los valores originales', async () => {
    mockedApi.abonos.detail.mockResolvedValue(makeAbono())
    renderModal(5)

    const referencia = await screen.findByDisplayValue('YP-4471') as HTMLInputElement
    fireEvent.click(screen.getByText('abonos.form.editar'))
    expect(referencia).not.toBeDisabled()

    fireEvent.change(referencia, { target: { value: 'YP-9999' } })
    fireEvent.click(screen.getByText('abonos.form.cancelar'))

    const restored = await screen.findByDisplayValue('YP-4471') as HTMLInputElement
    expect(restored).toBeDisabled()
  })
})

const INVOICES_FOR_SUBCLIENT = [
  { id: 1, numero: 'F-0001', sales_project_id: 10, proyecto: 'Torre Azul', quote_id: 100, cotizacion_folio: 'COT-2026-0100', monto: 500 },
  { id: 2, numero: 'F-0002', sales_project_id: 20, proyecto: 'Casa Miramar', quote_id: 200, cotizacion_folio: 'COT-2026-0200', monto: 300 },
]

async function selectClientAndSubCliente() {
  fireEvent.change(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'), { target: { value: 'Torres' } })
  fireEvent.focus(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'))
  fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))
  await screen.findByText('Torre B')
  const selects = screen.getAllByRole('combobox')
  const subClienteSelect = selects.find(el => (el as HTMLSelectElement).innerHTML.includes('Torre B')) as HTMLSelectElement
  fireEvent.change(subClienteSelect, { target: { value: '1' } })
}

describe('RegistrarAbonoModal — SCRUM-933 buscador cruzado Proyecto/# Cotización', () => {
  beforeEach(() => {
    mockedApi.abonos.invoicesForSubClient.mockResolvedValue(INVOICES_FOR_SUBCLIENT)
  })

  it('tras elegir Sub-cliente, el buscador de Proyecto ofrece las opciones de ese sub-cliente', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder')
    fireEvent.focus(proyectoInput)
    expect(await screen.findByText('Torre Azul')).toBeInTheDocument()
    expect(screen.getByText('Casa Miramar')).toBeInTheDocument()
  })

  it('elegir una Cotización autocompleta el Proyecto correspondiente y acota Factura', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const cotizacionInput = await screen.findByPlaceholderText('abonos.form.cotizacionPlaceholder')
    fireEvent.focus(cotizacionInput)
    fireEvent.mouseDown(await screen.findByText('COT-2026-0200'))

    const proyectoInput = screen.getByPlaceholderText('abonos.form.proyectoPlaceholder') as HTMLInputElement
    expect(proyectoInput.value).toBe('Casa Miramar')

    const facturaSelect = screen.getByLabelText('abonos.form.facturaLabel') as HTMLSelectElement
    const opciones = Array.from(facturaSelect.options).map(o => o.textContent)
    expect(opciones).toContain('F-0002')
    expect(opciones).not.toContain('F-0001')
  })

  it('elegir un Proyecto filtra las opciones de Cotización al de ese proyecto', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder')
    fireEvent.focus(proyectoInput)
    fireEvent.mouseDown(await screen.findByText('Torre Azul'))

    const cotizacionInput = screen.getByPlaceholderText('abonos.form.cotizacionPlaceholder')
    fireEvent.focus(cotizacionInput)
    expect(await screen.findByText('COT-2026-0100')).toBeInTheDocument()
    expect(screen.queryByText('COT-2026-0200')).not.toBeInTheDocument()
  })

  /**
   * Bug de clase ya encontrado y corregido en RegistrarCobroModal.tsx (SCRUM-931) y
   * RegistrarNotaCreditoModal.tsx (SCRUM-932): una factura tildada y luego ocultada por el filtro
   * debía podarse, corregido acá desde el primer intento (no un rebote de Pre-QA).
   */
  it('elegir una Factura y luego cambiar el Proyecto de forma que la oculte la deselecciona', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder')
    fireEvent.focus(proyectoInput)
    fireEvent.mouseDown(await screen.findByText('Torre Azul'))

    const facturaSelect = screen.getByLabelText('abonos.form.facturaLabel') as HTMLSelectElement
    fireEvent.change(facturaSelect, { target: { value: '1' } })
    expect(facturaSelect.value).toBe('1')

    fireEvent.change(proyectoInput, { target: { value: 'Casa' } })
    fireEvent.mouseDown(await screen.findByText('Casa Miramar'))

    await waitFor(() => expect(facturaSelect.value).toBe(''))
  })

  // SCRUM-948 — Cobros limpia Proyecto/# Cotización en un solo paso (elegir "Todos"/"Todas" en su
  // <select>, ya testeado en RegistrarCobroModal.test.tsx); el buscador de texto de Abono
  // (SCRUM-933, mantenido a propósito) ahora tiene el mismo resultado en un solo clic.
  it('el botón de limpiar en Proyecto vacía el buscador, quita el filtro y vuelve a deshabilitar Factura', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder') as HTMLInputElement
    fireEvent.focus(proyectoInput)
    fireEvent.mouseDown(await screen.findByText('Torre Azul'))
    expect(proyectoInput.value).toBe('Torre Azul')

    const facturaSelect = screen.getByLabelText('abonos.form.facturaLabel') as HTMLSelectElement
    fireEvent.change(facturaSelect, { target: { value: '1' } })
    expect(facturaSelect.value).toBe('1')

    const limpiarProyecto = screen.getAllByLabelText('abonos.form.limpiarBusqueda')[1]
    fireEvent.mouseDown(limpiarProyecto)

    expect(proyectoInput.value).toBe('')
    expect(facturaSelect).toBeDisabled()
    expect(facturaSelect.value).toBe('')

    // Sin filtro de Proyecto, # de Cotización vuelve a ofrecer las de AMBOS proyectos.
    const cotizacionInput = screen.getByPlaceholderText('abonos.form.cotizacionPlaceholder')
    fireEvent.focus(cotizacionInput)
    expect(await screen.findByText('COT-2026-0100')).toBeInTheDocument()
    expect(screen.getByText('COT-2026-0200')).toBeInTheDocument()
  })

  it('el botón de limpiar en Cliente master reinicia toda la cadena (sub-cliente, proyecto, cotización)', async () => {
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder') as HTMLInputElement
    fireEvent.focus(proyectoInput)
    fireEvent.mouseDown(await screen.findByText('Torre Azul'))

    const clienteInput = screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder') as HTMLInputElement
    const limpiarCliente = screen.getAllByLabelText('abonos.form.limpiarBusqueda')[0]
    fireEvent.mouseDown(limpiarCliente)

    expect(clienteInput.value).toBe('')
    // Sin cliente/sub-cliente, Proyecto vuelve a estar deshabilitado con su hint de bloqueo.
    expect(proyectoInput).toBeDisabled()
    expect(proyectoInput.value).toBe('')
    expect(proyectoInput.getAttribute('placeholder')).toBe('abonos.form.proyectoDisabledHint')
    // Sub-cliente vuelve al hint de "selecciona primero un cliente master".
    const selects = screen.getAllByRole('combobox')
    const subClienteSelect = selects.find(el => (el as HTMLSelectElement).innerHTML.includes('abonos.form.subClienteDisabledHint')) as HTMLSelectElement
    expect(subClienteSelect).toBeDisabled()
  })
})

describe('RegistrarAbonoModal — SCRUM-955 §1: tope de monto contra la factura seleccionada', () => {
  beforeEach(() => {
    mockedApi.abonos.invoicesForSubClient.mockResolvedValue(INVOICES_FOR_SUBCLIENT)
  })

  // Ajuste de alcance (Luis, post Backend Dev SCRUM-902 §4.5): un bloqueo duro rompe el camino ya
  // aprobado donde el excedente de un abono a nivel Factura se convierte en saldo a favor de
  // Cliente al cobrarse — la advertencia es solo informativa, nunca bloquea "Guardar abono".
  it('muestra el monto de la factura elegida y advierte (sin bloquear) si el abono lo supera', async () => {
    mockedApi.abonos.register.mockResolvedValue(makeAbono())
    renderModal(null)
    await selectClientAndSubCliente()

    const proyectoInput = await screen.findByPlaceholderText('abonos.form.proyectoPlaceholder')
    fireEvent.focus(proyectoInput)
    fireEvent.mouseDown(await screen.findByText('Torre Azul'))

    const facturaSelect = screen.getByLabelText('abonos.form.facturaLabel') as HTMLSelectElement
    fireEvent.change(facturaSelect, { target: { value: '1' } })

    expect(await screen.findByText('abonos.form.facturaMontoHint:monto=USD 500.00')).toBeInTheDocument()

    const montoInput = screen.getByPlaceholderText('$0.00')
    fireEvent.change(montoInput, { target: { value: '600' } })
    fireEvent.change(screen.getByPlaceholderText('abonos.form.referenciaPlaceholder'), { target: { value: 'YP-1' } })

    expect(await screen.findByText('abonos.form.montoExcedeFactura')).toBeInTheDocument()
    // La advertencia es informativa — el usuario puede seguir y confirmar el abono igual.
    expect(screen.getByText('abonos.form.guardarAbono')).not.toBeDisabled()

    fireEvent.click(screen.getByText('abonos.form.guardarAbono'))
    await waitFor(() => expect(mockedApi.abonos.register).toHaveBeenCalledWith(
      expect.objectContaining({ monto_original: 600, invoice_id: 1 }),
    ))

    fireEvent.change(montoInput, { target: { value: '400' } })
    expect(screen.queryByText('abonos.form.montoExcedeFactura')).not.toBeInTheDocument()
  })

  it('sin factura elegida (abono a nivel cliente) no aplica ningún tope', async () => {
    renderModal(null)
    fireEvent.change(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'), { target: { value: 'Torres' } })
    fireEvent.focus(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'))
    fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))

    const montoInput = screen.getByPlaceholderText('$0.00')
    fireEvent.change(montoInput, { target: { value: '999999' } })
    expect(screen.queryByText('abonos.form.montoExcedeFactura')).not.toBeInTheDocument()
  })
})

describe('RegistrarAbonoModal — SCRUM-955 §3: "Otros" para retención de impuestos/ajuste de cuenta', () => {
  it('bloquea el select de cuenta bancaria en "Otros" y no exige elegir una cuenta real', async () => {
    mockedApi.abonos.register.mockResolvedValue(makeAbono({ metodo_pago: 'ajuste_cuenta', cuenta_bancaria_id: null }))
    renderModal(null)
    fireEvent.change(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'), { target: { value: 'Torres' } })
    fireEvent.focus(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'))
    fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))

    const metodoSelect = screen.getByLabelText('abonos.form.metodoPagoLabel') as HTMLSelectElement
    fireEvent.change(metodoSelect, { target: { value: 'ajuste_cuenta' } })

    const cuentaSelect = await screen.findByLabelText('abonos.form.cuentaBancariaLabel') as HTMLSelectElement
    expect(cuentaSelect).toBeDisabled()
    expect(cuentaSelect.value).toBe('otros')
    expect(Array.from(cuentaSelect.options).map(o => o.textContent)).toEqual(['abonos.form.cuentaBancariaOtros'])

    fireEvent.change(screen.getByPlaceholderText('$0.00'), { target: { value: '100' } })
    fireEvent.change(screen.getByPlaceholderText('abonos.form.referenciaPlaceholder'), { target: { value: 'AJ-1' } })
    expect(screen.getByText('abonos.form.guardarAbono')).not.toBeDisabled()

    fireEvent.click(screen.getByText('abonos.form.guardarAbono'))
    await waitFor(() => expect(mockedApi.abonos.register).toHaveBeenCalled())
    expect(mockedApi.abonos.register.mock.calls[0][0]).toMatchObject({ cuenta_bancaria_id: null, metodo_pago: 'ajuste_cuenta' })
  })
})

describe('RegistrarAbonoModal — SCRUM-955 §2: botón "Ver recibo"', () => {
  it('descarga el recibo cuando el abono ya tiene numero_recibo', async () => {
    mockedApi.abonos.detail.mockResolvedValue(makeAbono({ numero_recibo: 'ABN-0007' }))
    mockedApi.abonos.downloadReceiptPdf.mockResolvedValue(undefined)
    renderModal(5)

    const verRecibo = await screen.findByText('abonos.form.verRecibo')
    fireEvent.click(verRecibo)

    await waitFor(() => expect(mockedApi.abonos.downloadReceiptPdf).toHaveBeenCalledWith(5, 'ABN-0007'))
  })

  it('no muestra el botón "Ver recibo" mientras el abono no tenga numero_recibo', async () => {
    mockedApi.abonos.detail.mockResolvedValue(makeAbono({ numero_recibo: null }))
    renderModal(5)

    await screen.findByDisplayValue('YP-4471')
    expect(screen.queryByText('abonos.form.verRecibo')).not.toBeInTheDocument()
  })
})

describe('RegistrarAbonoModal — Escenario 2: sub-cliente sin proyecto bloquea el registro', () => {
  it('deshabilita "Guardar abono" mientras haya sub-cliente elegido sin proyecto', async () => {
    renderModal(null)
    fireEvent.change(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'), { target: { value: 'Torres' } })
    fireEvent.focus(screen.getByPlaceholderText('abonos.form.clienteMasterPlaceholder'))
    fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))

    // Selecciona el único sub-cliente disponible (esperar a que la cascada cargue sus opciones).
    await screen.findByText('Torre B')
    const selects = screen.getAllByRole('combobox')
    const subClienteSelect = selects.find(el => (el as HTMLSelectElement).innerHTML.includes('Torre B')) as HTMLSelectElement
    fireEvent.change(subClienteSelect, { target: { value: '1' } })

    await waitFor(() => expect(screen.getByText('abonos.form.errorSubclienteSinProyecto')).toBeInTheDocument())
    // Sub-cliente elegido sin proyecto sigue bloqueando el guardado, sin importar los demás campos.
    expect(screen.getByText('abonos.form.guardarAbono')).toBeDisabled()
  })
})
