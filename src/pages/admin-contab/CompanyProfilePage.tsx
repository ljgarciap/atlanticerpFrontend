import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import {
  useCompanyProfile, useUpdateCompanyProfile, useUploadCompanyLogo,
  useLocations, useCreateLocation, useSetLocationActive,
  useContacts, useCreateContact, useSetContactActive,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import {
  IcoImage, IcoMapPin, IcoPhone, IcoClock, IcoLock, IcoPencil, IcoAlertTriangle, IcoClose,
} from '@/components/icons'
import type { CompanyProfilePayload, CreateLocationPayload, CreateContactPayload, Location, Contact } from '@/types/adminContab'

/**
 * REQ-561→565 (SCRUM-638→642) — Datos de la Empresa, misma pantalla exclusiva de Mark que
 * Configuración Fiscal (ver FiscalConfigPage.tsx, mismo patrón de gate/modo edición). El gate real
 * vive en el backend (403 en TODAS las rutas, incluido GET) — un 403 acá se trata como "acceso
 * restringido", no como error genérico.
 */

function isForbidden(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 403
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

function buildSchema(t: (key: string) => string) {
  const required = t('adminContab:empresa.validation.required')
  return z.object({
    descripcion_corta: z.string(),
    sitio_web: z.union([z.literal(''), z.string().url(t('adminContab:empresa.validation.invalidUrl'))]),
    zona_horaria: z.string().min(1, required),
    redes_sociales: z.array(z.object({
      plataforma: z.string().min(1, required),
      url: z.string().min(1, required),
    })),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

function buildLocationSchema(t: (key: string) => string) {
  const required = t('adminContab:empresa.validation.required')
  return z.object({
    nombre: z.string().min(1, required),
    tipo: z.enum(['oficina', 'otra']),
    direccion: z.string().min(1, required),
  })
}
type LocationFormData = z.infer<ReturnType<typeof buildLocationSchema>>

function buildContactSchema(t: (key: string) => string) {
  const required = t('adminContab:empresa.validation.required')
  return z.object({
    area: z.string().min(1, required),
    email: z.string().min(1, required).email(t('adminContab:empresa.validation.invalidUrl')),
    telefono: z.string().min(1, required),
  })
}
type ContactFormData = z.infer<ReturnType<typeof buildContactSchema>>

export default function CompanyProfilePage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { data: profile, isLoading, isError, error } = useCompanyProfile()
  const restricted = isError && isForbidden(error)

  const updateProfile = useUpdateCompanyProfile()
  const uploadLogo    = useUploadCompanyLogo()

  const { data: locations } = useLocations(!restricted && !!profile)
  const createLocation      = useCreateLocation()
  const setLocationActive   = useSetLocationActive()

  const { data: contacts } = useContacts(!restricted && !!profile)
  const createContact      = useCreateContact()
  const setContactActive   = useSetContactActive()

  const [editMode, setEditMode]             = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [locationChip, setLocationChip]     = useState<'active' | 'inactive'>('active')
  const [contactChip, setContactChip]       = useState<'active' | 'inactive'>('active')
  const [addingLocation, setAddingLocation] = useState(false)
  const [addingContact, setAddingContact]   = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const schema = buildSchema(t)
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const redesFields = useFieldArray({ control, name: 'redes_sociales' })

  useEffect(() => {
    if (profile) reset(profile)
  }, [profile, reset])

  const locationForm = useForm<LocationFormData>({
    resolver: zodResolver(buildLocationSchema(t)),
    defaultValues: { tipo: 'oficina' },
  })
  const contactForm = useForm<ContactFormData>({ resolver: zodResolver(buildContactSchema(t)) })

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
  }

  if (restricted) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-slate-100 dark:bg-slate-800">
          <IcoLock size={24} className="text-slate-400" />
        </div>
        <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
          {t('adminContab:empresa.restricted.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('adminContab:empresa.restricted.body')}</p>
      </div>
    )
  }

  if (!profile) return null

  function startEdit() {
    reset(profile)
    setEditMode(true)
  }

  function cancelEdit() {
    reset(profile)
    setEditMode(false)
    setPendingConfirm(false)
  }

  function onRequestSave() {
    setPendingConfirm(true)
  }

  const onConfirmSave = handleSubmit((data: FormData) => {
    const payload: Partial<CompanyProfilePayload> = data
    updateProfile.mutate(payload, {
      onSuccess: () => {
        setEditMode(false)
        setPendingConfirm(false)
      },
    })
  })

  function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadLogo.mutate(file)
    e.target.value = ''
  }

  const officialLocations = (locations ?? []).filter(l => !l.editable)
  const customLocations   = (locations ?? []).filter(l => l.editable)
  const orderedLocations  = [...officialLocations, ...customLocations]
  const visibleLocations  = orderedLocations.filter(l => locationChip === 'active' ? l.activa : !l.activa)
  const locationCounts    = {
    active:   orderedLocations.filter(l => l.activa).length,
    inactive: orderedLocations.filter(l => !l.activa).length,
  }

  const visibleContacts = (contacts ?? []).filter(c => contactChip === 'active' ? c.activo : !c.activo)
  const contactCounts = {
    active:   (contacts ?? []).filter(c => c.activo).length,
    inactive: (contacts ?? []).filter(c => !c.activo).length,
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <IcoImage size={20} className="text-slate-500 dark:text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:empresa.title')}</h1>
        </div>
        {!editMode ? (
          <Button variant="outline" onClick={startEdit}>
            <span className="inline-flex items-center gap-1.5"><IcoPencil size={14} />{t('common:actions.edit')}</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={cancelEdit}>{t('common:actions.cancel')}</Button>
            <Button onClick={onRequestSave} loading={updateProfile.isPending}>{t('adminContab:empresa.saveChanges')}</Button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('adminContab:empresa.subtitle')}</p>

      {pendingConfirm && (
        <div className="mb-5 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
            <IcoAlertTriangle size={16} />
            <span>{t('adminContab:empresa.confirmSave')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={() => setPendingConfirm(false)}>{t('common:actions.cancel')}</Button>
            <Button onClick={() => void onConfirmSave()} loading={updateProfile.isPending}>{t('common:actions.confirm')}</Button>
          </div>
        </div>
      )}

      {updateProfile.isError && (
        <p className="text-xs text-red-500 mb-4">{mutationErrorMessage(updateProfile.error, t('adminContab:empresa.saveError'))}</p>
      )}

      {/* No <form> nativo — mismo criterio que FiscalConfigPage: el guardado se dispara a mano
          desde onConfirmSave tras la confirmación explícita (REQ-561), y los paneles de
          Ubicaciones/Contactos más abajo tienen sus propios <form> para el alta — anidar <form>
          es HTML inválido. */}
      <div className="space-y-6">
        {/* REQ-562 — Identidad de marca */}
        <Card variant="panel" shadow className="p-5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">{t('adminContab:empresa.identidad.title')}</h2>

          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900 shrink-0">
              {profile.logo_url ? (
                <img src={profile.logo_url} alt={t('adminContab:empresa.identidad.logo')} className="w-full h-full object-contain" />
              ) : (
                <IcoImage size={20} className="text-slate-300" />
              )}
            </div>
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/svg+xml"
                className="hidden"
                onChange={onLogoSelected}
              />
              <Button
                type="button" variant="outline" disabled={!editMode} loading={uploadLogo.isPending}
                onClick={() => logoInputRef.current?.click()}
              >
                {t('adminContab:empresa.identidad.changeLogo')}
              </Button>
              <p className="text-[11px] text-slate-400 mt-1">{t('adminContab:empresa.identidad.logoHelp')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label={t('adminContab:empresa.identidad.fields.nombreComercial')} hint={t('adminContab:empresa.identidad.readOnlyNote')}>
              <input value={profile.nombre_comercial} disabled className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:empresa.identidad.fields.razonSocial')} hint={t('adminContab:empresa.identidad.readOnlyNote')}>
              <input value={profile.razon_social} disabled className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:empresa.identidad.fields.descripcionCorta')} className="sm:col-span-2">
              <textarea {...register('descripcion_corta')} disabled={!editMode} rows={2} className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:empresa.identidad.fields.sitioWeb')} error={errors.sitio_web?.message} className="sm:col-span-2">
              <input {...register('sitio_web')} disabled={!editMode} className={inputClass(!!errors.sitio_web)} />
            </TextField>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('adminContab:empresa.identidad.redesSociales.title')}</h3>
              {editMode && (
                <Button variant="outline" onClick={() => redesFields.append({ plataforma: '', url: '' })}>
                  {t('adminContab:empresa.identidad.redesSociales.add')}
                </Button>
              )}
            </div>
            {redesFields.fields.length === 0 && (
              <p className="text-xs text-slate-400">{t('adminContab:empresa.identidad.redesSociales.empty')}</p>
            )}
            <div className="space-y-2">
              {redesFields.fields.map((field, idx) => (
                <div key={field.id} className="flex items-center gap-2">
                  <input
                    placeholder={t('adminContab:empresa.identidad.redesSociales.plataforma')}
                    {...register(`redes_sociales.${idx}.plataforma`)}
                    disabled={!editMode}
                    className={inputClass(!!errors.redes_sociales?.[idx]?.plataforma) + ' flex-1'}
                  />
                  <input
                    placeholder={t('adminContab:empresa.identidad.redesSociales.url')}
                    {...register(`redes_sociales.${idx}.url`)}
                    disabled={!editMode}
                    className={inputClass(!!errors.redes_sociales?.[idx]?.url) + ' flex-[2]'}
                  />
                  {editMode && (
                    <button
                      type="button" aria-label={t('common:actions.delete')}
                      onClick={() => redesFields.remove(idx)}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                    >
                      <IcoClose size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* REQ-563 — Ubicaciones */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <IcoMapPin size={16} className="text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:empresa.ubicaciones.title')}</h2>
            </div>
            {editMode && !addingLocation && (
              <Button variant="outline" onClick={() => setAddingLocation(true)}>{t('adminContab:empresa.ubicaciones.addButton')}</Button>
            )}
          </div>

          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden w-fit mb-3">
            <Button variant="secondary" active={locationChip === 'active'} className="!rounded-none !border-0" onClick={() => setLocationChip('active')}>
              {t('adminContab:empresa.ubicaciones.chips.active')} ({locationCounts.active})
            </Button>
            <Button variant="secondary" active={locationChip === 'inactive'} className="!rounded-none !border-0" onClick={() => setLocationChip('inactive')}>
              {t('adminContab:empresa.ubicaciones.chips.inactive')} ({locationCounts.inactive})
            </Button>
          </div>

          {addingLocation && (
            <form
              className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start"
              onSubmit={locationForm.handleSubmit((data: CreateLocationPayload) => {
                createLocation.mutate(data, { onSuccess: () => { locationForm.reset({ tipo: 'oficina' }); setAddingLocation(false) } })
              })}
            >
              <TextField label={t('adminContab:empresa.ubicaciones.fields.nombre')} error={locationForm.formState.errors.nombre?.message}>
                <input {...locationForm.register('nombre')} className={inputClass(!!locationForm.formState.errors.nombre)} />
              </TextField>
              <TextField label={t('adminContab:empresa.ubicaciones.fields.tipo')}>
                <select {...locationForm.register('tipo')} className={inputClass(false)}>
                  <option value="oficina">{t('adminContab:empresa.ubicaciones.tipos.oficina')}</option>
                  <option value="otra">{t('adminContab:empresa.ubicaciones.tipos.otra')}</option>
                </select>
              </TextField>
              <TextField label={t('adminContab:empresa.ubicaciones.fields.direccion')} error={locationForm.formState.errors.direccion?.message}>
                <input {...locationForm.register('direccion')} className={inputClass(!!locationForm.formState.errors.direccion)} />
              </TextField>
              {createLocation.isError && (
                <p className="sm:col-span-3 text-xs text-red-500">{mutationErrorMessage(createLocation.error, t('adminContab:empresa.saveError'))}</p>
              )}
              <div className="sm:col-span-3 flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => { setAddingLocation(false); locationForm.reset({ tipo: 'oficina' }) }}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" loading={createLocation.isPending}>{t('common:actions.save')}</Button>
              </div>
            </form>
          )}

          <LocationsTable
            locations={visibleLocations}
            editMode={editMode}
            emptyLabel={t('adminContab:empresa.ubicaciones.empty')}
            onToggle={(loc, activa) => setLocationActive.mutate({ id: loc.id, activa })}
            t={t}
          />
        </Card>

        {/* REQ-564 — Contactos generales por área */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <IcoPhone size={16} className="text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:empresa.contactos.title')}</h2>
            </div>
            {editMode && !addingContact && (
              <Button variant="outline" onClick={() => setAddingContact(true)}>{t('adminContab:empresa.contactos.addButton')}</Button>
            )}
          </div>

          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden w-fit mb-3">
            <Button variant="secondary" active={contactChip === 'active'} className="!rounded-none !border-0" onClick={() => setContactChip('active')}>
              {t('adminContab:empresa.contactos.chips.active')} ({contactCounts.active})
            </Button>
            <Button variant="secondary" active={contactChip === 'inactive'} className="!rounded-none !border-0" onClick={() => setContactChip('inactive')}>
              {t('adminContab:empresa.contactos.chips.inactive')} ({contactCounts.inactive})
            </Button>
          </div>

          {addingContact && (
            <form
              className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start"
              onSubmit={contactForm.handleSubmit((data: CreateContactPayload) => {
                createContact.mutate(data, { onSuccess: () => { contactForm.reset(); setAddingContact(false) } })
              })}
            >
              <TextField label={t('adminContab:empresa.contactos.fields.area')} error={contactForm.formState.errors.area?.message}>
                <input {...contactForm.register('area')} className={inputClass(!!contactForm.formState.errors.area)} />
              </TextField>
              <TextField label={t('adminContab:empresa.contactos.fields.email')} error={contactForm.formState.errors.email?.message}>
                <input {...contactForm.register('email')} className={inputClass(!!contactForm.formState.errors.email)} />
              </TextField>
              <TextField label={t('adminContab:empresa.contactos.fields.telefono')} error={contactForm.formState.errors.telefono?.message}>
                <input {...contactForm.register('telefono')} className={inputClass(!!contactForm.formState.errors.telefono)} />
              </TextField>
              {createContact.isError && (
                <p className="sm:col-span-3 text-xs text-red-500">{mutationErrorMessage(createContact.error, t('adminContab:empresa.saveError'))}</p>
              )}
              <div className="sm:col-span-3 flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => { setAddingContact(false); contactForm.reset() }}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" loading={createContact.isPending}>{t('common:actions.save')}</Button>
              </div>
            </form>
          )}

          <ContactsTable
            contacts={visibleContacts}
            editMode={editMode}
            emptyLabel={t('adminContab:empresa.contactos.empty')}
            onToggle={(contact, activo) => setContactActive.mutate({ id: contact.id, activo })}
            t={t}
          />
        </Card>

        {/* REQ-565 — Configuración regional */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcoClock size={16} className="text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:empresa.regional.title')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label={t('adminContab:empresa.regional.fields.moneda')}>
              <input value={profile.moneda} disabled className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:empresa.regional.fields.anioFiscal')}>
              <input value={profile.anio_fiscal} disabled className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:empresa.regional.fields.zonaHoraria')} className="sm:col-span-2">
              <Controller
                control={control}
                name="zona_horaria"
                render={({ field }) => (
                  <select {...field} disabled={!editMode} className={inputClass(false)}>
                    <option value="America/Panama">{t('adminContab:empresa.regional.zonaHorariaOptions.americaPanama')}</option>
                  </select>
                )}
              />
            </TextField>
          </div>
        </Card>
      </div>
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition disabled:opacity-60 disabled:cursor-not-allowed
    ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-900 focus:ring-primary/20 focus:border-primary'}`
}

function TextField(
  { label, error, hint, className, children }:
  { label: string; error?: string; hint?: string; className?: string; children: React.ReactNode },
) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</span>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  )
}

function LocationsTable(
  { locations, editMode, emptyLabel, onToggle, t }:
  {
    locations: Location[]
    editMode: boolean
    emptyLabel: string
    onToggle: (loc: Location, activa: boolean) => void
    t: (key: string) => string
  },
) {
  if (locations.length === 0) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2">{t('adminContab:empresa.ubicaciones.fields.nombre')}</th>
            <th className="py-2">{t('adminContab:empresa.ubicaciones.fields.tipo')}</th>
            <th className="py-2">{t('adminContab:empresa.ubicaciones.fields.direccion')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {locations.map(loc => (
            <tr key={`${loc.source}-${loc.id}`}>
              <td className="py-2.5">
                <div className="font-medium text-slate-800 dark:text-slate-100">{loc.nombre}</div>
                {!loc.editable && <div className="text-[11px] text-slate-400">{t('adminContab:empresa.ubicaciones.sourceBodegaNote')}</div>}
              </td>
              <td className="py-2.5 text-slate-600 dark:text-slate-300">
                {t(`adminContab:empresa.ubicaciones.tipos.${loc.tipo.toLowerCase()}`)}
              </td>
              <td className="py-2.5 text-slate-600 dark:text-slate-300">{loc.direccion ?? '—'}</td>
              <td className="py-2.5 text-right">
                {editMode && loc.editable && (
                  <Toggle
                    checked={loc.activa}
                    onChange={(activa) => onToggle(loc, activa)}
                    label={t('adminContab:empresa.ubicaciones.fields.estado')}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ContactsTable(
  { contacts, editMode, emptyLabel, onToggle, t }:
  {
    contacts: Contact[]
    editMode: boolean
    emptyLabel: string
    onToggle: (contact: Contact, activo: boolean) => void
    t: (key: string) => string
  },
) {
  if (contacts.length === 0) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2">{t('adminContab:empresa.contactos.fields.area')}</th>
            <th className="py-2">{t('adminContab:empresa.contactos.fields.email')}</th>
            <th className="py-2">{t('adminContab:empresa.contactos.fields.telefono')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {contacts.map(contact => (
            <tr key={contact.id}>
              <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">{contact.area}</td>
              <td className="py-2.5 text-slate-600 dark:text-slate-300">{contact.email}</td>
              <td className="py-2.5 text-slate-600 dark:text-slate-300">{contact.telefono}</td>
              <td className="py-2.5 text-right">
                {editMode && (
                  <Toggle
                    checked={contact.activo}
                    onChange={(activo) => onToggle(contact, activo)}
                    label={t('adminContab:empresa.contactos.fields.estado')}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
