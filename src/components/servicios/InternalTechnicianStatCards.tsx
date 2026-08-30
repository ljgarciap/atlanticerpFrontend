import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'

// REQ-261 — 3 tarjetas resumen del equipo. RN3: el promedio de 1ra visita viene null del backend
// hasta que exista REQ-211 (Batch 15) — se muestra "—", no se inventa un cálculo acá.
export default function InternalTechnicianStatCards() {
  const { t } = useTranslation('servicios')

  const { data } = useQuery({
    queryKey: ['servicios-internal-technicians-stats'],
    queryFn:  () => serviciosApi.internalTechnicians.stats(),
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Card variant="panel" className="p-4">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {t('technicians.internal.stats.activeToday')}
        </span>
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {data ? t('technicians.internal.stats.activeTodayValue', { active: data.activos_hoy, total: data.total_tecnicos }) : '—'}
        </span>
      </Card>
      <Card variant="panel" className="p-4">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {t('technicians.internal.stats.visitsToday')}
        </span>
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data?.visitas_hoy_total ?? '—'}</span>
      </Card>
      <Card variant="panel" className="p-4">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {t('technicians.internal.stats.firstVisitAvg')}
        </span>
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {data?.promedio_primera_visita !== null && data?.promedio_primera_visita !== undefined
            ? `${Math.round(data.promedio_primera_visita)}%`
            : '—'}
        </span>
      </Card>
    </div>
  )
}
