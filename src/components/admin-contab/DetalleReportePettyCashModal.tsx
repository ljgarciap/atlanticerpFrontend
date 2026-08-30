import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePettyCashReportDetail, useApprovePettyCashReport, useDownloadPettyCashReportPdf,
  useRejectPettyCashExpense, useRejectPettyCashReport,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoDownload, IcoCheck, IcoBan } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

interface Props {
  numero: string
  onClose: () => void
  onSelectLinea: (id: number) => void
  /** REQ-541 RN4 — un reporte rechazado (completo o al perder su última línea) deja de existir
   *  como "pendiente"; el padre vuelve a la pestaña Pendientes en vez de reabrir este detalle. */
  onDisuelto: () => void
}

/** REQ-539/540 (SCRUM-616/617) — detalle de un reporte, agrupado por solicitante igual que
 *  Pendientes (RN2 REQ-539). REQ-541 (Batch 21) agrega "Rechazar" por línea y "Rechazar reporte
 *  completo", ambos exclusivos de Mark (gate real en backend vía `puede_aprobar`, mismo flag que
 *  ya condicionaba "Aprobar reporte"). "Descargar" ya no depende de `estado` (RN3 REQ-546 — debe
 *  funcionar tanto pendiente de aprobación como finalizado). */
export default function DetalleReportePettyCashModal({ numero, onClose, onSelectLinea, onDisuelto }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: detail, isFetching } = usePettyCashReportDetail(numero)
  const approveMutation  = useApprovePettyCashReport()
  const downloadMutation = useDownloadPettyCashReportPdf()
  const rejectLineaMutation  = useRejectPettyCashExpense()
  const rejectReporteMutation = useRejectPettyCashReport()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  const [rejectingLineaId, setRejectingLineaId] = useState<number | null>(null)
  const [rejectingReporte, setRejectingReporte] = useState(false)
  const [motivoRechazo, setMotivoRechazo]       = useState('')
  const [motivoError, setMotivoError]           = useState<string | null>(null)
  const [rejectError, setRejectError]           = useState<string | null>(null)

  const puedeGestionar = detail?.estado === 'pendiente_aprobacion' && detail.puede_aprobar === true

  function handleApprove() {
    setApproveError(null)
    approveMutation.mutate(numero, {
      onSuccess: () => setConfirmOpen(false),
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setApproveError(msg ?? t('cajaChica.detalleReporteModal.aprobarError'))
      },
    })
  }

  function abrirRechazoLinea(id: number) {
    setRejectingReporte(false)
    setMotivoRechazo(''); setMotivoError(null); setRejectError(null)
    setRejectingLineaId(id)
  }

  function abrirRechazoReporte() {
    setRejectingLineaId(null)
    setMotivoRechazo(''); setMotivoError(null); setRejectError(null)
    setRejectingReporte(true)
  }

  function cancelarRechazo() {
    setRejectingLineaId(null); setRejectingReporte(false)
    setMotivoRechazo(''); setMotivoError(null); setRejectError(null)
  }

  function confirmarRechazo() {
    if (motivoRechazo.trim() === '') {
      setMotivoError(t('cajaChica.detalleReporteModal.motivoRechazoRequerido'))
      return
    }
    setRejectError(null)
    if (rejectingLineaId !== null) {
      rejectLineaMutation.mutate({ id: rejectingLineaId, motivo: motivoRechazo }, {
        onSuccess: (data) => {
          cancelarRechazo()
          if (data.reporte_disuelto) onDisuelto()
        },
        onError: (err) => {
          const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
          setRejectError(msg ?? t('cajaChica.detalleReporteModal.rechazarError'))
        },
      })
    } else if (rejectingReporte) {
      rejectReporteMutation.mutate({ numero, motivo: motivoRechazo }, {
        onSuccess: () => { cancelarRechazo(); onDisuelto() },
        onError: (err) => {
          const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
          setRejectError(msg ?? t('cajaChica.detalleReporteModal.rechazarError'))
        },
      })
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-xl my-8 max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('cajaChica.detalleReporteModal.title', { numero })}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        {!detail ? (
          <p className="text-xs text-slate-400 py-4 text-center">{isFetching ? '…' : t('cajaChica.detalleReporteModal.aprobarError')}</p>
        ) : detail.estado === 'rechazado' ? (
          // REQ-541 RN3/RN4 (Senior Review, Batch 21) — un reporte disuelto no tiene contenido que
          // mostrar (sus líneas ya se liberaron a Pendientes/Rechazados) ni PDF que descargar
          // (`GET .../pdf` devuelve 409 para este estado) — mensaje simple en vez del cuerpo normal.
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('cajaChica.detalleReporteModal.reporteRechazadoBody')}</p>
            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-700">
              <Button variant="secondary" onClick={onClose}>{t('cajaChica.detalleReporteModal.cerrar')}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <div>{t('cajaChica.detalleReporteModal.realizadoPor', { nombre: detail.realizado_por_nombre })}</div>
              <div>{t('cajaChica.detalleReporteModal.formaPago', { formaPago: t(`cajaChica.formasPago.${detail.forma_pago}`) })}</div>
              {detail.estado === 'finalizado' && detail.aprobado_por_nombre && (
                <div>
                  {t('cajaChica.detalleReporteModal.aprobadoPor', {
                    nombre: detail.aprobado_por_nombre,
                    fecha: detail.fecha_aprobacion ? formatDateShort(detail.fecha_aprobacion) : '—',
                  })}
                </div>
              )}
            </div>

            {detail.grupos.map(g => (
              <div key={g.solicitante_id}>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {g.solicitante_nombre} <span className="text-slate-400 font-normal">({formatCurrency(g.subtotal)})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs mb-2">
                    <tbody>
                      {g.lineas.map(l => (
                        <tr
                          key={l.id} onClick={() => onSelectLinea(l.id)}
                          className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <td className="py-1.5 pr-2 text-slate-500 dark:text-slate-400">{l.fecha}</td>
                          <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{l.proveedor}</td>
                          <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{l.descripcion}</td>
                          <td className="py-1.5 pr-2 text-right font-medium text-slate-800 dark:text-slate-100">{formatCurrency(l.total)}</td>
                          {puedeGestionar && (
                            <td className="py-1.5 pl-2">
                              <button
                                type="button" onClick={(e) => { e.stopPropagation(); abrirRechazoLinea(l.id) }}
                                className="inline-flex items-center gap-1 text-red-600 hover:underline"
                              >
                                <IcoBan size={11} /> {t('cajaChica.detalleReporteModal.rechazar')}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700 text-sm font-bold">
              <span className="text-slate-700 dark:text-slate-200">{t('cajaChica.pendientesPanel.totalGeneral')}</span>
              <span className="text-slate-900 dark:text-slate-100">{formatCurrency(detail.total_general)}</span>
            </div>

            {/* REQ-541 RN2 — motivo obligatorio revelado inline, mismo patrón que Notas de Crédito
                (nunca un window.prompt() como el mockup original). */}
            {(rejectingLineaId !== null || rejectingReporte) && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  {rejectingReporte
                    ? t('cajaChica.detalleReporteModal.motivoRechazoReporteLabel')
                    : t('cajaChica.detalleReporteModal.motivoRechazoLineaLabel')}
                </label>
                <textarea
                  value={motivoRechazo}
                  onChange={e => { setMotivoRechazo(e.target.value); setMotivoError(null) }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  rows={2}
                />
                {motivoError && <p className="text-xs text-red-500">{motivoError}</p>}
                {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={cancelarRechazo}>{t('cajaChica.generarReporteModal.cancel')}</Button>
                  <Button onClick={confirmarRechazo} loading={rejectLineaMutation.isPending || rejectReporteMutation.isPending}>
                    {t('cajaChica.detalleReporteModal.confirmarRechazo')}
                  </Button>
                </div>
              </div>
            )}

            {approveError && <p className="text-xs text-red-500">{approveError}</p>}

            {rejectingLineaId === null && !rejectingReporte && (
              <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button" onClick={() => downloadMutation.mutate(numero)} disabled={downloadMutation.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-primary-dark disabled:opacity-50"
                >
                  <IcoDownload size={13} /> {t('cajaChica.detalleReporteModal.descargar')}
                </button>
                <div className="flex items-center gap-2">
                  {puedeGestionar && (
                    <button
                      type="button" onClick={abrirRechazoReporte}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                    >
                      <IcoBan size={13} /> {t('cajaChica.detalleReporteModal.rechazarReporte')}
                    </button>
                  )}
                  {puedeGestionar && (
                    <Button
                      variant="primary" className="!text-xs inline-flex items-center gap-1.5"
                      onClick={() => setConfirmOpen(true)}
                    >
                      <IcoCheck size={13} /> {t('cajaChica.detalleReporteModal.aprobar')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={onClose}>{t('cajaChica.detalleReporteModal.cerrar')}</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {confirmOpen && detail && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
            <Card variant="modal" className="w-full max-w-sm p-5">
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-4">
                {t('cajaChica.detalleReporteModal.aprobarConfirm', { numero, total: formatCurrency(detail.total_general) })}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t('cajaChica.generarReporteModal.cancel')}</Button>
                <Button variant="primary" onClick={handleApprove} loading={approveMutation.isPending}>
                  {t('cajaChica.detalleReporteModal.aprobar')}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Card>
    </div>
  )
}
