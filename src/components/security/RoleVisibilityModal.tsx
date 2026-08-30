import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi, type RoleItem, type RoleVisibilityRow, VIEW_NONE, VIEW_READONLY, VIEW_FULL } from '@/api/rolesApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

const MODULES = ['ventas_diseno', 'compras', 'bodega', 'servicios', 'admin_contab', 'gerencia', 'operaciones'] as const

interface Props {
  role:    RoleItem
  onClose: () => void
}

export default function RoleVisibilityModal({ role, onClose }: Props) {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const [rows, setRows] = useState<Record<string, RoleVisibilityRow>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['roles', role.id, 'visibility'],
    queryFn:  () => rolesApi.visibility(role.id),
  })

  useEffect(() => {
    const initial: Record<string, RoleVisibilityRow> = {}
    for (const module of MODULES) {
      const existing = data?.find(r => r.module === module)
      initial[module] = existing ?? { module, can_view: VIEW_NONE, can_view_team: false }
    }
    setRows(initial)
  }, [data])

  const mutation = useMutation({
    mutationFn: () => rolesApi.updateVisibility(role.id, Object.values(rows)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', role.id, 'visibility'] })
      onClose()
    },
  })

  const setCanView = (module: string, can_view: 0 | 1 | 2) => {
    setRows(prev => ({
      ...prev,
      [module]: { ...prev[module], can_view, can_view_team: can_view === VIEW_NONE ? false : prev[module].can_view_team },
    }))
  }

  const toggleTeam = (module: string) => {
    setRows(prev => ({ ...prev, [module]: { ...prev[module], can_view_team: !prev[module].can_view_team } }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-lg z-50 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{t('security:roles.visibility.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{role.name}</p>
          </div>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-2">
              {MODULES.map(m => <div key={m} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {MODULES.map(module => {
                const row = rows[module]
                if (!row) return null
                return (
                  <div key={module} className="border-b border-slate-100 pb-3 last:border-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                      {t(`security:roles.modules.${module}`)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex gap-1">
                        {[
                          { value: VIEW_NONE, label: t('security:roles.visibility.viewNone') },
                          { value: VIEW_READONLY, label: t('security:roles.visibility.viewReadonly') },
                          { value: VIEW_FULL, label: t('security:roles.visibility.viewFull') },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            type="button"
                            variant="outline"
                            active={row.can_view === opt.value}
                            className="!text-xs"
                            onClick={() => setCanView(module, opt.value as 0 | 1 | 2)}>
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        active={row.can_view_team}
                        activeVariant="accent"
                        disabled={row.can_view === VIEW_NONE}
                        className="!text-xs"
                        onClick={() => toggleTeam(module)}>
                        {t('security:roles.visibility.viewTeam')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
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
