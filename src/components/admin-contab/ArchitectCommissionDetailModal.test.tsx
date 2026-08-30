import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ArchitectCommissionDetailModal from './ArchitectCommissionDetailModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { ArchitectCommissionProject, ArchitectCommissionRow } from '@/types/adminContab'

// Batch 17 (SCRUM-591→596, REQ-514→519) — modal de detalle por proyecto. Cubre: propuesta de %
// (REQ-516 RN3), decisión de Mark (RN4), cadena de bloqueo de "Marcar como pagado" (REQ-515 RN2),
// comprobante de retención gateado por régimen (REQ-514 RN1), recordatorio (REQ-518).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    commissionsExternal: {
      uploadCuentaCobro: vi.fn(),
      viewCuentaCobro: vi.fn(),
      uploadComprobanteRetencion: vi.fn(),
      viewComprobanteRetencion: vi.fn(),
      bankAccountOptions: vi.fn(),
      updateCuentaPago: vi.fn(),
      proposePercent: vi.fn(),
      decidePercent: vi.fn(),
      markPaid: vi.fn(),
      sendReminder: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeProject(overrides: Partial<ArchitectCommissionProject> = {}): ArchitectCommissionProject {
  return {
    pipeline_card_id: 1, numero_pedido: 'PED-0001', cliente: 'Cliente Test', fecha_pedido: '2026-08-05',
    monto_proyecto: 34000, total_facturado: 34000, total_cobrado: 34000,
    porcentaje: 10, comision: 3400, impuesto: 238, total: 3638, estado: 'pendiente_factura_arquitecto',
    cuenta_cobro: { nombre_archivo: 'cuenta.pdf', uploaded_at: '2026-08-10T00:00:00Z' },
    comprobante_retencion: null, fecha_pago: null,
    porcentaje_pendiente: null, porcentaje_pendiente_motivo: null, bank_account: null,
    ...overrides,
  }
}

function makeArchitect(overrides: Partial<ArchitectCommissionRow> = {}): ArchitectCommissionRow {
  return {
    architect_id: 1, nombre: 'Arq. Juan Pérez', empresa: 'Estudio Pérez', ruc: '1-1-1',
    regimen_fiscal: 'con_itbms', datos_fiscales_completos: true,
    generada: 3638, pagada: 0, pendiente: 3638, proyectos: [],
    ...overrides,
  }
}

function renderModal(overrides: {
  project?: Partial<ArchitectCommissionProject>
  architect?: Partial<ArchitectCommissionRow>
  canManage?: boolean
  canUploadCuentaCobro?: boolean
  puedeDecidirPorcentaje?: boolean
} = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const onEditFiscal = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ArchitectCommissionDetailModal
        project={makeProject(overrides.project)} architect={makeArchitect(overrides.architect)}
        canManage={overrides.canManage ?? true} canUploadCuentaCobro={overrides.canUploadCuentaCobro ?? true}
        puedeDecidirPorcentaje={overrides.puedeDecidirPorcentaje ?? false}
        onClose={onClose} onEditFiscal={onEditFiscal}
      />
    </QueryClientProvider>,
  )
  return { onClose, onEditFiscal }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.commissionsExternal.bankAccountOptions.mockResolvedValue([])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('ArchitectCommissionDetailModal', () => {
  it('REQ-516 RN3 — propone un % nuevo con motivo', async () => {
    mockedApi.commissionsExternal.proposePercent.mockResolvedValue({ porcentaje_pendiente: 12.5 })
    renderModal()

    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.editarPorcentaje'))
    fireEvent.change(screen.getByPlaceholderText('comisionesExternas.detalleModal.motivoPlaceholder'), { target: { value: 'Proyecto ampliado' } })
    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.proponer'))

    await waitFor(() => expect(mockedApi.commissionsExternal.proposePercent).toHaveBeenCalledWith(
      1, { porcentaje: 10, motivo: 'Proyecto ampliado' },
    ))
  })

  it('REQ-516 RN4 — sin permiso de Mark, no muestra Aprobar/Rechazar aunque haya % pendiente', () => {
    renderModal({ project: { porcentaje_pendiente: 15, porcentaje_pendiente_motivo: 'x' }, puedeDecidirPorcentaje: false })
    expect(screen.queryByText('comisionesExternas.detalleModal.aprobar')).not.toBeInTheDocument()
  })

  it('REQ-516 RN4 — Mark aprueba el % pendiente', async () => {
    mockedApi.commissionsExternal.decidePercent.mockResolvedValue({ porcentaje_aprobado: 15 })
    renderModal({ project: { porcentaje_pendiente: 15, porcentaje_pendiente_motivo: 'x' }, puedeDecidirPorcentaje: true })

    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.aprobar'))

    await waitFor(() => expect(mockedApi.commissionsExternal.decidePercent).toHaveBeenCalledWith(
      1, { approve: true, motivo_rechazo: undefined },
    ))
  })

  it('REQ-516 RN4 — Mark rechaza exigiendo motivo antes de confirmar', async () => {
    mockedApi.commissionsExternal.decidePercent.mockResolvedValue({ porcentaje_aprobado: null })
    renderModal({ project: { porcentaje_pendiente: 15, porcentaje_pendiente_motivo: 'x' }, puedeDecidirPorcentaje: true })

    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.rechazar'))
    expect(mockedApi.commissionsExternal.decidePercent).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('comisionesExternas.detalleModal.motivoRechazoPlaceholder'), { target: { value: 'No aplica' } })
    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.rechazar'))

    await waitFor(() => expect(mockedApi.commissionsExternal.decidePercent).toHaveBeenCalledWith(
      1, { approve: false, motivo_rechazo: 'No aplica' },
    ))
  })

  it('REQ-515 RN2 — bloquea "Marcar como pagado" sin cuenta de cobro', () => {
    renderModal({ project: { cuenta_cobro: null } })
    expect(screen.getByText('comisionesExternas.detalleModal.marcarPagado')).toBeDisabled()
    expect(screen.getByText('comisionesExternas.detalleModal.bloqueoCuentaCobro')).toBeInTheDocument()
  })

  it('REQ-515 RN2 — bloquea "Marcar como pagado" con % pendiente de aprobación', () => {
    renderModal({ project: { porcentaje_pendiente: 12, porcentaje_pendiente_motivo: 'x' } })
    expect(screen.getByText('comisionesExternas.detalleModal.marcarPagado')).toBeDisabled()
  })

  it('REQ-515 — marca como pagado cuando todos los requisitos están cumplidos', async () => {
    mockedApi.commissionsExternal.markPaid.mockResolvedValue({ fecha_pago: '2026-08-25' })
    renderModal()

    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.marcarPagado'))

    await waitFor(() => expect(mockedApi.commissionsExternal.markPaid).toHaveBeenCalledWith(1))
  })

  it('REQ-514 RN1 — comprobante de retención solo aparece con régimen retención_50', () => {
    renderModal({ architect: { regimen_fiscal: 'con_itbms' } })
    expect(screen.queryByText('comisionesExternas.detalleModal.comprobanteRetencion')).not.toBeInTheDocument()
  })

  it('REQ-514 — comprobante de retención visible con régimen retención_50', () => {
    renderModal({ architect: { regimen_fiscal: 'retencion_50' } })
    expect(screen.getByText('comisionesExternas.detalleModal.comprobanteRetencion')).toBeInTheDocument()
  })

  it('REQ-518 — envía el recordatorio', async () => {
    mockedApi.commissionsExternal.sendReminder.mockResolvedValue(undefined)
    renderModal()

    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.recordar'))

    await waitFor(() => expect(mockedApi.commissionsExternal.sendReminder).toHaveBeenCalledWith(1))
  })

  it('REQ-517 — cambia la cuenta de pago', async () => {
    mockedApi.commissionsExternal.bankAccountOptions.mockResolvedValue([{ id: 5, label: 'Banco General — Cuenta Corriente ****1234' }])
    mockedApi.commissionsExternal.updateCuentaPago.mockResolvedValue({ bank_account_id: 5 })
    renderModal()

    const select = await screen.findByText('Banco General — Cuenta Corriente ****1234')
    fireEvent.change(select.closest('select')!, { target: { value: '5' } })

    await waitFor(() => expect(mockedApi.commissionsExternal.updateCuentaPago).toHaveBeenCalledWith(1, { bank_account_id: 5 }))
  })
})
