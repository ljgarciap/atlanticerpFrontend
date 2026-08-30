import type { TFunction } from 'i18next'

/**
 * REQ-274 RN3 (Servicios, SCRUM-344) — Pre-QA 2026-08-13: `origin_module` ya viajaba desde el
 * backend en `PurchaseOrderSummary`/`PurchaseOrderDetail` pero nunca se pintaba en Ver Órdenes ni
 * en el detalle — Yirena no tenía forma real de "diferenciar" una solicitud de Servicios del
 * resto (RN3 explícita del ticket). Solo se renderiza para `origin_module === 'servicios'` (único
 * origen automático hoy, ver `PurchaseOrder::ORIGIN_SERVICIOS`) — el resto de órdenes (creadas a
 * mano en Compras o desde Ventas & Diseño) no lleva badge, mismo criterio que "Origen: Servicios"
 * del acceptance criteria (Escenario 1 de REQ-274) nunca pidió distinguir esos otros orígenes.
 */
export function OriginBadge({ originModule, t }: { originModule: 'servicios' | null; t: TFunction }) {
  if (originModule !== 'servicios') return null

  return (
    <span className="text-xs px-2 py-1 rounded-full font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 whitespace-nowrap">
      {t('compras:orders.originServicios')}
    </span>
  )
}
