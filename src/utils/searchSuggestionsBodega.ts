import { bodegaApi } from '@/api/bodegaApi'
import { isWarehouseEmptyLocationRow, type WarehouseProductRow } from '@/types/bodega'
import { dedupeSuggestions as dedupe } from '@/utils/searchSuggestionsShared'

/**
 * SCRUM-949 — lógica de sugerencias centralizada para el buscador con autocompletado de las 3
 * vistas de Bodega (`AutocompleteInput.fetchOptions`). Ver el docblock de
 * `searchSuggestionsCompras.ts` para el porqué de tenerlas en un archivo aparte del de Compras.
 */

const SUGGESTIONS_PAGE_SIZE = 8

/** Inventario → Ver Inventario — `BodegaInventoryController::index()`, fuzzy search. */
export async function fetchBodegaInventorySuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await bodegaApi.inventory.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(p => p.reference), res.data.map(p => p.name), res.data.map(p => p.provider_name))
}

/**
 * Bodegas → vista de una bodega puntual — `WarehouseController::show()`, fuzzy search sobre
 * referencia/descripción/ubicación. Necesita el id de la bodega activa (el buscador es "por
 * bodega", no global — REQ del ticket: "consistente en cada una de las bodegas disponibles").
 */
export async function fetchWarehouseProductSuggestions(warehouseId: number, q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await bodegaApi.warehouses.show(warehouseId, { search: q, per_page: SUGGESTIONS_PAGE_SIZE })
  const productRows = res.data.filter((row): row is WarehouseProductRow => !isWarehouseEmptyLocationRow(row))

  return dedupe(productRows.map(p => p.reference), productRows.map(p => p.description), productRows.map(p => p.ubicacion), productRows.map(p => p.proveedor))
}

/** Movimientos (Kardex) — `KardexController::index()`, ILIKE sobre referencia/nombre del producto. */
export async function fetchKardexSuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await bodegaApi.kardex.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(m => m.producto.reference), res.data.map(m => m.producto.description))
}
