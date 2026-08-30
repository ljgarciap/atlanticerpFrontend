import type { TFunction } from 'i18next'

/**
 * SCRUM-204 (REQ-141, 2026-08-06 — hallazgo Daniela Amaya): "Pendiente/Por liquidar" es un único
 * estado interno (`PurchaseOrder::STATUS_PENDIENTE_LIQUIDAR`), pero el texto mostrado depende de
 * la modalidad de la orden — "Pendiente" para Directo, "Por liquidar" para Zona Libre. `modality`
 * es `undefined` en contextos sin una orden puntual (ej. un <select> de filtro con todos los
 * estados posibles) — ahí se usa el texto combinado neutral ya existente.
 */
export function orderStatusLabel(t: TFunction, status: string, modality?: string | null): string {
  if (status !== 'pendiente_liquidar' || modality === undefined) {
    return t(`compras:orders.status.${status}`)
  }
  return modality === 'zona_libre'
    ? t('compras:orders.status.pendienteLiquidarZonaLibre')
    : t('compras:orders.status.pendienteLiquidarDirecto')
}
