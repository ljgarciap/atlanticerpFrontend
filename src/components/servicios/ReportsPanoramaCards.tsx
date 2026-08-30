import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import type { ReportsPeriodParams } from '@/types/servicios'

interface Props {
  period: ReportsPeriodParams
}

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

/**
 * REQ-280 — "Panorama del mes", 4 tarjetas, mismo grid/skeleton que TicketStatCards.tsx.
 *
 * "Servicios completados" muestra el CONTEO ("13") con el subtítulo "de 21 tickets del mes", tal
 * como pide el Escenario 1 del ticket (y el mockup) — no el porcentaje. El backend expone los 2
 * conteos crudos desde el fix de Pre-QA 2026-08-12; antes solo devolvía `_pct` y esta tarjeta
 * mostraba "61.9%", que no es lo que el criterio pide.
 */
export default function ReportsPanoramaCards({ period }: Props) {
  const { t } = useTranslation('servicios')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-panorama-mes', period.year, period.month],
    queryFn:  () => serviciosApi.reportes.panoramaMes(period),
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 h-[76px] animate-pulse" />
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: t('reports.panorama.completed.label'),
      value: String(data.servicios_completados),
      sub:   t('reports.panorama.completed.sub', { total: data.servicios_completados_total }),
    },
    {
      label: t('reports.panorama.firstVisit.label'),
      value: pct(data.resuelto_primera_visita_pct),
      sub:   t('reports.panorama.firstVisit.sub'),
    },
    {
      label: t('reports.panorama.avgResolution.label'),
      value: data.tiempo_promedio_resolucion_dias === null
        ? '—'
        : `${data.tiempo_promedio_resolucion_dias} ${t('reports.panorama.avgResolution.days')}`,
      sub:   t('reports.panorama.avgResolution.sub'),
    },
    {
      label: t('reports.panorama.pendingReports.label'),
      value: String(data.informes_pendientes),
      sub:   t('reports.panorama.pendingReports.sub'),
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {card.label}
          </div>
          <div className="text-2xl font-bold leading-none text-slate-800 dark:text-slate-100">
            {card.value}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{card.sub}</div>
        </div>
      ))}
    </div>
  )
}
