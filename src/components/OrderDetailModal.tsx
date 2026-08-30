import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrderDetail, useOrderWarehouseBreakdown, useExportOrderItemsExcel } from '@/hooks/useBodega'
import type { OrderItemDetail } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoChevronDown, IcoChevronRight, IcoDownload } from '@/components/icons'
import OrderItemWarehousesModal from '@/components/OrderItemWarehousesModal'

interface Props {
  orderId: number
  onClose: () => void
  /** Pre-QA 2026-07-26 (SCRUM-385 Escenario 2, CRÍTICO) — antes de este fix, la Hoja de Picking
   * solo se podía abrir desde `OrderCardTile` (etapas `picking_pendiente`/`en_picking`), así que
   * un pedido que ya avanzó a Packing/Por despachar/etc. quedaba sin ningún punto de entrada para
   * volver a verla en modo solo lectura (el backend ya devuelve `editable: false` correctamente,
   * `PickingSheetModal` ya sabe renderizar ese modo — faltaba el link). Se levanta el callback
   * desde `PedidosPage` (mismo estado `pickingSheetOrderId` que ya usa `OrderCardTile`) en vez de
   * que este modal abra su propia instancia de `PickingSheetModal` — un solo dueño del estado
   * "qué modal está abierto" evita 2 hojas de picking montadas a la vez para el mismo pedido. */
  onOpenPickingSheet: (orderId: number) => void
}

/**
 * SCRUM-329 Oleada A / Batch A3 (REQ-332), rediseño Lote 4 (SCRUM-402, 2026-08-17) — modal "Ver
 * detalle" del pedido. RN1: la tabla de artículos arranca colapsada, solo se expande con un clic
 * explícito en "Ver detalle de artículos →" (no re-usar `isEditing`/similar — no hay edición acá,
 * es de solo lectura).
 *
 * Título = proyecto/cliente (antes "Pedido #XXXX", que ahora baja a ser una fila más del cuerpo)
 * + subtítulo con la etapa — mockup del ticket. Layout de 1 columna (antes grid de 2) con
 * Teléfono/Correo como filas propias (gap compartido con SCRUM-395, ver
 * `contacto_telefono`/`contacto_correo` en `OrderBoardService::detail()`). "Resumen" pasa de
 * listar SKUs a un agregado "N productos · N unidades" (`items_summary`, ya calculado
 * server-side).
 *
 * `contacto_cliente`/`direccion_entrega`/`items[].factory_reference` vienen de
 * `OrderBoardService::detail()` (nombres en español, mismo criterio que el resto del payload).
 */
export default function OrderDetailModal({ orderId, onClose, onOpenPickingSheet }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order, isLoading } = useOrderDetail(orderId)
  const [itemsExpanded, setItemsExpanded] = useState(false)
  const [warehousesForItem, setWarehousesForItem] = useState<OrderItemDetail | null>(null)

  // SCRUM-403 (REQ-333) — se pide UNA vez a nivel de todo el modal (no por fila), gateado a
  // `itemsExpanded` para no pagar el request si la tabla nunca se abre.
  const { data: warehouseBreakdown, isLoading: isLoadingBreakdown } = useOrderWarehouseBreakdown(
    itemsExpanded ? orderId : null,
  )

  // SCRUM-390 (REQ-320 RN1) — descarga a Excel de esta misma tabla de detalle.
  const exportMutation = useExportOrderItemsExcel()

  function handleExportExcel() {
    if (!order) return
    exportMutation.mutate(orderId, {
      onSuccess: blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `detalle-pedido-${order.order_number}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      },
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const summaryText = order
    ? t('bodega:pedidos.detailModal.summaryAggregate', {
      products: order.items_summary.product_count,
      units: order.items_summary.unit_count,
    })
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {order ? (order.proyecto ?? order.cliente ?? t('bodega:pedidos.detailModal.title', { number: order.order_number })) : t('common:labels.loading')}
            </h2>
            {order && (
              <p className="text-xs text-slate-500 mt-0.5">
                {t('bodega:pedidos.detailModal.stageSubtitle', { stage: t(`bodega:pedidos.stages.${order.stage}`) })}
              </p>
            )}
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !order ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="space-y-3 mb-3">
                <DetailRow label={t('bodega:pedidos.detailModal.orderNumber')} value={order.order_number} />
                <DetailRow label={t('bodega:pedidos.detailModal.client')} value={order.cliente} />
                <DetailRow label={t('bodega:pedidos.detailModal.seller')} value={order.vendedor} />
                <DetailRow label={t('bodega:pedidos.detailModal.assistant')} value={order.asistente} />
                <DetailRow
                  label={t('bodega:pedidos.detailModal.deliveryDate')}
                  value={order.fecha_entrega_comprometida}
                />
                <DetailRow
                  label={t('bodega:pedidos.detailModal.deliveryAddress')}
                  value={order.direccion_entrega}
                  fallback={t('bodega:pedidos.detailModal.notAvailable')}
                />
                <DetailRow
                  label={t('bodega:pedidos.detailModal.contact')}
                  value={order.contacto_cliente}
                  fallback={t('bodega:pedidos.detailModal.notAvailable')}
                />
                <DetailRow
                  label={t('bodega:pedidos.detailModal.phone')}
                  value={order.contacto_telefono}
                  fallback={t('bodega:pedidos.detailModal.notAvailable')}
                />
                <DetailRow
                  label={t('bodega:pedidos.detailModal.email')}
                  value={order.contacto_correo}
                  fallback={t('bodega:pedidos.detailModal.notAvailable')}
                />
                {/* REQ-336 RN1 — ETA de proveedor solo aplica a tarjetas "Sin stock". */}
                {order.eta_proveedor !== null && (
                  <DetailRow label={t('bodega:pedidos.detailModal.supplierEta')} value={order.eta_proveedor} />
                )}
              </div>

              <div className="mb-3">
                <SectionLabel>{t('bodega:pedidos.detailModal.summary')}</SectionLabel>
                <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{summaryText}</p>
              </div>

              <div className="mb-3">
                <SectionLabel>{t('bodega:pedidos.detailModal.observations')}</SectionLabel>
                <p className="text-sm text-slate-400 py-1.5">{t('bodega:pedidos.detailModal.noObservations')}</p>
              </div>

              {/* RN1 — colapsado por defecto. */}
              <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                <button
                  onClick={() => setItemsExpanded(v => !v)}
                  className="flex items-center gap-1 text-sm font-semibold text-[#5BA5A0] hover:text-[#3D7E7A]"
                  data-testid="toggle-items"
                >
                  {itemsExpanded ? <IcoChevronDown size={14} /> : <IcoChevronRight size={14} />}
                  {itemsExpanded ? t('bodega:pedidos.detailModal.hideItems') : t('bodega:pedidos.detailModal.viewItems')}
                </button>

                {/* SCRUM-390 (REQ-320 RN1) — descarga a Excel de esta misma tabla. */}
                {itemsExpanded && (
                  <Button
                    variant="outline"
                    className="!text-xs !px-2 !py-1 !flex !items-center !gap-1.5"
                    onClick={handleExportExcel}
                    disabled={exportMutation.isPending}
                    loading={exportMutation.isPending}
                    data-testid="export-excel-button"
                  >
                    <IcoDownload size={12} /> {t('bodega:pedidos.detailModal.items.exportExcel')}
                  </Button>
                )}
              </div>

              {itemsExpanded && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                        <Th>{t('bodega:pedidos.detailModal.items.item')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.factoryRef')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.publicRef')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.location')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.requested')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.available')}</Th>
                        <Th>{t('bodega:pedidos.detailModal.items.viewWarehouses')}</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {order.items.map(item => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{item.description ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.factory_reference ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.reference ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.location ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.qty_requested}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.qty_reserved}</td>
                          <td className="px-3 py-2">
                            {/* SCRUM-403 (REQ-333) — "Ver bodegas", desglose por bodega de este
                                artículo puntual (ya resuelto para todo el pedido de una vez). */}
                            <Button
                              variant="outline"
                              className="!text-xs !px-2 !py-1"
                              onClick={() => setWarehousesForItem(item)}
                              disabled={item.catalog_product_id === null}
                              title={item.catalog_product_id === null ? t('bodega:pedidos.detailModal.items.noProduct') : undefined}
                              data-testid={`view-warehouses-${item.id}`}
                            >
                              {t('bodega:pedidos.detailModal.items.viewWarehouses')}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          {/* Pre-QA 2026-07-26 (SCRUM-385 Escenario 2, CRÍTICO) — único entry point para reabrir la
              Hoja de Picking una vez que el pedido ya avanzó más allá de "En picking" (Packing,
              Por despachar, Despachado, Entregado); PickingSheetModal ya la renderiza en modo solo
              lectura vía `editable: false` (RN3 de REQ-315). Criterio de visibilidad: `order.picker
              !== null` — proxy de "ya hubo un picker asignado" (`OrderCard`/`OrderDetail` no
              exponen `picker_id`, solo el nombre ya resuelto server-side, ver `types/bodega.ts`);
              si nunca se asignó picker, nunca existió una Hoja de Picking que mostrar. */}
          {order && order.picker !== null && (
            <Button
              variant="outline"
              onClick={() => onOpenPickingSheet(orderId)}
              data-testid="view-picking-sheet-button"
            >
              {t('bodega:pedidos.detailModal.viewPickingSheet')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>

      {warehousesForItem && warehousesForItem.catalog_product_id !== null && (
        <OrderItemWarehousesModal
          reference={warehousesForItem.reference}
          catalogProductId={warehousesForItem.catalog_product_id}
          breakdown={warehouseBreakdown}
          isLoading={isLoadingBreakdown}
          onClose={() => setWarehousesForItem(null)}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value, fallback = '—' }: { label: string; value: string | null | undefined; fallback?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-slate-100 dark:border-slate-700">
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 text-right">{value ?? fallback}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
      {children}
    </label>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
