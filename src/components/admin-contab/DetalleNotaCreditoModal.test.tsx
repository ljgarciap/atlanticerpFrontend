import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DetalleNotaCreditoModal from './DetalleNotaCreditoModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { NotaCreditoDetalle } from '@/types/adminContab'

// Batch 12 del cuerpo principal (SCRUM-570, REQ-493) — modal de detalle de una nota de crédito.
// Batch 13 (SCRUM-571→574, REQ-494→497) conecta Aprobar/Rechazar real + comprobante/documento/
// factura relacionada — ver ADR-SCRUM571-574.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    notasCredito: {
      detail: vi.fn(),
      decide: vi.fn(),
      comprobante: vi.fn(),
      downloadPdf: vi.fn(),
      fePreview: vi.fn(),
      feReconciliar: vi.fn(),
    },
  },
}))

// SCRUM-932 — mismo patrón que `DetalleCobroModal.test.tsx` (SCRUM-931): los modales hijos reales
// no son el objeto de este test, solo confirmar que se abren con el id correcto.
vi.mock('@/components/QuoteViewerModal', () => ({
  default: ({ quoteId }: { quoteId: number }) => <div data-testid="quote-modal">quote:{quoteId}</div>,
}))
vi.mock('@/components/GuiaEntregaModal', () => ({
  default: ({ orderId }: { orderId: number }) => <div data-testid="guia-modal">guia:{orderId}</div>,
}))
// SCRUM-932 (rebote Gerencia 2026-09-20) — "Factura de origen" ahora abre este modal en vez de
// descargar el PDF directo (ver InvoiceDetailModal, mismo patrón que DetalleCobroModal).
vi.mock('./InvoiceDetailModal', () => ({
  default: ({ orderId, invoiceId }: { orderId: number; invoiceId: number | null }) => (
    <div data-testid="invoice-modal">invoice:{orderId}:{invoiceId}</div>
  ),
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeDetalle(overrides: Partial<NotaCreditoDetalle> = {}): NotaCreditoDetalle {
  return {
    id: 1, numero: 'NC-0001', tipo: 'descuento_comercial', subtipo_anulacion: null,
    cliente: 'Grupo Sensei', master_client_id: 1, monto: 500, subtotal: 467.29, itbms: 32.71,
    estado: 'aplicada', resultado: 'aplicado_saldo',
    motivo: 'Descuento comercial acordado', motivo_rechazo: null, tiene_comprobante: true,
    fecha: '2026-08-20', registrado_por: 'Contabilidad Test', aprobado_por: null, fecha_decision: null,
    factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55,
    quote_id: null, cotizacion_folio: null, guia_entrega_numero: null, guia_entrega_order_id: null,
    factura_nueva_numero: null, factura_nueva_order_id: null, factura_nueva_id: null, motivo_correccion: null, nuevo_tratamiento_itbms: null,
    nueva_fecha_factura: null, puede_aprobar_rechazar: false,
    devolucion_bodega_id: null, bodega_trazabilidad: null, cuenta_bancaria_salida: null,
    fe_estado: null, cufe: null, qr_content: null, pac_provider_usado: null,
    ...overrides,
  }
}

function renderModal(notaId = 1, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DetalleNotaCreditoModal notaId={notaId} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DetalleNotaCreditoModal — REQ-493', () => {
  it('muestra los datos generales de la nota', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle())
    renderModal()
    expect(await screen.findByText(/NC-0001/)).toBeInTheDocument()
    expect(screen.getByText('Descuento comercial acordado')).toBeInTheDocument()
    expect(screen.getByText(/500\.00/)).toBeInTheDocument()
  })

  it('RN1 — sin motivo de rechazo, ese bloque no aparece', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ motivo_rechazo: null }))
    renderModal()
    await screen.findByText(/NC-0001/)
    expect(screen.queryByText('notasCredito.detalle.motivoRechazo')).not.toBeInTheDocument()
  })

  it('con motivo de rechazo, se muestra', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'rechazada', motivo_rechazo: 'Falta comprobante' }))
    renderModal()
    expect(await screen.findByText('Falta comprobante')).toBeInTheDocument()
  })

  it('RN2 — trazabilidad de Bodega solo aparece cuando bodega_trazabilidad no es null', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ bodega_trazabilidad: null }))
    renderModal()
    await screen.findByText(/NC-0001/)
    expect(screen.queryByText('notasCredito.detalle.trazabilidadBodegaTitle')).not.toBeInTheDocument()
  })

  it('RN2 — con trazabilidad de Bodega presente, se muestra el bloque', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      tipo: 'devolucion_mercancia',
      devolucion_bodega_id: 42,
      bodega_trazabilidad: {
        return_number: 'HS-3402',
        historial: [{ step: 'finalized', label: 'Devolución finalizada', at: '2026-08-20', by: 'Tecnico Servicios Test' }],
      },
    }))
    renderModal()
    expect(await screen.findByText(/notasCredito\.detalle\.trazabilidadBodegaTitle/)).toBeInTheDocument()
    expect(screen.getByText(/Tecnico Servicios Test/)).toBeInTheDocument()
  })

  // SCRUM-943 — el badge de Facturación Electrónica solo tiene sentido una vez aplicada la nota.
  it('SCRUM-943 — el badge de Facturación Electrónica no aparece mientras la nota está pendiente_aprobacion', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'pendiente_aprobacion', fe_estado: null }))
    renderModal()
    await screen.findByText(/NC-0001/)
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.certificado')).not.toBeInTheDocument()
  })

  it('SCRUM-943 — error_configuracion nunca se muestra como rechazado en la nota', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'error_configuracion' }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.errorConfiguracion')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')).not.toBeInTheDocument()
  })

  it('SCRUM-1009 — una corrección de datos sin certificar avisa que la original sigue vigente y el reemplazo espera', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      estado: 'aplicada', fe_estado: 'rechazado', motivo_correccion: 'fecha',
    }))
    renderModal()
    expect(await screen.findByText('notasCredito.detalle.avisoCorreccionSinCertificar')).toBeInTheDocument()
  })

  it('SCRUM-1009 — sin aviso si la corrección ya certificó, si FE no aplica, o si la nota no es una corrección', async () => {
    for (const parcial of [
      { fe_estado: 'certificado', motivo_correccion: 'fecha' },
      { fe_estado: 'no_aplica', motivo_correccion: 'fecha' },
      { fe_estado: 'rechazado', motivo_correccion: null },
    ] as const) {
      mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', ...parcial }))
      const { unmount } = renderModal()
      await screen.findByText(/NC-0001/)
      expect(screen.queryByText('notasCredito.detalle.avisoCorreccionSinCertificar')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('SCRUM-987 — el visor de transmisiones al PAC solo aparece si el backend habilita puede_ver_fe_transmisiones', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      estado: 'aplicada', fe_estado: 'rechazado', puede_ver_fe_transmisiones: true,
    }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.transmisiones.ver')).toBeInTheDocument()
  })

  it('SCRUM-1007 — una NC rechazada ofrece el reintento solo si el backend lo habilita con accion_fe', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'rechazado', accion_fe: 'reintentar' }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reintentar')).toBeInTheDocument()
  })

  it('SCRUM-1007 — sin accion_fe no hay botón de reintento en la NC', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'rechazado', accion_fe: null }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reintentar')).not.toBeInTheDocument()
  })

  it('SCRUM-1019 — Reconciliar con MSL: solo con puede_reconciliar_fe, muestra el mensaje y refresca el detalle', async () => {
    const REC = 'adminContab:facturacion.detalle.facturacionElectronica.accion.reconciliar'
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'rechazado', puede_reconciliar_fe: true }))
    mockedApi.notasCredito.feReconciliar.mockResolvedValue({
      accion: 'resuelto', fe_estado: 'certificado', fe_detalle: null, cufe: 'FE01', mensaje: 'Documento reconciliado.', codigo: null,
    })
    renderModal()
    fireEvent.click(await screen.findByText(REC))
    fireEvent.click(screen.getByText('adminContab:facturacion.detalle.facturacionElectronica.accion.confirmar'))
    expect(await screen.findByText('Documento reconciliado.')).toBeInTheDocument()
    expect(mockedApi.notasCredito.feReconciliar).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockedApi.notasCredito.detail.mock.calls.length).toBeGreaterThan(1))
  })

  it('SCRUM-1019 — sin puede_reconciliar_fe no hay botón de reconciliar en la NC', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'rechazado', puede_reconciliar_fe: false }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reconciliar')).not.toBeInTheDocument()
  })

  it('SCRUM-987 — sin permiso (o sin transmisión posible) no hay visor', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      estado: 'aplicada', fe_estado: 'rechazado', puede_ver_fe_transmisiones: false,
    }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.transmisiones.ver')).not.toBeInTheDocument()
  })

  it('SCRUM-987 — con el interruptor apagado (no_aplica) tampoco hay visor aunque el actor sea Gerencia', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      estado: 'aplicada', fe_estado: 'no_aplica', puede_ver_fe_transmisiones: true,
    }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.noAplica')
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.transmisiones.ver')).not.toBeInTheDocument()
  })

  it('SCRUM-943 — nota certificada muestra el CUFE', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      estado: 'aplicada', fe_estado: 'certificado', cufe: 'FE0420000...nc',
    }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.certificado')).toBeInTheDocument()
    expect(screen.getByText(/FE0420000\.\.\.nc/)).toBeInTheDocument()
  })

  it('SCRUM-943 — "Ver JSON" en no_aplica llama a fePreview solo al expandir', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', fe_estado: 'no_aplica' }))
    mockedApi.notasCredito.fePreview.mockResolvedValueOnce({ ok: true, payload: { serie: 'NC-ILU', numero: 'NC-0001' } })
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.noAplica')

    expect(mockedApi.notasCredito.fePreview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('adminContab:facturacion.detalle.facturacionElectronica.verJson'))

    await waitFor(() => expect(mockedApi.notasCredito.fePreview).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/"serie": "NC-ILU"/)).toBeInTheDocument()
  })

  it('RN4 — sin estado pendiente_aprobacion, no aparecen Aprobar/Rechazar', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'aplicada', puede_aprobar_rechazar: false }))
    renderModal()
    await screen.findByText(/NC-0001/)
    expect(screen.queryByText('notasCredito.detalle.aprobar')).not.toBeInTheDocument()
    expect(screen.queryByText('notasCredito.detalle.rechazar')).not.toBeInTheDocument()
  })

  it('RN4 REQ-494 — con estado pendiente_aprobacion, Aprobar llama a decide({approve: true})', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'pendiente_aprobacion', puede_aprobar_rechazar: true }))
    mockedApi.notasCredito.decide.mockResolvedValue(makeDetalle({ estado: 'aplicada', puede_aprobar_rechazar: false }))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'notasCredito.detalle.aprobar' }))
    await waitFor(() => {
      expect(mockedApi.notasCredito.decide).toHaveBeenCalledWith(1, { approve: true })
    })
  })

  it('RN4 REQ-494 — Rechazar exige motivo antes de confirmar, no llama a decide() sin él', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'pendiente_aprobacion', puede_aprobar_rechazar: true }))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'notasCredito.detalle.rechazar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'notasCredito.detalle.confirmarRechazo' }))
    expect(await screen.findByText('notasCredito.detalle.motivoRechazoRequerido')).toBeInTheDocument()
    expect(mockedApi.notasCredito.decide).not.toHaveBeenCalled()
  })

  it('RN4 REQ-494 — Rechazar con motivo llama a decide({approve: false, motivo_rechazo})', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ estado: 'pendiente_aprobacion', puede_aprobar_rechazar: true }))
    mockedApi.notasCredito.decide.mockResolvedValue(makeDetalle({ estado: 'rechazada', puede_aprobar_rechazar: false, motivo_rechazo: 'Falta comprobante' }))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'notasCredito.detalle.rechazar' }))
    fireEvent.change(await screen.findByPlaceholderText('notasCredito.detalle.motivoRechazoPlaceholder'), { target: { value: 'Falta comprobante' } })
    fireEvent.click(screen.getByRole('button', { name: 'notasCredito.detalle.confirmarRechazo' }))
    await waitFor(() => {
      expect(mockedApi.notasCredito.decide).toHaveBeenCalledWith(1, { approve: false, motivo_rechazo: 'Falta comprobante' })
    })
  })

  it('REQ-495/496 — "Ver comprobante" y "Ver documento" están disponibles apenas carga la nota', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle())
    renderModal()
    expect(await screen.findByRole('button', { name: /notasCredito.detalle.verComprobante/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /notasCredito.detalle.verDocumento/ })).toBeEnabled()
  })

  it('SCRUM-932 (rebote Gerencia 2026-09-20) — clic en la factura de origen abre InvoiceDetailModal con order_id/invoice_id (nunca descarga el PDF directo)', async () => {
    // factura_origen_id (10) y factura_origen_order_id (55) deliberadamente distintos acá — este
    // test debe fallar si el componente vuelve a usar el campo equivocado.
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55 }))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: /F-0001/ }))
    expect(await screen.findByTestId('invoice-modal')).toHaveTextContent('invoice:55:10')
  })
})

describe('DetalleNotaCreditoModal — SCRUM-1060 factura de reemplazo clickeable', () => {
  const correccion = {
    subtipo_anulacion: 'correccion' as const,
    factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55,
    factura_nueva_numero: 'F-0002', factura_nueva_order_id: 55, factura_nueva_id: 11,
  }

  it('clic en la factura de reemplazo abre InvoiceDetailModal con el invoice_id de la NUEVA (mismo order_id que la original)', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle(correccion))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: /F-0002/ }))
    expect(await screen.findByTestId('invoice-modal')).toHaveTextContent('invoice:55:11')
  })

  it('la factura de origen sigue abriendo la suya, sin cambios', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle(correccion))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: /F-0001/ }))
    expect(await screen.findByTestId('invoice-modal')).toHaveTextContent('invoice:55:10')
  })

  it('sin ids de navegación el reemplazo queda como texto plano, nunca un botón muerto', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ ...correccion, factura_nueva_id: null }))
    renderModal()
    await screen.findByText('F-0002')
    expect(screen.queryByRole('button', { name: /F-0002/ })).not.toBeInTheDocument()
  })

  it('una nota sin factura de reemplazo no muestra el campo', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle())
    renderModal()
    await screen.findByText(/NC-0001/)
    expect(screen.queryByText('notasCredito.detalle.facturaNueva')).not.toBeInTheDocument()
  })
})

describe('DetalleNotaCreditoModal — SCRUM-932 Cotización y Guía de Entrega antes de Factura de origen', () => {
  it('con datos, Cotización y Guía de Entrega son clickeables y abren su modal con el id correcto', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      quote_id: 100, cotizacion_folio: 'COT-2026-0100',
      guia_entrega_numero: 'PED-2026-0075-G', guia_entrega_order_id: 9,
    }))
    renderModal()

    fireEvent.click(await screen.findByRole('button', { name: /COT-2026-0100/ }))
    expect(await screen.findByTestId('quote-modal')).toHaveTextContent('quote:100')

    fireEvent.click(screen.getByRole('button', { name: /PED-2026-0075-G/ }))
    expect(await screen.findByTestId('guia-modal')).toHaveTextContent('guia:9')
  })

  it('sin datos, Cotización y Guía de Entrega muestran texto plano ("—"), nunca un botón', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      quote_id: null, cotizacion_folio: null, guia_entrega_numero: null, guia_entrega_order_id: null,
    }))
    renderModal()
    await screen.findByText(/NC-0001/)

    expect(screen.queryByRole('button', { name: /COT-/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /PED-/ })).not.toBeInTheDocument()
    expect(screen.getByText('notasCredito.detalle.cotizacion')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.detalle.guiaEntrega')).toBeInTheDocument()
  })

  it('Cotización y Guía de Entrega aparecen ANTES de Factura de origen en el grid', async () => {
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({
      quote_id: 100, cotizacion_folio: 'COT-2026-0100',
      guia_entrega_numero: 'PED-2026-0075-G', guia_entrega_order_id: 9,
      factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55,
    }))
    renderModal()
    await screen.findByText(/NC-0001/)

    const labels = screen.getAllByText(/^(notasCredito\.detalle\.cotizacion|notasCredito\.detalle\.guiaEntrega|notasCredito\.detalle\.facturaOrigen)$/)
      .map(el => el.textContent)
    expect(labels.indexOf('notasCredito.detalle.cotizacion')).toBeLessThan(labels.indexOf('notasCredito.detalle.facturaOrigen'))
    expect(labels.indexOf('notasCredito.detalle.guiaEntrega')).toBeLessThan(labels.indexOf('notasCredito.detalle.facturaOrigen'))
  })
})
