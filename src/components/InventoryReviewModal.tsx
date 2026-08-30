import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { useOrderDetail, useOrderPickingSheet, useResolveInventoryReview } from '@/hooks/useBodega'
import type { InventoryReviewDecisionPayload, PickingSheetItem } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  orderId: number
  onClose: () => void
}

type StockStatus = 'pendiente' | 'si' | 'no'

/** Estado local por artículo — arranca en "pendiente" para cada fila (RN de REQ-318, ninguna
 * fila se asume resuelta de antemano). `locationError` se marca al intentar confirmar con "Sí
 * hay" y sin ubicación, mismo criterio de validación inline que el resto del batch (sin
 * `window.confirm`/`window.alert`). */
interface RowState {
  status:        StockStatus
  location:      string
  locationError: boolean
}

function buildInitialRows(items: PickingSheetItem[]): Record<number, RowState> {
  const rows: Record<number, RowState> = {}
  for (const item of items) {
    rows[item.id] = { status: 'pendiente', location: '', locationError: false }
  }
  return rows
}

/**
 * SCRUM-387/388 (REQ-317/318) — resolución de la tarjeta "Revisión de Inventario" que
 * `PickingSheetModal`/`useCompletePicking` ya genera cuando el picking se completa con
 * faltantes. Backend ya implementado y Pre-QA'd (`resolve-inventory-review`) — este modal solo
 * cablea el frontend que faltaba.
 *
 * Reusa `GET .../picking-sheet` (mismo hook que `PickingSheetModal`) para listar los ítems — no
 * hay un endpoint GET dedicado a la revisión, y ese endpoint no filtra por `order_type`, así que
 * sirve igual para una tarjeta de revisión.
 */
export default function InventoryReviewModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order } = useOrderDetail(orderId)
  const { data: sheet, isLoading } = useOrderPickingSheet(orderId)
  const resolveReview = useResolveInventoryReview()

  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [rowsInitialized, setRowsInitialized] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({})
  const [confirmed, setConfirmed] = useState(false)

  const items = useMemo(() => sheet?.items ?? [], [sheet])

  // Mismo criterio que `PickingSheetModal`: los ítems llegan una sola vez por apertura de modal,
  // se inicializa el estado local solo la primera vez que `items` deja de estar vacío.
  useEffect(() => {
    if (!rowsInitialized && items.length > 0) {
      setRows(buildInitialRows(items))
      setRowsInitialized(true)
    }
  }, [items, rowsInitialized])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleStatusChange(itemId: number, status: StockStatus) {
    setRows(r => ({
      ...r,
      [itemId]: {
        ...r[itemId],
        status,
        // Cambiar de "Sí hay" a otra cosa limpia la ubicación y su error — evita mandar un valor
        // obsoleto si el usuario corrige la decisión antes de confirmar.
        location:      status === 'si' ? r[itemId]?.location ?? '' : '',
        locationError: false,
      },
    }))
  }

  function handleLocationChange(itemId: number, value: string) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], location: value, locationError: false } }))
  }

  function buildDecisions(): InventoryReviewDecisionPayload[] {
    return items.map(item => {
      const row = rows[item.id]
      return row?.status === 'si'
        ? { order_item_id: item.id, found: true, location: row.location.trim() }
        : { order_item_id: item.id, found: false }
    })
  }

  function handleApiError(err: unknown) {
    if (isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)) {
      const errors = err.response?.data?.errors ?? {}
      // Laravel valida `decisions.*.location` — las claves del 422 vienen indexadas por posición
      // (`decisions.0.location`), que coincide con el orden en que se arma `items`/`decisions`
      // acá, así que se puede mapear de vuelta al `order_item_id` real de esa fila.
      const perItem: Record<number, string> = {}
      for (const [key, messages] of Object.entries(errors)) {
        const match = /^decisions\.(\d+)\.location$/.exec(key)
        const item = match ? items[Number(match[1])] : undefined
        if (item && messages[0]) perItem[item.id] = messages[0]
      }
      if (Object.keys(perItem).length > 0) {
        setItemErrors(perItem)
        return
      }
      const fallback = Object.values(errors)[0]?.[0] ?? err.response?.data?.message
      setGeneralError(fallback ?? t('bodega:pedidos.inventoryReviewModal.confirmFailed'))
      return
    }
    setGeneralError(t('bodega:pedidos.inventoryReviewModal.confirmFailed'))
  }

  function handleConfirm() {
    setGeneralError(null)
    setItemErrors({})

    const pendientes = items.filter(item => (rows[item.id]?.status ?? 'pendiente') === 'pendiente')
    if (pendientes.length > 0) {
      setGeneralError(t('bodega:pedidos.inventoryReviewModal.missingDecision', { count: pendientes.length }))
      return
    }

    // RN — "¿Dónde se encontró?" obligatorio solo si la fila quedó en "Sí hay" (replica el 422
    // real del backend antes de disparar el request).
    let hasLocationError = false
    const nextRows = { ...rows }
    for (const item of items) {
      const row = rows[item.id]
      if (row?.status === 'si' && row.location.trim() === '') {
        nextRows[item.id] = { ...row, locationError: true }
        hasLocationError = true
      }
    }
    if (hasLocationError) {
      setRows(nextRows)
      return
    }

    resolveReview.mutate(
      { orderId, decisions: buildDecisions() },
      {
        onSuccess: () => setConfirmed(true),
        onError:   err => handleApiError(err),
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      data-testid="inventory-review-modal"
    >
      <Card variant="modal" className="w-full max-w-3xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:pedidos.inventoryReviewModal.title')}
            </h2>
            <p className="text-xs text-slate-500" data-testid="inventory-review-sub">
              {t('bodega:pedidos.inventoryReviewModal.orderNumber')} #{order?.order_number ?? '—'}
              {' · '}{t('bodega:pedidos.inventoryReviewModal.subtitle')}
            </p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !sheet ? (
            <p className="text-slate-400 text-sm py-6 text-center">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm" data-testid="inventory-review-table">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <Th>{t('bodega:pedidos.inventoryReviewModal.columns.item')}</Th>
                      <Th>{t('bodega:pedidos.inventoryReviewModal.columns.location')}</Th>
                      <Th align="right">{t('bodega:pedidos.inventoryReviewModal.columns.quantity')}</Th>
                      <Th>{t('bodega:pedidos.inventoryReviewModal.columns.stockStatus')}</Th>
                      <Th>{t('bodega:pedidos.inventoryReviewModal.columns.foundAt')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map(item => {
                      const row = rows[item.id]
                      const status = row?.status ?? 'pendiente'
                      return (
                        <tr key={item.id} data-testid={`inventory-review-row-${item.id}`}>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{item.description ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{item.location ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{item.qty_requested}</td>
                          <td className="px-3 py-2">
                            <select
                              value={status}
                              onChange={e => handleStatusChange(item.id, e.target.value as StockStatus)}
                              disabled={confirmed}
                              data-testid={`inventory-review-status-${item.id}`}
                              className="text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-primary disabled:opacity-50"
                            >
                              <option value="pendiente">{t('bodega:pedidos.inventoryReviewModal.stockStatus.pending')}</option>
                              <option value="si">{t('bodega:pedidos.inventoryReviewModal.stockStatus.yes')}</option>
                              <option value="no">{t('bodega:pedidos.inventoryReviewModal.stockStatus.no')}</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {status === 'si' ? (
                              <>
                                <input
                                  type="text"
                                  value={row?.location ?? ''}
                                  onChange={e => handleLocationChange(item.id, e.target.value)}
                                  disabled={confirmed}
                                  placeholder={t('bodega:pedidos.inventoryReviewModal.foundAtPlaceholder')}
                                  data-testid={`inventory-review-location-${item.id}`}
                                  className={[
                                    'w-full text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none disabled:opacity-50',
                                    row?.locationError || itemErrors[item.id]
                                      ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                                      : 'border-slate-200 dark:border-slate-600 focus:border-primary',
                                  ].join(' ')}
                                />
                                {row?.locationError && (
                                  <p className="text-red-600 text-[11px] mt-1" data-testid={`inventory-review-location-error-${item.id}`}>
                                    {t('bodega:pedidos.inventoryReviewModal.foundAtRequired')}
                                  </p>
                                )}
                                {!row?.locationError && itemErrors[item.id] && (
                                  <p className="text-red-600 text-[11px] mt-1" data-testid={`inventory-review-location-error-${item.id}`}>
                                    {itemErrors[item.id]}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!confirmed && generalError && (
                <p className="text-red-600 text-xs mb-2" data-testid="inventory-review-general-error">{generalError}</p>
              )}

              {confirmed && (
                <div
                  className="border-t border-slate-100 dark:border-slate-700 pt-3 text-sm text-emerald-700 dark:text-emerald-400"
                  data-testid="inventory-review-confirmed-banner"
                >
                  {t('bodega:pedidos.inventoryReviewModal.confirmed')}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          {!confirmed && (
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isLoading || resolveReview.isPending}
              loading={resolveReview.isPending}
              data-testid="inventory-review-confirm"
            >
              {t('bodega:pedidos.inventoryReviewModal.confirm')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
