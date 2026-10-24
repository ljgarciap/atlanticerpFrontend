import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IcoChevronDown, IcoClose } from '@/components/icons'
import { cn } from '@/lib/cn'

/**
 * SCRUM-854 — filtro multiselección de Vendedor/Diseñador, reusado en Pipeline, Lista de
 * Proyectos (CRM y Ventas&Diseño), Cotizaciones, Pedidos y Reportes. Mismo patrón que
 * `WarehouseMultiSelect.tsx` (SCRUM-743) — sin selección = "todos" (el caller decide cómo
 * traducir eso al backend, omitiendo el parámetro cuando `selectedIds` está vacío), más un
 * buscador por nombre porque el roster de vendedores/diseñadores puede ser más largo que el de
 * bodegas.
 */
interface UserOption {
  id:   number
  name: string
}

interface UserMultiSelectProps {
  users:        UserOption[]
  selectedIds:  number[]
  onChange:     (ids: number[]) => void
  className?:   string
  placeholder?: string
  /** SCRUM-860 — reemplaza el estilo (padding/borde/color) del botón disparador para los casos
   *  donde debe alinearse en tamaño con selects nativos vecinos, ej. `PedidosPage.tsx` (Bodega).
   *  `cn()` no dedupea utilidades de Tailwind en conflicto, así que mezclar clases de tamaño acá
   *  no garantiza cuál gana — reemplazar es lo único confiable. El layout interno (`flex
   *  items-center gap-1.5`, para que el label y la flecha queden en fila) se mantiene siempre,
   *  fuera de esta prop, para no depender de que quien la pase se acuerde de incluirlo. */
  buttonClassName?: string
}

const DEFAULT_BUTTON_LOOK = 'px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

export function UserMultiSelect({ users, selectedIds, onChange, className, placeholder, buttonClassName }: UserMultiSelectProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedUsers = useMemo(() => users.filter(u => selectedSet.has(u.id)), [users, selectedSet])
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()

    return q === '' ? users : users.filter(u => u.name.toLowerCase().includes(q))
  }, [users, search])

  const toggleOne = (id: number) => {
    onChange(selectedSet.has(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }
  const clearAll = () => onChange([])
  const removeOne = (id: number) => onChange(selectedIds.filter(x => x !== id))

  const summaryLabel = selectedIds.length === 0
    ? (placeholder ?? t('userFilter.all'))
    : t('userFilter.count', { count: selectedIds.length })

  return (
    <div className={cn('inline-flex flex-col gap-1.5', className)}>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn('flex items-center gap-1.5', buttonClassName ?? DEFAULT_BUTTON_LOOK)}
        >
          <span>{summaryLabel}</span>
          <IcoChevronDown size={14} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              role="listbox"
              aria-multiselectable="true"
              className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
            >
              <div className="px-2 py-1.5 border-b border-slate-100">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('userFilter.search')}
                  className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center justify-end px-3 py-1.5 border-b border-slate-100">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] text-slate-500 font-medium hover:underline"
                >
                  {t('userFilter.clear')}
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {filteredUsers.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-400">{t('userFilter.empty')}</li>
                )}
                {filteredUsers.map(u => (
                  <li key={u.id}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      {u.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark text-[11px] font-medium"
            >
              {u.name}
              <button
                type="button"
                onClick={() => removeOne(u.id)}
                aria-label={t('userFilter.remove', { name: u.name })}
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

export default UserMultiSelect
