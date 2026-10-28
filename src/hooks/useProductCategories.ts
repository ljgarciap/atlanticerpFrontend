import { useCallback } from 'react'
import { useCatalogOptions } from '@/hooks/useCatalog'

/** `general` es la categoría de sistema: siempre existe (el campo es obligatorio al crear un producto). */
const FALLBACK = [{ key: 'general', label: 'General' }]

function humanize(key: string): string {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fase 9a — categorías de producto: catálogo por empresa (`product_category`), no una lista del código. `label(key)` resuelve la
 * etiqueta de la clave que trae un producto; una categoría desactivada o desconocida se muestra con su clave legible.
 */
export function useProductCategories() {
  const options = useCatalogOptions('product_category', FALLBACK)
  const label = useCallback((key: string) => options.find(o => o.key === key)?.label ?? humanize(key), [options])
  return { options, label }
}
