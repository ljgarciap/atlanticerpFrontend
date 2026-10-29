import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { approverSubstitutesApi } from '@/api/approverSubstitutesApi'
import { usersApi } from '@/api/usersApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const KEY = ['admin/primary-approver-substitutes'] as const

function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { message?: string, errors?: Record<string, string[]> } | undefined
    return data?.errors ? Object.values(data.errors).flat().join(' ') : (data?.message ?? fallback)
  }
  return fallback
}

/** Fase 12b — quién más puede aprobar lo que decide el aprobador titular (notas de crédito, anulaciones, órdenes de compra, caja…). */
export default function ApproverSubstitutesPanel() {
  const { t } = useTranslation('common')
  const qc = useQueryClient()
  const [candidate, setCandidate] = useState('')

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: approverSubstitutesApi.get })
  const users = useQuery({ queryKey: ['users', 'approver-candidates'], queryFn: () => usersApi.list({ is_active: true, per_page: 200 }) })

  const save = useMutation({
    mutationFn: (ids: number[]) => approverSubstitutesApi.save(ids),
    onSuccess: res => { qc.setQueryData(KEY, res); setCandidate('') },
  })

  const suplentes = data?.suplentes ?? []
  const excluidos = new Set<number>([...suplentes.map(s => s.id), ...[data?.titular_compras, data?.titular_admin_contab].filter((v): v is number => typeof v === 'number')])
  const opciones = (users.data?.data ?? []).filter(u => !excluidos.has(u.id))
  const nombre = (id: number | null) => {
    if (id === null) return t('approversTab.none')
    const u = users.data?.data.find(x => x.id === id)
    return u ? `${u.first_name} ${u.last_name}` : `#${id}`
  }

  if (isLoading) return <p className="text-sm text-slate-400">{t('approversTab.loading')}</p>
  if (error) return <p className="text-sm text-red-600">{errorMessage(error, t('approversTab.loadError'))}</p>

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('approversTab.title')}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('approversTab.subtitle')}</p>
      </div>

      <dl className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">{t('approversTab.titularCompras')}</dt><dd>{nombre(data?.titular_compras ?? null)}</dd>
        <dt className="font-semibold">{t('approversTab.titularAdminContab')}</dt><dd>{nombre(data?.titular_admin_contab ?? null)}</dd>
      </dl>

      <ul className="flex flex-col gap-1" aria-label={t('approversTab.listLabel')}>
        {suplentes.length === 0 && <li className="text-xs text-slate-400">{t('approversTab.empty')}</li>}
        {suplentes.map(s => (
          <li key={s.id} className="flex items-center justify-between text-sm border border-slate-100 dark:border-slate-700 rounded-md px-3 py-1.5">
            <span>{s.name} <span className="text-xs text-slate-400">{s.email}</span></span>
            <Button variant="outline" className="!px-2 !py-1 !text-xs" disabled={save.isPending}
              onClick={() => save.mutate(suplentes.filter(x => x.id !== s.id).map(x => x.id))}>
              {t('approversTab.remove')}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <select aria-label={t('approversTab.addLabel')} value={candidate} onChange={e => setCandidate(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-slate-800 flex-1">
          <option value="">{t('approversTab.choose')}</option>
          {opciones.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.email}</option>)}
        </select>
        <Button disabled={candidate === '' || save.isPending} loading={save.isPending}
          onClick={() => save.mutate([...suplentes.map(s => s.id), Number(candidate)])}>
          {t('approversTab.add')}
        </Button>
      </div>
      {save.isError && <p className="text-xs text-red-600">{errorMessage(save.error, t('approversTab.saveError'))}</p>}
    </Card>
  )
}
