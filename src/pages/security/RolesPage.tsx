import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi, type RoleItem } from '@/api/rolesApi'
import { levelsApi } from '@/api/levelsApi'
import RoleFormModal from '@/components/security/RoleFormModal'
import RoleVisibilityModal from '@/components/security/RoleVisibilityModal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function RolesPage() {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const [formModal,       setFormModal]       = useState<RoleItem | 'new' | null>(null)
  const [visibilityModal, setVisibilityModal] = useState<RoleItem | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<RoleItem | null>(null)

  const { data: roles = [], isFetching } = useQuery({
    queryKey: ['roles'],
    queryFn:  rolesApi.list,
  })

  const { data: levels = [] } = useQuery({
    queryKey: ['security-levels', 'all'],
    queryFn:  levelsApi.listAll,
  })

  const removeRole = useMutation({
    mutationFn: (id: number) => rolesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setConfirmDelete(null) },
  })

  const levelName = (id: number | null) => {
    if (id === null) return '—'
    const level = levels.find(l => l.id === id)
    return level ? `[${level.level}] ${level.name}` : '—'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('security:roles.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t('security:roles.subtitle')}</p>
        </div>
        <Button onClick={() => setFormModal('new')}>{t('security:roles.actions.create')}</Button>
      </div>

      <Card variant="panel" className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/40 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3">{t('security:roles.table.columns.name')}</th>
              <th className="px-4 py-3">{t('security:roles.table.columns.key')}</th>
              <th className="px-4 py-3">{t('security:roles.table.columns.defaultLevel')}</th>
              <th className="px-4 py-3">{t('common:labels.status')}</th>
              <th className="px-4 py-3">{t('common:labels.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 && !isFetching && (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">{t('common:labels.noData')}</td></tr>
            )}
            {roles.map(role => (
              <tr key={role.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                  {role.name}
                  {role.is_system && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      {t('security:roles.system')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{role.key}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{levelName(role.default_security_level_id)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    role.is_active
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {role.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="!px-2.5 !py-1 !text-xs" onClick={() => setFormModal(role)}>
                      {t('common:actions.edit')}
                    </Button>
                    <Button variant="outline" className="!px-2.5 !py-1 !text-xs" onClick={() => setVisibilityModal(role)}>
                      {t('security:roles.actions.visibility')}
                    </Button>
                    {!role.is_system && (
                      <Button variant="danger" className="!px-2.5 !py-1 !text-xs" onClick={() => setConfirmDelete(role)}>
                        {t('common:actions.delete')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {formModal !== null && (
        <RoleFormModal
          role={formModal === 'new' ? null : formModal}
          levels={levels}
          onClose={() => setFormModal(null)}
        />
      )}

      {visibilityModal !== null && (
        <RoleVisibilityModal
          role={visibilityModal}
          onClose={() => setVisibilityModal(null)}
        />
      )}

      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-slate-900/50 z-[2000] flex items-center justify-center p-4">
          <Card variant="modal" className="p-6 max-w-sm w-full">
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-5 leading-relaxed">
              {t('security:roles.deleteConfirm', { name: confirmDelete.name })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="danger" disabled={removeRole.isPending} onClick={() => removeRole.mutate(confirmDelete.id)}>
                {t('common:actions.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
