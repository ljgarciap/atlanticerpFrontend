import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, ArcElement, DoughnutController, Tooltip, Legend } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { IcoDonutChart } from '@/components/icons'
import type { ReportsPeriodParams } from '@/types/servicios'

ChartJS.register(ArcElement, DoughnutController, Tooltip, Legend)

interface Props {
  period: ReportsPeriodParams
}

/**
 * REQ-283 — distribución de tickets del mes por tipo. Mismo patrón de doughnut que
 * src/pages/crm/DashboardPage.tsx (Chart.js + leyenda propia a la derecha). El backend siempre
 * devuelve los 4 tipos con `color` ya resuelto (mismos hex que TYPE_COLORS en TicketBoard.tsx) —
 * el frontend nunca redefine esos colores acá.
 */
export default function ReportsTypeDonut({ period }: Props) {
  const { t } = useTranslation('servicios')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-distribucion-tipo', period.year, period.month],
    queryFn:  () => serviciosApi.reportes.distribucionTipo(period),
  })

  const total = (data ?? []).reduce((sum, item) => sum + item.count, 0)

  const chartData = data ? {
    labels: data.map(item => t(`tickets.types.${item.tipo}`)),
    datasets: [{
      data: data.map(item => item.count),
      backgroundColor: data.map(item => item.color),
      borderWidth: 0,
    }],
  } : null

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <IcoDonutChart size={16} className="text-slate-400" />
        <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t('reports.distributionByType.title')}
        </div>
      </div>

      {isLoading || !data || !chartData ? (
        <div className="h-40 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : total > 0 ? (
        <div className="flex items-center gap-6 justify-center flex-wrap">
          <div className="w-40 h-40">
            <Chart type="doughnut" data={chartData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              cutout: '55%',
            }} />
          </div>
          <div className="flex flex-col gap-2.5">
            {data.map(item => (
              <div key={item.tipo} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
                {t(`tickets.types.${item.tipo}`)} ({item.count})
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-10">{t('reports.empty')}</div>
      )}
    </Card>
  )
}
