import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoSettings } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { ServiciosSetting } from '@/types/servicios'

// Batch 12 (REQ-237) — 'cotizacion' agrega ITBMS + Condiciones del servicio. Ambas keys ya
// existían en `ServiciosSettingsService::schema()` desde Batch 11 (ITBMS) pero esta pantalla nunca
// las mostraba — `GROUP_ORDER` no incluía el grupo, gap real cerrado en este batch (ver reporte de
// la tarea).
const GROUP_ORDER: ServiciosSetting['group'][] = ['cotizacion', 'operacion', 'sla', 'comision']

// Batch 10 (decisión de Luis 2026-08-11) — "Ajustes de Servicios", CRUD genérico sobre
// ServiciosSettingsService::schema(). Lectura amplia (mismo criterio que /sla-settings hoy),
// escritura exclusiva de Gerencia — el formulario queda visible-pero-deshabilitado para el resto,
// no oculto, para que cualquier rol con acceso a Servicios pueda VER los umbrales vigentes (mismo
// criterio ya usado en InternalTechnicianCommissionModal para la sección de SLA).
function canEdit(role: string | undefined): boolean {
  return role === 'superadmin' || role === 'management'
}

export default function ServiciosSettingsPage() {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const qc      = useQueryClient()
  const user    = useAuthStore(s => s.user)
  const editable = canEdit(user?.role)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['servicios-settings'],
    queryFn:  () => serviciosApi.settings.list(),
  })

  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (settings) {
      setValues(Object.fromEntries(settings.map(s => [s.key, String(s.value)])))
    }
  }, [settings])

  const isDirty = settings?.some(s => values[s.key] !== undefined && values[s.key] !== String(s.value)) ?? false

  const mutation = useMutation({
    mutationFn: () => {
      // Batch 12 — `type: 'text'` (ej. Condiciones) manda el string tal cual, nunca `Number(raw)`
      // (que lo colapsaría a `NaN`/`0`); el resto de los tipos sigue como antes.
      const changed: Record<string, number | string> = {}
      for (const s of settings ?? []) {
        const raw = values[s.key]
        if (raw === undefined || raw === String(s.value)) continue
        changed[s.key] = s.type === 'text' ? raw : Number(raw)
      }
      return serviciosApi.settings.update(changed)
    },
    onSuccess: () => {
      toast(t('settings.saved'), 'success')
      void qc.invalidateQueries({ queryKey: ['servicios-settings'] })
      // SLA compartido con InternalTechnicianCommissionModal (misma tabla, distinta ruta) — sin
      // esto, editar SLA acá dejaría esa otra pantalla mostrando el valor viejo hasta refrescar.
      void qc.invalidateQueries({ queryKey: ['servicios-sla-settings'] })
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('settings.error'), 'error')
    },
  })

  const byGroup = new Map<ServiciosSetting['group'], ServiciosSetting[]>()
  for (const s of settings ?? []) {
    const list = byGroup.get(s.group) ?? []
    list.push(s)
    byGroup.set(s.group, list)
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('settings.title')}</h1>
        </div>
        {!editable && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{t('settings.readOnlyNote')}</p>
        )}

        <Card variant="panel" shadow className="overflow-hidden">
          {isLoading ? (
            <div className="px-6 py-8 text-slate-400 text-sm">{t('settings.loading')}</div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {GROUP_ORDER.filter(g => byGroup.has(g)).map(group => (
                <div key={group}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
                    {t(`settings.groups.${group}`)}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(byGroup.get(group) ?? []).map(setting => (
                      <label
                        key={setting.key}
                        className={`text-sm block${setting.type === 'text' ? ' sm:col-span-2' : ''}`}
                      >
                        <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          {setting.label}
                        </span>
                        {setting.type === 'text' ? (
                          // REQ-237 — Condiciones del servicio: texto libre configurado por Gerencia,
                          // gate de edición mismo criterio que el resto (visible-no-editable para
                          // el resto de roles).
                          <textarea
                            rows={5}
                            disabled={!editable}
                            value={values[setting.key] ?? ''}
                            onChange={e => setValues(v => ({ ...v, [setting.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                          />
                        ) : (
                          <input
                            type="number"
                            step={setting.type === 'float' ? '0.1' : '1'}
                            min={0}
                            disabled={!editable}
                            value={values[setting.key] ?? ''}
                            onChange={e => setValues(v => ({ ...v, [setting.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {editable && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <Button onClick={() => mutation.mutate()} disabled={!isDirty} loading={mutation.isPending}>
                    {t('settings.save')}
                  </Button>
                  {isDirty && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">{t('settings.unsavedChanges')}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
