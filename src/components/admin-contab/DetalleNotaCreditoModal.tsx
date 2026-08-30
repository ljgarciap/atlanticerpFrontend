import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useNotaCreditoDetalle, useDecideNotaCredito, useDownloadInvoicePdf } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoTruck, IcoCheck, IcoBan, IcoPaperclip, IcoFileText, IcoLink } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'
import VerComprobanteNotaCreditoModal from './VerComprobanteNotaCreditoModal'
import DocumentoNotaCreditoModal from './DocumentoNotaCreditoModal'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}

interface Props {
  notaId: number
  onClose: () => void
}

/**
 * Batch 12 del cuerpo principal (SCRUM-570, REQ-493) — modal de detalle de una nota de crédito
 * (endpoint/pantalla nuevos de cero, ver ADR-SCRUM565-570). RN2: trazabilidad de Bodega solo para
 * notas de tipo "Devolución de mercancía" (`bodega_trazabilidad` no-null). RN4: los botones
 * "Aprobar"/"Rechazar" se muestran solo cuando `estado = pendiente_aprobacion` — `puede_aprobar_
 * rechazar` calculado server-side, el frontend nunca decide esto por su cuenta.
 *
 * Batch 13 (SCRUM-571→574, REQ-494→497, ver ADR-SCRUM571-574) conecta la acción real de Aprobar/
 * Rechazar (antes deshabilitada) y agrega "Ver comprobante"/"Ver documento"/factura relacionada
 * clicable.
 */
export default function DetalleNotaCreditoModal({ notaId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: nota, isLoading, isError } = useNotaCreditoDetalle(notaId)
  const decideMutation  = useDecideNotaCredito()
  const facturaMutation = useDownloadInvoicePdf()
  const [rejecting, setRejecting]           = useState(false)
  const [motivoRechazo, setMotivoRechazo]   = useState('')
  const [motivoError, setMotivoError]       = useState<string | null>(null)
  const [decideError, setDecideError]       = useState<string | null>(null)
  const [comprobanteOpen, setComprobanteOpen] = useState(false)
  const [documentoOpen, setDocumentoOpen]     = useState(false)

  function aprobar() {
    setDecideError(null)
    decideMutation.mutate({ id: notaId, payload: { approve: true } }, {
      // RN2 REQ-494 — el backend bloquea con 422 si falta comprobante obligatorio; se muestra tal
      // cual, nunca un error genérico.
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setDecideError(msg ?? t('notasCredito.detalle.decisionError'))
      },
    })
  }

  function confirmarRechazo() {
    if (motivoRechazo.trim() === '') {
      // RN4 REQ-494 — motivo obligatorio, mensaje inline (nunca window.alert()).
      setMotivoError(t('notasCredito.detalle.motivoRechazoRequerido'))
      return
    }
    setDecideError(null)
    decideMutation.mutate({ id: notaId, payload: { approve: false, motivo_rechazo: motivoRechazo } }, {
      onSuccess: () => { setRejecting(false); setMotivoRechazo(''); setMotivoError(null) },
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setDecideError(msg ?? t('notasCredito.detalle.decisionError'))
      },
    })
  }

  function verFacturaOrigen() {
    // REQ-497 — `invoices.downloadPdf()` identifica la factura por `order_id`, no por el `id`
    // propio de `AdminContInvoice` (`factura_origen_id`) — son dos campos distintos, ver docblock
    // de `factura_origen_order_id` en `NotaCreditoDetalle`.
    if (!nota || !nota.factura_origen_numero || nota.factura_origen_order_id === null) return
    facturaMutation.mutate({ orderId: nota.factura_origen_order_id, orderNumber: nota.factura_origen_numero })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {nota ? `${nota.numero} — ${nota.cliente}` : t('notasCredito.detalle.title')}
            </h2>
            {nota && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {formatDateShort(nota.fecha)} · {nota.subtipo_anulacion === 'correccion' ? t('notasCredito.subtiposAnulacion.correccion') : t(`notasCredito.tipos.${nota.tipo}`)}
              </p>
            )}
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('notasCredito.detalle.error')}</p>}

          {nota && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DetailField label={t('notasCredito.detalle.monto')} value={formatCurrency(nota.monto)} />
                <DetailField label={t('notasCredito.detalle.subtotal')} value={formatCurrency(nota.subtotal)} />
                <DetailField label={t('notasCredito.detalle.itbms')} value={formatCurrency(nota.itbms)} />
                <DetailField label={t('notasCredito.detalle.estado')} value={t(`notasCredito.historial.estados.${nota.estado}`)} />
                {/* REQ-497 — clic en la factura de origen abre la factura completa, mismo formato
                    que Facturación (reusa invoices.downloadPdf() tal cual). */}
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('notasCredito.detalle.facturaOrigen')}</div>
                  {nota.factura_origen_numero ? (
                    <button
                      type="button" onClick={verFacturaOrigen} disabled={facturaMutation.isPending}
                      className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <IcoLink size={11} />{nota.factura_origen_numero}
                    </button>
                  ) : (
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">—</div>
                  )}
                </div>
                <DetailField label={t('notasCredito.detalle.registradoPor')} value={nota.registrado_por ?? '—'} />
                {nota.factura_nueva_numero && (
                  <DetailField label={t('notasCredito.detalle.facturaNueva')} value={nota.factura_nueva_numero} />
                )}
                {nota.aprobado_por && (
                  <DetailField
                    label={t('notasCredito.detalle.aprobadoRechazadoPor')}
                    value={`${nota.aprobado_por}${nota.fecha_decision ? ` — ${formatDateShort(nota.fecha_decision)}` : ''}`}
                  />
                )}
              </div>

              <div className="mt-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {t('notasCredito.detalle.motivo')}
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-200">{nota.motivo}</p>
              </div>

              {/* Solo presente en notas de "Corrección de datos" (subtipo_anulacion=correccion). */}
              {nota.motivo_correccion && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {nota.nuevo_tratamiento_itbms && (
                    <DetailField
                      label={t('notasCredito.formulario.tratamientoCorrectoLabel')}
                      value={`${nota.nuevo_tratamiento_itbms.nombre} (${nota.nuevo_tratamiento_itbms.porcentaje}%)`}
                    />
                  )}
                  {nota.nueva_fecha_factura && (
                    <DetailField label={t('notasCredito.formulario.nuevaFechaLabel')} value={formatDateShort(nota.nueva_fecha_factura)} />
                  )}
                </div>
              )}

              {/* RN1 REQ-493 — solo se muestra cuando corresponde al estado real de la nota. */}
              {nota.motivo_rechazo && (
                <div className="mt-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    {t('notasCredito.detalle.motivoRechazo')}
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{nota.motivo_rechazo}</p>
                </div>
              )}

              {/* RN2 REQ-493 — trazabilidad de Bodega, solo en notas de Devolución de mercancía. */}
              {nota.bodega_trazabilidad && (
                <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    <IcoTruck size={13} />
                    {t('notasCredito.detalle.trazabilidadBodegaTitle')} — {nota.bodega_trazabilidad.return_number}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {nota.bodega_trazabilidad.historial.map((paso, idx) => (
                      <div key={idx} className="flex justify-between gap-3 text-sm">
                        <span className="text-slate-700 dark:text-slate-200">
                          {paso.label}{paso.by ? ` — ${paso.by}` : ''}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDateShort(paso.at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RN4 REQ-494 — motivo obligatorio para rechazar, revelado inline (mismo patrón que
                  "marcar incobrable" en Facturación) en vez de un segundo modal. */}
              {rejecting && (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('notasCredito.detalle.motivoRechazoLabel')}
                  </label>
                  <textarea
                    value={motivoRechazo}
                    onChange={e => { setMotivoRechazo(e.target.value); setMotivoError(null) }}
                    placeholder={t('notasCredito.detalle.motivoRechazoPlaceholder')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    rows={2}
                  />
                  {motivoError && <p className="text-xs text-red-500">{motivoError}</p>}
                </div>
              )}

              {decideError && <p className="text-xs text-red-500 mt-3">{decideError}</p>}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('notasCredito.detalle.cerrar')}</Button>
          {/* REQ-495/496 — visibles siempre que la nota ya cargó (nunca deshabilitados esperando
              el dato, ver feedback_disabled_button_before_data_loads_is_a_click_trap). */}
          {nota && (
            <>
              <Button variant="secondary" onClick={() => setComprobanteOpen(true)}>
                <span className="inline-flex items-center gap-1.5"><IcoPaperclip size={13} />{t('notasCredito.detalle.verComprobante')}</span>
              </Button>
              <Button variant="secondary" onClick={() => setDocumentoOpen(true)}>
                <span className="inline-flex items-center gap-1.5"><IcoFileText size={13} />{t('notasCredito.detalle.verDocumento')}</span>
              </Button>
            </>
          )}
          {/* RN4 REQ-493 — `puede_aprobar_rechazar` calculado server-side, el frontend nunca decide
              esto por su cuenta. Batch 13 conecta la acción real (antes deshabilitada). */}
          {nota && nota.puede_aprobar_rechazar && !rejecting && (
            <>
              <Button variant="secondary" onClick={() => setRejecting(true)}>
                <span className="inline-flex items-center gap-1.5"><IcoBan size={13} />{t('notasCredito.detalle.rechazar')}</span>
              </Button>
              <Button onClick={aprobar} loading={decideMutation.isPending}>
                <span className="inline-flex items-center gap-1.5"><IcoCheck size={13} />{t('notasCredito.detalle.aprobar')}</span>
              </Button>
            </>
          )}
          {nota && nota.puede_aprobar_rechazar && rejecting && (
            <>
              <Button variant="secondary" onClick={() => { setRejecting(false); setMotivoRechazo(''); setMotivoError(null) }}>
                {t('notasCredito.formulario.cancel')}
              </Button>
              <Button onClick={confirmarRechazo} loading={decideMutation.isPending}>
                <span className="inline-flex items-center gap-1.5"><IcoBan size={13} />{t('notasCredito.detalle.confirmarRechazo')}</span>
              </Button>
            </>
          )}
        </div>
      </Card>

      {comprobanteOpen && <VerComprobanteNotaCreditoModal notaId={notaId} onClose={() => setComprobanteOpen(false)} />}
      {documentoOpen && nota && <DocumentoNotaCreditoModal nota={nota} onClose={() => setDocumentoOpen(false)} />}
    </div>
  )
}
