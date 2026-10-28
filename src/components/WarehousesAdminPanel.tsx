import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { useCreateWarehouse, useDeleteWarehouse, useUpdateWarehouseSaleRule, useWarehouseSaleRules } from '@/hooks/useBodega'
import type { WarehouseSaleRule, WarehouseTipo } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function errorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

const TIPOS: WarehouseTipo[] = ['bodega', 'exhibicion']

/**
 * Fase 8b — «Almacenes» (Configuración de Bodega, solo superadmin): alta, renombre, tipo, desactivación y baja de almacenes.
 * El servidor decide qué se puede borrar o desactivar (sistema, despacho por defecto, existencias, historial) y explica el motivo; esto solo lo muestra.
 */
export default function WarehousesAdminPanel() {
  const { t } = useTranslation(['bodega'])
  const { data: warehouses, isLoading } = useWarehouseSaleRules()
  const create = useCreateWarehouse()
  const update = useUpdateWarehouseSaleRule()
  const remove = useDeleteWarehouse()

  const [newName, setNewName] = useState('')
  const [newTipo, setNewTipo] = useState<WarehouseTipo>('bodega')
  const [names, setNames] = useState<Record<number, string>>({})

  const error = create.error ?? update.error ?? remove.error
  const nameOf = (w: WarehouseSaleRule) => names[w.id] ?? w.name
  // Solo se muestra el error de la última acción: al iniciar otra se limpia el anterior.
  const clearErrors = () => { create.reset(); update.reset(); remove.reset() }
  const change = (id: number, data: Parameters<typeof update.mutate>[0]['data'], opts?: Parameters<typeof update.mutate>[1]) => { clearErrors(); if (opts) update.mutate({ id, data }, opts); else update.mutate({ id, data }) }

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (newName.trim().length < 2) return
    clearErrors()
    create.mutate({ name: newName.trim(), tipo: newTipo }, { onSuccess: () => setNewName('') })
  }

  function confirmAndDelete(w: WarehouseSaleRule) {
    if (window.confirm(t('bodega:settings.warehousesAdmin.actions.confirmDelete', { name: w.name }))) { clearErrors(); remove.mutate(w.id) }
  }

  return (
    <Card variant="panel" shadow className="overflow-hidden mt-6" data-testid="warehouses-admin-panel">
      <div className="px-6 pt-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('bodega:settings.warehousesAdmin.title')}</h2>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 mb-3">{t('bodega:settings.warehousesAdmin.help')}</p>
      </div>

      <form onSubmit={add} className="px-6 pb-3 flex flex-wrap items-end gap-2" data-testid="warehouse-new-form">
        <input
          value={newName} onChange={e => setNewName(e.target.value)} maxLength={60}
          placeholder={t('bodega:settings.warehousesAdmin.new.name')} aria-label={t('bodega:settings.warehousesAdmin.new.name')}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm" data-testid="warehouse-new-name"
        />
        <select
          value={newTipo} onChange={e => setNewTipo(e.target.value as WarehouseTipo)} aria-label={t('bodega:settings.warehousesAdmin.new.tipo')}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm" data-testid="warehouse-new-tipo"
        >
          {TIPOS.map(tp => <option key={tp} value={tp}>{t(`bodega:settings.warehousesAdmin.tipos.${tp}`)}</option>)}
        </select>
        <Button type="submit" variant="primary" disabled={create.isPending || newName.trim().length < 2} data-testid="warehouse-new-add">
          {t('bodega:settings.warehousesAdmin.new.add')}
        </Button>
      </form>

      {isLoading || !warehouses ? (
        <div className="px-6 py-6 text-slate-400 text-sm">{t('bodega:settings.warehousesAdmin.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-y border-slate-100 dark:border-slate-700">
                <th className="px-6 py-2 text-left">{t('bodega:settings.warehousesAdmin.columns.name')}</th>
                <th className="px-3 py-2 text-left">{t('bodega:settings.warehousesAdmin.columns.tipo')}</th>
                <th className="px-3 py-2 text-left">{t('bodega:settings.warehousesAdmin.columns.state')}</th>
                <th className="px-3 py-2 text-right">{t('bodega:settings.warehousesAdmin.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {warehouses.map(w => {
                const active = w.is_active !== false
                const system = !!w.funcion
                const busy = update.isPending || remove.isPending
                return (
                  <tr key={w.id} data-testid={`warehouse-admin-${w.id}`} className={active ? '' : 'opacity-60'}>
                    <td className="px-6 py-2">
                      <input
                        value={nameOf(w)} maxLength={60} disabled={busy}
                        onChange={e => setNames(prev => ({ ...prev, [w.id]: e.target.value }))}
                        aria-label={t('bodega:settings.warehousesAdmin.aria.name', { name: w.name })}
                        className="w-full rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent px-2 py-1"
                        data-testid={`warehouse-name-${w.id}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={w.tipo ?? 'bodega'} disabled={busy}
                        onChange={e => change(w.id, { tipo: e.target.value as WarehouseTipo })}
                        aria-label={t('bodega:settings.warehousesAdmin.aria.tipo', { name: w.name })}
                        className="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1" data-testid={`warehouse-tipo-${w.id}`}
                      >
                        {TIPOS.map(tp => <option key={tp} value={tp}>{t(`bodega:settings.warehousesAdmin.tipos.${tp}`)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {t(active ? 'bodega:settings.warehousesAdmin.state.active' : 'bodega:settings.warehousesAdmin.state.inactive')}
                      {system && <span className="ml-2 rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5">{t('bodega:settings.warehousesAdmin.state.system')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                      {nameOf(w).trim() !== w.name && nameOf(w).trim().length >= 2 && (
                        <Button
                          variant="secondary" disabled={busy} data-testid={`warehouse-save-${w.id}`}
                          onClick={() => change(w.id, { name: nameOf(w).trim() }, { onSuccess: () => setNames(prev => { const { [w.id]: _omit, ...rest } = prev; return rest }) })}
                        >
                          {t('bodega:settings.warehousesAdmin.actions.save')}
                        </Button>
                      )}
                      {!system && (
                        <Button
                          variant="outline" disabled={busy} data-testid={`warehouse-toggle-${w.id}`}
                          onClick={() => change(w.id, { is_active: !active })}
                        >
                          {t(active ? 'bodega:settings.warehousesAdmin.actions.deactivate' : 'bodega:settings.warehousesAdmin.actions.activate')}
                        </Button>
                      )}
                      {!system && (
                        <Button variant="danger-text" disabled={busy} data-testid={`warehouse-delete-${w.id}`} onClick={() => confirmAndDelete(w)}>
                          {t('bodega:settings.warehousesAdmin.actions.delete')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-6 py-3">
        {error && (
          <p className="text-xs text-red-500" role="alert" data-testid="warehouses-admin-error">
            {errorMessage(error, t('bodega:settings.warehousesAdmin.saveError'))}
          </p>
        )}
      </div>
    </Card>
  )
}
