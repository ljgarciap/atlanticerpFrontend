import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { levelsApi, type SecurityLevelItem } from '@/api/levelsApi'
import SecurityLevelFormModal from '@/components/security/SecurityLevelFormModal'
import SecurityLevelPermissionsModal from '@/components/security/SecurityLevelPermissionsModal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoChevronLeft, IcoChevronRight } from '@/components/icons'

export default function SecurityLevelsPage() {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const [search,  setSearch]  = useState('')
  const [query,   setQuery]   = useState('')
  const [page,    setPage]    = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [modal,   setModal]   = useState<SecurityLevelItem | false>(false)
  const [permissionsModal, setPermissionsModal] = useState<SecurityLevelItem | false>(false)

  const { data, isFetching } = useQuery({
    queryKey: ['security-levels', { page, perPage, query }],
    queryFn:  () => levelsApi.list({ page, per_page: perPage, search: query }),
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      levelsApi.toggleStatus(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-levels'] }),
  })

  const levels   = data?.data ?? []
  const meta     = data?.meta
  const lastPage = meta?.last_page ?? 1

  const levelBadge = (level: number) => {
    const color = level <= 3 ? '#64748b' : level <= 6 ? '#5BA5A0' : level <= 9 ? '#9fc54d' : '#2a2520'
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-extrabold"
        style={{ background: color }}>
        {level}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('security:levels.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t('security:levels.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (setQuery(search), setPage(1))}
          placeholder={t('common:labels.searchByName')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={() => { setQuery(search); setPage(1) }}>
          {t('common:actions.search')}
        </Button>
      </div>

      {isFetching && !data && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">
          {t('common:labels.loading')}
        </Card>
      )}

      <Card variant="panel" className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/40 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3 w-16">{t('security:levels.table.columns.level')}</th>
              <th className="px-4 py-3">{t('security:levels.table.columns.name')}</th>
              <th className="px-4 py-3">{t('security:levels.table.columns.description')}</th>
              <th className="px-4 py-3">{t('security:levels.table.columns.permissions')}</th>
              <th className="px-4 py-3">{t('common:labels.status')}</th>
              <th className="px-4 py-3">{t('common:labels.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {levels.length === 0 && !isFetching && (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">{t('common:labels.noData')}</td></tr>
            )}
            {levels.map(lvl => (
              <tr key={lvl.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-3">{levelBadge(lvl.level)}</td>
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{lvl.name}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs max-w-xs">
                  {t(`security:levels.descriptions.${lvl.level}`, { defaultValue: lvl.description ?? '—' })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {lvl.permissions.map(p => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    lvl.is_active
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {lvl.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="!px-2.5 !py-1 !text-xs"
                      onClick={() => setModal(lvl)}
                    >
                      {t('common:actions.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      className="!px-2.5 !py-1 !text-xs"
                      onClick={() => setPermissionsModal(lvl)}
                    >
                      {t('security:levels.permissionsMatrix.action')}
                    </Button>
                    {lvl.level < 10 && (
                      <button
                        onClick={() => toggleStatus.mutate({ id: lvl.id, is_active: !lvl.is_active })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                          lvl.is_active
                            ? 'border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                            : 'border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        }`}>
                        {lvl.is_active ? t('common:actions.deactivate') : t('common:actions.activate')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {meta && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {t('common:pagination.showing', {
                from:  meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1,
                to:    Math.min(meta.current_page * meta.per_page, meta.total),
                total: meta.total,
              })}
            </span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white">
              {[5, 10, 20].map(n => <option key={n} value={n}>{n} {t('common:pagination.perPage')}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              className="!px-3 !py-1.5 !text-xs"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <IcoChevronLeft size={13} />
            </Button>
            {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
              const pg = page <= 4 ? i + 1 : page - 3 + i
              if (pg < 1 || pg > lastPage) return null
              return (
                <Button
                  key={pg}
                  variant="outline"
                  active={pg === page}
                  className="!px-3 !py-1.5 !text-xs"
                  onClick={() => setPage(pg)}
                >
                  {pg}
                </Button>
              )
            })}
            <Button
              variant="outline"
              className="!px-3 !py-1.5 !text-xs"
              disabled={page >= lastPage}
              onClick={() => setPage(p => Math.min(lastPage, p + 1))}
            >
              <IcoChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}

      {modal !== false && (
        <SecurityLevelFormModal
          level={modal}
          onClose={() => setModal(false)}
        />
      )}

      {permissionsModal !== false && (
        <SecurityLevelPermissionsModal
          level={permissionsModal}
          onClose={() => setPermissionsModal(false)}
        />
      )}
    </div>
  )
}
