import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle } from '@/components/icons'
import type { HomeSinResponder, TicketType } from '@/types/servicios'

interface Props {
  data: HomeSinResponder | undefined
}

// Mismos 4 colores que TicketBoard.tsx (no exporta su TYPE_COLORS, ver ReportsYearlyChart.tsx
// para el mismo criterio ya establecido en este módulo — redeclarado local a propósito).
const TYPE_COLORS: Record<TicketType, string> = {
  installation: '#5BA5A0',
  warranty:     '#9fc54d',
  claim:        '#ef4444',
  retrofit:     '#8b5cf6',
}

// REQ-212 (Grupo C, SCRUM-275) — panel "Servicios sin responder" de Inicio. RN4 (mismo criterio
// que HomePendingPanel/HomeSinResponder): el badge de conteo es SIEMPRE `data.count`, nunca
// `items.length`. El badge de tipo usa `t('tickets.types.<tipo>')`, no el `tipo_label` que manda
// el backend — mismo patrón i18n que TicketBoard.tsx, para que el label cambie con el idioma
// activo en vez de quedar fijo en el string que resuelve el backend.
export default function ServiciosSinResponderPanel({ data }: Props) {
  const { t }  = useTranslation('servicios')
  const items  = data?.items ?? []
  const count  = data?.count ?? 0

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-0.5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.sinResponder.title')}</h2>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
            {count}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('home.sinResponder.subtitle')}</p>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.sinResponder.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li
              key={item.ticket_id}
              className="rounded-lg border border-slate-100 dark:border-slate-700 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.cliente}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.descripcion}</p>
                </div>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap shrink-0"
                  style={{ background: TYPE_COLORS[item.tipo] }}
                >
                  {t(`tickets.types.${item.tipo}`)}
                </span>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                <IcoAlertTriangle size={12} />
                {t('home.sinResponder.reportedDaysAgo', { count: item.dias })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
