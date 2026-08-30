import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useLiquidationAgenciesSummary } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * SCRUM-254 (REQ-191) — resumen de agencias de liquidación (liquidada = alcanzó "En aduana",
 * misma definición que Logística — ver PurchaseOrder::hasReachedStage() en el backend).
 *
 * "Situación de pago" (columnas $ por pagar / $ pagado / fechas + KPIs) es carga MANUAL de
 * Compras — las RN1→RN3 del ticket original no están documentadas y no hay modelo de pagos a
 * agencias aprobado (ver nota de alcance en LiquidationAgencyController::class, backend). Mock
 * agregado 2026-07-18 por indicación de Luis en vez de dejarlo vacío.
 */
export default function AgenciesSummaryPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useLiquidationAgenciesSummary(page, perPage)
  const agencies = data?.data ?? []
  const meta = data?.meta
  const kpis = data?.kpis

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('compras:agencies.title')}</h1>
          <p className="text-[12px] text-slate-500">
            {t('compras:agencies.subtitle', { count: meta?.total ?? agencies.length })}
          </p>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {([
            ['pendingBalance', kpis.agencies_with_pending_balance],
            ['totalPending',   fmtMoney(kpis.total_pending_amount)],
            ['totalPaid',      fmtMoney(kpis.total_paid_amount)],
            ['projectsPending', kpis.projects_pending_liquidation],
          ] as const).map(([key, value]) => (
            <Card key={key} variant="panel" className="p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                {t(`compras:agencies.kpis.${key}`)}
              </p>
              <p className="text-lg font-bold text-slate-900">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[12px] text-slate-500 mb-3">{t('compras:agencies.footnote')}</p>

      <Card variant="panel" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.name')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.liquidated')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.pending')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.toPay')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.paid')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.lastPayment')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.nextPayment')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agencies.length === 0 && !isFetching && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('compras:agencies.table.empty')}
                </td>
              </tr>
            )}
            {agencies.map(a => {
              const balance = a.pending_payment_amount - a.paid_amount
              return (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.liquidated_count}</td>
                  <td className="px-4 py-3 text-slate-600">{a.pending_count}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtMoney(a.pending_payment_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtMoney(a.paid_amount)}
                    {balance > 0 && (
                      <span className="ml-1.5 text-[11px] text-amber-700">
                        ({t('compras:agencies.table.balance', { amount: fmtMoney(balance) })})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.last_payment_date ?? t('compras:agencies.table.noDate')}</td>
                  <td className="px-4 py-3 text-slate-600">{a.next_payment_date ?? t('compras:agencies.table.noDate')}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      className="!px-3 !py-1.5 !text-xs"
                      onClick={() => navigate(`/compras/agencias/${a.id}`)}
                    >
                      {t('common:actions.view')}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}
    </div>
  )
}
