import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { usePermission } from '@/hooks/usePermission'
import { useFraudSettings, useUpdateFraudSettings } from '@/hooks/useAdminContab'
import type { FraudSettings } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoSettings } from '@/components/icons'

/**
 * REQ-635 (SCRUM-811) — administración de los umbrales de alertas de fraude de Admin&Cont (ver
 * `AdminContSettingsService` en el backend). Regla dura del proyecto: todo umbral de negocio va
 * en tabla paramétrica con CRUD/vista de admin (ver CLAUDE.md § "Nunca").
 *
 * SCRUM-945 (épica SCRUM-944) — extraído de `FraudSettingsPage.tsx` a `src/components/` (mismo
 * patrón que `BodegaSettingsPanel`/`ServiciosSettingsPanel`): el panel se queda con TODO —
 * gate de `superadmin.all`, chrome (título/subtítulo) y formulario — para que la Page sea un
 * wrapper trivial y la vista consolidada (`GlobalSettingsPage`) pueda montar el mismo panel sin
 * duplicar lógica ni storage.
 */

const FIELD_RANGES = {
  fraude_monto_desviaciones:             { min: 1, max: 10 },
  fraude_monto_ventana_dias:              { min: 1, max: 365 },
  fraude_aprobaciones_repetidas_n:        { min: 1, max: 1000 },
  fraude_aprobaciones_repetidas_minutos:  { min: 1, max: 1440 },
  comision_pendiente_dias:                { min: 1, max: 365 },
} as const satisfies Record<keyof FraudSettings, { min: number; max: number }>

function buildSchema(t: TFunction) {
  const intField = (min: number, max: number) =>
    z.coerce.number({ invalid_type_error: t('adminContab:fraudSettings.validation.required') })
      .int(t('adminContab:fraudSettings.validation.integer'))
      .min(min, t('adminContab:fraudSettings.validation.range', { min, max }))
      .max(max, t('adminContab:fraudSettings.validation.range', { min, max }))

  return z.object({
    fraude_monto_desviaciones:            intField(FIELD_RANGES.fraude_monto_desviaciones.min, FIELD_RANGES.fraude_monto_desviaciones.max),
    fraude_monto_ventana_dias:             intField(FIELD_RANGES.fraude_monto_ventana_dias.min, FIELD_RANGES.fraude_monto_ventana_dias.max),
    fraude_aprobaciones_repetidas_n:       intField(FIELD_RANGES.fraude_aprobaciones_repetidas_n.min, FIELD_RANGES.fraude_aprobaciones_repetidas_n.max),
    fraude_aprobaciones_repetidas_minutos: intField(FIELD_RANGES.fraude_aprobaciones_repetidas_minutos.min, FIELD_RANGES.fraude_aprobaciones_repetidas_minutos.max),
    comision_pendiente_dias:               intField(FIELD_RANGES.comision_pendiente_dias.min, FIELD_RANGES.comision_pendiente_dias.max),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

const FIELDS: { key: keyof FraudSettings; i18nKey: string }[] = [
  { key: 'fraude_monto_desviaciones',            i18nKey: 'fraudeMontoDesviaciones' },
  { key: 'fraude_monto_ventana_dias',             i18nKey: 'fraudeMontoVentanaDias' },
  { key: 'fraude_aprobaciones_repetidas_n',       i18nKey: 'fraudeAprobacionesRepetidasN' },
  { key: 'fraude_aprobaciones_repetidas_minutos', i18nKey: 'fraudeAprobacionesRepetidasMinutos' },
  { key: 'comision_pendiente_dias',               i18nKey: 'comisionPendienteDias' },
]

export default function FraudSettingsPanel() {
  const { t } = useTranslation(['common', 'adminContab'])
  const isSuperadmin = usePermission('superadmin.all')

  const { data: settings, isLoading } = useFraudSettings(isSuperadmin)
  const mutation = useUpdateFraudSettings()

  const schema = buildSchema(t)
  const {
    register, handleSubmit, reset, formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (settings) reset(settings)
  }, [settings, reset])

  if (!isSuperadmin) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('adminContab:fraudSettings.forbidden')}</p>
      </div>
    )
  }

  const onSubmit = (data: FormData) => mutation.mutate(data)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:fraudSettings.title')}</h1>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('adminContab:fraudSettings.subtitle')}</p>

      <Card variant="panel" shadow className="overflow-hidden">
        {isLoading
          ? <div className="px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
          : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-5 space-y-5">
              {FIELDS.map(({ key, i18nKey }) => (
                <div key={key}>
                  <label htmlFor={key} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t(`adminContab:fraudSettings.fields.${i18nKey}.label`)}
                  </label>
                  <input
                    id={key}
                    type="number"
                    min={FIELD_RANGES[key].min}
                    max={FIELD_RANGES[key].max}
                    step={1}
                    {...register(key)}
                    className={`w-full sm:w-48 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition
                      ${errors[key] ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 dark:border-slate-600 focus:ring-primary/20 focus:border-primary'}`}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {t(`adminContab:fraudSettings.fields.${i18nKey}.help`)}
                  </p>
                  {errors[key] && (
                    <p className="text-xs text-red-500 mt-1">{errors[key]?.message}</p>
                  )}
                </div>
              ))}

              {isDirty && (
                <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending}>
                  {t('adminContab:fraudSettings.save')}
                </Button>
              )}

              {mutation.isSuccess && !isDirty && (
                <p className="text-xs text-[#5BA5A0] font-medium">{t('adminContab:fraudSettings.saved')}</p>
              )}
              {mutation.isError && (
                <p className="text-xs text-red-500">
                  {mutationErrorMessage(mutation.error, t('adminContab:fraudSettings.saveError'))}
                </p>
              )}
            </form>
          )}
      </Card>
    </div>
  )
}
