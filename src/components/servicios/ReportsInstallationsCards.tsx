import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { formatMoney, formatInt } from '@/lib/money'
import type { ReportsPeriodParams } from '@/types/servicios'

interface Props {
  period: ReportsPeriodParams
}

/**
 * REQ-282 — "Instalaciones cotizadas vs. realizadas", 2 tarjetas. Usa formatMoney/formatInt de
 * src/lib/money.ts (estándar en-US fijo del proyecto) — NUNCA el formatMoney local de
 * HomeMonthlyIndicators.tsx, que usa Intl es-PA/currency para los indicadores de Inicio, un
 * vocabulario de formato distinto y no intercambiable con este.
 */
export default function ReportsInstallationsCards({ period }: Props) {
  const { t } = useTranslation('servicios')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-instalaciones-cotizadas-vs-realizadas', period.year, period.month],
    queryFn:  () => serviciosApi.reportes.instalacionesCotizadasVsRealizadas(period),
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 h-[92px] animate-pulse" />
        ))}
      </div>
    )
  }

  // REQ-281 Escenario 1 — el valor grande es la CANTIDAD de tickets ("14") y el subtexto lleva el
  // monto con su significado explícito ("$31,200 en cotizaciones generadas este mes"), no al revés
  // (hallazgo de Pre-QA 2026-08-12: con el monto arriba, un mes con 3 instalaciones sin cotización
  // aprobada mostraba "$0.00" como cifra principal).
  const cards = [
    { key: 'quoted',    label: t('reports.installations.quoted'),    sub: 'reports.installations.quotedSub',    block: data.cotizadas },
    { key: 'completed', label: t('reports.installations.completed'), sub: 'reports.installations.completedSub', block: data.realizadas },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {cards.map(card => (
        <div key={card.key} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {card.label}
          </div>
          <div className="text-2xl font-bold leading-none text-slate-800 dark:text-slate-100">
            {formatInt(card.block.cantidad)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {t(card.sub, { monto: `$${formatMoney(card.block.total)}` })}
          </div>
        </div>
      ))}
    </div>
  )
}
