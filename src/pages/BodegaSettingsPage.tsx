import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { usePermission } from '@/hooks/usePermission'
import { useBodegaSettings, useUpdateBodegaSettings } from '@/hooks/useBodega'
import type { BodegaSettings } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoSettings } from '@/components/icons'

/**
 * SCRUM-500 — hallazgo de Senior Review en Batch B1 (Home de Bodega): los 5 umbrales de
 * `bodega_settings` (`urgente_ventana_dias` ya existía; los otros 4 se agregaron para Home) solo
 * eran editables por SQL/tinker. Regla dura del proyecto: todo umbral de negocio va en tabla
 * paramétrica con CRUD/vista de admin (ver CLAUDE.md § "Nunca"). Mismo patrón visual que
 * `ComprasSettingsPanel`/`PricingSettingsPanel` (Card + inputs numéricos + botón Guardar que solo
 * aparece si hay cambios), pero como pantalla propia (no panel embebido) porque el ticket la pide
 * en su propia ruta — no hay una página "anfitriona" natural como Proveedores/Cotización para
 * embeber un panel acá.
 *
 * Gate de acceso: superadmin.all, doble capa a propósito —
 *  1. `App.tsx` la envuelve en `<RequirePermission permission="superadmin.all">` (mismo patrón que
 *     `AiUsagePage`/`SecurityAlertsPage`/`NotificationRulesPage`/`RolesPage`), que es la que de
 *     verdad protege la ruta.
 *  2. Este componente repite el check con `usePermission` y no renderiza el formulario si falla.
 *     Ninguna otra pantalla superadmin-only de este repo lo hace (la gate vive solo en App.tsx),
 *     pero el ticket pide explícitamente un test de "gate de permiso" y `RequirePermission` no es
 *     un componente exportado/testeable de forma aislada sin montar todo `App.tsx` — se prefirió
 *     esta pequeña redundancia a inflar el test con el árbol de rutas completo. A confirmar con
 *     Luis/Arquitecto si el equipo prefiere en cambio agregar un test de routing a nivel App.
 */

// Rangos calcados de BodegaSettingsRequest (backend) — min:1 en los 5 campos, nunca min:0:
// BodegaSettingsService::intSetting() descarta silenciosamente cualquier valor persistido <= 0
// y cae al default, así que el backend rechaza 0 con 422; el frontend debe rechazarlo también
// antes de enviarlo, no solo confiar en el mensaje de error de la API.
const FIELD_RANGES = {
  urgente_ventana_dias:     { min: 1, max: 365 },
  pendientes_picking_horas: { min: 1, max: 168 },
  pendientes_guia_dias:     { min: 1, max: 365 },
  rotacion_ventana_dias:    { min: 1, max: 365 },
  rotacion_top_n:           { min: 1, max: 100 },
  // SCRUM-493 (REQ-423 RN1) — % de concentración que dispara el aviso de "Capacidad por bodega".
  capacidad_concentracion_pct: { min: 1, max: 100 },
} as const satisfies Record<keyof BodegaSettings, { min: number; max: number }>

function buildSchema(t: TFunction) {
  const intField = (min: number, max: number) =>
    z.coerce.number({ invalid_type_error: t('bodega:settings.validation.required') })
      .int(t('bodega:settings.validation.integer'))
      .min(min, t('bodega:settings.validation.range', { min, max }))
      .max(max, t('bodega:settings.validation.range', { min, max }))

  return z.object({
    urgente_ventana_dias:          intField(FIELD_RANGES.urgente_ventana_dias.min, FIELD_RANGES.urgente_ventana_dias.max),
    pendientes_picking_horas: intField(FIELD_RANGES.pendientes_picking_horas.min, FIELD_RANGES.pendientes_picking_horas.max),
    pendientes_guia_dias:     intField(FIELD_RANGES.pendientes_guia_dias.min, FIELD_RANGES.pendientes_guia_dias.max),
    rotacion_ventana_dias:    intField(FIELD_RANGES.rotacion_ventana_dias.min, FIELD_RANGES.rotacion_ventana_dias.max),
    rotacion_top_n:           intField(FIELD_RANGES.rotacion_top_n.min, FIELD_RANGES.rotacion_top_n.max),
    capacidad_concentracion_pct: intField(FIELD_RANGES.capacidad_concentracion_pct.min, FIELD_RANGES.capacidad_concentracion_pct.max),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

const FIELDS: { key: keyof BodegaSettings; i18nKey: string }[] = [
  { key: 'urgente_ventana_dias',          i18nKey: 'urgenteVentanaDias' },
  { key: 'pendientes_picking_horas', i18nKey: 'pendientesPickingHoras' },
  { key: 'pendientes_guia_dias',     i18nKey: 'pendientesGuiaDias' },
  { key: 'rotacion_ventana_dias',    i18nKey: 'rotacionVentanaDias' },
  { key: 'rotacion_top_n',           i18nKey: 'rotacionTopN' },
  { key: 'capacidad_concentracion_pct', i18nKey: 'capacidadConcentracionPct' },
]

export default function BodegaSettingsPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const isSuperadmin = usePermission('superadmin.all')

  const { data: settings, isLoading } = useBodegaSettings(isSuperadmin)
  const mutation = useUpdateBodegaSettings()

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
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('bodega:settings.forbidden')}</p>
      </div>
    )
  }

  const onSubmit = (data: FormData) => mutation.mutate(data)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:settings.title')}</h1>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('bodega:settings.subtitle')}</p>

      <Card variant="panel" shadow className="overflow-hidden">
        {isLoading
          ? <div className="px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
          // noValidate — el navegador (y jsdom en los tests) bloquea silenciosamente el evento
          // submit si el input excede el `min`/`max` HTML5 nativo, antes de que React/RHF/Zod
          // lleguen a correr; Zod es la única fuente de verdad de validación acá (regla del
          // ticket), los atributos `min`/`max` del input solo quedan como affordance del
          // spinner nativo, sin bloquear el submit.
          : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-6 py-5 space-y-5">
              {FIELDS.map(({ key, i18nKey }) => (
                <div key={key}>
                  <label htmlFor={key} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t(`bodega:settings.fields.${i18nKey}.label`)}
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
                    {t(`bodega:settings.fields.${i18nKey}.help`)}
                  </p>
                  {errors[key] && (
                    <p className="text-xs text-red-500 mt-1">{errors[key]?.message}</p>
                  )}
                </div>
              ))}

              {isDirty && (
                <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending}>
                  {t('bodega:settings.save')}
                </Button>
              )}

              {mutation.isSuccess && !isDirty && (
                <p className="text-xs text-[#5BA5A0] font-medium">{t('bodega:settings.saved')}</p>
              )}
              {mutation.isError && (
                <p className="text-xs text-red-500">
                  {mutationErrorMessage(mutation.error, t('bodega:settings.saveError'))}
                </p>
              )}
            </form>
          )}
      </Card>
    </div>
  )
}
