import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCustomerReturnDetail } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import type { CustomerReturnReason } from '@/types/bodega'

interface Props {
  id: number
  onClose: () => void
}

/**
 * SCRUM-475 (REQ-405) — modal "Ver detalle" (3J). El historial cronológico ya viene armado por el
 * backend (`CustomerReturnDetail.history`) — este componente solo lo pinta, sin recalcular nada a
 * partir de `created_at`/`received_at`/etc, a diferencia del mockup original (que sí lo armaba
 * client-side sobre datos de ejemplo).
 */
export default function CustomerReturnDetailModal({ id, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useCustomerReturnDetail(id)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {data ? t('bodega:returns.detailModal.title', { number: data.order_number }) : t('common:labels.loading')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>
        {data && (
          <p className="text-xs text-slate-400 mb-4">
            {data.customer_name}{data.project ? ` — ${data.project}` : ''}
          </p>
        )}

        {isLoading || !data ? (
          <p className="text-slate-400 text-sm py-6 text-center">{t('common:labels.loading')}</p>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
              {t('bodega:returns.detailModal.productsTitle')}
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <Th>{t('bodega:returns.detailModal.table.product')}</Th>
                    <Th>{t('bodega:returns.detailModal.table.quantity')}</Th>
                    <Th>{t('bodega:returns.detailModal.table.reason')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.products.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 font-medium text-slate-800 dark:text-slate-100">{p.description ?? p.reference ?? '—'}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{p.qty_requested}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-300 text-xs">
                        <ReasonLabel reason={p.reason} detail={p.reason_detail} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
              {t('bodega:returns.detailModal.historyTitle')}
            </p>
            {data.history.length === 0 ? (
              <p className="text-slate-400 text-xs">{t('bodega:returns.detailModal.noHistory')}</p>
            ) : (
              <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
                {data.history.map((entry, i) => (
                  <li key={`${entry.step}-${i}`}>
                    <span>{entry.label}</span>
                    {entry.at && <span className="text-slate-400 text-xs"> — {new Date(entry.at).toLocaleString()}</span>}
                    {entry.by && <span className="text-slate-400 text-xs"> ({entry.by})</span>}
                    {entry.destination_warehouse && (
                      <div className="text-xs text-slate-400 pl-3">
                        {t('bodega:returns.detailModal.history.destinationWarehouse', { warehouse: entry.destination_warehouse })}
                      </div>
                    )}
                    {entry.reason && (
                      <div className="text-xs text-slate-400 pl-3">
                        {t('bodega:returns.detailModal.history.rejectionReason', { reason: entry.reason })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="flex justify-end mt-5">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

export function ReasonLabel({ reason, detail }: { reason: CustomerReturnReason; detail?: string | null }) {
  const { t } = useTranslation('bodega')
  if (reason === 'otra' && detail) return <>{detail}</>
  return <>{t(`returns.reasons.${reason}`)}</>
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
