import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Plugin } from 'chart.js'
import { Chart as ChartJS, CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import type { ReportPeriod } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoEye, IcoAlertTriangle } from '@/components/icons'
import ReportsConfigPanel from '@/components/ReportsConfigPanel'
import CommissionsPanel from '@/components/CommissionsPanel'

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend)

// REQ-072 (SCRUM-109) — Meta pasó de línea plana a barra al lado de Vendido, y ambos
// valores deben verse siempre en dólares arriba de cada barra, sin depender del hover
// del tooltip. No hay chartjs-plugin-datalabels en package.json y no se agrega una
// dependencia nueva sin verificar compatibilidad (regla dura del proyecto) — un plugin
// inline de Chart.js alcanza y queda local a este <Chart> (pasado por la prop `plugins`,
// no por ChartJS.register, para no afectar otros charts de la app).
const goalsValueLabelsPlugin: Plugin<'bar'> = {
  id: 'goalsValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#475569' // slate-600, legible en light y dark
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    // Cuando Vendido y Meta quedan a una altura parecida (ej. venta casi alcanza la
    // meta) los dos labels de $ caen casi en el mismo Y y el texto queda pegado/
    // ilegible, aunque las barras sean visualmente distintas (hallazgo Pre-QA
    // SCRUM-109, 2026-08-01: "$580$603.28" corrido sin espacio). Se apila
    // verticalmente el segundo label de cada mes cuando cae a menos de un
    // line-height del anterior, en vez de dejar que se dibujen encimados.
    const placedYByIndex = new Map<number, number>()
    const MIN_LABEL_GAP = 14 // ~line-height a font 11px

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex)
      meta.data.forEach((bar, index) => {
        const raw = dataset.data[index]
        if (raw == null) return
        const value = typeof raw === 'number' ? raw : Number(raw)
        if (Number.isNaN(value)) return
        const { x, y } = bar.getProps(['x', 'y'], true)
        let labelY = y - 4
        const prevY = placedYByIndex.get(index)
        if (prevY != null && Math.abs(prevY - labelY) < MIN_LABEL_GAP) {
          labelY = prevY - MIN_LABEL_GAP
        }
        placedYByIndex.set(index, labelY)
        ctx.fillText(`$${value.toLocaleString()}`, x, labelY)
      })
    })

    ctx.restore()
  },
}

const PERIODS: ReportPeriod[] = ['month', 'quarter', 'year']

export default function VentasDisenoReportsPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const canSeeTeam = user?.role === 'management' || user?.role === 'superadmin'
  const canConfigure = usePermission('ventas_diseno.reports.configure')

  const [scope,  setScope]  = useState<'own' | 'team'>('own')
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [showConfig, setShowConfig] = useState(false)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['ventas-diseno-reports-summary', scope, period],
    queryFn:  () => ventasDisenoApi.reports.summary({ scope, period }),
  })

  const { data: settings } = useQuery({
    queryKey: ['ventas-diseno-report-settings'],
    queryFn:  () => ventasDisenoApi.reports.settings.get(),
  })

  // SCRUM-65 — el ícono de ojo de "Mi desempeño" navega acá con #commissions;
  // React Router no hace scroll a un hash por si solo en una SPA, y el panel
  // recien existe en el DOM cuando "summary" ya cargo.
  useEffect(() => {
    if (!summary || location.hash !== '#commissions') return
    document.getElementById('commissions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [summary, location.hash])

  // REQ-072 (SCRUM-109) — el último mes de monthly_history es siempre el mes en
  // curso (ReportsService::metaPanel() construye el historial hacia atrás desde
  // "hoy", el último elemento del loop es el mes actual) — se resalta en ámbar
  // para distinguir venta parcial/no cerrada de los meses ya cerrados. Ámbar
  // (#f59e0b, Tailwind amber-500) ya es el color de "en curso/pendiente" en el
  // resto de la app (mismo archivo: Comprometido/barProjected en Forecast más
  // abajo; también ReceptionBadge "parcial" y el ícono de pendiente en BodegaHomePage).
  const currentMonthIndex = summary ? summary.meta.monthly_history.length - 1 : -1

  const goalsChart = summary ? {
    labels: summary.meta.monthly_history.map(m => m.month),
    datasets: [
      {
        type: 'bar' as const,
        label: t('ventasDiseno:reports.goals.bar'),
        data: summary.meta.monthly_history.map(m => m.amount),
        backgroundColor: summary.meta.monthly_history.map((_, i) => (i === currentMonthIndex ? '#f59e0b' : '#5BA5A0cc')),
        borderColor: summary.meta.monthly_history.map((_, i) => (i === currentMonthIndex ? '#f59e0b' : '#5BA5A0')),
        borderWidth: 1,
        borderRadius: 4,
      },
      // El valor de Meta es único por vendedor (configurado por Gerencia, no varía
      // mes a mes) — se repite igual en los 6 meses, ahora como barra en vez de línea.
      ...(summary.meta.goal_amount != null ? [{
        type: 'bar' as const,
        label: t('ventasDiseno:reports.goals.goal'),
        data: summary.meta.monthly_history.map(() => summary.meta.goal_amount),
        backgroundColor: '#9fc54dcc',
        borderColor: '#9fc54d',
        borderWidth: 1,
        borderRadius: 4,
      }] : []),
    ],
  } : null

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {t('ventasDiseno:reports.title')}
        </h1>
        <div className="flex gap-2">
          {/* SCRUM-741 — habilitado: mismo patrón ya vigente en ClientsPage/PipelinePage
              desde SCRUM-700 (el disabled de SCRUM-711 nunca se quitó acá). */}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:kanban.actions.catalog')}
          </Button>
          {canConfigure && (
            <Button variant="secondary" active={showConfig} activeVariant="primary" onClick={() => setShowConfig(v => !v)}>
              {t('ventasDiseno:reports.config.toggle')}
            </Button>
          )}
        </div>
      </div>

      {canConfigure && showConfig && <ReportsConfigPanel />}

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-3 items-center">
        {canSeeTeam && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <Button
              variant="secondary" active={scope === 'own'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => setScope('own')}
            >
              {t('ventasDiseno:scope.own')}
            </Button>
            <Button
              variant="secondary" active={scope === 'team'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => setScope('team')}
            >
              {t('ventasDiseno:scope.team')}
            </Button>
          </div>
        )}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {PERIODS.map(p => (
            <Button
              key={p} variant="secondary" active={period === p} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => setPeriod(p)}
            >
              {t(`ventasDiseno:reports.period.${p}`)}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading || !summary ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : (
        // SCRUM-720 (Gerencia Test, REQ-072 complemento) — el grid de 2 columnas dejaba
        // huecos cuando una tarjeta quedaba más baja que la otra; cada tarjeta pasa a
        // ocupar el ancho completo en su propia fila (solo layout, sin tocar datos/lógica).
        <div className="flex flex-col gap-3">
          <Card variant="panel" className="p-4">
            <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
              {t('ventasDiseno:reports.goals.title')}
            </div>
            <div className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:reports.goals.subtitle')}</div>
            {goalsChart && (
              <Chart
                type="bar"
                data={goalsChart}
                plugins={[goalsValueLabelsPlugin]}
                options={{
                  responsive: true,
                  // 34 = 20 base + 14 (MIN_LABEL_GAP en goalsValueLabelsPlugin) — cuando el
                  // plugin apila el segundo label de un mes, necesita ese margen extra o el
                  // label apilado queda cortado contra el borde superior del canvas.
                  layout: { padding: { top: 34 } },
                  plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
                  scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } },
                }}
              />
            )}
            {currentMonthIndex >= 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                {t('ventasDiseno:reports.goals.currentMonth')}
              </p>
            )}
            {summary.meta.goal_amount == null && (
              <p className="text-[11px] text-slate-400 mt-2">{t('ventasDiseno:reports.goals.noGoal')}</p>
            )}
          </Card>

          <Card variant="panel" className="p-4">
            <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
              {t('ventasDiseno:reports.bestClients.title')}
            </div>
            <div className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:reports.bestClients.subtitle')}</div>
            {summary.best_clients.length === 0 ? (
              <p className="text-sm text-slate-400">{t('ventasDiseno:reports.bestClients.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.best_clients.map(c => (
                  <li
                    key={`${c.client_type}-${c.client_id}`}
                    onClick={() => navigate(`/ventas-diseno/pipeline?stage=approved&order=value&scope=${scope}`)}
                    className="flex items-center justify-between text-sm cursor-pointer rounded-lg px-1 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="text-slate-700 dark:text-slate-200">{c.client_name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">${c.amount.toLocaleString()}</span>
                      <span title={t('ventasDiseno:reports.bestClients.view')} className="text-slate-400">
                        <IcoEye size={16} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              {t('ventasDiseno:reports.surface.title')}
            </div>
            <div className="text-[12px] text-slate-400 mb-2">{t('ventasDiseno:reports.surface.subtitle')}</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.surface_m2.toLocaleString()} m²
            </div>
          </Card>

          {summary.top_vendors && (
            <Card variant="panel" className="p-4">
              <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
                {t('ventasDiseno:reports.topVendors.title')}
              </div>
              <div className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:reports.topVendors.subtitle')}</div>
              <ul className="flex flex-col gap-2">
                {summary.top_vendors.map(v => (
                  <li key={v.user_id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">
                      {v.user_name}
                      {v.low_sales_alert && settings && (
                        <span
                          className="inline-flex items-center gap-1 ml-2 text-[11px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 rounded-full px-2 py-0.5"
                          title={t('ventasDiseno:reports.topVendors.alert', { months: settings.low_sales_months, threshold: settings.low_sales_threshold.toLocaleString() })}
                        >
                          <IcoAlertTriangle size={12} />
                          {t('ventasDiseno:reports.topVendors.alertBadge', { months: settings.low_sales_months })}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">${v.total_current_month.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {summary.forecast && (
            <Card variant="panel" className="p-4">
              <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
                {t('ventasDiseno:reports.forecast.title')}
              </div>
              <div className="text-[12px] text-slate-400 mb-3">
                {t('ventasDiseno:reports.forecast.probabilityNote', {
                  quote: summary.forecast.quote_probability_percent, proposal: summary.forecast.proposal_probability_percent,
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    {t('ventasDiseno:reports.forecast.bestCase')}
                  </div>
                  <div className="text-lg font-bold text-slate-700 dark:text-slate-200">${summary.forecast.best_case.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400">{t('ventasDiseno:reports.forecast.bestCaseSub')}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-[#5BA5A0]" />
                    {t('ventasDiseno:reports.forecast.weighted')}
                  </div>
                  <div className="text-lg font-bold text-[#3D7E7A]">${summary.forecast.weighted_pipeline.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400">{t('ventasDiseno:reports.forecast.weightedSub')}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {t('ventasDiseno:reports.forecast.committed')}
                  </div>
                  <div className="text-lg font-bold text-amber-600">${summary.forecast.committed.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400">{t('ventasDiseno:reports.forecast.committedSub')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('ventasDiseno:reports.forecast.meta')}</div>
                  {summary.forecast.meta_amount != null ? (
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100">${summary.forecast.meta_amount.toLocaleString()}</div>
                  ) : (
                    <div className="text-[12px] text-slate-400">{t('ventasDiseno:reports.goals.noGoal')}</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('ventasDiseno:reports.forecast.closed')}</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100">${summary.forecast.closed.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400">{t('ventasDiseno:reports.forecast.closedSub')}</div>
                </div>
                {summary.forecast.meta_amount != null && (
                  <div className={`rounded-md px-2 py-1 ${summary.forecast.meta_reached ? 'bg-[#E3F0EE]' : 'bg-red-50 dark:bg-red-950/30'}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-wide ${summary.forecast.meta_reached ? 'text-[#3D7E7A]' : 'text-red-700 dark:text-red-400'}`}>
                      {summary.forecast.meta_reached ? t('ventasDiseno:reports.forecast.reached') : t('ventasDiseno:reports.forecast.remaining')}
                    </div>
                    <div className={`text-base font-bold ${summary.forecast.meta_reached ? 'text-[#3D7E7A]' : 'text-red-700 dark:text-red-400'}`}>
                      {summary.forecast.meta_reached ? '$0' : `$${summary.forecast.remaining?.toLocaleString()}`}
                    </div>
                  </div>
                )}
              </div>

              {summary.forecast.meta_amount != null && (
                <>
                  <div className="text-[11.5px] text-slate-500 mb-1">{t('ventasDiseno:reports.forecast.barClosed')}</div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-1">
                    <div className="h-2 rounded-full bg-[#5BA5A0]" style={{ width: `${Math.min(summary.forecast.pct_closed ?? 0, 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-slate-400 mb-3">{t('ventasDiseno:reports.forecast.pctOfGoal', { pct: summary.forecast.pct_closed })}</div>

                  <div className="text-[11.5px] text-slate-500 mb-1">{t('ventasDiseno:reports.forecast.barProjected')}</div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-1">
                    <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(summary.forecast.pct_projected ?? 0, 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-slate-400 mb-3">{t('ventasDiseno:reports.forecast.pctOfGoal', { pct: summary.forecast.pct_projected })}</div>

                  <p className="text-[12px] text-slate-500 mb-3">
                    {summary.forecast.meta_reached
                      ? t('ventasDiseno:reports.forecast.noteMetaReached')
                      : summary.forecast.pipeline_covers_gap
                        ? t('ventasDiseno:reports.forecast.noteCovers', { amount: summary.forecast.weighted_pipeline.toLocaleString() })
                        : t('ventasDiseno:reports.forecast.noteNotCovers', {
                            amount: summary.forecast.weighted_pipeline.toLocaleString(), remaining: summary.forecast.remaining?.toLocaleString(),
                          })}
                  </p>
                </>
              )}

              <table className="w-full text-left text-sm mt-2">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="pb-1.5">{t('ventasDiseno:reports.forecast.tableStage')}</th>
                    <th className="pb-1.5">{t('ventasDiseno:reports.forecast.tableProjects')}</th>
                    <th className="pb-1.5">{t('ventasDiseno:reports.forecast.tableOpenAmount')}</th>
                    <th className="pb-1.5">{t('ventasDiseno:reports.forecast.tableProbability')}</th>
                    <th className="pb-1.5">{t('ventasDiseno:reports.forecast.tableWeightedAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.forecast.stage_breakdown.map(row => (
                    <tr key={row.stage} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-2">{t(`ventasDiseno:stages.${row.stage}`)}</td>
                      <td className="py-1.5 pr-2">{row.projects}</td>
                      <td className="py-1.5 pr-2">${row.open_amount.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">{row.probability_percent}%</td>
                      <td className="py-1.5 pr-2 font-semibold">${row.weighted_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div id="commissions">
            <CommissionsPanel scope={scope} period={period} />
          </div>
        </div>
      )}
    </>
  )
}
