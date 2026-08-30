import { useTranslation } from 'react-i18next'
import { useZonaLibreProductWarehouseBreakdown } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  productName:       string
  catalogProductId:  number
  onClose:           () => void
}

/**
 * SCRUM-437 (REQ-367) — modal "Ver bodegas" del buscador de productos de Zona Libre de Colón (3C).
 * A diferencia de `OrderItemWarehousesModal` (que recibe la data ya resuelta a nivel de TODO un
 * pedido, una sola llamada por pedido), acá es producto-scoped e independiente de que exista una
 * orden — pide su propio endpoint al abrirse (`GET /bodega/inventory/{id}/warehouse-breakdown`),
 * ya filtrado a `quantity > 0` por el backend (RN1), sin filtro adicional client-side necesario.
 */
export default function ZonaLibreWarehousesModal({ productName, catalogProductId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useZonaLibreProductWarehouseBreakdown(catalogProductId)
  const warehouses = data?.data ?? []

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{productName}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('bodega:zonaLibre.warehousesModal.subtitle')}</p>

        {isLoading ? (
          <p className="text-slate-400 text-sm py-4">{t('common:labels.loading')}</p>
        ) : (
          <ul className="text-sm mb-2" data-testid="zl-warehouses-list">
            {warehouses.map(w => (
              <li key={w.warehouse_id} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-200">{w.name}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{w.quantity}</span>
              </li>
            ))}
            {warehouses.length === 0 && (
              <li className="text-slate-400 text-xs py-2 text-center">{t('bodega:zonaLibre.warehousesModal.empty')}</li>
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
