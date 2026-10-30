import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useFiscalId } from '@/hooks/useFiscalId'
import { useCatalogOptions } from '@/hooks/useCatalog'
import { fiscalIdText } from '@/lib/region'
import { isAxiosError } from 'axios'
import type { TFunction } from 'i18next'
import {
  useProvider, useCreateProvider, useUpdateProvider,
  useUploadProviderBankImage, useDeleteProviderBankImage, useProviderBankExtraction,
} from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import ImageLightboxModal from '@/components/ImageLightboxModal'
import type { ProviderCategory, ProviderBankField } from '@/types/compras'

// SCRUM-188 (hallazgo QA 2026-07-16) — mismo regex que EditProfileDrawer.tsx, único lugar donde
// ya existe una validación real de formato de teléfono en el proyecto.
const PHONE_REGEX = /^\+?[0-9\s-]{7,20}$/

// Exportado — reusado por ProviderDetailModal.tsx (SCRUM-186), que también arma un form de
// edición de proveedor pero con flujo de solo-lectura → editar, en vez de un drawer siempre editable.
// SCRUM-820 — "latinoamerica" agregada 2026-08-31 a pedido de Gerencia Test.
export const PROVIDER_CATEGORIES = ['locales', 'china', 'europa', 'online', 'latinoamerica'] as const

/**
 * Fase 7a — categorías de proveedor de la empresa (catálogo `provider_category`, editable en Configuración → Catálogos). Mientras el
 * catálogo carga o si falla, rigen las de siempre con su texto traducido.
 */
export function useProviderCategoryOptions(t: TFunction): { key: string, label: string }[] {
  return useCatalogOptions('provider_category', PROVIDER_CATEGORIES.map(c => ({ key: c, label: t(`compras:providerForm.category.${c}`) })))
}

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
  // seguía bloqueado igual, por categoría/país, pero el mensaje del AC de Gerencia no se mostraba
  // en esa combinación). Fix: `z.string().nullable()` nunca produce `invalid_type` (null es un
  // tipo válido), así que la obligatoriedad de categoría pasa a validarse con `.refine()` en vez
  // de por tipo — esto ya no aborta el resto de la cadena.
  const categoryField = isEdit
    ? z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional())
    // Fase 7a — la lista de categorías es un catálogo de la empresa: aquí solo se exige elegir una; el backend valida contra el catálogo.
    : z.preprocess(v => (v === '' ? null : v), z.string().nullable()
        .refine((v): v is string => v != null && v !== '', {
          message: t('compras:providerForm.validation.categoryRequired'),
        }))
  const countryField = isEdit
    ? z.string().max(100).nullable().optional()
    : z.string().min(1, t('compras:providerForm.validation.countryRequired')).max(100)

  return z.object({
    name:                 z.string().min(1, t('compras:providerForm.validation.nameRequired')).max(255),
    // SCRUM-852 — opcional en ambos flujos, la unicidad la valida el backend (422 con mensaje).
    tax_id:               z.string().max(50).nullable().optional(),
    // SCRUM-1014 — DV del RUC: 1 o 2 dígitos (mismo formato que clientes, SCRUM-928).
    tax_id_dv:            z.string().regex(/^\d{1,2}$/, t('compras:providerForm.validation.taxIdDvFormat')).or(z.literal('')).nullable().optional(),
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
  const categoryOptions = useProviderCategoryOptions(t)
  const fiscalId = useFiscalId() // Fase 6c: nombre de la identificación fiscal del país y si lleva DV
  const isEdit = providerId !== null

  const { data: provider, isLoading } = useProvider(providerId)
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()

  // SCRUM-819 — respaldo visual de datos bancarios. SCRUM-819(a) (2026-09-01): al CREAR, el
  // archivo se puede elegir ANTES de que el proveedor exista — se guarda en memoria (`File` +
  // preview local) y se sube recién en onSubmit, encadenado después de crear el proveedor (el
  // upload real siempre necesita un id, eso no cambió — lo que cambió es CUÁNDO se le pide el
  // archivo al usuario).
  const uploadBankImage = useUploadProviderBankImage()
  const deleteBankImage = useDeleteProviderBankImage()
  const [bankImageError, setBankImageError] = useState<string | null>(null)
  const bankImageInputRef = useRef<HTMLInputElement>(null)
  const [pendingBankImage, setPendingBankImage] = useState<File | null>(null)
  const [pendingBankImagePreview, setPendingBankImagePreview] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // ADR-SCRUM819 sección 5 aplicado también al flujo de CREACIÓN: si se adjuntó una imagen antes
  // de guardar, el drawer no se cierra (no se llama onSaved) hasta que la extracción termine
  // (completed/failed) o quede claro que no hay job (rate-limited) — sin esto, el guardrail de
  // "revisar antes de confiar" solo funcionaba en edición, porque el drawer de creación se cerraba
  // antes de que el usuario llegara a ver el pre-llenado. Guarda el proveedor ya creado para poder
  // avisarle al padre (onSaved) una vez que la extracción se resuelve.
  const [awaitingExtractionFor, setAwaitingExtractionFor] = useState<{ id: number; name: string } | null>(null)
  const isBusy = createProvider.isPending || updateProvider.isPending || awaitingExtractionFor !== null

  // ADR-SCRUM819 — extracción automática. Se habilita apenas hay una imagen subida de verdad
  // (no mientras el archivo solo vive en memoria, pre-creación) y se apaga cuando termina.
  // `providerId` es un PROP y durante el flujo de creación queda `null` toda la vida del
  // componente (el padre no lo cambia al crear) — sin `?? awaitingExtractionFor?.id`, el polling
  // nunca arrancaba de verdad en creación, quedaba deshabilitado para siempre.
  const [extractionEnabled, setExtractionEnabled] = useState(false)
  const [aiFields, setAiFields] = useState<Set<ProviderBankField>>(new Set())
  const extractionProviderId = providerId ?? awaitingExtractionFor?.id ?? null
  const { data: extraction } = useProviderBankExtraction(extractionProviderId, extractionEnabled)

  useEffect(() => {
    return () => { if (pendingBankImagePreview) URL.revokeObjectURL(pendingBankImagePreview) }
  }, [pendingBankImagePreview])

  const handleBankImageSelected = (file: File | undefined) => {
    if (!file) return
    setBankImageError(null)

    if (providerId === null) {
      if (pendingBankImagePreview) URL.revokeObjectURL(pendingBankImagePreview)
      setPendingBankImage(file)
      setPendingBankImagePreview(URL.createObjectURL(file))

      return
    }

    uploadBankImage.mutate({ id: providerId, file }, {
      onSuccess: () => setExtractionEnabled(true),
      onError: err => {
        const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
        setBankImageError(data?.message ?? t('compras:providerForm.bankImage.uploadError'))
      },
    })
  }

  const handleBankImageRemove = () => {
    if (providerId === null) {
      if (pendingBankImagePreview) URL.revokeObjectURL(pendingBankImagePreview)
      setPendingBankImage(null)
      setPendingBankImagePreview(null)

      return
    }
    setBankImageError(null)
    deleteBankImage.mutate(providerId, {
      onError: () => setBankImageError(t('compras:providerForm.bankImage.removeError')),
    })
  }

  const schema = useMemo(() => buildSchema(t, isEdit), [t, isEdit])
  const { register, handleSubmit, reset, getValues, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USD', is_active: true },
  })

  // Guardrail no-negociable de ADR-SCRUM819: un campo que el usuario ya tipeó a mano nunca se
  // pisa con el valor extraído, aunque difieran. Solo se pre-llenan campos vacíos, y solo los que
  // el modelo declaró explícitamente en `fields_found` (nunca se infiere de un valor no-null sin
  // esa declaración — defensa contra alucinación).
  useEffect(() => {
    if (!extraction || extraction.status === 'pending' || extraction.status === 'running') return

    if (extraction.status === 'completed' && extraction.result) {
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
    }
    setExtractionEnabled(false)

    // Recién acá se cierra el drawer de creación (ver comentario de awaitingExtractionFor arriba)
    // — cubre completed, failed, Y el caso sin job (rate-limited, extraction.status === null):
    // ninguno de esos dos últimos es 'pending'/'running', así que el guard de arriba ya los deja
    // pasar sin quedarse esperando para siempre.
    if (awaitingExtractionFor) {
      onSaved(awaitingExtractionFor)
      setAwaitingExtractionFor(null)
    }
  }, [extraction, getValues, setValue, awaitingExtractionFor, onSaved])

  const clearAiField = (field: ProviderBankField) => {
    setAiFields(prev => {
      if (!prev.has(field)) return prev
      const next = new Set(prev)
      next.delete(field)

      return next
    })
  }

  // Pre-QA (SCRUM-819, 2026-08-31) — mismo hallazgo que ProviderDetailModal.tsx: sin el guard de
  // `initializedFor`, un refetch en background mientras el usuario edita (ej. la invalidación de
  // useUploadProviderBankImage al adjuntar una imagen ANTES de guardar el resto del form) volvía
  // a correr este reset() con los datos viejos del servidor, pisando en silencio cualquier
  // cambio sin guardar. Acá no hay un booleano `editing` (el drawer siempre está "editando"), así
  // que el guard es "ya inicialicé el form para este providerId" — solo re-sincroniza cuando el
  // drawer se abre para un proveedor distinto (o para crear uno nuevo), nunca por un refetch de
  // fondo del mismo providerId.
  const initializedFor = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (initializedFor.current === providerId) return

    if (provider) {
      reset({
        name: provider.name, tax_id: provider.tax_id, tax_id_dv: provider.tax_id_dv, category: provider.category,
        currency: provider.currency, is_active: provider.is_active, contact_name: provider.contact_name,
        whatsapp: provider.whatsapp, phone: provider.phone, email: provider.email,
        address: provider.address, country: provider.country, bank_name: provider.bank_name,
        bank_account_number: provider.bank_account_number, bank_swift: provider.bank_swift,
        bank_beneficiary: provider.bank_beneficiary,
      })
      initializedFor.current = providerId
    } else if (!isEdit) {
      reset({ currency: 'USD', is_active: true })
      initializedFor.current = providerId
    }
  }, [provider, isEdit, providerId, reset])

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
        tax_id_dv: data.tax_id_dv === '' ? null : data.tax_id_dv,
      }
      if (isEdit && providerId !== null) {
        const saved = await updateProvider.mutateAsync({ id: providerId, data: payload })
        onSaved(saved)
      } else {
        const saved = await createProvider.mutateAsync(payload)
        // SCRUM-819(a) — si el usuario adjuntó la imagen antes de guardar, subirla ahora que ya
        // hay un id real. Un fallo acá no debe impedir que la creación del proveedor se dé por
        // buena (mismo criterio que el flujo de edición: la imagen es un adjunto aparte, RN9) —
        // se muestra el error pero igual se llama a onSaved().
        if (pendingBankImage) {
          try {
            await uploadBankImage.mutateAsync({ id: saved.id, file: pendingBankImage })
            // No se llama a onSaved() todavía — se espera a que la extracción de IA se resuelva
            // (ver useEffect de arriba) para que el guardrail de "revisar antes de confiar" también
            // aplique acá, no solo en edición.
            setExtractionEnabled(true)
            setAwaitingExtractionFor(saved)

            return
          } catch (err) {
            const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
            setBankImageError(data?.message ?? t('compras:providerForm.bankImage.uploadError'))
          }
        }
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
              <div>
                {/* SCRUM-852 — identificación fiscal, unicidad dura validada por el backend. */}
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {fiscalIdText(t('compras:providerForm.fields.taxId'), fiscalId)}
                </label>
                <div className={fiscalId.uses_dv ? 'grid grid-cols-[1fr_5rem] gap-3' : 'grid grid-cols-1 gap-3'}>
                  <input {...register('tax_id')} className={inputCls(!!errors.tax_id)} />
                  {fiscalId.uses_dv && <input
                    {...register('tax_id_dv')} maxLength={fiscalId.dv_max_length} inputMode="numeric"
                    placeholder={t('compras:providerForm.fields.taxIdDv')}
                    aria-label={t('compras:providerForm.fields.taxIdDv')}
                    className={inputCls(!!errors.tax_id_dv)}
                  />}
                </div>
                {errors.tax_id && <p className="text-red-500 text-xs mt-1">{errors.tax_id.message}</p>}
                {errors.tax_id_dv && <p className="text-red-500 text-xs mt-1">{errors.tax_id_dv.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.category')} {!isEdit && '*'}
                  </label>
                  <select {...register('category')} className={inputCls(!!errors.category)}>
                    <option value="">—</option>
                    {categoryOptions.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
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
                  {aiFields.has('bank_name') && (
                    <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
                      {t('compras:providerForm.bankImage.aiExtracted')}
                    </span>
                  )}
                </label>
                <input
                  {...register('bank_name', { onChange: () => clearAiField('bank_name') })}
                  className={inputCls(false) + (aiFields.has('bank_name') ? ' bg-amber-50 border-amber-300' : '')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.bankAccountNumber')}
                    {aiFields.has('bank_account_number') && (
                      <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
                        {t('compras:providerForm.bankImage.aiExtracted')}
                      </span>
                    )}
                  </label>
                  <input
                    {...register('bank_account_number', { onChange: () => clearAiField('bank_account_number') })}
                    className={inputCls(false) + (aiFields.has('bank_account_number') ? ' bg-amber-50 border-amber-300' : '')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('compras:providerForm.fields.bankSwift')}
                    {aiFields.has('bank_swift') && (
                      <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
                        {t('compras:providerForm.bankImage.aiExtracted')}
                      </span>
                    )}
                  </label>
                  <input
                    {...register('bank_swift', { onChange: () => clearAiField('bank_swift') })}
                    className={inputCls(false) + (aiFields.has('bank_swift') ? ' bg-amber-50 border-amber-300' : '')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.fields.bankBeneficiary')}
                  {aiFields.has('bank_beneficiary') && (
                    <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
                      {t('compras:providerForm.bankImage.aiExtracted')}
                    </span>
                  )}
                </label>
                <input
                  {...register('bank_beneficiary', { onChange: () => clearAiField('bank_beneficiary') })}
                  className={inputCls(false) + (aiFields.has('bank_beneficiary') ? ' bg-amber-50 border-amber-300' : '')}
                />
              </div>

              {/* SCRUM-819 — respaldo visual, independiente de los campos de arriba (RN9).
                  SCRUM-819(a) — se puede adjuntar antes de que el proveedor exista (preview
                  local, sube recién en onSubmit). SCRUM-819(b) — click en la imagen la abre en
                  grande. ADR-SCRUM819 — extracción automática dispara sola tras un upload real. */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:providerForm.bankImage.label')}
                </label>
                {providerId === null ? (
                  pendingBankImagePreview ? (
                    <div className="space-y-2">
                      <img
                        src={pendingBankImagePreview}
                        alt=""
                        className="max-h-40 rounded-lg border border-slate-200 cursor-zoom-in"
                        onClick={() => setLightboxSrc(pendingBankImagePreview)}
                      />
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
                        >
                          {t('compras:providerForm.bankImage.remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => bankImageInputRef.current?.click()}
                    >
                      {t('compras:providerForm.bankImage.attach')}
                    </button>
                  )
                ) : provider?.bank_image ? (
                  <div className="space-y-2">
                    <img
                      src={provider.bank_image.url}
                      alt={provider.bank_image.filename ?? ''}
                      className="max-h-40 rounded-lg border border-slate-200 cursor-zoom-in"
                      onClick={() => setLightboxSrc(provider.bank_image!.url)}
                    />
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
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => bankImageInputRef.current?.click()}
                  >
                    {t('compras:providerForm.bankImage.attach')}
                  </button>
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

            {(createProvider.isError || updateProvider.isError) && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                {/* SCRUM-852 — antes siempre mostraba el genérico; el 422 de nombre/tax_id
                    duplicado trae un mensaje puntual del backend que conviene mostrar tal cual. */}
                {(() => {
                  const err = createProvider.error ?? updateProvider.error
                  const backendMessage = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined

                  return backendMessage ?? t('compras:providerForm.errors.generic')
                })()}
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

      {lightboxSrc && <ImageLightboxModal src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}
    </>
  )
}
