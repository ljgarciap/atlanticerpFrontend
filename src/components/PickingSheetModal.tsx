import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import {
  useOrderDetail, useOrderPickingSheet, useUpdatePickingSheet, useCompletePicking, useExportPickingSheetExcel,
} from '@/hooks/useBodega'
import type { PickingSheetItem, PickingSheetItemPayload } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPencil, IcoDownload, IcoPrinter, IcoCheck } from '@/components/icons'

interface Props {
  orderId: number
  onClose: () => void
}

/** Estado local por artículo — "Recogido" es puramente de UI (RN de REQ-316, el backend no tiene
 * una columna dedicada, ver docblock de `PickingService::completePicking()`); "editing" gatea el
 * input de "Alistada" detrás de un botón "Editar" (RN2 de REQ-315). `notes`/`notesError` — Pre-QA
 * 2026-07-27: "Observación" es texto libre, sin el gate de pencil-icon de "Alistada" (no hay razón
 * de negocio para esconderla detrás de un botón), solo el gate ya existente de "editable" (stage
 * = En picking) que ya aplica a todo el formulario. */
interface RowState {
  recogido:   boolean
  qtyPicked:  number
  editing:    boolean
  notes:      string
  notesError: string | null
}

function buildInitialRows(items: PickingSheetItem[]): Record<number, RowState> {
  const rows: Record<number, RowState> = {}
  for (const item of items) {
    rows[item.id] = {
      recogido:  false,
      // Mismo criterio que el mockup (`3A__Bodega_Pedidos.html #modalPicking`): arranca en lo
      // pedido (se asume que se recoge todo, el picker reduce si sale parcial) salvo que ya
      // hubiera un valor guardado de una edición anterior (reabrir la hoja a medio camino).
      qtyPicked:  item.qty_picked > 0 ? item.qty_picked : item.qty_requested,
      editing:    false,
      notes:      item.picking_notes ?? '',
      notesError: null,
    }
  }
  return rows
}

/**
 * SCRUM-385/386 (REQ-315/316) — Hoja de Picking. Metadata del pedido reusa `useOrderDetail`
 * (mismo `OrderCard`+detalle ya consumido por `OrderDetailModal`/`GuiaEntregaModal`) — el
 * endpoint de la hoja (`GET .../picking-sheet`) solo devuelve `order_id`/`editable`/`items`, sin
 * datos de cliente/vendedor/etc (ver `OrderPickingController::pickingSheet()` real).
 *
 * "Ref. fábrica" y "Observación" (Pre-QA 2026-07-27) — ver docblock de `PickingSheetItem` en
 * `types/bodega.ts` para el detalle del backend que las respalda.
 */
export default function PickingSheetModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order } = useOrderDetail(orderId)
  const { data: sheet, isLoading } = useOrderPickingSheet(orderId)
  const updateSheet = useUpdatePickingSheet()
  const completePicking = useCompletePicking()
  const exportMutation = useExportPickingSheetExcel()

  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [rowsInitialized, setRowsInitialized] = useState(false)
  const [completadoError, setCompletadoError] = useState<string | null>(null)
  const [completedResult, setCompletedResult] = useState<{ hasReview: boolean; reviewOrderNumber: string | null } | null>(null)

  const items = useMemo(() => sheet?.items ?? [], [sheet])
  const editable = sheet?.editable ?? false

  // Los ítems llegan una sola vez por apertura de modal — se inicializa el estado local solo la
  // primera vez que `items` deja de estar vacío (evita pisar ediciones en vivo del usuario si la
  // query se revalida de fondo, ej. tras una mutación de OTRO ítem).
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

  // Mismo patrón "imprimir solo el modal" que `ConsolidatedPickingModal.tsx`/`GuiaEntregaModal.tsx`.
  useEffect(() => {
    document.body.classList.add('printing-modal')
    return () => document.body.classList.remove('printing-modal')
  }, [])

  function handleEnableEdit(itemId: number) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], editing: true } }))
  }

  function handleQtyChange(item: PickingSheetItem, raw: string) {
    let qty = Number(raw)
    if (Number.isNaN(qty) || qty < 0) qty = 0
    if (qty > item.qty_requested) qty = item.qty_requested
    setRows(r => ({ ...r, [item.id]: { ...r[item.id], qtyPicked: qty } }))
  }

  function handleQtyBlur(item: PickingSheetItem) {
    const row = rows[item.id]
    if (!row) return
    updateSheet.mutate({ orderId, items: [{ order_item_id: item.id, qty_picked: row.qtyPicked, picking_notes: row.notes }] })
  }

  function handleRecogidoChange(itemId: number, checked: boolean) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], recogido: checked } }))
  }

  function handleNotesChange(itemId: number, value: string) {
    setRows(r => ({ ...r, [itemId]: { ...r[itemId], notes: value, notesError: null } }))
  }

  // Backend valida `items.*.picking_notes` con `nullable|string|max:500` — se persiste al salir
  // del campo (mismo patrón que `handleQtyBlur`), mostrando el 422 real inline si se supera el
  // límite en vez de truncar en silencio.
  function handleNotesBlur(item: PickingSheetItem) {
    const row = rows[item.id]
    if (!row) return
    updateSheet.mutate(
      { orderId, items: [{ order_item_id: item.id, qty_picked: row.qtyPicked, picking_notes: row.notes }] },
      {
        onError: err => {
          const message = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
            ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
            : undefined
          setRows(r => ({ ...r, [item.id]: { ...r[item.id], notesError: message ?? t('bodega:pedidos.pickingSheetModal.notesFailed') } }))
        },
      },
    )
  }

  function buildPayload(): PickingSheetItemPayload[] {
    return items.map(item => ({ order_item_id: item.id, qty_picked: rows[item.id]?.qtyPicked ?? item.qty_picked }))
  }

  // SCRUM-386 (REQ-316 RN1) — valida que TODOS los artículos estén marcados "Recogido" antes de
  // permitir completar. Sin `window.confirm`/`window.alert` (rompe QA automatizado, ver memoria
  // del proyecto) — el error se muestra inline, igual que el resto de validaciones del batch.
  function handleCompletadoChange(checked: boolean) {
    setCompletadoError(null)
    if (!checked) return

    const faltantes = items.filter(item => !rows[item.id]?.recogido)
    if (faltantes.length > 0) {
      setCompletadoError(t('bodega:pedidos.pickingSheetModal.missingRecogido', { count: faltantes.length }))
      return
    }

    completePicking.mutate(
      { orderId, items: buildPayload() },
      {
        onSuccess: result => {
          setCompletedResult({
            hasReview: result.review !== null,
            reviewOrderNumber: result.review?.order_number ?? null,
          })
        },
        onError: err => {
          const backendMessage = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
            ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
            : undefined
          setCompletadoError(backendMessage ?? t('bodega:pedidos.pickingSheetModal.completeFailed'))
        },
      },
    )
  }

  function handleExportExcel() {
    if (!order) return
    exportMutation.mutate(orderId, {
      onSuccess: blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `hoja-picking-${order.order_number}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      },
    })
  }

  return (
    <div className="print-target fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4 print:block print:bg-white" data-testid="picking-sheet-modal">
      <Card variant="modal" className="w-full max-w-3xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] print:max-h-none print:max-w-none print:w-full print:overflow-visible print:border-0 print:shadow-none print:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:pedidos.pickingSheetModal.title')}
            </h2>
            <p className="text-xs text-slate-500" data-testid="picking-sheet-sub">
              {t('bodega:pedidos.pickingSheetModal.orderNumber')} #{order?.order_number ?? '—'}
              {!editable && (
                <span className="text-primary-dark dark:text-primary font-semibold">
                  {' · '}{t('bodega:pedidos.pickingSheetModal.readOnly')}
                </span>
              )}
            </p>
          </div>
          <Button variant="icon" onClick={onClose} className="print:hidden"><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 print:overflow-visible">
          {isLoading || !order || !sheet ? (
            <p className="text-slate-400 text-sm py-6 text-center">{t('common:labels.loading')}</p>
          ) : (
            <>
              {/* SCRUM-385 (REQ-315, corrección 2026-08-11) — 2 columnas EXPLÍCITAS (no un grid de
                  auto-flow que intercala campos de ambas), cada una alineada/justificada a la
                  izquierda: columna izquierda = identidad del cliente (Cliente Master, Subcliente,
                  Proyecto, Entrega al Cliente); columna derecha = datos operativos del picking
                  (Generado, Asignado a Picking, Asistente de Bodega, Vendedor). El campo combinado
                  "Cliente / Proyecto" se elimina — 3 campos independientes en su lugar. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-4 text-sm">
                <div className="flex flex-col gap-2 text-left" data-testid="picking-sheet-meta-left">
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.clienteMaster')} value={order.cliente_master} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.subcliente')} value={order.subcliente ?? order.cliente} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.proyecto')} value={order.proyecto} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.entregaCliente')} value={order.direccion_entrega} />
                </div>
                <div className="flex flex-col gap-2 text-left" data-testid="picking-sheet-meta-right">
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.generated')} value={new Date().toLocaleString()} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.picker')} value={order.picker} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.assistant')} value={order.asistente} />
                  <MetaField label={t('bodega:pedidos.pickingSheetModal.meta.seller')} value={order.vendedor} />
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('bodega:pedidos.pickingSheetModal.itemsTitle')}
                  <span className="font-normal text-slate-400"> {t('bodega:pedidos.pickingSheetModal.itemsOrderedByLocation')}</span>
                </p>
                <Button
                  variant="outline"
                  className="!text-[11px] !px-2 !py-1 !flex !items-center !gap-1.5 print:hidden"
                  onClick={handleExportExcel}
                  disabled={exportMutation.isPending}
                  loading={exportMutation.isPending}
                >
                  <IcoDownload size={12} /> {t('bodega:pedidos.pickingSheetModal.downloadExcel')}
                </Button>
              </div>

              <div className="overflow-x-auto mb-4">
                {/* SCRUM-385 (rebote de Gerencia Test 2026-08-13, con imagen) — la corrección
                    anterior (2026-08-11) repartía el ancho como PORCENTAJES de `w-full`: dentro
                    del modal (max-w-3xl, ~768px) esos porcentajes daban columnas más angostas que
                    el contenido de ancho fijo que llevan adentro (el input de "Alistada" es
                    `w-20`=80px, el de "Observación" `w-40`=160px, más el ícono de editar e
                    íconos/padding) — `table-fixed` no permite que la celda crezca para
                    acomodarlos, así que el contenido se salía de su celda y se montaba visualmente
                    sobre la columna vecina (RECOGIDO/ARTÍCULO, UBICACIÓN/ENCONTRADO EN,
                    ALISTADA/OBSERVACIÓN — exactamente lo reportado). Fix real (Opción B del
                    ticket): anchos en PX fijos que sí alcanzan para el contenido de cada columna,
                    sin `w-full` — el `<table>` mide más que el contenedor del modal, y el
                    `overflow-x-auto` de este div (ya existía) recién ahí tiene sentido: scroll
                    horizontal real en vez de compresión imposible. RN1 (las 9 columnas se leen sin
                    superposición) queda garantizado por construcción, independiente del ancho del
                    modal. */}
                <table className="min-w-[1180px] text-sm table-fixed" data-testid="picking-sheet-table">
                  <colgroup>
                    <col className="w-[56px]" />
                    <col className="w-[220px]" />
                    <col className="w-[110px]" />
                    <col className="w-[110px]" />
                    <col className="w-[110px]" />
                    <col className="w-[150px]" />
                    <col className="w-[80px]" />
                    <col className="w-[150px]" />
                    <col className="w-[200px]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.recogido')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.item')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.factoryRef')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.publicRef')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.location')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.foundAt')}</Th>
                      <Th align="right">{t('bodega:pedidos.pickingSheetModal.columns.requested')}</Th>
                      <Th align="right">{t('bodega:pedidos.pickingSheetModal.columns.picked')}</Th>
                      <Th>{t('bodega:pedidos.pickingSheetModal.columns.observations')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map(item => {
                      const row = rows[item.id]
                      return (
                        <tr key={item.id} data-testid={`picking-row-${item.id}`}>
                          <td className="px-3 py-2">
                            {editable ? (
                              <input
                                type="checkbox"
                                checked={row?.recogido ?? false}
                                onChange={e => handleRecogidoChange(item.id, e.target.checked)}
                                data-testid={`picking-recogido-${item.id}`}
                              />
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400"><IcoCheck size={14} /></span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{item.description ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.factory_reference ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.reference ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{item.location ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400" data-testid={`picking-found-note-${item.id}`}>
                            {item.found_note ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{item.qty_requested}</td>
                          <td className="px-3 py-2 text-right">
                            {!editable ? (
                              <strong>{item.qty_picked}</strong>
                            ) : row?.editing ? (
                              <input
                                type="number"
                                min={0}
                                max={item.qty_requested}
                                value={row.qtyPicked}
                                onChange={e => handleQtyChange(item, e.target.value)}
                                onBlur={() => handleQtyBlur(item)}
                                data-testid={`picking-alistada-input-${item.id}`}
                                className="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-right bg-white dark:bg-slate-800"
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span data-testid={`picking-alistada-locked-${item.id}`}>{row?.qtyPicked ?? item.qty_requested}</span>
                                <button
                                  type="button"
                                  onClick={() => handleEnableEdit(item.id)}
                                  data-testid={`picking-edit-btn-${item.id}`}
                                  className="text-slate-400 hover:text-primary"
                                  title={t('common:actions.edit')}
                                >
                                  <IcoPencil size={12} />
                                </button>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {editable ? (
                              <>
                                <input
                                  type="text"
                                  maxLength={500}
                                  value={row?.notes ?? ''}
                                  onChange={e => handleNotesChange(item.id, e.target.value)}
                                  onBlur={() => handleNotesBlur(item)}
                                  data-testid={`picking-notes-input-${item.id}`}
                                  className={[
                                    'w-40 text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
                                    row?.notesError ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
                                  ].join(' ')}
                                />
                                {row?.notesError && (
                                  <p className="text-red-600 text-[11px] mt-1" data-testid={`picking-notes-error-${item.id}`}>
                                    {row.notesError}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">{item.picking_notes ?? '—'}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {editable && !completedResult && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={e => handleCompletadoChange(e.target.checked)}
                      disabled={completePicking.isPending}
                      data-testid="picking-completado-checkbox"
                    />
                    {t('bodega:pedidos.pickingSheetModal.completedBy', { name: order.picker ?? '—' })}
                  </label>
                  {completadoError && (
                    <p className="text-red-600 text-xs mt-1" data-testid="picking-completado-error">{completadoError}</p>
                  )}
                </div>
              )}

              {completedResult && (
                <div
                  className="border-t border-slate-100 dark:border-slate-700 pt-3 text-sm text-emerald-700 dark:text-emerald-400"
                  data-testid="picking-completed-banner"
                >
                  {completedResult.hasReview
                    ? t('bodega:pedidos.pickingSheetModal.completedWithReview', { number: completedResult.reviewOrderNumber })
                    : t('bodega:pedidos.pickingSheetModal.completedFull')}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0 print:hidden">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="!flex !items-center !gap-1.5"
          >
            <IcoPrinter size={14} /> {t('bodega:pedidos.pickingSheetModal.print')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 dark:border-slate-700/50 pb-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200 text-right">{value ?? '—'}</span>
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
