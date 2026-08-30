import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnomalyStatus, SecurityAnomaly } from '@/api/securityAnomaliesApi'
import { useSecurityAnomalies, useConfirmAnomaly, useDismissAnomaly, useUnblockUser } from '@/hooks/useSecurityAnomalies'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const SEVERITY_STYLES: Record<SecurityAnomaly['severity'], string> = {
  low:    'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
  medium: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  high:   'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

const STATUS_STYLES: Record<AnomalyStatus, string> = {
  pending:   'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  confirmed: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  dismissed: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
}

export default function SecurityAlertsPage() {
  const { t } = useTranslation(['security', 'common'])
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | undefined>('pending')

  const { data: anomalies = [], isFetching } = useSecurityAnomalies(statusFilter)
  const confirmMutation = useConfirmAnomaly()
  const dismissMutation = useDismissAnomaly()
  const unblockMutation = useUnblockUser()

  const filters: { id: AnomalyStatus | 'all'; label: string }[] = [
    { id: 'pending',   label: t('security:alerts.filters.pending') },
    { id: 'confirmed', label: t('security:alerts.filters.confirmed') },
    { id: 'dismissed', label: t('security:alerts.filters.dismissed') },
    { id: 'all',       label: t('security:alerts.filters.all') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('security:alerts.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t('security:alerts.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <Button
            key={f.id}
            variant="outline"
            active={(statusFilter ?? 'all') === f.id}
            className="!px-3 !py-1.5 !text-xs"
            onClick={() => setStatusFilter(f.id === 'all' ? undefined : f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isFetching && anomalies.length === 0 && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">
          {t('common:labels.loading')}
        </Card>
      )}

      {!isFetching && anomalies.length === 0 && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">
          {t('security:alerts.empty')}
        </Card>
      )}

      <div className="space-y-3">
        {anomalies.map(anomaly => (
          <Card key={anomaly.id} variant="panel" className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEVERITY_STYLES[anomaly.severity]}`}>
                    {t(`security:alerts.severity.${anomaly.severity}`)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[anomaly.status]}`}>
                    {t(`security:alerts.status.${anomaly.status}`)}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(anomaly.detected_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">{anomaly.reasoning}</p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('security:alerts.affectedUser')}:{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {anomaly.affected_user?.name ?? t('security:alerts.userUnknown')}
                  </span>
                </p>

                {anomaly.reviewer && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {t('security:alerts.reviewedBy', { name: anomaly.reviewer.name })}
                  </p>
                )}
              </div>

              {anomaly.status === 'pending' && (
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate(anomaly.id)}
                  >
                    {t('security:alerts.actions.confirmBlock')}
                  </Button>
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={dismissMutation.isPending}
                    onClick={() => dismissMutation.mutate(anomaly.id)}
                  >
                    {t('security:alerts.actions.dismiss')}
                  </Button>
                </div>
              )}

              {anomaly.status === 'confirmed' && anomaly.affected_user && (
                <button
                  disabled={unblockMutation.isPending}
                  onClick={() => unblockMutation.mutate(anomaly.affected_user!.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 shrink-0">
                  {t('security:alerts.actions.unblock')}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
