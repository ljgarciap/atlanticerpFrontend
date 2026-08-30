import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type { TicketType, TicketSubtype, TicketInstallationKind, RequirementsPayload, RequirementsDetail, ProductOption } from '@/types/servicios'
import { TICKET_TYPES, deriveQuoteDisplayStatus } from '@/types/servicios'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip, IcoPlus, IcoSearch } from '@/components/icons'
import { InspectionReportIndicator, ClaimSheetIndicator, QuoteIndicator } from './TicketIndicators'
import TicketScheduleModal from './TicketScheduleModal'
import TicketCancelModal from './TicketCancelModal'
import InspectionReportModal from './InspectionReportModal'
import ClaimSheetModal from './ClaimSheetModal'
import ServiceQuoteModal from './ServiceQuoteModal'
import RequirementsChecklist from './RequirementsChecklist'
import ServiciosSearchPickerModal from './ServiciosSearchPickerModal'
import { useToastStore } from '@/store/toastStore'

// REQ-238 RN5 — Aaron/Líder de Servicios (superadmin incluido) o el técnico interno ASIGNADO a
// este ticket puntual — distinto de `canEdit` (edición global del ticket, solo Aaron/superadmin),
// por eso vive acá y no en TicketsPage. Gerencia y el resto quedan solo con lectura, igual que
// confirma la Matriz de Permisos por Rol del Excel para "Generar/editar Informe de Inspección".
export function canEditInspectionReport(role: string | undefined, userId: number | undefined, technicianId: number | null | undefined): boolean {
  if (role === 'superadmin' || role === 'lider_servicios') return true
  if ((role === 'tecnico_servicios' || role === 'garantias_servicios') && userId != null && userId === technicianId) return true
  return false
}

// REQ-244 RN "Descargar plantilla en blanco" — mismo roster que la ruta
// `role:superadmin,lider_servicios,tecnico_servicios` de `/inspection-report/pdf/blank` en
// routes/servicios.php. Más angosto que `canEditInspectionReport`: sin `garantias_servicios` a
// propósito (Pre-QA 2026-08-11, Batch 9 — confirmado con el backend que ese rol recibe 403 ahí).
function canDownloadBlankInspectionReport(role: string | undefined): boolean {
  return role === 'superadmin' || role === 'lider_servicios' || role === 'tecnico_servicios'
}

// REQ-278 — mismo criterio que `ClaimSheetService::assertCanEdit()`, sin rama `garantias_servicios`
// a propósito (Reclamos no es un tipo de ticket que atienda el especialista de garantías).
function canEditClaimSheet(role: string | undefined, userId: number | undefined, technicianId: number | null | undefined): boolean {
  if (role === 'superadmin' || role === 'lider_servicios') return true
  if (role === 'tecnico_servicios' && userId != null && userId === technicianId) return true
  return false
}

// REQ-279 RN4 — solo installation/warranty manejan subtipo (mismo mapeo que
// `Ticket::SUBTIPOS_BY_TIPO` en el backend, ver StoreTicketRequest/UpdateTicketRequest).
const SUBTYPES_BY_TIPO: Partial<Record<TicketType, TicketSubtype[]>> = {
  installation: ['installation', 'inspection'],
  warranty:     ['warranty_generic', 'replacement_inspection'],
}

interface Props {
  ticketId: number
  canEdit:  boolean
  onClose:  () => void
  // REQ-286 RN2 (Biblioteca de Reportes) — deep-link opcional: al llegar desde la biblioteca, el
  // modal del documento correspondiente se abre solo, sin exigir un 2do clic sobre el indicador.
  // 'quote' agregado en SCRUM-781 — mismo mecanismo, usado por "Generar cotización" en Lista/Tablero.
  initialDoc?: 'inspection_report' | 'claim_sheet' | 'quote'
  // REQ-214 RN3/RN4 (Grupo C, Inicio → modal "Ver ticket") — Agendar/Reagendar puede estar
  // disponible aunque el modal se abra en modo de solo lectura (`canEdit=false`, sin Editar ni
  // Cancelar). Default `= canEdit` para no romper TicketsPage.tsx, que sigue pasando un solo
  // booleano y espera que Agendar se comporte exactamente como antes (atado a canEdit).
  canSchedule?: boolean
}

interface EditDraft {
  tipo:                      TicketType
  subtipo:                   TicketSubtype
  tipo_instalacion:          TicketInstallationKind
  requerimientos_especiales: RequirementsPayload
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const TIME_ONLY = { hour: '2-digit', minute: '2-digit' } as const

// SCRUM-804 — fecha/hora del historial de reagendamientos, mostradas por separado (ver mockup:
// "Fecha anterior" / "Hora anterior" como campos independientes, no un solo datetime combinado).
function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString()
}
function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString([], TIME_ONLY)
}

// Visual Review 2026-08-03 (Batch 2) — "Horario de trabajo/visita" del mockup no tiene columna
// propia (ver docblock de TicketService::detail()); se deriva acá del rango scheduled_at→
// scheduled_ends_at. Sin scheduled_ends_at, muestra solo la hora de inicio.
function formatWorkSchedule(startIso: string | null, endIso: string | null): string {
  if (!startIso) return '—'
  const start = new Date(startIso).toLocaleTimeString([], TIME_ONLY)
  if (!endIso) return start
  const end = new Date(endIso).toLocaleTimeString([], TIME_ONLY)
  return `${start} – ${end}`
}

// REQ-247 — vista de solo lectura de requerimientos_especiales (catálogo fijo ya con etiqueta
// resuelta por el backend + "otros" de texto libre).
function formatRequirements(value: RequirementsDetail, t: TFunction): string {
  const labels = [...value.catalog.map(c => c.label), ...value.otros]
  return labels.length === 0 ? t('tickets.requirements.none') : labels.join(', ')
}

// REQ-224/225 — modal de detalle (solo lectura) con edición in-place (mismo modal, no uno
// separado — mismo patrón que el mockup del cliente, `toggleEdicionTicket()`).
export default function TicketDetailModal({ ticketId, canEdit, onClose, initialDoc, canSchedule }: Props) {
  const { t }   = useTranslation('servicios')
  const qc      = useQueryClient()
  const toast   = useToastStore(s => s.show)
  const user    = useAuthStore(s => s.user)
  const [mode, setMode]     = useState<'view' | 'edit'>('view')
  const [draft, setDraft]   = useState<EditDraft | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen]     = useState(false)
  const [inspectionReportOpen, setInspectionReportOpen] = useState(initialDoc === 'inspection_report')
  const [claimSheetOpen, setClaimSheetOpen] = useState(initialDoc === 'claim_sheet')
  const [serviceQuoteOpen, setServiceQuoteOpen] = useState(initialDoc === 'quote')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [openingAttachmentId, setOpeningAttachmentId] = useState<number | null>(null)
  // SCRUM-781 (punto 1) — edición de productos reclamados/afectados y adjuntos, solo en modo edit.
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  // SCRUM-781 (rebote Daniela 2026-08-20) — productos/adjuntos en modo edición eran la ÚNICA
  // parte del formulario que aplicaba de inmediato (ver commit histórico que documentaba esto como
  // decisión deliberada) — "Cancelar" descartaba los 4 campos batcheados pero un producto ya
  // borrado/agregado quedaba persistido igual. Ahora TODO en modo edición es un borrador local:
  // nada llama a la API hasta "Guardar", "Cancelar" solo limpia este estado sin tocar el servidor.
  interface DraftNewProduct { tempId: number; item: ProductOption; cantidad: number }
  const [draftRemovedProductIds, setDraftRemovedProductIds] = useState<number[]>([])
  const [draftQtyOverrides, setDraftQtyOverrides]           = useState<Record<number, number>>({})
  const [draftNewProducts, setDraftNewProducts]             = useState<DraftNewProduct[]>([])
  const [draftNewFiles, setDraftNewFiles]                   = useState<File[]>([])
  const nextTempId = useRef(-1)

  function resetProductDraftState() {
    setDraftRemovedProductIds([])
    setDraftQtyOverrides({})
    setDraftNewProducts([])
    setDraftNewFiles([])
    setAttachmentError(null)
  }
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['servicios-ticket-detail', ticketId],
    queryFn:  () => serviciosApi.tickets.get(ticketId),
  })

  // REQ-278 — a diferencia de Informe de Inspección, `claim_sheets` no tiene un campo denormalizado
  // en `tickets` (ver docblock de la migración) — el estado del indicador se resuelve con un query
  // propio, solo para tickets tipo=claim (REQ-220 RN1: es la única superficie que aplica ahí).
  const { data: claimSheet } = useQuery({
    queryKey: ['servicios-claim-sheet', ticketId],
    queryFn:  () => serviciosApi.claimSheets.get(ticketId),
    enabled:  ticket?.tipo === 'claim',
  })

  const invalidateTicketLists = () => {
    void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
    void qc.invalidateQueries({ queryKey: ['servicios-tickets-stats'] })
    void qc.invalidateQueries({ queryKey: ['servicios-ticket-detail', ticketId] })
  }

  // REQ-248 — abre un adjunto en una pestaña nueva vía URL firmada de 15 min (mismo patrón que
  // DocumentController::url() en CRM: la URL nunca se guarda, se pide fresca en cada clic).
  async function openAttachment(attachmentId: number) {
    setOpeningAttachmentId(attachmentId)
    try {
      const { url } = await serviciosApi.tickets.attachmentUrl(attachmentId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast(t('tickets.detail.attachmentUrlError'), 'error')
    } finally {
      setOpeningAttachmentId(null)
    }
  }

  // SCRUM-781 (rebote Daniela 2026-08-20) — un único "Guardar" aplica el diff completo (los 4
  // campos batcheados + productos agregados/editados/quitados + adjuntos nuevos) en secuencia;
  // "Cancelar" nunca llega a llamar ninguno de estos endpoints. Los adjuntos ya existentes siguen
  // sin poder eliminarse (RN3, sin cambios).
  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('no draft')
      const updateResult = await serviciosApi.tickets.update(ticketId, draft)
      for (const id of draftRemovedProductIds) {
        await serviciosApi.tickets.removeProduct(ticketId, id)
      }
      for (const [idStr, cantidad] of Object.entries(draftQtyOverrides)) {
        await serviciosApi.tickets.updateProductQuantity(ticketId, Number(idStr), cantidad)
      }
      for (const dp of draftNewProducts) {
        await serviciosApi.tickets.addProduct(ticketId, { catalog_product_id: dp.item.id, cantidad_reclamo: dp.cantidad })
      }
      for (const file of draftNewFiles) {
        await serviciosApi.tickets.uploadAttachment(ticketId, file)
      }
      return updateResult
    },
    onSuccess: (result) => {
      invalidateTicketLists()
      setMode('view')
      resetProductDraftState()
      if (result.technician_unassigned) {
        toast(t('tickets.detail.technicianUnassignedWarning'), 'error')
      }
    },
    onError: (err) => {
      // Se queda en modo edición a propósito — alguna llamada de la secuencia pudo haber
      // aplicado antes de fallar; el usuario ve el estado real tras "Guardar" de nuevo o cierra
      // sin guardar. El diff local del borrador no se pierde para poder reintentar.
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.detail.saveError'), 'error')
    },
  })

  const [editingQtyProductId, setEditingQtyProductId] = useState<number | null>(null)
  const [editingQtyValue, setEditingQtyValue]         = useState('')

  function startEditingQty(rowId: number, currentQty: number) {
    setEditingQtyProductId(rowId)
    setEditingQtyValue(String(currentQty))
  }

  // `rowId` es el id real del producto (existente) o el tempId negativo de un producto recién
  // agregado en este borrador — nunca toca la API, solo el estado local correspondiente.
  function commitEditingQty(rowId: number) {
    const cantidad = parseInt(editingQtyValue, 10)
    setEditingQtyProductId(null)
    if (!Number.isFinite(cantidad) || cantidad < 1) return
    if (rowId < 0) {
      setDraftNewProducts(list => list.map(dp => (dp.tempId === rowId ? { ...dp, cantidad } : dp)))
    } else {
      setDraftQtyOverrides(o => ({ ...o, [rowId]: cantidad }))
    }
  }

  function handleSelectNewFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setAttachmentError(null)
    setDraftNewFiles(list => [...list, ...Array.from(files)])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function startEdit() {
    if (!ticket) return
    resetProductDraftState()
    setDraft({
      tipo:                      ticket.tipo,
      subtipo:                   ticket.subtipo,
      tipo_instalacion:          ticket.tipo_instalacion ?? 'internal',
      requerimientos_especiales: {
        catalog: ticket.requerimientos_especiales.catalog.map(c => c.key),
        otros:   ticket.requerimientos_especiales.otros,
      },
    })
    setMode('edit')
  }

  function cancelEdit() {
    setDraft(null)
    resetProductDraftState()
    setMode('view')
  }

  function onTipoChange(tipo: TicketType) {
    setDraft(d => d && {
      ...d,
      tipo,
      // RN4 — al cambiar el tipo, el subtipo se recalcula según las opciones del nuevo tipo.
      subtipo: SUBTYPES_BY_TIPO[tipo]?.[0] ?? null,
    })
  }

  function saveEdit() {
    if (!draft) return
    saveEditMutation.mutate()
  }

  async function downloadPdf() {
    if (!ticket) return
    setDownloadingPdf(true)
    try {
      await serviciosApi.tickets.downloadPdf(ticket.id, ticket.numero)
    } catch {
      toast(t('tickets.detail.pdfError'), 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const subtypeOptions = draft ? SUBTYPES_BY_TIPO[draft.tipo] ?? [] : []
  const clienteCollapsed = ticket && ticket.cliente_master === ticket.subcliente

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {ticket ? t('tickets.detail.title', { numero: ticket.numero }) : t('common:labels.loading')}
          </h2>
          <div className="flex items-center gap-2">
            {mode === 'view' && ticket && (
              <Button variant="secondary" onClick={() => void downloadPdf()} loading={downloadingPdf}>
                {t('tickets.actions.print')}
              </Button>
            )}
            {mode === 'view' && canEdit && ticket && ticket.estado !== 'cancelled' && (
              <Button
                variant="secondary"
                className="!text-red-700 !border-red-200 dark:!border-red-900"
                onClick={() => setCancelOpen(true)}
              >
                {t('tickets.actions.cancelTicket')}
              </Button>
            )}
            {mode === 'view' && canEdit && ticket && (
              <Button variant="secondary" onClick={startEdit}>{t('tickets.detail.edit')}</Button>
            )}
            <Button variant="icon" onClick={onClose}><IcoClose /></Button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !ticket ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : mode === 'edit' && draft ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('tickets.detail.fields.tipo')}
                  </span>
                  <select
                    value={draft.tipo}
                    onChange={e => onTipoChange(e.target.value as TicketType)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
                  >
                    {TICKET_TYPES.map(tp => <option key={tp} value={tp}>{t(`tickets.types.${tp}`)}</option>)}
                  </select>
                </label>

                {subtypeOptions.length > 0 && (
                  <label className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('tickets.detail.fields.subtipo')}
                    </span>
                    <select
                      value={draft.subtipo ?? ''}
                      onChange={e => setDraft(d => d && { ...d, subtipo: e.target.value as TicketSubtype })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
                    >
                      {subtypeOptions.map(st => (
                        <option key={st ?? ''} value={st ?? ''}>{t(`tickets.subtypes.${st}`)}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('tickets.detail.fields.tipoInstalacion')}
                  </span>
                  <select
                    value={draft.tipo_instalacion ?? 'internal'}
                    onChange={e => setDraft(d => d && { ...d, tipo_instalacion: e.target.value as TicketInstallationKind })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
                  >
                    <option value="internal">{t('tickets.detail.tipoInstalacionValues.internal')}</option>
                    <option value="subcontracted">{t('tickets.detail.tipoInstalacionValues.subcontracted')}</option>
                  </select>
                </label>
              </div>

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.requerimientos')}
                </span>
                <RequirementsChecklist
                  value={draft.requerimientos_especiales}
                  onChange={value => setDraft(d => d && { ...d, requerimientos_especiales: value })}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.productos')}
                </span>
                <div className="flex flex-col gap-1.5">
                  {ticket.productos.filter(p => !draftRemovedProductIds.includes(p.id)).map(p => {
                    const locked      = p.cantidad_recibida > 0
                    const displayQty  = draftQtyOverrides[p.id] ?? p.cantidad_reclamada
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                        <div className="flex-1 text-[12.5px] text-slate-700 dark:text-slate-200 truncate">
                          <strong>{p.referencia}</strong> — {p.descripcion}
                        </div>
                        {editingQtyProductId === p.id ? (
                          <input
                            type="number" min={1} autoFocus value={editingQtyValue}
                            onChange={e => setEditingQtyValue(e.target.value)}
                            onBlur={() => commitEditingQty(p.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEditingQty(p.id) }}
                            className="w-16 rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1 text-xs"
                          />
                        ) : locked ? (
                          <span className="text-xs text-slate-400" title={t('tickets.detail.productLockedTooltip')}>
                            {t('tickets.detail.productQty', { qty: displayQty })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingQty(p.id, displayQty)}
                            className="text-xs text-primary underline decoration-dotted"
                          >
                            {t('tickets.detail.productQty', { qty: displayQty })}
                          </button>
                        )}
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => setDraftRemovedProductIds(ids => [...ids, p.id])}
                            aria-label={t('tickets.detail.removeProduct')}
                            className="text-slate-400 hover:text-red-600 shrink-0"
                          >
                            <IcoClose size={12} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {draftNewProducts.map(dp => (
                    <div key={dp.tempId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-soft/60 dark:bg-slate-700/40">
                      <div className="flex-1 text-[12.5px] text-slate-700 dark:text-slate-200 truncate">
                        <strong>{dp.item.reference}</strong> — {dp.item.name}
                      </div>
                      {editingQtyProductId === dp.tempId ? (
                        <input
                          type="number" min={1} autoFocus value={editingQtyValue}
                          onChange={e => setEditingQtyValue(e.target.value)}
                          onBlur={() => commitEditingQty(dp.tempId)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditingQty(dp.tempId) }}
                          className="w-16 rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1 text-xs"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditingQty(dp.tempId, dp.cantidad)}
                          className="text-xs text-primary underline decoration-dotted"
                        >
                          {t('tickets.detail.productQty', { qty: dp.cantidad })}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDraftNewProducts(list => list.filter(x => x.tempId !== dp.tempId))}
                        aria-label={t('tickets.detail.removeProduct')}
                        className="text-slate-400 hover:text-red-600 shrink-0"
                      >
                        <IcoClose size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setProductPickerOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start"
                  >
                    <IcoSearch size={12} />
                    {t('tickets.detail.addProduct')}
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.adjuntos')}
                </span>
                <div className="flex flex-col gap-1.5">
                  {ticket.adjuntos.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openAttachment(a.id)}
                      disabled={openingAttachmentId === a.id}
                      className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline self-start disabled:opacity-50"
                    >
                      <IcoPaperclip size={12} />
                      {a.nombre_archivo}
                    </button>
                  ))}
                  {draftNewFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
                      <IcoPaperclip size={12} />
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setDraftNewFiles(list => list.filter((_, idx) => idx !== i))}
                        aria-label={t('tickets.detail.removeProduct')}
                        className="text-slate-400 hover:text-red-600 shrink-0"
                      >
                        <IcoClose size={12} />
                      </button>
                    </div>
                  ))}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => handleSelectNewFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start"
                  >
                    <IcoPlus size={12} />
                    {t('tickets.detail.addAttachment')}
                  </button>
                  {attachmentError && <p className="text-red-600 text-[11.5px]">{attachmentError}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label={t('tickets.detail.fields.tipo')} value={t(`tickets.types.${ticket.tipo}`)} />
                <DetailField label={t('tickets.detail.fields.subtipo')} value={ticket.subtipo ? t(`tickets.subtypes.${ticket.subtipo}`) : '—'} />
                {clienteCollapsed ? (
                  <DetailField label={t('tickets.detail.fields.cliente')} value={ticket.cliente_master ?? '—'} />
                ) : (
                  <>
                    <DetailField label={t('tickets.detail.fields.clienteMaster')} value={ticket.cliente_master ?? '—'} />
                    <DetailField label={t('tickets.detail.fields.subcliente')} value={ticket.subcliente ?? '—'} />
                  </>
                )}
                <DetailField label={t('tickets.detail.fields.email')} value={ticket.email ?? '—'} />
                <DetailField label={t('tickets.detail.fields.proyecto')} value={ticket.proyecto ?? '—'} />
                <DetailField
                  label={t('tickets.detail.fields.contacto')}
                  value={[ticket.contacto, ticket.telefono].filter(Boolean).join(' · ') || '—'}
                />
                <DetailField
                  label={t('tickets.detail.fields.tipoInstalacion')}
                  value={ticket.tipo_instalacion ? t(`tickets.detail.tipoInstalacionValues.${ticket.tipo_instalacion}`) : '—'}
                />
              </div>

              <DetailField label={t('tickets.detail.fields.direccion')} value={ticket.direccion ?? '—'} />

              <div className="flex items-end justify-between gap-2">
                <DetailField label={t('tickets.detail.fields.fechaServicio')} value={formatDateTime(ticket.scheduled_at)} />
                {(canSchedule ?? canEdit) && (
                  <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                    {ticket.scheduled_at ? t('tickets.actions.reschedule') : t('tickets.actions.schedule')}
                  </Button>
                )}
              </div>

              <DetailField
                label={t('tickets.detail.fields.horario')}
                value={formatWorkSchedule(ticket.scheduled_at, ticket.scheduled_ends_at)}
              />

              {/* SCRUM-804 — historial de reagendamientos, más reciente primero (vacío si el
                  ticket nunca se reagendó, ver docblock de TicketService::schedule() en backend). */}
              {ticket.reschedule_history.length > 0 && (
                <div className="flex flex-col gap-3">
                  {ticket.reschedule_history.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        {t('tickets.detail.reschedule.title')}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <DetailField label={t('tickets.detail.reschedule.previousDate')} value={formatDateOnly(entry.previous_scheduled_at)} />
                        <DetailField label={t('tickets.detail.reschedule.previousTime')} value={formatTimeOnly(entry.previous_scheduled_at)} />
                        <DetailField label={t('tickets.detail.reschedule.newDate')} value={formatDateOnly(entry.new_scheduled_at)} />
                        <DetailField label={t('tickets.detail.reschedule.newTime')} value={formatTimeOnly(entry.new_scheduled_at)} />
                      </div>
                      <div className="mt-1.5">
                        <DetailField label={t('tickets.detail.reschedule.motivo')} value={entry.motivo} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <DetailField label={t('tickets.detail.fields.requerimientos')} value={formatRequirements(ticket.requerimientos_especiales, t)} />

              {ticket.estado === 'cancelled' && (
                <DetailField label={t('tickets.detail.fields.cancellationReason')} value={ticket.cancellation_reason ?? '—'} />
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.productos')}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  {ticket.productos.length === 0 ? t('tickets.detail.fields.productosNotApplicable') : ticket.productos.length}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {ticket.tipo === 'claim' ? t('tickets.claimSheet.fieldLabel') : t('tickets.detail.fields.informe')}
                </p>
                {ticket.tipo === 'claim' ? (
                  <ClaimSheetIndicator
                    status={claimSheet?.estado}
                    onOpen={() => setClaimSheetOpen(true)}
                  />
                ) : (
                  <InspectionReportIndicator
                    status={ticket.inspection_report_status}
                    onOpen={() => setInspectionReportOpen(true)}
                  />
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.cotizacion')}
                </p>
                <QuoteIndicator
                  status={deriveQuoteDisplayStatus(ticket.quote_status, ticket.inspection_report_status)}
                  onOpen={() => setServiceQuoteOpen(true)}
                />
              </div>

              <DetailField label={t('tickets.detail.fields.observaciones')} value={ticket.observaciones ?? '—'} />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tickets.detail.fields.adjuntos')}
                </p>
                {ticket.adjuntos.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">{t('tickets.detail.fields.adjuntosEmpty')}</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {ticket.adjuntos.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => openAttachment(a.id)}
                        disabled={openingAttachmentId === a.id}
                        className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline self-start disabled:opacity-50"
                      >
                        <IcoPaperclip size={12} />
                        {a.nombre_archivo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {mode === 'edit' && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <Button variant="secondary" onClick={cancelEdit} disabled={saveEditMutation.isPending}>
              {t('tickets.detail.cancel')}
            </Button>
            <Button onClick={saveEdit} loading={saveEditMutation.isPending}>
              {t('tickets.detail.save')}
            </Button>
          </div>
        )}
      </Card>

      {scheduleOpen && ticket && (
        <TicketScheduleModal
          ticketId={ticket.id}
          tipo={ticket.tipo}
          isReschedule={ticket.scheduled_at !== null}
          onClose={() => setScheduleOpen(false)}
          onScheduled={() => {
            setScheduleOpen(false)
            invalidateTicketLists()
          }}
        />
      )}

      {cancelOpen && ticket && (
        <TicketCancelModal
          ticketId={ticket.id}
          numero={ticket.numero}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false)
            invalidateTicketLists()
          }}
        />
      )}

      {inspectionReportOpen && ticket && (
        <InspectionReportModal
          ticketId={ticket.id}
          ticketTipo={ticket.tipo}
          productos={ticket.productos}
          ticketTechnicianId={ticket.internal_technician?.id ?? null}
          ticketNumero={ticket.numero}
          ticketCliente={ticket.cliente_master ?? ticket.subcliente ?? '—'}
          ticketProyecto={ticket.proyecto}
          ticketDireccion={ticket.direccion}
          canEdit={canEditInspectionReport(user?.role, user?.id, ticket.internal_technician?.id)}
          canDownloadBlank={canDownloadBlankInspectionReport(user?.role)}
          onClose={() => setInspectionReportOpen(false)}
          onSaved={() => {
            setInspectionReportOpen(false)
            invalidateTicketLists()
          }}
        />
      )}

      {claimSheetOpen && ticket && (
        <ClaimSheetModal
          ticketId={ticket.id}
          ticketNumero={ticket.numero}
          canEdit={canEditClaimSheet(user?.role, user?.id, ticket.internal_technician?.id)}
          onClose={() => setClaimSheetOpen(false)}
          onSaved={() => {
            setClaimSheetOpen(false)
            invalidateTicketLists()
            void qc.invalidateQueries({ queryKey: ['servicios-claim-sheet', ticketId] })
          }}
        />
      )}

      {serviceQuoteOpen && ticket && (
        <ServiceQuoteModal
          ticketId={ticket.id}
          ticketNumero={ticket.numero}
          onClose={() => setServiceQuoteOpen(false)}
          onChanged={invalidateTicketLists}
        />
      )}

      {productPickerOpen && ticket && (
        <ServiciosSearchPickerModal<ProductOption>
          title={t('tickets.create.searchProductTitle')}
          queryKey={[
            'servicios-lookup-products',
            ticket.productos.map(p => p.catalog_product_id).join(','),
            draftNewProducts.map(dp => dp.item.id).join(','),
            ticket.sales_project_id,
          ]}
          fetchResults={search => serviciosApi.lookup.products(
            search,
            [
              ...ticket.productos.map(p => p.catalog_product_id).filter((id): id is number => id !== null),
              ...draftNewProducts.map(dp => dp.item.id),
            ],
            ticket.sales_project_id,
          )}
          itemKey={item => item.id}
          renderItem={item => `${item.reference} — ${item.name}`}
          emptyMessage={ticket.sales_project_id ? t('tickets.create.searchProductEmptyByProject') : t('tickets.create.searchProductEmpty')}
          onSelect={item => {
            setDraftNewProducts(list => [...list, { tempId: nextTempId.current--, item, cantidad: 1 }])
            setProductPickerOpen(false)
          }}
          onClose={() => setProductPickerOpen(false)}
        />
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">{label}</p>
      <p className="text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}
