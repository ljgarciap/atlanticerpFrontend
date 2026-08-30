import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeamMembersByRole, useConsolidatedPicking } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPrinter } from '@/components/icons'

interface Props {
  /** Nombres (ya resueltos server-side como "first_name last_name", mismo criterio que
   * `OrderBoardService::fullName()`) de los pickers con al menos un pedido `en_picking` AHORA
   * MISMO (RN1) — derivado por el caller del universo completo del tablero
   * (`useOrdersBoardOptions`, sin filtros de UI aplicados), no de un endpoint nuevo. */
  activePickerNames: string[]
  onClose: () => void
}

/**
 * SCRUM-391 (REQ-321) — "Imprimir picking del día": consolidado de todo lo que un picker tiene
 * que recoger hoy, agrupado por artículo (`PickingConsolidationService`, ya suma cantidades y
 * lista los pedidos de origen — el frontend solo renderiza).
 *
 * RN1 — chip único a la vez (nunca "todos" simultáneo).
 * RN2 — de solo consulta/impresión, sin inputs de cantidad.
 * RN3 — sin disparador de "oleadas": refleja el momento en que se abre, nada más.
 *
 * Gap de contrato conocido (no corregible en este frontend, backend ya cerrado con Senior
 * Review): `OrderCard`/el tablero solo expone `picker` (nombre), nunca `picker_id` — pero
 * `GET /bodega/orders/consolidated-picking` exige `picker_id` entero. Se resuelve cruzando el
 * nombre contra `useTeamMembersByRole('picker', ...)` (`GET /bodega/team-members?role=picker`),
 * que sí trae id+nombre de los Pickers reales — mismo criterio de "no inventar un endpoint nuevo"
 * que pidió la spec (el endpoint ya existe para este propósito exacto, agregado por el fix de
 * regresión cruzada de 2026-07-28). Fix de regresión cruzada (2026-07-28, hallazgo adicional
 * durante el fix de SCRUM-396/399/383): esta pantalla cruzaba antes contra `bodegaApi.home.team()`
 * (`/bodega/home/team`), que al restringirse a solo Asistentes (SCRUM-366) devolvía `data: []`
 * acá siempre — ningún chip de picker podía resolver id, sin importar el permiso del actor. El
 * comentario viejo documentaba una limitación distinta (actor sin `view_team`) que sigue existiendo
 * como comportamiento correcto (decisión de producto, Luis 2026-07-24) pero ya no es la única causa
 * de lista vacía — con el endpoint por rol, un actor CON `view_team` vuelve a resolver los ids.
 */
export default function ConsolidatedPickingModal({ activePickerNames, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: team } = useTeamMembersByRole('picker', true)
  const [selectedPickerId, setSelectedPickerId] = useState<number | null>(null)

  const pickerChips = (team?.data ?? []).filter(m => activePickerNames.includes(m.name))
  const { data: consolidated, isLoading } = useConsolidatedPicking(selectedPickerId)
  const selectedPickerName = pickerChips.find(p => p.id === selectedPickerId)?.name ?? null

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Visual Reviewer CRÍTICO (mockup `modalWave`, 3A__Bodega_Pedidos.html) — "Imprimir" debe dejar
  // en la hoja solo el contenido del modal, no el resto de la app. `body.printing-modal` habilita
  // la regla `@media print` de `src/index.css` (patrón "print only this element") mientras el
  // modal está montado.
  useEffect(() => {
    document.body.classList.add('printing-modal')
    return () => document.body.classList.remove('printing-modal')
  }, [])

  const items = consolidated?.items ?? []

  return (
    <div className="print-target fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4 print:block print:bg-white">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] print:max-h-none print:max-w-none print:w-full print:overflow-visible print:border-0 print:shadow-none print:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.pickingModal.title')}
            {selectedPickerName && (
              <span className="hidden print:inline"> — {selectedPickerName}</span>
            )}
          </h2>
          <Button variant="icon" onClick={onClose} className="print:hidden"><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 print:overflow-visible">
          <p className="text-[11px] text-slate-400 mb-3 print:hidden">{t('bodega:pedidos.pickingModal.readOnlyNote')}</p>

          {pickerChips.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center" data-testid="picking-empty-pickers">
              {t('bodega:pedidos.pickingModal.emptyPickers')}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-4 print:hidden" data-testid="picker-chips">
                {pickerChips.map(picker => (
                  <button
                    key={picker.id}
                    onClick={() => setSelectedPickerId(picker.id)}
                    data-testid={`picker-chip-${picker.id}`}
                    className={[
                      'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
                      selectedPickerId === picker.id
                        ? 'bg-primary border-primary text-white'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
                    ].join(' ')}
                  >
                    {picker.name}
                  </button>
                ))}
              </div>

              {selectedPickerId === null ? (
                <p className="text-slate-400 text-sm py-4 text-center">{t('bodega:pedidos.pickingModal.selectPicker')}</p>
              ) : isLoading || !consolidated ? (
                <p className="text-slate-400 text-sm py-4 text-center">{t('common:labels.loading')}</p>
              ) : (
                <>
                  <p className="text-[12px] text-slate-500 mb-2" data-testid="picking-orders-count">
                    {t('bodega:pedidos.pickingModal.ordersCount', { count: consolidated.orders_count })}
                  </p>

                  {items.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">{t('bodega:pedidos.pickingModal.emptyItems')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="picking-items-table">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                            <Th>{t('bodega:pedidos.pickingModal.items.reference')}</Th>
                            <Th>{t('bodega:pedidos.pickingModal.items.description')}</Th>
                            <Th>{t('bodega:pedidos.pickingModal.items.location')}</Th>
                            <Th>{t('bodega:pedidos.pickingModal.items.quantity')}</Th>
                            <Th>{t('bodega:pedidos.pickingModal.items.orders')}</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {items.map((item, i) => (
                            <tr key={item.catalog_product_id ?? `custom-${i}`} data-testid="picking-item-row">
                              <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{item.reference ?? '—'}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.description ?? '—'}</td>
                              <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{item.location ?? '—'}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.qty_requested}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {item.orders.map(o => `${o.order_number} (${o.qty_requested})`).join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0 print:hidden">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          <Button
            variant="secondary"
            onClick={() => window.print()}
            disabled={selectedPickerId === null || items.length === 0}
            className="!flex !items-center !gap-1.5"
          >
            <IcoPrinter size={14} /> {t('bodega:pedidos.pickingModal.print')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
