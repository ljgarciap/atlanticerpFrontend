import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PricingSettingsValue } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * REQ-033 (2026-07-12): antes eran constantes PHP hardcodeadas — Luis pidió
 * que cualquier porcentaje/fórmula susceptible de cambiar en el tiempo viva
 * en una tabla paramétrica con CRUD admin/superadmin, no en código. Mismo
 * patrón que ReportsConfigPanel (settings, sin la parte de Metas).
 */
export default function PricingSettingsPanel() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['ventas-diseno-pricing-settings'],
    queryFn:  () => ventasDisenoApi.pricingSettings.get(),
  })

  const [projectDiscount, setProjectDiscount] = useState('')
  const [specialAdditional, setSpecialAdditional] = useState('')
  const [partnerDivisor, setPartnerDivisor] = useState('')
  const [premiumDivisor, setPremiumDivisor] = useState('')
  const [minMargin, setMinMargin] = useState('')

  useEffect(() => {
    if (!settings) return
    setProjectDiscount(String(settings.project_discount_percent))
    setSpecialAdditional(String(settings.special_additional_discount_percent))
    setPartnerDivisor(String(settings.partner_divisor))
    setPremiumDivisor(String(settings.premium_divisor))
    setMinMargin(String(settings.min_margin_percent))
  }, [settings])

  const mutation = useMutation({
    mutationFn: (data: Partial<PricingSettingsValue>) => ventasDisenoApi.pricingSettings.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pricing-settings'] })
      // Mismo bug ya conocido en ReportsConfigPanel: sin invalidar la cotización
      // abierta, los totales recién calculados con la nueva fórmula no se ven
      // hasta un F5 manual.
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote'] })
    },
  })

  const dirty = settings != null && (
    projectDiscount !== String(settings.project_discount_percent)
    || specialAdditional !== String(settings.special_additional_discount_percent)
    || partnerDivisor !== String(settings.partner_divisor)
    || premiumDivisor !== String(settings.premium_divisor)
    || minMargin !== String(settings.min_margin_percent)
  )

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:quote.pricingConfig.title')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:quote.pricingConfig.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:quote.pricingConfig.projectDiscount')}
          </label>
          <input type="number" value={projectDiscount} onChange={e => setProjectDiscount(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:quote.pricingConfig.specialAdditional')}
          </label>
          <input type="number" value={specialAdditional} onChange={e => setSpecialAdditional(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:quote.pricingConfig.partnerDivisor')}
          </label>
          <input type="number" step="0.01" value={partnerDivisor} onChange={e => setPartnerDivisor(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:quote.pricingConfig.premiumDivisor')}
          </label>
          <input type="number" step="0.01" value={premiumDivisor} onChange={e => setPremiumDivisor(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:quote.pricingConfig.minMargin')}
          </label>
          <input type="number" step="0.01" value={minMargin} onChange={e => setMinMargin(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      {dirty && (
        <Button
          onClick={() => mutation.mutate({
            project_discount_percent: Number(projectDiscount),
            special_additional_discount_percent: Number(specialAdditional),
            partner_divisor: Number(partnerDivisor),
            premium_divisor: Number(premiumDivisor),
            min_margin_percent: Number(minMargin),
          })}
          loading={mutation.isPending}
        >
          {t('common:actions.save')}
        </Button>
      )}
    </Card>
  )
}
