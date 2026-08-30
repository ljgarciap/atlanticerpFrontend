import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegistrarNotaCreditoModal from './RegistrarNotaCreditoModal'
import { adminContabApi } from '@/api/adminContabApi'
import type {
  NotaCreditoItbmsRateOption, NotaCreditoDevolucionPrecargada, NotaCreditoFacturaOrigen,
  PaymentClientOption, BankAccount, NotaCredito,
} from '@/types/adminContab'

// Batch 10 (SCRUM-553→558, REQ-476→481) construyó el formulario dinámico. Batch 11
// (SCRUM-559→564, REQ-482→487) agrega el submit real: factura de origen, monto/desglose ITBMS,
// excedente, banners+avisos automáticos, comprobante y el POST que registra la nota.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    payments: { searchClients: vi.fn() },
    bankAccounts: { list: vi.fn() },
    notasCredito: { itbmsRates: vi.fn(), facturas: vi.fn(), register: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const RATES: NotaCreditoItbmsRateOption[] = [
  { id: 1, nombre: 'General', descripcion: 'Con ITBMS', porcentaje: 7, es_base: true },
  { id: 2, nombre: 'Retención', descripcion: 'Retención de impuesto', porcentaje: 3.5, es_base: true },
  { id: 3, nombre: 'Exento', descripcion: 'Exento de ITBMS', porcentaje: 0, es_base: true },
]

const CLIENT: PaymentClientOption = { id: 1, name: 'Grupo Sensei' }

const FACTURAS: NotaCreditoFacturaOrigen[] = [
  { id: 10, numero: 'F-0001', monto: 6200, saldo_pendiente: 6200, itbms_percentage: 7, itbms_rate_id: 1 },
  { id: 11, numero: 'F-0002', monto: 1000, saldo_pendiente: 0, itbms_percentage: 7, itbms_rate_id: 1 },
]

const BANK_ACCOUNT: BankAccount = { id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1111', moneda: 'USD', activa: true, movimientos_count: 0 }

const DEVOLUCION: NotaCreditoDevolucionPrecargada = {
  cliente_id: 1,
  cliente_nombre: 'Grupo Sensei',
  factura_origen_id: 5,
  referencia: 'HS-3402',
  productos: [{ descripcion: 'Luminaria LED', cantidad: 2, monto_unitario: 150 }],
  persona_devuelve: 'María Torres',
  proyecto: 'Torres Pacífico',
  conformidad: 'Guía firmada #GE-1187',
  factura_monto: 500,
  factura_saldo_pendiente: 500,
  factura_itbms_percentage: 7,
  customer_return_id: 42,
}

function renderModal(props: Partial<Parameters<typeof RegistrarNotaCreditoModal>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RegistrarNotaCreditoModal
        onClose={vi.fn()} onRegistered={vi.fn()} onRequestCorreccionPreview={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

async function selectClient() {
  const input = screen.getByPlaceholderText('notasCredito.formulario.clientePlaceholder')
  fireEvent.change(input, { target: { value: 'Grupo' } })
  fireEvent.focus(input)
  fireEvent.mouseDown(await screen.findByText('Grupo Sensei'))
}

async function selectFactura(id: number) {
  const select = screen.getByText('notasCredito.formulario.facturaOrigenPlaceholder').closest('select')!
  await waitFor(() => expect(select.querySelector(`option[value="${id}"]`)).not.toBeNull())
  fireEvent.change(select, { target: { value: String(id) } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.payments.searchClients.mockResolvedValue([CLIENT])
  mockedApi.notasCredito.itbmsRates.mockResolvedValue(RATES)
  mockedApi.notasCredito.facturas.mockResolvedValue(FACTURAS)
  mockedApi.bankAccounts.list.mockResolvedValue([BANK_ACCOUNT])
  mockedApi.notasCredito.register.mockResolvedValue({ id: 1, numero: 'NC-0001', estado: 'aplicada', monto: 100, subtotal: 93.46, itbms: 6.54, resultado: 'aplicado_saldo' } as NotaCredito)
})

describe('RegistrarNotaCreditoModal — REQ-478 tipo por defecto', () => {
  it('abre en modo manual con tipo Descuento comercial por defecto, sin campos de anulación', () => {
    renderModal()
    expect(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial')).toBeInTheDocument()
    expect(screen.queryByText('notasCredito.formulario.subtipoLabel')).not.toBeInTheDocument()
  })

  it('el botón "Registrar nota" está deshabilitado sin cliente/factura elegidos', () => {
    renderModal()
    expect(screen.getByText('notasCredito.formulario.confirm')).toBeDisabled()
  })
})

describe('RegistrarNotaCreditoModal — REQ-479 Anulación completa', () => {
  it('al elegir Anulación completa aparece el subtipo (default Pedido cancelado) y la pregunta de mercancía', () => {
    renderModal()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    expect(screen.getByDisplayValue('notasCredito.subtiposAnulacion.cancelado')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.mercanciaRegresaLabel')).toBeInTheDocument()
  })

  it('al cambiar el subtipo a Corrección de datos desaparece la pregunta de mercancía y aparece el aviso+motivo', () => {
    renderModal()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    fireEvent.change(screen.getByDisplayValue('notasCredito.subtiposAnulacion.cancelado'), {
      target: { value: 'correccion' },
    })
    expect(screen.queryByText('notasCredito.formulario.mercanciaRegresaLabel')).not.toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.correccionAviso')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.motivoCorreccionLabel')).toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — REQ-480 Corrección de datos', () => {
  function openCorreccion() {
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    fireEvent.change(screen.getByDisplayValue('notasCredito.subtiposAnulacion.cancelado'), {
      target: { value: 'correccion' },
    })
  }

  it('motivo ITBMS muestra el selector de tratamiento correcto', async () => {
    renderModal()
    openCorreccion()
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoCorreccionPlaceholder').closest('select')!, {
      target: { value: 'itbms' },
    })
    expect(screen.getByText('notasCredito.formulario.tratamientoActualLabel')).toBeInTheDocument()
    expect(await screen.findByText('Con ITBMS (7%)')).toBeInTheDocument()
  })

  it('motivo Fecha muestra la fecha de hoy bloqueada, no editable', () => {
    renderModal()
    openCorreccion()
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoCorreccionPlaceholder').closest('select')!, {
      target: { value: 'fecha' },
    })
    const inputs = screen.getAllByDisplayValue(new Date().toISOString().slice(0, 10))
    expect(inputs[0]).toBeDisabled()
  })
})

describe('RegistrarNotaCreditoModal — REQ-481 Devolución de mercancía precargada', () => {
  it('cliente bloqueado, tipo de solo lectura, detalle precargado visible y banner de confirmación física', () => {
    renderModal({ devolucionPrecargada: DEVOLUCION })
    expect(screen.getByText('Grupo Sensei')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.tipoDevolucionReadonly')).toBeInTheDocument()
    expect(screen.getByText('HS-3402')).toBeInTheDocument()
    expect(screen.getByText('María Torres')).toBeInTheDocument()
    expect(screen.getByText('Torres Pacífico')).toBeInTheDocument()
    expect(screen.getByText(/Guía firmada #GE-1187/)).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.devolucionAviso')).toBeInTheDocument()
    // Sin buscador de cliente editable en este modo (RN2 REQ-481), ni selector de factura (RN3 REQ-483).
    expect(screen.queryByPlaceholderText('notasCredito.formulario.clientePlaceholder')).not.toBeInTheDocument()
    expect(screen.queryByText('notasCredito.formulario.facturaOrigenLabel')).not.toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — Corrección de datos: submit real vía revisión previa (Batch 12, REQ-488/489)', () => {
  function openCorreccion() {
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    fireEvent.change(screen.getByDisplayValue('notasCredito.subtiposAnulacion.cancelado'), {
      target: { value: 'correccion' },
    })
  }

  it('muestra el selector de factura de origen y el motivo, pero no el bloque de monto/excedente/comprobante', async () => {
    renderModal()
    await selectClient()
    openCorreccion()
    await selectFactura(10)
    expect(screen.getByText('notasCredito.formulario.facturaOrigenLabel')).toBeInTheDocument()
    expect(screen.queryByText('notasCredito.formulario.montoLabel')).not.toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.motivoLabel')).toBeInTheDocument()
  })

  it('elegir una factura en Pedido cancelado y luego cambiar a Corrección conserva la selección', async () => {
    renderModal()
    await selectClient()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    await selectFactura(10)
    expect(screen.getByText('notasCredito.formulario.montoLabel')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('notasCredito.subtiposAnulacion.cancelado'), {
      target: { value: 'correccion' },
    })
    expect(screen.getByDisplayValue(/F-0001/)).toBeInTheDocument()
  })

  it('el botón "Revisar y continuar" permanece deshabilitado hasta completar motivo de corrección + motivo de texto', async () => {
    renderModal()
    await selectClient()
    openCorreccion()
    await selectFactura(10)
    expect(screen.getByText('notasCredito.formulario.correccionRevisarButton')).toBeDisabled()

    fireEvent.change(screen.getByText('notasCredito.formulario.motivoCorreccionPlaceholder').closest('select')!, {
      target: { value: 'fecha' },
    })
    expect(screen.getByText('notasCredito.formulario.correccionRevisarButton')).toBeDisabled()

    fireEvent.change(screen.getByText('notasCredito.formulario.motivoLabel').closest('label')!.querySelector('textarea')!, {
      target: { value: 'Fecha de facturación incorrecta, corregir' },
    })
    expect(screen.getByText('notasCredito.formulario.correccionRevisarButton')).not.toBeDisabled()
  })

  it('al hacer clic en "Revisar y continuar" llama a onRequestCorreccionPreview con el payload esperado', async () => {
    const onRequestCorreccionPreview = vi.fn()
    renderModal({ onRequestCorreccionPreview })
    await selectClient()
    openCorreccion()
    await selectFactura(10)
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoCorreccionPlaceholder').closest('select')!, {
      target: { value: 'fecha' },
    })
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoLabel').closest('label')!.querySelector('textarea')!, {
      target: { value: 'Fecha de facturación incorrecta, corregir' },
    })
    fireEvent.click(screen.getByText('notasCredito.formulario.correccionRevisarButton'))

    expect(onRequestCorreccionPreview).toHaveBeenCalledWith({
      master_client_id: 1,
      factura_origen_id: 10,
      motivo_correccion: 'fecha',
      nuevo_tratamiento_itbms_rate_id: null,
      nueva_fecha: new Date().toISOString().slice(0, 10),
      motivo: 'Fecha de facturación incorrecta, corregir',
    })
  })
})

describe('RegistrarNotaCreditoModal — REQ-483 selección de factura de origen', () => {
  it('lista TODAS las facturas del cliente con su saldo pendiente real, incluidas las pagadas', async () => {
    renderModal()
    await selectClient()
    expect(await screen.findByText(/F-0001/)).toBeInTheDocument()
    expect(screen.getByText(/F-0002/)).toBeInTheDocument()
  })

  it('sin factura elegida no se muestra el bloque de monto/ITBMS/motivo', async () => {
    renderModal()
    await selectClient()
    expect(screen.queryByText('notasCredito.formulario.montoLabel')).not.toBeInTheDocument()
  })

  it('al elegir la factura aparece el bloque de monto/ITBMS/motivo', async () => {
    renderModal()
    await selectClient()
    await selectFactura(10)
    expect(screen.getByText('notasCredito.formulario.montoLabel')).toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — REQ-485 monto/ITBMS/motivo/fecha', () => {
  it('monto editable en Descuento comercial, desglose ITBMS recalculado en tiempo real', async () => {
    renderModal()
    await selectClient()
    await selectFactura(10)
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '1000' } })
    expect(screen.getByText(/934\.58/)).toBeInTheDocument() // subtotal = 1000/1.07
    expect(screen.getByText(/65\.42/)).toBeInTheDocument()  // itbms = 1000 - subtotal
  })

  it('monto bloqueado = total de la factura en Anulación completa, sin input editable', async () => {
    renderModal()
    await selectClient()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    await selectFactura(10)
    const montoBlock = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!
    expect(within(montoBlock).getByText(/6,200\.00/)).toBeInTheDocument()
    expect(montoBlock.querySelector('input')).toBeNull()
  })
})

describe('RegistrarNotaCreditoModal — REQ-484 auto-aplicación y excedente', () => {
  it('monto <= saldo pendiente: aplicación automática sin pedir nada más', async () => {
    renderModal()
    await selectClient()
    await selectFactura(10) // saldo_pendiente 6200
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '1000' } })
    expect(screen.getByText(/notasCredito.formulario.nuevoSaldoPendiente/)).toBeInTheDocument()
    expect(screen.queryByLabelText('notasCredito.formulario.resultadoDevuelto')).not.toBeInTheDocument()
  })

  it('excedente (factura ya pagada, saldo $0): pide resultado devolver/saldo a favor', async () => {
    renderModal()
    await selectClient()
    await selectFactura(11) // saldo_pendiente 0, monto 1000
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '200' } })
    expect(screen.getByText(/notasCredito.formulario.excedenteAviso/)).toBeInTheDocument()
    expect(screen.getByLabelText('notasCredito.formulario.resultadoDevuelto')).toBeInTheDocument()
    expect(screen.getByLabelText('notasCredito.formulario.resultadoSaldoFavor')).toBeInTheDocument()
  })

  it('excedente + "devolver": exige elegir cuenta bancaria de salida', async () => {
    renderModal()
    await selectClient()
    await selectFactura(11)
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '200' } })
    fireEvent.click(screen.getByLabelText('notasCredito.formulario.resultadoDevuelto'))
    expect(await screen.findByText('notasCredito.formulario.cuentaBancariaSalidaLabel')).toBeInTheDocument()
  })

  it('Anulación completa/Pedido cancelado sobre factura nunca cobrada: cancela la deuda sin excedente', async () => {
    renderModal()
    await selectClient()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    await selectFactura(10) // saldo_pendiente === monto (6200 === 6200, nunca cobrada)
    expect(screen.getByText('notasCredito.formulario.excedenteSinMovimiento')).toBeInTheDocument()
    expect(screen.queryByLabelText('notasCredito.formulario.resultadoDevuelto')).not.toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — REQ-482 banner de umbral de aprobación', () => {
  it('no aparece con el monto por debajo del umbral', async () => {
    renderModal({ markApprovalThreshold: 5000 })
    await selectClient()
    await selectFactura(11)
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '1000' } })
    expect(screen.queryByText('notasCredito.formulario.umbralAviso')).not.toBeInTheDocument()
  })

  it('aparece en tiempo real en cuanto el monto supera el umbral', async () => {
    renderModal({ markApprovalThreshold: 5000 })
    await selectClient()
    await selectFactura(11)
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '6000' } })
    expect(screen.getByText('notasCredito.formulario.umbralAviso')).toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — REQ-487 comprobante de soporte', () => {
  it('obligatorio en Anulación completa sin importar el monto — bloquea el submit sin adjuntarlo', async () => {
    renderModal({ markApprovalThreshold: 5000 })
    await selectClient()
    fireEvent.change(screen.getByDisplayValue('notasCredito.tipos.descuento_comercial'), {
      target: { value: 'anulacion_completa' },
    })
    await selectFactura(11) // monto bajo, muy por debajo del umbral
    expect(screen.getByText('notasCredito.formulario.comprobanteObligatorioHint')).toBeInTheDocument()
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoLabel').closest('label')!.querySelector('textarea')!, { target: { value: 'Cliente canceló el pedido' } })
    expect(screen.getByText('notasCredito.formulario.confirm')).toBeDisabled()
  })

  it('obligatorio cuando el monto supera el umbral (Descuento comercial)', async () => {
    renderModal({ markApprovalThreshold: 5000 })
    await selectClient()
    await selectFactura(10)
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '6000' } })
    expect(screen.getByText('notasCredito.formulario.comprobanteObligatorioHint')).toBeInTheDocument()
  })

  it('NUNCA obligatorio en modo Devolución, incluso superando el umbral', () => {
    renderModal({ devolucionPrecargada: DEVOLUCION, markApprovalThreshold: 1 })
    expect(screen.queryByText('notasCredito.formulario.comprobanteObligatorioHint')).not.toBeInTheDocument()
  })
})

describe('RegistrarNotaCreditoModal — REQ-486 avisos automáticos', () => {
  it('aviso de notificación al cliente y reducción de comisión con factura de origen elegida', async () => {
    renderModal()
    await selectClient()
    await selectFactura(11)
    expect(screen.getByText('notasCredito.formulario.avisoNotificacionCliente')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.avisoReduccionComision')).toBeInTheDocument()
  })

  // El sub-caso "sin aviso de reducción de comisión en Corrección de datos" (REQ-486 RN2) ya no es
  // observable en Batch 11: ese subtipo no llega a elegir factura de origen ni a este bloque de
  // avisos (ver describe "Corrección de datos queda fuera del submit real" — su propio submit real
  // es Batch 12). El `!esCorreccionDeDatos` en la condición del bloque sigue siendo la guarda real.
})

describe('RegistrarNotaCreditoModal — submit real', () => {
  const file = new File(['x'], 'soporte.png', { type: 'image/png' })

  it('motivo obligatorio: el botón sigue deshabilitado hasta completarlo', async () => {
    renderModal()
    await selectClient()
    await selectFactura(10) // saldo_pendiente 6200, monto 500 no genera excedente
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '500' } })
    expect(screen.getByText('notasCredito.formulario.confirm')).toBeDisabled()
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoLabel').closest('label')!.querySelector('textarea')!, { target: { value: 'Descuento comercial acordado' } })
    expect(screen.getByText('notasCredito.formulario.confirm')).not.toBeDisabled()
  })

  it('al confirmar, envía el registro real con el contrato esperado', async () => {
    renderModal()
    await selectClient()
    await selectFactura(10) // saldo_pendiente 6200, monto 500 no genera excedente
    const montoInput = screen.getByText('notasCredito.formulario.montoLabel').closest('label')!.querySelector('input')!
    fireEvent.change(montoInput, { target: { value: '500' } })
    fireEvent.change(screen.getByText('notasCredito.formulario.motivoLabel').closest('label')!.querySelector('textarea')!, { target: { value: 'Descuento comercial acordado' } })
    const fileInput = screen.getByLabelText('notasCredito.formulario.comprobantePlaceholder')
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('notasCredito.formulario.confirm'))

    await screen.findByText('notasCredito.formulario.confirm') // re-render settle
    expect(mockedApi.notasCredito.register).toHaveBeenCalledWith(expect.objectContaining({
      master_client_id: 1,
      factura_origen_id: 10,
      tipo: 'descuento_comercial',
      monto: 500,
      motivo: 'Descuento comercial acordado',
      comprobante: file,
    }))
  })
})
