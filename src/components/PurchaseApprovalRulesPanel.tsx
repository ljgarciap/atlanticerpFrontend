import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  purchaseApprovalRulesApi,
  type ApprovalPreview, type PurchaseApprovalRule, type PurchaseApprovalRuleInput, type ShippingPayer, type ShippingType,
} from '@/api/purchaseApprovalRulesApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const KEY = ['admin/purchase-approval-rules'] as const

function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { message?: string, errors?: Record<string, string[]> } | undefined
    return data?.errors ? Object.values(data.errors).flat().join(' ') : (data?.message ?? fallback)
  }
  return fallback
}

interface Draft {
  name: string, sort_order: string, is_active: boolean, shipping_type: string, who_pays_shipping: string,
  min_amount: string, max_amount: string, requires_approval: boolean,
}

const EMPTY: Draft = {
  name: '', sort_order: '10', is_active: true, shipping_type: '', who_pays_shipping: '', min_amount: '', max_amount: '', requires_approval: true,
}

const toDraft = (r: PurchaseApprovalRule): Draft => ({
  name: r.name, sort_order: String(r.sort_order), is_active: r.is_active, shipping_type: r.shipping_type ?? '',
  who_pays_shipping: r.who_pays_shipping ?? '', min_amount: r.min_amount?.toString() ?? '', max_amount: r.max_amount?.toString() ?? '',
  requires_approval: r.requires_approval,
})

const toInput = (d: Draft): PurchaseApprovalRuleInput => ({
  name: d.name.trim(), sort_order: Number(d.sort_order), is_active: d.is_active,
  shipping_type: (d.shipping_type || null) as ShippingType | null,
  who_pays_shipping: (d.who_pays_shipping || null) as ShippingPayer | null,
  min_amount: d.min_amount.trim() === '' ? null : Number(d.min_amount),
  max_amount: d.max_amount.trim() === '' ? null : Number(d.max_amount),
  requires_approval: d.requires_approval,
})

const inputCls = 'border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-slate-800 w-full'

/**
 * Fase 14a — reglas que deciden cuándo una orden de compra necesita la aprobación del aprobador primario (antes fijo en el código: envío
 * aéreo pagado por la empresa). Gana la primera regla activa, por orden, que coincide; sin coincidencia no se requiere aprobación. Solo superadmin.
 */
export default function PurchaseApprovalRulesPanel() {
  const { t } = useTranslation('compras')
  const qc = useQueryClient()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [pv, setPv] = useState({ shipping_type: 'aereo', who_pays_shipping: 'atlantic', amount: '3000' })
  const [pvResult, setPvResult] = useState<ApprovalPreview | null>(null)

  const { data: rules = [], isLoading, error } = useQuery({ queryKey: KEY, queryFn: purchaseApprovalRulesApi.list })

  const refresh = () => { setPvResult(null); return qc.invalidateQueries({ queryKey: KEY }) }
  const save = useMutation({
    mutationFn: () => editing === 'new'
      ? purchaseApprovalRulesApi.create(toInput(draft))
      : purchaseApprovalRulesApi.update(editing as number, toInput(draft)),
    onSuccess: () => { setEditing(null); return refresh() },
  })
  const remove = useMutation({ mutationFn: (id: number) => purchaseApprovalRulesApi.remove(id), onSuccess: refresh })
  const preview = useMutation({
    mutationFn: () => purchaseApprovalRulesApi.preview({
      shipping_type: (pv.shipping_type || null) as ShippingType | null,
      who_pays_shipping: (pv.who_pays_shipping || null) as ShippingPayer | null,
      amount: Number(pv.amount),
    }),
    onSuccess: setPvResult,
  })

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }))
  const open = (r: PurchaseApprovalRule | null) => { save.reset(); setDraft(r ? toDraft(r) : EMPTY); setEditing(r ? r.id : 'new') }

  const shippingLabel = (v: string | null) => v ? t(`settings.rules.shipping.${v}`) : t('settings.rules.any')
  const payerLabel = (v: string | null) => v ? t(`settings.rules.payer.${v}`) : t('settings.rules.any')
  const amountLabel = (r: PurchaseApprovalRule) => {
    if (r.min_amount === null && r.max_amount === null) return t('settings.rules.any')
    return `${r.min_amount ?? 0} – ${r.max_amount ?? '∞'}`
  }
  const draftInvalid = draft.name.trim() === '' || Number.isNaN(Number(draft.sort_order)) || Number(draft.sort_order) < 0

  if (isLoading) return <p className="text-sm text-slate-400">{t('settings.rules.loading')}</p>
  if (error) return <p className="text-sm text-red-600">{errorMessage(error, t('settings.rules.loadError'))}</p>

  return (
    <Card variant="panel" className="p-4 mb-3 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{t('settings.rules.title')}</h3>
        <p className="text-[12px] text-slate-400">{t('settings.rules.subtitle')}</p>
      </div>

      <ul className="flex flex-col gap-1" aria-label={t('settings.rules.listLabel')}>
        {rules.length === 0 && <li className="text-xs text-slate-400">{t('settings.rules.empty')}</li>}
        {rules.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm border border-slate-100 dark:border-slate-700 rounded-md px-3 py-2">
            <div className={r.is_active ? '' : 'opacity-50'}>
              <div className="font-semibold">{r.sort_order}. {r.name}{!r.is_active && ` (${t('settings.rules.inactive')})`}</div>
              <div className="text-xs text-slate-500">
                {t('settings.rules.summary', {
                  shipping: shippingLabel(r.shipping_type), payer: payerLabel(r.who_pays_shipping), amount: amountLabel(r),
                  result: r.requires_approval ? t('settings.rules.resultRequires') : t('settings.rules.resultNotRequires'),
                })}
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" className="!px-2 !py-1 !text-xs" onClick={() => open(r)}>{t('settings.rules.edit')}</Button>
              <Button variant="danger-text" className="!px-2 !py-1 !text-xs" disabled={remove.isPending}
                onClick={() => { if (window.confirm(t('settings.rules.confirmDelete', { name: r.name }))) remove.mutate(r.id) }}>
                {t('settings.rules.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {remove.isError && <p className="text-xs text-red-600">{errorMessage(remove.error, t('settings.rules.saveError'))}</p>}

      {editing === null ? (
        <div><Button variant="outline" onClick={() => open(null)}>{t('settings.rules.add')}</Button></div>
      ) : (
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-100 dark:border-slate-700 rounded-md p-3"
          onSubmit={e => { e.preventDefault(); if (!draftInvalid) save.mutate() }}>
          <label className="text-xs font-bold text-slate-500 sm:col-span-2">{t('settings.rules.name')}
            <input className={inputCls} value={draft.name} maxLength={120} onChange={e => set('name', e.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.order')}
            <input className={inputCls} type="number" min={0} value={draft.sort_order} onChange={e => set('sort_order', e.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-500 flex items-center gap-2 pt-5">
            <input type="checkbox" checked={draft.is_active} onChange={e => set('is_active', e.target.checked)} />{t('settings.rules.active')}
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.shippingType')}
            <select className={inputCls} value={draft.shipping_type} onChange={e => set('shipping_type', e.target.value)}>
              <option value="">{t('settings.rules.any')}</option>
              {(['aereo', 'maritimo', 'terrestre'] as const).map(v => <option key={v} value={v}>{t(`settings.rules.shipping.${v}`)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.payerLabel')}
            <select className={inputCls} value={draft.who_pays_shipping} onChange={e => set('who_pays_shipping', e.target.value)}>
              <option value="">{t('settings.rules.any')}</option>
              {(['atlantic', 'proveedor'] as const).map(v => <option key={v} value={v}>{t(`settings.rules.payer.${v}`)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.minAmount')}
            <input className={inputCls} type="number" min={0} step="0.01" value={draft.min_amount} onChange={e => set('min_amount', e.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.maxAmount')}
            <input className={inputCls} type="number" min={0} step="0.01" value={draft.max_amount} onChange={e => set('max_amount', e.target.value)} />
          </label>
          <label className="text-xs font-bold text-slate-500 sm:col-span-2">{t('settings.rules.result')}
            <select className={inputCls} value={draft.requires_approval ? '1' : '0'} onChange={e => set('requires_approval', e.target.value === '1')}>
              <option value="1">{t('settings.rules.resultRequires')}</option>
              <option value="0">{t('settings.rules.resultNotRequires')}</option>
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2 items-center">
            <Button type="submit" disabled={draftInvalid || save.isPending} loading={save.isPending}>{t('settings.rules.save')}</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('settings.rules.cancel')}</Button>
            {save.isError && <span className="text-xs text-red-600">{errorMessage(save.error, t('settings.rules.saveError'))}</span>}
          </div>
        </form>
      )}

      <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('settings.rules.previewTitle')}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.shippingType')}
            <select className={inputCls} value={pv.shipping_type} onChange={e => setPv(p => ({ ...p, shipping_type: e.target.value }))}>
              <option value="">{t('settings.rules.noShipping')}</option>
              {(['aereo', 'maritimo', 'terrestre'] as const).map(v => <option key={v} value={v}>{t(`settings.rules.shipping.${v}`)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.payerLabel')}
            <select className={inputCls} value={pv.who_pays_shipping} onChange={e => setPv(p => ({ ...p, who_pays_shipping: e.target.value }))}>
              <option value="">{t('settings.rules.noShipping')}</option>
              {(['atlantic', 'proveedor'] as const).map(v => <option key={v} value={v}>{t(`settings.rules.payer.${v}`)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">{t('settings.rules.previewAmount')}
            <input className={inputCls} type="number" min={0} step="0.01" value={pv.amount} onChange={e => setPv(p => ({ ...p, amount: e.target.value }))} />
          </label>
          <Button variant="outline" disabled={pv.amount.trim() === '' || preview.isPending} onClick={() => preview.mutate()}>{t('settings.rules.previewRun')}</Button>
        </div>
        {pvResult && (
          <p role="status" className="text-sm mt-2">
            {pvResult.requires_approval ? t('settings.rules.previewYes') : t('settings.rules.previewNo')}
            {' '}{pvResult.rule ? t('settings.rules.previewByRule', { name: pvResult.rule.name }) : t('settings.rules.previewNoRule')}
          </p>
        )}
        {preview.isError && <p className="text-xs text-red-600">{errorMessage(preview.error, t('settings.rules.saveError'))}</p>}
      </div>
    </Card>
  )
}
