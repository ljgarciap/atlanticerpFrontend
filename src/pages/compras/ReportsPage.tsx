import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Chart as ChartJS, CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend } from 'chart.js'
import type { Plugin } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import {
  usePurchasedByPeriod, usePurchaseOpportunityReport, useProviderRatingReport, useClaimsReport,
  useInventoryAttentionReport, useLiquidationImportsReport,
} from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoAlertTriangle } from '@/components/icons'
import { formatMoney } from '@/lib/money'
import type { ReportGranularity } from '@/types/compras'

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend)

/**
 * SCRUM-263 (hallazgo de Daniela Amaya 2026-08-10) — el mockup pide el valor $ sobre cada barra;
 * `chart.js` no lo hace de fábrica y no hay `chartjs-plugin-datalabels` en el proyecto todavía
 * (evita sumar una dependencia nueva para un solo gráfico — "Nunca instalar dependencias sin
 * verificar compatibilidad", ver CLAUDE.md raíz). Plugin propio, mínimo, solo para este chart.
 */
const barValueLabelsPlugin: Plugin<'bar'> = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex)
      meta.data.forEach((bar, index) => {
        const raw = dataset.data[index]
        const value = typeof raw === 'number' ? raw : 0
        ctx.save()
        ctx.fillStyle = '#2a2520'
        ctx.font = '600 11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`$${formatMoney(value)}`, bar.x, bar.y - 4)
        ctx.restore()
      })
    })
  },
}

const PERIODS: ReportGranularity[] = ['month', 'quarter', 'year']

/**
 * SCRUM-262→268 (REQ-199→205) — Reportes avanzados de Compras. El selector de período (REQ-199)
 * es un solo estado compartido que controla los 4 paneles period-aware a la vez (no un selector
 * por panel, que era el gap documentado del mockup original). REQ-202 ("Oportunidad de compra")
 * no está — depende de un cambio en Nueva Orden coordinado aparte con QA.
 */
export default function ReportsPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const [period, setPeriod] = useState<ReportGranularity>('month')

  const { data: purchased } = usePurchasedByPeriod(period)
  const { data: opportunity } = usePurchaseOpportunityReport(period)
  const { data: rating } = useProviderRatingReport(period)
  const { data: claims } = useClaimsReport(period)
  const { data: inventory } = useInventoryAttentionReport()
  const { data: liquidation } = useLiquidationImportsReport(period)

  const chartData = purchased ? {
    labels: purchased.buckets.map(b => b.label),
    datasets: [{
      label: t('compras:reports.purchasedByPeriod.title'),
      data: purchased.buckets.map(b => b.total_amount),
      backgroundColor: purchased.buckets.map(b => b.is_current ? '#9fc54d' : '#5BA5A0cc'),
      borderColor: purchased.buckets.map(b => b.is_current ? '#9fc54d' : '#5BA5A0'),
      borderWidth: 1,
      borderRadius: 4,
    }],
  } : null

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900">{t('compras:reports.title')}</h1>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {PERIODS.map(p => (
            <Button
              key={p} variant="secondary" active={period === p} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => setPeriod(p)}
            >
              {t(`compras:reports.period.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card variant="panel" className="p-4">
          <div className="text-[15px] font-bold text-slate-900 mb-1">{t('compras:reports.purchasedByPeriod.title')}</div>
          {chartData && (
            <Chart
              type="bar"
              data={chartData}
              plugins={[barValueLabelsPlugin]}
              options={{
                responsive: true,
                // SCRUM-263 — layout.padding.top deja espacio para que el valor $ dibujado por
                // barValueLabelsPlugin no se corte contra el borde superior del canvas.
                layout: { padding: { top: 20 } },
                plugins: { legend: { display: false } },
                scales: {
                  // SCRUM-263 (rebote de Daniela Amaya 2026-08-12, contradictorio — "horizontales"
                  // en la descripción, "verticales" en el criterio de aceptación; decisión ya
                  // tomada con Luis en el daily 2026-08-14, ver memoria del batch: sacar AMBAS
                  // líneas de grilla, apoyándose en `barValueLabelsPlugin` (valor $ sobre cada
                  // barra) para no perder la lectura de montos que daban las horizontales del eje Y.
                  y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { display: false } },
                  x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                },
              }}
            />
          )}
        </Card>

        <Card variant="panel" className="p-4">
          <div className="text-[15px] font-bold text-slate-900 mb-1">{t('compras:reports.opportunity.title')}</div>
          {opportunity && opportunity.classified_orders > 0 ? (
            <>
              <div className="flex h-4 rounded-full overflow-hidden mb-3 mt-2">
                <div style={{ width: `${opportunity.a_tiempo_percent ?? 0}%` }} className="bg-[#9fc54d]" title={t('compras:reports.opportunity.aTiempo') ?? ''} />
                <div style={{ width: `${opportunity.a_demanda_percent ?? 0}%` }} className="bg-amber-400" title={t('compras:reports.opportunity.aDemanda') ?? ''} />
                <div style={{ width: `${opportunity.tarde_percent ?? 0}%` }} className="bg-red-500" title={t('compras:reports.opportunity.tarde') ?? ''} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                <div>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#9fc54d] mr-1" />
                  {t('compras:reports.opportunity.aTiempo')}: {opportunity.a_tiempo_percent}%
                </div>
                <div>
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
                  {t('compras:reports.opportunity.aDemanda')}: {opportunity.a_demanda_percent}%
                </div>
                <div>
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
                  {t('compras:reports.opportunity.tarde')}: {opportunity.tarde_percent}%
                </div>
              </div>
              {opportunity.show_warning && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs flex items-center gap-1.5">
                  <IcoAlertTriangle size={13} className="text-amber-500" />
                  {t('compras:reports.opportunity.warning')}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t('compras:reports.opportunity.empty')}</p>
          )}
        </Card>

        <Card variant="panel" className="p-4">
          <div className="text-[15px] font-bold text-slate-900 mb-1">{t('compras:reports.claims.title')}</div>
          {claims && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.status.en_revision')}</p>
                  <p className="text-lg font-bold text-slate-800">{claims.open_count}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.status.resuelto')}</p>
                  <p className="text-lg font-bold text-slate-800">{claims.resolved_count}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.claims.rate')}</p>
                  <p className="text-lg font-bold text-slate-800">{claims.claim_rate !== null ? `${claims.claim_rate}%` : '—'}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('compras:reports.claims.ranking')}</p>
              <ul className="flex flex-col gap-1">
                {claims.provider_ranking.slice(0, 5).map(r => (
                  <li key={r.provider_id} className="flex justify-between text-sm">
                    <span>{r.provider_name}</span>
                    <span className="font-semibold">{r.claims_count}</span>
                  </li>
                ))}
                {claims.provider_ranking.length === 0 && (
                  <li className="text-sm text-slate-400">{t('compras:reports.empty')}</li>
                )}
              </ul>
            </>
          )}
        </Card>

        <Card variant="panel" className="p-4">
          <div className="text-[15px] font-bold text-slate-900 mb-2">{t('compras:reports.providerRating.title')}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:orders.table.provider')}</th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.providerRating.purchased')}</th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.providerRating.onTime')}</th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.providerRating.complete')}</th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.providerRating.claims')}</th>
                <th className="text-left py-1.5 text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.providerRating.rating')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rating?.data ?? []).slice(0, 6).map(r => (
                <tr key={r.provider_id}>
                  <td className="py-1.5">{r.provider_name}</td>
                  <td className="py-1.5">${r.purchased_amount.toFixed(2)}</td>
                  <td className="py-1.5">{r.on_time_percent !== null ? `${r.on_time_percent}%` : '—'}</td>
                  {/* SCRUM-264 — complete_percent siempre null hoy (Ingreso de Mercancía sin
                      construir, ver docblock de Provider::completePercent()); nunca un número
                      inventado. */}
                  <td className="py-1.5">{r.complete_percent !== null ? `${r.complete_percent}%` : '—'}</td>
                  <td className="py-1.5">{r.claims_count}</td>
                  <td className="py-1.5">{r.rating ?? t('compras:reports.providerRating.unrated')}</td>
                </tr>
              ))}
              {(rating?.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-400">{t('compras:reports.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[15px] font-bold text-slate-900">{t('compras:reports.inventory.title')}</div>
          </div>
          {inventory && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.inventory.total')}</p>
                <p className="text-lg font-bold text-slate-800">{inventory.total_products}</p>
              </div>
              <button
                onClick={() => navigate('/inventario?chip=en_atencion')}
                className="text-left"
              >
                <p className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <IcoAlertTriangle size={11} className="text-amber-500" /> {t('compras:reports.inventory.attention')}
                </p>
                <p className="text-lg font-bold text-amber-600 hover:underline">{inventory.in_attention}</p>
              </button>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.inventory.lowStock')}</p>
                <p className="text-lg font-bold text-slate-800">{inventory.low_stock}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.inventory.outOfStock')}</p>
                <p className="text-lg font-bold text-slate-800">{inventory.out_of_stock}</p>
              </div>
            </div>
          )}
        </Card>

        <Card variant="panel" className="p-4">
          <div className="text-[15px] font-bold text-slate-900">{t('compras:reports.liquidation.title')}</div>
          <p className="text-xs text-slate-500 mb-3">{t('compras:reports.liquidation.subtitle')}</p>
          {liquidation && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.liquidation.liquidated')}</p>
                  <p className="text-lg font-bold text-slate-800">{liquidation.liquidated_count}</p>
                  <p className="text-[11px] text-slate-400">{t('compras:reports.liquidation.liquidatedHint')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.liquidation.porLiquidar')}</p>
                  <p className="text-lg font-bold text-slate-800">{liquidation.por_liquidar_count}</p>
                  <p className="text-[11px] text-slate-400">{t('compras:reports.liquidation.porLiquidarHint')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:reports.liquidation.percent')}</p>
                  <p className="text-lg font-bold text-slate-800">{liquidation.liquidated_percent !== null ? `${liquidation.liquidated_percent}%` : '—'}</p>
                  <p className="text-[11px] text-slate-400">{t('compras:reports.liquidation.percentHint')}</p>
                </div>
              </div>

              {/* SCRUM-268 (corrección de Daniela Amaya) — barra de comparación visual Liquidados
                  vs Por liquidar, proporcional; ambos en 0 muestra la barra vacía (gris) en vez de
                  dividir por cero. */}
              {(() => {
                const total = liquidation.liquidated_count + liquidation.por_liquidar_count
                const liquidatedPct = total > 0 ? (liquidation.liquidated_count / total) * 100 : 0
                return (
                  <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex mb-4" role="img" aria-label={t('compras:reports.liquidation.title') ?? ''}>
                    {total > 0 ? (
                      <>
                        <div className="h-full bg-primary" style={{ width: `${liquidatedPct}%` }} />
                        <div className="h-full bg-amber-500" style={{ width: `${100 - liquidatedPct}%` }} />
                      </>
                    ) : null}
                  </div>
                )
              })()}

              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('compras:reports.liquidation.ranking')}</p>
              <ul className="flex flex-col gap-2">
                {liquidation.agency_ranking.slice(0, 5).map((r, i) => {
                  const maxCount = liquidation.agency_ranking[0]?.liquidated_count ?? 0
                  const barPct = maxCount > 0 ? (r.liquidated_count / maxCount) * 100 : 0
                  return (
                    <li key={r.agency_id} className="flex items-center gap-2 text-sm">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{r.agency_name}</span>
                      <span className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                        <span className="block h-full bg-primary" style={{ width: `${barPct}%` }} />
                      </span>
                      <span className="font-semibold w-4 text-right shrink-0">{r.liquidated_count}</span>
                    </li>
                  )
                })}
                {liquidation.agency_ranking.length === 0 && (
                  <li className="text-sm text-slate-400">{t('compras:reports.empty')}</li>
                )}
              </ul>
              <p className="text-[11px] text-slate-400 mt-3">{t('compras:reports.liquidation.footnote')}</p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
