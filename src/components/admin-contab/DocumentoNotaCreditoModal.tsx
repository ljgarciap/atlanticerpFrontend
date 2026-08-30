import { useTranslation } from 'react-i18next'
import { useDownloadNotaCreditoPdf, useDownloadInvoicePdf } from '@/hooks/useAdminContab'
import type { NotaCreditoDetalle } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPrinter, IcoLink } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}

const RESULTADO_KEY: Record<string, string> = {
  // Pre-QA Batch 13 (2026-08-24) — hallazgo real: faltaba el prefijo `notasCredito.` que el resto
  // de claves de este mismo componente sí usa (ver `t('notasCredito.documentoModal.title')`
  // arriba) — sin él, `t()` no encuentra la clave y renderiza el string crudo tal cual
  // ("documentoModal.resultado.aplicadoSaldo") en pantalla, para los 3 valores posibles de
  // `resultado` (REQ-496 RN1, campo "Destino del monto" siempre visible en el documento).
  aplicado_saldo: 'notasCredito.documentoModal.resultado.aplicadoSaldo',
  devuelto: 'notasCredito.documentoModal.resultado.devuelto',
  saldo_favor: 'notasCredito.documentoModal.resultado.saldoFavor',
}

interface Props {
  nota: NotaCreditoDetalle
  onClose: () => void
}

/**
 * Batch 13 (SCRUM-573, REQ-496) — "Ver documento" (Nota de Crédito formal). RN1: los mismos datos
 * que ya trae `show()` (empresa/membrete solo en el PDF real, generado por `CreditNotePdfService`
 * del lado del backend — este modal en pantalla es la vista previa + el punto de entrada a la
 * factura relacionada, no reimplementa el membrete). RN2: el número de factura relacionada es
 * clicable (REQ-497) — reusa `invoices.downloadPdf()` tal cual, la MISMA factura completa que se
 * ve desde Facturación, no una versión resumida. RN3: el estado real siempre visible (una nota
 * rechazada se ve como "Rechazada", nunca aparentando estar aplicada) — reusa el mismo label de
 * `notasCredito.historial.estados` que el resto del módulo, sin badge especial.
 */
export default function DocumentoNotaCreditoModal({ nota, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const pdfMutation     = useDownloadNotaCreditoPdf()
  const facturaMutation = useDownloadInvoicePdf()

  function descargarPdf() {
    pdfMutation.mutate({ id: nota.id, numero: nota.numero })
  }

  function verFacturaRelacionada() {
    // REQ-497 — mismo ajuste que `DetalleNotaCreditoModal`: `invoices.downloadPdf()` identifica la
    // factura por `order_id`, no por `factura_origen_id` (PK propio de `AdminContInvoice`).
    if (!nota.factura_origen_numero || nota.factura_origen_order_id === null) return
    facturaMutation.mutate({ orderId: nota.factura_origen_order_id, orderNumber: nota.factura_origen_numero })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.documentoModal.title')}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{nota.numero} — {nota.cliente}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <DocField label={t('notasCredito.detalle.estado')} value={t(`notasCredito.historial.estados.${nota.estado}`)} />
            <DocField
              label={t('notasCredito.detalle.facturaOrigen')}
              value={nota.factura_origen_numero ?? '—'}
            />
            {nota.resultado && (
              <DocField label={t('notasCredito.documentoModal.destinoMonto')} value={t(RESULTADO_KEY[nota.resultado] ?? nota.resultado)} />
            )}
            {nota.cuenta_bancaria_salida && (
              <DocField label={t('notasCredito.detalle.cuentaBancariaSalida')} value={nota.cuenta_bancaria_salida} />
            )}
            <DocField label={t('notasCredito.detalle.subtotal')} value={formatCurrency(nota.subtotal)} />
            <DocField label={t('notasCredito.detalle.itbms')} value={formatCurrency(nota.itbms)} />
            <DocField label={t('notasCredito.detalle.monto')} value={formatCurrency(nota.monto)} />
            {nota.aprobado_por && (
              <DocField
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

          {nota.motivo_rechazo && (
            <div className="mt-3">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                {t('notasCredito.detalle.motivoRechazo')}
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-200">{nota.motivo_rechazo}</p>
            </div>
          )}

          {/* REQ-497 — mismo formato exacto que cualquier factura del sistema (RN1): reusa
              invoices.downloadPdf() tal cual, no una vista resumida. */}
          {nota.factura_origen_numero && (
            <Button
              variant="secondary" className="!text-xs mt-4 inline-flex items-center gap-1.5"
              onClick={verFacturaRelacionada} loading={facturaMutation.isPending}
            >
              <IcoLink size={13} /> {t('notasCredito.documentoModal.verFacturaRelacionada', { numero: nota.factura_origen_numero })}
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('notasCredito.detalle.cerrar')}</Button>
          <Button onClick={descargarPdf} loading={pdfMutation.isPending}>
            <span className="inline-flex items-center gap-1.5"><IcoPrinter size={13} />{t('notasCredito.documentoModal.descargarPdf')}</span>
          </Button>
        </div>
      </Card>
    </div>
  )
}
