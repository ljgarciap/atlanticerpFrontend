import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useInvoiceDetail, useMarkUncollectible, useDecideUncollectible, useDownloadInvoicePdf, useInvoiceFePreview, useInvoiceFeTransmisiones, useInvoiceFeAccion, useInvoiceFeReconciliar,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoCheck, IcoBan, IcoAlertTriangle, IcoTruck, IcoClock } from '@/components/icons'
import { InvoiceFiscalSummary } from '@/components/admin-contab/InvoiceFiscalSummary'
import FiscalElectronicStatusBadge from '@/components/admin-contab/FiscalElectronicStatusBadge'
import FeTransmisionesPanel from '@/components/admin-contab/FeTransmisionesPanel'
import FeAccionFiscalBoton from '@/components/admin-contab/FeAccionFiscal'
import type { FeAccionFiscal } from '@/types/adminContab'

/**
 * SCRUM-930 (F1) — extraído de `FacturacionPage.tsx` (vivía inline) para poder reusarlo también
 * desde `EstadoCuentaPage.tsx`. Mismas props y mismo comportamiento, sin cambios funcionales.
 */
export default function InvoiceDetailModal(
  { orderId, invoiceId, t, onClose }:
  { orderId: number; invoiceId: number | null; t: (key: string, opts?: Record<string, unknown>) => string; onClose: () => void },
) {
  const { data: detail, isLoading } = useInvoiceDetail(orderId, invoiceId)
  const navigate = useNavigate()
  const markMutation = useMarkUncollectible()
  const decideMutation = useDecideUncollectible()
  const pdfMutation = useDownloadInvoicePdf()
  const fePreviewMutation = useInvoiceFePreview()
  const feTransmisionesMutation = useInvoiceFeTransmisiones()
  const feAccionMutation = useInvoiceFeAccion()
  const feReconciliarMutation = useInvoiceFeReconciliar()
  // SCRUM-1007 — al certificarse, el backend deja de ofrecer la acción: se recuerda la última para no desmontar el resultado.
  const [accionFeUsada, setAccionFeUsada] = useState<FeAccionFiscal | null>(null)
  // SCRUM-1019 — idem: tras reconciliar, `puede_reconciliar_fe` pasa a false y el resultado debe seguir visible.
  const [reconciliarUsado, setReconciliarUsado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [proposingUncollectible, setProposingUncollectible] = useState(false)
  const [motivoError, setMotivoError] = useState<string | null>(null)

  // SCRUM-929 — la factura que YA resolvió `detail()` (parcial/completo elegido por la regla
  // central o por `invoiceId`) es la fuente de verdad para cualquier acción sobre ESA factura.
  const resolvedInvoiceId = detail?.invoice_id ?? undefined

  function submitMotivo() {
    if (motivo.trim() === '') {
      // RN2 REQ-448 — motivo obligatorio, mensaje inline (nunca window.alert()).
      setMotivoError(t('adminContab:facturacion.detalle.motivoRequerido'))
      return
    }
    markMutation.mutate({ orderId, motivo, invoiceId: resolvedInvoiceId }, {
      onSuccess: () => { setProposingUncollectible(false); setMotivo(''); setMotivoError(null) },
    })
  }

  function decide(approve: boolean) {
    decideMutation.mutate({ orderId, approve, invoiceId: resolvedInvoiceId })
  }

  function verPdf() {
    if (!detail) return
    pdfMutation.mutate({ orderId, orderNumber: detail.order_number, invoiceId: resolvedInvoiceId })
  }

  function registrarCobro() {
    if (!detail || detail.master_client_id === null) return
    onClose() // cerramos el modal antes de salir de la pantalla, mismo criterio que confirmar/cancelar
    navigate(`/admin-contab/cobros?master_client_id=${detail.master_client_id}&accion=nuevo-cobro`)
  }

  const facturaCompleta = !!detail?.numero_factura
  // RN2/Escenario 3 REQ-447 — defensa doble: la Guía de Entrega nunca se muestra completa si
  // todavía no hay factura, sin importar lo que diga `guia_entrega.existe`.
  const guiaCompleta = facturaCompleta && (detail?.guia_entrega.existe ?? false)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.detalle.title')}</h2>
            {detail && (
              <p className="text-xs text-slate-400">
                {detail.order_number} · {detail.cliente}{detail.concepto && <> · {detail.concepto}</>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        {isLoading && <p className="text-xs text-slate-400 py-4">{t('common:labels.loading')}</p>}

        {detail && (
          <div className="space-y-4">
            {/* REQ-447 — trazabilidad Cotización → Factura → Guía de Entrega, en ese orden fijo. */}
            <div className="flex items-center gap-2">
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoCotizacion')} done={!!detail.cotizacion_folio} sub={detail.cotizacion_folio} t={t} />
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoFactura')} done={facturaCompleta} sub={detail.numero_factura} t={t} />
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoGuiaEntrega')} done={guiaCompleta} sub={detail.guia_entrega.fecha} t={t} icon={<IcoTruck size={13} />} />
            </div>

            {detail.es_anulada && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs font-medium">
                <IcoAlertTriangle size={15} /> {t('adminContab:facturacion.detalle.anuladaAviso')}
              </div>
            )}

            {/* SCRUM-1147 — a quién contactar si hay dudas sobre el pedido; antes de la tabla de desglose. */}
            {detail.vendedores_responsables !== undefined && detail.vendedores_responsables.length > 0 && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{t('adminContab:facturacion.detalle.vendedorResponsable')}:</span>{' '}
                {detail.vendedores_responsables.join(', ')}
              </div>
            )}

            {(detail.estado === 'facturada' || detail.estado === 'anulada') && (
              <InvoiceFiscalSummary
                items={detail.items} subtotal={detail.subtotal} descuentos={detail.descuentos} itbms={detail.itbms}
                total={detail.total} monto={detail.monto} saldoAplicado={detail.saldo_aplicado}
                totalAPagar={detail.total_a_pagar} cuentaPago={detail.cuenta_pago} responsable={detail.responsable}
                onVerPdf={verPdf} pdfLoading={pdfMutation.isPending} t={t}
              />
            )}

            {detail.estado === 'facturada' && (
              <FiscalElectronicStatusBadge
                estado={detail.fe_estado} detalle={detail.fe_detalle} cufe={detail.cufe} qrContent={detail.qr_content} t={t}
                onLoadPreview={() => fePreviewMutation.mutateAsync({ orderId, invoiceId: resolvedInvoiceId })}
              />
            )}

            {(detail.estado === 'facturada' || detail.estado === 'anulada') && detail.puede_ver_fe_transmisiones && detail.fe_estado !== null && detail.fe_estado !== 'no_aplica' && (
              <FeTransmisionesPanel
                t={t}
                onLoad={() => feTransmisionesMutation.mutateAsync({ orderId, invoiceId: resolvedInvoiceId })}
              />
            )}

            {(detail.accion_fe ?? accionFeUsada) !== null && (
              <FeAccionFiscalBoton
                key={`${orderId}:${resolvedInvoiceId ?? 'x'}`}
                accion={(detail.accion_fe ?? accionFeUsada) as FeAccionFiscal}
                disponible={detail.accion_fe != null}
                t={t}
                onEjecutar={() => {
                  const accion = (detail.accion_fe ?? accionFeUsada) as FeAccionFiscal
                  setAccionFeUsada(accion)
                  return feAccionMutation.mutateAsync({ accion, orderId, invoiceId: resolvedInvoiceId })
                }}
              />
            )}

            {(detail.puede_reconciliar_fe === true || reconciliarUsado) && (
              <FeAccionFiscalBoton
                key={`rec:${orderId}:${resolvedInvoiceId ?? 'x'}`}
                accion="reconciliar"
                disponible={detail.puede_reconciliar_fe === true}
                t={t}
                onEjecutar={() => {
                  setReconciliarUsado(true)
                  return feReconciliarMutation.mutateAsync({ orderId, invoiceId: resolvedInvoiceId })
                }}
              />
            )}

            {/* REQ-448 — cobrabilidad, exclusiva de facturas en estado 'facturada'. */}
            {detail.estado === 'facturada' && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                {detail.cobrabilidad === 'normal' && detail.puede_marcar_incobrable && !proposingUncollectible && (
                  <button
                    type="button" onClick={() => setProposingUncollectible(true)}
                    className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    {t('adminContab:facturacion.detalle.marcarIncobrable')}
                  </button>
                )}

                {detail.cobrabilidad === 'normal' && detail.puede_marcar_incobrable && proposingUncollectible && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t('adminContab:facturacion.detalle.motivoLabel')}
                    </label>
                    <textarea
                      value={motivo} onChange={e => { setMotivo(e.target.value); setMotivoError(null) }}
                      placeholder={t('adminContab:facturacion.detalle.motivoPlaceholder')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                      rows={2}
                    />
                    {motivoError && <p className="text-xs text-red-500">{motivoError}</p>}
                    <div className="flex gap-2">
                      <Button variant="secondary" className="!text-xs" onClick={() => { setProposingUncollectible(false); setMotivo(''); setMotivoError(null) }}>
                        {t('adminContab:facturacion.crear.cancelar')}
                      </Button>
                      <Button className="!text-xs" onClick={submitMotivo} loading={markMutation.isPending}>
                        {t('adminContab:facturacion.detalle.enviarPropuesta')}
                      </Button>
                    </div>
                  </div>
                )}

                {detail.cobrabilidad === 'pendiente_aprobacion' && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300">
                      {t('adminContab:facturacion.detalle.pendienteAprobacionAviso')}
                    </p>
                    {detail.motivo_incobrable && <p className="text-xs text-slate-500 dark:text-slate-400">{detail.motivo_incobrable}</p>}
                    {detail.puede_decidir_incobrable && (
                      <div className="flex gap-2">
                        <Button variant="secondary" className="!text-xs inline-flex items-center gap-1.5" onClick={() => decide(false)} loading={decideMutation.isPending}>
                          <IcoBan size={13} /> {t('adminContab:facturacion.detalle.rechazar')}
                        </Button>
                        <Button className="!text-xs inline-flex items-center gap-1.5" onClick={() => decide(true)} loading={decideMutation.isPending}>
                          <IcoCheck size={13} /> {t('adminContab:facturacion.detalle.aprobar')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {detail.cobrabilidad === 'incobrable' && (
                  <span className="text-[10.5px] font-semibold px-2 py-1 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {t('adminContab:facturacion.estados.incobrable')}
                  </span>
                )}
              </div>
            )}

            {detail.puede_registrar_cobro && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <Button onClick={registrarCobro}>{t('adminContab:facturacion.detalle.registrarCobro')}</Button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
          <Button variant="secondary" onClick={onClose}>{t('adminContab:facturacion.detalle.cerrar')}</Button>
        </div>
      </Card>
    </div>
  )
}

function TrazabilidadStep(
  { label, done, sub, icon, t }:
  { label: string; done: boolean; sub?: string | null; icon?: React.ReactNode; t: (key: string) => string },
) {
  return (
    <div className="flex flex-col items-center gap-1 text-center min-w-[72px]">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${done ? 'bg-primary-soft text-primary-dark' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
        {done ? <IcoCheck size={14} /> : (icon ?? <IcoClock size={14} />)}
      </div>
      <div className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300">{label}</div>
      <div className="text-[9.5px] text-slate-400">{done ? sub : t('adminContab:facturacion.detalle.pendiente')}</div>
    </div>
  )
}
