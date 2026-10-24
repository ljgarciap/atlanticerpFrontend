import { useTranslation } from 'react-i18next'
import type { OrderCard } from '@/types/bodega'
import { ORDER_STAGE_COLORS } from '@/types/bodega'
import { formatDateShort } from '@/utils/dates'

interface Props {
  orders:       OrderCard[]
  onViewDetail: (orderId: number) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return formatDateShort(iso)
}

/** SCRUM-860 — vista Tabla del módulo Pedidos de Bodega, mismo patrón que
 * `components/servicios/TicketTable.tsx`: alterna con el tablero existente sobre el mismo array
 * `cards` ya filtrado (ver `PedidosPage.tsx`), sin endpoint nuevo. */
export default function OrderTable({ orders, onViewDetail }: Props) {
  const { t } = useTranslation('bodega')

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm">{t('pedidos.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2">{t('pedidos.table.columns.orderNumber')}</th>
              <th className="px-3 py-2">{t('pedidos.table.columns.client')}</th>
              <th className="px-3 py-2">{t('pedidos.table.columns.seller')}</th>
              <th className="px-3 py-2">{t('pedidos.table.columns.assistant')}</th>
              <th className="px-3 py-2">{t('pedidos.table.columns.deliveryDate')}</th>
              <th className="px-3 py-2">{t('pedidos.table.columns.stage')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr
                key={order.id}
                onClick={() => onViewDetail(order.id)}
                className="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {order.order_number}
                </td>
                <td className="px-3 py-2.5">{order.cliente ?? '—'}</td>
                <td className="px-3 py-2.5">{order.vendedor ?? '—'}</td>
                <td className="px-3 py-2.5">{order.asistente ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(order.fecha_entrega_comprometida)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900"
                    style={{ color: ORDER_STAGE_COLORS[order.stage] }}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: ORDER_STAGE_COLORS[order.stage] }} />
                    {t(`pedidos.stages.${order.stage}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
