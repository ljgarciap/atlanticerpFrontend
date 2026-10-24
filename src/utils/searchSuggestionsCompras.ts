import { comprasApi } from '@/api/comprasApi'
import { productDisplayName } from '@/lib/catalogProduct'
import { dedupeSuggestions as dedupe } from '@/utils/searchSuggestionsShared'

/**
 * SCRUM-949 — lógica de sugerencias centralizada para el buscador con autocompletado de las 6
 * vistas de Compras (`AutocompleteInput.fetchOptions`). Ver `searchSuggestionsBodega.ts` para las
 * 3 de Bodega — separados a propósito en 2 archivos (no uno solo para las 9): importar UNA función
 * de este archivo desde una página no debe arrastrar `bodegaApi` a su bundle/módulo, ni viceversa
 * — un test que solo mockea `comprasApi` (o solo `bodegaApi`) se rompía en la práctica cuando las
 * 9 vivían juntas y un import transitivo cargaba el cliente REAL del otro dominio.
 *
 * Cada función:
 * - Devuelve `[]` sin pedir nada mientras el campo está vacío (el usuario recién enfocó).
 * - Pide una página CHICA (`per_page: SUGGESTIONS_PAGE_SIZE`) al mismo endpoint que ya alimenta la
 *   tabla — mismo `search` fuzzy/contiene que el backend ya soporta, sin endpoint nuevo.
 * - Devuelve solo los VALORES que el backend de ese endpoint efectivamente re-matchea con `search`
 *   (ver el WHERE de cada controller) — nunca una etiqueta compuesta que no re-matchee nada al
 *   seleccionarla (ej. "#123 — Proveedor X" no es substring de ninguna columna real).
 * - Dedupea (un mismo proveedor/producto puede repetirse en varias filas de la página).
 */

const SUGGESTIONS_PAGE_SIZE = 8

/** Proveedores — `ProviderController::index()`, fuzzy search por nombre. */
export async function fetchProviderSuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await comprasApi.providers.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(p => p.name))
}

/**
 * Ver Órdenes / Logística & Envío / Pago a Proveedores — las 3 comparten
 * `PurchaseOrderController::index()` (mismo buscador: id exacto, proveedor o proyecto, ambos
 * "contiene"). El id numérico no sirve como sugerencia de texto (no hay nada que autocompletar
 * en un número exacto), así que las sugerencias son proveedor + proyecto.
 */
export async function fetchOrderSuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await comprasApi.orders.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(o => o.provider_name), res.data.map(o => o.sales_project_summary))
}

/** Catálogo y Stock → Inventario — `InventoryController::index()`, fuzzy search. */
export async function fetchInventorySuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await comprasApi.inventory.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(p => p.reference), res.data.map(p => productDisplayName(p)), res.data.map(p => p.provider_name))
}

/**
 * Garantías & Reclamos — `PurchaseOrderClaimController::index()`: substring sobre
 * `code() + proveedor + productos` concatenados — cualquier valor individual de esos campos
 * re-matchea igual al seleccionarlo.
 */
export async function fetchClaimSuggestions(q: string): Promise<string[]> {
  if (q.trim() === '') return []
  const res = await comprasApi.claims.list({ search: q, per_page: SUGGESTIONS_PAGE_SIZE })

  return dedupe(res.data.map(c => c.provider_name), res.data.map(c => c.product), res.data.map(c => c.code))
}
