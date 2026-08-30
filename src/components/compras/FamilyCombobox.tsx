import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { comprasApi } from '@/api/comprasApi'

/**
 * SCRUM-237/240 (rebote de Daniela Amaya 2026-08-12) — combobox de Familia compartido entre el
 * modal de edición de producto (InventarioPage ProductDetailModal, SCRUM-237) y el de creación
 * (InventarioPage CreateProductModal, SCRUM-240): escribir un nombre que no existe todavía
 * ofrece "+ Crear familia "X"", que la crea vía el endpoint nuevo y la deja seleccionada de una —
 * antes solo se podía elegir de las ya existentes (desplegable puro).
 *
 * Reconciliado en consolidación 2026-08-15 (Arquitecto): list() y create() usan ambos
 * `comprasApi.families` (`/compras/families`, SCRUM-764 + `InventoryController::storeFamily` del
 * batch4 backend, find-or-create por nombre case-insensitive) — nunca
 * `ventasDisenoApi.catalogProductFamilies.*`, que exige `ventas_diseno.read`/`.write`, permiso que
 * ningún rol real de Compras tiene (403 en silencio para `lider_compras`, ya documentado en
 * SCRUM-764). Este combobox se usa exclusivamente desde pantallas de Compras (InventarioPage), así
 * que debe leer/escribir del namespace que sí resuelve para esos roles. (El primer intento de este
 * commit dejó create() apuntando al endpoint de ventas-diseño como placeholder porque el backend
 * de este mismo batch corría en paralelo sin haber aterrizado todavía — ya reconciliado.)
 */
export function FamilyCombobox({ id, value, onChange, optional = true }: {
  id:        string
  value:     number | ''
  onChange:  (id: number | '') => void
  optional?: boolean
}) {
  const { t } = useTranslation(['common', 'compras'])
  const queryClient = useQueryClient()
  const { data: families } = useQuery({
    queryKey: ['compras/families'],
    queryFn:  () => comprasApi.families.list(),
  })

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected = (families?.data ?? []).find(f => f.id === value) ?? null

  const create = useMutation({
    mutationFn: (name: string) => comprasApi.families.create(name),
    onSuccess: family => {
      queryClient.invalidateQueries({ queryKey: ['compras/families'] })
      onChange(family.id)
      setQuery('')
      setOpen(false)
    },
    onError: err => setError(
      isAxiosError<{ message?: string }>(err) ? err.response?.data?.message ?? t('compras:inventory.detail.familyCreateError') : t('compras:inventory.detail.familyCreateError'),
    ),
  })

  const trimmed = query.trim()
  const options = (families?.data ?? []).filter(f =>
    trimmed === '' || f.name.toLowerCase().includes(trimmed.toLowerCase()))
  const exactMatch = (families?.data ?? []).find(f => f.name.toLowerCase() === trimmed.toLowerCase())
  const showCreate = trimmed !== '' && !exactMatch

  const handleBlur = () => {
    // Mismo patrón que el buscador de Proveedor (CreateProductModal) — retraso corto para que el
    // click/mousedown sobre una opción de la lista registre antes de que el blur la cierre.
    blurTimeout.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">
        {t('compras:inventory.detail.family')}
        {optional && <span className="font-normal text-slate-400"> ({t('compras:inventory.create.optional')})</span>}
      </label>
      {selected !== null ? (
        <div className="flex items-center justify-between px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
          <span className="font-medium text-slate-800 text-sm">{selected.name}</span>
          <button type="button" className="text-xs text-primary underline" onClick={() => onChange('')}>
            {t('compras:inventory.detail.familyChange')}
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); setError(null) }}
            onFocus={() => setOpen(true)}
            onBlur={handleBlur}
            placeholder={t('compras:inventory.detail.familyPlaceholder') ?? ''}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          {open && (options.length > 0 || showCreate) && (
            <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {options.map(f => (
                <li key={f.id}>
                  <button
                    type="button"
                    onMouseDown={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); onChange(f.id); setQuery(''); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    {f.name}
                  </button>
                </li>
              ))}
              {showCreate && (
                <li>
                  <button
                    type="button"
                    disabled={create.isPending}
                    onMouseDown={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); create.mutate(trimmed) }}
                    className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-slate-50 font-medium disabled:opacity-60"
                  >
                    {t('compras:inventory.detail.familyCreate', { name: trimmed })}
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
      <p className="text-[11px] text-slate-400 mt-1">{t('compras:inventory.detail.familyHelp')}</p>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}
