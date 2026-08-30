import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWarehouses } from '@/hooks/useCompras'
import { IcoChevronDown, IcoClose } from '@/components/icons'
import { cn } from '@/lib/cn'

/**
 * SCRUM-743 — filtro multiselección de Bodegas (Inventario). Componente compartido y genérico
 * (no ad-hoc dentro de InventarioPage.tsx) — mismo criterio del proyecto de extender componentes
 * reutilizables en vez de duplicar. Sin selección = "todas las bodegas" (RN6 del ticket): el
 * caller decide cómo traducir eso al backend (ver InventarioPage.tsx — se omite el parámetro
 * `warehouse_ids` cuando `selectedIds` está vacío, consistente con el resto de filtros opcionales
 * de `InventoryListParams`).
 */
interface WarehouseMultiSelectProps {
  selectedIds: number[]
  onChange:    (ids: number[]) => void
  className?:  string
}

export function WarehouseMultiSelect({ selectedIds, onChange, className }: WarehouseMultiSelectProps) {
  const { t } = useTranslation('compras')
  const [open, setOpen] = useState(false)
  const { data } = useWarehouses()
  const warehouses = data?.data ?? []

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedWarehouses = useMemo(
    () => warehouses.filter(w => selectedSet.has(w.id)),
    [warehouses, selectedSet],
  )

  const toggleOne = (id: number) => {
    onChange(selectedSet.has(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }
  const selectAll = () => onChange(warehouses.map(w => w.id))
  const clearAll = () => onChange([])
  const removeOne = (id: number) => onChange(selectedIds.filter(x => x !== id))

  const summaryLabel = selectedIds.length === 0
    ? t('inventory.filters.warehousesAll')
    : t('inventory.filters.warehousesCount', { count: selectedIds.length })

  return (
    <div className={cn('inline-flex flex-col gap-1.5', className)}>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <span>{summaryLabel}</span>
          <IcoChevronDown size={14} />
        </button>

        {open && (
          <>
            {/* Overlay de clic-afuera — mismo patrón que NotificationBell.tsx */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              role="listbox"
              aria-multiselectable="true"
              className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
            >
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] text-primary font-medium hover:underline"
                >
                  {t('inventory.filters.selectAllWarehouses')}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] text-slate-500 font-medium hover:underline"
                >
                  {t('inventory.filters.clearWarehouses')}
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {warehouses.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-400">{t('inventory.filters.warehousesEmpty')}</li>
                )}
                {warehouses.map(w => (
                  <li key={w.id}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(w.id)}
                        onChange={() => toggleOne(w.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      {w.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Selección vigente visible en el filtro cerrado, no solo dentro del dropdown abierto
          (criterio explícito del ticket) — cada chip se puede quitar individualmente sin
          afectar el resto de la selección. */}
      {selectedWarehouses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedWarehouses.map(w => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark text-[11px] font-medium"
            >
              {w.name}
              <button
                type="button"
                onClick={() => removeOne(w.id)}
                aria-label={t('inventory.filters.removeWarehouse', { name: w.name })}
                className="hover:text-red-600"
              >
                <IcoClose size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default WarehouseMultiSelect
