import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { canEditInspectionReport } from '@/components/servicios/TicketDetailModal'
import {
  fieldKey, Field, ReadOnlyField, SectionLabel, DynamicField, PhotoSection,
  type ExtraFinding, type DraftPhoto,
} from '@/components/servicios/InspectionReportModal'
import type { InspectionReportField, InspectionReportFindingInput, InspectionReportMaterialInput } from '@/types/servicios'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoChevronLeft, IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import SignaturePad from '@/components/servicios/SignaturePad'

type Screen = 'form' | 'firma'

// Fase 4 — Servicios, Batch 10 (REQ-251→254). Informe móvil — mismo registro que el informe de
// escritorio (InspectionReportModal), NUNCA una copia paralela (RN2 REQ-251). RN3 (REQ-251): NO es
// una versión reducida, es el mismo formulario (RN1 REQ-252) con una presentación de una sola
// columna, campos grandes. RN4 (REQ-252): "Guardar informe" no persiste nada — recién la firma
// confirmada dispara el único POST real (`saveMobile`), ver docblock del backend
// (InspectionReportService::save()).
export default function InspectionReportMobilePage() {
  const { t }      = useTranslation('servicios')
  const navigate    = useNavigate()
  const toast       = useToastStore(s => s.show)
  const user        = useAuthStore(s => s.user)
  const { ticketId: ticketIdParam } = useParams<{ ticketId: string }>()
  const ticketId    = Number(ticketIdParam)

  const [screen, setScreen] = useState<Screen>('form')
  const [fecha, setFecha]                     = useState('')
  const [horaInicio, setHoraInicio]           = useState('')
  const [horaFin, setHoraFin]                 = useState('')
  const [tecnicoId, setTecnicoId]             = useState<number | ''>('')
  const [values, setValues]                   = useState<Record<string, string>>({})
  const [extraFindings, setExtraFindings]     = useState<ExtraFinding[]>([])
  const [materiales, setMateriales]           = useState<InspectionReportMaterialInput[]>([])
  const [conclusion, setConclusion]           = useState('')
  const [requiereSeguimiento, setRequiereSeguimiento] = useState(false)
  const [proximosPasos, setProximosPasos]     = useState('')
  const [firmaCliente, setFirmaCliente]       = useState('')
  const [draftPhotos, setDraftPhotos]         = useState<DraftPhoto[]>([])
  const [hydrated, setHydrated]               = useState(false)
  const [signedAt, setSignedAt]               = useState<Date | null>(null)

  const antesInputRef   = useRef<HTMLInputElement>(null)
  const despuesInputRef = useRef<HTMLInputElement>(null)

  const { data: ticket, isLoading: loadingTicket } = useQuery({
    queryKey: ['servicios-ticket', ticketId],
    queryFn:  () => serviciosApi.tickets.get(ticketId),
    enabled:  Number.isFinite(ticketId),
  })

  const canEdit = canEditInspectionReport(user?.role, user?.id, ticket?.internal_technician?.id ?? null)

  const { data: fields = [] } = useQuery({
    queryKey: ['servicios-inspection-report-fields', ticketId],
    queryFn:  () => serviciosApi.inspectionReports.fields(ticketId),
    enabled:  Number.isFinite(ticketId) && canEdit,
  })

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['servicios-inspection-report', ticketId],
    queryFn:  () => serviciosApi.inspectionReports.get(ticketId),
    enabled:  Number.isFinite(ticketId) && canEdit,
  })

  // SCRUM-361 (rebote QA 2026-08-14) — mismo datalist de insumos trackeados que el informe de
  // escritorio (InspectionReportModal), ver su docblock.
  const { data: insumos = [] } = useQuery({
    queryKey: ['servicios-insumos-datalist'],
    queryFn:  () => serviciosApi.insumos.list(),
  })
  const insumoByNombre = new Map(insumos.map(i => [i.nombre?.trim().toLowerCase(), i]))

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-technicians-internal-options', ticket?.tipo],
    queryFn:  () => serviciosApi.technicians.internalOptions(ticket?.tipo),
    enabled:  !!ticket,
  })

  // Mismo criterio de hidratación que InspectionReportModal (RN2 REQ-251 — datos reales del ticket,
  // nunca una copia). Ver ese componente para el detalle del match de findings contra el catálogo.
  useEffect(() => {
    if (hydrated || loadingExisting || fields.length === 0 || !ticket) return
    setHydrated(true)

    if (!existing) {
      if (ticket.internal_technician?.id != null) setTecnicoId(ticket.internal_technician.id)
      return
    }

    setFecha(existing.fecha_inspeccion ?? '')
    setHoraInicio(existing.hora_inicio ?? '')
    setHoraFin(existing.hora_fin ?? '')
    setTecnicoId(existing.internal_technician_id ?? '')
    setConclusion(existing.conclusion ?? '')
    setRequiereSeguimiento(existing.requiere_seguimiento)
    setProximosPasos(existing.proximos_pasos ?? '')
    setFirmaCliente(existing.firma_cliente_nombre ?? '')
    setMateriales(existing.materiales.map(m => ({ nombre_material: m.nombre_material, cantidad: m.cantidad, catalog_product_id: m.catalog_product_id ?? null })))

    const nextValues: Record<string, string> = {}
    const nextExtras: ExtraFinding[] = []
    existing.findings.forEach((finding, idx) => {
      if (!finding.is_additional) {
        const match = fields.find(f => f.label === finding.label && f.ticket_product_id === finding.ticket_product_id)
        if (match) {
          nextValues[fieldKey(match)] = finding.value
          return
        }
      }
      nextExtras.push({ key: `existing-${idx}`, label: finding.label, value: finding.value })
    })
    setValues(nextValues)
    setExtraFindings(nextExtras)
  }, [existing, loadingExisting, fields, hydrated, ticket])

  function setFieldValue(field: InspectionReportField, value: string) {
    setValues(prev => ({ ...prev, [fieldKey(field)]: value }))
  }
  function addExtraFinding() {
    setExtraFindings(prev => [...prev, { key: `new-${Date.now()}`, label: t('tickets.inspectionReport.extraFindingLabel', { n: prev.length + 1 }), value: '' }])
  }
  function removeExtraFinding(key: string) {
    setExtraFindings(prev => prev.filter(f => f.key !== key))
  }
  function addMaterial() {
    setMateriales(prev => [...prev, { nombre_material: '', cantidad: '', catalog_product_id: null }])
  }
  function updateMaterial(idx: number, patch: Partial<InspectionReportMaterialInput>) {
    setMateriales(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }
  /** SCRUM-361 — ver docblock del mismo helper en InspectionReportModal. */
  function updateMaterialNombre(idx: number, nombre: string) {
    const match = insumoByNombre.get(nombre.trim().toLowerCase())
    updateMaterial(idx, { nombre_material: nombre, catalog_product_id: match?.catalog_product_id ?? null })
  }
  function removeMaterial(idx: number) {
    setMateriales(prev => prev.filter((_, i) => i !== idx))
  }
  function addDraftPhotos(files: FileList | null, categoria: 'antes' | 'despues') {
    if (!files) return
    const next = Array.from(files).map(file => ({ key: `${categoria}-${Date.now()}-${file.name}`, file, categoria }))
    setDraftPhotos(prev => [...prev, ...next])
  }
  function removeDraftPhoto(key: string) {
    setDraftPhotos(prev => prev.filter(p => p.key !== key))
  }

  const canContinueToSign = conclusion.trim() !== ''

  function continueToSign() {
    // RN1 REQ-253 — nombre obligatorio antes de pasar a la pantalla de firma.
    if (firmaCliente.trim() === '') {
      toast(t('tickets.inspectionReport.mobile.signatureNameRequired'), 'error')
      return
    }
    setScreen('firma')
  }

  const saveMutation = useMutation({
    mutationFn: async (signatureBlob: Blob) => {
      const catalogFindings: InspectionReportFindingInput[] = fields.map(field => ({
        label:              field.label,
        value:              values[fieldKey(field)] ?? '',
        ticket_product_id:  field.ticket_product_id,
        is_additional:      false,
      }))
      const extras: InspectionReportFindingInput[] = extraFindings.map(f => ({
        label: f.label, value: f.value, ticket_product_id: null, is_additional: true,
      }))

      const report = await serviciosApi.inspectionReports.saveMobile(ticketId, {
        fecha_inspeccion:       fecha || null,
        hora_inicio:             horaInicio || null,
        hora_fin:                horaFin || null,
        internal_technician_id:  tecnicoId === '' ? null : tecnicoId,
        findings:                [...catalogFindings, ...extras],
        materiales,
        conclusion,
        requiere_seguimiento:    requiereSeguimiento,
        proximos_pasos:          requiereSeguimiento ? proximosPasos : null,
        firma_cliente_nombre:    firmaCliente.trim(),
        firma_cliente_imagen:    signatureBlob,
      })

      for (const photo of draftPhotos) {
        await serviciosApi.inspectionReports.uploadPhoto(ticketId, photo.file, photo.categoria)
      }

      return report
    },
    onSuccess: () => {
      setSignedAt(new Date())
      toast(t('tickets.inspectionReport.mobile.saved'), 'success')
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.inspectionReport.mobile.saveError'), 'error')
    },
  })

  if (!Number.isFinite(ticketId) || loadingTicket) {
    return <div className="p-4 text-sm text-slate-400">{t('technicians.internal.card.loading')}</div>
  }

  if (!ticket || !canEdit) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <p className="text-sm text-slate-500">{t('tickets.inspectionReport.mobile.notAllowed')}</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate(-1)}>
          {t('tickets.inspectionReport.mobile.backToTicket')}
        </Button>
      </div>
    )
  }

  // SCRUM-316 (rebote QA 2026-08-14) — RN4 ("no se puede modificar una firma ya confirmada") solo
  // se hacía cumplir dentro de la sesión que acababa de firmar (signedAt). Reentrar a "Ver en
  // móvil" de un informe firmado en una sesión ANTERIOR reabría el formulario editable completo,
  // y confirmar una firma nueva reemplazaba la del cliente en silencio. El backend ahora rechaza
  // con 409 (defensa real); esto evita además que el técnico llegue a esa pantalla para empezar.
  if (!loadingExisting && existing?.firma_cliente_imagen_url != null && signedAt === null) {
    return (
      <div className="max-w-md mx-auto pb-8">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-700 mb-3">
          <IcoChevronLeft size={14} />
          {t('tickets.inspectionReport.mobile.backToTicket')}
        </button>
        <Card variant="panel" className="p-4 flex flex-col gap-3 items-center text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('tickets.inspectionReport.mobile.alreadySigned')}
          </p>
          {existing.firma_cliente_nombre && (
            <p className="text-xs text-slate-500">{existing.firma_cliente_nombre}</p>
          )}
          <img src={existing.firma_cliente_imagen_url} alt="" className="max-h-32 border border-slate-200 dark:border-slate-700 rounded-lg bg-white" />
          <Button onClick={() => navigate(`/servicios/tickets`)}>{t('tickets.inspectionReport.mobile.backToTicket')}</Button>
        </Card>
      </div>
    )
  }

  const productMap = new Map(ticket.productos.map(p => [p.id, p]))
  const productFields = fields.filter(f => f.ticket_product_id !== null)
  const staticFields   = fields.filter(f => f.ticket_product_id === null)
  const fieldsByProduct = new Map<number, InspectionReportField[]>()
  productFields.forEach(f => {
    const list = fieldsByProduct.get(f.ticket_product_id!) ?? []
    list.push(f)
    fieldsByProduct.set(f.ticket_product_id!, list)
  })

  return (
    <div className="max-w-md mx-auto pb-8">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-700 mb-3">
        <IcoChevronLeft size={14} />
        {t('tickets.inspectionReport.mobile.backToTicket')}
      </button>

      <Card variant="panel" className="p-4 flex flex-col gap-4">
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {t('tickets.inspectionReport.mobile.formTitle', { numero: existing?.numero ?? ticket.numero })}
        </h1>

        {screen === 'form' ? (
          <>
            <ReadOnlyField label={t('tickets.inspectionReport.ticket')}>{ticket.numero}</ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.cliente')}>{ticket.cliente_master ?? ticket.subcliente ?? '—'}</ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.proyecto')}>{ticket.proyecto ?? '—'}</ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.direccion')}>{ticket.direccion ?? '—'}</ReadOnlyField>

            <Field label={t('tickets.inspectionReport.fecha')}>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
            </Field>
            <Field label={t('tickets.inspectionReport.tecnico')}>
              <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base">
                <option value="">{t('tickets.schedule.technicianPlaceholder')}</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>{tech.first_name} {tech.last_name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('tickets.inspectionReport.horaInicio')}>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
            </Field>
            <Field label={t('tickets.inspectionReport.horaFin')}>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
            </Field>

            <SectionLabel>{t('tickets.inspectionReport.hallazgosSection')}</SectionLabel>
            {productFields.length > 0 ? (
              Array.from(fieldsByProduct.entries()).map(([productId, prodFields]) => {
                const producto = productMap.get(productId)
                return (
                  <div key={productId} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 flex flex-col gap-3">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                      {producto ? `${producto.marca ?? ''} — ${producto.referencia ?? ''}` : t('tickets.inspectionReport.productoGenerico')}
                    </p>
                    {/* SCRUM-314 (rebote QA 2026-08-14) — la vista móvil omitía descripción y
                        cantidad reclamada; el técnico en campo no podía confirmar contra qué
                        producto/cantidad estaba inspeccionando (RN2/Escenario 1). */}
                    {producto?.descripcion && (
                      <p className="text-[11px] text-slate-500 -mt-2">{producto.descripcion}</p>
                    )}
                    {producto && (
                      <p className="text-[11px] text-slate-500 -mt-2">
                        {t('tickets.inspectionReport.cantidadReclamadaInline', { count: producto.cantidad_reclamada })}
                      </p>
                    )}
                    {prodFields.map(field => (
                      <DynamicField key={fieldKey(field)} field={field} value={values[fieldKey(field)] ?? ''} disabled={false} onChange={v => setFieldValue(field, v)} />
                    ))}
                  </div>
                )
              })
            ) : staticFields.length > 0 ? (
              staticFields.map(field => (
                <DynamicField key={fieldKey(field)} field={field} value={values[fieldKey(field)] ?? ''} disabled={false} onChange={v => setFieldValue(field, v)} />
              ))
            ) : (
              <p className="text-[12.5px] text-slate-400">{t('tickets.inspectionReport.noFields')}</p>
            )}

            {extraFindings.map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{f.label}</span>
                  <button type="button" onClick={() => removeExtraFinding(f.key)} className="text-slate-400 hover:text-red-600">
                    <IcoClose size={12} />
                  </button>
                </div>
                <textarea rows={2} value={f.value}
                  onChange={e => setExtraFindings(prev => prev.map(x => x.key === f.key ? { ...x, value: e.target.value } : x))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
              </div>
            ))}
            <button type="button" onClick={addExtraFinding} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline self-start">
              {t('tickets.inspectionReport.addExtraFinding')}
            </button>

            <SectionLabel>{t('tickets.inspectionReport.materialesSection')}</SectionLabel>
            <datalist id="inspection-report-insumos-datalist-mobile">
              {insumos.map(i => <option key={i.id} value={i.nombre ?? ''} />)}
            </datalist>
            {materiales.map((m, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2.5">
                {m.catalog_product_id != null && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{t('tickets.inspectionReport.materialVinculado')}</span>
                )}
                <input value={m.nombre_material} placeholder={t('tickets.inspectionReport.materialNombre')}
                  list="inspection-report-insumos-datalist-mobile"
                  onChange={e => updateMaterialNombre(idx, e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2.5 text-base" />
                <div className="flex items-center gap-2">
                  <input value={m.cantidad} placeholder={t('tickets.inspectionReport.materialCantidad')}
                    onChange={e => updateMaterial(idx, { cantidad: e.target.value })}
                    className="flex-1 rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2.5 text-base" />
                  <button type="button" onClick={() => removeMaterial(idx)} className="text-slate-400 hover:text-red-600 px-2">
                    <IcoClose size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addMaterial} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline self-start">
              {t('tickets.inspectionReport.addMaterial')}
            </button>

            <SectionLabel>{t('tickets.inspectionReport.fotosAntesSection')}</SectionLabel>
            <PhotoSection
              photos={existing?.fotos.filter(p => p.categoria === 'antes') ?? []}
              draft={draftPhotos.filter(p => p.categoria === 'antes')}
              canEdit
              onAdd={files => addDraftPhotos(files, 'antes')}
              onRemoveDraft={removeDraftPhoto}
              inputRef={antesInputRef}
            />
            <SectionLabel>{t('tickets.inspectionReport.fotosDespuesSection')}</SectionLabel>
            <PhotoSection
              photos={existing?.fotos.filter(p => p.categoria === 'despues') ?? []}
              draft={draftPhotos.filter(p => p.categoria === 'despues')}
              canEdit
              onAdd={files => addDraftPhotos(files, 'despues')}
              onRemoveDraft={removeDraftPhoto}
              inputRef={despuesInputRef}
            />

            <Field label={t('tickets.inspectionReport.conclusion')}>
              <textarea rows={3} value={conclusion} onChange={e => setConclusion(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
            </Field>
            <Field label={t('tickets.inspectionReport.requiereSeguimiento')}>
              <select value={requiereSeguimiento ? 'si' : 'no'} onChange={e => setRequiereSeguimiento(e.target.value === 'si')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base">
                <option value="no">{t('tickets.inspectionReport.no')}</option>
                <option value="si">{t('tickets.inspectionReport.yes')}</option>
              </select>
            </Field>
            {requiereSeguimiento && (
              <Field label={t('tickets.inspectionReport.proximosPasos')}>
                <textarea rows={2} value={proximosPasos} onChange={e => setProximosPasos(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
              </Field>
            )}

            <Field label={t('tickets.inspectionReport.mobile.signatureName')}>
              <input value={firmaCliente} onChange={e => setFirmaCliente(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-3 text-base" />
            </Field>

            <Button className="!py-3 !text-base" disabled={!canContinueToSign} onClick={continueToSign}>
              {t('tickets.inspectionReport.mobile.continueToSign')}
            </Button>
          </>
        ) : (
          <SignatureScreen
            onBack={() => setScreen('form')}
            onConfirm={blob => {
              // RN6 REQ-253 — la hora mostrada es la del momento real de la firma (clic en
              // "Firmar"), no la del round-trip al backend — se confirma recién si el guardado
              // efectivamente tuvo éxito (RN1: "al confirmar la firma, el informe pasa a Completado").
              const now = new Date()
              saveMutation.mutate(blob, { onSuccess: () => setSignedAt(now) })
            }}
            saving={saveMutation.isPending}
            signedAt={signedAt}
            onBackToTicket={() => navigate(`/servicios/tickets`)}
          />
        )}
      </Card>
    </div>
  )
}

interface SignatureScreenProps {
  onBack:         () => void
  onConfirm:      (blob: Blob) => void
  saving:         boolean
  signedAt:       Date | null
  onBackToTicket: () => void
}

function SignatureScreen({ onBack, onConfirm, saving, signedAt, onBackToTicket }: SignatureScreenProps) {
  const { t, i18n } = useTranslation('servicios')

  if (signedAt) {
    return (
      <div className="flex flex-col gap-3 items-center text-center py-6">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('tickets.inspectionReport.mobile.saved')}
        </p>
        <p className="text-xs text-slate-500">
          {t('tickets.inspectionReport.mobile.signedAt', { fecha: signedAt.toLocaleString(i18n.language) })}
        </p>
        <Button onClick={onBackToTicket}>{t('tickets.inspectionReport.mobile.backToTicket')}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} disabled={saving} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-700 self-start">
        <IcoChevronLeft size={14} />
        {t('tickets.inspectionReport.mobile.backToForm')}
      </button>
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('tickets.inspectionReport.mobile.signatureTitle')}</h2>
      <SignaturePad onConfirm={onConfirm} confirming={saving} />
    </div>
  )
}
