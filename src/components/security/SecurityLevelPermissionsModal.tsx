import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { levelsApi, type SecurityLevelItem, type LevelModulePermissionRow } from '@/api/levelsApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

const MODULES = ['ventas_diseno', 'compras', 'bodega', 'servicios', 'admin_contab', 'gerencia', 'operaciones'] as const

interface Props {
  level:   SecurityLevelItem
  onClose: () => void
}

export default function SecurityLevelPermissionsModal({ level, onClose }: Props) {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const [rows, setRows] = useState<Record<string, LevelModulePermissionRow>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['security-levels', level.id, 'permissions'],
    queryFn:  () => levelsApi.permissions(level.id),
  })

  useEffect(() => {
    const initial: Record<string, LevelModulePermissionRow> = {}
    for (const module of MODULES) {
      const existing = data?.find(r => r.module === module)
      initial[module] = existing ?? { module, can_edit: false, can_approve: false }
    }
    setRows(initial)
  }, [data])

  const mutation = useMutation({
    mutationFn: () => levelsApi.updatePermissions(level.id, Object.values(rows)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-levels', level.id, 'permissions'] })
      onClose()
    },
  })

  const toggle = (module: string, field: 'can_edit' | 'can_approve') => {
    setRows(prev => ({ ...prev, [module]: { ...prev[module], [field]: !prev[module][field] } }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-lg z-50 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{t('security:levels.permissionsMatrix.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">[{level.level}] {level.name}</p>
          </div>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-2">
              {MODULES.map(m => <div key={m} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2">{t('security:levels.permissionsMatrix.module')}</th>
                  <th className="py-2 text-center">{t('security:levels.permissionsMatrix.canEdit')}</th>
                  <th className="py-2 text-center">{t('security:levels.permissionsMatrix.canApprove')}</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(module => {
                  const row = rows[module]
                  if (!row) return null
                  return (
                    <tr key={module} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 font-medium text-slate-700">{t(`security:roles.modules.${module}`)}</td>
                      <td className="py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.can_edit}
                          onChange={() => toggle(module, 'can_edit')}
                          className="w-4 h-4 accent-primary"
                          aria-label={t('security:levels.permissionsMatrix.canEdit')}
                        />
                      </td>
                      <td className="py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.can_approve}
                          onChange={() => toggle(module, 'can_approve')}
                          className="w-4 h-4 accent-primary"
                          aria-label={t('security:levels.permissionsMatrix.canApprove')}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {mutation.isError && (
            <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {t('common:messages.saveError')}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" disabled={mutation.isPending || isLoading} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '…' : t('common:actions.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
