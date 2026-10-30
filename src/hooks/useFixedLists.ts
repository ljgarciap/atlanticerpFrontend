import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalogOptions } from '@/hooks/useCatalog'
import { ADJUSTMENT_MOTIVOS } from '@/types/bodega'

function humanize(key: string): string {
  const text = key.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fase 14c — listas que eran fijas del código y ahora son catálogos por empresa. `options` trae las entradas ACTIVAS del catálogo (con
 * respaldo a los valores de siempre y su traducción mientras carga o si falla); `label(key)` resuelve la etiqueta de cualquier clave
 * guardada, incluso de una entrada desactivada o desconocida (cae a la traducción y, si no hay, a la clave legible).
 */
function useCatalogList(domain: string, fallbackKeys: readonly string[], i18nNs: string, i18nPrefix: string) {
  const { t } = useTranslation(i18nNs)
  const tr = useCallback((key: string) => t(`${i18nPrefix}.${key}`, { defaultValue: humanize(key) }), [t, i18nPrefix])
  const options = useCatalogOptions(domain, fallbackKeys.map(key => ({ key, label: tr(key) })))
  const label = useCallback((key: string) => options.find(o => o.key === key)?.label ?? tr(key), [options, tr])
  return { options, label }
}

export const RETURN_REASON_KEYS = ['danado_defectuoso', 'no_corresponde', 'cliente_cambio_opinion', 'excedente', 'error_instalacion', 'otra'] as const

export const useAdjustmentReasons = () => useCatalogList('adjustment_reason', ADJUSTMENT_MOTIVOS, 'bodega', 'adjustments.newModal.reasons')
export const useReturnReasons = () => useCatalogList('return_reason', RETURN_REASON_KEYS, 'bodega', 'returns.reasons')
export const useTechnicianSpecialties = () => useCatalogList('technician_specialty', ['general', 'warranty'], 'servicios', 'technicians.internal.specialty')
