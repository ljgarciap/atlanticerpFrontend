import { useTranslation } from 'react-i18next'
import { useInventoryWarehouseStock } from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  productId: number
  onClose:   () => void
}

/**
 * SCRUM-244 (REQ-181, rebote de Daniela Amaya 2026-08-16): el clic en "N Bodegas" abría
 * `ProductDetailModal` completo — la sección "Bodega" existe ahí, pero recién más abajo del
 * modal general, así que quien clickea puntualmente el badge de bodegas termina en el modal
 * "equivocado" (Detalle del producto en vez de Detalle por bodega). Modal dedicado y compacto,
 * mismo patrón que `OrderItemWarehousesModal.tsx` (Bodega/Pedidos) pero sobre el endpoint propio
 * de Compras (`GET /compras/inventory/{id}/warehouse-stock`, ya existente — `ProductDetailModal`
 * sigue usándolo también para su propia sección "Bodega", sin tocar ese camino).
 */
export default function WarehouseStockModal({ productId, onClose }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const { data: warehouseStock, isLoading } = useInventoryWarehouseStock(productId)

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('compras:inventory.warehouseStock.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        {isLoading ? (
          <p className="text-slate-400 text-sm py-4">{t('common:labels.loading')}</p>
        ) : (
          <ul className="text-sm mb-2">
            {(warehouseStock?.data ?? []).map(w => (
              <li key={w.warehouse_id} className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-700">{w.warehouse_name}</span>
                <span className="font-semibold text-slate-900">{w.quantity}</span>
              </li>
            ))}
            {warehouseStock && warehouseStock.data.length === 0 && (
              <li className="text-slate-400 text-xs py-2 text-center">{t('compras:inventory.warehouseStock.empty')}</li>
            )}
          </ul>
        )}

        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onClose}>{t('compras:inventory.actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
