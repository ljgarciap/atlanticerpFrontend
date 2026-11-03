import type { TFunction } from 'i18next'
import { useCatalogOptions } from '@/hooks/useCatalog'

/** Claves históricas de los 4 segmentos de sistema; solo sirven de respaldo mientras el catálogo carga (los de la empresa los define el catálogo). */
const SEGMENTOS_DE_SISTEMA = ['a_walkin', 'b_architect_designer', 'c_bidding', 'd_referred'] as const

/**
 * Fase 18 — segmentos de cliente de la empresa (catálogo `client_segment`, editable en Ajustes → Catálogos). Mientras el catálogo carga o si falla,
 * rigen los 4 de siempre con su texto traducido.
 */
export function useClientSegmentOptions(t: TFunction): { key: string, label: string }[] {
  return useCatalogOptions('client_segment', SEGMENTOS_DE_SISTEMA.map(key => ({ key, label: t(`ventasDiseno:category.${key}`) })))
}

/** Etiqueta de un segmento; si el catálogo ya no lo trae (p. ej. desactivado), la clave legible, nunca el identificador crudo. */
export function segmentLabel(options: { key: string, label: string }[], key: string): string {
  return options.find(o => o.key === key)?.label ?? key.replace(/_/g, ' ')
}

/** Inicial para la pastilla de la lista: la letra del segmento («B · Prescriptor» → «B»). */
export function segmentInitial(label: string): string {
  return (label.trim()[0] ?? '?').toUpperCase()
}
