import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { useOrderDetail, useOrderWarehouseBreakdown, useRegisterDelivery } from '@/hooks/useBodega'
import type { OrderItemDetail, OrderShortageReason, RegisterDeliveryItemPayload } from '@/types/bodega'
import { ORDER_SHORTAGE_REASONS } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPencil, IcoLock } from '@/components/icons'
import OrderItemWarehousesModal from '@/components/OrderItemWarehousesModal'

interface Props {
  orderId: number
  onClose: () => void
}

/** Estado local por artículo — arranca "bloqueado" en el tope real (`qty_picked`), mismo criterio
 * de UX que `InventoryReviewModal` (ninguna fila se asume editada de antemano). */
interface DeliveryRowState {
  qtyDelivered:   number
  editing:        boolean
  motivo:         OrderShortageReason | ''
  motivoDetalle:  string
}

function buildInitialRows(items: OrderItemDetail[]): Record<number, DeliveryRowState> {
  const rows: Record<number, DeliveryRowState> = {}
  for (const item of items) {
    rows[item.id] = { qtyDelivered: item.qty_picked, editing: false, motivo: '', motivoDetalle: '' }
  }
  return rows
}

const shortageReasonSchema = z.enum(ORDER_SHORTAGE_REASONS as [OrderShortageReason, ...OrderShortageReason[]])

/** Zod (RHF no aplica acá — el número de filas es dinámico y ya sembrado desde el pedido, no un
 * formulario de longitud fija; mismo criterio de "validar con zod, estado local simple" que ya
 * usa el resto de tablas editables de Bodega, ver `InventoryReviewModal`). RN1 (REQ-323):
 * "A entregar" nunca supera el tope. El tope real ES `qty_picked` — Pre-QA 2026-07-22 (CRÍTICO)
 * confirmó que `DeliveryService::registerDelivery()` usa SIEMPRE `qty_picked`, nunca un fallback a
 * `qty_requested` (ver docblock del backend) — la UI refleja ese comportamiento ya aprobado, no el
 * texto original de RN2/RN3 sobre "reservado/disponible" (superado por el fix). RN2 (REQ-324):
 * motivo obligatorio si la entrega quedó parcial — "parcial" se define contra `qty_requested`
 * (lo pedido originalmente), no contra el tope `qty_picked`: un artículo que ya llegó alistado
 * por debajo de lo pedido es una entrega parcial desde que se abre el modal, aunque el asistente
 * no toque el campo (SCRUM-393, rebote 2026-08-17 — antes solo se disparaba si se editaba a mano
 * por debajo del tope). "Otra" exige texto libre. */
function buildRowSchema(cap: number, requested: number) {
  return z
    .object({
      qtyDelivered:  z.number().int().min(0).max(cap),
      motivo:        z.union([shortageReasonSchema, z.literal('')]),
      motivoDetalle: z.string(),
    })
    .superRefine((row, ctx) => {
      const isPartial = row.qtyDelivered < requested
      if (isPartial && row.motivo === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivo'], message: 'required' })
      }
      if (row.motivo === 'otra' && row.motivoDetalle.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivoDetalle'], message: 'required' })
      }
    })
}

export default function RegisterDeliveryModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order, isLoading } = useOrderDetail(orderId)
  const registerDelivery = useRegisterDelivery()

  const [rows, setRows] = useState<Record<number, DeliveryRowState>>({})
  const [rowsInitialized, setRowsInitialized] = useState(false)
  const [observacionGeneral, setObservacionGeneral] = useState('')
  const [rowErrors, setRowErrors] = useState<Record<number, { qty?: string; motivo?: string; motivoDetalle?: string }>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [warehousesForItem, setWarehousesForItem] = useState<OrderItemDetail | null>(null)

  // SCRUM-393 (rebote de Daniela Amaya 2026-08-11 — modal "titila y se mueve", no se puede
  // interactuar) — `order?.items ?? []` armaba un array NUEVO en cada render (referencia
  // distinta aunque el contenido fuera el mismo), así que el efecto de abajo dependía de un
  // valor inestable. `useMemo` lo estabiliza mientras `order` no cambie de verdad.
  const items = useMemo(() => order?.items ?? [], [order])

  // Mismo criterio que `InventoryReviewModal`: los ítems llegan una sola vez por apertura de
  // modal, se inicializa el estado local solo la primera vez que `items` deja de estar vacío.
  // Depende de `order?.id` (primitivo, nunca cambia mientras el modal está abierto para el mismo
  // pedido) en vez de la referencia de `items` — más resistente a que una futura relectura de
  // `order` (ej. refetch en segundo plano) dispare este efecto de nuevo sin necesidad.
  useEffect(() => {
    if (!rowsInitialized && items.length > 0) {
      setRows(buildInitialRows(items))
      setRowsInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, rowsInitialized])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // SCRUM-403 (REQ-333) — mismo criterio que `OrderDetailModal`: una sola llamada a nivel de todo
  // el pedido para "Ver bodegas" por fila, gateada a que el modal ya esté cargado.
  const { data: warehouseBreakdown, isLoading: isLoadingBreakdown } = useOrderWarehouseBreakdown(
    order ? orderId : null,
  )

  // SCRUM-393 — columna "Disponible" (stock total en bodega, `por_servir`), pedida por Daniela
  // Amaya en el mockup original. Reusa el mismo `warehouseBreakdown` que ya trae el botón "Ver
  // bodegas" (una sola llamada a nivel de pedido, ver arriba) — no hace falta un fetch nuevo.
  function getAvailable(item: OrderItemDetail): number | null {
    if (item.catalog_product_id === null) return null
    return warehouseBreakdown?.products[item.catalog_product_id]?.por_servir ?? null
  }

  function handleToggleEdit(itemId: number) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], editing: !r[itemId].editing } }))
  }

  function handleQtyChange(itemId: number, value: string) {
    const n = value === '' ? 0 : Number(value)
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], qtyDelivered: Number.isFinite(n) ? n : 0 } }))
  }

  function handleMotivoChange(itemId: number, motivo: OrderShortageReason | '') {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], motivo, motivoDetalle: motivo === 'otra' ? r[itemId].motivoDetalle : '' } }))
  }

  function handleMotivoDetalleChange(itemId: number, value: string) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], motivoDetalle: value } }))
  }

  function validate(): RegisterDeliveryItemPayload[] | null {
    const nextErrors: Record<number, { qty?: string; motivo?: string; motivoDetalle?: string }> = {}
    let hasError = false

    for (const item of items) {
      const row = rows[item.id]
      if (!row) continue
      const result = buildRowSchema(item.qty_picked, item.qty_requested).safeParse(row)
      if (!result.success) {
        hasError = true
        const fieldErrors: { qty?: string; motivo?: string; motivoDetalle?: string } = {}
        for (const issue of result.error.issues) {
          if (issue.path[0] === 'qtyDelivered') fieldErrors.qty = t('bodega:pedidos.registerDeliveryModal.errors.qtyExceedsCap')
          if (issue.path[0] === 'motivo') fieldErrors.motivo = t('bodega:pedidos.registerDeliveryModal.errors.motivoRequired')
          if (issue.path[0] === 'motivoDetalle') fieldErrors.motivoDetalle = t('bodega:pedidos.registerDeliveryModal.errors.motivoDetalleRequired')
        }
        nextErrors[item.id] = fieldErrors
      }
    }

    setRowErrors(nextErrors)
    if (hasError) return null

    return items.map(item => {
      const row = rows[item.id]
      const isPartial = row.qtyDelivered < item.qty_requested
      return {
        order_item_id: item.id,
        qty_delivered: row.qtyDelivered,
        motivo:        isPartial && row.motivo !== '' ? row.motivo : undefined,
        motivo_detalle: isPartial && row.motivo === 'otra' ? row.motivoDetalle.trim() : undefined,
      }
    })
  }

  function handleApiError(err: unknown) {
    const message = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
      ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
      : undefined
    setGeneralError(message ?? t('bodega:pedidos.registerDeliveryModal.errors.saveFailed'))
  }

  function handleSave() {
    setGeneralError(null)
    const payloadItems = validate()
    if (payloadItems === null) return

    registerDelivery.mutate(
      { orderId, payload: { items: payloadItems, observacion_general: observacionGeneral.trim() || undefined } },
      { onSuccess: onClose, onError: handleApiError },
    )
  }

  // SCRUM-393 (rebote de Daniela Amaya 2026-08-11, causa raíz confirmada por revisión de código —
  // sin poder reproducir el video adjunto, no hay herramienta de reproducción de video disponible
  // acá): `OrderCardTile` renderiza este modal como hijo DIRECTO de su tarjeta raíz, que tiene
  // `hover:-translate-y-px` (un `transform` CSS). Cualquier ancestro con `transform` se vuelve el
  // "containing block" de sus descendientes `position: fixed` (spec CSS, no un bug de React) — el
  // overlay `fixed inset-0` de este modal terminaba posicionado/dimensionado relativo a la
  // tarjetita pequeña (~330×120px), no al viewport. Eso descentra el modal grande sobre la
  // tarjeta; el cursor deja de estar sobre la tarjeta (que perdió el hover) → el transform se
  // revierte → el modal salta a posicionarse contra el viewport completo → el cursor puede volver
  // a caer sobre la tarjeta → el hover se reactiva → loop. Con contenido grande (esta es la tabla
  // más grande de todas las que abre `OrderCardTile`) el salto es más visible, coincide con
  // "titila y se mueve, no puedo interactuar". Fix: portal a `document.body`, así el `fixed`
  // siempre se posiciona contra el viewport real, sin importar el hover de la tarjeta que lo
  // abrió. `stopPropagation()` en el wrapper de `OrderCardTile` sigue funcionando — los portales
  // de React burbujean eventos sintéticos por el árbol de componentes, no por el DOM. Mismo
  // patrón nunca aplicado a los otros modales que `OrderCardTile` abre (InvoiceStatusModal,
  // RegisterSignedGuideModal) — comparten la misma causa raíz en teoría, pero quedan fuera de
  // alcance de este ticket puntual; señalado para Senior Review, no corregido en silencio.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4" data-testid="register-delivery-modal">
      <Card variant="modal" className="w-full max-w-4xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:pedidos.registerDeliveryModal.title')}
            </h2>
            <p className="text-xs text-slate-500">
              {t('bodega:pedidos.registerDeliveryModal.orderNumber')} #{order?.order_number ?? '—'}
            </p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !order ? (
            <p className="text-slate-400 text-sm py-6 text-center">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm" data-testid="register-delivery-table">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.factoryRef')}</Th>
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.publicRef')}</Th>
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.product')}</Th>
                      <Th align="right">{t('bodega:pedidos.registerDeliveryModal.columns.requested')}</Th>
                      <Th align="right">{t('bodega:pedidos.registerDeliveryModal.columns.available')}</Th>
                      <Th align="right">{t('bodega:pedidos.registerDeliveryModal.columns.picked')}</Th>
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.warehouses')}</Th>
                      <Th align="right">{t('bodega:pedidos.registerDeliveryModal.columns.toDeliver')}</Th>
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.action')}</Th>
                      <Th>{t('bodega:pedidos.registerDeliveryModal.columns.observation')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map(item => {
                      const row = rows[item.id]
                      const errors = rowErrors[item.id]
                      const isPartial = row && row.qtyDelivered < item.qty_requested
                      const available = getAvailable(item)
                      return (
                        <tr key={item.id} data-testid={`register-delivery-row-${item.id}`}>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.factory_reference ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{item.reference ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.description ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{item.qty_requested}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300" data-testid={`register-delivery-available-${item.id}`}>
                            {isLoadingBreakdown ? '…' : (available ?? '—')}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300" title={t('bodega:pedidos.registerDeliveryModal.pickedHelp')}>
                            {item.qty_picked}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="outline"
                              className="!text-xs !px-2 !py-1"
                              onClick={() => setWarehousesForItem(item)}
                              disabled={item.catalog_product_id === null}
                              data-testid={`register-delivery-view-warehouses-${item.id}`}
                            >
                              {t('bodega:pedidos.detailModal.items.viewWarehouses')}
                            </Button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={item.qty_picked}
                              value={row?.qtyDelivered ?? 0}
                              disabled={!row?.editing}
                              onChange={e => handleQtyChange(item.id, e.target.value)}
                              data-testid={`register-delivery-qty-${item.id}`}
                              className={[
                                'w-20 text-right text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none disabled:opacity-60 disabled:bg-slate-50 dark:disabled:bg-slate-900',
                                errors?.qty ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
                              ].join(' ')}
                            />
                            {errors?.qty && (
                              <p className="text-red-600 text-[11px] mt-1" data-testid={`register-delivery-qty-error-${item.id}`}>{errors.qty}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="outline"
                              className="!text-xs !px-2 !py-1 !flex !items-center !gap-1"
                              onClick={() => handleToggleEdit(item.id)}
                              data-testid={`register-delivery-edit-${item.id}`}
                            >
                              {row?.editing ? <IcoLock size={12} /> : <IcoPencil size={12} />}
                              {row?.editing
                                ? t('bodega:pedidos.registerDeliveryModal.lock')
                                : t('bodega:pedidos.registerDeliveryModal.edit')}
                            </Button>
                          </td>
                          <td className="px-3 py-2 min-w-[220px]">
                            {isPartial ? (
                              <div className="space-y-1.5">
                                <select
                                  value={row.motivo}
                                  onChange={e => handleMotivoChange(item.id, e.target.value as OrderShortageReason | '')}
                                  data-testid={`register-delivery-motivo-${item.id}`}
                                  className={[
                                    'w-full text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
                                    errors?.motivo ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
                                  ].join(' ')}
                                >
                                  <option value="">{t('bodega:pedidos.registerDeliveryModal.motivoPlaceholder')}</option>
                                  {ORDER_SHORTAGE_REASONS.map(reason => (
                                    <option key={reason} value={reason}>
                                      {t(`bodega:pedidos.registerDeliveryModal.shortageReasons.${reason}`)}
                                    </option>
                                  ))}
                                </select>
                                {errors?.motivo && (
                                  <p className="text-red-600 text-[11px]" data-testid={`register-delivery-motivo-error-${item.id}`}>{errors.motivo}</p>
                                )}
                                {row.motivo === 'otra' && (
                                  <>
                                    <input
                                      type="text"
                                      value={row.motivoDetalle}
                                      onChange={e => handleMotivoDetalleChange(item.id, e.target.value)}
                                      placeholder={t('bodega:pedidos.registerDeliveryModal.motivoDetallePlaceholder')}
                                      data-testid={`register-delivery-motivo-detalle-${item.id}`}
                                      className={[
                                        'w-full text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
                                        errors?.motivoDetalle ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
                                      ].join(' ')}
                                    />
                                    {errors?.motivoDetalle && (
                                      <p className="text-red-600 text-[11px]" data-testid={`register-delivery-motivo-detalle-error-${item.id}`}>{errors.motivoDetalle}</p>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* RN3 (REQ-324) — observación general del pedido, opcional, complementa (no
                  reemplaza) las observaciones por artículo de arriba. */}
              <div className="mb-2">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('bodega:pedidos.registerDeliveryModal.generalObservation')}
                </label>
                <textarea
                  value={observacionGeneral}
                  onChange={e => setObservacionGeneral(e.target.value)}
                  rows={2}
                  data-testid="register-delivery-general-observation"
                  className="w-full text-sm rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-primary"
                />
              </div>

              {generalError && (
                <p className="text-red-600 text-xs" data-testid="register-delivery-general-error">{generalError}</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isLoading || registerDelivery.isPending}
            loading={registerDelivery.isPending}
            data-testid="register-delivery-save"
          >
            {t('bodega:pedidos.registerDeliveryModal.save')}
          </Button>
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
    </div>,
    document.body,
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
