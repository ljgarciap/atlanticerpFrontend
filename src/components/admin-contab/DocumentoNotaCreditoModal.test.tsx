import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DocumentoNotaCreditoModal from './DocumentoNotaCreditoModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { NotaCreditoDetalle } from '@/types/adminContab'

// Batch 13 (SCRUM-573, REQ-496/497) — "Ver documento" + factura relacionada clicable.

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
    notasCredito: { downloadPdf: vi.fn() },
    invoices: { downloadPdf: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeDetalle(overrides: Partial<NotaCreditoDetalle> = {}): NotaCreditoDetalle {
  return {
    id: 1, numero: 'NC-0001', tipo: 'descuento_comercial', subtipo_anulacion: null,
    cliente: 'Grupo Sensei', master_client_id: 1, monto: 500, subtotal: 467.29, itbms: 32.71,
    estado: 'aplicada', resultado: 'aplicado_saldo',
    motivo: 'Descuento comercial acordado', motivo_rechazo: null, tiene_comprobante: true,
    fecha: '2026-08-20', registrado_por: 'Felix Campos', aprobado_por: null, fecha_decision: null,
    factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55,
    factura_nueva_numero: null, factura_nueva_order_id: null, motivo_correccion: null, nuevo_tratamiento_itbms: null,
    nueva_fecha_factura: null, puede_aprobar_rechazar: false,
    devolucion_bodega_id: null, bodega_trazabilidad: null, cuenta_bancaria_salida: null,
    ...overrides,
  }
}

function renderModal(overrides: Partial<NotaCreditoDetalle> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DocumentoNotaCreditoModal nota={makeDetalle(overrides)} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DocumentoNotaCreditoModal — REQ-496/497', () => {
  it('RN3 — una nota rechazada se ve como tal, nunca aparentando estar aplicada', () => {
    renderModal({ estado: 'rechazada', motivo_rechazo: 'Falta comprobante' })
    expect(screen.getByText('notasCredito.historial.estados.rechazada')).toBeInTheDocument()
    expect(screen.getByText('Falta comprobante')).toBeInTheDocument()
  })

  it('REQ-497 RN2 — la factura relacionada es clicable y llama a invoices.downloadPdf() con el order_id (misma factura completa)', async () => {
    // factura_origen_id (10) y factura_origen_order_id (55) deliberadamente distintos acá — este
    // test debe fallar si el componente vuelve a usar el campo equivocado.
    renderModal({ factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55 })
    fireEvent.click(screen.getByRole('button', { name: /F-0001/ }))
    await waitFor(() => {
      expect(mockedApi.invoices.downloadPdf).toHaveBeenCalledWith(55, 'F-0001')
    })
  })

  it('"Descargar PDF" llama a notasCredito.downloadPdf() con el id/numero de la nota', async () => {
    renderModal({ id: 7, numero: 'NC-0007' })
    fireEvent.click(screen.getByRole('button', { name: /descargarPdf/ }))
    await waitFor(() => {
      expect(mockedApi.notasCredito.downloadPdf).toHaveBeenCalledWith(7, 'NC-0007')
    })
  })

  // Pre-QA Batch 13 (2026-08-24) — hallazgo real en navegador: RESULTADO_KEY mapeaba a
  // 'documentoModal.resultado.aplicadoSaldo' (sin el prefijo 'notasCredito.' que el resto de
  // claves de este componente sí usa), así que `t()` no encontraba la clave real y el campo
  // "Destino del monto" mostraba el string crudo en pantalla. El mock de `t()` de este archivo
  // devuelve la clave tal cual (ver arriba) — por eso la suite mockeada NUNCA detectó esto, solo
  // se vio corriendo la app real (Playwright). Esta aserción fija la clave completa esperada para
  // que una regresión al prefijo faltante rompa acá también, no solo en un E2E.
  it.each([
    ['aplicado_saldo', 'notasCredito.documentoModal.resultado.aplicadoSaldo'],
    ['devuelto', 'notasCredito.documentoModal.resultado.devuelto'],
    ['saldo_favor', 'notasCredito.documentoModal.resultado.saldoFavor'],
  ] as const)('REQ-496 RN1 — "Destino del monto" resuelve la clave i18n completa para resultado=%s', (resultado, expectedKey) => {
    renderModal({ resultado })
    expect(screen.getByText(expectedKey)).toBeInTheDocument()
    expect(screen.queryByText(`documentoModal.resultado.${resultado === 'aplicado_saldo' ? 'aplicadoSaldo' : resultado === 'devuelto' ? 'devuelto' : 'saldoFavor'}`)).not.toBeInTheDocument()
  })
})
