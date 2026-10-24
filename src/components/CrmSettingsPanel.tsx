import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projectsApi'
import type { CrmSettings } from '@/types/project'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { parseApiValidationError, summaryMessage } from '@/lib/apiValidationError'

/**
 * SCRUM-944/945 — auditoría de valores de negocio hardcodeados. `DashboardService`/
 * `ProjectService` tenían 3 umbrales de días hardcodeados (entrega próxima, frescura de
 * actividad) — migrados a `crm_settings` (ver `CrmSettingsService` en el backend). CRM no tiene
 * pantalla de configuración propia todavía, así que este panel solo se monta desde la vista
 * consolidada de superadmin (`GlobalSettingsPage`) — mismo patrón que `PricingSettingsPanel`.
 */
export default function CrmSettingsPanel() {
  const { t } = useTranslation(['common', 'crm'])
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['crm-settings'],
    queryFn:  () => projectsApi.settings.get(),
  })

  const [proximaDias, setProximaDias] = useState('')
  const [recentDias, setRecentDias]   = useState('')
  const [staleDias, setStaleDias]     = useState('')
  const [pdfMax, setPdfMax]           = useState('')
  const [pdfPhotos, setPdfPhotos]     = useState('')
  const [pdfVolume, setPdfVolume]     = useState('')
  const [pdfRetention, setPdfRetention] = useState('')

  useEffect(() => {
    if (!settings) return
    setProximaDias(String(settings.entrega_proxima_dias))
    setRecentDias(String(settings.freshness_recent_dias))
    setStaleDias(String(settings.freshness_stale_dias))
    setPdfMax(String(settings.catalog_pdf_max_single_products))
    setPdfPhotos(String(settings.catalog_pdf_max_single_photos))
    setPdfVolume(String(settings.catalog_pdf_volume_size))
    setPdfRetention(String(settings.catalog_pdf_export_retention_days))
  }, [settings])

  const mutation = useMutation({
    mutationFn: (data: Partial<CrmSettings>) => projectsApi.settings.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      // Los umbrales alimentan las alertas del Dashboard y los filtros urgency/freshness de
      // Proyectos — sin invalidar, el nuevo valor no se refleja hasta un F5 manual (mismo
      // gotcha ya conocido en useUpdateBodegaSettings/useUpdateComprasSettings).
      qc.invalidateQueries({ queryKey: ['crm-dashboard-kpis'] })
      qc.invalidateQueries({ queryKey: ['crm-projects'] })
    },
  })

  // Hallazgo B (Pre-QA SCRUM-945): un 422 del backend no se mostraba — el campo quedaba igual sin aviso.
  const apiError   = mutation.isError ? parseApiValidationError(mutation.error) : null
  const fieldError = (key: keyof CrmSettings) => apiError?.fields[key]?.join(' ')
  const showSummary = mutation.isError && Object.keys(apiError?.fields ?? {}).length === 0

  function edit(setter: (v: string) => void, value: string) {
    if (mutation.isError) mutation.reset()
    setter(value)
  }

  const dirty = settings != null && (
    proximaDias !== String(settings.entrega_proxima_dias)
    || recentDias !== String(settings.freshness_recent_dias)
    || staleDias !== String(settings.freshness_stale_dias)
    || pdfMax !== String(settings.catalog_pdf_max_single_products)
    || pdfPhotos !== String(settings.catalog_pdf_max_single_photos)
    || pdfVolume !== String(settings.catalog_pdf_volume_size)
    || pdfRetention !== String(settings.catalog_pdf_export_retention_days)
  )

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">{t('crm:settings.title')}</h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('crm:settings.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('crm:settings.fields.entregaProximaDias')}
          </label>
          <input
            type="number" min={1} step={1} value={proximaDias} onChange={e => edit(setProximaDias, e.target.value)}
            aria-invalid={fieldError('entrega_proxima_dias') ? true : undefined}
            className={`w-full rounded-md border px-3 py-1.5 text-sm ${fieldError('entrega_proxima_dias') ? 'border-red-400' : 'border-slate-300'}`}
          />
          {fieldError('entrega_proxima_dias') && <p role="alert" className="mt-1 text-xs text-red-500">{fieldError('entrega_proxima_dias')}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('crm:settings.fields.freshnessRecentDias')}
          </label>
          <input
            type="number" min={1} step={1} value={recentDias} onChange={e => edit(setRecentDias, e.target.value)}
            aria-invalid={fieldError('freshness_recent_dias') ? true : undefined}
            className={`w-full rounded-md border px-3 py-1.5 text-sm ${fieldError('freshness_recent_dias') ? 'border-red-400' : 'border-slate-300'}`}
          />
          {fieldError('freshness_recent_dias') && <p role="alert" className="mt-1 text-xs text-red-500">{fieldError('freshness_recent_dias')}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('crm:settings.fields.freshnessStaleDias')}
          </label>
          <input
            type="number" min={1} step={1} value={staleDias} onChange={e => edit(setStaleDias, e.target.value)}
            aria-invalid={fieldError('freshness_stale_dias') ? true : undefined}
            className={`w-full rounded-md border px-3 py-1.5 text-sm ${fieldError('freshness_stale_dias') ? 'border-red-400' : 'border-slate-300'}`}
          />
          {fieldError('freshness_stale_dias') && <p role="alert" className="mt-1 text-xs text-red-500">{fieldError('freshness_stale_dias')}</p>}
        </div>
      </div>
      {/* SCRUM-998 — PDF de Catálogo: hasta el máximo sale plano en el momento; por encima, un ZIP de volúmenes en segundo plano. */}
      <h4 className="text-[13px] font-bold text-slate-900 dark:text-slate-100 mb-1">{t('crm:settings.catalogPdf.title')}</h4>
      <p className="text-[12px] text-slate-400 mb-3">{t('crm:settings.catalogPdf.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {([
          ['catalog_pdf_max_single_products', 'catalogPdfMaxSingleProducts', pdfMax, setPdfMax, 1, 1000],
          ['catalog_pdf_max_single_photos', 'catalogPdfMaxSinglePhotos', pdfPhotos, setPdfPhotos, 1, 500],
          ['catalog_pdf_volume_size', 'catalogPdfVolumeSize', pdfVolume, setPdfVolume, 50, 1000],
          ['catalog_pdf_export_retention_days', 'catalogPdfExportRetentionDays', pdfRetention, setPdfRetention, 1, 90],
        ] as const).map(([field, labelKey, value, setter, min, max]) => (
          <div key={field}>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              {t(`crm:settings.fields.${labelKey}`)}
            </label>
            <input
              type="number" min={min} max={max} step={1} value={value} onChange={e => edit(setter, e.target.value)}
              aria-invalid={fieldError(field) ? true : undefined}
              className={`w-full rounded-md border px-3 py-1.5 text-sm ${fieldError(field) ? 'border-red-400' : 'border-slate-300'}`}
            />
            {fieldError(field) && <p role="alert" className="mt-1 text-xs text-red-500">{fieldError(field)}</p>}
          </div>
        ))}
      </div>
      {showSummary && (
        <p role="alert" className="text-xs text-red-500 mb-3">
          {summaryMessage(apiError, t('crm:settings.saveError'))}
        </p>
      )}
      {dirty && (
        <Button
          onClick={() => mutation.mutate({
            entrega_proxima_dias: Number(proximaDias),
            freshness_recent_dias: Number(recentDias),
            freshness_stale_dias: Number(staleDias),
            catalog_pdf_max_single_products: Number(pdfMax),
            catalog_pdf_max_single_photos: Number(pdfPhotos),
            catalog_pdf_volume_size: Number(pdfVolume),
            catalog_pdf_export_retention_days: Number(pdfRetention),
          })}
          loading={mutation.isPending}
        >
          {t('common:actions.save')}
        </Button>
      )}
    </Card>
  )
}
