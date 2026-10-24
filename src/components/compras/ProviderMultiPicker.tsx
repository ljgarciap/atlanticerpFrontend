import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import { IcoClose, IcoSearch } from '@/components/icons'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

export interface ProviderOption {
  id:   number
  name: string
}

interface Props {
  id:       string
  label:    string
  selected: ProviderOption[]
  onChange: (next: ProviderOption[]) => void
  required?: boolean
}

/**
 * SCRUM-1126 — selector de proveedores múltiples para un producto de inventario. Buscador +
 * desplegable (mismo patrón onMouseDown que NewPurchaseOrderPage) y chips con los ya elegidos.
 * El primero de la lista es el proveedor principal (`provider_id`); el resto viaja en
 * `provider_ids`. El orden se conserva tal cual lo agrega el usuario.
 */
export function ProviderMultiPicker({ id, label, selected, onChange, required = false }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['compras/providers/picker', searchTerm],
    queryFn:  () => comprasApi.providers.list({ search: searchTerm || undefined, per_page: 20 }),
  })

  const selectedIds = new Set(selected.map(p => p.id))
  const options = (data?.data ?? []).filter(p => !selectedIds.has(p.id))

  const add = (p: ProviderOption) => {
    onChange([...selected, { id: p.id, name: p.name }])
    setSearch('')
    setOpen(false)
  }

  const remove = (providerId: number) => onChange(selected.filter(p => p.id !== providerId))

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required ? ' *' : ''}
      </label>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label={t('compras:inventory.providersPicker.selected') ?? ''}>
          {selected.map((p, index) => (
            <li key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 text-xs text-slate-800">
              <span className="font-medium">{p.name}</span>
              {index === 0 && selected.length > 1 && (
                <span className="text-[10px] uppercase text-slate-500">{t('compras:inventory.providersPicker.primary')}</span>
              )}
              <button
                type="button"
                aria-label={t('compras:inventory.providersPicker.remove', { name: p.name }) ?? ''}
                className="text-slate-400 hover:text-slate-600"
                onClick={() => remove(p.id)}
              >
                <IcoClose size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={(selected.length > 0
            ? t('compras:inventory.providersPicker.addAnother')
            : t('compras:newOrder.provider.searchPlaceholder')) ?? ''}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm pl-8"
        />
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(p => (
            <li key={p.id}>
              <button
                type="button" onMouseDown={() => add(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
