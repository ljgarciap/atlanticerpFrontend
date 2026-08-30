import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import {
  useFiscalSettings, useUpdateFiscalSettings, useItbmsRates, useCreateItbmsRate, useDeleteItbmsRate,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { IcoFileText, IcoLink, IcoDollarSign, IcoShield, IcoLock, IcoPencil, IcoAlertTriangle, IcoClose, IcoCheck } from '@/components/icons'
import ItbmsRateDetailModal from './ItbmsRateDetailModal'
import type { FiscalSettingsPayload, ItbmsRate } from '@/types/adminContab'

/**
 * REQ-555→560 (SCRUM-632→637) — Configuración Fiscal, pantalla exclusiva de Mark. El gate real
 * vive en el backend: `GET /admin-contab/fiscal-settings` devuelve 403 para cualquier otro
 * usuario, no solo Mark puede editar — nadie más ni siquiera ve la pantalla (RN1 REQ-555). Por
 * eso este componente trata un 403 de la query como "acceso restringido", no como un error
 * genérico, y no asume que `RequirePermission` en App.tsx (gate de entrada normal, mismo criterio
 * que el resto de rutas) sea suficiente por sí solo.
 */

function isForbidden(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 403
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

function buildSchema(t: (key: string) => string) {
  return z.object({
    razon_social:      z.string().min(1, t('adminContab:fiscal.validation.required')),
    nombre_comercial:  z.string().min(1, t('adminContab:fiscal.validation.required')),
    ruc:                z.string().min(1, t('adminContab:fiscal.validation.required')),
    dv:                 z.string().min(1, t('adminContab:fiscal.validation.required')),
    direccion_fiscal:  z.string().min(1, t('adminContab:fiscal.validation.required')),
    regimen_tributario: z.enum(['general', 'pequeno_contribuyente']),
    pac_ambiente:       z.enum(['production', 'testing']),
    pac_doc_factura_habilitado:      z.boolean(),
    pac_doc_nota_credito_habilitado: z.boolean(),
    retencion_proveedores_activa:    z.boolean(),
    dias_credito_factura: z.coerce.number().int().min(1, t('adminContab:fiscal.validation.required')),
    petty_cash_max_intentos_rechazo: z.coerce.number().int().min(1, t('adminContab:fiscal.validation.required')),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

function buildRateSchema(t: (key: string) => string) {
  const required = t('adminContab:fiscal.validation.required')
  return z.object({
    descripcion: z.string().min(1, required),
    // No z.coerce.number() a secas: Number('') es 0, no NaN, así que un campo vacío pasaría
    // silenciosamente min(0) — se valida primero como string no vacío y recién después se coerciona.
    porcentaje: z.string().min(1, required).pipe(z.coerce.number().min(0).max(100)),
  })
}
type RateFormData = z.infer<ReturnType<typeof buildRateSchema>>

export default function FiscalConfigPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { data: settings, isLoading, isError, error } = useFiscalSettings()
  const restricted = isError && isForbidden(error)

  const updateSettings = useUpdateFiscalSettings()
  const { data: rates } = useItbmsRates(!restricted && !!settings)
  const createRate = useCreateItbmsRate()
  const deleteRate = useDeleteItbmsRate()

  const [editMode, setEditMode]         = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [selectedRate, setSelectedRate] = useState<ItbmsRate | null>(null)
  const [addingRate, setAddingRate]     = useState(false)

  const schema = buildSchema(t)
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (settings) reset(settings)
  }, [settings, reset])

  const rateForm = useForm<RateFormData>({ resolver: zodResolver(buildRateSchema(t)) })

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
          {t('adminContab:fiscal.restricted.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('adminContab:fiscal.restricted.body')}</p>
      </div>
    )
  }

  if (!settings) return null

  function startEdit() {
    reset(settings)
    setEditMode(true)
  }

  function cancelEdit() {
    reset(settings)
    setEditMode(false)
    setPendingConfirm(false)
  }

  function onRequestSave() {
    setPendingConfirm(true)
  }

  const onConfirmSave = handleSubmit((data: FormData) => {
    const payload: Partial<FiscalSettingsPayload> = data
    updateSettings.mutate(payload, {
      onSuccess: () => {
        setEditMode(false)
        setPendingConfirm(false)
      },
    })
  })

  const baseRates   = (rates ?? []).filter(r => r.es_base)
  const customRates = (rates ?? []).filter(r => !r.es_base)
  const orderedRates = [...baseRates, ...customRates]

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <IcoFileText size={20} className="text-slate-500 dark:text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:fiscal.title')}</h1>
        </div>
        {!editMode ? (
          <Button variant="outline" onClick={startEdit}>
            <span className="inline-flex items-center gap-1.5"><IcoPencil size={14} />{t('common:actions.edit')}</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={cancelEdit}>{t('common:actions.cancel')}</Button>
            <Button onClick={onRequestSave} loading={updateSettings.isPending}>{t('adminContab:fiscal.saveChanges')}</Button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('adminContab:fiscal.subtitle')}</p>

      {pendingConfirm && (
        <div className="mb-5 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
            <IcoAlertTriangle size={16} />
            <span>{t('adminContab:fiscal.confirmSave')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={() => setPendingConfirm(false)}>{t('common:actions.cancel')}</Button>
            <Button onClick={() => void onConfirmSave()} loading={updateSettings.isPending}>{t('common:actions.confirm')}</Button>
          </div>
        </div>
      )}

      {updateSettings.isError && (
        <p className="text-xs text-red-500 mb-4">{mutationErrorMessage(updateSettings.error, t('adminContab:fiscal.saveError'))}</p>
      )}

      {/* No es un <form> nativo a propósito: el guardado se dispara con handleSubmit() invocado a
          mano desde onConfirmSave (tras la confirmación explícita de REQ-555), no con un submit
          nativo — y el panel de Tasas ITBMS más abajo necesita su propio <form> para el alta de
          tasa personalizada; anidar <form> es HTML inválido y rompe a qué formulario pertenece
          cada submit. */}
      <div className="space-y-6">
        {/* REQ-556 — Datos fiscales de la empresa */}
        <Card variant="panel" shadow className="p-5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">{t('adminContab:fiscal.datosFiscales.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.razonSocial')} error={errors.razon_social?.message}>
              <input {...register('razon_social')} disabled={!editMode} className={inputClass(!!errors.razon_social)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.nombreComercial')} error={errors.nombre_comercial?.message}>
              <input {...register('nombre_comercial')} disabled={!editMode} className={inputClass(!!errors.nombre_comercial)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.ruc')} error={errors.ruc?.message}>
              <input {...register('ruc')} disabled={!editMode} className={inputClass(!!errors.ruc)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.dv')} error={errors.dv?.message}>
              <input {...register('dv')} disabled={!editMode} className={inputClass(!!errors.dv)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.direccionFiscal')} error={errors.direccion_fiscal?.message} className="sm:col-span-2">
              <input {...register('direccion_fiscal')} disabled={!editMode} className={inputClass(!!errors.direccion_fiscal)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.regimenTributario')} className="sm:col-span-2">
              <select {...register('regimen_tributario')} disabled={!editMode} className={inputClass(false)}>
                <option value="general">{t('adminContab:fiscal.datosFiscales.regimen.general')}</option>
                <option value="pequeno_contribuyente">{t('adminContab:fiscal.datosFiscales.regimen.pequeno')}</option>
              </select>
            </TextField>
            {/* Batch 4 de Facturación (REQ-450) — plazo de crédito usado para calcular el
                vencimiento de facturas en el panel de Antigüedad de Cartera. Agregado al backend
                en esa sesión sin campo acá (hallazgo de Luis, superadmin, 2026-08-22). */}
            <TextField label={t('adminContab:fiscal.datosFiscales.fields.diasCreditoFactura')} error={errors.dias_credito_factura?.message}>
              <input
                type="number" min={1} step={1}
                {...register('dias_credito_factura')}
                disabled={!editMode}
                className={inputClass(!!errors.dias_credito_factura)}
              />
            </TextField>
            {/* Batch 21 de Caja Chica (SCRUM-618→623, REQ-542) — umbral de la regla de "2
                intentos" movido acá desde una constante hardcodeada en el backend (regla dura del
                workspace sobre umbrales de negocio, ver CLAUDE.md raíz), mismo patrón que
                dias_credito_factura (hallazgo análogo, mismo campo vecino). */}
            <TextField
              label={t('adminContab:fiscal.datosFiscales.fields.pettyCashMaxIntentosRechazo')}
              error={errors.petty_cash_max_intentos_rechazo?.message}
            >
              <input
                type="number" min={1} step={1}
                {...register('petty_cash_max_intentos_rechazo')}
                disabled={!editMode}
                className={inputClass(!!errors.petty_cash_max_intentos_rechazo)}
              />
            </TextField>
          </div>
        </Card>

        {/* REQ-557 — Facturación electrónica (PAC/Digifact) */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcoLink size={16} className="text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:fiscal.facturacionElectronica.title')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <TextField label={t('adminContab:fiscal.facturacionElectronica.fields.proveedor')}>
              <input value="Digifact" disabled className={inputClass(false)} />
            </TextField>
            <TextField label={t('adminContab:fiscal.facturacionElectronica.fields.ambiente')}>
              <Controller
                control={control}
                name="pac_ambiente"
                render={({ field }) => (
                  editMode ? (
                    <select {...field} className={inputClass(false)}>
                      <option value="production">{t('adminContab:fiscal.facturacionElectronica.ambiente.production')}</option>
                      <option value="testing">{t('adminContab:fiscal.facturacionElectronica.ambiente.testing')}</option>
                    </select>
                  ) : (
                    <span className={`inline-block w-fit px-2.5 py-1 rounded-full text-xs font-bold ${
                      field.value === 'production'
                        ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                    }`}>
                      {field.value === 'production'
                        ? t('adminContab:fiscal.facturacionElectronica.ambiente.production')
                        : t('adminContab:fiscal.facturacionElectronica.ambiente.testing')}
                    </span>
                  )
                )}
              />
            </TextField>
            <TextField label={t('adminContab:fiscal.facturacionElectronica.fields.ultimaSincronizacion')}>
              <input
                value={settings.pac_last_sync_at
                  ? new Date(settings.pac_last_sync_at).toLocaleString()
                  : t('adminContab:fiscal.facturacionElectronica.neverSynced')}
                disabled
                className={inputClass(false)}
              />
            </TextField>
            <TextField label={t('adminContab:fiscal.facturacionElectronica.fields.estadoConexion')}>
              {/* Solo lectura SIEMPRE, igual que "Última sincronización" — informativo, nunca
                  editable ni siquiera en modo edición (mismo criterio que RN3 de REQ-555). */}
              <span className={`inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-bold ${
                settings.pac_connection_status === 'conectado'
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                <IcoCheck size={12} />
                {settings.pac_connection_status === 'conectado'
                  ? t('adminContab:fiscal.facturacionElectronica.connectionStatus.conectado')
                  : t('adminContab:fiscal.facturacionElectronica.connectionStatus.desconectado')}
              </span>
            </TextField>
          </div>
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <ToggleRow
              label={t('adminContab:fiscal.facturacionElectronica.docs.factura')}
              control={control}
              name="pac_doc_factura_habilitado"
              disabled={!editMode}
            />
            <ToggleRow
              label={t('adminContab:fiscal.facturacionElectronica.docs.notaCredito')}
              control={control}
              name="pac_doc_nota_credito_habilitado"
              disabled={!editMode}
            />
          </div>
        </Card>

        {/* REQ-558/559 — Tasas de ITBMS */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <IcoDollarSign size={16} className="text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:fiscal.itbms.title')}</h2>
            </div>
            {editMode && !addingRate && (
              <Button variant="outline" onClick={() => setAddingRate(true)}>{t('adminContab:fiscal.itbms.addRate')}</Button>
            )}
          </div>

          {addingRate && (
            <form
              className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start"
              onSubmit={rateForm.handleSubmit((data) => {
                createRate.mutate(data, { onSuccess: () => { rateForm.reset(); setAddingRate(false) } })
              })}
            >
              <TextField label={t('adminContab:fiscal.itbms.fields.descripcion')} error={rateForm.formState.errors.descripcion?.message} className="sm:col-span-2">
                <input {...rateForm.register('descripcion')} className={inputClass(!!rateForm.formState.errors.descripcion)} />
              </TextField>
              <TextField label={t('adminContab:fiscal.itbms.fields.porcentaje')} error={rateForm.formState.errors.porcentaje?.message}>
                <input type="number" step="0.1" min={0} max={100} {...rateForm.register('porcentaje')} className={inputClass(!!rateForm.formState.errors.porcentaje)} />
              </TextField>
              {createRate.isError && (
                <p className="sm:col-span-3 text-xs text-red-500">
                  {mutationErrorMessage(createRate.error, t('adminContab:fiscal.saveError'))}
                </p>
              )}
              <div className="sm:col-span-3 flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => { setAddingRate(false); rateForm.reset() }}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" loading={createRate.isPending}>{t('common:actions.save')}</Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2">{t('adminContab:fiscal.itbms.fields.nombre')}</th>
                  <th className="py-2">{t('adminContab:fiscal.itbms.fields.porcentaje')}</th>
                  <th className="py-2">{t('adminContab:fiscal.itbms.fields.estado')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {orderedRates.map(rate => (
                  <tr key={rate.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setSelectedRate(rate)}>
                    <td className="py-2.5">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{rate.nombre ?? rate.descripcion}</div>
                      {rate.nombre && <div className="text-xs text-slate-400">{rate.descripcion}</div>}
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">{rate.porcentaje}%</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.activa
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {rate.activa ? t('adminContab:fiscal.itbms.status.active') : t('adminContab:fiscal.itbms.status.inactive')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {editMode && !rate.es_base && (
                        <button
                          type="button"
                          aria-label={t('common:actions.delete')}
                          onClick={(e) => { e.stopPropagation(); deleteRate.mutate(rate.id) }}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <IcoClose size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* REQ-560 — Retención automática a proveedores */}
        <Card variant="panel" shadow className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <IcoShield size={16} className="text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('adminContab:fiscal.retencion.title')}</h2>
          </div>
          <ToggleRow
            label={t('adminContab:fiscal.retencion.toggleLabel')}
            control={control}
            name="retencion_proveedores_activa"
            disabled={!editMode}
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">{t('adminContab:fiscal.retencion.helpNote')}</p>
        </Card>
      </div>

      {selectedRate && (
        <ItbmsRateDetailModal
          rate={rates?.find(r => r.id === selectedRate.id) ?? selectedRate}
          editable={editMode}
          onClose={() => setSelectedRate(null)}
        />
      )}
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition disabled:opacity-60 disabled:cursor-not-allowed
    ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-900 focus:ring-primary/20 focus:border-primary'}`
}

function TextField({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</span>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  )
}

type BooleanFieldName = 'pac_doc_factura_habilitado' | 'pac_doc_nota_credito_habilitado' | 'retencion_proveedores_activa'

function ToggleRow(
  { label, control, name, disabled }: { label: string; control: Control<FormData>; name: BooleanFieldName; disabled: boolean },
) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
          <Toggle checked={!!field.value} onChange={field.onChange} disabled={disabled} label={label} />
        </div>
      )}
    />
  )
}
