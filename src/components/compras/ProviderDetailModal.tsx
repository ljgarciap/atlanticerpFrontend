import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useProvider, useUpdateProvider } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import { buildSchema, PROVIDER_CATEGORIES, type ProviderFormData } from './ProviderFormDrawer'
import type { ProviderCategory } from '@/types/compras'

/**
 * SCRUM-186 (REQ-123, 2026-08-06 — hallazgo Daniela Amaya): la tabla de Proveedores diverge del
 * mockup `2G__Compras_Proveedores.html` — columnas distintas y "Editar" pasaba los campos a modo
 * edición de inmediato. El flujo esperado es: "Ver detalle" abre un modal en solo-lectura;
 * "Editar" (dentro del modal) habilita los campos editables; "Guardar" persiste y vuelve a
 * solo-lectura; "Cancelar" descarta cualquier cambio sin guardar y vuelve a solo-lectura. Las
 * tarjetas "Última compra"/"Calificación" son siempre de solo lectura, incluso en modo edición.
 *
 * Reusa `buildSchema`/`PROVIDER_CATEGORIES` de ProviderFormDrawer.tsx (mismo criterio de
 * validación que la creación, pero en modo `isEdit=true`: category/country/contacto no son
 * obligatorios acá — ver el docblock de `buildSchema`).
 */
interface Props {
  providerId: number
  onClose:    () => void
}

export default function ProviderDetailModal({ providerId, onClose }: Props) {
  const { t } = useTranslation(['common', 'auth', 'compras'])
  const [editing, setEditing] = useState(false)

  const { data: provider, isLoading } = useProvider(providerId)
  const updateProvider = useUpdateProvider()

  const schema = useMemo(() => buildSchema(t, true), [t])
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProviderFormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (provider) {
      reset({
        name: provider.name, category: provider.category,
        currency: provider.currency, is_active: provider.is_active, contact_name: provider.contact_name,
        whatsapp: provider.whatsapp, phone: provider.phone, email: provider.email,
        address: provider.address, country: provider.country, bank_name: provider.bank_name,
        bank_account_number: provider.bank_account_number, bank_swift: provider.bank_swift,
        bank_beneficiary: provider.bank_beneficiary,
      })
    }
  }, [provider, reset])

  const startEdit  = () => setEditing(true)
  const cancelEdit = () => {
    // Descarta cualquier cambio sin guardar — vuelve a los valores reales del proveedor.
    if (provider) {
      reset({
        name: provider.name, category: provider.category,
        currency: provider.currency, is_active: provider.is_active, contact_name: provider.contact_name,
        whatsapp: provider.whatsapp, phone: provider.phone, email: provider.email,
        address: provider.address, country: provider.country, bank_name: provider.bank_name,
        bank_account_number: provider.bank_account_number, bank_swift: provider.bank_swift,
        bank_beneficiary: provider.bank_beneficiary,
      })
    }
    setEditing(false)
  }

  const onSubmit = async (data: ProviderFormData) => {
    try {
      // Ver nota en ProviderFormDrawer.tsx (Pre-QA 2026-08-07, SCRUM-189) — `category` queda
      // tipado `string | null` por el fix del bug de Zod, el cast solo reconcilia con el payload.
      const payload = {
        ...data,
        category: data.category as ProviderCategory | null | undefined,
        email: data.email === '' ? null : data.email,
      }
      await updateProvider.mutateAsync({ id: providerId, data: payload })
      setEditing(false)
    } catch {
      // error mostrado inline via mutation state
    }
  }

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  const readOnlyCls = 'w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 text-slate-700 border border-transparent'

  // Campo de solo-lectura fuera de modo edición: texto plano, sin input — evita que un campo
  // bloqueado se vea/actúe como uno editable deshabilitado.
  const Field = ({
    label, name, type = 'text', required = false,
  }: { label: string; name: keyof ProviderFormData; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label} {required && editing && '*'}
      </label>
      {editing ? (
        <>
          <input
            type={type}
            {...register(name)}
            className={inputCls(!!errors[name])}
          />
          {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
        </>
      ) : (
        <div className={readOnlyCls}>{(provider?.[name as keyof typeof provider] as string) || '—'}</div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/30 z-[2100] flex items-center justify-center p-4">
      <Card variant="modal" className="max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-slate-800 text-base">{t('compras:providerForm.titleDetail')}</h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        {isLoading || !provider ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-10">…</div>
        ) : (
          <form id="provider-detail-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Tarjetas informativas — siempre de solo lectura, aun en modo edición (REQ-123). */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                  {t('compras:providers.table.lastPurchase')}
                </span>
                <span className="text-sm text-slate-700">
                  {provider.last_purchase_at ?? t('compras:providers.table.noPurchases')}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                  {t('compras:providers.table.rating')}
                </span>
                <span className="text-sm text-slate-700">
                  {provider.rating !== null ? `${provider.rating}/100` : t('compras:providers.table.notRated')}
                </span>
              </div>
            </div>

            {/* Información general */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.general')}
              </h3>
              <Field label={t('compras:providerForm.fields.name')} name="name" required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.category')}
                  </label>
                  {editing ? (
                    <select {...register('category')} className={inputCls(false)}>
                      <option value="">—</option>
                      {PROVIDER_CATEGORIES.map(c => (
                        <option key={c} value={c}>{t(`compras:providerForm.category.${c}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={readOnlyCls}>
                      {provider.category ? t(`compras:providerForm.category.${provider.category}`) : '—'}
                    </div>
                  )}
                </div>
                <Field label={t('compras:providerForm.fields.currency')} name="currency" />
              </div>
              {/* Hallazgo Senior Review (2026-08-07): el toggle "Activo" existía en el drawer de
                  edición viejo (ver ProviderFormDrawer.tsx) pero se perdió al mover el flujo de
                  edición a este modal — sin esto no había forma de desactivar un proveedor desde
                  la UI. */}
              {editing ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" {...register('is_active')} className="rounded border-slate-300" />
                  {t('compras:providerForm.fields.isActive')}
                </label>
              ) : (
                <div>
                  <span className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.isActive')}
                  </span>
                  <div className={readOnlyCls}>
                    {provider.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                  </div>
                </div>
              )}
            </div>

            {/* Información de contacto */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.contact')}
              </h3>
              <Field label={t('compras:providerForm.fields.contactName')} name="contact_name" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('compras:providerForm.fields.whatsapp')} name="whatsapp" type="tel" />
                <Field label={t('compras:providerForm.fields.phone')} name="phone" type="tel" />
              </div>
              <Field label={t('compras:providerForm.fields.email')} name="email" type="email" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('compras:providerForm.fields.address')} name="address" />
                <Field label={t('compras:providerForm.fields.country')} name="country" />
              </div>
            </div>

            {/* Datos bancarios */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.bank')}
              </h3>
              <Field label={t('compras:providerForm.fields.bankName')} name="bank_name" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('compras:providerForm.fields.bankAccountNumber')} name="bank_account_number" />
                <Field label={t('compras:providerForm.fields.bankSwift')} name="bank_swift" />
              </div>
              <Field label={t('compras:providerForm.fields.bankBeneficiary')} name="bank_beneficiary" />
            </div>

            {updateProvider.isError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                {t('compras:providerForm.errors.generic')}
              </div>
            )}
          </form>
        )}

        <div className="shrink-0 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          {editing ? (
            <>
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                {t('compras:providerForm.actions.cancel')}
              </Button>
              <Button type="submit" form="provider-detail-form" loading={updateProvider.isPending}>
                {t('compras:providerForm.actions.save')}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={startEdit} disabled={isLoading || !provider}>
              {t('compras:providerForm.actions.edit')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
