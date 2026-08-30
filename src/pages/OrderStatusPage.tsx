import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useOrderStatusList } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft } from '@/components/icons'
import OrderStatusDetailModal from '@/components/OrderStatusDetailModal'

/**
 * Batch A4 (SCRUM-407→413, REQ-337→343) — pantalla "Status de Pedidos". Solo lectura para todos
 * los perfiles, compartida entre Bodega (ve todos los pedidos) y Ventas & Diseño (ve solo los
 * propios) — el backend (`GET /bodega/orders/status`) ya aplica ese filtro por rol, el frontend
 * no lo replica ni agrega ningún gate de permiso extra acá.
 *
 * Intencionalmente NO está en el Sidebar (`Sidebar.tsx`) — se entra solo desde el botón "Status
 * de pedidos" del encabezado de `PedidosPage`.
 */
export default function OrderStatusPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const { data, isLoading } = useOrderStatusList(search.trim() || undefined)
  const rows = data?.data ?? []

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:orderStatusPage.title')}</h1>
          <p className="text-[12px] text-slate-500" data-testid="order-status-subtitle">
            {t('bodega:orderStatusPage.subtitle', { count: data?.total ?? 0 })}
          </p>
        </div>
        {/* REQ-407 — volver al tablero de Pedidos. */}
        <Button
          variant="secondary"
          onClick={() => navigate('/bodega/pedidos')}
          className="!flex !items-center !gap-1.5"
        >
          <IcoChevronLeft size={14} /> {t('bodega:orderStatusPage.backToOrders')}
        </Button>
      </div>

      <Card variant="panel" className="p-3 mb-3">
        <input
          type="text"
          placeholder={t('bodega:orderStatusPage.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-full sm:max-w-sm focus:outline-none focus:border-primary"
        />
      </Card>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <Th>{t('bodega:orderStatusPage.table.orderNumber')}</Th>
              <Th>{t('bodega:orderStatusPage.table.quoteNumber')}</Th>
              <Th>{t('bodega:orderStatusPage.table.subclient')}</Th>
              <Th>{t('bodega:orderStatusPage.table.orderDate')}</Th>
              <Th>{t('bodega:orderStatusPage.table.seller')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('common:labels.loading')}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('bodega:orderStatusPage.empty')}</td>
              </tr>
            ) : (
              rows.map(row => (
                <tr
                  key={row.order_id}
                  onClick={() => setDetailOrderId(row.order_id)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  data-testid={`order-status-row-${row.order_id}`}
                >
                  <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{row.order_number}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.quote_number ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.subcliente ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.fecha_pedido ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.vendedor ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {detailOrderId !== null && (
        <OrderStatusDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} />
      )}
    </>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
