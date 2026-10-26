import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useNotaCreditoDetalle, useDecideNotaCredito, useNotaCreditoFePreview, useNotaCreditoFeTransmisiones, useNotaCreditoFeAccion, useNotaCreditoFeReconciliar } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoTruck, IcoCheck, IcoBan, IcoPaperclip, IcoFileText, IcoLink, IcoAlertTriangle } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'
import VerComprobanteNotaCreditoModal from './VerComprobanteNotaCreditoModal'
import DocumentoNotaCreditoModal from './DocumentoNotaCreditoModal'
import QuoteViewerModal from '@/components/QuoteViewerModal'
import GuiaEntregaModal from '@/components/GuiaEntregaModal'
import InvoiceDetailModal from './InvoiceDetailModal'
import FiscalElectronicStatusBadge from './FiscalElectronicStatusBadge'
import FeTransmisionesPanel from './FeTransmisionesPanel'
import FeAccionFiscalBoton from './FeAccionFiscal'
import type { FeAccionFiscal } from '@/types/adminContab'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
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
  const fePreviewMutation = useNotaCreditoFePreview()
  const feTransmisionesMutation = useNotaCreditoFeTransmisiones()
  const feAccionMutation = useNotaCreditoFeAccion()
  const feReconciliarMutation = useNotaCreditoFeReconciliar()
  const [reconciliarUsado, setReconciliarUsado] = useState(false) // SCRUM-1019, mismo motivo que accionFeUsada
  const [accionFeUsada, setAccionFeUsada] = useState<FeAccionFiscal | null>(null) // SCRUM-1007, ver InvoiceDetailModal
  const [rejecting, setRejecting]           = useState(false)
  const [motivoRechazo, setMotivoRechazo]   = useState('')
  const [motivoError, setMotivoError]       = useState<string | null>(null)
  const [decideError, setDecideError]       = useState<string | null>(null)
  const [comprobanteOpen, setComprobanteOpen] = useState(false)
  const [documentoOpen, setDocumentoOpen]     = useState(false)
  // SCRUM-932 — Cotización/Guía de Entrega de la factura de origen, mismo patrón de modal hijo que
  // ya usa `DetalleCobroModal.tsx` (SCRUM-931) — primera vez que este componente abre uno.
  const [quoteId, setQuoteId]         = useState<number | null>(null)
  const [guiaOrderId, setGuiaOrderId] = useState<number | null>(null)
  // SCRUM-932 (rebote Gerencia 2026-09-20) — "Factura de origen" debía abrir el mismo modal de
  // detalle que Cobros (InvoiceDetailModal), no descargar el PDF directo (verFacturaOrigen()/
  // useDownloadInvoicePdf(), retirados). El backend ya expone ambos ids que el modal necesita:
  // `factura_origen_order_id` (order_id) y `factura_origen_id` (PK de AdminContInvoice, distinto
  // del anterior — ver docblock de CreditNoteService::detail()).
  const [detailOrderId, setDetailOrderId]     = useState<number | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null)

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
    // SCRUM-932 — mismo patrón que DetalleCobroModal: abre InvoiceDetailModal con ambos ids,
    // nunca descarga el PDF directo. `factura_origen_order_id` sigue siendo distinto de
    // `factura_origen_id` (ver docblock de `factura_origen_order_id` en `NotaCreditoDetalle`).
    if (!nota || !nota.factura_origen_numero || nota.factura_origen_order_id === null) return
    setDetailOrderId(nota.factura_origen_order_id)
    setDetailInvoiceId(nota.factura_origen_id)
  }

  function verFacturaNueva() {
    // SCRUM-1060 — el reemplazo conserva el `order_id` de la original: `factura_nueva_id` es lo que
    // hace que InvoiceDetailModal muestre ESTA factura y no la anulada.
    if (!nota || nota.factura_nueva_order_id === null || nota.factura_nueva_id === null) return
    setDetailOrderId(nota.factura_nueva_order_id)
    setDetailInvoiceId(nota.factura_nueva_id)
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
                {/* SCRUM-932 — Cotización y Guía de Entrega, ANTES de "Factura de origen" (AC
                    explícito del ticket) — clickeables cuando hay id, texto plano si no. */}
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('notasCredito.detalle.cotizacion')}</div>
                  {nota.cotizacion_folio ? (
                    <button
                      type="button" onClick={() => setQuoteId(nota.quote_id)}
                      className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <IcoLink size={11} />{nota.cotizacion_folio}
                    </button>
                  ) : (
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">—</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('notasCredito.detalle.guiaEntrega')}</div>
                  {nota.guia_entrega_numero ? (
                    <button
                      type="button" onClick={() => setGuiaOrderId(nota.guia_entrega_order_id)}
                      className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <IcoLink size={11} />{nota.guia_entrega_numero}
                    </button>
                  ) : (
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">—</div>
                  )}
                </div>
                {/* SCRUM-932 (rebote Gerencia 2026-09-20) — clic en la factura de origen abre el
                    modal de detalle (InvoiceDetailModal), mismo comportamiento que Cobros — ya
                    no descarga el PDF directo. */}
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('notasCredito.detalle.facturaOrigen')}</div>
                  {nota.factura_origen_numero ? (
                    <button
                      type="button" onClick={verFacturaOrigen}
                      className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <IcoLink size={11} />{nota.factura_origen_numero}
                    </button>
                  ) : (
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">—</div>
                  )}
                </div>
                <DetailField label={t('notasCredito.detalle.registradoPor')} value={nota.registrado_por ?? '—'} />
                {/* SCRUM-1060 — la factura de reemplazo abre el mismo modal de detalle que la de
                    origen; sin ids de navegación (nota previa al campo) queda como texto. */}
                {nota.factura_nueva_numero && (
                  nota.factura_nueva_order_id !== null && nota.factura_nueva_id !== null ? (
                    <div>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('notasCredito.detalle.facturaNueva')}</div>
                      <button
                        type="button" onClick={verFacturaNueva}
                        className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        <IcoLink size={11} />{nota.factura_nueva_numero}
                      </button>
                    </div>
                  ) : (
                    <DetailField label={t('notasCredito.detalle.facturaNueva')} value={nota.factura_nueva_numero} />
                  )
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

              {/* SCRUM-943 — solo tiene sentido una vez aplicada; mientras pendiente_aprobacion o
                  rechazada, la nota nunca llegó a certificarse ante el PAC. */}
              {nota.estado === 'aplicada' && (
                <div className="mt-3">
                  <FiscalElectronicStatusBadge
                    estado={nota.fe_estado} detalle={nota.fe_detalle} cufe={nota.cufe} qrContent={nota.qr_content} t={t}
                    onLoadPreview={() => fePreviewMutation.mutateAsync(notaId)}
                  />
                  {/* SCRUM-1009 — la NC de una Corrección de datos aún no certificó: el reemplazo espera. */}
                  {nota.motivo_correccion && nota.fe_estado !== null && nota.fe_estado !== 'certificado' && nota.fe_estado !== 'no_aplica' && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 p-2.5 text-[11px] font-medium">
                      <IcoAlertTriangle size={13} />
                      <span>{t('notasCredito.detalle.avisoCorreccionSinCertificar')}</span>
                    </div>
                  )}
                  {nota.puede_ver_fe_transmisiones && nota.fe_estado !== null && nota.fe_estado !== 'no_aplica' && (
                    <div className="mt-2">
                      <FeTransmisionesPanel t={t} onLoad={() => feTransmisionesMutation.mutateAsync(notaId)} />
                    </div>
                  )}
                  {(nota.accion_fe ?? accionFeUsada) !== null && (
                    <div className="mt-2">
                      <FeAccionFiscalBoton
                        key={notaId}
                        accion={(nota.accion_fe ?? accionFeUsada) as FeAccionFiscal}
                        disponible={nota.accion_fe != null}
                        t={t}
                        onEjecutar={() => {
                          const accion = (nota.accion_fe ?? accionFeUsada) as FeAccionFiscal
                          setAccionFeUsada(accion)
                          return feAccionMutation.mutateAsync({ accion, id: notaId })
                        }}
                      />
                    </div>
                  )}
                  {(nota.puede_reconciliar_fe === true || reconciliarUsado) && (
                    <div className="mt-2">
                      <FeAccionFiscalBoton
                        key={`rec:${notaId}`}
                        accion="reconciliar"
                        disponible={nota.puede_reconciliar_fe === true}
                        t={t}
                        onEjecutar={() => {
                          setReconciliarUsado(true)
                          return feReconciliarMutation.mutateAsync(notaId)
                        }}
                      />
                    </div>
                  )}
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
      {quoteId !== null && <QuoteViewerModal quoteId={quoteId} onClose={() => setQuoteId(null)} />}
      {guiaOrderId !== null && <GuiaEntregaModal orderId={guiaOrderId} onClose={() => setGuiaOrderId(null)} />}
      {detailOrderId !== null && (
        <InvoiceDetailModal
          orderId={detailOrderId} invoiceId={detailInvoiceId} t={t}
          onClose={() => { setDetailOrderId(null); setDetailInvoiceId(null) }}
        />
      )}
    </div>
  )
}
