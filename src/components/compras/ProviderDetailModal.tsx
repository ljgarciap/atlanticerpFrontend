import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useFiscalId } from '@/hooks/useFiscalId'
import { fiscalIdText } from '@/lib/region'
import { isAxiosError } from 'axios'
import { useProvider, useUpdateProvider, useUploadProviderBankImage, useDeleteProviderBankImage, useProviderBankExtraction } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import ImageLightboxModal from '@/components/ImageLightboxModal'
import { buildSchema, useProviderCategoryOptions, type ProviderFormData } from './ProviderFormDrawer'
import type { ProviderCategory, ProviderBankField } from '@/types/compras'

/**
 * SCRUM-186 (REQ-123, 2026-08-06 — hallazgo Gerencia Test): la tabla de Proveedores diverge del
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
  const categoryOptions = useProviderCategoryOptions(t)
  const fiscalId = useFiscalId() // Fase 6c
  const [editing, setEditing] = useState(false)

  const { data: provider, isLoading } = useProvider(providerId)
  const updateProvider = useUpdateProvider()

  // SCRUM-819 — respaldo visual de datos bancarios, independiente del guardado del resto del form.
  const uploadBankImage = useUploadProviderBankImage()
  const deleteBankImage = useDeleteProviderBankImage()
  const [bankImageError, setBankImageError] = useState<string | null>(null)
  const bankImageInputRef = useRef<HTMLInputElement>(null)

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // ADR-SCRUM819 — extracción automática. Se habilita apenas termina un upload real.
  const [extractionEnabled, setExtractionEnabled] = useState(false)
  const [aiFields, setAiFields] = useState<Set<ProviderBankField>>(new Set())
  const { data: extraction } = useProviderBankExtraction(providerId, extractionEnabled)

  const handleBankImageSelected = (file: File | undefined) => {
    if (!file) return
    setBankImageError(null)
    uploadBankImage.mutate({ id: providerId, file }, {
      onSuccess: () => setExtractionEnabled(true),
      onError: err => {
        const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
        setBankImageError(data?.message ?? t('compras:providerForm.bankImage.uploadError'))
      },
    })
  }

  const handleBankImageRemove = () => {
    setBankImageError(null)
    deleteBankImage.mutate(providerId, {
      onError: () => setBankImageError(t('compras:providerForm.bankImage.removeError')),
    })
  }

  const schema = useMemo(() => buildSchema(t, true), [t])
  const { register, handleSubmit, reset, getValues, setValue, formState: { errors } } = useForm<ProviderFormData>({
    resolver: zodResolver(schema),
  })

  // Mismo guardrail no-negociable que ProviderFormDrawer.tsx (ver ese archivo para el detalle):
  // nunca pisa un campo ya tipeado, solo pre-llena vacíos y solo los que el modelo declaró en
  // `fields_found`.
  useEffect(() => {
    if (extraction?.status !== 'completed' || !extraction.result) return

    const { result } = extraction
    const filled = new Set<ProviderBankField>()
    for (const field of result.fields_found) {
      const current = getValues(field)
      const extracted = result[field]
      if (!current && extracted) {
        setValue(field, extracted)
        filled.add(field)
      }
    }
    if (filled.size > 0) setAiFields(prev => new Set([...prev, ...filled]))
    setExtractionEnabled(false)
  }, [extraction, getValues, setValue])

  const clearAiField = (field: ProviderBankField) => {
    setAiFields(prev => {
      if (!prev.has(field)) return prev
      const next = new Set(prev)
      next.delete(field)

      return next
    })
  }

  // Pre-QA (SCRUM-819, 2026-08-31) — hallazgo real: sin el `!editing`, un refetch en background
  // mientras el usuario edita (ej. la invalidación de `useUploadProviderBankImage` al adjuntar
  // una imagen ANTES de guardar el resto del form) volvía a correr este reset() con los datos
  // viejos del servidor, pisando en silencio cualquier cambio sin guardar (categoría, nombre,
  // etc.) — confirmado en vivo: cambiar Categoría → adjuntar imagen → Guardar guardaba la
  // categoría ORIGINAL, no la elegida. Solo sincronizar el form con el servidor fuera de modo
  // edición (carga inicial, y al terminar de guardar cuando `editing` vuelve a false).
  useEffect(() => {
    if (provider && !editing) {
      reset({
        name: provider.name, tax_id: provider.tax_id, tax_id_dv: provider.tax_id_dv, category: provider.category,
        currency: provider.currency, is_active: provider.is_active, contact_name: provider.contact_name,
        whatsapp: provider.whatsapp, phone: provider.phone, email: provider.email,
        address: provider.address, country: provider.country, bank_name: provider.bank_name,
        bank_account_number: provider.bank_account_number, bank_swift: provider.bank_swift,
        bank_beneficiary: provider.bank_beneficiary,
      })
    }
  }, [provider, editing, reset])

  const startEdit  = () => setEditing(true)
  const cancelEdit = () => {
    // Descarta cualquier cambio sin guardar — vuelve a los valores reales del proveedor.
    if (provider) {
      reset({
        name: provider.name, tax_id: provider.tax_id, tax_id_dv: provider.tax_id_dv, category: provider.category,
        currency: provider.currency, is_active: provider.is_active, contact_name: provider.contact_name,
        whatsapp: provider.whatsapp, phone: provider.phone, email: provider.email,
        address: provider.address, country: provider.country, bank_name: provider.bank_name,
        bank_account_number: provider.bank_account_number, bank_swift: provider.bank_swift,
        bank_beneficiary: provider.bank_beneficiary,
      })
    }
    setAiFields(new Set())
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
        tax_id_dv: data.tax_id_dv === '' ? null : data.tax_id_dv,
      }
      await updateProvider.mutateAsync({ id: providerId, data: payload })
      setAiFields(new Set())
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
  // bloqueado se vea/actúe como uno editable deshabilitado. `aiField` (ADR-SCRUM819): badge +
  // resaltado mientras el valor viene de la extracción automática y no fue revisado todavía.
  const Field = ({
    label, name, type = 'text', required = false, aiField,
  }: { label: string; name: keyof ProviderFormData; type?: string; required?: boolean; aiField?: ProviderBankField }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label} {required && editing && '*'}
        {aiField && aiFields.has(aiField) && (
          <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
            {t('compras:providerForm.bankImage.aiExtracted')}
          </span>
        )}
      </label>
      {editing ? (
        <>
          <input
            type={type}
            {...register(name, aiField ? { onChange: () => clearAiField(aiField) } : {})}
            className={inputCls(!!errors[name]) + (aiField && aiFields.has(aiField) ? ' bg-amber-50 border-amber-300' : '')}
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
              <div className={fiscalId.uses_dv ? 'grid grid-cols-[1fr_6rem] gap-3' : 'grid grid-cols-1 gap-3'}>
                <Field label={fiscalIdText(t('compras:providerForm.fields.taxId'), fiscalId)} name="tax_id" />
                {fiscalId.uses_dv && <Field label={t('compras:providerForm.fields.taxIdDv')} name="tax_id_dv" />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.category')}
                  </label>
                  {editing ? (
                    <select {...register('category')} className={inputCls(false)}>
                      <option value="">—</option>
                      {categoryOptions.map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={readOnlyCls}>
                      {provider.category ? (categoryOptions.find(c => c.key === provider.category)?.label ?? provider.category) : '—'}
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
              <Field label={t('compras:providerForm.fields.bankName')} name="bank_name" aiField="bank_name" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('compras:providerForm.fields.bankAccountNumber')} name="bank_account_number" aiField="bank_account_number" />
                <Field label={t('compras:providerForm.fields.bankSwift')} name="bank_swift" aiField="bank_swift" />
              </div>
              <Field label={t('compras:providerForm.fields.bankBeneficiary')} name="bank_beneficiary" aiField="bank_beneficiary" />

              {/* SCRUM-819 — respaldo visual, independiente de los campos de arriba (RN9). Visible
                  en modo vista y edición (RN6); adjuntar/cambiar/eliminar solo en modo edición.
                  SCRUM-819(b) — click en la imagen la abre en grande. */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.bankImage.label')}
                </label>
                {provider.bank_image ? (
                  <div className="space-y-2">
                    <img
                      src={provider.bank_image.url}
                      alt={provider.bank_image.filename ?? ''}
                      className="max-h-40 rounded-lg border border-slate-200 cursor-zoom-in"
                      onClick={() => setLightboxSrc(provider.bank_image!.url)}
                    />
                    {editing && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-primary underline"
                          onClick={() => bankImageInputRef.current?.click()}
                        >
                          {t('compras:providerForm.bankImage.change')}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-600 underline"
                          onClick={handleBankImageRemove}
                          disabled={deleteBankImage.isPending}
                        >
                          {t('compras:providerForm.bankImage.remove')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : editing ? (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => bankImageInputRef.current?.click()}
                  >
                    {t('compras:providerForm.bankImage.attach')}
                  </button>
                ) : (
                  <div className={readOnlyCls}>—</div>
                )}
                <input
                  ref={bankImageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={e => { handleBankImageSelected(e.target.files?.[0]); e.target.value = '' }}
                />
                {bankImageError && <p className="text-xs text-red-600 mt-1">{bankImageError}</p>}
                {extractionEnabled && (extraction?.status === 'pending' || extraction?.status === 'running' || !extraction) && (
                  <p className="text-xs text-slate-400 mt-1">{t('compras:providerForm.bankImage.aiExtracting')}</p>
                )}
                {extraction?.status === 'failed' && (
                  <p className="text-xs text-slate-400 mt-1">{t('compras:providerForm.bankImage.aiExtractionFailed')}</p>
                )}
              </div>
            </div>

            {updateProvider.isError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                {/* SCRUM-852 — muestra el mensaje real del backend (ej. tax_id/nombre duplicado) en vez del genérico. */}
                {(isAxiosError<{ message?: string }>(updateProvider.error) ? updateProvider.error.response?.data?.message : undefined)
                  ?? t('compras:providerForm.errors.generic')}
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

      {lightboxSrc && <ImageLightboxModal src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}
