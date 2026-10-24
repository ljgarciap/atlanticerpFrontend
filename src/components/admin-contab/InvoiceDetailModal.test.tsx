import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InvoiceDetailModal from './InvoiceDetailModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { InvoiceDetail } from '@/types/adminContab'

// SCRUM-987 — gating del visor de transmisiones al PAC en el detalle de factura.

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    invoices: {
      detail: vi.fn(), fePreview: vi.fn(), feTransmisiones: vi.fn(), markUncollectible: vi.fn(),
      decideUncollectible: vi.fn(), downloadPdf: vi.fn(), feReconciliar: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)
const t = (key: string) => key
const VER = 'adminContab:facturacion.detalle.facturacionElectronica.transmisiones.ver'

function makeDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    order_id: 101, order_number: 'PED-2026-000101', cliente: 'Grupo Sensei', master_client_id: 5,
    monto: 5650, saldo_aplicado: 0, total_a_pagar: 5650,
    cotizacion_folio: 'COT-1180-R2', fecha_cotizacion: '2026-05-01',
    numero_factura: 'F-0012', fecha_factura: '2026-09-28',
    estado: 'facturada', es_anulada: false,
    guia_entrega: { existe: true, fecha: '2026-09-27' },
    cobrabilidad: 'normal', motivo_incobrable: null,
    puede_marcar_incobrable: false, puede_registrar_cobro: false,
    cuenta_pago: null, responsable: null,
    fe_estado: 'rechazado', cufe: null, qr_content: null, pac_provider_usado: 'msl',
    puede_ver_fe_transmisiones: true,
    ...overrides,
  } as InvoiceDetail
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InvoiceDetailModal orderId={101} invoiceId={12} t={t} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvoiceDetailModal — visor de transmisiones al PAC (SCRUM-987)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('factura rechazada y actor con permiso: muestra el visor y no lo precarga', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail())
    renderModal()
    expect(await screen.findByText(VER)).toBeInTheDocument()
    expect(mockedApi.invoices.feTransmisiones).not.toHaveBeenCalled()
  })

  it('factura anulada también lo muestra: ahí caen las pruebas fallidas que el proveedor puede pedir', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ estado: 'anulada', es_anulada: true }))
    renderModal()
    expect(await screen.findByText(VER)).toBeInTheDocument()
  })

  it('SCRUM-1007 — el botón de acción fiscal solo aparece si el backend ofrece accion_fe', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ accion_fe: 'reintentar' }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reintentar')).toBeInTheDocument()
  })

  it('SCRUM-1007 — un pendiente ofrece "Actualizar estado", no "Reintentar"', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ fe_estado: 'pendiente', accion_fe: 'actualizar_estado' }))
    renderModal()
    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.accion.actualizarEstado')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reintentar')).not.toBeInTheDocument()
  })

  it('SCRUM-1007 — sin accion_fe (no Gerencia, certificada, anulada o FE apagada) no hay botón', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ accion_fe: null }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.accion.reintentar')).not.toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.accion.actualizarEstado')).not.toBeInTheDocument()
  })

  // SCRUM-1147 — "Vendedor responsable" antes de la tabla de desglose; lista todos los responsables.
  it('SCRUM-1147 — muestra el/los vendedor(es) responsable(s) antes del desglose', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ vendedores_responsables: ['Ana Pérez', 'Luis Mora'] }))
    renderModal()
    const label = await screen.findByText('adminContab:facturacion.detalle.vendedorResponsable:')
    expect(label.parentElement).toHaveTextContent('Ana Pérez, Luis Mora')
  })

  it('SCRUM-1147 — sin responsables no se renderiza el campo', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ vendedores_responsables: [] }))
    renderModal()
    await screen.findByText(VER)
    expect(screen.queryByText('adminContab:facturacion.detalle.vendedorResponsable:')).not.toBeInTheDocument()
  })

  it('sin permiso del backend no hay visor', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ puede_ver_fe_transmisiones: false }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
    expect(screen.queryByText(VER)).not.toBeInTheDocument()
  })

  it('con el interruptor apagado (no_aplica) no hay visor aunque el actor sea Gerencia', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ fe_estado: 'no_aplica' }))
    renderModal()
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.noAplica')
    expect(screen.queryByText(VER)).not.toBeInTheDocument()
  })

  describe('SCRUM-1019 — Reconciliar con MSL', () => {
    const REC = 'adminContab:facturacion.detalle.facturacionElectronica.accion.reconciliar'
    const K = 'adminContab:facturacion.detalle.facturacionElectronica.accion'

    it('solo aparece si el backend manda puede_reconciliar_fe === true', async () => {
      mockedApi.invoices.detail.mockResolvedValue(makeDetail({ puede_reconciliar_fe: false }))
      renderModal()
      await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')
      expect(screen.queryByText(REC)).not.toBeInTheDocument()
    })

    it('confirma, llama al endpoint con la factura resuelta, muestra el mensaje tal cual y refresca el detalle', async () => {
      mockedApi.invoices.detail.mockResolvedValue(makeDetail({ puede_reconciliar_fe: true }))
      mockedApi.invoices.feReconciliar.mockResolvedValue({
        accion: 'sin_cambios', fe_estado: 'error_configuracion', fe_detalle: 'Ventana vencida', cufe: null,
        mensaje: 'La ventana de reintento venció; requiere acción manual.', codigo: 'ventana_vencida',
      })
      renderModal()
      fireEvent.click(await screen.findByText(REC))
      fireEvent.click(screen.getByText(`${K}.confirmar`))

      expect(await screen.findByText('La ventana de reintento venció; requiere acción manual.')).toBeInTheDocument()
      expect(screen.getByRole('status').className).not.toContain('text-red-500') // ventana_vencida es resultado, no error
      expect(mockedApi.invoices.feReconciliar).toHaveBeenCalledWith(101, undefined)
      await waitFor(() => expect(mockedApi.invoices.detail.mock.calls.length).toBeGreaterThan(1)) // invalidación
    })

    it('un 409 del backend se muestra con su mensaje', async () => {
      const { AxiosError } = await import('axios')
      mockedApi.invoices.detail.mockResolvedValue(makeDetail({ puede_reconciliar_fe: true }))
      mockedApi.invoices.feReconciliar.mockRejectedValue(
        new AxiosError('x', '409', undefined, undefined, { status: 409, data: { message: 'Hay una operación en curso.' } } as never),
      )
      renderModal()
      fireEvent.click(await screen.findByText(REC))
      fireEvent.click(screen.getByText(`${K}.confirmar`))
      expect(await screen.findByText('Hay una operación en curso.')).toBeInTheDocument()
    })
  })
})
