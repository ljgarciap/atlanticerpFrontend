import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { useWarehouseSaleRules, useUpdateWarehouseSaleRule } from '@/hooks/useBodega'
import type { WarehouseSaleRule } from '@/types/bodega'
import { Card } from '@/components/ui/Card'

type RuleKey = 'permite_venta' | 'despacho_por_defecto' | 'excluye_disponible'

function errorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

/**
 * SCRUM-1196 — «Reglas de bodega» (Configuración de Bodega, solo superadmin): qué bodegas pueden surtir pedidos de venta, cuál es la de despacho por defecto
 * (siempre exactamente una, y de venta) y cuáles se excluyen del «Disponible» (lo de una bodega de venta excluida, hoy Sala de exhibición 1, se muestra aparte
 * a los vendedores). Regla del proyecto: estos valores de negocio se cambian aquí, sin deploy. El servidor valida las invariantes; esto solo las guía.
 */
export default function WarehouseSaleRulesPanel() {
  const { t } = useTranslation(['bodega'])
  const { data: rules, isLoading } = useWarehouseSaleRules()
  const mutation = useUpdateWarehouseSaleRule()

  function change(rule: WarehouseSaleRule, key: RuleKey, value: boolean) {
    mutation.mutate({ id: rule.id, data: { [key]: value } })
  }

  return (
    <Card variant="panel" shadow className="overflow-hidden mt-6" data-testid="warehouse-rules-panel">
      <div className="px-6 pt-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('bodega:settings.warehouseRules.title')}</h2>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 mb-3">{t('bodega:settings.warehouseRules.help')}</p>
      </div>

      {isLoading || !rules ? (
        <div className="px-6 py-6 text-slate-400 text-sm">{t('bodega:settings.warehouseRules.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-y border-slate-100 dark:border-slate-700">
                <th className="px-6 py-2 text-left">{t('bodega:settings.warehouseRules.columns.warehouse')}</th>
                <th className="px-3 py-2 text-center">{t('bodega:settings.warehouseRules.columns.sale')}</th>
                <th className="px-3 py-2 text-center">{t('bodega:settings.warehouseRules.columns.default')}</th>
                <th className="px-3 py-2 text-center">{t('bodega:settings.warehouseRules.columns.excludeAvailable')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rules.map(rule => (
                <tr key={rule.id} data-testid={`warehouse-rule-${rule.id}`}>
                  <td className="px-6 py-2 font-medium text-slate-800 dark:text-slate-100">{rule.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox" checked={rule.permite_venta}
                      // la de por defecto no puede dejar de vender: primero se elige otra como por defecto
                      disabled={mutation.isPending || rule.despacho_por_defecto || rule.is_active === false}
                      onChange={e => change(rule, 'permite_venta', e.target.checked)}
                      aria-label={t('bodega:settings.warehouseRules.aria.sale', { name: rule.name })}
                      data-testid={`rule-sale-${rule.id}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio" name="despacho_por_defecto" checked={rule.despacho_por_defecto}
                      disabled={mutation.isPending || !rule.permite_venta}
                      onChange={() => change(rule, 'despacho_por_defecto', true)}
                      aria-label={t('bodega:settings.warehouseRules.aria.default', { name: rule.name })}
                      data-testid={`rule-default-${rule.id}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox" checked={rule.excluye_disponible} disabled={mutation.isPending}
                      onChange={e => change(rule, 'excluye_disponible', e.target.checked)}
                      aria-label={t('bodega:settings.warehouseRules.aria.excludeAvailable', { name: rule.name })}
                      data-testid={`rule-exclude-${rule.id}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-6 py-3">
        {mutation.isError && (
          <p className="text-xs text-red-500" role="alert" data-testid="warehouse-rules-error">
            {errorMessage(mutation.error, t('bodega:settings.warehouseRules.saveError'))}
          </p>
        )}
        {mutation.isSuccess && (
          <p className="text-xs text-[#5BA5A0] font-medium" data-testid="warehouse-rules-saved">{t('bodega:settings.warehouseRules.saved')}</p>
        )}
      </div>
    </Card>
  )
}
