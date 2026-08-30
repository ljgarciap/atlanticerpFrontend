import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { AuditLogEntry } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const ENTITY_TYPES = [
  'pipeline_card', 'pipeline_card_contact', 'pipeline_card_file',
  'master_client', 'sub_client', 'sub_client_contact',
  'quote', 'quote_part', 'quote_item', 'architect',
]

function actionVerb(action: string): 'created' | 'updated' | 'deleted' | null {
  if (action.endsWith('.created')) return 'created'
  if (action.endsWith('.updated')) return 'updated'
  if (action.endsWith('.deleted')) return 'deleted'
  return null
}

function formatDiff(entry: AuditLogEntry): string {
  const old = entry.old_values ?? {}
  const next = entry.new_values ?? {}
  const keys = Array.from(new Set([...Object.keys(old), ...Object.keys(next)])).filter(k => k !== 'id')

  if (keys.length === 0) return '—'

  return keys
    .slice(0, 4)
    .map(k => {
      const before = old[k]
      const after = next[k]
      if (before === undefined) return `${k}: ${JSON.stringify(after)}`
      if (after === undefined) return `${k}: ${JSON.stringify(before)} → —`
      return `${k}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
    })
    .join(', ')
}

export default function VentasDisenoAuditLogPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const { data: result, isLoading } = useQuery({
    queryKey: ['ventas-diseno-audit-log', entityType, entityId, from, to, page],
    queryFn: () => ventasDisenoApi.auditLog.list({
      entity_type: entityType || undefined,
      entity_id: entityId ? Number(entityId) : undefined,
      from: from || undefined,
      to: to || undefined,
      page,
    }),
  })

  const rows = result?.data ?? []
  const hasFilters = entityType || entityId || from || to

  function clearFilters() {
    setEntityType('')
    setEntityId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {t('ventasDiseno:auditLog.title')}
        </h1>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          {t('ventasDiseno:auditLog.subtitle')}
        </p>
      </div>

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <select
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        >
          <option value="">{t('ventasDiseno:auditLog.filters.allTypes')}</option>
          {ENTITY_TYPES.map(type => (
            <option key={type} value={type}>{t(`ventasDiseno:auditLog.entityType.${type}`)}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder={t('ventasDiseno:auditLog.filters.entityId')}
          value={entityId}
          onChange={e => { setEntityId(e.target.value); setPage(1) }}
          className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="date"
          aria-label={t('ventasDiseno:auditLog.filters.from')}
          value={from}
          onChange={e => { setFrom(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="date"
          aria-label={t('ventasDiseno:auditLog.filters.to')}
          value={to}
          onChange={e => { setTo(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        {hasFilters && (
          <Button variant="secondary" onClick={clearFilters}>{t('ventasDiseno:auditLog.filters.clear')}</Button>
        )}
      </Card>

      <Card variant="panel" className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:auditLog.table.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('ventasDiseno:auditLog.table.date')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:auditLog.table.user')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:auditLog.table.action')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:auditLog.table.entity')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:auditLog.table.changes')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(entry => {
                  const verb = actionVerb(entry.action)
                  return (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{entry.user?.name ?? t('ventasDiseno:auditLog.table.systemUser')}</td>
                      <td className="px-3 py-2">{verb ? t(`ventasDiseno:auditLog.action.${verb}`) : entry.action}</td>
                      <td className="px-3 py-2">
                        {entry.entity_type ? t(`ventasDiseno:auditLog.entityType.${entry.entity_type}`) : '—'}
                        {entry.entity_id ? ` #${entry.entity_id}` : ''}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-slate-500 dark:text-slate-400 max-w-[420px] truncate" title={formatDiff(entry)}>
                        {formatDiff(entry)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {result && result.last_page > 1 && (
        <div className="flex items-center justify-between mt-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t('ventasDiseno:auditLog.pagination.prev')}
          </Button>
          <span className="text-[12px] text-slate-500">
            {t('ventasDiseno:auditLog.pagination.page', { current: result.current_page, last: result.last_page })}
          </span>
          <Button variant="secondary" disabled={page >= result.last_page} onClick={() => setPage(p => p + 1)}>
            {t('ventasDiseno:auditLog.pagination.next')}
          </Button>
        </div>
      )}
    </>
  )
}
