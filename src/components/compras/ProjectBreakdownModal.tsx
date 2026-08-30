import { useTranslation } from 'react-i18next'
import { usePurchaseOrder } from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  orderId: number
  onClose: () => void
}

/** SCRUM-203 — desglose por línea de a qué proyecto corresponde cada producto de la orden,
 * para el caso de más de un proyecto (antes el link reusaba el detalle completo de la orden). */
export default function ProjectBreakdownModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const { data: order, isLoading } = usePurchaseOrder(orderId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <Card variant="modal" className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-800">
            {t('compras:orders.projectBreakdown.title', { id: orderId })}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IcoClose size={16} />
          </button>
        </div>

        {isLoading || !order ? (
          <div className="text-slate-400 text-sm">{t('common:labels.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">
                  {t('compras:orders.projectBreakdown.product')}
                </th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">
                  {t('compras:orders.projectBreakdown.quantity')}
                </th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">
                  {t('compras:orders.projectBreakdown.project')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map(l => (
                <tr key={l.id}>
                  <td className="py-1.5">
                    <div className="font-medium text-slate-800">{l.description}</div>
                    <div className="text-xs text-slate-400">{l.reference}</div>
                  </td>
                  <td className="py-1.5 text-slate-600">{l.quantity}</td>
                  <td className="py-1.5 text-slate-600">
                    {l.sales_project_name ?? (
                      <span className="text-slate-400">{t('compras:newOrder.lines.projectNone')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
