import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { auditLogsApi, type AuditLogEntry, type AuditLogTipo } from '@/api/auditLogsApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

// SCRUM-793 (Epic SCRUM-788 — Logs y Telemetría) — generaliza
// src/pages/ventas-diseno/AuditLogPage.tsx (mismo patrón: filtros + tabla + diff + paginación) a
// todos los módulos, consumiendo el endpoint de SCRUM-792. La pantalla scoped de Ventas & Diseño
// (/ventas-diseno/audit-log) queda intacta — esta es la vista general, no un reemplazo.
const MODULES = ['ai', 'auth', 'bodega', 'compras', 'crm', 'security', 'servicios', 'settings', 'ventas_diseno']

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

export default function LogsPage() {
  const { t } = useTranslation(['logs', 'common'])

  const [module, setModule] = useState('')
  const [tipo, setTipo] = useState<AuditLogTipo | ''>('')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const { data: result, isLoading } = useQuery({
    queryKey: ['audit-logs', module, tipo, entityType, entityId, userId, from, to, page],
    queryFn: () => auditLogsApi.list({
      module: module || undefined,
      tipo: tipo || undefined,
      entity_type: entityType || undefined,
      entity_id: entityId ? Number(entityId) : undefined,
      user_id: userId ? Number(userId) : undefined,
      from: from || undefined,
      to: to || undefined,
      page,
    }),
  })

  const rows = result?.data ?? []
  const hasFilters = module || tipo || entityType || entityId || userId || from || to

  function clearFilters() {
    setModule('')
    setTipo('')
    setEntityType('')
    setEntityId('')
    setUserId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('logs:title')}</h1>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('logs:subtitle')}</p>
      </div>

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <select
          value={module}
          onChange={e => { setModule(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        >
          <option value="">{t('logs:filters.allModules')}</option>
          {MODULES.map(m => (
            <option key={m} value={m}>{t(`logs:module.${m}`)}</option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={e => { setTipo(e.target.value as AuditLogTipo | ''); setPage(1) }}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        >
          <option value="">{t('logs:filters.allTipos')}</option>
          <option value="cambio_dato">{t('logs:filters.cambioDato')}</option>
          <option value="accion">{t('logs:filters.accion')}</option>
        </select>
        <input
          type="text"
          placeholder={t('logs:filters.entityType')}
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1) }}
          className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="number"
          placeholder={t('logs:filters.entityId')}
          value={entityId}
          onChange={e => { setEntityId(e.target.value); setPage(1) }}
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="number"
          placeholder={t('logs:filters.userId')}
          value={userId}
          onChange={e => { setUserId(e.target.value); setPage(1) }}
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="date"
          aria-label={t('logs:filters.from')}
          value={from}
          onChange={e => { setFrom(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <input
          type="date"
          aria-label={t('logs:filters.to')}
          value={to}
          onChange={e => { setTo(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        {hasFilters && (
          <Button variant="secondary" onClick={clearFilters}>{t('logs:filters.clear')}</Button>
        )}
      </Card>

      <Card variant="panel" className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('logs:table.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('logs:table.date')}</th>
                  <th className="px-3 py-2">{t('logs:table.user')}</th>
                  <th className="px-3 py-2">{t('logs:table.module')}</th>
                  <th className="px-3 py-2">{t('logs:table.tipo')}</th>
                  <th className="px-3 py-2">{t('logs:table.action')}</th>
                  <th className="px-3 py-2">{t('logs:table.entity')}</th>
                  <th className="px-3 py-2">{t('logs:table.changes')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(entry => {
                  const verb = actionVerb(entry.action)
                  return (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{entry.user?.name ?? t('logs:table.systemUser')}</td>
                      <td className="px-3 py-2">{t(`logs:module.${entry.module}`)}</td>
                      <td className="px-3 py-2">
                        {entry.tipo === 'cambio_dato' ? t('logs:filters.cambioDato') : t('logs:filters.accion')}
                      </td>
                      <td className="px-3 py-2">{verb ? t(`logs:action.${verb}`) : entry.action}</td>
                      <td className="px-3 py-2">
                        {entry.entity_type ?? '—'}
                        {entry.entity_id ? ` #${entry.entity_id}` : ''}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-slate-500 dark:text-slate-400 max-w-[360px] truncate" title={formatDiff(entry)}>
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
            {t('logs:pagination.prev')}
          </Button>
          <span className="text-[12px] text-slate-500">
            {t('logs:pagination.page', { current: result.current_page, last: result.last_page })}
          </span>
          <Button variant="secondary" disabled={page >= result.last_page} onClick={() => setPage(p => p + 1)}>
            {t('logs:pagination.next')}
          </Button>
        </div>
      )}
    </>
  )
}
