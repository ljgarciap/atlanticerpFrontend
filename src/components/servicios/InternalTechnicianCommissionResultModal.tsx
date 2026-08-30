import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoChevronLeft, IcoChevronRight } from '@/components/icons'
import type { InternalTechnician, CommissionCriterio } from '@/types/servicios'

interface Props {
  technician: InternalTechnician
  onClose:    () => void
}

const CRITERIOS: CommissionCriterio[] = ['calidad', 'satisfaccion', 'sla', 'puntualidad', 'actitud']

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// SCRUM-321 (rebote QA) — CSS `capitalize` title-cases CADA palabra ("Agosto De 2026"); acá solo
// la primera letra debe ir en mayúscula ("Agosto de 2026"), mismo patrón ya usado en
// ServiciosHomeHeader.tsx/CalendarModal.tsx.
function periodLabel(period: { year: number; month: number }, locale: string): string {
  const formatted = new Date(period.year, period.month - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// Batch 10 (REQ-258 RN9) — tarjeta+detalle de comisión, SOLO LECTURA. Distinto de
// InternalTechnicianCommissionModal (captura de Aaron/Gerencia) — RN8: este modal lo abre el
// propio técnico o Gerencia, nunca Aaron. El backend re-valida esta misma restricción
// (InternalTechnicianController::commission()) — el gate del lado del botón (ver
// InternalTechnicianCard) es solo para no ofrecer una acción que el backend va a rechazar.
export default function InternalTechnicianCommissionResultModal({ technician, onClose }: Props) {
  const { t, i18n } = useTranslation('servicios')

  const now = new Date()
  const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const [period, setPeriod] = useState(currentPeriod)
  const isCurrentPeriod = period.year === currentPeriod.year && period.month === currentPeriod.month

  function shiftPeriod(delta: number) {
    setPeriod(p => {
      const zeroBased = p.month - 1 + delta
      const year = p.year + Math.floor(zeroBased / 12)
      const month = ((zeroBased % 12) + 12) % 12 + 1
      if (year > currentPeriod.year || (year === currentPeriod.year && month > currentPeriod.month)) return p
      return { year, month }
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-internal-technician-commission-result', technician.id, period.year, period.month],
    queryFn:  () => serviciosApi.internalTechnicians.commission(technician.id, period.year, period.month),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="internal-technician-commission-result-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.internal.commissionResult.title', { nombre: technician.nombre })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-2 border-b border-slate-100 dark:border-slate-700">
          <Button variant="icon" onClick={() => shiftPeriod(-1)} aria-label={t('technicians.internal.commissionModal.previousMonth')}>
            <IcoChevronLeft size={16} />
          </Button>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[140px] text-center">
            {periodLabel(period, i18n.language)}
          </span>
          <Button
            variant="icon" onClick={() => shiftPeriod(1)} disabled={isCurrentPeriod}
            aria-label={t('technicians.internal.commissionModal.nextMonth')}
          >
            <IcoChevronRight size={16} />
          </Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-slate-400 text-sm">{t('technicians.internal.commissionResult.loading')}</p>
          ) : !data ? (
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              {t('technicians.internal.commissionResult.pending')}
            </p>
          ) : (
            <>
              <div className="text-center py-3 rounded-lg bg-primary/10">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('technicians.internal.commissionResult.total')}
                </span>
                <span className="text-2xl font-bold text-primary">{money(data.total)}</span>
              </div>

              {data.capture.licencia_medica && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('technicians.internal.commissionResult.licenciaMedicaNote')}
                </p>
              )}

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {t('technicians.internal.commissionResult.breakdown')}
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="py-1 font-medium"> </th>
                      <th className="py-1 font-medium text-right">{t('technicians.internal.commissionResult.weight')}</th>
                      <th className="py-1 font-medium text-right">{t('technicians.internal.commissionResult.obtained')}</th>
                      <th className="py-1 font-medium text-right">{t('technicians.internal.commissionResult.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CRITERIOS.map(criterio => {
                      const item = data.desglose.find(d => d.criterio === criterio)
                      if (!item) return null
                      return (
                        <tr key={criterio} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="py-1.5 text-slate-700 dark:text-slate-200">
                            {t(`technicians.internal.commissionResult.criteria.${criterio}`)}
                          </td>
                          <td className="py-1.5 text-right text-slate-400">{item.peso_pct}%</td>
                          <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{item.pct_obtenido}%</td>
                          <td className="py-1.5 text-right font-semibold text-slate-800 dark:text-slate-100">{money(item.monto_obtenido)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <Button variant="secondary" onClick={onClose}>
            {t('technicians.internal.commissionResult.close')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
