import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { usePaymentDetail, useDownloadPaymentReceipt, useConfirmPayment } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip, IcoPrinter, IcoCheck } from '@/components/icons'
import VerComprobanteModal from './VerComprobanteModal'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

// SCRUM-787 — `formatDate()` local eliminado, reemplazado por `formatDateShort()` compartido
// (`@/utils/dates`), mismo criterio ya aplicado en Notas Crédito.

interface Props {
  paymentId: number
  onClose: () => void
}

/**
 * Batch 6 del cuerpo principal (SCRUM-548, REQ-471) — modal de detalle de un cobro. Batch 7
 * (SCRUM-549/550/552, REQ-472/473/475) agrega las 3 acciones del footer: "Marcar como confirmado"
 * (solo cuando `estado === 'esperando_confirmacion'`, RN1 REQ-475 — desaparece apenas se confirma),
 * "Ver comprobante" y "Ver recibo".
 */
export default function DetalleCobroModal({ paymentId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: payment, isLoading, isError } = usePaymentDetail(paymentId)
  const [comprobanteOpen, setComprobanteOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const downloadReceipt = useDownloadPaymentReceipt()
  const confirmMutation  = useConfirmPayment()

  function verRecibo() {
    if (!payment) return
    downloadReceipt.mutate({ id: payment.id, numeroRecibo: payment.numero_recibo })
  }

  function marcarConfirmado() {
    if (!payment) return
    setConfirmError(null)
    confirmMutation.mutate(payment.id, {
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setConfirmError(msg ?? t('cobros.detalle.confirmarError'))
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {payment ? `${payment.numero_recibo} — ${payment.cliente ?? ''}` : t('cobros.detalle.title')}
            </h2>
            {payment && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {formatDateShort(payment.created_at)} · {t(`cobros.metodos.${payment.metodo_pago}`)}
              </p>
            )}
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('cobros.detalle.error')}</p>}

          {payment && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DetailField label={t('cobros.detalle.montoTotal')} value={formatCurrency(payment.monto_recibido)} />
                <DetailField label={t('cobros.detalle.estado')} value={t(`cobros.historial.estados.${payment.estado}`)} />
                <DetailField label={t('cobros.detalle.registradoPor')} value={payment.registrado_por ?? '—'} />
                <DetailField label={t('cobros.detalle.referencia')} value={payment.referencia ?? '—'} />
                <DetailField label={t('cobros.detalle.numeroRecibo')} value={payment.numero_recibo} />
                <DetailField label={t('cobros.detalle.fechaRegistro')} value={formatDateShort(payment.created_at)} />
                <DetailField label={t('cobros.detalle.cuentaBancaria')} value={payment.bank_account ?? '—'} />
                {payment.saldo_favor_aplicado > 0 && (
                  <DetailField label={t('cobros.detalle.saldoFavorAplicado')} value={`-${formatCurrency(payment.saldo_favor_aplicado)}`} />
                )}
                {payment.comentario_ajuste && (
                  <div className="col-span-2 sm:col-span-3">
                    <DetailField label={t('cobros.detalle.comentarioAjuste')} value={payment.comentario_ajuste} />
                  </div>
                )}
                {payment.confirmacion && (
                  <div className="col-span-2 sm:col-span-3">
                    <DetailField
                      label={t('cobros.detalle.confirmacion')}
                      value={t('cobros.detalle.confirmadoPorLine', {
                        numero: payment.confirmacion.numero_confirmacion,
                        nombre: payment.confirmacion.confirmado_por ?? '—',
                        fecha: formatDateShort(payment.confirmacion.confirmado_at),
                      })}
                    />
                  </div>
                )}
              </div>

              {confirmError && <p className="text-red-600 text-sm mt-3">{confirmError}</p>}

              <div className="mt-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {t('cobros.detalle.facturasAplicadas')}
                </span>
                <div className="flex flex-col gap-1.5">
                  {payment.facturas.map(f => (
                    <div key={f.invoice_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{f.numero}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(f.monto_aplicado)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('cobros.detalle.cerrar')}</Button>
          {/* Los 3 botones de acción dependen de `payment` — ocultos por completo mientras carga,
              nunca visibles-pero-deshabilitados (RN1 REQ-475 ya seguía este criterio, acá se
              extiende a los otros 2). */}
          {payment && payment.estado === 'esperando_confirmacion' && (
            <Button variant="accent" onClick={marcarConfirmado} loading={confirmMutation.isPending}>
              <span className="inline-flex items-center gap-1.5"><IcoCheck size={13} />{t('cobros.detalle.marcarConfirmado')}</span>
            </Button>
          )}
          {payment && (
            <>
              <Button variant="secondary" onClick={() => setComprobanteOpen(true)}>
                <span className="inline-flex items-center gap-1.5"><IcoPaperclip size={13} />{t('cobros.detalle.verComprobante')}</span>
              </Button>
              <Button onClick={verRecibo} loading={downloadReceipt.isPending}>
                <span className="inline-flex items-center gap-1.5"><IcoPrinter size={13} />{t('cobros.detalle.verRecibo')}</span>
              </Button>
            </>
          )}
        </div>
      </Card>

      {comprobanteOpen && payment && (
        <VerComprobanteModal paymentId={payment.id} onClose={() => setComprobanteOpen(false)} />
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}
