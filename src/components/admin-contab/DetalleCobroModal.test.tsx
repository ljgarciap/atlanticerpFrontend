import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DetalleCobroModal from './DetalleCobroModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { PaymentDetail } from '@/types/adminContab'

// Batch 6 del cuerpo principal (SCRUM-548, REQ-471) — detalle de un cobro. Batch 7 (SCRUM-549/
// 550/552, REQ-472/473/475) agrega los 3 botones del footer.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    payments: {
      detail: vi.fn(), attachment: vi.fn(), downloadReceiptPdf: vi.fn(), confirm: vi.fn(), confirmPreview: vi.fn(), requestVoid: vi.fn(), updateDatos: vi.fn(),
    },
  },
}))

// SCRUM-931 — los 5 modales de detalle son componentes reales con sus propios hooks/API; para
// probar solo "la sección correcta abre el modal correcto con el id correcto" alcanza con un
// doble liviano que expone sus props recibidas (mismo criterio que EstadoCuentaPage.test.tsx, SCRUM-930).
vi.mock('./InvoiceDetailModal', () => ({
  default: ({ orderId, invoiceId }: { orderId: number; invoiceId: number | null }) => (
    <div data-testid="invoice-modal">invoice:{orderId}:{invoiceId}</div>
  ),
}))
vi.mock('./DetalleNotaCreditoModal', () => ({
  default: ({ notaId }: { notaId: number }) => <div data-testid="nota-modal">nota:{notaId}</div>,
}))
vi.mock('@/components/QuoteViewerModal', () => ({
  default: ({ quoteId }: { quoteId: number }) => <div data-testid="quote-modal">quote:{quoteId}</div>,
}))
vi.mock('@/components/GuiaEntregaModal', () => ({
  default: ({ orderId }: { orderId: number }) => <div data-testid="guia-modal">guia:{orderId}</div>,
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeDetail(overrides: Partial<PaymentDetail> = {}): PaymentDetail {
  return {
    id: 1, numero_recibo: 'REC-007', master_client_id: 7, monto_recibido: 6200, saldo_favor_aplicado: 0,
    metodo_pago: 'efectivo', referencia: 'TRF-88213', bank_account_id: 1, numero_documento_retencion: null,
    comentario_ajuste: null, estado: 'confirmado', created_at: '2026-07-02T00:00:00Z',
    cliente: 'Grupo Sensei', metodo_pago_label: 'Efectivo',
    registrado_por: 'Contabilidad Test', bank_account: 'Banco Demo A — Cuenta Corriente', tiene_comprobante: false,
    total_facturas: 6200, confirmacion: null,
    facturas: [
      {
        invoice_id: 1, numero: 'F-0001', monto_original: 4000, monto_abono_aplicado: 0, monto_aplicado: 4000,
        quote_id: null, cotizacion_folio: null, order_id: null, guia_entrega_numero: null, guia_entrega_order_id: null,
      },
      {
        invoice_id: 2, numero: 'F-0002', monto_original: 2200, monto_abono_aplicado: 0, monto_aplicado: 2200,
        quote_id: null, cotizacion_folio: null, order_id: null, guia_entrega_numero: null, guia_entrega_order_id: null,
      },
    ],
    // SCRUM-931
    abonos: [], notas_credito: [],
    ...overrides,
  }
}

function renderModal(paymentId = 1, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DetalleCobroModal paymentId={paymentId} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DetalleCobroModal — REQ-471', () => {
  it('Escenario 1 — muestra ambas facturas cubiertas, cada una con su monto aplicado', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    renderModal()

    expect(await screen.findByText('F-0001')).toBeInTheDocument()
    expect(screen.getByText('F-0002')).toBeInTheDocument()
    expect(screen.getByText(/4,000\.00/)).toBeInTheDocument()
    expect(screen.getByText(/2,200\.00/)).toBeInTheDocument()
  })

  it('Escenario 2 — sin saldo a favor ni ajuste, esos 2 campos no aparecen', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ saldo_favor_aplicado: 0, comentario_ajuste: null }))
    renderModal()

    await screen.findByText('F-0001')
    expect(screen.queryByText('cobros.detalle.saldoFavorAplicado')).not.toBeInTheDocument()
    expect(screen.queryByText('cobros.detalle.comentarioAjuste')).not.toBeInTheDocument()
  })

  it('con saldo a favor aplicado y comentario de ajuste, ambos campos se muestran', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ saldo_favor_aplicado: 500, comentario_ajuste: 'Ajuste por diferencia' }))
    renderModal()

    await screen.findByText('F-0001')
    expect(screen.getByText('cobros.detalle.saldoFavorAplicado')).toBeInTheDocument()
    expect(screen.getByText('Ajuste por diferencia')).toBeInTheDocument()
  })

  it('muestra la referencia y el número de recibo', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    renderModal()

    await screen.findByText('F-0001')
    expect(screen.getByText('TRF-88213')).toBeInTheDocument()
    expect(screen.getAllByText('REC-007').length).toBeGreaterThan(0)
  })
})

describe('DetalleCobroModal — REQ-473/475 (Batch 7)', () => {
  it('REQ-473 — "Ver recibo" descarga el PDF del cobro mostrado', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    mockedApi.payments.downloadReceiptPdf.mockResolvedValue(undefined)
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.verRecibo'))

    await waitFor(() => expect(mockedApi.payments.downloadReceiptPdf).toHaveBeenCalledWith(1, 'REC-007'))
  })

  it('REQ-475 RN1 — "Marcar como confirmado" solo aparece en esperando_confirmacion', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'confirmado' }))
    renderModal()

    await screen.findByText('F-0001')
    expect(screen.queryByText('cobros.detalle.marcarConfirmado')).not.toBeInTheDocument()
  })

  it('REQ-475 — confirmar un cobro en espera lo envía y refleja el resultado', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'esperando_confirmacion' }))
    mockedApi.payments.confirmPreview.mockResolvedValue({ ajustes_confirmacion: null })
    mockedApi.payments.confirm.mockResolvedValue(makeDetail({
      estado: 'confirmado',
      confirmacion: { numero_confirmacion: 'CONF-001', confirmado_por: 'Contabilidad Test', confirmado_at: '2026-07-05T00:00:00Z' },
    }))
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.marcarConfirmado'))

    await waitFor(() => expect(mockedApi.payments.confirm).toHaveBeenCalledWith(1))
    expect(screen.queryByTestId('cobro-ajustes-previos')).not.toBeInTheDocument()
  })

  // SCRUM-1168 F0 — si lo registrado ya no cabe en la factura, el usuario ve la implicación ANTES de confirmar; el dinero ya entró.
  it('SCRUM-1168 — si parte del cobro pasaría a saldo a favor, avisa antes y confirma solo cuando el usuario acepta', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'esperando_confirmacion' }))
    const ajustes = { excedente_a_saldo_favor: 500, saldo_insuficiente: 0, facturas: [{ numero: 'F-0001', solicitado: 500, aplicado: 0 }] }
    mockedApi.payments.confirmPreview.mockResolvedValue({ ajustes_confirmacion: ajustes })
    mockedApi.payments.confirm.mockResolvedValue({ ...makeDetail({ estado: 'confirmado' }), ajustes_confirmacion: ajustes })
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.marcarConfirmado'))

    expect(await screen.findByTestId('cobro-ajustes-previos')).toBeInTheDocument()
    expect(mockedApi.payments.confirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('cobros.detalle.ajustes.confirmarIgual'))

    await waitFor(() => expect(mockedApi.payments.confirm).toHaveBeenCalledWith(1))
    expect(await screen.findByTestId('cobro-ajustes-aplicados')).toBeInTheDocument()
    expect(screen.queryByTestId('cobro-ajustes-previos')).not.toBeInTheDocument()
  })

  it('SCRUM-1168 — cancelar el aviso no confirma el cobro', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'esperando_confirmacion' }))
    mockedApi.payments.confirmPreview.mockResolvedValue({
      ajustes_confirmacion: { excedente_a_saldo_favor: 200, saldo_insuficiente: 0, facturas: [{ numero: 'F-0001', solicitado: 500, aplicado: 300 }] },
    })
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.marcarConfirmado'))
    await screen.findByTestId('cobro-ajustes-previos')
    fireEvent.click(screen.getByText('cobros.detalle.ajustes.cancelar'))

    expect(screen.queryByTestId('cobro-ajustes-previos')).not.toBeInTheDocument()
    expect(mockedApi.payments.confirm).not.toHaveBeenCalled()
  })

  // SCRUM-1168 F2 — un cobro del concepto nuevo puede no aplicarse a ninguna factura: lo que no se aplicó es saldo a favor del cliente.
  it('SCRUM-1168 — un cobro sin facturas lo dice y muestra el saldo a favor sin aplicar', async () => {
    mockedApi.payments.detail.mockResolvedValue({ ...makeDetail({ estado: 'confirmado' }), facturas: [], cobros_v2: true, saldo_sin_aplicar: 700 })
    renderModal()

    expect(await screen.findByTestId('cobro-sin-facturas')).toBeInTheDocument()
    expect(screen.getByTestId('cobro-saldo-sin-aplicar')).toHaveTextContent('700')
  })

  it('SCRUM-1168 — un cobro del flujo anterior no muestra saldo sin aplicar', async () => {
    mockedApi.payments.detail.mockResolvedValue({ ...makeDetail({ estado: 'confirmado' }), saldo_sin_aplicar: null })
    renderModal()

    await screen.findByText('F-0001')
    expect(screen.queryByTestId('cobro-saldo-sin-aplicar')).not.toBeInTheDocument()
  })

  // SCRUM-1168 F4 — anular un cobro: se solicita con motivo y lo decide Gerencia.
  it('SCRUM-1168 — «Anular cobro» pide el motivo y envía la solicitud; queda pendiente de Gerencia', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'confirmado' }))
    mockedApi.payments.requestVoid.mockResolvedValue({ id: 3, estado: 'solicitada' } as never)
    renderModal()

    fireEvent.click(await screen.findByTestId('cobro-anular-boton'))
    const enviar = screen.getByText('cobros.detalle.anular.enviar')
    expect(enviar).toBeDisabled()   // sin motivo no se envía

    fireEvent.change(screen.getByPlaceholderText('cobros.detalle.anular.motivoPlaceholder'), { target: { value: 'Monto mal digitado' } })
    fireEvent.click(enviar)

    await waitFor(() => expect(mockedApi.payments.requestVoid).toHaveBeenCalledWith(1, 'Monto mal digitado'))
    expect(await screen.findByTestId('cobro-anulacion-pendiente')).toBeInTheDocument()
    expect(screen.queryByTestId('cobro-anular-boton')).not.toBeInTheDocument()
  })

  it('SCRUM-1168 — un cobro con anulación pendiente no ofrece pedirla otra vez', async () => {
    mockedApi.payments.detail.mockResolvedValue({ ...makeDetail({ estado: 'confirmado' }), solicitud_anulacion: { id: 4, estado: 'solicitada', motivo: 'Duplicado', motivo_rechazo: null, created_at: null } })
    renderModal()

    expect(await screen.findByTestId('cobro-anulacion-pendiente')).toBeInTheDocument()
    expect(screen.queryByTestId('cobro-anular-boton')).not.toBeInTheDocument()
  })

  it('SCRUM-1168 — un cobro anulado lo dice con su motivo y ya no se puede anular ni confirmar', async () => {
    mockedApi.payments.detail.mockResolvedValue({ ...makeDetail({ estado: 'anulado' }), anulado_at: '2026-10-19T12:00:00Z', motivo_anulacion: 'Cliente equivocado' })
    renderModal()

    expect(await screen.findByTestId('cobro-anulado')).toHaveTextContent('cobros.detalle.anular.anuladoDetalle')
    expect(screen.queryByTestId('cobro-anular-boton')).not.toBeInTheDocument()
    expect(screen.queryByText('cobros.detalle.marcarConfirmado')).not.toBeInTheDocument()
  })

  it('SCRUM-1168 — una solicitud rechazada muestra el motivo y permite volver a pedirla', async () => {
    mockedApi.payments.detail.mockResolvedValue({ ...makeDetail({ estado: 'confirmado' }), solicitud_anulacion: { id: 4, estado: 'rechazada', motivo: 'x', motivo_rechazo: 'El cobro está bien', created_at: null } })
    renderModal()

    expect(await screen.findByTestId('cobro-anulacion-rechazada')).toHaveTextContent('cobros.detalle.anular.rechazadaDetalle')
    expect(screen.getByTestId('cobro-anular-boton')).toBeInTheDocument()
  })

  it('SCRUM-1168 F5 — «Corregir datos» solo ofrece referencia y comprobante y los envía como formulario', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({ estado: 'confirmado' }))
    mockedApi.payments.updateDatos.mockResolvedValue({ id: 1, referencia: 'TRF-9' })
    renderModal()

    fireEvent.click(await screen.findByTestId('cobro-editar-boton'))
    expect(screen.getByTestId('cobro-editar-form')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('cobros.detalle.editar.referencia'), { target: { value: 'TRF-9' } })
    fireEvent.click(screen.getByText('cobros.detalle.editar.guardar'))

    await waitFor(() => expect(mockedApi.payments.updateDatos).toHaveBeenCalled())
    const [id, form] = mockedApi.payments.updateDatos.mock.calls[0]
    expect(id).toBe(1)
    expect((form as FormData).get('referencia')).toBe('TRF-9')
    expect(await screen.findByTestId('cobro-datos-guardados')).toBeInTheDocument()
  })

  it('REQ-475 Escenario 2 — muestra el registro de confirmación (CONF-XXX) cuando existe', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      estado: 'confirmado',
      confirmacion: { numero_confirmacion: 'CONF-001', confirmado_por: 'Asistente Administrativa Solano', confirmado_at: '2026-07-05T00:00:00Z' },
    }))
    renderModal()

    expect(await screen.findByText('cobros.detalle.confirmacion')).toBeInTheDocument()
  })

  it('REQ-472 — el botón "Ver comprobante" abre el modal de comprobante', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    mockedApi.payments.attachment.mockResolvedValue(null)
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.verComprobante'))

    expect(await screen.findByText('cobros.comprobanteModal.title')).toBeInTheDocument()
    await waitFor(() => expect(mockedApi.payments.attachment).toHaveBeenCalledWith(1))
  })
})

describe('DetalleCobroModal — SCRUM-931 Cotización/Guía de Entrega/Abonos/Notas de Crédito', () => {
  it('sin datos en el payload, ninguna de las 4 secciones nuevas aparece (nunca un placeholder inventado)', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    renderModal()
    await screen.findByText('F-0001')

    expect(screen.queryByText('cobros.detalle.cotizaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('cobros.detalle.guiasEntrega')).not.toBeInTheDocument()
    expect(screen.queryByText('cobros.detalle.abonos')).not.toBeInTheDocument()
    expect(screen.queryByText('cobros.detalle.notasCredito')).not.toBeInTheDocument()
  })

  it('factura con order_id/invoice_id es clickeable y abre InvoiceDetailModal con esos ids', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      facturas: [{
        invoice_id: 1, numero: 'F-0001', monto_original: 4000, monto_abono_aplicado: 0, monto_aplicado: 4000,
        quote_id: null, cotizacion_folio: null, order_id: 55, guia_entrega_numero: null, guia_entrega_order_id: null,
      }],
    }))
    renderModal()

    fireEvent.click(await screen.findByText('F-0001'))
    expect(await screen.findByTestId('invoice-modal')).toHaveTextContent('invoice:55:1')
  })

  it('factura sin order_id NO es clickeable (texto plano)', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail())
    renderModal()
    await screen.findByText('F-0001')

    expect(screen.getByText('F-0001').tagName).not.toBe('BUTTON')
  })

  it('Cotizaciones/Guías de Entrega se deduplican por id cuando 2 facturas comparten la misma', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      facturas: [
        {
          invoice_id: 1, numero: 'F-0001', monto_original: 4000, monto_abono_aplicado: 0, monto_aplicado: 4000,
          quote_id: 100, cotizacion_folio: 'COT-2026-0100', order_id: 55, guia_entrega_numero: 'PED-0055-G', guia_entrega_order_id: 55,
        },
        {
          invoice_id: 2, numero: 'F-0002', monto_original: 2200, monto_abono_aplicado: 0, monto_aplicado: 2200,
          quote_id: 100, cotizacion_folio: 'COT-2026-0100', order_id: 56, guia_entrega_numero: 'PED-0055-G', guia_entrega_order_id: 55,
        },
      ],
    }))
    renderModal()
    await screen.findByText('F-0001')

    // Misma cotización (100) y misma guía (order 55) en ambas facturas -> un solo chip cada una.
    expect(screen.getAllByText('COT-2026-0100')).toHaveLength(1)
    expect(screen.getAllByText('PED-0055-G')).toHaveLength(1)

    fireEvent.click(screen.getByText('COT-2026-0100'))
    expect(await screen.findByTestId('quote-modal')).toHaveTextContent('quote:100')
  })

  it('Guía de Entrega clickeable abre GuiaEntregaModal con su order_id (no el de la factura)', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      facturas: [{
        invoice_id: 1, numero: 'F-0001', monto_original: 4000, monto_abono_aplicado: 0, monto_aplicado: 4000,
        quote_id: null, cotizacion_folio: null, order_id: 9, guia_entrega_numero: 'PED-0055-G', guia_entrega_order_id: 55,
      }],
    }))
    renderModal()

    fireEvent.click(await screen.findByText('PED-0055-G'))
    expect(await screen.findByTestId('guia-modal')).toHaveTextContent('guia:55')
  })

  it('Notas de Crédito: cada una con su número real, abre DetalleNotaCreditoModal con su nota_id', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      notas_credito: [{ id: 7, numero: 'NC-2026-0007' }],
    }))
    renderModal()

    fireEvent.click(await screen.findByText('NC-2026-0007'))
    expect(await screen.findByTestId('nota-modal')).toHaveTextContent('nota:7')
  })
})
