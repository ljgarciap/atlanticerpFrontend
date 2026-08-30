import { useTranslation } from 'react-i18next'
import PurchaseOrderPaymentsPanel from '@/components/compras/PurchaseOrderPaymentsPanel'
import { IcoClose } from '@/components/icons'
import type { PurchaseOrderDetail } from '@/types/compras'

interface Props {
  order: PurchaseOrderDetail
  onClose: () => void
}

/**
 * SCRUM-736 — "Pagos a Proveedores" salió del bloque principal del detalle de la orden (mockup
 * aprobado no lo muestra inline) sin perder la funcionalidad: mismo `PurchaseOrderPaymentsPanel`
 * (mismos hooks/mutations de src/hooks/useCompras.ts), ahora dentro de un modal.
 *
 * SCRUM-252 (hallazgo de Daniela Amaya 2026-08-09) — el modal se veía cortado: el botón de
 * cerrar estaba posicionado `absolute -top-2 -right-2` (fuera del padding box del contenedor con
 * `overflow-y-auto`), así que quedaba recortado por el propio scroll en vez de flotar visible
 * sobre el contenido. Reestructurado para que el botón viva DENTRO del área con scroll (mismo
 * patrón ya usado en ClaimDetailModal/NewClaimModal — Card con el botón de cerrar como primer
 * hijo, nunca posicionado fuera de los bounds del contenedor que scrollea), y el ancho máximo
 * pasa a ser responsive (`max-w-md` en pantallas chicas, `max-w-2xl` desde `sm:`) para no
 * desbordar en viewports angostos.
 */
export default function PurchaseOrderPaymentsModal({ order, onClose }: Props) {
  const { t } = useTranslation(['common'])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <div className="flex items-center justify-end px-1 pt-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common:actions.close') ?? 'Cerrar'}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shadow-sm"
          >
            <IcoClose size={14} />
          </button>
        </div>
        <PurchaseOrderPaymentsPanel order={order} />
      </div>
    </div>
  )
}
