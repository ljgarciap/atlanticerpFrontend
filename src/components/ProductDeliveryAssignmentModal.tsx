import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PipelineCardProductDeliveryRow, PipelineCardProductDeliveryAssignmentPayload } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  cardId:         number
  deliveryDates:  string[]
  canEdit:        boolean
  onClose:        () => void
  /** SCRUM-1027 — modo edición del proyecto: las fechas del borrador todavía no existen en BD,
   *  así que "Guardar" NO llama a la API; devuelve las selecciones al formulario padre, que las
   *  envía junto con el resto de la edición en un solo guardado. Sin esta prop, comportamiento
   *  de siempre (guarda directo contra el endpoint). */
  onSaveDraft?:   (assignments: PipelineCardProductDeliveryAssignmentPayload[]) => void
  /** Borrador previo (`quote_item_id → fecha`) para reabrir el modal sin perder lo ya elegido. */
  initialDraft?:  PipelineCardProductDeliveryAssignmentPayload[] | null
}

/** Estado local por producto — `Record<quote_item_id, delivery_date | ''>`. Se inicializa una
 *  única vez por apertura de modal (mismo patrón que `PickingSheetModal.buildInitialRows`): si
 *  el ítem ya tenía una fecha asignada, se respeta; si no, se precarga `suggested_delivery_date`
 *  (calculado por el backend — disponible < pedido o disponible === 0 → fecha más lejana, ver
 *  `ProductDeliveryService::listForCard()`) — el usuario puede cambiarla libremente después, no
 *  queda bloqueado (criterio 3). Una sola fuente de verdad para el criterio de "falta de
 *  inventario": el frontend no lo recalcula. */
function buildInitialSelections(rows: PipelineCardProductDeliveryRow[]): Record<number, string> {
  const selections: Record<number, string> = {}
  for (const row of rows) {
    selections[row.quote_item_id] = row.assigned_delivery_date ?? row.suggested_delivery_date ?? ''
  }
  return selections
}

export default function ProductDeliveryAssignmentModal({ cardId, deliveryDates, canEdit, onClose, onSaveDraft, initialDraft }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const validDates = deliveryDates.filter(Boolean)

  const isDraftMode = onSaveDraft !== undefined

  // En modo borrador la sugerencia de fecha se calcula sobre las fechas sin guardar, así que la
  // query lleva su propia key (no comparte caché con la lista del estado ya guardado).
  const { data: rows, isLoading, isFetching } = useQuery({
    queryKey: isDraftMode
      ? ['ventas-diseno-pipeline-card-product-delivery-assignments-draft', cardId, validDates]
      : ['ventas-diseno-pipeline-card-product-delivery-assignments', cardId],
    queryFn:  () => ventasDisenoApi.pipeline.productDeliveryAssignments.list(cardId, isDraftMode ? validDates : undefined),
    // SCRUM-1027 (Pre-QA) — el modal siembra `selections` una sola vez con la primera data que ve;
    // con el staleTime global (30 s) y gcTime por defecto, reabrirlo en la misma sesión (2ª edición,
    // sin recargar) servía las filas cacheadas de ANTES de guardar (sugerencias en vez de lo ya
    // asignado) y guardar pisaba las asignaciones reales. En modo borrador no se cachea nada: se
    // descarta al cerrar el modal y cada apertura trae el estado fresco del servidor.
    ...(isDraftMode ? { gcTime: 0, staleTime: 0, refetchOnMount: 'always' as const } : {}),
  })

  const [selections, setSelections] = useState<Record<number, string>>({})
  const [initialized, setInitialized] = useState(false)

  // Igual criterio que PickingSheetModal — se siembra una única vez cuando llegan los datos,
  // para no pisar selecciones en vivo del usuario ante un refetch de fondo.
  useEffect(() => {
    // `!isFetching`: nunca sembrar con filas cacheadas mientras el refetch de apertura sigue en
    // curso (ver comentario de la query) — sembrar con data vieja y luego no volver a sembrar es
    // exactamente el defecto de la 2ª edición.
    if (!initialized && rows && !isFetching) {
      const seeded = buildInitialSelections(rows)
      // Un borrador previo manda sobre lo guardado/sugerido, pero solo si su fecha sigue
      // existiendo entre las fechas actuales del formulario.
      for (const d of initialDraft ?? []) {
        if (d.quote_item_id in seeded) seeded[d.quote_item_id] = d.delivery_date && validDates.includes(d.delivery_date) ? d.delivery_date : ''
      }
      setSelections(seeded)
      setInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, initialized, isFetching])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const [saveError, setSaveError] = useState<string | null>(null)
  const buildAssignments = (): PipelineCardProductDeliveryAssignmentPayload[] =>
    Object.entries(selections).map(([quoteItemId, date]) => ({
      quote_item_id: Number(quoteItemId),
      delivery_date:  date || null,
    }))

  const saveMutation = useMutation({
    mutationFn: () => ventasDisenoApi.pipeline.productDeliveryAssignments.save(cardId, buildAssignments()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card-product-delivery-assignments', cardId] })
      onClose()
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setSaveError(message ?? t('ventasDiseno:modal.productAssignment.saveError'))
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-3xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:modal.productAssignment.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || (!initialized && rows !== undefined) ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : !rows || rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t('ventasDiseno:modal.productAssignment.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-2">{t('ventasDiseno:modal.productAssignment.code')}</th>
                    <th className="py-2 pr-2">{t('ventasDiseno:modal.productAssignment.name')}</th>
                    <th className="py-2 pr-2">{t('ventasDiseno:modal.productAssignment.ordered')}</th>
                    <th className="py-2 pr-2">{t('ventasDiseno:modal.productAssignment.available')}</th>
                    <th className="py-2 pr-2">{t('ventasDiseno:modal.productAssignment.dateAssignment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.quote_item_id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{row.code}</td>
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{row.name}</td>
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{row.quantity_ordered}</td>
                      <td className={`py-2 pr-2 ${row.quantity_available !== null && row.quantity_available < row.quantity_ordered ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}>
                        {row.quantity_available ?? '—'}
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={selections[row.quote_item_id] ?? ''}
                          disabled={!canEdit || saveMutation.isPending}
                          onChange={e => setSelections(s => ({ ...s, [row.quote_item_id]: e.target.value }))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="">{t('ventasDiseno:modal.productAssignment.unassigned')}</option>
                          {validDates.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {saveError && (
            <div className="mt-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
            {t('common:actions.close')}
          </Button>
          {canEdit && rows && rows.length > 0 && (
            <Button
              onClick={() => {
                if (onSaveDraft) { onSaveDraft(buildAssignments()); onClose() } else saveMutation.mutate()
              }}
              disabled={saveMutation.isPending}
              loading={saveMutation.isPending}
            >
              {t('common:actions.save')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
