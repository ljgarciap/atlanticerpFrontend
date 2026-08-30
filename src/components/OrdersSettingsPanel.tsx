import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { OrdersSettingsValue } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * REQ-625 (Epic CRM Batch F): el umbral de puntos porcentuales de "Margen bajó" no queda
 * hardcodeado pese a que la spec lo da como 5pp fijo — decisión de Luis 2026-07-31, mismo
 * patrón que PricingSettingsPanel (fila única, gateado por `ventas_diseno.pricing.configure`).
 */
export default function OrdersSettingsPanel() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['ventas-diseno-orders-settings'],
    queryFn:  () => ventasDisenoApi.ordersSettings.get(),
  })

  const [threshold, setThreshold] = useState('')

  useEffect(() => {
    if (!settings) return
    setThreshold(String(settings.margin_drop_threshold_pts))
  }, [settings])

  const mutation = useMutation({
    mutationFn: (data: Partial<OrdersSettingsValue>) => ventasDisenoApi.ordersSettings.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-orders-settings'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-orders'] })
    },
  })

  const dirty = settings != null && threshold !== String(settings.margin_drop_threshold_pts)

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:orders.settings.title')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:orders.settings.subtitle')}</p>
      <div className="max-w-xs mb-3">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          {t('ventasDiseno:orders.settings.threshold')}
        </label>
        <input type="number" step="0.01" min="0" value={threshold} onChange={e => setThreshold(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>
      {dirty && (
        <Button
          onClick={() => mutation.mutate({ margin_drop_threshold_pts: Number(threshold) })}
          loading={mutation.isPending}
        >
          {t('common:actions.save')}
        </Button>
      )}
    </Card>
  )
}
