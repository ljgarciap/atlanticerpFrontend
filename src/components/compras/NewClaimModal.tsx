import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { comprasApi } from '@/api/comprasApi'
import { usePurchaseOrder, useCreateClaim } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import { formatMoney } from '@/lib/money'
import type { PurchaseOrderSummary } from '@/types/compras'

function claimErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

// SCRUM-260 (hallazgo de Gerencia Test 2026-08-10) — "Tipo de resolución" deja de ser texto
// libre, mismas 5 opciones fijas que PurchaseOrderClaim::RESOLUTION_TYPES en el backend.
const RESOLUTION_TYPES = [
  'reposicion', 'nota_credito_favor', 'nota_credito_reembolso', 'envio_repuestos', 'negado',
] as const

interface Props {
  onClose: () => void
  onCreated: () => void
}

/** SCRUM-260 (REQ-197) — buscar la orden afectada, agregar productos, definir resolución esperada. */
export default function NewClaimModal({ onClose, onCreated }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const createClaim = useCreateClaim()

  const [orderSearch, setOrderSearch] = useState('')
  const [orderId, setOrderId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [expectedResolution, setExpectedResolution] = useState('')
  const [selectedLines, setSelectedLines] = useState<Record<number, string>>({})

  const { data: orderResults } = useQuery({
    queryKey: ['compras/orders', 'claim-search', orderSearch],
    queryFn:  () => comprasApi.orders.list({ search: orderSearch, per_page: 5 }),
    enabled:  orderId === null && orderSearch.length > 0,
  })

  const { data: order } = usePurchaseOrder(orderId)

  const pickOrder = (o: PurchaseOrderSummary) => { setOrderId(o.id); setOrderSearch('') }

  const toggleLine = (lineId: number) => {
    setSelectedLines(prev => {
      const next = { ...prev }
      if (lineId in next) delete next[lineId]
      else next[lineId] = '1'
      return next
    })
  }

  // SCRUM-260 (rebote de Gerencia Test 2026-08-12) — "Unidades afectadas" volvía a permitir
  // superar la cantidad pedida: `max={l.quantity}` en el <input type="number"> es solo una
  // afordancia de los botones de incremento/decremento del navegador, NUNCA bloquea un valor
  // tipeado o pegado a mano — y `canSubmit` solo validaba `> 0`, sin comparar contra la cantidad
  // pedida de esa línea. RN2/RN4: el máximo se calcula dinámicamente por producto (la cantidad
  // pedida de esa línea en la orden), y no debe ser posible guardar con un valor inválido aunque
  // se haya tecleado a mano.
  const lineExceedsMax = (lineId: number, value: string): boolean => {
    const line = order?.lines.find(l => l.id === lineId)
    if (!line || value === '') return false
    return Number(value) > line.quantity
  }

  const canSubmit = orderId !== null && Object.keys(selectedLines).length > 0
    && Object.entries(selectedLines).every(([lineId, v]) =>
      v !== '' && Number(v) > 0 && !lineExceedsMax(Number(lineId), v))

  const handleSubmit = () => {
    if (orderId === null) return
    createClaim.mutate({
      purchase_order_id: orderId,
      description: description || null,
      expected_resolution: expectedResolution || null,
      lines: Object.entries(selectedLines).map(([lineId, qty]) => ({
        purchase_order_line_id: Number(lineId),
        affected_quantity: Number(qty),
      })),
    }, { onSuccess: onCreated })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      {/* SCRUM-260 (rebote de Gerencia Test 2026-08-12) — modal chico, insuficiente para el
          buscador de productos: ancho ampliado (max-w-lg → max-w-2xl) y el listado de resultados
          de abajo pasa de `overflow-hidden` (que RECORTABA resultados fuera de vista, invisibles
          sin scroll) a `max-h + overflow-y-auto` real.
          Rebote 2026-08-16: "sigue sintiéndose insuficiente" pese al fix anterior — el ancho ya
          scrollea bien, pero el estado inicial (solo buscador, antes de elegir una orden) tiene
          tan poco contenido que el modal se ve chico igual. Ancho ampliado otro escalón
          (max-w-2xl → max-w-3xl) + alto mínimo en el paso de búsqueda para que no se sienta
          angosto/corto mientras no hay una orden seleccionada todavía. */}
      <Card variant="modal" className="w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-800">{t('compras:claims.new.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IcoClose size={16} />
          </button>
        </div>

        {orderId === null ? (
          <div className="relative mb-4 min-h-[280px]">
            <input
              type="text"
              autoFocus
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              placeholder={t('compras:claims.new.searchOrder') ?? ''}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            {orderResults && orderResults.data.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100">
                {orderResults.data.map(o => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => pickOrder(o)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      #{o.id} — {o.provider_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 p-2 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium">#{order?.id} — {order?.provider_name}</span>
              <button onClick={() => setOrderId(null)} className="text-xs text-primary hover:underline">
                {t('common:actions.change')}
              </button>
            </div>

            {/* SCRUM-261 (REQ-198) — el módulo Servicios no existe todavía (alcance reducido
                acordado con Luis), así que nunca hay tickets para vincular. El único criterio
                de aceptación hoy es mostrar este aviso, no un selector vacío. */}
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:claims.new.serviceTicket')}</p>
            <p className="text-sm text-slate-400 mb-4">{t('compras:claims.new.noServiceTickets')}</p>

            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:claims.new.products')}</p>
            <ul className="flex flex-col gap-1.5 mb-4">
              {order?.lines.map(l => {
                const qty = Number(selectedLines[l.id] || 0)
                const disputedAmount = qty * l.unit_cost

                return (
                  <li key={l.id} className="flex flex-col gap-1.5 bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={l.id in selectedLines}
                        onChange={() => toggleLine(l.id)}
                      />
                      <span className="flex-1 text-sm">{l.description}</span>
                    </div>
                    {l.id in selectedLines && (
                      <div className="pl-6 flex flex-wrap items-end gap-x-4 gap-y-1">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-slate-500">{t('compras:claims.new.affectedQuantity')}</span>
                          <input
                            type="number" min={1} max={l.quantity}
                            value={selectedLines[l.id]}
                            onChange={e => setSelectedLines(prev => ({ ...prev, [l.id]: e.target.value }))}
                            className={`w-20 px-2 py-1 border rounded text-sm ${
                              lineExceedsMax(l.id, selectedLines[l.id]) ? 'border-red-400' : 'border-slate-300'
                            }`}
                          />
                          <span className="text-[11px] text-slate-400">
                            {t('compras:claims.new.unitsOrderedNote', { qty: l.quantity })}
                          </span>
                          {lineExceedsMax(l.id, selectedLines[l.id]) && (
                            <span className="text-[11px] text-red-600">
                              {t('compras:claims.new.maxExceeded', { max: l.quantity })}
                            </span>
                          )}
                        </label>
                        <div className="text-sm">
                          <span className="text-[11px] text-slate-500 block">{t('compras:claims.new.disputedAmount')}</span>
                          <span className="font-semibold">${formatMoney(disputedAmount)}</span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder={t('compras:claims.new.description') ?? ''}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
              rows={2}
            />
            <label className="flex flex-col gap-1 mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.new.expectedResolution')}</span>
              <select
                value={expectedResolution}
                onChange={e => setExpectedResolution(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">{t('compras:claims.new.expectedResolutionPlaceholder')}</option>
                {RESOLUTION_TYPES.map(r => (
                  <option key={r} value={r}>{t(`compras:claims.resolutionTypes.${r}`)}</option>
                ))}
              </select>
            </label>

            {createClaim.isError && (
              <p className="text-xs text-red-600 mb-3">
                {claimErrorMessage(createClaim.error, t('compras:claims.new.error'))}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
              <Button disabled={!canSubmit} loading={createClaim.isPending} onClick={handleSubmit}>
                {t('common:actions.save')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
