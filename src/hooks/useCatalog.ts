import { useQuery } from '@tanstack/react-query'
import { catalogsApi } from '@/api/catalogsApi'
import type { CatalogEntry } from '@/types/catalogs'

export const catalogQueryKey = (domain: string) => ['catalog', domain] as const

/**
 * Fase 7a — entradas activas de un catálogo de la empresa (categorías de proveedor, tipos de asociado…). `data` es `undefined` mientras
 * carga o si falla: quien lo usa debe tener un respaldo (los valores de siempre) para que la pantalla no quede vacía.
 */
export function useCatalog(domain: string) {
  return useQuery<CatalogEntry[]>({
    queryKey: catalogQueryKey(domain),
    queryFn:  () => catalogsApi.list(domain),
    staleTime: 5 * 60 * 1000,
  })
}

/** Opciones {clave, etiqueta} de un catálogo, con respaldo mientras no hay datos. */
export function useCatalogOptions(domain: string, fallback: { key: string, label: string }[]): { key: string, label: string }[] {
  const { data } = useCatalog(domain)
  return data && data.length > 0 ? data.map(e => ({ key: e.key, label: e.label })) : fallback
}
