import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type {
  ProductOption, ExternalTechnician, ServiceQuoteItem, ServiceQuoteItemType, ServiceQuoteItemPayload,
} from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPencil } from '@/components/icons'
import ServiciosSearchPickerModal from './ServiciosSearchPickerModal'
import ServiceQuotePdfViewerModal from './ServiceQuotePdfViewerModal'
import { useToastStore } from '@/store/toastStore'

interface Props {
  ticketId:     number
  ticketNumero: string
  onClose:      () => void
  onChanged:    () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

/** SCRUM-296 — mismo redondeo que ServiceQuote::computeTotals() en el backend (round a 2 decimales). */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

const ITEM_TYPES: ServiceQuoteItemType[] = ['product', 'labor', 'subcontracted']

const ESTADO_BADGE: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  sent:     'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

interface ItemDraft {
  id:                       number | null // null = alta nueva
  tipo:                     ServiceQuoteItemType
  catalog_product_id:       number | null
  productLabel:             string | null
  is_custom:                boolean
  external_technician_id:   number | null
  technicianLabel:          string | null
  description:              string
  quantity:                 string
  unit_price:               string
  margin_percent:           string
  // SCRUM-781 (punto 3, REQ-232) — costo/día editable por ítem subcontratado, distinto del costo
  // maestro del técnico. Mismo gate que margin_percent (view_cost_breakdown), ver ItemForm.
  cost_reference:           string
}

function emptyDraft(tipo: ServiceQuoteItemType): ItemDraft {
  return {
    id: null, tipo, catalog_product_id: null, productLabel: null, is_custom: false,
    external_technician_id: null, technicianLabel: null, description: '', quantity: '1',
    unit_price: '', margin_percent: '', cost_reference: '',
  }
}

// Fase 4 — Servicios, Batch 11 (REQ-229→234, SCRUM-292→297). Cotización de Servicio — formulario,
// ítems Producto/Mano de obra/Subcontratado, totales (ITBMS consistente con el futuro documento,
// Batch 12), ciclo de vida (Borrador -> Enviada -> Aprobada/Rechazada).
//
// A diferencia de InspectionReportModal/ClaimSheetModal, los permisos (`can_edit`/`can_send`/
// `can_decide`/`can_view_cost_breakdown`) vienen YA RESUELTOS por el backend dentro del propio
// detalle (`ServiceQuoteService::assertCanEdit()` + gates de estado) — el modal no reimplementa
// esa lógica ni recibe un prop `canEdit` de afuera, la lectura (GET) siempre está permitida para
// cualquier rol del módulo.
export default function ServiceQuoteModal({ ticketId, ticketNumero, onClose, onChanged }: Props) {
  const { t }   = useTranslation('servicios')
  const qc      = useQueryClient()
  const toast   = useToastStore(s => s.show)

  const [discountPercent, setDiscountPercent] = useState('0')
  const [observations, setObservations]       = useState('')
  const [hydratedQuoteId, setHydratedQuoteId] = useState<number | null>(null)
  const [addingType, setAddingType]           = useState<ServiceQuoteItemType | null>(null)
  const [itemDraft, setItemDraft]             = useState<ItemDraft | null>(null)
  const [productPickerOpen, setProductPickerOpen]         = useState(false)
  const [technicianOptions, setTechnicianOptions]         = useState<ExternalTechnician[]>([])
  const [downloadingQuoteId, setDownloadingQuoteId]       = useState<number | null>(null)
  const [pdfViewer, setPdfViewer]                         = useState<{ url: string; numero: string } | null>(null)

  const queryKey        = ['servicios-service-quote', ticketId]
  const historyQueryKey = ['servicios-service-quote-history', ticketId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => serviciosApi.serviceQuotes.get(ticketId),
  })

  const quote = data?.quote ?? null

  // REQ-236 — historial completo del ticket, solo tiene sentido consultarlo una vez que existe
  // al menos una cotización (quote !== null); con una sola versión la sección queda oculta más
  // abajo (length > 1), no hace falta gatear el fetch en sí por eso.
  const { data: history = [] } = useQuery({
    queryKey: historyQueryKey,
    queryFn:  () => serviciosApi.serviceQuotes.history(ticketId),
    enabled:  quote !== null,
  })

  // Hidrata descuento/observaciones desde la cotización SOLO al cambiar de cotización (nunca
  // pisa lo que el usuario está tipeando en un refetch por invalidación propia) — mismo patrón
  // de "hydrated" ya usado en ClaimSheetModal/InspectionReportModal.
  useEffect(() => {
    if (!quote || quote.id === hydratedQuoteId) return
    setHydratedQuoteId(quote.id)
    setDiscountPercent(String(quote.discount_percent))
    setObservations(quote.observations ?? '')
  }, [quote, hydratedQuoteId])

  useEffect(() => {
    if (addingType !== 'subcontracted') return
    serviciosApi.externalTechnicians.list({ estado: 'active', per_page: 100 })
      .then(res => setTechnicianOptions(res.data))
      .catch(() => setTechnicianOptions([]))
  }, [addingType])

  function invalidate() {
    void qc.invalidateQueries({ queryKey })
    // Generar una nueva cotización (RN: solo posible con la anterior Rechazada) agrega una fila al
    // historial — sin esto, el historial quedaba desactualizado hasta cerrar/reabrir el modal.
    void qc.invalidateQueries({ queryKey: historyQueryKey })
    onChanged()
  }

  function errorMessage(err: unknown, fallback: string): string {
    return isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message ?? fallback : fallback
  }

  // REQ-235/236 — documento formal "Ver/Imprimir" de una versión puntual. Mismo endpoint para el
  // botón de cabecera (la cotización vigente) y para cada fila del historial (ver docblock de
  // ServiceQuoteController::document() en el backend). Abre en `ServiceQuotePdfViewerModal`
  // (vista en pantalla, ver docblock de ese componente) — no descarga directa.
  async function downloadDocument(quoteId: number, numero: string) {
    setDownloadingQuoteId(quoteId)
    try {
      const blob = await serviciosApi.serviceQuotes.document(ticketId, quoteId)
      setPdfViewer({ url: URL.createObjectURL(blob), numero })
    } catch {
      toast(t('tickets.quoteModal.pdfError'), 'error')
    } finally {
      setDownloadingQuoteId(null)
    }
  }

  const generateMutation = useMutation({
    mutationFn: () => serviciosApi.serviceQuotes.generate(ticketId),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.generateError')), 'error'),
  })

  const saveMutation = useMutation({
    mutationFn: () => serviciosApi.serviceQuotes.save(ticketId, {
      discount_percent: Number(discountPercent) || 0,
      observations:     observations.trim() || null,
    }),
    onSuccess: () => { invalidate(); toast(t('tickets.quoteModal.saved'), 'success') },
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.saveError')), 'error'),
  })

  const sendMutation = useMutation({
    mutationFn: () => serviciosApi.serviceQuotes.send(ticketId),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.sendError')), 'error'),
  })

  const decideMutation = useMutation({
    mutationFn: (estado: 'approved' | 'rejected') => serviciosApi.serviceQuotes.decide(ticketId, estado),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.decideError')), 'error'),
  })

  const itemMutation = useMutation({
    mutationFn: (draft: ItemDraft) => {
      const payload: ServiceQuoteItemPayload = {
        tipo:                    draft.tipo,
        catalog_product_id:      draft.catalog_product_id,
        is_custom:               draft.is_custom,
        external_technician_id:  draft.external_technician_id,
        description:             draft.description.trim() || null,
        quantity:                Number(draft.quantity) || 0,
        unit_price:              draft.unit_price === '' ? null : Number(draft.unit_price),
        margin_percent:          draft.margin_percent === '' ? null : Number(draft.margin_percent),
        cost_reference:          draft.cost_reference === '' ? null : Number(draft.cost_reference),
      }
      return draft.id === null
        ? serviciosApi.serviceQuotes.items.store(ticketId, payload)
        : serviciosApi.serviceQuotes.items.update(ticketId, draft.id, payload)
    },
    onSuccess: () => {
      invalidate()
      setAddingType(null)
      setItemDraft(null)
    },
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.itemError')), 'error'),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => serviciosApi.serviceQuotes.items.destroy(ticketId, itemId),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorMessage(err, t('tickets.quoteModal.itemDeleteError')), 'error'),
  })

  function startAdd(tipo: ServiceQuoteItemType) {
    setAddingType(tipo)
    setItemDraft(emptyDraft(tipo))
  }

  function startEdit(item: ServiceQuoteItem) {
    setAddingType(item.tipo)
    setItemDraft({
      id: item.id, tipo: item.tipo, catalog_product_id: item.catalog_product_id,
      productLabel: item.description, is_custom: item.is_custom,
      external_technician_id: item.external_technician_id, technicianLabel: item.description,
      description: item.description, quantity: String(item.quantity), unit_price: String(item.unit_price),
      margin_percent: item.margin_percent !== null ? String(item.margin_percent) : '',
      cost_reference: item.cost_reference != null ? String(item.cost_reference) : '',
    })
  }

  function cancelItemForm() {
    setAddingType(null)
    setItemDraft(null)
  }

  function pickProduct(product: ProductOption) {
    setItemDraft(d => d && {
      ...d,
      catalog_product_id: product.id,
      is_custom:           false,
      productLabel:         `${product.reference} — ${product.description}`,
      description:          product.description,
      unit_price:            String(product.price_full),
    })
    setProductPickerOpen(false)
  }

  const canEditNow  = quote !== null && quote.can_edit
  const isLocked    = quote === null || !canEditNow

  const canSaveItem = itemDraft !== null && (
    (itemDraft.tipo === 'product' && (itemDraft.is_custom ? itemDraft.description.trim() !== '' : itemDraft.catalog_product_id !== null) && Number(itemDraft.quantity) > 0)
    || (itemDraft.tipo === 'labor' && itemDraft.description.trim() !== '' && Number(itemDraft.quantity) > 0)
    || (itemDraft.tipo === 'subcontracted' && itemDraft.external_technician_id !== null && Number(itemDraft.quantity) > 0)
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tickets.quoteModal.title')}</h2>
            <p className="text-[11.5px] text-slate-500">
              {ticketNumero}
              {/* SCRUM-292 (rebote QA 2026-08-13) — numero es null hasta el primer guardado real
                  (ver ServiceQuoteData.numero); "(se asigna al guardar)" en vez de mostrar un
                  numero que todavia no existe. */}
              {quote && <> · {quote.numero ?? t('tickets.quoteModal.numeroPending')} · <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_BADGE[quote.estado]}`}>{t(`tickets.quote.${quote.estado}`)}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* REQ-235 — disponible para cualquier estado (draft/sent/approved/rejected), mismo
                criterio de "solo lectura" que Hoja de Reclamo/Informe de Inspección. SCRUM-292 —
                oculto mientras no tenga numero (nada real guardado todavia) — el backend
                devuelve 404 para ese caso, ver docblock de ServiceQuoteController::document(). */}
            {quote !== null && quote.numero !== null && (
              <Button
                variant="secondary"
                onClick={() => void downloadDocument(quote.id, quote.numero!)}
                loading={downloadingQuoteId === quote.id}
              >
                {t('tickets.quoteModal.print')}
              </Button>
            )}
            <Button variant="icon" onClick={onClose}><IcoClose /></Button>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-8 text-sm text-slate-400">{t('common:labels.loading')}</div>
        ) : (
          <>
            <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4 text-sm">
              {data.notes.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {data.notes.map((note, idx) => (
                    <p key={idx} className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
                      {note}
                    </p>
                  ))}
                </div>
              )}

              {quote === null ? (
                <div className="flex flex-col items-start gap-3 py-4">
                  <p className="text-slate-500">
                    {data.can_generate ? t('tickets.quoteModal.readyToGenerate') : t('tickets.quoteModal.blockedByInspection')}
                  </p>
                  {data.can_generate && (
                    <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
                      {t('tickets.quoteModal.generate')}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    <ReadOnlyField label={t('tickets.quoteModal.cliente')}>{quote.cliente ?? '—'}</ReadOnlyField>
                    <ReadOnlyField label={t('tickets.quoteModal.contacto')}>
                      {[quote.contacto, quote.telefono].filter(Boolean).join(' · ') || '—'}
                    </ReadOnlyField>
                    <ReadOnlyField label={t('tickets.quoteModal.direccion')}>{quote.direccion ?? '—'}</ReadOnlyField>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <SectionLabel>{t('tickets.quoteModal.itemsSection')}</SectionLabel>
                      {canEditNow && addingType === null && (
                        <div className="flex gap-1.5">
                          {ITEM_TYPES.map(tp => (
                            <button key={tp} type="button" onClick={() => startAdd(tp)}
                              className="text-[11.5px] font-medium text-primary hover:underline">
                              + {t(`tickets.quoteModal.itemTypes.${tp}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {quote.items.length === 0 && addingType === null && (
                        <p className="text-slate-400 text-[12.5px]">{t('tickets.quoteModal.noItems')}</p>
                      )}
                      {quote.items.map(item => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          canEdit={canEditNow}
                          canViewCosts={data.can_view_cost_breakdown}
                          onEdit={() => startEdit(item)}
                          onDelete={() => deleteItemMutation.mutate(item.id)}
                          deleting={deleteItemMutation.isPending && deleteItemMutation.variables === item.id}
                        />
                      ))}

                      {itemDraft && (
                        <ItemForm
                          draft={itemDraft}
                          onChange={updater => setItemDraft(d => d && updater(d))}
                          onOpenProductPicker={() => setProductPickerOpen(true)}
                          technicianOptions={technicianOptions}
                          minMarginPercent={data.min_margin_percent}
                          canViewCosts={data.can_view_cost_breakdown}
                        />
                      )}

                      {itemDraft && (
                        <div className="flex gap-2 justify-end">
                          <Button variant="secondary" onClick={cancelItemForm} disabled={itemMutation.isPending}>
                            {t('tickets.detail.cancel')}
                          </Button>
                          <Button
                            onClick={() => itemMutation.mutate(itemDraft)}
                            disabled={!canSaveItem}
                            loading={itemMutation.isPending}
                          >
                            {itemDraft.id === null ? t('tickets.quoteModal.addItem') : t('tickets.quoteModal.saveItem')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <label className="text-sm block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('tickets.quoteModal.observations')}
                    </span>
                    <textarea rows={2} value={observations} disabled={isLocked} onChange={e => setObservations(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
                  </label>

                  {/* SCRUM-296 (rebote QA 2026-08-13) — ITBMS/Total leían quote.itbms/quote.total
                      (el ultimo valor PERSISTIDO por el servidor), asi que cambiar el % de
                      descuento no los recalculaba hasta el proximo Guardar — el usuario guardaba
                      viendo un total distinto al que el backend iba a persistir. Se recalculan en
                      vivo acá con la MISMA fórmula que ServiceQuote::computeTotals() en el
                      backend (base = subtotal*(1-desc/100), itbms = base*itbms%, total = base+itbms) —
                      agregar/quitar ítems ya recalculaba en vivo porque quote.subtotal SÍ se
                      actualiza en cada mutación de ítems; el campo de descuento es el único que
                      vive en state local sin tocar el servidor hasta Guardar. */}
                  {(() => {
                    const discountValue = Number(discountPercent) || 0
                    const base  = round2(quote.subtotal * (1 - discountValue / 100))
                    const itbms = round2(base * data.itbms_percent / 100)
                    const total = round2(base + itbms)
                    return (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-700/30 px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-slate-500">{t('tickets.quoteModal.subtotal')}</span>
                          <span className="font-medium">${quote.subtotal.toLocaleString()}</span>
                        </div>
                        <label className="flex items-center justify-between text-[12.5px]">
                          <span className="text-slate-500">{t('tickets.quoteModal.discountPercent')}</span>
                          <input
                            type="number" min={0} max={100} step="0.01"
                            value={discountPercent} disabled={isLocked}
                            onChange={e => setDiscountPercent(e.target.value)}
                            className="w-20 rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1 text-right text-sm disabled:opacity-60"
                          />
                        </label>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-slate-500">{t('tickets.quoteModal.itbms', { percent: data.itbms_percent })}</span>
                          <span className="font-medium">${itbms.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-slate-200 dark:border-slate-600 pt-2">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{t('tickets.quoteModal.total')}</span>
                          <span className="font-bold text-primary">${total.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* REQ-236 — solo visible con más de 1 versión; con 0 o 1, la única cotización ya
                      está arriba, repetirla acá no aporta nada. */}
                  {history.length > 1 && (
                    <div>
                      <SectionLabel>{t('tickets.quoteModal.historySection')}</SectionLabel>
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        {history.map(entry => {
                          const isCurrent = entry.id === quote.id
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => void downloadDocument(entry.id, entry.numero)}
                              disabled={downloadingQuoteId === entry.id}
                              className={[
                                'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[12.5px] text-left transition-colors disabled:opacity-60',
                                isCurrent
                                  ? 'bg-primary/10 dark:bg-primary/15 border border-primary/30'
                                  : 'bg-slate-50 dark:bg-slate-700/40 border border-transparent hover:bg-slate-100 dark:hover:bg-slate-700/60',
                              ].join(' ')}
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{entry.numero}</span>
                                <span className="text-slate-400">{formatDate(entry.created_at)}</span>
                                {isCurrent && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                    {t('tickets.quoteModal.historyCurrent')}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_BADGE[entry.estado]}`}>
                                  {t(`tickets.quote.${entry.estado}`)}
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">${entry.total.toLocaleString()}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <Button variant="secondary" onClick={onClose}>{t('tickets.detail.cancel')}</Button>

              {quote !== null && data.can_generate && quote.estado === 'rejected' && (
                <Button variant="secondary" onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
                  {t('tickets.quoteModal.generateNew')}
                </Button>
              )}

              {canEditNow && (
                <Button variant="secondary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                  {t('tickets.quoteModal.save')}
                </Button>
              )}

              {quote !== null && quote.can_send && (
                <Button onClick={() => sendMutation.mutate()} loading={sendMutation.isPending} disabled={quote.items.length === 0}>
                  {t('tickets.quoteModal.send')}
                </Button>
              )}

              {quote !== null && quote.can_decide && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => decideMutation.mutate('rejected')}
                    loading={decideMutation.isPending && decideMutation.variables === 'rejected'}
                  >
                    {t('tickets.quoteModal.reject')}
                  </Button>
                  <Button
                    onClick={() => decideMutation.mutate('approved')}
                    loading={decideMutation.isPending && decideMutation.variables === 'approved'}
                  >
                    {t('tickets.quoteModal.approve')}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {productPickerOpen && (
        <ServiciosSearchPickerModal<ProductOption>
          title={t('tickets.quoteModal.pickProduct')}
          queryKey={['servicios-lookup-products-quote']}
          fetchResults={search => serviciosApi.lookup.products(search)}
          itemKey={p => p.id}
          renderItem={p => `${p.reference} — ${p.description} ($${p.price_full.toLocaleString()})`}
          emptyMessage={t('tickets.create.searchProductEmpty')}
          onSelect={pickProduct}
          onClose={() => setProductPickerOpen(false)}
        />
      )}

      {pdfViewer && (
        <ServiceQuotePdfViewerModal
          blobUrl={pdfViewer.url}
          numero={pdfViewer.numero}
          onClose={() => setPdfViewer(null)}
        />
      )}
    </div>
  )
}

function ItemRow({ item, canEdit, canViewCosts, onEdit, onDelete, deleting }: {
  item:          ServiceQuoteItem
  canEdit:       boolean
  canViewCosts:  boolean
  onEdit:        () => void
  onDelete:      () => void
  deleting:      boolean
}) {
  const { t } = useTranslation('servicios')

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-[12.5px]">
      <div className="flex-1">
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 mr-1.5">
          {t(`tickets.quoteModal.itemTypes.${item.tipo}`)}
        </span>
        <span className="text-slate-700 dark:text-slate-200">{item.description}</span>
        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
          {item.quantity} × ${item.unit_price.toLocaleString()} = <span className="font-semibold">${item.subtotal.toLocaleString()}</span>
          {/* Defensa en profundidad, simétrica al gate de cost_reference debajo: el backend ya
              nunca manda margin_percent real sin `servicios.quotes.view_cost_breakdown` (ver
              ServiceQuoteController::formatItem()) — unit_price + margin_percent alcanzan para
              recalcular cost_reference (tarifa_dia), así que el mismo gate debe cubrir ambos. */}
          {canViewCosts && item.tipo === 'subcontracted' && item.margin_percent !== null && (
            <> · {t('tickets.quoteModal.margin')}: {item.margin_percent}%</>
          )}
          {canViewCosts && item.cost_reference != null && (
            <> · {t('tickets.quoteModal.costReference')}: ${item.cost_reference.toLocaleString()}</>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className="text-slate-400 hover:text-primary p-1">
            <IcoPencil size={13} />
          </button>
          <button type="button" onClick={onDelete} disabled={deleting} className="text-slate-400 hover:text-red-600 p-1 disabled:opacity-50">
            <IcoClose size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function ItemForm({ draft, onChange, onOpenProductPicker, technicianOptions, minMarginPercent, canViewCosts }: {
  draft:                ItemDraft
  onChange:             (updater: (d: ItemDraft) => ItemDraft) => void
  onOpenProductPicker:  () => void
  technicianOptions:    ExternalTechnician[]
  minMarginPercent:     number
  canViewCosts:         boolean
}) {
  const { t } = useTranslation('servicios')

  function set<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    onChange(d => ({ ...d, [key]: value }))
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 dark:bg-primary/10 px-3 py-3 flex flex-col gap-2">
      {draft.tipo === 'product' && (
        <>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={draft.is_custom} onChange={e => set('is_custom', e.target.checked)} />
            {t('tickets.quoteModal.customReference')}
          </label>

          {draft.is_custom ? (
            <input
              value={draft.description} onChange={e => set('description', e.target.value)}
              placeholder={t('tickets.quoteModal.description')}
              className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
          ) : (
            <button type="button" onClick={onOpenProductPicker}
              className="text-left w-full rounded-md border border-dashed border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
              {draft.productLabel ?? t('tickets.quoteModal.pickProduct')}
            </button>
          )}

          <div className="flex gap-2">
            <NumberField label={t('tickets.quoteModal.quantity')} value={draft.quantity} onChange={v => set('quantity', v)} />
            <NumberField label={t('tickets.quoteModal.unitPrice')} value={draft.unit_price} onChange={v => set('unit_price', v)} />
          </div>
        </>
      )}

      {draft.tipo === 'labor' && (
        <>
          <input
            value={draft.description} onChange={e => set('description', e.target.value)}
            placeholder={t('tickets.quoteModal.description')}
            className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <NumberField label={t('tickets.quoteModal.quantity')} value={draft.quantity} onChange={v => set('quantity', v)} />
            <NumberField label={t('tickets.quoteModal.unitPrice')} value={draft.unit_price} onChange={v => set('unit_price', v)} />
          </div>
        </>
      )}

      {draft.tipo === 'subcontracted' && (
        <>
          <select
            value={draft.external_technician_id ?? ''}
            onChange={e => {
              const id = e.target.value === '' ? null : Number(e.target.value)
              const tech = technicianOptions.find(x => x.id === id)
              onChange(d => ({
                ...d,
                external_technician_id: id,
                technicianLabel: tech ? `${tech.nombre} (${tech.empresa})` : null,
                // SCRUM-781 (punto 3) — "el costo mostrado inicialmente debe corresponder al
                // costo registrado para ese técnico" — solo prefill, sigue editable después.
                cost_reference: tech?.tarifa_dia != null ? String(tech.tarifa_dia) : d.cost_reference,
              }))
            }}
            className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
          >
            <option value="">{t('tickets.quoteModal.pickTechnician')}</option>
            {technicianOptions.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.nombre} ({tech.empresa})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <NumberField label={t('tickets.quoteModal.diasCotizados')} value={draft.quantity} onChange={v => set('quantity', v)} />
            {/* SCRUM-781 (punto 3) — mismo gate que margin_percent/cost_reference en ItemRow y en
                el backend (servicios.quotes.view_cost_breakdown): quien no puede ver costos nunca
                recibió el valor real para prellenar, así que tampoco tiene sentido mostrarle el
                campo vacío como si pudiera setearlo desde cero. */}
            {canViewCosts && (
              <NumberField
                label={t('tickets.quoteModal.costReference')}
                value={draft.cost_reference}
                onChange={v => set('cost_reference', v)}
              />
            )}
            <NumberField
              label={t('tickets.quoteModal.marginPercentPlaceholder', { percent: minMarginPercent })}
              value={draft.margin_percent}
              onChange={v => set('margin_percent', v)}
            />
          </div>
        </>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex-1 text-[11px] text-slate-500">
      <span className="block mb-0.5">{label}</span>
      <input
        type="number" min={0} step="0.01" value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1.5 text-sm"
      />
    </label>
  )
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      <p className="text-slate-800 dark:text-slate-100">{children}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</p>
}
