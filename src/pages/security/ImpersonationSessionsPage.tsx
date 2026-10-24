import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImpersonationSessions, useRevokeImpersonation } from '@/hooks/useImpersonation'
import type { ImpersonationSession, ImpersonationSessionStatus } from '@/api/impersonationApi'
import { useToastStore } from '@/store/toastStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { formatDateTimeShort } from '@/utils/dates'

const STATUS_STYLES: Record<ImpersonationSessionStatus, string> = {
  active:  'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  ended:   'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  expired: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
}

const KNOWN_ENDED_REASONS = ['manual', 'expired', 'revoked', 'target_blocked'] as const

type StatusFilter = ImpersonationSessionStatus | 'all'
const FILTERS: StatusFilter[] = ['all', 'active', 'ended', 'expired']

/**
 * SCRUM-1158 (T7) — «Sesiones de soporte»: registro de las sesiones de Ver como usuario (quién observó a quién, motivo, duración) y
 * botón para terminar las activas. Solo superadmin (la ruta exige `superadmin.all`; el backend, `role:superadmin`). Filtro por estado y
 * paginación del lado del servidor, como el resto de listados.
 */
export default function ImpersonationSessionsPage() {
  const { t } = useTranslation(['security', 'common'])
  const [status, setStatus]   = useState<StatusFilter>('all')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [toTerminate, setToTerminate] = useState<ImpersonationSession | null>(null)

  const { data, isLoading, isError } = useImpersonationSessions({
    status:   status === 'all' ? undefined : status,
    page,
    per_page: perPage,
  })
  const revoke = useRevokeImpersonation()

  const sessions = data?.data ?? []
  const meta     = data?.meta

  const endedReasonLabel = (s: ImpersonationSession): string => {
    if (s.ended_reason === null) return '—'
    const known = (KNOWN_ENDED_REASONS as readonly string[]).includes(s.ended_reason)
    return t(`security:impersonations.endedReason.${known ? s.ended_reason : 'unknown'}`)
  }

  const confirmTerminate = () => {
    if (!toTerminate) return
    revoke.mutate(toTerminate.id, {
      onSuccess: () => {
        setToTerminate(null)
        useToastStore.getState().show(t('security:impersonations.terminated'), 'success')
      },
      onError: () => {
        setToTerminate(null)
        useToastStore.getState().show(t('security:impersonations.terminateError'), 'error')
      },
    })
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('security:impersonations.title')}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t('security:impersonations.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <Button
            key={f}
            variant="outline"
            active={status === f}
            className="!px-3 !py-1.5 !text-xs"
            onClick={() => { setStatus(f); setPage(1) }}
          >
            {t(`security:impersonations.filters.${f}`)}
          </Button>
        ))}
      </div>

      {isLoading && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">{t('common:labels.loading')}</Card>
      )}

      {isError && (
        <Card variant="panel" className="p-10 text-center text-red-500 text-sm" role="alert">
          {t('security:impersonations.loadError')}
        </Card>
      )}

      {!isLoading && !isError && sessions.length === 0 && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">{t('security:impersonations.empty')}</Card>
      )}

      {!isError && sessions.length > 0 && (
        <Card variant="panel" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.actor')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.target')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.reason')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.startedAt')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.endedAt')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.status')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.endedReason')}</th>
                  <th className="px-4 py-3.5">{t('security:impersonations.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.actor.name}</td>
                    <td className="px-4 py-3 text-slate-700">{s.target.name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[280px]">
                      <span className="block truncate" title={s.reason}>{s.reason}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTimeShort(s.started_at)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {s.ended_at ? formatDateTimeShort(s.ended_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[s.status]}`}>
                        {t(`security:impersonations.status.${s.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{endedReasonLabel(s)}</td>
                    <td className="px-4 py-3">
                      {s.status === 'active' && (
                        <Button type="button" variant="danger" onClick={() => setToTerminate(s)} className="!text-xs !px-2.5 !py-1">
                          {t('security:impersonations.terminate')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={n => { setPerPage(n === 'all' ? 100 : n); setPage(1) }}
          allowAll={false}
        />
      )}

      {toTerminate && (
        <div className="fixed inset-0 bg-slate-900/50 z-[1000] flex items-center justify-center p-4">
          <Card variant="modal" className="w-full max-w-md p-0">
            <div role="dialog" aria-modal="true" aria-labelledby="terminate-title">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 id="terminate-title" className="font-bold text-slate-800 text-base">{t('security:impersonations.terminateTitle')}</h2>
              </div>
              <div className="px-6 py-5 text-sm text-slate-700">
                {t('security:impersonations.terminateMessage', { actor: toTerminate.actor.name, target: toTerminate.target.name })}
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setToTerminate(null)} disabled={revoke.isPending}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="button" variant="danger" loading={revoke.isPending} onClick={confirmTerminate}>
                  {t('security:impersonations.terminateConfirm')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
