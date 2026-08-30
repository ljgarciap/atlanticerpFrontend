import { useTranslation } from 'react-i18next'
import type { OrderWarehouseBreakdownResponse } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  /** Referencia pública del artículo, solo para el título del modal. */
  reference:          string | null
  catalogProductId:   number
  breakdown:          OrderWarehouseBreakdownResponse | undefined
  isLoading:          boolean
  onClose:            () => void
}

/**
 * SCRUM-403 (REQ-333) — modal "Ver bodegas" de un artículo puntual dentro del pedido. La data ya
 * llega resuelta desde `OrderDetailModal` (una sola llamada a nivel de todo el pedido, ver
 * `useOrderWarehouseBreakdown` — evita N requests al abrir el modal, una por fila).
 *
 * RN1 — "solo muestra las bodegas donde el producto tiene stock registrado, sin inventar
 * cantidades donde no hay dato": el backend (`WarehouseStockService::breakdownForProducts()`)
 * SIEMPRE devuelve una fila por CADA bodega física, con `quantity: 0` para las que no tienen
 * stock de este producto — a diferencia del modal "Bodega(s)" de Ver Inventario (REQ-353,
 * `BodegaInventarioPage.tsx`, que sí lista todas incluyendo ceros por su propio criterio), acá el
 * filtro a `quantity > 0` es explícito en el frontend porque el criterio de aceptación de ESTE
 * ticket lo pide así — no es un descuido, es una decisión distinta entre 2 tickets similares.
 */
export default function OrderItemWarehousesModal({ reference, catalogProductId, breakdown, isLoading, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])

  const product = breakdown?.products[catalogProductId]
  const warehouses = (product?.warehouses ?? []).filter(w => w.quantity > 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.warehousesModal.title', { reference: reference ?? '—' })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        {isLoading ? (
          <p className="text-slate-400 text-sm py-4">{t('common:labels.loading')}</p>
        ) : (
          <ul className="text-sm mb-2" data-testid="warehouses-list">
            {warehouses.map(w => (
              <li key={w.warehouse_id} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-200">{w.name}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{w.quantity}</span>
              </li>
            ))}
            {warehouses.length === 0 && (
              <li className="text-slate-400 text-xs py-2 text-center">{t('bodega:pedidos.warehousesModal.empty')}</li>
            )}
          </ul>
        )}

        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
