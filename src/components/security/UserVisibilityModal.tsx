import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, type UserListItem, type ModuleVisibilityRow, type MenuItemVisibilityRow } from '@/api/usersApi'
import { VIEW_NONE, VIEW_READONLY, VIEW_FULL } from '@/api/rolesApi'
import { MENU_ITEM_CATALOG } from '@/config/menuItemCatalog'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

// SCRUM-724 — mismo catálogo de 7 módulos que RoleVisibilityModal.tsx (MODULES ahí),
// esta vez para el override puntual de UN usuario. Segunda capa nueva respecto a
// RoleVisibilityModal: por cada módulo, checkboxes de sus ítems de menú
// individuales (MENU_ITEM_CATALOG), habilitados solo si el módulo no está en None.
const MODULES = ['ventas_diseno', 'compras', 'bodega', 'servicios', 'admin_contab', 'gerencia', 'operaciones'] as const

interface Props {
  user:    UserListItem
  onClose: () => void
}

export default function UserVisibilityModal({ user, onClose }: Props) {
  const { t } = useTranslation(['common', 'security'])
  const qc    = useQueryClient()
  const [rows, setRows]               = useState<Record<string, ModuleVisibilityRow>>({})
  const [itemVisible, setItemVisible] = useState<Record<string, Record<string, boolean>>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['users', user.id, 'module-visibility'],
    queryFn:  () => usersApi.moduleVisibility.get(user.id),
  })

  useEffect(() => {
    const initialRows: Record<string, ModuleVisibilityRow> = {}
    for (const module of MODULES) {
      const existing = data?.modules.find(r => r.module === module)
      initialRows[module] = existing ?? { module, can_view: VIEW_NONE, can_view_team: false }
    }
    setRows(initialRows)

    // GET solo trae overrides explícitos — un ítem ausente hereda visible=true
    // (contrato "absent = inherits/default", ver usersApi.moduleVisibility).
    const initialItems: Record<string, Record<string, boolean>> = {}
    for (const module of MODULES) {
      initialItems[module] = {}
      for (const item of MENU_ITEM_CATALOG[module] ?? []) {
        const override = data?.menuItems.find(r => r.module === module && r.key === item.key)
        initialItems[module][item.key] = override ? override.visible : true
      }
    }
    setItemVisible(initialItems)
  }, [data])

  const mutation = useMutation({
    mutationFn: () => {
      // Módulos: replace-all completo (mismo patrón que rolesApi.updateVisibility).
      const modules = Object.values(rows)
      // Ítems: sparse — solo los que quedaron en false viajan, para mantener el
      // payload mínimo y no pisar el default "visible" del resto (REQ del ticket).
      const menuItems: MenuItemVisibilityRow[] = []
      for (const module of MODULES) {
        for (const item of MENU_ITEM_CATALOG[module] ?? []) {
          if (itemVisible[module]?.[item.key] === false) {
            menuItems.push({ module, key: item.key, visible: false })
          }
        }
      }
      return usersApi.moduleVisibility.update(user.id, { modules, menuItems })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', user.id, 'module-visibility'] })
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

  const toggleItem = (module: string, key: string) => {
    setItemVisible(prev => ({
      ...prev,
      [module]: { ...prev[module], [key]: !(prev[module]?.[key] ?? true) },
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-lg z-50 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{t('security:users.visibility.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{user.first_name} {user.last_name}</p>
          </div>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('security:users.visibility.subtitle')}</p>

          {isLoading ? (
            <div className="space-y-2">
              {MODULES.map(m => <div key={m} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-5">
              {MODULES.map(module => {
                const row = rows[module]
                if (!row) return null
                const items = MENU_ITEM_CATALOG[module] ?? []
                const moduleDisabled = row.can_view === VIEW_NONE

                return (
                  <div key={module} className="border-b border-slate-100 pb-4 last:border-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                      {t(`security:roles.modules.${module}`)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
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
                        disabled={moduleDisabled}
                        className="!text-xs"
                        onClick={() => toggleTeam(module)}>
                        {t('security:roles.visibility.viewTeam')}
                      </Button>
                    </div>

                    {items.length > 0 && (
                      <div className={`grid grid-cols-2 gap-x-3 gap-y-1.5 pl-1 ${moduleDisabled ? 'opacity-40' : ''}`}>
                        {items.map(item => (
                          <label
                            key={item.key}
                            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={itemVisible[module]?.[item.key] ?? true}
                              disabled={moduleDisabled}
                              onChange={() => toggleItem(module, item.key)}
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    )}
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
