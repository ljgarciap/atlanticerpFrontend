import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useProposeArchitectPercent, useDecideArchitectPercent, useMarkArchitectCommissionPaid,
  useSendArchitectReminder, useBankAccountOptions, useUpdateArchitectCuentaPago,
  useUploadArchitectCuentaCobro, useViewArchitectCuentaCobro,
  useUploadArchitectComprobanteRetencion, useViewArchitectComprobanteRetencion,
} from '@/hooks/useAdminContab'
import type { ArchitectCommissionProject, ArchitectCommissionRow } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip } from '@/components/icons'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

interface Props {
  architect: ArchitectCommissionRow
  project: ArchitectCommissionProject
  canManage: boolean
  canUploadCuentaCobro: boolean
  puedeDecidirPorcentaje: boolean
  onClose: () => void
  onEditFiscal: () => void
}

/**
 * Batch 17 (SCRUM-596, REQ-519) — modal de detalle por proyecto, consolida lo que Batch 16 dejó
 * disperso en la fila (REQ-508→513) más las acciones nuevas de este batch (REQ-514→518). Mismo
 * criterio del mockup del ticket (`openDetalle`/`marcarPagado`) — el chequeo de "puede marcar
 * pagado" se repite acá client-side solo para evitar un viaje al servidor que va a fallar, la
 * autoridad real es siempre `ArchitectCommissionService::marcarComoPagada()`.
 */
export default function ArchitectCommissionDetailModal(
  { architect, project, canManage, canUploadCuentaCobro, puedeDecidirPorcentaje, onClose, onEditFiscal }: Props,
) {
  const { t } = useTranslation('adminContab')
  const sinDato = t('comisionesExternas.detalle.sinDato')

  const [editingPercent, setEditingPercent] = useState(false)
  const [nuevoPorcentaje, setNuevoPorcentaje] = useState(String(project.porcentaje))
  const [motivo, setMotivo] = useState('')
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const proposeMutation = useProposeArchitectPercent()
  const decideMutation  = useDecideArchitectPercent()
  const markPaidMutation = useMarkArchitectCommissionPaid()
  const remindMutation   = useSendArchitectReminder()
  const cuentaPagoMutation = useUpdateArchitectCuentaPago()
  const { data: bankAccountOptions } = useBankAccountOptions()

  const cuentaCobroFileInputRef = useRef<HTMLInputElement>(null)
  const uploadCuentaCobroMutation = useUploadArchitectCuentaCobro()
  const viewCuentaCobroMutation   = useViewArchitectCuentaCobro()

  const retencionFileInputRef = useRef<HTMLInputElement>(null)
  const uploadRetencionMutation = useUploadArchitectComprobanteRetencion()
  const viewRetencionMutation   = useViewArchitectComprobanteRetencion()

  const esRetencion = architect.regimen_fiscal === 'retencion_50'
  const yaPagada     = project.estado === 'pagada'
  const pendienteFactura = project.estado === 'pendiente_factura_arquitecto'

  // RN2 REQ-515 — mismo orden de cadena que `ArchitectCommissionService::marcarComoPagada()`, solo
  // para evitar ofrecer un botón que el backend va a rechazar; el mensaje real siempre viene del 422.
  const marcarPagadoBloqueadoPor = !pendienteFactura
    ? null
    : project.porcentaje_pendiente !== null
      ? t('comisionesExternas.detalleModal.bloqueoPorcentajePendiente')
      : !architect.datos_fiscales_completos
        ? t('comisionesExternas.detalleModal.bloqueoDatosFiscales')
        : !project.cuenta_cobro
          ? t('comisionesExternas.detalleModal.bloqueoCuentaCobro')
          : esRetencion && !project.comprobante_retencion
            ? t('comisionesExternas.detalleModal.bloqueoComprobanteRetencion')
            : null

  function handleProposeSubmit() {
    const porcentaje = Number(nuevoPorcentaje)
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100 || motivo.trim() === '') return
    proposeMutation.mutate(
      { pipelineCardId: project.pipeline_card_id, data: { porcentaje, motivo: motivo.trim() } },
      { onSuccess: () => { setEditingPercent(false); setMotivo('') } },
    )
  }

  function handleDecide(approve: boolean) {
    if (!approve && motivoRechazo.trim() === '') { setRejecting(true); return }
    decideMutation.mutate(
      { pipelineCardId: project.pipeline_card_id, data: { approve, motivo_rechazo: approve ? undefined : motivoRechazo.trim() } },
      { onSuccess: () => { setRejecting(false); setMotivoRechazo('') } },
    )
  }

  function handleMarkPaid() {
    if (marcarPagadoBloqueadoPor !== null) return
    if (!window.confirm(t('comisionesExternas.detalleModal.confirmarPago', { monto: project.total !== null ? formatCurrency(project.total) : sinDato }))) return
    markPaidMutation.mutate(project.pipeline_card_id)
  }

  function handleRemind() {
    remindMutation.mutate(project.pipeline_card_id)
  }

  function handleCuentaPagoChange(value: string) {
    cuentaPagoMutation.mutate({ pipelineCardId: project.pipeline_card_id, data: { bank_account_id: value === '' ? null : Number(value) } })
  }

  function handleViewCuentaCobro() {
    viewCuentaCobroMutation.mutate(project.pipeline_card_id, { onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer') })
  }

  function handleViewRetencion() {
    viewRetencionMutation.mutate(project.pipeline_card_id, { onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer') })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{project.cliente ?? sinDato}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{architect.nombre} · {project.numero_pedido ?? sinDato}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalle.montoProyecto')}</span>
              <span className="text-slate-800 dark:text-slate-100">{formatCurrency(project.monto_proyecto)}</span>
            </div>
            <div>
              <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalleModal.cobroCliente')}</span>
              <span className="text-slate-800 dark:text-slate-100">
                {project.total_facturado !== null ? formatCurrency(project.total_cobrado) + ' / ' + formatCurrency(project.total_facturado) : sinDato}
              </span>
            </div>
            <div>
              <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalle.estado')}</span>
              <span className="text-slate-800 dark:text-slate-100">{t(`comisionesExternas.estados.${project.estado}`)}</span>
            </div>
            <div>
              <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalleModal.ruc')}</span>
              {architect.ruc ? (
                <span className="text-slate-800 dark:text-slate-100">{architect.ruc}</span>
              ) : (
                <button type="button" onClick={onEditFiscal} className="text-primary-dark hover:underline">
                  {t('comisionesExternas.detalleModal.completar')}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10.5px] font-semibold uppercase text-slate-400">{t('comisionesExternas.detalleModal.porcentajeComision')}</span>
              {canManage && !yaPagada && project.porcentaje_pendiente === null && !editingPercent && (
                <button type="button" onClick={() => setEditingPercent(true)} className="text-[11px] text-primary-dark hover:underline">
                  {t('comisionesExternas.detalleModal.editarPorcentaje')}
                </button>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{project.porcentaje}%</p>

            {editingPercent && (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  type="number" step="0.01" min="0.01" max="100" value={nuevoPorcentaje}
                  onChange={e => setNuevoPorcentaje(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
                <input
                  type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder={t('comisionesExternas.detalleModal.motivoPlaceholder')}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditingPercent(false)}>{t('comisionesExternas.datosFiscales.cancel')}</Button>
                  <Button onClick={handleProposeSubmit} loading={proposeMutation.isPending} disabled={motivo.trim() === ''}>
                    {t('comisionesExternas.detalleModal.proponer')}
                  </Button>
                </div>
              </div>
            )}

            {project.porcentaje_pendiente !== null && (
              <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {t('comisionesExternas.detalleModal.propuestaPendiente', { porcentaje: project.porcentaje_pendiente, motivo: project.porcentaje_pendiente_motivo ?? '' })}
                </p>
                {puedeDecidirPorcentaje && (
                  <div className="mt-2">
                    {rejecting ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
                          placeholder={t('comisionesExternas.detalleModal.motivoRechazoPlaceholder')}
                          className="rounded-lg border border-amber-300 dark:border-amber-700 dark:bg-slate-900 px-2 py-1.5 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setRejecting(false)}>{t('comisionesExternas.datosFiscales.cancel')}</Button>
                          <Button variant="danger" onClick={() => handleDecide(false)} loading={decideMutation.isPending} disabled={motivoRechazo.trim() === ''}>
                            {t('comisionesExternas.detalleModal.rechazar')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button variant="danger" onClick={() => handleDecide(false)}>{t('comisionesExternas.detalleModal.rechazar')}</Button>
                        <Button onClick={() => handleDecide(true)} loading={decideMutation.isPending}>{t('comisionesExternas.detalleModal.aprobar')}</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {project.total !== null ? (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalle.comision')}</span>
                <span className="text-slate-800 dark:text-slate-100">{formatCurrency(project.comision)}</span>
              </div>
              <div>
                <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalle.impuesto')}</span>
                <span className="text-slate-800 dark:text-slate-100">{project.impuesto !== null ? formatCurrency(project.impuesto) : sinDato}</span>
              </div>
              <div>
                <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-0.5">{t('comisionesExternas.detalle.total')}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(project.total)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-500 dark:text-slate-400">
              {t('comisionesExternas.detalleModal.faltanDatosFiscales')}{' '}
              <button type="button" onClick={onEditFiscal} className="text-primary-dark hover:underline">{t('comisionesExternas.detalleModal.completar')}</button>
            </div>
          )}

          <div>
            <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-1">{t('comisionesExternas.detalleModal.cuentaPago')}</span>
            {yaPagada ? (
              <span className="text-xs text-slate-700 dark:text-slate-200">{project.bank_account?.label ?? sinDato}</span>
            ) : canUploadCuentaCobro ? (
              <select
                value={project.bank_account?.id ?? ''} onChange={e => handleCuentaPagoChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-xs"
              >
                <option value="">{sinDato}</option>
                {(bankAccountOptions ?? []).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            ) : (
              <span className="text-xs text-slate-700 dark:text-slate-200">{project.bank_account?.label ?? sinDato}</span>
            )}
          </div>

          <div>
            <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-1">{t('comisionesExternas.detalle.cuentaCobro')}</span>
            {project.cuenta_cobro ? (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={handleViewCuentaCobro} className="text-primary-dark hover:underline truncate max-w-[200px]">
                  {project.cuenta_cobro.nombre_archivo}
                </button>
                {canUploadCuentaCobro && (
                  <button type="button" onClick={() => cuentaCobroFileInputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {t('comisionesExternas.detalle.reemplazar')}
                  </button>
                )}
              </div>
            ) : canUploadCuentaCobro ? (
              <button type="button" onClick={() => cuentaCobroFileInputRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-primary-dark hover:underline">
                <IcoPaperclip size={12} /> {t('comisionesExternas.detalle.subir')}
              </button>
            ) : (
              <span className="text-xs text-slate-400">{sinDato}</span>
            )}
            {canUploadCuentaCobro && (
              <input
                ref={cuentaCobroFileInputRef} type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
                onChange={e => { const file = e.target.files?.[0]; if (file) uploadCuentaCobroMutation.mutate({ pipelineCardId: project.pipeline_card_id, file }) }}
              />
            )}
          </div>

          {esRetencion && (
            <div>
              <span className="block text-[10.5px] font-semibold uppercase text-slate-400 mb-1">{t('comisionesExternas.detalleModal.comprobanteRetencion')}</span>
              {project.comprobante_retencion ? (
                <div className="flex items-center gap-2 text-xs">
                  <button type="button" onClick={handleViewRetencion} className="text-primary-dark hover:underline truncate max-w-[200px]">
                    {project.comprobante_retencion.nombre_archivo}
                  </button>
                  {canUploadCuentaCobro && (
                    <button type="button" onClick={() => retencionFileInputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {t('comisionesExternas.detalle.reemplazar')}
                    </button>
                  )}
                </div>
              ) : canUploadCuentaCobro ? (
                <button type="button" onClick={() => retencionFileInputRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-primary-dark hover:underline">
                  <IcoPaperclip size={12} /> {t('comisionesExternas.detalle.subir')}
                </button>
              ) : (
                <span className="text-xs text-slate-400">{sinDato}</span>
              )}
              {canUploadCuentaCobro && (
                <input
                  ref={retencionFileInputRef} type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) uploadRetencionMutation.mutate({ pipelineCardId: project.pipeline_card_id, file }) }}
                />
              )}
            </div>
          )}

          {pendienteFactura && marcarPagadoBloqueadoPor !== null && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">{marcarPagadoBloqueadoPor}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('comisionesExternas.datosFiscales.cancel')}</Button>
          {canManage && pendienteFactura && (
            <Button variant="outline" onClick={handleRemind} loading={remindMutation.isPending}>
              {t('comisionesExternas.detalleModal.recordar')}
            </Button>
          )}
          {canManage && pendienteFactura && (
            <Button onClick={handleMarkPaid} loading={markPaidMutation.isPending} disabled={marcarPagadoBloqueadoPor !== null}>
              {t('comisionesExternas.detalleModal.marcarPagado')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
