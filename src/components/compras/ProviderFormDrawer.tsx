import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useProvider, useCreateProvider, useUpdateProvider } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import type { ProviderCategory } from '@/types/compras'

// SCRUM-188 (hallazgo QA 2026-07-16) — mismo regex que EditProfileDrawer.tsx, único lugar donde
// ya existe una validación real de formato de teléfono en el proyecto.
const PHONE_REGEX = /^\+?[0-9\s-]{7,20}$/

// Exportado — reusado por ProviderDetailModal.tsx (SCRUM-186), que también arma un form de
// edición de proveedor pero con flujo de solo-lectura → editar, en vez de un drawer siempre editable.
export const PROVIDER_CATEGORIES = ['locales', 'zona_libre', 'china', 'europa', 'online'] as const

// REQ-126 RN1 (realineado SCRUM-189, 2026-08-06 — hallazgo Gerencia Test): al CREAR, obligatorios
// nombre, categoría y país, más al menos un medio de contacto (WhatsApp/Teléfono/Correo). Al
// EDITAR, categoría y país siguen siendo opcionales — hay un caso protegido (Senior Review
// 2026-07-30) donde vaciar `category` de un proveedor ya creado debe poder guardarse (recalcula
// `origin` a internacional), mismo criterio que UpdateProviderRequest en el backend.
// `origin` (REQ-141) ya no es parte del form (SCRUM-189, 2026-07-30): se deriva de `category`
// en el backend, no está en el mockup `2G__Compras_Proveedores.html`.
export function buildSchema(t: TFunction, isEdit: boolean) {
  // Pre-QA 2026-08-07 (SCRUM-189 re-check): `z.enum(...)` sobre un valor vacío produce un issue
  // `invalid_type`, que aborta el parseo del objeto ANTES de que corran los `.refine()` de más
  // abajo (bug real de Zod confirmado en aislado: un `.refine()`/`.superRefine()` encadenado a
  // `z.object()` se salta por completo si CUALQUIER campo del objeto falla con `invalid_type` —
  // no solo el campo en cuestión). Efecto observado en vivo contra dev.atlanticerp.ai: al enviar el
  // formulario de creación sin categoría NI país NI contacto, solo aparecían los mensajes de
  // categoría/país — el de "al menos un medio de contacto" quedaba en silencio (el guardado
  // seguía bloqueado igual, por categoría/país, pero el mensaje del AC de Daniela no se mostraba
  // en esa combinación). Fix: `z.string().nullable()` nunca produce `invalid_type` (null es un
  // tipo válido), así que la obligatoriedad de categoría pasa a validarse con `.refine()` en vez
  // de por tipo — esto ya no aborta el resto de la cadena.
  const categoryField = isEdit
    ? z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional()
        .refine(v => v == null || (PROVIDER_CATEGORIES as readonly string[]).includes(v), {
          message: t('compras:providerForm.validation.categoryRequired'),
        }))
    : z.preprocess(v => (v === '' ? null : v), z.string().nullable()
        .refine((v): v is (typeof PROVIDER_CATEGORIES)[number] => v != null && (PROVIDER_CATEGORIES as readonly string[]).includes(v), {
          message: t('compras:providerForm.validation.categoryRequired'),
        }))
  const countryField = isEdit
    ? z.string().max(100).nullable().optional()
    : z.string().min(1, t('compras:providerForm.validation.countryRequired')).max(100)

  return z.object({
    name:                 z.string().min(1, t('compras:providerForm.validation.nameRequired')).max(255),
    category:             categoryField,
    currency:             z.string().max(3).nullable().optional(),
    is_active:            z.boolean().optional(),
    contact_name:         z.string().max(255).nullable().optional(),
    whatsapp:             z.string().max(50).nullable().optional()
                            .refine(v => !v || PHONE_REGEX.test(v), { message: t('auth:validation.phoneFormat') }),
    phone:                z.string().max(50).nullable().optional()
                            .refine(v => !v || PHONE_REGEX.test(v), { message: t('auth:validation.phoneFormat') }),
    email:                z.union([z.string().email(t('auth:validation.invalidEmail')), z.literal('')]).nullable().optional(),
    address:              z.string().max(255).nullable().optional(),
    country:              countryField,
    bank_name:            z.string().max(255).nullable().optional(),
    bank_account_number:  z.string().max(100).nullable().optional(),
    bank_swift:           z.string().max(50).nullable().optional(),
    bank_beneficiary:     z.string().max(255).nullable().optional(),
  })
  // REQ-126 RN1: al CREAR, al menos un medio de contacto entre WhatsApp/Teléfono/Correo — el
  // error se adjunta a los 3 campos para que el usuario lo vea sin importar cuál mira primero.
  // Al editar no se exige (mismo criterio que UpdateProviderRequest: un PUT parcial que no toca
  // estos campos no debe bloquearse solo por no reenviar un contacto ya guardado).
  .refine(v => isEdit || !!(v.whatsapp || v.phone || v.email), {
    message: t('compras:providerForm.validation.contactRequired'),
    path: ['whatsapp'],
  })
  .refine(v => isEdit || !!(v.whatsapp || v.phone || v.email), {
    message: t('compras:providerForm.validation.contactRequired'),
    path: ['phone'],
  })
  .refine(v => isEdit || !!(v.whatsapp || v.phone || v.email), {
    message: t('compras:providerForm.validation.contactRequired'),
    path: ['email'],
  })
}
export type ProviderFormData = z.infer<ReturnType<typeof buildSchema>>
type FormData = ProviderFormData

interface Props {
  providerId: number | null
  onClose:    () => void
  // Pasa el proveedor guardado completo (no solo el id) — un caller como el wizard de Nueva
  // Orden necesita el nombre de inmediato para mostrarlo seleccionado (REQ-129 RN2), sin
  // depender de que una lista/query vieja lo tenga cacheado.
  onSaved:    (provider: { id: number; name: string }) => void
}

export default function ProviderFormDrawer({ providerId, onClose, onSaved }: Props) {
  const { t } = useTranslation(['common', 'auth', 'compras'])
  const isEdit = providerId !== null

  const { data: provider, isLoading } = useProvider(providerId)
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()
  const isBusy = createProvider.isPending || updateProvider.isPending

  const schema = useMemo(() => buildSchema(t, isEdit), [t, isEdit])
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USD', is_active: true },
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
    } else if (!isEdit) {
      reset({ currency: 'USD', is_active: true })
    }
  }, [provider, isEdit, reset])

  const onSubmit = async (data: FormData) => {
    try {
      // `category` queda tipado `string | null` por el fix de Zod de arriba (evita el bug de
      // `.refine()` saltado por `invalid_type`) — la validación en tiempo de ejecución ya
      // garantiza que es un `ProviderCategory` real o `null`, el cast solo reconcilia con el tipo
      // del payload de la API.
      const payload = {
        ...data,
        category: data.category as ProviderCategory | null | undefined,
        email: data.email === '' ? null : data.email,
      }
      if (isEdit && providerId !== null) {
        const saved = await updateProvider.mutateAsync({ id: providerId, data: payload })
        onSaved(saved)
      } else {
        const saved = await createProvider.mutateAsync(payload)
        onSaved(saved)
      }
    } catch {
      // error mostrado inline via mutation state
    }
  }

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <Card variant="drawer" className="fixed right-0 top-0 h-[100dvh] w-full max-w-lg z-50 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">
            {isEdit ? t('compras:providerForm.titleEdit') : t('compras:providerForm.titleCreate')}
          </h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        {isEdit && isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">…</div>
        ) : (
          <form id="provider-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto flex flex-col px-6 py-5 space-y-5">
            {/* SCRUM-188 (hallazgo QA 2026-07-16): resumen de solo lectura, el ticket pide
                "Última compra" y "Calificación" dentro del modal además de las 3 secciones
                editables — ya venían del backend (useProvider), solo faltaba renderizarlos. */}
            {isEdit && provider && (
              <div className="grid grid-cols-2 gap-3 -mt-1 mb-1">
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
            )}

            {/* Información general */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.general')}
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.name')} *
                </label>
                <input {...register('name')} className={inputCls(!!errors.name)} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.category')} {!isEdit && '*'}
                  </label>
                  <select {...register('category')} className={inputCls(!!errors.category)}>
                    <option value="">—</option>
                    {PROVIDER_CATEGORIES.map(c => (
                      <option key={c} value={c}>{t(`compras:providerForm.category.${c}`)}</option>
                    ))}
                  </select>
                  {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.currency')}
                  </label>
                  <input {...register('currency')} className={inputCls(false)} maxLength={3} />
                </div>
              </div>
              {isEdit && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" {...register('is_active')} className="rounded border-slate-300" />
                  {t('compras:providerForm.fields.isActive')}
                </label>
              )}
            </div>

            {/* Contacto */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.contact')}
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.contactName')}
                </label>
                <input {...register('contact_name')} className={inputCls(false)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.whatsapp')}
                  </label>
                  <input {...register('whatsapp')} inputMode="tel" className={inputCls(!!errors.whatsapp)} />
                  {errors.whatsapp && <p className="text-red-500 text-xs mt-1">{errors.whatsapp.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.phone')}
                  </label>
                  <input {...register('phone')} inputMode="tel" className={inputCls(!!errors.phone)} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.email')}
                </label>
                <input type="email" {...register('email')} className={inputCls(!!errors.email)} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.address')}
                  </label>
                  <input {...register('address')} className={inputCls(false)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.country')} {!isEdit && '*'}
                  </label>
                  <input {...register('country')} className={inputCls(!!errors.country)} />
                  {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country.message}</p>}
                </div>
              </div>
            </div>

            {/* Datos bancarios */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compras:providerForm.sections.bank')}
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.bankName')}
                </label>
                <input {...register('bank_name')} className={inputCls(false)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.bankAccountNumber')}
                  </label>
                  <input {...register('bank_account_number')} className={inputCls(false)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.bankSwift')}
                  </label>
                  <input {...register('bank_swift')} className={inputCls(false)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.bankBeneficiary')}
                </label>
                <input {...register('bank_beneficiary')} className={inputCls(false)} />
              </div>
            </div>

            {(createProvider.isError || updateProvider.isError) && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                {t('compras:providerForm.errors.generic')}
              </div>
            )}
          </form>
        )}

        <div className="shrink-0 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('compras:providerForm.actions.cancel')}
          </Button>
          <Button type="submit" form="provider-form" loading={isBusy} onClick={handleSubmit(onSubmit)}>
            {t('compras:providerForm.actions.save')}
          </Button>
        </div>
      </Card>
    </>
  )
}
