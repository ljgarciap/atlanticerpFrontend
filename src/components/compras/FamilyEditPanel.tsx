import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useUpdateFamily } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'

interface Props {
  family: { id: number; name: string; currency?: string; is_active?: boolean }
  onClose: () => void
}

/**
 * Fase 29b — edición de una familia de productos: renombrar, moneda de compra, y desactivar/reactivar.
 * Una familia no se borra (puede tener historial). El servidor valida nombre repetido y responde 422 con el motivo.
 */
export function FamilyEditPanel({ family, onClose }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const update = useUpdateFamily()
  const [name, setName] = useState(family.name)
  const [currency, setCurrency] = useState(family.currency ?? 'USD')
  const [error, setError] = useState<string | null>(null)
  const active = family.is_active !== false

  const fail = (err: unknown) => {
    const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
    setError(data?.errors?.name?.[0] ?? data?.message ?? t('compras:inventory.families.edit.error'))
  }

  const save = () => {
    setError(null)
    update.mutate({ id: family.id, data: { name: name.trim(), currency: currency.trim().toUpperCase() } }, { onSuccess: onClose, onError: fail })
  }

  return (
    <div className="px-4 pb-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3" data-testid={`family-edit-${family.id}`}>
      <label className="flex flex-col gap-1 text-[11px] text-slate-500">
        {t('compras:inventory.families.edit.name')}
        <input value={name} onChange={e => setName(e.target.value)} aria-label={t('compras:inventory.families.edit.name')}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm bg-white dark:bg-slate-900" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-slate-500">
        {t('compras:inventory.families.edit.currency')}
        <input value={currency} maxLength={3} onChange={e => setCurrency(e.target.value)} aria-label={t('compras:inventory.families.edit.currency')}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm uppercase bg-white dark:bg-slate-900" />
      </label>
      <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
      <Button onClick={save} disabled={name.trim() === '' || currency.trim().length !== 3} loading={update.isPending}>{t('common:actions.save')}</Button>
      <button type="button" data-testid={`family-toggle-active-${family.id}`} className="text-xs font-semibold text-slate-600 hover:underline"
        onClick={() => update.mutate({ id: family.id, data: { is_active: !active } }, { onSuccess: onClose, onError: fail })}>
        {active ? t('compras:inventory.families.edit.deactivate') : t('compras:inventory.families.edit.reactivate')}
      </button>
      {error && <p className="w-full text-xs text-red-500" role="alert">{error}</p>}
    </div>
  )
}
