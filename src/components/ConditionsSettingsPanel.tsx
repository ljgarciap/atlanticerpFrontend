import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * SCRUM-138 — Daniela pidió poder cambiar el texto de Condiciones (REQ-046) una vez y
 * que aplique a toda cotización NUEVA desde ese momento, en vez de editarlo cotización
 * por cotización. Mismo patrón que PricingSettingsPanel (permiso individual, sin
 * atarlo a ningún security_level). Las cotizaciones ya generadas conservan su propio
 * conditions_text — este panel solo cambia el default de las nuevas.
 */
export default function ConditionsSettingsPanel() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['ventas-diseno-quote-conditions-settings'],
    queryFn:  () => ventasDisenoApi.quoteConditionsSettings.get(),
  })

  const [text, setText] = useState('')

  useEffect(() => {
    if (settings) setText(settings.text)
  }, [settings])

  const mutation = useMutation({
    mutationFn: () => ventasDisenoApi.quoteConditionsSettings.update({ text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote-conditions-settings'] }),
  })

  const dirty = settings != null && text !== settings.text

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:quote.conditionsConfig.title')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:quote.conditionsConfig.subtitle')}</p>
      <textarea
        value={text} rows={7}
        onChange={e => setText(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono mb-3"
      />
      {dirty && (
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          {t('common:actions.save')}
        </Button>
      )}
    </Card>
  )
}
