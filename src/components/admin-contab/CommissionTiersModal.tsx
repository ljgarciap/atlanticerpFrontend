import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCommissionTiers, useCreateCommissionTier, useUpdateCommissionTier, useDeleteCommissionTier,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPlus, IcoPencil, IcoBan } from '@/components/icons'
import type { CommissionTier, CreateCommissionTierPayload } from '@/types/adminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

interface Props {
  editable: boolean
  onClose: () => void
}

/**
 * REQ-498 — "Tabla de comisión escalonada" (solo consulta, RN1). El CRUD de tramos no está en el
 * mockup (RN1 dice explícito "se configuran en otro lugar, fuera del alcance de este mockup") —
 * se agrega igual en este batch por decisión de Luis (regla dura del CLAUDE.md: nunca hardcodear
 * umbrales de negocio sin CRUD+vista de admin). `editable` gatea el modo edición — mismo patrón
 * que `ItbmsRateDetailModal` (Configuración Fiscal, exclusivo Mark/`admin_contab.edit`).
 */
export default function CommissionTiersModal({ editable, onClose }: Props) {
  const { t } = useTranslation(['common', 'adminContab'])
  const { data: tiers, isLoading } = useCommissionTiers()
  const createTier = useCreateCommissionTier()
  const updateTier = useUpdateCommissionTier()
  const deleteTier = useDeleteCommissionTier()

  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<CreateCommissionTierPayload>({
    monto_minimo: 0, monto_maximo: null, porcentaje: 0, orden: (tiers?.length ?? 0) + 1,
  })

  const sorted = [...(tiers ?? [])].sort((a, b) => a.orden - b.orden)

  function startEdit(tier: CommissionTier) {
    setEditingId(tier.id)
    setAdding(false)
    setForm({ monto_minimo: tier.monto_minimo, monto_maximo: tier.monto_maximo, porcentaje: tier.porcentaje, orden: tier.orden })
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    setForm({ monto_minimo: 0, monto_maximo: null, porcentaje: 0, orden: sorted.length + 1 })
  }

  function cancelEdit() {
    setEditingId(null)
    setAdding(false)
  }

  function submit() {
    if (editingId !== null) {
      updateTier.mutate({ id: editingId, data: form }, { onSuccess: cancelEdit })
    } else {
      createTier.mutate(form, { onSuccess: cancelEdit })
    }
  }

  function remove(id: number) {
    if (!window.confirm(t('adminContab:comisionesInternas.tramos.confirmarEliminar'))) return
    deleteTier.mutate(id)
  }

  const saving = createTier.isPending || updateTier.isPending

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('adminContab:comisionesInternas.tramos.title')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          {t('adminContab:comisionesInternas.tramos.subtitle')}
        </p>

        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-left text-[10.5px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-2">{t('adminContab:comisionesInternas.tramos.columnas.rango')}</th>
              <th className="py-2 pr-2">{t('adminContab:comisionesInternas.tramos.columnas.porcentaje')}</th>
              {editable && <th className="py-2 pr-2" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map(tier => (
              <tr key={tier.id} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-2 pr-2 text-slate-800 dark:text-slate-100">
                  {tier.monto_maximo === null
                    ? t('adminContab:comisionesInternas.tramos.masDe', { monto: formatCurrency(tier.monto_minimo) })
                    : tier.monto_minimo === 0
                      ? t('adminContab:comisionesInternas.tramos.menosDe', { monto: formatCurrency(tier.monto_maximo) })
                      : t('adminContab:comisionesInternas.tramos.rango', {
                          desde: formatCurrency(tier.monto_minimo), hasta: formatCurrency(tier.monto_maximo),
                        })}
                </td>
                <td className="py-2 pr-2 font-semibold text-primary-dark">{tier.porcentaje}%</td>
                {editable && (
                  <td className="py-2 pr-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(tier)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mr-2" aria-label={t('common:actions.edit')}>
                      <IcoPencil size={14} />
                    </button>
                    <button type="button" onClick={() => remove(tier.id)} className="text-slate-400 hover:text-red-600" aria-label={t('common:actions.delete')}>
                      <IcoBan size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr><td colSpan={editable ? 3 : 2} className="py-4 text-center text-slate-400">{t('adminContab:comisionesInternas.tramos.vacio')}</td></tr>
            )}
          </tbody>
        </table>

        {editable && (adding || editingId !== null) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 mb-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">
              {t('adminContab:comisionesInternas.tramos.form.montoMinimo')}
              <input
                type="number" min={0} value={form.monto_minimo}
                onChange={e => setForm(f => ({ ...f, monto_minimo: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] text-slate-500">
              {t('adminContab:comisionesInternas.tramos.form.montoMaximo')}
              <input
                type="number" min={0} value={form.monto_maximo ?? ''}
                placeholder={t('adminContab:comisionesInternas.tramos.form.sinTope')}
                onChange={e => setForm(f => ({ ...f, monto_maximo: e.target.value === '' ? null : Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] text-slate-500 col-span-2">
              {t('adminContab:comisionesInternas.tramos.form.porcentaje')}
              <input
                type="number" min={0} max={100} step={0.1} value={form.porcentaje}
                onChange={e => setForm(f => ({ ...f, porcentaje: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
            </label>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <Button variant="secondary" className="!text-xs !py-1.5" onClick={cancelEdit}>{t('common:actions.cancel')}</Button>
              <Button className="!text-xs !py-1.5" onClick={submit} loading={saving}>{t('common:actions.save')}</Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
          {editable && !adding && editingId === null ? (
            <button type="button" onClick={startAdd} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-dark hover:underline">
              <IcoPlus size={13} /> {t('adminContab:comisionesInternas.tramos.agregar')}
            </button>
          ) : <span />}
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
