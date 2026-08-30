import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type {
  TicketType, TicketProductDetail, InspectionReportField, InspectionReportFindingInput,
  InspectionReportMaterialInput, InspectionReportPhotoCategoria,
} from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPlus, IcoImage, IcoPaperclip } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'

interface Props {
  ticketId:            number
  ticketTipo:          TicketType
  productos:           TicketProductDetail[]
  /** REQ-238 RN4 — técnico ya asignado al ticket (Ticket.internal_technician_id vía Agendar/
   *  Reagendar), usado para precargar "Técnico responsable" en un informe NUEVO. Un informe
   *  existente manda su propio internal_technician_id (puede haber sido editado después). */
  ticketTechnicianId:  number | null
  /** Hallazgo Visual Review 2026-08-10 (SCRUM-301, mockup `buildInformeFormHtml`) — el mockup
   *  precarga Ticket/Cliente/Proyecto/Dirección como bloque de solo lectura arriba del formulario,
   *  para que el técnico no tenga que cerrar este modal (overlay full-screen sobre TicketDetailModal)
   *  para confirmar en qué ticket está parado. */
  ticketNumero:        string
  ticketCliente:        string
  ticketProyecto:       string | null
  ticketDireccion:      string | null
  canEdit:    boolean
  /** REQ-244 RN "Descargar plantilla en blanco" — más angosto que `canEdit`: Aaron/Líder de
   *  Servicios o técnico interno (route `role:superadmin,lider_servicios,tecnico_servicios` en
   *  `routes/servicios.php`) — a propósito NO incluye `garantias_servicios`, que sí puede editar
   *  el informe (`canEditInspectionReport`) pero no descargar la plantilla en blanco. Pre-QA
   *  2026-08-11 (Batch 9): antes de este fix, el botón se mostraba a CUALQUIER rol con acceso de
   *  lectura al ticket sin importar si el informe existía o no — un rol fuera de este roster
   *  (management, vendedor_disenador, garantias_servicios) veía "Ver plantilla en blanco",
   *  hacía clic, y el backend lo rechazaba con 403 → toast de error genérico, sin explicar que
   *  era un tema de permiso. El botón "Ver / Imprimir" (informe YA completado) sigue disponible
   *  para todos los roles con acceso de lectura — RN3 de REQ-244 es de solo lectura para ese caso. */
  canDownloadBlank: boolean
  onClose:    () => void
  onSaved:    () => void
}

export interface ExtraFinding {
  key:   string
  label: string
  value: string
}

export interface DraftPhoto {
  key:       string
  file:      File
  categoria: InspectionReportPhotoCategoria
}

export function fieldKey(field: InspectionReportField): string {
  return `${field.ticket_product_id ?? 'none'}:${field.key}`
}

// Fase 4 — Servicios, Batch 8 (REQ-238→243). El catálogo de campos dinámicos (REQ-239) viene
// SIEMPRE del backend (`serviciosApi.inspectionReports.fields`, InspectionReportService::
// fieldsForTicket()) — el frontend nunca reimplementa la matriz RN1-RN3, solo la renderiza.
export default function InspectionReportModal({ ticketId, ticketTipo, productos, ticketTechnicianId, ticketNumero, ticketCliente, ticketProyecto, ticketDireccion, canEdit, canDownloadBlank, onClose, onSaved }: Props) {
  const { t }    = useTranslation('servicios')
  const qc       = useQueryClient()
  const toast    = useToastStore(s => s.show)
  const navigate = useNavigate()

  const [modo, setModo]                       = useState<'formulario' | 'archivo_subido'>('formulario')
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
  const [firmaTecnico, setFirmaTecnico]       = useState('')
  const [firmaCliente, setFirmaCliente]       = useState('')
  const [draftPhotos, setDraftPhotos]         = useState<DraftPhoto[]>([])
  const [archivoFile, setArchivoFile]         = useState<File | null>(null)
  const [hydrated, setHydrated]               = useState(false)
  const [downloadingPdf, setDownloadingPdf]   = useState(false)

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const antesInputRef  = useRef<HTMLInputElement>(null)
  const despuesInputRef = useRef<HTMLInputElement>(null)

  const { data: fields = [] } = useQuery({
    queryKey: ['servicios-inspection-report-fields', ticketId],
    queryFn:  () => serviciosApi.inspectionReports.fields(ticketId),
  })

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['servicios-inspection-report', ticketId],
    queryFn:  () => serviciosApi.inspectionReports.get(ticketId),
  })

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-technicians-internal-options', ticketTipo],
    queryFn:  () => serviciosApi.technicians.internalOptions(ticketTipo),
  })

  // SCRUM-361 (rebote QA 2026-08-14) — catálogo de insumos trackeados de la Reserva Servicios,
  // para el datalist de "Material". Sin esto el campo era texto libre sin ningún vínculo posible
  // a catalog_product_id, así que el Consumo automático del REQ-291 nunca se disparaba en la
  // práctica: ningún flujo real de usuario podía crear el vínculo.
  const { data: insumos = [] } = useQuery({
    queryKey: ['servicios-insumos-datalist'],
    queryFn:  () => serviciosApi.insumos.list(),
  })
  const insumoByNombre = new Map(insumos.map(i => [i.nombre?.trim().toLowerCase(), i]))

  // Precarga desde un informe existente (RN5 REQ-238: editable después de Completado) — solo una
  // vez, cuando ambos queries ya resolvieron, para no pisar lo que el usuario está tipeando si
  // React Query revalida en segundo plano.
  useEffect(() => {
    if (hydrated || loadingExisting || fields.length === 0) return
    setHydrated(true)

    if (!existing) {
      // REQ-238 RN4, Escenario 1 — informe NUEVO: precargar "Técnico responsable" con el técnico
      // ya asignado al ticket (Agendar/Reagendar), no dejarlo vacío. Si ese técnico ya no es válido
      // para este tipo de servicio (no debería pasar en uso normal, pero es una FK "suelta"), el
      // <select> de opciones ya filtradas por especialidad simplemente no lo va a listar y el
      // usuario deberá elegir uno de los válidos.
      if (ticketTechnicianId != null) setTecnicoId(ticketTechnicianId)
      return
    }

    setModo(existing.modo)
    setFecha(existing.fecha_inspeccion ?? '')
    setHoraInicio(existing.hora_inicio ?? '')
    setHoraFin(existing.hora_fin ?? '')
    setTecnicoId(existing.internal_technician_id ?? '')
    setConclusion(existing.conclusion ?? '')
    setRequiereSeguimiento(existing.requiere_seguimiento)
    setProximosPasos(existing.proximos_pasos ?? '')
    setFirmaTecnico(existing.firma_tecnico_nombre ?? '')
    setFirmaCliente(existing.firma_cliente_nombre ?? '')
    setMateriales(existing.materiales.map(m => ({ nombre_material: m.nombre_material, cantidad: m.cantidad, catalog_product_id: m.catalog_product_id ?? null })))

    const catalogKeys = new Set(fields.map(fieldKey))
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
    void catalogKeys
  }, [existing, loadingExisting, fields, hydrated, ticketTechnicianId])

  const productMap = new Map(productos.map(p => [p.id, p]))

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

  /**
   * SCRUM-361 — el texto del campo puede coincidir exacto con un insumo trackeado del datalist
   * (el técnico lo eligió de la lista, o lo tipeó igual a mano) o no (material genérico, sin
   * vínculo). Se resuelve en cada tecla — barato, la lista de insumos ya está en cache y suele
   * ser corta — para no depender de un evento `onSelect` que `<input list>` no dispara de forma
   * consistente entre navegadores.
   */
  function updateMaterialNombre(idx: number, nombre: string) {
    const match = insumoByNombre.get(nombre.trim().toLowerCase())
    updateMaterial(idx, { nombre_material: nombre, catalog_product_id: match?.catalog_product_id ?? null })
  }

  function removeMaterial(idx: number) {
    setMateriales(prev => prev.filter((_, i) => i !== idx))
  }

  function addDraftPhotos(files: FileList | null, categoria: InspectionReportPhotoCategoria) {
    if (!files) return
    const next = Array.from(files).map(file => ({ key: `${categoria}-${Date.now()}-${file.name}`, file, categoria }))
    setDraftPhotos(prev => [...prev, ...next])
  }

  function removeDraftPhoto(key: string) {
    setDraftPhotos(prev => prev.filter(p => p.key !== key))
  }

  // REQ-244 — toggle "Ver informe": plantilla en blanco antes de Completado / documento lleno después.
  async function downloadPdf() {
    setDownloadingPdf(true)
    try {
      if (existing) {
        await serviciosApi.inspectionReports.downloadPdf(ticketId, existing.numero)
      } else {
        await serviciosApi.inspectionReports.downloadBlankPdf(ticketId, ticketNumero)
      }
    } catch {
      toast(t('tickets.inspectionReport.pdfError'), 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let report;

      if (modo === 'archivo_subido') {
        report = await serviciosApi.inspectionReports.saveUpload(ticketId, {
          archivo:               archivoFile,
          firma_tecnico_nombre:  firmaTecnico.trim() || null,
          firma_cliente_nombre:  firmaCliente.trim() || null,
        })
      } else {
        const catalogFindings: InspectionReportFindingInput[] = fields.map(field => ({
          label:              field.label,
          value:              values[fieldKey(field)] ?? '',
          ticket_product_id:  field.ticket_product_id,
          is_additional:      false,
        }))
        const extras: InspectionReportFindingInput[] = extraFindings.map(f => ({
          label:              f.label,
          value:              f.value,
          ticket_product_id:  null,
          is_additional:      true,
        }))

        report = await serviciosApi.inspectionReports.save(ticketId, {
          fecha_inspeccion:       fecha || null,
          hora_inicio:             horaInicio || null,
          hora_fin:                horaFin || null,
          internal_technician_id:  tecnicoId === '' ? null : tecnicoId,
          findings:                [...catalogFindings, ...extras],
          materiales:              materiales,
          conclusion,
          requiere_seguimiento:    requiereSeguimiento,
          proximos_pasos:          requiereSeguimiento ? proximosPasos : null,
          firma_tecnico_nombre:    firmaTecnico.trim() || null,
          firma_cliente_nombre:    firmaCliente.trim() || null,
        })
      }

      for (const photo of draftPhotos) {
        await serviciosApi.inspectionReports.uploadPhoto(ticketId, photo.file, photo.categoria)
      }

      return report
    },
    // Visual Review (2026-08-11) — reabrir el modal justo después de guardar podía mostrar campos
    // vacíos: `invalidateQueries` sin await dispara el refetch en segundo plano, pero el modal ya
    // se había cerrado (onSaved → unmount) antes de que resolviera; si se reabría antes de que
    // terminara, el nuevo montaje hidrataba desde el cache todavía viejo. A diferencia de
    // ClaimSheetModal (que sembra directo con `setQueryData` porque `save()` devuelve el registro
    // completo), acá `save()`/`saveUpload()` devuelven el informe SIN las fotos recién subidas
    // (`uploadPhoto()` corre después) — sembrar ese `report` directo pisaría el cache con fotos
    // desactualizadas. Se espera el refetch real (`invalidateQueries` sí devuelve una promesa que
    // resuelve cuando terminan de refetchear las queries activas) antes de cerrar el modal.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['servicios-inspection-report', ticketId] })
      void qc.invalidateQueries({ queryKey: ['servicios-ticket', ticketId] })
      void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
      onSaved()
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.inspectionReport.saveError'), 'error')
    },
  })

  const canSave = modo === 'formulario'
    ? conclusion.trim() !== ''
    : (existing?.archivo_adjunto_url != null || archivoFile != null)

  const productFields = fields.filter(f => f.ticket_product_id !== null)
  const staticFields   = fields.filter(f => f.ticket_product_id === null)
  const fieldsByProduct = new Map<number, InspectionReportField[]>()
  productFields.forEach(f => {
    const list = fieldsByProduct.get(f.ticket_product_id!) ?? []
    list.push(f)
    fieldsByProduct.set(f.ticket_product_id!, list)
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tickets.inspectionReport.modalTitle')}</h2>
            {existing && <p className="text-[11.5px] text-slate-500">{existing.numero}</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* Pre-QA 2026-08-11 (Batch 9) — antes se mostraba a cualquier rol con lectura del
                ticket, incluso cuando el backend (route role:superadmin,lider_servicios,
                tecnico_servicios) iba a rechazar la plantilla en blanco con 403. "Ver / Imprimir"
                (informe ya completado) sigue disponible para todos — RN3 es de solo lectura. */}
            {!loadingExisting && (existing ? true : canDownloadBlank) && (
              <Button variant="secondary" onClick={() => void downloadPdf()} loading={downloadingPdf}>
                {existing ? t('tickets.inspectionReport.printFull') : t('tickets.inspectionReport.printBlank')}
              </Button>
            )}
            {/* REQ-251 RN1 — "Ver en móvil" solo existe desde acá, nunca como acceso independiente.
                RN4: mismo criterio de permisos que editar el informe de escritorio. */}
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`/servicios/tickets/${ticketId}/inspection-report/movil`)}>
                {t('tickets.inspectionReport.viewOnMobile')}
              </Button>
            )}
            <Button variant="icon" onClick={onClose}><IcoClose /></Button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4">
          {canEdit && (
            <button
              type="button"
              onClick={() => setModo(m => m === 'formulario' ? 'archivo_subido' : 'formulario')}
              className="text-[12.5px] font-medium text-primary hover:underline self-end"
            >
              {modo === 'formulario' ? t('tickets.inspectionReport.switchToUpload') : t('tickets.inspectionReport.switchToForm')}
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReadOnlyField label={t('tickets.inspectionReport.numeroInforme')}>
              {existing?.numero ?? <span className="text-slate-400">{t('tickets.inspectionReport.numeroPending')}</span>}
            </ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.ticket')}>{ticketNumero}</ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.cliente')}>{ticketCliente}</ReadOnlyField>
            <ReadOnlyField label={t('tickets.inspectionReport.proyecto')}>{ticketProyecto ?? '—'}</ReadOnlyField>
          </div>
          <ReadOnlyField label={t('tickets.inspectionReport.direccion')}>{ticketDireccion ?? '—'}</ReadOnlyField>

          {modo === 'formulario' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('tickets.inspectionReport.fecha')}>
                  <input type="date" value={fecha} disabled={!canEdit} onChange={e => setFecha(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
                <Field label={t('tickets.inspectionReport.tecnico')}>
                  <select value={tecnicoId} disabled={!canEdit} onChange={e => setTecnicoId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60">
                    <option value="">{t('tickets.schedule.technicianPlaceholder')}</option>
                    {technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.first_name} {tech.last_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('tickets.inspectionReport.horaInicio')}>
                  <input type="time" value={horaInicio} disabled={!canEdit} onChange={e => setHoraInicio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
                <Field label={t('tickets.inspectionReport.horaFin')}>
                  <input type="time" value={horaFin} disabled={!canEdit} onChange={e => setHoraFin(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
              </div>

              <SectionLabel>{t('tickets.inspectionReport.hallazgosSection')}</SectionLabel>

              {productFields.length > 0 ? (
                Array.from(fieldsByProduct.entries()).map(([productId, prodFields]) => {
                  const producto = productMap.get(productId)
                  return (
                    <div key={productId} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 flex flex-col gap-2">
                      <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                        {producto ? `${producto.marca ?? ''} — ${producto.referencia ?? ''}` : t('tickets.inspectionReport.productoGenerico')}
                      </p>
                      {producto?.descripcion && (
                        <p className="text-[11px] text-slate-500 -mt-1.5">{producto.descripcion}</p>
                      )}
                      {/* SCRUM-314 (rebote QA 2026-08-14) — RN2/Escenario 1 exige ver el producto
                          reclamado CON su cantidad; ver mismo fix en InspectionReportMobilePage.tsx. */}
                      {producto && (
                        <p className="text-[11px] text-slate-500 -mt-1.5">
                          {t('tickets.inspectionReport.cantidadReclamadaInline', { count: producto.cantidad_reclamada })}
                        </p>
                      )}
                      {prodFields.map(field => (
                        <DynamicField key={fieldKey(field)} field={field} value={values[fieldKey(field)] ?? ''} disabled={!canEdit} onChange={v => setFieldValue(field, v)} />
                      ))}
                    </div>
                  )
                })
              ) : staticFields.length > 0 ? (
                staticFields.map(field => (
                  <DynamicField key={fieldKey(field)} field={field} value={values[fieldKey(field)] ?? ''} disabled={!canEdit} onChange={v => setFieldValue(field, v)} />
                ))
              ) : (
                <p className="text-[12.5px] text-slate-400">{t('tickets.inspectionReport.noFields')}</p>
              )}

              {extraFindings.map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{f.label}</span>
                    {canEdit && (
                      <button type="button" onClick={() => removeExtraFinding(f.key)} className="text-slate-400 hover:text-red-600">
                        <IcoClose size={12} />
                      </button>
                    )}
                  </div>
                  <textarea rows={2} value={f.value} disabled={!canEdit}
                    onChange={e => setExtraFindings(prev => prev.map(x => x.key === f.key ? { ...x, value: e.target.value } : x))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </div>
              ))}
              {canEdit && (
                <button type="button" onClick={addExtraFinding} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start">
                  <IcoPlus size={12} />
                  {t('tickets.inspectionReport.addExtraFinding')}
                </button>
              )}

              <SectionLabel>{t('tickets.inspectionReport.materialesSection')}</SectionLabel>
              <datalist id="inspection-report-insumos-datalist">
                {insumos.map(i => <option key={i.id} value={i.nombre ?? ''} />)}
              </datalist>
              <div className="flex flex-col gap-2">
                {materiales.map((m, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        {t('tickets.inspectionReport.materialNombre')}
                        {m.catalog_product_id != null && (
                          <span className="ml-1 text-emerald-600 dark:text-emerald-400">{t('tickets.inspectionReport.materialVinculado')}</span>
                        )}
                      </label>
                      <input value={m.nombre_material} disabled={!canEdit} list="inspection-report-insumos-datalist"
                        onChange={e => updateMaterialNombre(idx, e.target.value)}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm disabled:opacity-60" />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] text-slate-400 mb-0.5">{t('tickets.inspectionReport.materialCantidad')}</label>
                      <input value={m.cantidad} disabled={!canEdit} onChange={e => updateMaterial(idx, { cantidad: e.target.value })}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm disabled:opacity-60" />
                    </div>
                    {canEdit && (
                      <button type="button" onClick={() => removeMaterial(idx)} className="text-slate-400 hover:text-red-600 pb-1.5">
                        <IcoClose size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button type="button" onClick={addMaterial} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start">
                    <IcoPlus size={12} />
                    {t('tickets.inspectionReport.addMaterial')}
                  </button>
                )}
              </div>

              <SectionLabel>{t('tickets.inspectionReport.fotosAntesSection')}</SectionLabel>
              <PhotoSection
                photos={existing?.fotos.filter(p => p.categoria === 'antes') ?? []}
                draft={draftPhotos.filter(p => p.categoria === 'antes')}
                canEdit={canEdit}
                onAdd={files => addDraftPhotos(files, 'antes')}
                onRemoveDraft={removeDraftPhoto}
                inputRef={antesInputRef}
              />
              <SectionLabel>{t('tickets.inspectionReport.fotosDespuesSection')}</SectionLabel>
              <PhotoSection
                photos={existing?.fotos.filter(p => p.categoria === 'despues') ?? []}
                draft={draftPhotos.filter(p => p.categoria === 'despues')}
                canEdit={canEdit}
                onAdd={files => addDraftPhotos(files, 'despues')}
                onRemoveDraft={removeDraftPhoto}
                inputRef={despuesInputRef}
              />

              <Field label={t('tickets.inspectionReport.conclusion')}>
                <textarea rows={2} value={conclusion} disabled={!canEdit} onChange={e => setConclusion(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
              </Field>

              <Field label={t('tickets.inspectionReport.requiereSeguimiento')}>
                <select value={requiereSeguimiento ? 'si' : 'no'} disabled={!canEdit}
                  onChange={e => setRequiereSeguimiento(e.target.value === 'si')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60">
                  <option value="no">{t('tickets.inspectionReport.no')}</option>
                  <option value="si">{t('tickets.inspectionReport.yes')}</option>
                </select>
              </Field>
              {requiereSeguimiento && (
                <Field label={t('tickets.inspectionReport.proximosPasos')}>
                  <textarea rows={2} value={proximosPasos} disabled={!canEdit} onChange={e => setProximosPasos(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('tickets.inspectionReport.firmaTecnico')}>
                  <input value={firmaTecnico} disabled={!canEdit} onChange={e => setFirmaTecnico(e.target.value)}
                    placeholder={t('tickets.inspectionReport.firmaPendiente')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
                <Field label={t('tickets.inspectionReport.firmaCliente')}>
                  <input value={firmaCliente} disabled={!canEdit} onChange={e => setFirmaCliente(e.target.value)}
                    placeholder={t('tickets.inspectionReport.firmaPendiente')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <SectionLabel>{t('tickets.inspectionReport.uploadSection')}</SectionLabel>
              {existing?.archivo_adjunto_url && !archivoFile && (
                <a href={existing.archivo_adjunto_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline self-start">
                  <IcoPaperclip size={12} />
                  {t('tickets.inspectionReport.viewCurrentFile')}
                </a>
              )}
              {archivoFile && (
                <div className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-slate-200">
                  <IcoPaperclip size={12} className="text-slate-400" />
                  {archivoFile.name}
                  {canEdit && (
                    <button type="button" onClick={() => setArchivoFile(null)} className="text-slate-400 hover:text-red-600">
                      <IcoClose size={12} />
                    </button>
                  )}
                </div>
              )}
              {canEdit && (
                <>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                    onChange={e => setArchivoFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start">
                    <IcoPaperclip size={12} />
                    {t('tickets.inspectionReport.attachFile')}
                  </button>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('tickets.inspectionReport.firmaTecnico')}>
                  <input value={firmaTecnico} disabled={!canEdit} onChange={e => setFirmaTecnico(e.target.value)}
                    placeholder={t('tickets.inspectionReport.firmaPendiente')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
                <Field label={t('tickets.inspectionReport.firmaCliente')}>
                  <input value={firmaCliente} disabled={!canEdit} onChange={e => setFirmaCliente(e.target.value)}
                    placeholder={t('tickets.inspectionReport.firmaPendiente')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                </Field>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('tickets.detail.cancel')}
          </Button>
          {canEdit && (
            <Button onClick={() => mutation.mutate()} disabled={!canSave} loading={mutation.isPending}>
              {t('tickets.inspectionReport.save')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

export function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      <p className="text-slate-800 dark:text-slate-100">{children}</p>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 -mb-1">{children}</p>
}

export function DynamicField({ field, value, disabled, onChange }: { field: InspectionReportField; value: string; disabled: boolean; onChange: (v: string) => void }) {
  if (field.type === 'select' && field.options) {
    return (
      <Field label={field.label}>
        <select value={value || field.options[0]} disabled={disabled} onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60">
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </Field>
    )
  }

  return (
    <Field label={field.label}>
      <textarea rows={2} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
    </Field>
  )
}

export interface PhotoSectionProps {
  photos:        { id: number; url: string }[]
  draft:         DraftPhoto[]
  canEdit:       boolean
  onAdd:         (files: FileList | null) => void
  onRemoveDraft: (key: string) => void
  inputRef:      React.RefObject<HTMLInputElement>
}

export function PhotoSection({ photos, draft, canEdit, onAdd, onRemoveDraft, inputRef }: PhotoSectionProps) {
  const { t } = useTranslation('servicios')
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map(p => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
          <img src={p.url} alt="" className="w-full h-full object-cover" />
        </a>
      ))}
      {draft.map(p => (
        <div key={p.key} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-700/40">
          <IcoImage size={18} className="text-slate-400" />
          {canEdit && (
            <button type="button" onClick={() => onRemoveDraft(p.key)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
              <IcoClose size={10} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => onAdd(e.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-16 h-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">
            <IcoPlus size={16} />
          </button>
        </>
      )}
      {photos.length === 0 && draft.length === 0 && !canEdit && (
        <p className="text-[12px] text-slate-400">{t('tickets.inspectionReport.noPhotos')}</p>
      )}
    </div>
  )
}
