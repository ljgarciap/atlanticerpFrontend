import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { ReportPeriod } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface Props {
  scope:  'own' | 'team'
  period: ReportPeriod
}

export default function CommissionsPanel({ scope, period }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const canMarkPaid = usePermission('ventas_diseno.commissions.mark_paid')

  const { data: summary, isLoading } = useQuery({
    queryKey: ['ventas-diseno-commissions', scope, period],
    queryFn:  () => ventasDisenoApi.reports.commissions.summary({ scope, period }),
  })

  const markPaidMutation = useMutation({
    mutationFn: (cohortId: number) => ventasDisenoApi.reports.commissions.markPaid(cohortId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-commissions'] }),
  })

  return (
    <Card variant="panel" className="p-4">
      <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:reports.commissions.title')}
      </div>
      <div className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:reports.commissions.subtitle')}</div>

      {isLoading || !summary ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('ventasDiseno:reports.commissions.paid')}</div>
              <div className="text-lg font-bold text-emerald-600">${summary.paid.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('ventasDiseno:reports.commissions.pending')}</div>
              <div className="text-lg font-bold text-amber-600">${summary.pending.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('ventasDiseno:reports.commissions.finalStage')}</div>
              <div className="text-lg font-bold text-slate-500">${summary.final_stage.toLocaleString()}</div>
            </div>
          </div>

          {summary.cohorts.length === 0 ? (
            <p className="text-sm text-slate-400">{t('ventasDiseno:reports.commissions.empty')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-1.5">{t('ventasDiseno:reports.commissions.vendor')}</th>
                  <th className="pb-1.5">{t('ventasDiseno:reports.commissions.month')}</th>
                  <th className="pb-1.5">{t('ventasDiseno:reports.commissions.percent')}</th>
                  <th className="pb-1.5">{t('ventasDiseno:reports.commissions.commission')}</th>
                  <th className="pb-1.5">{t('ventasDiseno:reports.commissions.status')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.cohorts.map(c => (
                  <tr key={`${c.owner_id}-${c.month}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2">{c.owner_name}</td>
                    <td className="py-1.5 pr-2">{c.month}</td>
                    <td className="py-1.5 pr-2">{c.commission_percent}%</td>
                    <td className="py-1.5 pr-2 font-semibold">${c.commission_amount.toLocaleString()}</td>
                    <td className="py-1.5 pr-2">
                      {c.paid_at ? (
                        <span className="text-[11px] text-emerald-600">{t('ventasDiseno:reports.commissions.statusPaid')}</span>
                      ) : canMarkPaid && c.id !== null ? (
                        <Button
                          variant="secondary"
                          onClick={() => markPaidMutation.mutate(c.id as number)}
                          loading={markPaidMutation.isPending}
                        >
                          {t('ventasDiseno:reports.commissions.markPaid')}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-400">{t('ventasDiseno:reports.commissions.statusPending')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  )
}
