import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

// SCRUM-739 (UAT-2) — máscara GLOBAL de rollout (UatVisibilityService en el
// backend), independiente del override por usuario de SCRUM-724
// (UserVisibilityModal) — nunca escribe en user_module_visibility, así que un
// "Restaurar" acá jamás puede pisar una excepción individual que un admin haya
// puesto por una razón sin relación con UAT. Los 2 botones de Catálogo viajan
// como menuItems bajo ventas_diseno (mismas keys que menuItemCatalog.ts);
// "Configuración" no es parte del catálogo de 7 módulos, viaja como el ítem
// sintético {module: 'configuracion', key: 'root'}.
const MODULES = ['ventas_diseno', 'compras', 'bodega', 'servicios', 'admin_contab', 'gerencia', 'operaciones'] as const

const EXTRA_ITEMS = [
  { module: 'ventas_diseno',  key: 'catalogo_inventario_compras', labelKey: 'security:users.bulkVisibility.catalogInventoryCompras' },
  { module: 'ventas_diseno',  key: 'catalogo_inventario_bodega',  labelKey: 'security:users.bulkVisibility.catalogInventoryBodega' },
  { module: 'configuracion',  key: 'root',                        labelKey: 'security:users.bulkVisibility.configuracion' },
] as const

function itemId(module: string, key: string): string {
  return `${module}::${key}`
}

interface Props {
  onClose: () => void
}

export default function BulkModuleVisibilityModal({ onClose }: Props) {
  const { t } = useTranslation(['common', 'security'])
  const qc    = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['module-visibility-bulk'],
    queryFn:  usersApi.moduleVisibility.bulk.get,
    // No refetch en background mientras el superadmin puede tener el checklist
    // a medio marcar — un refetch (ej. al volver de otra pestaña) no debe pisar
    // selección en curso. La hidratación real igual está guardada por el ref de
    // "ya hidraté" de abajo, esto es una segunda barrera, no la única.
    refetchOnWindowFocus: false,
    refetchOnReconnect:   false,
  })

  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
  const [selectedItems,   setSelectedItems]   = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const hydrated = useRef(false)

  // Precarga con lo que YA está oculto — así "Restaurar para todos" no depende
  // de que el superadmin recuerde qué había marcado la última vez. Con un ref
  // en vez de depender solo de [data]: un refetch de fondo (foco de ventana,
  // reconexión, invalidación de otra query) no debe pisar selección a medio
  // marcar — solo hidrata la PRIMERA vez que llegan datos reales.
  useEffect(() => {
    if (!data || hydrated.current) return
    hydrated.current = true
    setSelectedModules(new Set(data.hidden_modules))
    setSelectedItems(new Set(data.hidden_menu_items.map(i => itemId(i.module, i.key))))
  }, [data])

  const toggleModule = (module: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev)
      next.has(module) ? next.delete(module) : next.add(module)
      return next
    })
  }

  const toggleItem = (module: string, key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      const id = itemId(module, key)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const moduleLabel = (module: string) => t(`security:roles.modules.${module}`)
  const extraItemLabel = (module: string, key: string) =>
    t(EXTRA_ITEMS.find(i => i.module === module && i.key === key)?.labelKey ?? '')

  const mutation = useMutation({
    mutationFn: (action: 'hide' | 'restore') => usersApi.moduleVisibility.bulk.set({
      modules:   Array.from(selectedModules),
      menuItems: Array.from(selectedItems).map(id => {
        const [module, key] = id.split('::')
        return { module, key }
      }),
      action,
    }),
    // SCRUM-785 — feedback específico de qué cambió (no un mensaje genérico), para que quede
    // claro cuando la selección elegida ya estaba en el estado pedido y por lo tanto no hizo
    // nada (el origen real del bug reportado: "Restaurar" sobre algo ya visible es un no-op
    // silencioso, indistinguible de un éxito real sin este diff).
    onSuccess: (result, action) => {
      setError(null)
      const previousModules = new Set(data?.hidden_modules ?? [])
      const previousItems   = new Set((data?.hidden_menu_items ?? []).map(i => itemId(i.module, i.key)))
      const newModules      = new Set(result.hidden_modules)
      const newItems        = new Set(result.hidden_menu_items.map(i => itemId(i.module, i.key)))

      const changedModuleLabels = Array.from(selectedModules)
        .filter(m => previousModules.has(m) !== newModules.has(m))
        .map(moduleLabel)
      const changedItemLabels = Array.from(selectedItems)
        .filter(id => previousItems.has(id) !== newItems.has(id))
        .map(id => {
          const [module, key] = id.split('::')
          return extraItemLabel(module, key)
        })
      const changedLabels = [...changedModuleLabels, ...changedItemLabels]

      setFeedback(
        changedLabels.length === 0
          ? t('security:users.bulkVisibility.noChanges')
          : t(`security:users.bulkVisibility.${action === 'hide' ? 'hideSuccess' : 'restoreSuccess'}`, { items: changedLabels.join(', ') }),
      )
      setSelectedModules(new Set(result.hidden_modules))
      setSelectedItems(new Set(result.hidden_menu_items.map(i => itemId(i.module, i.key))))
      qc.setQueryData(['module-visibility-bulk'], result)
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => setError(t('common:messages.saveError')),
  })

  const nothingSelected = selectedModules.size === 0 && selectedItems.size === 0

  // SCRUM-785 — estado real (independiente de lo tildado), fuente de verdad = último GET/mutación.
  function StateBadge({ hidden }: { hidden: boolean }) {
    return (
      <span className={`ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
        hidden ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
      }`}>
        {t(`security:users.bulkVisibility.${hidden ? 'stateHidden' : 'stateVisible'}`)}
      </span>
    )
  }

  const handleApply = (action: 'hide' | 'restore') => {
    if (nothingSelected) {
      setError(t('security:users.bulkVisibility.selectAtLeastOne'))
      return
    }
    setFeedback(null)
    setError(null)
    mutation.mutate(action)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-lg z-50 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-slate-800 text-base">{t('security:users.bulkVisibility.title')}</h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('security:users.bulkVisibility.subtitle')}</p>
          {/* SCRUM-785 — el checkbox marca "incluir en la próxima acción", NO el estado actual
              (ese lo muestra el badge de cada fila) — aclarado a propósito porque destildar algo
              que ya está oculto no lo revela: solo lo saca de lo que "Ocultar"/"Restaurar" va a
              tocar. */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">{t('security:users.bulkVisibility.helper')}</p>

          {isLoading ? (
            <div className="space-y-2">
              {MODULES.map(m => <div key={m} className="h-4 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                {t('security:users.bulkVisibility.modulesGroup')}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                {MODULES.map(module => (
                  <label key={module} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedModules.has(module)}
                      onChange={() => toggleModule(module)}
                    />
                    {moduleLabel(module)}
                    <StateBadge hidden={data?.hidden_modules.includes(module) ?? false} />
                  </label>
                ))}
              </div>

              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                {t('security:users.bulkVisibility.catalogGroup')}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-2">
                {EXTRA_ITEMS.map(item => (
                  <label key={itemId(item.module, item.key)} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(itemId(item.module, item.key))}
                      onChange={() => toggleItem(item.module, item.key)}
                    />
                    {t(item.labelKey)}
                    <StateBadge hidden={data?.hidden_menu_items.some(i => i.module === item.module && i.key === item.key) ?? false} />
                  </label>
                ))}
              </div>
            </>
          )}

          {feedback && (
            <div className="mt-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs">
              {feedback}
            </div>
          )}
          {error && (
            <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:actions.close')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || isLoading}
            onClick={() => handleApply('restore')}
          >
            {t('security:users.bulkVisibility.restore')}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={mutation.isPending || isLoading}
            onClick={() => handleApply('hide')}
          >
            {t('security:users.bulkVisibility.hide')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
