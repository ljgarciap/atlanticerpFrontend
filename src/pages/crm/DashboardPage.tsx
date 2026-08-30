import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Chart as ChartJS, CategoryScale, LinearScale, BarController, BarElement, ArcElement, DoughnutController, Tooltip, Legend } from 'chart.js'
import type { Plugin, ChartEvent, ActiveElement } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useToastStore } from '@/store/toastStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoBarChart, IcoDonutChart } from '@/components/icons'
import DashboardAlertListModal from '@/components/DashboardAlertListModal'

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, ArcElement, DoughnutController, Tooltip, Legend)

// REQ-607: solo 3 categorías, primeras 3 posiciones categóricas del sistema — únicas 3 que
// pasan la validación de pares completos (all-pairs) en luz y oscuro (ver skill dataviz).
const TAG_COLORS: Record<'design' | 'quote' | 'both', string> = {
  design: '#2a78d6',
  quote:  '#eb6834',
  both:   '#1baf7a',
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// REQ-606 RN3 (SCRUM-686) — número exacto de proyectos sobre cada barra, además de la altura.
// Plugin propio en vez de chartjs-plugin-datalabels: un solo caso de uso, no amerita dependencia nueva.
const barCountLabelsPlugin: Plugin<'bar'> = {
  id: 'barCountLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    ctx.save()
    ctx.fillStyle = '#64748b'
    ctx.font = '600 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    meta.data.forEach((bar, i) => {
      const value = chart.data.datasets[0].data[i]
      ctx.fillText(String(value), bar.x, bar.y - 4)
    })
    ctx.restore()
  },
}

// SCRUM-684→689 (REQ-604→609, Batch C) — Dashboard CRM, exclusivo de Gerencia (gate de ruta
// en App.tsx). Siempre lee el equipo completo, sin selector Mío/Equipo (REQ-609 RN2/RN3).
export default function CrmDashboardPage() {
  const { t: tCrm }    = useTranslation('crm')
  const { t: tVd }     = useTranslation('ventasDiseno')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const showToast = useToastStore(s => s.show)

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['crm-dashboard-summary'],
    queryFn:  () => ventasDisenoApi.dashboard.summary(),
  })

  // SCRUM-796 (secc. 3/4) — "Ver más" de cada alerta abre el modal con la lista completa;
  // solo uno a la vez, nunca se solapan.
  const [alertModal, setAlertModal] = useState<'overdue' | 'cold' | null>(null)

  const remindMutation = useMutation({
    mutationFn: () => ventasDisenoApi.dashboard.remind(),
    onSuccess: result => {
      // Hallazgo de Pre-QA (2026-07-31): el backend ahora es idempotente por día/responsable
      // (antes, presionar el botón dos veces mandaba dos emails reales duplicados al mismo
      // vendedor). Si ya se le recordó a todos hoy, `notified` viene vacío/ausente y el
      // backend manda `message` en su lugar — mostrarlo tal cual en vez de un resumen vacío.
      if (!result.notified || result.notified.length === 0) {
        showToast(result.message ?? tCrm('dashboard.remindAlreadySent'))
        return
      }
      const summaryText = result.notified.map(n => `${n.owner_name} (${n.projects_count})`).join(', ')
      showToast(tCrm('dashboard.remindSuccess', { summary: summaryText }))
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      showToast(message ?? tCrm('dashboard.remindError'), 'error')
    },
  })

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-12 text-center">{tCommon('loading')}</div>
  }

  if (isError || !summary) {
    return <div className="text-sm text-red-500 py-12 text-center">{tCrm('dashboard.loadError')}</div>
  }

  const barData = {
    labels: PIPELINE_STAGES.map(s => tVd(`stages.${s.id}`)),
    datasets: [{
      label: tCrm('dashboard.byStage'),
      data: PIPELINE_STAGES.map(s => summary.stage_counts[s.id]),
      backgroundColor: PIPELINE_STAGES.map(s => s.color),
      borderRadius: 4,
      minBarLength: 4,
    }],
  }

  // SCRUM-796 (secc. 1.1/1.2) — mismo destino/filtro que las tarjetas de indicadores.
  function goToStage(_event: ChartEvent, elements: ActiveElement[]): void {
    if (elements.length === 0) return
    const stage = PIPELINE_STAGES[elements[0].index]
    if (stage) navigate(`/ventas-diseno/pipeline?stage=${stage.id}`)
  }

  const tagEntries: ('design' | 'quote' | 'both')[] = ['design', 'quote', 'both']

  // SCRUM-796 (secc. 1.3) — el filtro aplicado corresponde exactamente a la categoría
  // clickeada (Diseño / Cotización / Diseño+Cotización === tag 'both'), nunca una unión
  // de las 3.
  function goToTag(_event: ChartEvent, elements: ActiveElement[]): void {
    if (elements.length === 0) return
    const tag = tagEntries[elements[0].index]
    if (tag) navigate(`/ventas-diseno/pipeline?tag=${tag}`)
  }
  const taggedTotal = tagEntries.reduce((sum, tag) => sum + summary.by_tag.tagged[tag], 0)
  const donutData = {
    labels: tagEntries.map(tag => tCrm(`dashboard.tagLabels.${tag}`)),
    datasets: [{
      data: tagEntries.map(tag => summary.by_tag.tagged[tag]),
      backgroundColor: tagEntries.map(tag => TAG_COLORS[tag]),
      borderWidth: 0,
    }],
  }

  return (
    <>
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{tCrm('dashboard.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{tCrm('dashboard.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/ventas-diseno/pipeline?openNewProject=1')}>
          {tVd('kanban.actions.newProject')}
        </Button>
      </div>

      {/* REQ-604: alertas dinámicas, se omite el aviso completo si no hay resultados (RN3).
          SCRUM-796 (secc. 3) — top 3 + "Ver más" (modal con la lista completa), cada ítem
          navega a la tarjeta puntual en Pipeline. */}
      {summary.alerts.overdue_proposals && (
        <div className="rounded-xl px-4 py-3 mb-2.5 bg-red-50 dark:bg-red-950/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs font-bold text-red-700 dark:text-red-400">
              {tCrm('dashboard.overdueTitle', { count: summary.alerts.overdue_proposals.count })}
            </div>
            <Button variant="secondary" loading={remindMutation.isPending} onClick={() => remindMutation.mutate()}>
              {tCrm('alerts.sendReminders')}
            </Button>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {summary.alerts.overdue_proposals.items.slice(0, 3).map(item => (
              <li key={item.card_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/ventas-diseno/pipeline?card=${item.card_id}`)}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:underline text-left"
                >
                  {item.project_name}
                </button>
              </li>
            ))}
          </ul>
          {summary.alerts.overdue_proposals.items.length > 3 && (
            <button
              type="button"
              onClick={() => setAlertModal('overdue')}
              className="mt-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
            >
              {tCrm('dashboard.viewMore')}
            </button>
          )}
        </div>
      )}

      {summary.alerts.cold_clients && (
        <div className="rounded-xl px-4 py-3 mb-4 bg-[#E3F0EE] dark:bg-primary/10">
          <div className="text-xs font-bold text-primary-dark dark:text-primary-light">
            {tCrm('dashboard.coldTitle', { count: summary.alerts.cold_clients.count })}
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {summary.alerts.cold_clients.items.slice(0, 3).map(item => (
              <li key={item.card_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/ventas-diseno/pipeline?card=${item.card_id}`)}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-primary-dark hover:underline text-left"
                >
                  {item.client_name ? `${item.client_name} — ${item.project_name}` : item.project_name}
                </button>
              </li>
            ))}
          </ul>
          {summary.alerts.cold_clients.items.length > 3 && (
            <button
              type="button"
              onClick={() => setAlertModal('cold')}
              className="mt-1 text-xs font-semibold text-primary-dark dark:text-primary-light hover:underline"
            >
              {tCrm('dashboard.viewMore')}
            </button>
          )}
        </div>
      )}

      {/* REQ-605: 8 tarjetas de resumen — 6 conteos de etapa + 2 totales monetarios.
          SCRUM-796 (secc. 1.1) — cada tarjeta de etapa navega al Pipeline filtrado. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {PIPELINE_STAGES.map(stage => (
          <button
            key={stage.id}
            type="button"
            onClick={() => navigate(`/ventas-diseno/pipeline?stage=${stage.id}`)}
            className="text-left"
          >
            <Card className="p-4 transition-shadow hover:shadow-md cursor-pointer">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                {tVd(`stages.${stage.id}`)}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: stage.color }}>
                {summary.stage_counts[stage.id]}
              </div>
            </Card>
          </button>
        ))}
        <Card className="p-4 bg-slate-50 dark:bg-slate-900/40">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            {tCrm('dashboard.activePipeline')}
          </div>
          <div className="text-2xl font-bold mt-1 text-primary-dark">{fmtMoney(summary.totals.active_pipeline)}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{tCrm('dashboard.activePipelineSub')}</div>
        </Card>
        <Card className="p-4 bg-slate-50 dark:bg-slate-900/40">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            {tCrm('dashboard.closed')}
          </div>
          <div className="text-2xl font-bold mt-1 text-green-600">{fmtMoney(summary.totals.closed_won)}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{tCrm('dashboard.closedSub')}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcoBarChart size={16} className="text-slate-400" />
            <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {tCrm('dashboard.byStage')}
            </div>
          </div>
          <div className="h-56">
            <Chart type="bar" data={barData} plugins={[barCountLabelsPlugin]} options={{
              responsive: true, maintainAspectRatio: false,
              // SCRUM-686 fix (2026-08-04): barCountLabelsPlugin dibuja el número 4px arriba del
              // tope de cada barra — sin este padding, la barra más alta llega al borde superior
              // del canvas y el número queda recortado. 20px cubre el texto de 11px + el offset.
              layout: { padding: { top: 20 } },
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 11 } } },
                x: { ticks: { font: { size: 11 } } },
              },
              // SCRUM-796 (secc. 1.2) — cada barra navega al Pipeline filtrado por esa etapa.
              onClick: goToStage,
              onHover: (event, elements) => {
                if (event.native?.target instanceof HTMLElement) {
                  event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
                }
              },
            }} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcoDonutChart size={16} className="text-slate-400" />
            <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {tCrm('dashboard.byType')}
            </div>
          </div>
          {taggedTotal > 0 ? (
            <div className="flex items-center gap-6 justify-center">
              <div className="w-40 h-40">
                <Chart type="doughnut" data={donutData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  cutout: '55%',
                  // SCRUM-796 (secc. 1.3) — cada porción navega al Pipeline filtrado por esa
                  // etiqueta exacta (design/quote/both), nunca una unión de las 3.
                  onClick: goToTag,
                  onHover: (event, elements) => {
                    if (event.native?.target instanceof HTMLElement) {
                      event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
                    }
                  },
                }} />
              </div>
              <div className="flex flex-col gap-2.5">
                {/* SCRUM-796 (secc. 1.3) — la leyenda también es clickeable, mismo destino
                    que la porción correspondiente de la dona. */}
                {tagEntries.map((tag, i) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => navigate(`/ventas-diseno/pipeline?tag=${tag}`)}
                    className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:underline text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: TAG_COLORS[tag] }} />
                    {tCrm(`dashboard.tagLabels.${tag}`)} ({donutData.datasets[0].data[i]})
                  </button>
                ))}
                {summary.by_tag.untagged_count > 0 && (
                  <div className="text-[11px] text-slate-400">
                    {tCrm('dashboard.untaggedNote', { count: summary.by_tag.untagged_count })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 text-center py-10">{tCrm('dashboard.noTagged')}</div>
          )}
        </Card>
      </div>

      {/* SCRUM-796 (secc. 3/4) — "Ver más" de cada alerta. */}
      {alertModal === 'overdue' && summary.alerts.overdue_proposals && (
        <DashboardAlertListModal
          title={tCrm('dashboard.overdueTitle', { count: summary.alerts.overdue_proposals.count })}
          items={summary.alerts.overdue_proposals.items}
          daysLabel={tCrm('dashboard.daysOverdue')}
          onClose={() => setAlertModal(null)}
        />
      )}
      {alertModal === 'cold' && summary.alerts.cold_clients && (
        <DashboardAlertListModal
          title={tCrm('dashboard.coldTitle', { count: summary.alerts.cold_clients.count })}
          items={summary.alerts.cold_clients.items}
          daysLabel={tCrm('dashboard.daysCold')}
          onClose={() => setAlertModal(null)}
        />
      )}
    </>
  )
}
