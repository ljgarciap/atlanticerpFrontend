import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { OrderRow, OrderStatus } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { usePermission } from '@/hooks/usePermission'
import PedidoDetailModal from '@/components/PedidoDetailModal'
import OrdersSettingsPanel from '@/components/OrdersSettingsPanel'

const STATUSES: OrderStatus[] = ['pendiente', 'igual', 'bajo', 'mejoro']

const STATUS_CLASSES: Record<OrderStatus, string> = {
  pendiente: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  igual:     'bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-900 dark:text-[#5BA5A0]',
  bajo:      'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  mejoro:    'bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-900 dark:text-[#5BA5A0]',
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function monthName(mes: string): string {
  const [y, m] = mes.split('-')
  const label = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][Number(m)] ?? mes
  return `${label} ${y}`
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`
}

function invoicedMarginCell(row: OrderRow, t: (key: string) => string): string {
  if (row.estado === 'pendiente') return t('ventasDiseno:orders.table.pendingValue')
  return row.invoiced_partial ? `${fmtPct(row.invoiced_margin)} ${t('ventasDiseno:orders.table.partialSuffix')}` : fmtPct(row.invoiced_margin)
}

/**
 * SCRUM-703→710 (REQ-623→630, Epic CRM Batch F) — "Pedidos": cotizaciones aprobadas con
 * comparación de margen cotizado vs. facturado. Reemplaza el placeholder de Batch A. Sin
 * selector Mías/Equipo (REQ-629 RN4) — el backend ya resuelve el alcance según el perfil.
 */
export default function VentasDisenoPedidosPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const canConfigureThreshold = usePermission('ventas_diseno.pricing.configure')

  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<OrderStatus | ''>('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  // SCRUM-166 RN4 (Gerencia → "Monto aprobado del mes"): llega con ?mes=YYYY-MM.
  // /ventas-diseno/orders no tiene filtro de fecha — se filtra client-side por
  // `approved_at`, mismo criterio que QuotesListPage.tsx (SCRUM-166 RN3).
  const [searchParams] = useSearchParams()
  const [mes] = useState<string | null>(() => searchParams.get('mes'))

  const { data: result, isLoading } = useQuery({
    queryKey: ['ventas-diseno-orders', search, estado, page, perPage, mes],
    queryFn:  () => ventasDisenoApi.orders.list({
      search: search || undefined, estado: estado || undefined,
      page: mes ? 1 : page, per_page: mes ? 'all' : perPage,
    }),
  })

  const summary = result?.summary
  const rows    = mes ? (result?.data ?? []).filter(r => r.approved_at.startsWith(mes)) : (result?.data ?? [])

  function clearFilters() {
    setSearch('')
    setEstado('')
    setPage(1)
  }

  return (
    <>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:orders.title')}
          </h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('ventasDiseno:orders.subtitle')}
          </p>
          {mes && (
            <p className="text-xs text-slate-400 mt-0.5">Filtrado por {monthName(mes)}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canConfigureThreshold && (
            <Button
              variant="secondary" active={showSettings} activeVariant="primary"
              onClick={() => setShowSettings(v => !v)}
            >
              {t('ventasDiseno:orders.settings.toggle')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:orders.actions.catalog')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/quotes-list')}>
            {t('ventasDiseno:orders.actions.viewQuotes')}
          </Button>
        </div>
      </div>

      {canConfigureThreshold && showSettings && <OrdersSettingsPanel />}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.summary.total')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{summary.total_orders}</div>
            <div className="text-[10.5px] text-slate-400 mt-1">{t('ventasDiseno:orders.summary.totalSub')}</div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.summary.variance')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{summary.with_margin_variance}</div>
            <div className="text-[10.5px] text-slate-400 mt-1">{t('ventasDiseno:orders.summary.varianceSub')}</div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.summary.quotedAvg')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{fmtPct(summary.avg_quoted_margin)}</div>
            <div className="text-[10.5px] text-slate-400 mt-1">{t('ventasDiseno:orders.summary.quotedAvgSub')}</div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:orders.summary.invoicedAvg')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {summary.avg_invoiced_margin === null ? t('ventasDiseno:orders.summary.invoicedAvgEmpty') : fmtPct(summary.avg_invoiced_margin)}
            </div>
            <div className="text-[10.5px] text-slate-400 mt-1">
              {t('ventasDiseno:orders.summary.invoicedAvgSub', { count: summary.fully_invoiced_count, total: summary.total_orders })}
            </div>
          </Card>
        </div>
      )}

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text" placeholder={t('ventasDiseno:orders.filters.searchPlaceholder')}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <select
          value={estado} onChange={e => { setEstado(e.target.value as OrderStatus | ''); setPage(1) }}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        >
          <option value="">{t('ventasDiseno:orders.filters.allStatuses')}</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{t(`ventasDiseno:orders.status.${s}`)}</option>
          ))}
        </select>
        {(search || estado) && (
          <Button variant="secondary" onClick={clearFilters}>{t('ventasDiseno:orders.filters.clear')}</Button>
        )}
      </Card>

      {result?.fuzzy && (
        <div className="mb-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
          {t('ventasDiseno:orders.filters.approximate')}
        </div>
      )}

      <Card variant="panel" className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:orders.table.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.folio')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.masterClient')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.project')}</th>
                  <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.table.amount')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.approvedAt')}</th>
                  <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.table.quotedMargin')}</th>
                  <th className="px-3 py-2 text-right">{t('ventasDiseno:orders.table.invoicedMargin')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.status')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:orders.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">{row.folio ?? '—'}</td>
                    <td className="px-3 py-2">{row.master_client?.name ?? '—'}</td>
                    <td className="px-3 py-2">{row.sales_project?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtMoney(row.amount)}</td>
                    <td className="px-3 py-2">{new Date(row.approved_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">{fmtPct(row.quoted_margin)}</td>
                    <td className="px-3 py-2 text-right">{invoicedMarginCell(row, t)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_CLASSES[row.estado]}`}>
                        {t(`ventasDiseno:orders.status.${row.estado}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setDetailId(row.id)}
                        className="text-[11.5px] font-semibold text-[#3D7E7A] bg-[#E3F0EE] dark:bg-slate-900 dark:text-[#5BA5A0] rounded-lg px-3 py-1.5"
                      >
                        {t('ventasDiseno:orders.table.viewDetail')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {result?.meta && !mes && (
        <Pagination
          meta={result.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}

      {detailId !== null && (
        <PedidoDetailModal orderId={detailId} onClose={() => setDetailId(null)} />
      )}
    </>
  )
}
