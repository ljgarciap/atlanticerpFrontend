import type { TFunction } from 'i18next'

/**
 * SCRUM-204 (REQ-141): "Pendiente/Por liquidar" es un único estado interno (`PurchaseOrder::STATUS_PENDIENTE_LIQUIDAR`). Fase 14f: ya no hay
 * una modalidad que cambie su texto, así que se muestra siempre la etiqueta de «Pendiente». El parámetro `modality` se conserva por
 * compatibilidad con quien lo pasa: `undefined` (un <select> con todos los estados) usa el texto combinado neutral ya existente.
 */
export function orderStatusLabel(t: TFunction, status: string, modality?: string | null): string {
  if (status !== 'pendiente_liquidar' || modality === undefined) {
    return t(`compras:orders.status.${status}`)
  }
  return t('compras:orders.status.pendienteLiquidarDirecto')
}
