import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { processApproversApi, type ApprovalProcess } from '@/api/approverSubstitutesApi'
import { usersApi } from '@/api/usersApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { parseApiValidationError, summaryMessage } from '@/lib/apiValidationError'

const KEY = ['admin/process-approvers'] as const
const PROCESSES: ApprovalProcess[] = ['caja_chica', 'arqueo', 'anulacion_cobro', 'nota_credito']

/**
 * Fase 28 — aprobadores propios por proceso de Admin & Contab. Un proceso sin aprobadores propios sigue al
 * aprobador primario y a sus suplentes; con aprobadores propios, solo ellos (más superadmin) lo deciden.
 */
export default function ProcessApproversPanel() {
  const { t } = useTranslation('common')
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: processApproversApi.get })
  const users = useQuery({ queryKey: ['users', 'approver-candidates'], queryFn: () => usersApi.list({ is_active: true, per_page: 200 }) })
  const [candidate, setCandidate] = useState<Partial<Record<ApprovalProcess, string>>>({})

  const save = useMutation({
    mutationFn: ({ process, ids }: { process: ApprovalProcess; ids: number[] }) => processApproversApi.save(process, ids),
    onSuccess: (res, { process }) => { qc.setQueryData(KEY, res); setCandidate(c => ({ ...c, [process]: '' })) },
  })

  const lista = users.data?.data ?? []
  const nombre = (id: number) => {
    const u = lista.find(x => x.id === id)
    return u ? `${u.first_name} ${u.last_name}` : `#${id}`
  }

  if (isLoading) return <p className="text-sm text-slate-400">{t('processApprovers.loading')}</p>
  if (error || !data) return <p className="text-sm text-red-600">{t('processApprovers.loadError')}</p>

  return (
    <Card className="p-5 flex flex-col gap-4" data-testid="process-approvers">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('processApprovers.title')}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('processApprovers.subtitle')}</p>
      </div>

      {PROCESSES.map(process => {
        const ids = data.processes[process]?.user_ids ?? []
        const pick = candidate[process] ?? ''
        return (
          <section key={process} aria-label={t(`processApprovers.processes.${process}`)} className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t(`processApprovers.processes.${process}`)}</h3>
            {ids.length === 0 ? (
              <p className="text-xs text-slate-400 mt-1">{t('processApprovers.followsPrimary')}</p>
            ) : (
              <ul className="flex flex-col gap-1 mt-1">
                {ids.map(id => (
                  <li key={id} className="flex items-center justify-between text-sm border border-slate-100 dark:border-slate-700 rounded-md px-3 py-1.5">
                    <span>{nombre(id)}</span>
                    <Button variant="outline" className="!px-2 !py-1 !text-xs" disabled={save.isPending}
                      onClick={() => save.mutate({ process, ids: ids.filter(x => x !== id) })}>
                      {t('processApprovers.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 mt-2">
              <select aria-label={`${t('processApprovers.addLabel')} — ${t(`processApprovers.processes.${process}`)}`} value={pick}
                onChange={e => setCandidate(c => ({ ...c, [process]: e.target.value }))}
                className="border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-slate-800 flex-1">
                <option value="">{t('processApprovers.choose')}</option>
                {lista.filter(u => !ids.includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.email}</option>)}
              </select>
              <Button disabled={pick === '' || save.isPending}
                onClick={() => save.mutate({ process, ids: [...ids, Number(pick)] })}>
                {t('processApprovers.add')}
              </Button>
            </div>
          </section>
        )
      })}
      {save.isError && <p role="alert" className="text-xs text-red-600">{summaryMessage(parseApiValidationError(save.error), t('processApprovers.saveError'))}</p>}
    </Card>
  )
}
