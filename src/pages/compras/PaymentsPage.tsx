import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePurchaseOrders } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { formatMoney } from '@/lib/money'

type PaymentStatusFilter = 'all' | 'sin_enviar' | 'por_pagar' | 'parcial' | 'completo'
const PAYMENT_STATUS_CHIPS: PaymentStatusFilter[] = ['all', 'sin_enviar', 'por_pagar', 'parcial', 'completo']

/**
 * SCRUM-250 (REQ-187, hallazgo de Daniela Amaya 2026-08-09) — Pagos a Proveedores. Solo órdenes
 * que todavía no llegan a "Ordenado" (`payment_pending=1`, ver PurchaseOrderController::index()),
 * comportamiento ya validado por QA, sin cambios en este batch.
 *
 * Los "5 indicadores (KPIs)" que el ticket original pedía quedaron deliberadamente afuera en la
 * primera pasada (sin RN documentadas) — Daniela los definió con precisión en su comentario del
 * 2026-08-09, ya implementados acá (`payment_kpis` del backend, calculado sobre el universo
 * completo, no la página visible).
 */
export default function PaymentsPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = usePurchaseOrders({
    payment_pending: true,
    payment_status: statusFilter === 'all' ? undefined : statusFilter,
    search: query || undefined,
    provider_id: providerId === '' ? undefined : providerId,
    page, per_page: perPage,
  })
  const orders = data?.data ?? []
  const meta = data?.meta
  const kpis = data?.payment_kpis
  const providers = data?.filters.providers ?? []

  const hasActiveFilters = statusFilter !== 'all' || search !== '' || query !== '' || providerId !== ''
  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleClearFilters = () => {
    setStatusFilter('all'); setSearch(''); setQuery(''); setProviderId(''); setPage(1)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('compras:payments.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('compras:payments.subtitle', { count: meta?.total ?? 0 })}</p>
        </div>
      </div>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:payments.kpis.totalPending')}</p>
          <p className="text-xl font-bold text-slate-800">${formatMoney(kpis?.total_pending_balance ?? 0)}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:payments.kpis.sinEnviar')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.sin_enviar ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:payments.kpis.porPagar')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.por_pagar ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:payments.kpis.parcial')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.parcial ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:payments.kpis.completo')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.completo ?? 0}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:payments.filters.searchPlaceholder') ?? ''}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        <select
          value={providerId}
          onChange={e => { setProviderId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">{t('compras:payments.filters.allProviders')}</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {PAYMENT_STATUS_CHIPS.map(s => (
          <Button
            key={s} variant="outline" active={statusFilter === s}
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setStatusFilter(s); setPage(1) }}
          >
            {s === 'all' ? t('compras:payments.filters.all') : t(`compras:payments.chips.${s}`)}
          </Button>
        ))}
        {hasActiveFilters && (
          <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={handleClearFilters}>
            {t('compras:payments.filters.clear')}
          </Button>
        )}
      </div>

      <Card variant="panel" className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.id')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:orders.table.provider')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.orderStatus')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.orderAmount')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.amountToPay')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.paid')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.balance')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:orders.detail.payments.status')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:payments.table.responsible')}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:orders.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 && !isFetching && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">{t('compras:payments.empty')}</td>
              </tr>
            )}
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">#{o.id}</td>
                <td className="px-4 py-3 text-slate-600">{o.provider_name}</td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:orders.status.${o.status}`)}</td>
                <td className="px-4 py-3 text-slate-600">${formatMoney(o.total_amount)}</td>
                {/* "Monto a pagar" -- mismo valor que "Monto de la orden" (total_amount): no hay
                    ningún otro campo en el modelo que represente un "monto a pagar" distinto del
                    total de la orden. Documentado como posible ambigüedad en el comentario de
                    Jira para que Daniela/Luis confirmen si debían ser 2 cifras distintas. */}
                <td className="px-4 py-3 text-slate-600">${formatMoney(o.total_amount)}</td>
                <td className="px-4 py-3 text-slate-600">${formatMoney(o.paid_amount)}</td>
                <td className="px-4 py-3 text-slate-600">${formatMoney(o.total_amount - o.paid_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:orders.detail.payments.statusValue.${o.payment_status}`)}</td>
                <td className="px-4 py-3 text-slate-600">{o.created_by_name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => navigate(`/compras/ordenes/${o.id}`)}>
                    {t('common:actions.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {meta && (
        <Pagination meta={meta} perPage={perPage} onPageChange={setPage} onPerPageChange={pp => { setPerPage(pp); setPage(1) }} />
      )}
    </div>
  )
}
