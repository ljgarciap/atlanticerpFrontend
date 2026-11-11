import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import {
  useAssistantMapping, useReassignPendingToMappedAssistant, useRemoveAssistantMapping,
  useSetAssistantMapping, useTeamMembersByRole,
} from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function errorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

/**
 * Fase 32 — mapeo vendedor→asistente de llegadas (rutas de la Fase 29a, hasta ahora solo por API).
 * Editable por el Líder de Bodega y superadmin (el servidor lo exige); quitar un mapeo no mueve los pedidos ya
 * creados y «Reasignar pendientes» es una acción explícita.
 */
export default function AssistantMappingPanel() {
  const { t } = useTranslation(['bodega'])
  const { data: rows, isLoading } = useAssistantMapping()
  const { data: sellers } = useTeamMembersByRole('vendedor', true)
  const { data: assistants } = useTeamMembersByRole('asistente_bodega', true)
  const setMapping = useSetAssistantMapping()
  const removeMapping = useRemoveAssistantMapping()
  const reassign = useReassignPendingToMappedAssistant()
  const [sellerId, setSellerId] = useState('')
  const [assistantId, setAssistantId] = useState('')

  const failure = [setMapping, removeMapping, reassign].find(m => m.isError)
  const select = 'rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm'

  function save() {
    if (!sellerId || !assistantId) return
    setMapping.mutate({ sellerId: Number(sellerId), assistantId: Number(assistantId) }, {
      onSuccess: () => { setSellerId(''); setAssistantId('') },
    })
  }

  return (
    <Card variant="panel" shadow className="overflow-hidden mt-6" data-testid="assistant-mapping-panel">
      <div className="px-6 pt-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('bodega:settings.assistantMapping.title')}</h2>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 mb-3">{t('bodega:settings.assistantMapping.help')}</p>
      </div>

      <div className="px-6 pb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          {t('bodega:settings.assistantMapping.seller')}
          <select className={select} value={sellerId} onChange={e => setSellerId(e.target.value)} data-testid="mapping-seller">
            <option value="">{t('bodega:settings.assistantMapping.select')}</option>
            {sellers?.data.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          {t('bodega:settings.assistantMapping.assistant')}
          <select className={select} value={assistantId} onChange={e => setAssistantId(e.target.value)} data-testid="mapping-assistant">
            <option value="">{t('bodega:settings.assistantMapping.select')}</option>
            {assistants?.data.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <Button type="button" onClick={save} disabled={!sellerId || !assistantId || setMapping.isPending} data-testid="mapping-save">
          {t('bodega:settings.assistantMapping.save')}
        </Button>
      </div>

      {isLoading || !rows ? (
        <div className="px-6 py-6 text-slate-400 text-sm">{t('bodega:settings.assistantMapping.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-6 text-slate-400 text-sm" data-testid="mapping-empty">{t('bodega:settings.assistantMapping.empty')}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-y border-slate-100 dark:border-slate-700">
              <th className="px-6 py-2 text-left">{t('bodega:settings.assistantMapping.columns.seller')}</th>
              <th className="px-3 py-2 text-left">{t('bodega:settings.assistantMapping.columns.assistant')}</th>
              <th className="px-6 py-2 text-right">{t('bodega:settings.assistantMapping.columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map(row => (
              <tr key={row.id} data-testid={`mapping-row-${row.id}`}>
                <td className="px-6 py-2 font-medium text-slate-800 dark:text-slate-100">{row.seller_name}</td>
                <td className="px-3 py-2">{row.assistant_name}</td>
                <td className="px-6 py-2 text-right space-x-2">
                  <Button type="button" variant="secondary" disabled={reassign.isPending} onClick={() => reassign.mutate(row.seller_id)} data-testid={`mapping-reassign-${row.id}`}>
                    {t('bodega:settings.assistantMapping.reassign')}
                  </Button>
                  <Button
                    type="button" variant="secondary" disabled={removeMapping.isPending} data-testid={`mapping-remove-${row.id}`}
                    onClick={() => { if (window.confirm(t('bodega:settings.assistantMapping.removeConfirm', { name: row.seller_name }))) removeMapping.mutate(row.id) }}
                  >
                    {t('bodega:settings.assistantMapping.remove')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reassign.isSuccess && (
        <p className="px-6 py-2 text-xs text-emerald-600" data-testid="mapping-reassigned">
          {t('bodega:settings.assistantMapping.reassigned', { count: reassign.data.reasignados })}
        </p>
      )}
      {failure && <p className="px-6 py-2 text-xs text-red-500">{errorMessage(failure.error, t('bodega:settings.assistantMapping.error'))}</p>}
    </Card>
  )
}
