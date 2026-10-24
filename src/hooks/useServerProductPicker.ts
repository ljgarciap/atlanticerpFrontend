import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import type { PaginationMeta } from '@/components/ui/Pagination'

/** SCRUM-1162 — tamaños de página de los pickers de productos de Nueva Orden de Compra. */
export const PICKER_PER_PAGE_OPTIONS = [10, 20, 50] as const
const MAX_EXCLUDED_IN_URL = 200

/**
 * SCRUM-1163 — picker de productos de Nueva Orden con paginación REAL en servidor (reemplaza la paginación en cliente sobre un tope de 100): el total y
 * las páginas son los del catálogo del proveedor (principal o secundario), y los productos ya agregados al carrito se excluyen en el servidor para que
 * el total siga siendo exacto. `searchTerm` ya viene con debounce; al cambiar (o al cambiar el proveedor) vuelve a la página 1.
 */
export function useServerProductPicker({ providerId, searchTerm, excludeIds, enabled = true, queryKey }: {
  providerId: number | undefined
  searchTerm: string
  excludeIds: number[]
  enabled?: boolean
  queryKey: string
}) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPageState] = useState<number>(20)

  useEffect(() => { setPage(1) }, [searchTerm, providerId])

  // Orden estable para que agregar/quitar del carrito no invalide la caché por reordenar el mismo conjunto.
  // Tope de 200 ids: más largos desbordan la URL (nginx 414 con ~330). Una orden real no llega a tanto.
  const excluded = [...excludeIds].sort((a, b) => a - b).slice(0, MAX_EXCLUDED_IN_URL)

  const query = useQuery({
    queryKey: [queryKey, providerId, searchTerm, page, perPage, excluded],
    queryFn:  () => comprasApi.products.searchPage({ providerId, search: searchTerm, page, perPage, excludeIds: excluded }),
    placeholderData: keepPreviousData,
    enabled,
  })

  // Si la página actual quedó vacía (se agregó el último producto de ella) se retrocede a la última disponible.
  const lastPage = query.data?.meta.last_page
  useEffect(() => {
    if (lastPage !== undefined && page > lastPage) setPage(Math.max(1, lastPage))
  }, [lastPage, page])

  const meta: PaginationMeta = query.data?.meta ?? { total: 0, per_page: perPage, current_page: page, last_page: 1 }

  const setPerPage = (n: number | 'all') => {
    if (n === 'all') return
    setPerPageState(n)
    setPage(1)
  }

  /** Por qué no hay filas: búsqueda sin resultados, ya se agregaron todos, o el proveedor no tiene productos (SCRUM-1172). */
  const emptyReason: 'search' | 'allAdded' | 'noProducts' | null =
    !query.data || query.data.data.length > 0 || query.isPlaceholderData ? null
      : searchTerm !== '' ? 'search'
      : excluded.length > 0 ? 'allAdded'
      : 'noProducts'

  return { items: query.data?.data ?? [], meta, perPage, setPage, setPerPage, emptyReason, isLoaded: query.data !== undefined }
}
