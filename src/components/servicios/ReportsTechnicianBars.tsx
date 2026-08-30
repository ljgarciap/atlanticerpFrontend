import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { IcoBarChart } from '@/components/icons'
import type { ReportsPeriodParams } from '@/types/servicios'

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip, Legend)

interface Props {
  period: ReportsPeriodParams
}

/**
 * REQ-284 — distribución de tickets del mes por técnico interno. Barra vertical, mismo patrón
 * Chart.js que el gráfico "Por etapa" de src/pages/crm/DashboardPage.tsx. `backgroundColor` es un
 * array de `item.color` por técnico (mismo color con el que aparece en Agenda equipo /
 * InternalTechnicianCard) — el backend ya lo resuelve, el frontend no inventa una paleta propia.
 */
export default function ReportsTechnicianBars({ period }: Props) {
  const { t } = useTranslation('servicios')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-distribucion-tecnico', period.year, period.month],
    queryFn:  () => serviciosApi.reportes.distribucionTecnico(period),
  })

  const chartData = data ? {
    labels: data.map(item => item.nombre),
    datasets: [{
      label: t('reports.distributionByTechnician.title'),
      data: data.map(item => item.count),
      backgroundColor: data.map(item => item.color),
      borderRadius: 4,
      minBarLength: 4,
    }],
  } : null

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <IcoBarChart size={16} className="text-slate-400" />
        <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t('reports.distributionByTechnician.title')}
        </div>
      </div>

      {isLoading || !data || !chartData ? (
        <div className="h-56 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : data.length > 0 ? (
        <div className="h-56">
          <Chart type="bar" data={chartData} options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 11 } } },
              x: { ticks: { font: { size: 11 } } },
            },
          }} />
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-10">{t('reports.empty')}</div>
      )}
    </Card>
  )
}
