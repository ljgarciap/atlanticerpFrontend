import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RevisionPreviaCorreccionModal from './RevisionPreviaCorreccionModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { PreviewCorreccionPayload, PreviewCorreccionResponse } from '@/types/adminContab'

// Batch 12 del cuerpo principal (SCRUM-566/567, REQ-489/490) — revisión previa + vista previa de
// factura nueva antes de confirmar una "Corrección de datos". RN1: nada se persiste hasta
// confirmar. Ver ADR-SCRUM565-570.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    notasCredito: { previewCorreccion: vi.fn(), registerCorreccion: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const PARAMS: PreviewCorreccionPayload = {
  master_client_id: 1,
  factura_origen_id: 10,
  motivo_correccion: 'fecha',
  nuevo_tratamiento_itbms_rate_id: null,
  nueva_fecha: '2026-08-24',
  motivo: 'Fecha de facturación incorrecta, corregir',
}

function makePreview(overrides: Partial<PreviewCorreccionResponse> = {}): PreviewCorreccionResponse {
  return {
    tarjetas: {
      factura_origen: { numero: 'F-0001' },
      proyecto: { nombre: 'Torres Pacífico' },
      cotizacion: { folio: 'COT-0099' },
      guia_entrega: { numero: 'GE-1187' },
      nota_a_generar: { tipo: 'Corrección de datos' },
      correccion_aplicada: { fecha_nueva: '2026-08-24' },
      motivo: 'Fecha de facturación incorrecta, corregir',
    },
    factura_preview: {
      order_number: 'PED-0055', cliente: 'Grupo Sensei', monto: 6200,
      subtotal: 5794.39, itbms: 405.61, total: 6200,
      items: [{ descripcion: 'Luminaria LED', cantidad: 2, precio_unitario: 150, subtotal: 300 }],
    },
    monto: 6200,
    requiere_aprobacion: false,
    ...overrides,
  }
}

function renderModal(onBack = vi.fn(), onClose = vi.fn(), onConfirmed = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RevisionPreviaCorreccionModal params={PARAMS} onBack={onBack} onClose={onClose} onConfirmed={onConfirmed} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RevisionPreviaCorreccionModal — REQ-489', () => {
  it('RN1 — pide la revisión previa al backend sin persistir nada, muestra las tarjetas', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview())
    renderModal()
    expect(await screen.findByText('F-0001')).toBeInTheDocument()
    expect(screen.getByText('Fecha de facturación incorrecta, corregir')).toBeInTheDocument()
    expect(mockedApi.notasCredito.previewCorreccion).toHaveBeenCalledWith(PARAMS)
    expect(mockedApi.notasCredito.registerCorreccion).not.toHaveBeenCalled()
  })

  it('RN2 (REQ-449) — "Ver factura" muestra los productos de la factura nueva con el mismo formato fiscal', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview())
    renderModal()
    await screen.findByText('F-0001')
    fireEvent.click(screen.getByText('notasCredito.correccion.verFacturaButton'))
    expect(await screen.findByText('Luminaria LED')).toBeInTheDocument()
    expect(screen.getByText(/6,200\.00/)).toBeInTheDocument()
  })

  it('RN2 REQ-490 — si requiere aprobación, muestra el aviso de que no se generó ningún documento fiscal todavía', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview({ requiere_aprobacion: true, monto: 9800 }))
    renderModal()
    expect(await screen.findByText('notasCredito.correccion.pendienteAprobacionAviso')).toBeInTheDocument()
  })

  it('sin requerir aprobación, no muestra el aviso', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview({ requiere_aprobacion: false }))
    renderModal()
    await screen.findByText('F-0001')
    expect(screen.queryByText('notasCredito.correccion.pendienteAprobacionAviso')).not.toBeInTheDocument()
  })

  it('RN4 — "Volver y corregir" llama a onBack sin registrar nada', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview())
    const onBack = vi.fn()
    renderModal(onBack)
    await screen.findByText('F-0001')
    fireEvent.click(screen.getByText('notasCredito.correccion.volverButton'))
    expect(onBack).toHaveBeenCalled()
    expect(mockedApi.notasCredito.registerCorreccion).not.toHaveBeenCalled()
  })

  it('REQ-487 — comprobante obligatorio: "Confirmar" queda deshabilitado sin adjuntar', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview())
    renderModal()
    await screen.findByText('F-0001')
    expect(screen.getByText('notasCredito.correccion.confirmarButton')).toBeDisabled()
  })

  it('al confirmar con comprobante adjunto, envía el registro real con el mismo payload + comprobante', async () => {
    mockedApi.notasCredito.previewCorreccion.mockResolvedValue(makePreview())
    mockedApi.notasCredito.registerCorreccion.mockResolvedValue({
      id: 1, numero: 'NC-0010', estado: 'aplicada', monto: 6200, subtotal: 5794.39, itbms: 405.61, resultado: null,
    })
    const onConfirmed = vi.fn()
    renderModal(vi.fn(), vi.fn(), onConfirmed)
    await screen.findByText('F-0001')

    const file = new File(['x'], 'soporte.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('notasCredito.formulario.comprobantePlaceholder')
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('notasCredito.correccion.confirmarButton'))

    await waitFor(() => expect(mockedApi.notasCredito.registerCorreccion).toHaveBeenCalledWith({
      ...PARAMS,
      comprobante: file,
    }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
  })
})
