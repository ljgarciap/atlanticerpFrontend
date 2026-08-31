import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft, IcoChevronRight } from '@/components/icons'
import type { CommissionCriterio } from '@/types/servicios'

const CRITERIOS: CommissionCriterio[] = ['calidad', 'satisfaccion', 'sla', 'puntualidad', 'actitud']

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// Pre-QA 2026-08-13 (recheck SCRUM-321) — mismo bug del rebote de QA, sin corregir acá: CSS
// `capitalize` title-cases CADA palabra ("Agosto De 2026"); acá solo la primera letra debe ir en
// mayúscula ("Agosto de 2026"). Mismo patrón ya usado en InternalTechnicianCommissionModal.tsx/
// InternalTechnicianCommissionResultModal.tsx/ServiciosHomeHeader.tsx/CalendarModal.tsx.
function periodLabel(period: { year: number; month: number }, locale: string): string {
  const formatted = new Date(period.year, period.month - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/**
 * REQ-286 — sección "Comisión — Tecnico Servicios Test" en Reportes, SOLO LECTURA. UI de total+desglose y
 * navegación de período calcadas de InternalTechnicianCommissionResultModal.tsx (Batch 10), pero
 * sin id de técnico en la URL — el backend resuelve "Tecnico Servicios Test" del lado servidor (único con
 * plan de comisión activo hoy).
 *
 * Gate en 2 pasos porque este panel no tiene el id del técnico a mano como sí lo tiene
 * InternalTechniciansPage (`canViewCommissionResultFor`): Gerencia/superadmin siempre califican;
 * cualquier otro usuario califica solo si su cuenta está linkeada (`user_id`) al perfil de
 * "Tecnico Servicios Test" en internal_technicians — mismo query key ya cacheado por TanStack Query en
 * InternalTechniciansPage (`servicios-internal-technicians`), no se duplica la llamada de red.
 * Si no califica: no se renderiza nada Y la query de comisión nunca se dispara (`enabled: false`).
 */
export default function ReportsCommissionSection() {
  const { t, i18n } = useTranslation('servicios')
  const user = useAuthStore(s => s.user)

  const { data: technicians } = useQuery({
    queryKey: ['servicios-internal-technicians'],
    queryFn:  serviciosApi.internalTechnicians.list,
  })

  const isManagement = user?.role === 'management' || user?.role === 'superadmin'
  // El técnico con plan de bonificación se resuelve por `has_bonus_plan`, el MISMO flag que usa el
  // backend (`ReportsController::comisionCarlosVergara()`), nunca por su nombre: el nombre es
  // editable en Técnicos Internos, y con el match por string un simple renombre ("Carlos A.
  // Vergara") le ocultaba a Carlos su propia sección aunque el backend siguiera autorizándolo
  // (hallazgo de Pre-QA 2026-08-12, reproducido en vivo).
  const carlosVergara = technicians?.find(tech => tech.has_bonus_plan)
  const isCarlosVergara = !!user && !!carlosVergara && carlosVergara.user_id === user.id
  const qualifies = isManagement || isCarlosVergara

  const now = new Date()
  const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const [period, setPeriod] = useState(currentPeriod)
  const isCurrentPeriod = period.year === currentPeriod.year && period.month === currentPeriod.month

  function shiftPeriod(delta: number) {
    setPeriod(p => {
      const zeroBased = p.month - 1 + delta
      const year  = p.year + Math.floor(zeroBased / 12)
      const month = ((zeroBased % 12) + 12) % 12 + 1
      if (year > currentPeriod.year || (year === currentPeriod.year && month > currentPeriod.month)) return p
      return { year, month }
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-reports-comision-carlos-vergara', period.year, period.month],
    queryFn:  () => serviciosApi.reportes.comisionCarlosVergara(period),
    enabled:  qualifies,
  })

  if (!qualifies) return null

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: '#FFFBF3', border: '1px solid #f0d9a8' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold text-slate-900">{t('reports.commission.title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="icon" onClick={() => shiftPeriod(-1)} aria-label={t('technicians.internal.commissionModal.previousMonth')}>
            <IcoChevronLeft size={16} />
          </Button>
          <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-center">
            {periodLabel(period, i18n.language)}
          </span>
          <Button
            variant="icon" onClick={() => shiftPeriod(1)} disabled={isCurrentPeriod}
            aria-label={t('technicians.internal.commissionModal.nextMonth')}
          >
            <IcoChevronRight size={16} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('technicians.internal.commissionResult.loading')}</p>
      ) : !data ? (
        <p className="text-sm text-amber-600 font-medium">{t('technicians.internal.commissionResult.pending')}</p>
      ) : (
        <>
          <div className="text-center py-3 rounded-lg bg-white mb-3">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('technicians.internal.commissionResult.total')}
            </span>
            <span className="text-2xl font-bold text-primary">{money(data.total)}</span>
          </div>

          {data.capture.licencia_medica && (
            <p className="text-xs text-amber-600 mb-2">{t('technicians.internal.commissionResult.licenciaMedicaNote')}</p>
          )}

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
                  <tr key={criterio} className="border-t" style={{ borderColor: '#f0d9a8' }}>
                    <td className="py-1.5 text-slate-700">{t(`technicians.internal.commissionResult.criteria.${criterio}`)}</td>
                    <td className="py-1.5 text-right text-slate-400">{item.peso_pct}%</td>
                    <td className="py-1.5 text-right text-slate-600">{item.pct_obtenido}%</td>
                    <td className="py-1.5 text-right font-semibold text-slate-800">{money(item.monto_obtenido)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
