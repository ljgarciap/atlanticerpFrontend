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
      detail: vi.fn(), attachment: vi.fn(), downloadReceiptPdf: vi.fn(), confirm: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeDetail(overrides: Partial<PaymentDetail> = {}): PaymentDetail {
  return {
    id: 1, numero_recibo: 'REC-007', master_client_id: 7, monto_recibido: 6200, saldo_favor_aplicado: 0,
    metodo_pago: 'efectivo', referencia: 'TRF-88213', bank_account_id: 1, numero_documento_retencion: null,
    comentario_ajuste: null, estado: 'confirmado', created_at: '2026-07-02T00:00:00Z',
    cliente: 'Grupo Sensei', metodo_pago_label: 'Efectivo',
    registrado_por: 'Contabilidad Test', bank_account: 'Banco General — Cuenta Corriente', tiene_comprobante: false,
    total_facturas: 6200, confirmacion: null,
    facturas: [
      { invoice_id: 1, numero: 'F-0001', monto_aplicado: 4000 },
      { invoice_id: 2, numero: 'F-0002', monto_aplicado: 2200 },
    ],
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
    mockedApi.payments.confirm.mockResolvedValue(makeDetail({
      estado: 'confirmado',
      confirmacion: { numero_confirmacion: 'CONF-001', confirmado_por: 'Contabilidad Test', confirmado_at: '2026-07-05T00:00:00Z' },
    }))
    renderModal()

    fireEvent.click(await screen.findByText('cobros.detalle.marcarConfirmado'))

    await waitFor(() => expect(mockedApi.payments.confirm).toHaveBeenCalledWith(1))
  })

  it('REQ-475 Escenario 2 — muestra el registro de confirmación (CONF-XXX) cuando existe', async () => {
    mockedApi.payments.detail.mockResolvedValue(makeDetail({
      estado: 'confirmado',
      confirmacion: { numero_confirmacion: 'CONF-001', confirmado_por: 'Yaneth Solano', confirmado_at: '2026-07-05T00:00:00Z' },
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
