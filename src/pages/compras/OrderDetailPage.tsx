import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePurchaseOrder, useAdvancePurchaseOrder, useAdvanceRemainderPurchaseOrder,
  useConfirmPendingOrderReceipts, useApprovePurchaseOrder,
  useUpdatePurchaseOrder, useOpenPurchaseOrderPdf, useSendPurchaseOrderEmail,
  useLiquidateOrder, useLiquidationAgencies, useCreateLiquidationAgency,
} from '@/hooks/useCompras'
import { usePermission } from '@/hooks/usePermission'
import OrderLinesEditor, { buildLinesPayload, type OrderDraft } from '@/components/compras/OrderLinesEditor'
import PurchaseOrderPaymentsModal from '@/components/compras/PurchaseOrderPaymentsModal'
import ProviderConfirmationCard from '@/components/compras/ProviderConfirmationCard'
import ProjectBreakdownModal from '@/components/compras/ProjectBreakdownModal'
import { ReceptionBadge } from '@/components/compras/ReceptionBadge'
import { OriginBadge } from '@/components/compras/OriginBadge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { orderStatusLabel } from '@/utils/orderStatusLabel'
import { IcoDollarSign, IcoMoreVertical } from '@/components/icons'
import type { PurchaseOrderDetail, LiquidationAgency } from '@/types/compras'

/** SCRUM-736 — "resumen de información" del mockup aprobado, mismo par label/valor repetido 9 veces. */
function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-500 uppercase">{label}</span>
      <p className="text-slate-800 font-medium">{children}</p>
    </div>
  )
}

/**
 * Pre-QA en vivo contra dev.atlanticerp.ai (2026-07-17), hallazgo nuevo propio del fix de SCRUM-206: el
 * 403 de "Solo Mark puede aprobar esta orden" se disparaba correctamente pero la UI no mostraba
 * nada — el botón "Aprobar orden" simplemente no hacía nada visible, sin este gate previo nunca
 * fallaba para un usuario normal con compras.approve, así que este camino de error no existía.
 */
function apiErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

function draftFromOrder(order: PurchaseOrderDetail): OrderDraft {
  return {
    lines: order.lines.map(l => ({
      key: `line-${l.id}`,
      catalogProductId: l.catalog_product_id,
      newProduct: null,
      reference: l.reference ?? '',
      factoryReference: l.factory_reference,
      description: l.description ?? '',
      unitCost: l.unit_cost,
      quantity: l.quantity,
      // SCRUM-194 (2026-07-30) — líneas viejas solo tienen `additional_cost_percent`; se leen como
      // 'porcentaje' para no perder el dato al editar una orden creada antes de este fix.
      additionalCostAmount: l.additional_cost_amount ?? l.additional_cost_percent,
      additionalCostType: l.additional_cost_type
        ?? (l.additional_cost_percent !== null ? 'porcentaje' : null),
      salesProjectId: l.sales_project_id,
      salesProjectLabel: l.sales_project_name,
    })),
    // SCRUM-197 (2026-07-30) — órdenes creadas antes de este fix pueden tener shipping_type/
    // who_pays_shipping en null (eran opcionales); el form ya no admite un estado "sin
    // especificar", así que se completa con el mismo default de emptyOrderDraft() al editar.
    shippingType: order.shipping_type ?? 'terrestre',
    whoPaysShipping: order.who_pays_shipping ?? 'cliente',
    shippingCost: order.shipping_cost !== null ? String(order.shipping_cost) : '',
    modality: order.modality,
    estimatedArrivalDate: order.estimated_arrival_date ?? '',
  }
}

export default function OrderDetailPage() {
  const { t } = useTranslation(['common', 'compras'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = id ? Number(id) : null

  const { data: order, isLoading } = usePurchaseOrder(orderId)
  // Hallazgo de Senior Review (sprint2, 2026-07-16, S5): el botón "Aprobar orden" se mostraba a
  // cualquiera con acceso de lectura — el backend ya bloqueaba con 403 (compras.approve), pero la
  // UI dejaba hacer click en un botón que siempre iba a fallar para ese usuario.
  const canApprove = usePermission('compras.approve')
  // SCRUM-771 — Líder de Operaciones tiene compras.limited.view (ve esta pantalla, corrección
  // 2026-08-18: ya no compras.read general) sin compras.write/.edit (solo lectura): ningún botón
  // de acción de la orden debe quedar disponible para ese perfil, aunque el estado de la orden
  // habilite la acción.
  const canManageOrder = usePermission('compras.edit')
  const advance = useAdvancePurchaseOrder()
  const advanceRemainder = useAdvanceRemainderPurchaseOrder()
  const confirmPendingReceipts = useConfirmPendingOrderReceipts()
  const approve = useApprovePurchaseOrder()
  const update = useUpdatePurchaseOrder()
  const openPdf = useOpenPurchaseOrderPdf()
  const sendEmail = useSendPurchaseOrderEmail()
  const liquidate = useLiquidateOrder()
  const createAgency = useCreateLiquidationAgency()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<OrderDraft | null>(null)
  const [includeCostInDocs, setIncludeCostInDocs] = useState(true)
  const [showAgencyPicker, setShowAgencyPicker] = useState(false)
  const [agencySearch, setAgencySearch] = useState('')
  const [showNewAgencyForm, setShowNewAgencyForm] = useState(false)
  const [newAgencyName, setNewAgencyName] = useState('')
  // SCRUM-736 — Pagos a Proveedores pasa a modal; checkbox/enviar por correo pasan a un menú
  // de "Más acciones"; el desglose por proyecto multi-proyecto se abre desde el resumen.
  const [showPaymentsModal, setShowPaymentsModal] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showProjectBreakdown, setShowProjectBreakdown] = useState(false)

  const { data: agencyResults } = useLiquidationAgencies(agencySearch, showAgencyPicker)

  useEffect(() => {
    if (order) setDraft(draftFromOrder(order))
  }, [order])

  if (isLoading || !order || !draft) {
    return <div className="text-slate-400 text-sm">…</div>
  }

  const canEdit = order.status === 'por_aprobar' && canManageOrder
  // SCRUM-208 (2026-08-07, segundo hallazgo de Gerencia Test) — el único paso que
  // `pending_remainder_status` bloquea de verdad es el AVANCE FINAL a "Recibido" (ver
  // `PurchaseOrderController::advance()`); cualquier otra etapa intermedia nunca estuvo
  // bloqueada por esto. Deshabilitar el botón solo en ese caso puntual, en vez de dejar que
  // el clic dispare un 422 ya sabido.
  const blockedFromReceivingByRemainder = order.next_status === 'recibido' && order.pending_remainder_status !== null

  const handleAdvance = () => { advance.mutate(order.id) }
  const handleAdvanceRemainder = () => { advanceRemainder.mutate(order.id) }
  const handleConfirmPendingReceipts = () => { confirmPendingReceipts.mutate(order.id) }
  const handleApprove = () => { approve.mutate(order.id) }

  const pickAgency = (agency: LiquidationAgency) => {
    liquidate.mutate({ id: order.id, agencyId: agency.id }, {
      onSuccess: () => { setShowAgencyPicker(false); setAgencySearch(''); setShowNewAgencyForm(false); setNewAgencyName('') },
    })
  }

  const handleCreateAgency = async () => {
    if (newAgencyName.trim() === '') return
    try {
      const agency = await createAgency.mutateAsync({ name: newAgencyName.trim() })
      pickAgency(agency)
    } catch {
      // error mostrado inline via mutation state
    }
  }

  const handleSaveEdit = async () => {
    if (orderId === null) return
    try {
      await update.mutateAsync({
        id: orderId,
        data: {
          provider_id: order.provider_id,
          shipping_type: draft.shippingType,
          who_pays_shipping: draft.whoPaysShipping,
          shipping_cost: draft.shippingCost !== '' ? Number(draft.shippingCost) : null,
          modality: draft.modality,
          estimated_arrival_date: draft.estimatedArrivalDate || null,
          lines: buildLinesPayload(draft),
        },
      })
      setEditing(false)
    } catch {
      // error mostrado inline via mutation state
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{t('compras:orders.detail.title', { id: order.id })}</h1>
            <OriginBadge originModule={order.origin_module} t={t} />
          </div>
          <p className="text-[12px] text-slate-500">{order.provider_name}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/compras/ordenes')}>
          {t('compras:nav.orders')}
        </Button>
      </div>

      <Card variant="panel" className="p-5 mb-4">
        {/* SCRUM-736 — "resumen de información": los 9 campos del mockup aprobado, en el mismo
            orden. shipping_cost/who_pays_shipping (REQ ya expuestos por usePurchaseOrder, nunca
            renderizados) se muestran como contexto secundario dentro de "Tipo de envío". */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
          <SummaryField label={t('compras:orders.detail.summary.provider')}>
            {order.provider_name ?? '—'}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.status')}>
            {orderStatusLabel(t, order.status, order.modality)}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.orderDate')}>
            {new Date(order.created_at).toLocaleDateString()}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.estimatedArrival')}>
            {order.estimated_arrival_date ?? '—'}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.responsible')}>
            {order.created_by_name ?? '—'}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.project')}>
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
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.modality')}>
            {t(`compras:newOrder.modality.${order.modality === 'zona_libre' ? 'zonaLibre' : 'directo'}`)}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.shippingType')}>
            {order.shipping_type ? (
              <>
                {t(`compras:newOrder.shipping.type${order.shipping_type.charAt(0).toUpperCase()}${order.shipping_type.slice(1)}`)}
                {order.shipping_cost != null && (
                  <span className="text-slate-400 font-normal"> · ${order.shipping_cost.toFixed(2)}</span>
                )}
                {order.who_pays_shipping !== null && (
                  <span className="text-slate-400 font-normal">
                    {' '}· {t(`compras:newOrder.shipping.whoPays${order.who_pays_shipping === 'atlantic' ? 'Atlantic' : 'Cliente'}`)}
                  </span>
                )}
              </>
            ) : '—'}
          </SummaryField>
          <SummaryField label={t('compras:orders.detail.summary.paymentDate')}>
            {order.last_payment_date ?? '—'}
          </SummaryField>
        </div>

        {order.requires_primary_approval && (
          <div className={`px-3 py-2 rounded-lg text-xs mb-3 ${order.approved_by !== null ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
            {order.approved_by !== null
              ? t('compras:orders.detail.markApproved', { name: order.approved_by_name ?? '—' })
              : t('compras:orders.detail.markBlocked')}
          </div>
        )}

        {/* SCRUM-208 (2026-08-06, hallazgo Gerencia Test): el `status` de la orden podía llegar a
            "Recibido" mostrando el flujo completo, sin ningún indicio de que una recepción parcial
            dejó mercancía pendiente en otra etapa (`pending_remainder_status`, REQ-165).

            SCRUM-208 (2026-08-07, segundo hallazgo de Gerencia Test sobre el fix anterior) — el gate
            en sí (bloquear el paso final a "Recibido" hasta que el 100% de las líneas llegó) es
            correcto y está pedido explícitamente en su propio AC ("la orden solo se considera
            completamente finalizada cuando todas sus líneas hayan alcanzado Recibido"); lo que
            confundía era la PRESENTACIÓN: el botón "Avanzar a: Recibido" seguía clickeable, así que
            al hacer clic aparecía un segundo cartel rojo de error apilado sobre este aviso ámbar,
            dando la impresión de que "todo" estaba bloqueado — cuando en realidad únicamente el
            paso final a Recibido lo está; cualquier otro avance de etapa (Ordenado→En tránsito→En
            aduana→En tránsito local) nunca estuvo bloqueado por `pending_remainder_status` (ver
            `PurchaseOrderController::advance()`, el gate solo dispara si `$next ===
            STATUS_RECIBIDO`). Fix: el botón se deshabilita directamente en este caso (mismo patrón
            que `blocked_by_primary_approval` un poco más abajo) en vez de dejar que el usuario dispare
            un 422 que ya sabemos que va a fallar, y el aviso se reformula para dejar explícito que
            lo ya recibido queda guardado y que el resto del flujo de la orden no se ve afectado. */}
        {/* SCRUM-208 (rediseño 2026-08-15, docs/architecture/scrum208-recepcion-parcial-rediseno.md)
            — el aviso deja de ser puramente informativo: 2 botones independientes.
            "Ingresar a Inventario" (`confirm-pending-receipts`, root cause real del reporte de
            Daniela — la parte ya recibida no aparecía en Inventario porque nada la confirmaba
            hasta que la orden ENTERA llegaba a Recibido) y "Completar etapa del remanente"
            (`advance-remainder`, avanza lo que sigue pendiente por sus propias etapas, sin
            depender del status de la orden completa). Ambos ya implementados en el backend. */}
        {order.pending_remainder_status !== null && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs mb-3">
            <p className="mb-2">
              {t('compras:orders.detail.pendingRemainder', {
                stage: t(`compras:goodsReceipts.wizard.partial.remainder.${order.pending_remainder_status}`),
              })}
            </p>
            {canManageOrder && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="!text-xs !px-3 !py-1.5"
                  loading={confirmPendingReceipts.isPending}
                  onClick={handleConfirmPendingReceipts}
                >
                  {t('compras:orders.actions.confirmPendingReceiptsCta')}
                </Button>
                <Button
                  variant="outline"
                  className="!text-xs !px-3 !py-1.5"
                  loading={advanceRemainder.isPending}
                  onClick={handleAdvanceRemainder}
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

        {/* El caso "next_status=recibido con remanente pendiente" ya tiene su propio aviso ámbar
            arriba (y el botón de abajo queda deshabilitado para ese caso puntual) — no duplicar
            con este cartel rojo genérico, que sigue cubriendo cualquier OTRO error real de avance. */}
        {advance.isError && !blockedFromReceivingByRemainder && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs mb-3">
            {apiErrorMessage(advance.error, t('compras:orders.errors.advanceGeneric'))}
          </div>
        )}

        {approve.isError && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs mb-3">
            {apiErrorMessage(approve.error, t('compras:orders.errors.approveGeneric'))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {order.requires_primary_approval && order.approved_by === null && canApprove && (
              <Button loading={approve.isPending} onClick={handleApprove}>
                {t('compras:newOrder.actions.approve')}
              </Button>
            )}
            {/* SCRUM-736 — botón único "Avanzar a: [Estado]" (mockup); ya no muestra un mensaje
                cuando no hay next_status, simplemente no renderiza nada (task 3/4 del ticket). */}
            {order.next_status !== null && canManageOrder && (
              <Button
                variant="outline"
                disabled={order.blocked_by_primary_approval || blockedFromReceivingByRemainder}
                loading={advance.isPending}
                onClick={handleAdvance}
              >
                {t('compras:orders.actions.advanceTo', { status: orderStatusLabel(t, order.next_status, order.modality) })}
              </Button>
            )}
            {canEdit && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t('compras:orders.actions.edit')}
              </Button>
            )}
          </div>

          {/* SCRUM-736 — "Incluir costo" + "Enviar por correo" salen del bloque principal, van a
              un menú de acciones secundario (mismo patrón que el dropdown del avatar en TopBar.tsx:
              trigger relative + backdrop fixed + panel absolute). Misma lógica/mutación, solo
              cambia dónde vive en el layout. */}
          <div className="relative">
            <Button
              variant="icon"
              onClick={() => setShowActionsMenu(v => !v)}
              aria-label={t('compras:orders.detail.moreActions') ?? ''}
            >
              <IcoMoreVertical size={16} />
            </Button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-[220px]">
                  <label className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCostInDocs}
                      onChange={e => setIncludeCostInDocs(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    {t('compras:orders.detail.includeCost')}
                  </label>
                  <button
                    type="button"
                    disabled={sendEmail.isPending}
                    onClick={() => sendEmail.mutate({ id: order.id, includeCost: includeCostInDocs })}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium disabled:opacity-50"
                  >
                    {t('compras:orders.actions.sendEmail')}
                  </button>
                  {sendEmail.isSuccess && (
                    <p className="px-4 py-1.5 text-xs text-emerald-600">{t('compras:orders.detail.emailSent')}</p>
                  )}
                  {sendEmail.isError && (
                    <p className="px-4 py-1.5 text-xs text-red-600">{t('compras:orders.errors.sendEmailGeneric')}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* SCRUM-210 (REQ-147, alcance reducido) — solo aplica a órdenes Zona Libre. */}
        {order.modality === 'zona_libre' && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              {/* SCRUM-736 — "Agencia de liquidación" → "Liquidando con: [Agencia]" (mockup),
                  una sola línea en vez de label+valor separados. */}
              <p className="text-sm text-slate-800 font-medium">
                {order.liquidation_agency_id !== null
                  ? t('compras:orders.detail.liquidatingWith', { agency: order.liquidation_agency_name })
                  : t('compras:orders.detail.liquidationAgencyNone')}
              </p>
              {canManageOrder && (
                <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => setShowAgencyPicker(v => !v)}>
                  {order.liquidation_agency_id !== null
                    ? t('compras:orders.actions.changeAgency')
                    : t('compras:orders.actions.liquidate')}
                </Button>
              )}
            </div>

            {showAgencyPicker && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                {showNewAgencyForm ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={newAgencyName}
                      onChange={e => setNewAgencyName(e.target.value)}
                      placeholder={t('compras:orders.detail.newAgencyPlaceholder')}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    <Button loading={createAgency.isPending} onClick={handleCreateAgency}>
                      {t('common:actions.save')}
                    </Button>
                    <Button variant="secondary" onClick={() => setShowNewAgencyForm(false)}>
                      {t('common:actions.cancel')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={agencySearch}
                        onChange={e => setAgencySearch(e.target.value)}
                        placeholder={t('compras:orders.detail.agencySearchPlaceholder')}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <Button variant="outline" onClick={() => setShowNewAgencyForm(true)}>
                        {t('compras:orders.detail.newAgency')}
                      </Button>
                    </div>
                    {agencyResults && agencyResults.data.length > 0 && (
                      <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden bg-white">
                        {agencyResults.data.map(a => (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => pickAgency(a)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              {a.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {(liquidate.isError || createAgency.isError) && (
                  <p className="text-xs text-red-600 mt-2">{t('compras:orders.errors.liquidateGeneric')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* SCRUM-736 — "Pagos a Proveedores" sale del bloque principal (decisión 1): queda un
          trigger compacto, fuera del Card de resumen, que abre el mismo panel dentro de un modal. */}
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          className="!text-xs !px-3 !py-1.5 inline-flex items-center gap-1.5"
          onClick={() => setShowPaymentsModal(true)}
        >
          <IcoDollarSign size={13} />
          {t('compras:orders.detail.payments.title')}
        </Button>
      </div>
      {showPaymentsModal && (
        <PurchaseOrderPaymentsModal order={order} onClose={() => setShowPaymentsModal(false)} />
      )}
      {showProjectBreakdown && (
        <ProjectBreakdownModal orderId={order.id} onClose={() => setShowProjectBreakdown(false)} />
      )}

      <ProviderConfirmationCard orderId={order.id} orderStatus={order.status} />

      {editing ? (
        <>
          <OrderLinesEditor
            providerId={order.provider_id}
            draft={draft}
            onChange={setDraft}
            errorMessage={update.isError ? t('compras:orders.errors.updateGeneric') : undefined}
          />
          <div className="flex justify-end gap-2 mb-8">
            <Button variant="secondary" onClick={() => { setEditing(false); setDraft(draftFromOrder(order)) }}>
              {t('compras:orders.actions.cancel')}
            </Button>
            <Button loading={update.isPending} onClick={handleSaveEdit}>
              {t('compras:orders.actions.save')}
            </Button>
          </div>
        </>
      ) : (
        <Card variant="panel" className="p-5 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('compras:newOrder.steps.lines')}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.product')}</th>
                {/* SCRUM-736 (task 7) — mismo split que ya tiene OrderLinesEditor.tsx desde
                    SCRUM-194 (edb3edd): la tabla de solo lectura nunca lo había recibido. */}
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.factoryRef')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.publicRef')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.quantity')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.unitCost')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.subtotal')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.project')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:orders.table.reception')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map(l => (
                <tr key={l.id}>
                  <td className="py-2">
                    <div className="font-medium text-slate-800">{l.description}</div>
                  </td>
                  <td className="py-2 text-slate-600">{l.factory_reference ?? '—'}</td>
                  <td className="py-2 text-slate-600">{l.reference ?? '—'}</td>
                  <td className="py-2 text-slate-600">{l.quantity}</td>
                  <td className="py-2 text-slate-600">${l.unit_cost.toFixed(2)}</td>
                  <td className="py-2 font-semibold text-slate-800">${l.subtotal.toFixed(2)}</td>
                  <td className="py-2 text-slate-600">{l.sales_project_name ?? t('compras:newOrder.lines.projectNone')}</td>
                  <td className="py-2">
                    <ReceptionBadge status={l.reception_status} t={t} />
                    {l.reception_status === 'parcial' && (
                      <span className="ml-1.5 text-xs text-slate-400">
                        {t('compras:reception.receivedOf', { received: l.received_quantity, expected: l.quantity })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* SCRUM-736 — "y el monto total" (mockup): antes vivía en el grid superior junto al
              Estado, ahora baja junto a la tabla de líneas. */}
          <div className="flex justify-end font-bold text-slate-800 text-sm mt-3 pt-3 border-t border-slate-100">
            {t('compras:newOrder.lines.total')}: ${order.total_amount.toFixed(2)}
          </div>
        </Card>
      )}

      {/* SCRUM-736 (task 9) — botón full-width "Ver Orden (PDF)" al estilo del mockup; usa el
          mismo includeCostInDocs del menú de "Más acciones" y la misma mutación de siempre. */}
      <Button
        variant="primary"
        className="w-full text-center mb-8"
        loading={openPdf.isPending}
        onClick={() => {
          // Abrir la ventana sincrónico, atado al click — si se abre después del fetch
          // async del PDF, el navegador la trata como popup no solicitado y la bloquea.
          const targetWindow = window.open('', '_blank')
          openPdf.mutate({ id: order.id, includeCost: includeCostInDocs, targetWindow })
        }}
      >
        {t('compras:orders.actions.viewOrderPdf')}
      </Button>
    </div>
  )
}
