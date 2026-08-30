import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoAlertTriangle, IcoCheck } from '@/components/icons'

interface Props {
  orderId: number
  onClose: () => void
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`
}

/**
 * SCRUM-703→710 (REQ-628, Epic CRM Batch F) — detalle de un Pedido: desglose por producto
 * comparando margen cotizado vs. facturado, fila TOTAL y alerta si el margen bajó/mejoró.
 * Mismo mecanismo de modal que ClientDetailModal/CalendarModal (overlay fijo + Card variant="modal").
 */
export default function PedidoDetailModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  const { data: order, isLoading } = useQuery({
    queryKey: ['ventas-diseno-order', orderId],
    queryFn:  () => ventasDisenoApi.orders.get(orderId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-6xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:orders.detail.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto p-5">
          {isLoading || !order ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="mb-4">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {order.folio} — {order.master_client?.name ?? '—'}
                </div>
                <div className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('ventasDiseno:orders.detail.headerSub', {
                    project: order.sales_project?.name ?? '—',
                    date:    new Date(order.approved_at).toLocaleDateString(),
                    owner:   order.owner.name,
                  })}
                </div>
              </div>

              {order.estado === 'bajo' && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 mb-4 text-[12.5px] font-semibold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                  <IcoAlertTriangle size={15} className="shrink-0 mt-0.5" />
                  {t('ventasDiseno:orders.detail.alertDrop', {
                    quoted: fmtPct(order.quoted_margin), invoiced: fmtPct(order.invoiced_margin),
                  })}
                </div>
              )}
              {order.estado === 'mejoro' && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 mb-4 text-[12.5px] font-semibold bg-[#E3F0EE] dark:bg-slate-900 text-[#3D7E7A] dark:text-[#5BA5A0]">
                  <IcoCheck size={15} className="shrink-0 mt-0.5" />
                  {t('ventasDiseno:orders.detail.alertImprove', {
                    quoted: fmtPct(order.quoted_margin), invoiced: fmtPct(order.invoiced_margin),
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <Card variant="panel" className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.detail.amount')}</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{fmtMoney(order.amount)}</div>
                </Card>
                <Card variant="panel" className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.detail.quotedMarginTotal')}</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{fmtPct(order.quoted_margin)}</div>
                </Card>
                <Card variant="panel" className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.detail.invoicedMarginTotal')}</div>
                  <div className={
                    'text-xl font-bold ' +
                    (order.estado === 'bajo' ? 'text-red-600 dark:text-red-400' : order.estado === 'mejoro' ? 'text-[#3D7E7A] dark:text-[#5BA5A0]' : 'text-slate-900 dark:text-slate-100')
                  }>
                    {order.pending_count === order.item_count
                      ? t('ventasDiseno:orders.detail.table.pendingValue')
                      : `${fmtPct(order.invoiced_margin)}${order.invoiced_partial ? ` ${t('ventasDiseno:orders.table.partialSuffix')}` : ''}`}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-1">
                    {order.pending_count > 0
                      ? t('ventasDiseno:orders.detail.pendingCount', { count: order.pending_count, total: order.item_count })
                      : t('ventasDiseno:orders.detail.allInvoiced')}
                  </div>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                <table className="w-full text-left text-sm min-w-[900px]">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-3 py-2">{t('ventasDiseno:orders.detail.table.reference')}</th>
                      <th className="px-3 py-2">{t('ventasDiseno:orders.detail.table.description')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.quantity')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.unitPrice')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.quotedCost')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.quotedMargin')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.invoicedCost')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.invoicedMargin')}</th>
                      <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.detail.table.diff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="px-3 py-2">
                          {item.reference}
                          {item.brand && <div className="text-[10px] text-slate-400">{item.brand}</div>}
                        </td>
                        <td className="px-3 py-2 max-w-[220px] whitespace-normal">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right">{item.quoted_cost !== null ? fmtMoney(item.quoted_cost) : t('ventasDiseno:orders.detail.table.pendingValue')}</td>
                        <td className="px-3 py-2 text-right">{fmtPct(item.quoted_margin)}</td>
                        <td className="px-3 py-2 text-right">
                          {item.pending_purchase
                            ? <span className="text-slate-400 italic">{t('ventasDiseno:orders.detail.table.pendingValue')}</span>
                            : fmtMoney(item.invoiced_cost as number)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.pending_purchase ? t('ventasDiseno:orders.detail.table.pendingValue') : fmtPct(item.invoiced_margin)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.pending_purchase ? (
                            <span className="text-slate-400 italic">{t('ventasDiseno:orders.detail.table.pending')}</span>
                          ) : item.margin_diff_pts === null || Math.abs(item.margin_diff_pts) <= 0.05 ? (
                            <span className="text-slate-400">{t('ventasDiseno:orders.detail.table.noVariance')}</span>
                          ) : (
                            <span className={item.margin_diff_pts < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[#3D7E7A] dark:text-[#5BA5A0] font-semibold'}>
                              {item.margin_diff_pts > 0 ? '+' : ''}{item.margin_diff_pts.toFixed(1)} pts
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold bg-slate-50 dark:bg-slate-800/50">
                      <td className="px-3 py-2" colSpan={2}>{t('ventasDiseno:orders.detail.table.total')}</td>
                      <td className="px-3 py-2 text-right">{order.items.reduce((s, it) => s + it.quantity, 0)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(order.amount)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(order.quoted_cost_total)}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(order.quoted_margin)}</td>
                      <td className="px-3 py-2 text-right">
                        {order.pending_count === order.item_count
                          ? t('ventasDiseno:orders.detail.table.pendingValue')
                          : <>{fmtMoney(order.invoiced_cost_total)}{order.invoiced_partial && <span className="font-normal italic text-slate-400"> {t('ventasDiseno:orders.table.partialSuffix')}</span>}</>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {order.pending_count === order.item_count
                          ? t('ventasDiseno:orders.detail.table.pendingValue')
                          : `${fmtPct(order.invoiced_margin)}${order.invoiced_partial ? ` ${t('ventasDiseno:orders.table.partialSuffix')}` : ''}`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {order.pending_count === order.item_count ? t('ventasDiseno:orders.detail.table.pendingValue')
                          : !order.invoiced_partial && order.quoted_margin !== null && order.invoiced_margin !== null
                          ? (Math.abs(order.invoiced_margin - order.quoted_margin) <= 0.05
                            ? t('ventasDiseno:orders.detail.table.noVariance')
                            : <span className={order.invoiced_margin < order.quoted_margin ? 'text-red-600 dark:text-red-400' : 'text-[#3D7E7A] dark:text-[#5BA5A0]'}>
                                {order.invoiced_margin > order.quoted_margin ? '+' : ''}{(order.invoiced_margin - order.quoted_margin).toFixed(1)} pts
                              </span>)
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
