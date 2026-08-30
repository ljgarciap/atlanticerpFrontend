import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'

// REQ-222 — 4 tarjetas de estadísticas sobre la tabla/tablero de Tickets. RN5: siempre el total
// del sistema, nunca se filtran por los filtros activos de la tabla — por eso esta query no
// depende de `filters` (a diferencia de la tabla/tablero, que sí).
export default function TicketStatCards() {
  const { t } = useTranslation('servicios')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['servicios-tickets-stats'],
    queryFn:  serviciosApi.tickets.stats,
  })

  if (isLoading || !stats) {
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
      label: t('tickets.stats.abiertos'),
      value: stats.tickets_abiertos,
      sub:   t('tickets.stats.abiertosSub', { total: stats.total_tickets }),
      color: undefined,
    },
    {
      label: t('tickets.stats.cotizaciones'),
      value: stats.cotizaciones_por_generar,
      sub:   t('tickets.stats.cotizacionesSub'),
      color: stats.cotizaciones_por_generar > 0 ? '#f59e0b' : undefined,
    },
    {
      label: t('tickets.stats.informes'),
      value: stats.informes_por_generar,
      sub:   t('tickets.stats.informesSub'),
      color: stats.informes_por_generar > 0 ? '#f59e0b' : undefined,
    },
    {
      label: t('tickets.stats.sinAgendar'),
      value: stats.sin_agendar,
      sub:   t('tickets.stats.sinAgendarSub', { dias: stats.sin_agendar_umbral_dias }),
      color: stats.sin_agendar > 0 ? '#ef4444' : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {card.label}
          </div>
          <div className="text-2xl font-bold leading-none text-slate-800 dark:text-slate-100" style={card.color ? { color: card.color } : undefined}>
            {card.value}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{card.sub}</div>
        </div>
      ))}
    </div>
  )
}
