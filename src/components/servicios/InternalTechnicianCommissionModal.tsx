import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoChevronLeft, IcoChevronRight } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import { useAuthStore } from '@/store/authStore'
import type { InternalTechnician } from '@/types/servicios'

interface Props {
  technician: InternalTechnician
  onClose:    () => void
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

function canEditSla(role: string | undefined): boolean {
  return role === 'management' || role === 'superadmin'
}

// SCRUM-321 (rebote QA) — CSS `capitalize` title-cases CADA palabra ("Agosto De 2026"); acá solo
// la primera letra debe ir en mayúscula ("Agosto de 2026"), mismo patrón ya usado en
// ServiciosHomeHeader.tsx/CalendarModal.tsx.
function periodLabel(period: { year: number; month: number }, locale: string): string {
  const formatted = new Date(period.year, period.month - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// REQ-292 — captura mensual de comisión (RN1/RN4) + ajuste de SLA por tipo de ticket (RN2, solo
// Gerencia). RN6: sin captura del mes en curso, se muestra "Pendiente de captura". RN5: un mes ya
// cerrado sigue siendo editable — de acá el selector de período (Pre-QA 2026-08-09, SCRUM-362:
// sin esto, RN5 no tenía ningún camino de UI para ejercerse — el backend ya soportaba year/month
// explícitos, pero el formulario siempre operaba sobre el mes del navegador).
export default function InternalTechnicianCommissionModal({ technician, onClose }: Props) {
  const { t, i18n } = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const qc      = useQueryClient()
  const user    = useAuthStore(s => s.user)

  const now = new Date()
  const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 }

  const [period, setPeriod] = useState(currentPeriod)
  const isCurrentPeriod = period.year === currentPeriod.year && period.month === currentPeriod.month

  const [satisfaccion, setSatisfaccion] = useState('')
  const [incidencias, setIncidencias]   = useState('')
  const [actitud, setActitud]           = useState('')
  const [calidad, setCalidad]           = useState('')
  const [licenciaMedica, setLicenciaMedica] = useState(false)
  const [slaForm, setSlaForm] = useState<Record<string, string>>({})

  function shiftPeriod(delta: number) {
    setPeriod(p => {
      const zeroBased = p.month - 1 + delta
      const year = p.year + Math.floor(zeroBased / 12)
      const month = ((zeroBased % 12) + 12) % 12 + 1
      // RN5 solo habla de meses ya cerrados — no tiene sentido capturar un mes futuro que ni
      // terminó todavía.
      if (year > currentPeriod.year || (year === currentPeriod.year && month > currentPeriod.month)) {
        return p
      }
      return { year, month }
    })
  }

  const { data: capture, isLoading } = useQuery({
    queryKey: ['servicios-internal-technician-commission', technician.id, period.year, period.month],
    queryFn:  () => serviciosApi.internalTechnicians.commissionCapture(technician.id, period.year, period.month),
  })

  const { data: sla } = useQuery({
    queryKey: ['servicios-sla-settings'],
    queryFn:  () => serviciosApi.internalTechnicians.slaSettings(),
  })

  useEffect(() => {
    if (capture) {
      setSatisfaccion(String(capture.satisfaccion_promedio))
      setIncidencias(String(capture.incidencias_puntualidad))
      setActitud(String(capture.calificacion_actitud))
      setCalidad(capture.calidad_pct !== null ? String(capture.calidad_pct) : '')
      setLicenciaMedica(capture.licencia_medica)
    } else {
      // Cambiar de período a uno sin captura no debe arrastrar los valores del período anterior.
      setSatisfaccion('')
      setIncidencias('')
      setActitud('')
      setCalidad('')
      setLicenciaMedica(false)
    }
  }, [capture])

  useEffect(() => {
    if (sla) {
      setSlaForm({
        claim: String(sla.claim), warranty: String(sla.warranty),
        installation: String(sla.installation), retrofit: String(sla.retrofit),
      })
    }
  }, [sla])

  const saveMutation = useMutation({
    mutationFn: () => serviciosApi.internalTechnicians.saveCommissionCapture(technician.id, {
      year: period.year,
      month: period.month,
      satisfaccion_promedio: Number(satisfaccion),
      incidencias_puntualidad: Number(incidencias),
      calificacion_actitud: Number(actitud),
      licencia_medica: licenciaMedica,
      calidad_pct: calidad !== '' ? Number(calidad) : null,
    }),
    onSuccess: () => {
      toast(t('technicians.internal.commissionModal.saved'), 'success')
      void qc.invalidateQueries({ queryKey: ['servicios-internal-technician-commission', technician.id] })
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.internal.commissionModal.error'), 'error')
    },
  })

  const slaMutation = useMutation({
    mutationFn: () => serviciosApi.internalTechnicians.updateSlaSettings({
      claim: Number(slaForm.claim), warranty: Number(slaForm.warranty),
      installation: Number(slaForm.installation), retrofit: Number(slaForm.retrofit),
    }),
    onSuccess: () => {
      toast(t('technicians.internal.commissionModal.slaSaved'), 'success')
      void qc.invalidateQueries({ queryKey: ['servicios-sla-settings'] })
    },
  })

  const canSubmit = satisfaccion !== '' && incidencias !== '' && actitud !== ''

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="internal-technician-commission-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.internal.commissionModal.title', { nombre: technician.nombre })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        {/* REQ-292 RN5 — un mes ya cerrado sigue siendo editable; sin este selector no había
            forma de llegar a él. */}
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
            <p className="text-slate-400 text-sm">{t('technicians.internal.commissionModal.loading')}</p>
          ) : (
            <>
              {!capture && (
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  {t('technicians.internal.commissionModal.pending')}
                </p>
              )}

              <label className="text-sm block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('technicians.internal.commissionModal.satisfaccion')}
                </span>
                <input
                  type="number" min={1} max={5} step="0.1"
                  value={satisfaccion} onChange={e => setSatisfaccion(e.target.value)}
                  className={INPUT_CLASSES}
                />
                {capture && <span className="text-xs text-slate-400">{capture.satisfaccion_pct}%</span>}
              </label>

              <label className="text-sm block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('technicians.internal.commissionModal.puntualidad')}
                </span>
                <input
                  type="number" min={0} step="1"
                  value={incidencias} onChange={e => setIncidencias(e.target.value)}
                  className={INPUT_CLASSES}
                />
                {capture && <span className="text-xs text-slate-400">{capture.puntualidad_pct}%</span>}
              </label>

              <label className="text-sm block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('technicians.internal.commissionModal.actitud')}
                </span>
                <input
                  type="number" min={1} max={5} step="0.1"
                  value={actitud} onChange={e => setActitud(e.target.value)}
                  className={INPUT_CLASSES}
                />
                {capture && <span className="text-xs text-slate-400">{capture.actitud_pct}%</span>}
              </label>

              {/* Batch 10 (REQ-258 RN2) — captura manual, sin auto-sugerencia (REQ-211 no existe
                  todavía, ver docblock de CommissionCalculationService en el backend). Es el %
                  directo, no un valor crudo a convertir como los 3 de arriba. */}
              <label className="text-sm block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('technicians.internal.commissionModal.calidad')}
                </span>
                <input
                  type="number" min={0} max={100} step="1"
                  value={calidad} onChange={e => setCalidad(e.target.value)}
                  className={INPUT_CLASSES}
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenciaMedica} onChange={e => setLicenciaMedica(e.target.checked)} />
                {t('technicians.internal.commissionModal.licenciaMedica')}
              </label>

              <Button onClick={() => saveMutation.mutate()} disabled={!canSubmit} loading={saveMutation.isPending}>
                {t('technicians.internal.commissionModal.save')}
              </Button>

              {sla && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    {t('technicians.internal.commissionModal.slaSection')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(['claim', 'warranty', 'installation', 'retrofit'] as const).map(tipo => (
                      <label key={tipo} className="text-xs">
                        <span className="block text-slate-500 mb-1">{t(`technicians.internal.commissionModal.slaTypes.${tipo}`)}</span>
                        <input
                          type="number" min={1}
                          value={slaForm[tipo] ?? ''}
                          disabled={!canEditSla(user?.role)}
                          onChange={e => setSlaForm(f => ({ ...f, [tipo]: e.target.value }))}
                          className={`${INPUT_CLASSES} disabled:opacity-50`}
                        />
                      </label>
                    ))}
                  </div>
                  {canEditSla(user?.role) && (
                    <Button
                      variant="secondary" className="mt-2"
                      onClick={() => slaMutation.mutate()} loading={slaMutation.isPending}
                    >
                      {t('technicians.internal.commissionModal.slaSave')}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
