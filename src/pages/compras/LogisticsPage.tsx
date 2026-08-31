import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  usePurchaseOrders, usePurchaseOrder, useProviders, useAdvancePurchaseOrder,
  useAdvanceRemainderPurchaseOrder, useConfirmPendingOrderReceipts, useUpdateShippingInfo,
  usePurchaseOrderDocuments, useUploadPurchaseOrderDocument,
} from '@/hooks/useCompras'
import { usePermission } from '@/hooks/usePermission'
import { comprasApi } from '@/api/comprasApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { ReceptionBadge } from '@/components/compras/ReceptionBadge'
import { ShipmentTimeline } from '@/components/compras/ShipmentTimeline'
import ProjectBreakdownModal from '@/components/compras/ProjectBreakdownModal'
import ProviderConfirmationPanel from '@/components/compras/ProviderConfirmationPanel'
import type { PurchaseOrderSummary, DocumentCategory, ApprovedProject } from '@/types/compras'
import { IcoAlertTriangle, IcoCheck, IcoFile, IcoClose } from '@/components/icons'

type Chip = 'all' | 'retrasados'

// SCRUM-208 (rediseño 2026-08-15) — mismo helper que OrderDetailPage.tsx/ReplacementRequestsPage.tsx
// (convención existente del módulo: duplicado por página, no centralizado).
function apiErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

// REQ-155 (SCRUM-218, hallazgo Pre-QA 2026-08-05) — categorías ofrecidas al SUBIR un documento
// nuevo desde esta pantalla, contra el mockup 2B__Compras_Logistica.html (Factura comercial,
// Declaración de nacionalización, Permiso de importación, BL, Otro). "confirmacion_proveedor" se
// quita de acá: esa funcionalidad completa (documento + validación IA + discrepancias) es
// REQ-148/Ver Órdenes, mezclada en esta pantalla por error — hallazgo grande, documentado en Jira
// y escalado a PM/Arquitecto, a propósito NO resuelto en este fix (no se toca el componente
// ProviderConfirmationPanel ni el category del backend, que se queda en
// PurchaseOrderDocument::CATEGORIES por compatibilidad con documentos ya subidos). "bl"
// (conocimiento de embarque) se agrega — faltaba por completo contra el mockup.
const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'factura_comercial', 'declaracion_nacionalizacion', 'permiso_importacion', 'bl', 'otro',
]

export default function LogisticsPage() {
  const { t } = useTranslation(['common', 'compras'])

  const [providerId, setProviderId] = useState<number | ''>('')
  const [search,      setSearch]     = useState('')
  const [query,       setQuery]      = useState('')
  const [createdBy,   setCreatedBy]  = useState<number | ''>('')
  const [projectId,   setProjectId]  = useState<number | ''>('')
  const [projectLabel, setProjectLabel] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [chip,       setChip]       = useState<Chip>('all')
  const [page,       setPage]       = useState(1)
  const [perPage,    setPerPage]    = useState<number | 'all'>(20)

  const { data: providersData } = useProviders({ per_page: 'all' })
  const { data, isFetching } = usePurchaseOrders({
    search: query || undefined,
    provider_id: providerId || undefined,
    created_by: createdBy || undefined,
    sales_project_id: projectId || undefined,
    active_shipments: true,
    chip: chip === 'retrasados' ? 'critical' : undefined,
    page,
    per_page: perPage,
    sort_by: 'estimated_arrival_date',
    sort_dir: 'asc',
  })

  const shipments = data?.data ?? []
  const meta = data?.meta
  const creators = data?.filters.creators ?? []

  // REQ-151 (SCRUM-214, hallazgo Pre-QA 2026-08-05) — usa el buscador propio de envíos activos
  // (shipmentProjects), NO approvedProjects (ese es el picker de REQ-133/Nueva Orden, gateado por
  // cotización aprobada — un proyecto con envío activo puede no tener una ahora mismo).
  // activeShipmentsOnly=true (SCRUM-733): Logística sigue acotando a "envíos en movimiento",
  // igual que el resto de esta pantalla (`active_shipments: true` en usePurchaseOrders arriba) —
  // a diferencia de Ver Órdenes (OrdersPage), que ve proyectos de órdenes en cualquier estado.
  const { data: projectResults } = useQuery({
    queryKey: ['compras/orders/shipment-projects', 'active', projectSearch],
    queryFn:  () => comprasApi.shipmentProjects.search(projectSearch, true),
    enabled:  projectId === '' && projectSearch.length > 0,
  })

  const filtersActive = search !== '' || providerId !== '' || createdBy !== '' || projectId !== '' || chip !== 'all'
  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleClearFilters = () => {
    setSearch(''); setQuery(''); setProviderId(''); setCreatedBy('')
    setProjectId(''); setProjectLabel(''); setProjectSearch(''); setChip('all'); setPage(1)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('compras:logistics.title')}</h1>
        <p className="text-[12px] text-slate-500">
          {t('compras:logistics.subtitle', { count: meta?.total ?? 0 })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:logistics.filters.searchPlaceholder')}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        <select
          value={providerId}
          onChange={e => { setProviderId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:logistics.filters.allProviders')}</option>
          {(providersData?.data ?? []).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={createdBy}
          onChange={e => { setCreatedBy(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:logistics.filters.allCreators')}</option>
          {creators.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {projectId === '' ? (
          <div className="relative">
            <input
              type="text"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              placeholder={t('compras:logistics.filters.projectPlaceholder')}
              className="w-48 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {projectResults && projectResults.data.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100 overflow-hidden">
                {projectResults.data.map((p: ApprovedProject) => (
                  <li key={p.sales_project_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProjectId(p.sales_project_id)
                        setProjectLabel(p.project_name)
                        setProjectSearch('')
                        setPage(1)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {p.project_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            active
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5 inline-flex items-center gap-1.5"
            onClick={() => { setProjectId(''); setProjectLabel(''); setPage(1) }}
            title={t('compras:logistics.filters.clearProject') ?? ''}
          >
            {projectLabel}
            <IcoClose size={12} />
          </Button>
        )}

        {filtersActive && (
          <Button variant="outline" onClick={handleClearFilters}>
            {t('compras:logistics.filters.clear')}
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['all', 'retrasados'] as Chip[]).map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant={c === 'retrasados' ? 'accent' : 'primary'}
            className="!text-xs !px-3 !py-1.5 inline-flex items-center gap-1"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {c === 'retrasados' && <IcoAlertTriangle size={12} />}
            {t(`compras:logistics.chips.${c}`)}
          </Button>
        ))}
      </div>

      {shipments.length === 0 && !isFetching && (
        <Card variant="panel" className="p-10 text-center text-slate-400 text-sm">
          {t('compras:logistics.empty')}
        </Card>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {shipments.map(o => (
          <ShipmentCard key={o.id} order={o} />
        ))}
      </div>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}
    </div>
  )
}

function ShipmentCard({ order }: { order: PurchaseOrderSummary }) {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const advance = useAdvancePurchaseOrder()
  const advanceRemainder = useAdvanceRemainderPurchaseOrder()
  const confirmPendingReceipts = useConfirmPendingOrderReceipts()
  const updateShipping = useUpdateShippingInfo()
  // SCRUM-208 (2026-08-06/12, rebotes de Gerencia Test) — mismo gate puntual que OrderDetailPage:
  // `pending_remainder_status` solo bloquea de verdad el paso final a "Recibido". Antes de este
  // fix, este botón quedaba clickeable en ese caso puntual y el 422 resultante no se mostraba en
  // ningún lado (esta pantalla nunca renderizaba `advance.isError`) — el video de Daniela
  // ("el botón está clickeable pero no genera ninguna acción") es exactamente este bug.
  const blockedFromReceivingByRemainder = order.next_status === 'recibido' && order.pending_remainder_status !== null
  // REQ-154 (SCRUM-217) RN7 — solo Compras ve/usa el botón de avance de etapa; cualquier otro rol
  // ve el timeline completo pero nunca el botón (mismo permiso que ya gatea el endpoint real,
  // `permission:compras.edit` en routes/compras.php sobre PATCH .../advance).
  const canAdvance = usePermission('compras.edit')
  // B3 (Senior Review 2026-07-16): `order` acá es un PurchaseOrderSummary — el listado de
  // Logística NUNCA trae container_number/carrier (solo el detalle los expone, ver
  // PurchaseOrderController::formatDetail en el backend). Sin este fetch, los inputs de abajo
  // arrancaban siempre vacíos aunque ya hubiera un valor guardado, y un blur sin escribir nada
  // mandaba `null` pisando silenciosamente el dato real.
  const { data: detail } = usePurchaseOrder(order.id)
  const { data: documentsData } = usePurchaseOrderDocuments(order.id)
  const uploadDocument = useUploadPurchaseOrderDocument()

  const [containerNumber, setContainerNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('factura_comercial')
  const [showProjectBreakdown, setShowProjectBreakdown] = useState(false)

  // Sincroniza el estado local con el valor real ya guardado en cuanto llega el detalle (o se
  // refresca tras un update exitoso) — mismo patrón que OrderDetailPage.tsx con `draftFromOrder`.
  useEffect(() => {
    if (detail) {
      setContainerNumber(detail.container_number ?? '')
      setCarrier(detail.carrier ?? '')
    }
  }, [detail])

  // Un blur que no cambió nada respecto al último valor guardado NO dispara la mutation — evita
  // pisar un dato real con `null` solo porque el usuario hizo click en el campo y salió sin editar.
  const handleBlurContainer = () => {
    if (containerNumber === (detail?.container_number ?? '')) return
    updateShipping.mutate({ id: order.id, data: { container_number: containerNumber || null } })
  }
  const handleBlurCarrier = () => {
    if (carrier === (detail?.carrier ?? '')) return
    updateShipping.mutate({ id: order.id, data: { carrier: carrier || null } })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadDocument.mutate({ orderId: order.id, category: uploadCategory, file })
    e.target.value = ''
  }

  return (
    <Card variant="panel" className="p-4">
      {/* REQ-153 (SCRUM-216) — título es el N° de orden con ícono de retraso; el proveedor pasa
          a la "ruta" (proveedor → proyecto asignado) como subtítulo. */}
      <div className="mb-2">
        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
          {order.is_critical && <IcoAlertTriangle size={13} className="text-amber-500" />}
          #{order.id}
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
          <span>{order.provider_name}</span>
          <span className="text-slate-300">→</span>
          {order.has_multiple_projects ? (
            <button
              type="button"
              onClick={() => setShowProjectBreakdown(true)}
              className="text-primary hover:underline font-medium"
            >
              {t('compras:orders.table.projectMultiple', { count: order.sales_project_count })}
            </button>
          ) : (
            order.sales_project_summary ?? (
              <span className="text-slate-400">{t('compras:orders.table.projectNone')}</span>
            )
          )}
        </div>
      </div>

      {/* Etiquetas: modalidad, tipo de envío, estado actual, recepción — las 4 al mismo nivel. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
          {t(`compras:newOrder.modality.${order.modality === 'zona_libre' ? 'zonaLibre' : 'directo'}`)}
        </span>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
          {order.shipping_type
            ? t(`compras:newOrder.shipping.type${order.shipping_type.charAt(0).toUpperCase()}${order.shipping_type.slice(1)}`)
            : '—'}
        </span>
        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
          {t(`compras:orders.status.${order.status}`)}
        </span>
        <ReceptionBadge status={order.reception_status} t={t} />
      </div>

      {/* REQ-154 (SCRUM-217) — línea de tiempo del envío, entre las etiquetas y el botón de
          avance (mismo orden que el mockup 2B__Compras_Logistica.html). */}
      <ShipmentTimeline order={order} t={t} />

      {/* SCRUM-208 (rediseño 2026-08-15, docs/architecture/scrum208-recepcion-parcial-rediseno.md)
          — mismo aviso accionable que OrderDetailPage.tsx: antes era puramente informativo acá y
          el botón "Completar etapa" de abajo quedaba clickeable sin gatearlo, disparando un 422
          silencioso (el video de Gerencia Test, "no genera ninguna acción", es exactamente esto —
          esta pantalla nunca renderizaba `advance.isError`). 2 botones: "Ingresar a Inventario"
          (root cause real de su reporte — la parte recibida no aparecía en Inventario porque nada
          la confirmaba hasta que la orden ENTERA llegaba a Recibido) y "Completar etapa del
          remanente" (avanza lo pendiente por sus propias etapas). Ambos ya implementados. */}
      {order.pending_remainder_status !== null && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs mb-3">
          <p className="mb-2">
            {t('compras:orders.detail.pendingRemainder', {
              stage: t(`compras:goodsReceipts.wizard.partial.remainder.${order.pending_remainder_status}`),
            })}
          </p>
          {/* SCRUM-773 (CA3) — "Ingresar a Inventario"/"Completar etapa del remanente" no tenían
              ningún check propio (a diferencia del botón de avance genérico de abajo, que ya
              gatea con `canAdvance`) — mismas rutas reales (PATCH .../confirm-pending-receipts,
              .../advance-remainder), ambas `permission:compras.edit`. */}
          {canAdvance && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="!text-xs !px-3 !py-1.5"
                loading={confirmPendingReceipts.isPending}
                onClick={() => confirmPendingReceipts.mutate(order.id)}
              >
                {t('compras:orders.actions.confirmPendingReceiptsCta')}
              </Button>
              <Button
                variant="outline"
                className="!text-xs !px-3 !py-1.5"
                loading={advanceRemainder.isPending}
                onClick={() => advanceRemainder.mutate(order.id)}
              >
                {order.next_remainder_status
                  ? t('compras:orders.actions.advanceRemainderTo', {
                      status: t(`compras:goodsReceipts.wizard.partial.remainder.${order.next_remainder_status}`),
                    })
                  : t('compras:orders.actions.advanceRemainderCta')}
              </Button>
            </div>
          )}
          {confirmPendingReceipts.isError && (
            <p className="mt-2 text-red-600">
              {apiErrorMessage(confirmPendingReceipts.error, t('compras:orders.errors.confirmPendingReceiptsGeneric'))}
            </p>
          )}
          {advanceRemainder.isError && (
            <p className="mt-2 text-red-600">
              {apiErrorMessage(advanceRemainder.error, t('compras:orders.errors.advanceRemainderGeneric'))}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2 mb-3">
        <label className="block">
          <span className="text-slate-400 uppercase text-[10px]">{t('compras:logistics.shippingInfo.container')}</span>
          <input
            type="text"
            value={containerNumber}
            placeholder={t('compras:logistics.shippingInfo.container')}
            onChange={e => setContainerNumber(e.target.value)}
            onBlur={handleBlurContainer}
            className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
        </label>
        <label className="block">
          <span className="text-slate-400 uppercase text-[10px]">{t('compras:logistics.shippingInfo.carrier')}</span>
          <input
            type="text"
            value={carrier}
            placeholder={t('compras:logistics.shippingInfo.carrier')}
            onChange={e => setCarrier(e.target.value)}
            onBlur={handleBlurCarrier}
            className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded text-xs"
          />
        </label>
      </div>

      {order.blocked_by_primary_approval ? (
        <p className="text-xs text-amber-600 mb-2">{t('compras:logistics.card.markBlocked')}</p>
      ) : order.next_status !== null ? (
        // REQ-154 RN2/RN7 — el botón desaparece por completo (no disabled, no en el DOM) cuando
        // no hay siguiente etapa (rama de arriba) o cuando el usuario no tiene compras.edit.
        canAdvance && (
          <>
            <Button
              variant="outline"
              className="!text-xs !px-3 !py-1.5 w-full inline-flex items-center justify-center gap-1 mb-3"
              disabled={blockedFromReceivingByRemainder}
              loading={advance.isPending}
              onClick={() => advance.mutate(order.id)}
            >
              <IcoCheck size={12} />
              {t('compras:logistics.card.completeStage')} → {t(`compras:orders.status.${order.next_status}`)}
            </Button>
            {/* El caso "next_status=recibido con remanente pendiente" ya tiene su propio aviso
                ámbar accionable arriba (mismo criterio que OrderDetailPage.tsx) — no duplicar con
                este cartel rojo genérico, que sigue cubriendo cualquier OTRO error real de avance. */}
            {advance.isError && !blockedFromReceivingByRemainder && (
              <p className="text-xs text-red-600 mb-3">
                {apiErrorMessage(advance.error, t('compras:orders.errors.advanceGeneric'))}
              </p>
            )}
          </>
        )
      ) : (
        <p className="text-xs text-slate-400 mb-3">{t('compras:logistics.card.noNextStage')}</p>
      )}

      {/* REQ-157 — solo visible desde "En aduana"/"En tránsito local" en adelante (o su remanente
          pendiente, ver PurchaseOrder::showsGoodsReceiptLink() en backend). SCRUM-773 (CA2) —
          este botón ("tarjetas de ingreso de mercancía") no tenía ningún check propio; navega al
          mismo wizard cuyo POST real exige compras.edit (mismo permiso que canAdvance, arriba). */}
      {order.shows_goods_receipt_link && canAdvance && (
        <Button
          variant="outline"
          className="!text-xs !px-3 !py-1.5 w-full mb-3"
          onClick={() => navigate('/compras/ingresos/nuevo', { state: { orderId: order.id } })}
        >
          {t('compras:logistics.card.goodsReceiptLink')}
        </Button>
      )}

      {/* REQ-153 — al final de la tarjeta: llegada estimada (solo lectura), llegada real (REQ-153
          RN3/RN4, SOLO lectura desde 2026-08-05 — se auto-llena al completar "Recibido" en
          advance(), nunca editable a mano) y responsable asignado. */}
      <div className="pt-3 border-t border-slate-100 mb-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-2">
          <div>
            <span className="text-slate-400 uppercase text-[10px]">{t('compras:logistics.card.estimatedArrival')}</span>
            <p>{order.estimated_arrival_date ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[10px]">{t('compras:logistics.card.responsible')}</span>
            <p>{order.created_by_name ?? '—'}</p>
          </div>
        </div>
        <div>
          <span className="text-slate-400 uppercase text-[10px]">{t('compras:logistics.shippingInfo.actualArrival')}</span>
          <p className="text-xs text-slate-600">
            {order.actual_arrival_date ?? t('compras:logistics.card.pending')}
          </p>
        </div>
      </div>

      {showProjectBreakdown && (
        <ProjectBreakdownModal orderId={order.id} onClose={() => setShowProjectBreakdown(false)} />
      )}

      <div className="pt-3 border-t border-slate-100">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">
          {t('compras:logistics.documents.title')}
        </h3>
        <ul className="space-y-1 mb-2">
          {(documentsData?.data ?? []).map(doc => (
            <li key={doc.id}>
              <div className="flex items-center justify-between gap-1.5">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <IcoFile size={12} />
                  {t(`compras:logistics.documents.category.${doc.category}`)}
                </a>
              </div>
              {/* SCRUM-773 — el panel de validación IA dispara su propia acción de escritura
                  (validate.mutate → PATCH .../documents/{id}/validate, compras.edit); ver el
                  documento en sí (el <a> de arriba) sigue siendo "consultar información". */}
              {doc.category === 'confirmacion_proveedor' && canAdvance && (
                <ProviderConfirmationPanel orderId={order.id} doc={doc} />
              )}
            </li>
          ))}
          {documentsData && documentsData.data.length === 0 && (
            <li className="text-xs text-slate-400">{t('compras:logistics.documents.empty')}</li>
          )}
        </ul>
        {/* SCRUM-773 — subir/reemplazar un documento es una acción de escritura, gatea con
            canAdvance (mismo compras.edit que el resto de las acciones de esta tarjeta). */}
        {canAdvance && (
          <div className="flex gap-1.5">
            <select
              value={uploadCategory}
              onChange={e => setUploadCategory(e.target.value as DocumentCategory)}
              className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs bg-white"
            >
              {DOCUMENT_CATEGORIES.map(c => {
                // REQ-155 (SCRUM-218, hallazgo Pre-QA 2026-08-05) — marca visual: un documento ya
                // subido para esta categoría no debe verse idéntico a uno sin subir en el desplegable.
                const alreadyUploaded = (documentsData?.data ?? []).some(doc => doc.category === c)
                const label = t(`compras:logistics.documents.category.${c}`)
                return (
                  <option key={c} value={c}>
                    {alreadyUploaded ? t('compras:logistics.documents.alreadyUploaded', { category: label }) : label}
                  </option>
                )
              })}
            </select>
            <label className="px-2 py-1 border border-slate-200 rounded text-xs cursor-pointer hover:bg-slate-50">
              {t('compras:logistics.documents.upload')}
              <input type="file" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}
        {uploadDocument.isError && (
          <p className="text-xs text-red-600 mt-1">{t('compras:logistics.errors.documentGeneric')}</p>
        )}
      </div>
    </Card>
  )
}
