import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { IcoBarChart } from '@/components/icons'
import { TICKET_TYPES } from '@/types/servicios'
import type { TicketType } from '@/types/servicios'

interface Props {
  year: number
}

// TicketBoard.tsx no exporta su TYPE_COLORS — redeclarado local a propósito (mismos 4 hex, ver
// diseño de esta tarea) en vez de acoplar un componente de tablero con uno de reportes que no
// comparten ciclo de vida.
const TYPE_COLORS: Record<TicketType, string> = {
  installation: '#5BA5A0',
  warranty:     '#9fc54d',
  claim:        '#ef4444',
  retrofit:     '#8b5cf6',
}

/**
 * REQ-285 — "Servicios completados en el año". Siempre desde enero, independiente del mes elegido
 * en el period-select de arriba (solo depende del año) — ver docblock de ReportsPage.tsx.
 * Deliberadamente NO Chart.js: grid CSS puro con `repeat(6, 1fr)` para que los meses 7-12 caigan
 * en una 2da fila automáticamente, 12 columnas-mes con 4 mini-barras por tipo escaladas contra el
 * máximo global del año (no contra el máximo del propio mes) para que las alturas sean
 * comparables entre columnas.
 *
 * RN1 (REQ-280/284) — el backend ya decide cuántos meses devolver (año en curso: enero→mes
 * actual; año pasado: los 12 completos) — el frontend NUNCA fuerza una grilla fija de 12, o un
 * año en curso mostraría meses futuros como columnas "0 total" en vez de simplemente no existir
 * todavía (hallazgo real de Senior Review, corregido antes de Visual Review/Pre-QA).
 */
export default function ReportsYearlyChart({ year }: Props) {
  const { t, i18n } = useTranslation('servicios')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-completados-anio', year],
    queryFn:  () => serviciosApi.reportes.completadosAnio(year),
  })

  const months = (data ?? []).map(item => item.mes)
  const byMonth = new Map((data ?? []).map(item => [item.mes, item]))
  const globalMax = Math.max(1, ...(data ?? []).flatMap(item => TICKET_TYPES.map(tipo => item.por_tipo[tipo] ?? 0)))

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <IcoBarChart size={16} className="text-slate-400" />
        <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t('reports.yearly.title')}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="h-40 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {months.map(mes => {
              const item  = byMonth.get(mes)
              const label = new Date(year, mes - 1, 1).toLocaleDateString(i18n.language, { month: 'short' })
              // SCRUM-354 (rebote Daniela 2026-08-20) — un mes sin ningún servicio registrado
              // mostraba "0 0 0 0" y un total "0" en las 4 categorías, saturando la grilla sin
              // aportar información. Ahora solo se listan los tipos con cantidad > 0 (número +
              // barra); si NINGÚN tipo tiene datos, el mes queda en blanco (solo la etiqueta del
              // mes, sin números ni barras ni total) pero conserva su posición en la grilla de 6
              // columnas — nunca se elimina ni reordena.
              const visibleTipos = TICKET_TYPES.filter(tipo => (item?.por_tipo[tipo] ?? 0) > 0)
              const total        = item?.total ?? 0
              return (
                <div key={mes} className="flex flex-col items-center gap-1.5">
                  {/* Alturas fijas en ambas filas (aunque queden vacías) para que la etiqueta del
                      mes y el total sigan alineados entre columnas de la misma fila — un mes sin
                      datos queda en blanco ACÁ, no colapsa el espacio ni desalinea al resto. */}
                  {/* RN2 (REQ-284) — cada barra lleva su propio número VISIBLE encima, no solo en
                      el tooltip: el criterio pide leer el valor de cada tipo directamente, sin
                      calcular proporciones visuales ni pasar el mouse (Pre-QA 2026-08-12). */}
                  <div className="flex items-end gap-1 h-[13px]">
                    {visibleTipos.map(tipo => (
                      <span
                        key={tipo}
                        className="w-3 text-[10px] leading-none text-center text-slate-500 dark:text-slate-400 tabular-nums"
                      >
                        {item?.por_tipo[tipo] ?? 0}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {visibleTipos.map(tipo => {
                      const count = item?.por_tipo[tipo] ?? 0
                      const heightPct = globalMax > 0 ? (count / globalMax) * 100 : 0
                      return (
                        <div
                          key={tipo}
                          data-testid="tipo-bar"
                          title={`${t(`tickets.types.${tipo}`)}: ${count}`}
                          className="w-3 rounded-t-sm"
                          style={{ height: `${Math.max(heightPct, 4)}%`, background: TYPE_COLORS[tipo] }}
                        />
                      )
                    })}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{label}</span>
                  <span className={`text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${total > 0 ? '' : 'invisible'}`}>
                    {total}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            {TICKET_TYPES.map(tipo => (
              <div key={tipo} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-sm" style={{ background: TYPE_COLORS[tipo] }} />
                {t(`tickets.types.${tipo}`)}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
