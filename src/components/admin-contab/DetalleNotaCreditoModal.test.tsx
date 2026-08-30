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
    },
    invoices: {
      downloadPdf: vi.fn(),
    },
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
        historial: [{ step: 'finalized', label: 'Devolución finalizada', at: '2026-08-20', by: 'Carlos Vergara' }],
      },
    }))
    renderModal()
    expect(await screen.findByText(/notasCredito\.detalle\.trazabilidadBodegaTitle/)).toBeInTheDocument()
    expect(screen.getByText(/Carlos Vergara/)).toBeInTheDocument()
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

  it('REQ-497 — clic en la factura de origen llama a invoices.downloadPdf() con el order_id (no el id propio de la nota)', async () => {
    // factura_origen_id (10) y factura_origen_order_id (55) deliberadamente distintos acá — este
    // test debe fallar si el componente vuelve a usar el campo equivocado.
    mockedApi.notasCredito.detail.mockResolvedValue(makeDetalle({ factura_origen_id: 10, factura_origen_numero: 'F-0001', factura_origen_order_id: 55 }))
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: /F-0001/ }))
    await waitFor(() => {
      expect(mockedApi.invoices.downloadPdf).toHaveBeenCalledWith(55, 'F-0001')
    })
  })
})
