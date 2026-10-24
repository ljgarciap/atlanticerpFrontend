import type { ZonaLibreCatalogoParams, ZonaLibreCatalogoPerPage, ZonaLibreCatalogoSort } from '@/types/bodega'

/** SCRUM-990 — lógica pura del catálogo de Lafayette de solo consulta (Bodega > Zona Libre). */

/** Espejo del `min:2` de `ZonaLibreCatalogoController`: con menos caracteres el backend responde 422, así que no se envía. */
export const ZONA_LIBRE_MIN_SEARCH = 2

/** Orden por defecto del backend (`ZonaLibreCatalogoService::DEFAULT_SORT`). */
export const ZONA_LIBRE_DEFAULT_SORT: ZonaLibreCatalogoSort = 'referencia'

export interface ZonaLibreFilterState {
  search:          string
  categoria:       string
  soloDisponibles: boolean
  sort:            ZonaLibreCatalogoSort
  dir:             'asc' | 'desc'
  page:            number
  perPage:         ZonaLibreCatalogoPerPage
}

/** Texto de búsqueda aplicable: recortado y solo si alcanza el mínimo (si no, equivale a "sin búsqueda"). */
export function effectiveSearch(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.length >= ZONA_LIBRE_MIN_SEARCH ? trimmed : ''
}

/** Estado de filtros de la UI -> parámetros EXACTOS del endpoint. Solo manda lo que cambia el resultado:
 * `solo_disponibles` únicamente si es true (apagado = los productos con stock 0 se ven), `search`/`categoria` solo si no
 * están vacíos. `sort`, `dir`, `page` y `per_page` van siempre. */
export function buildZonaLibreParams(state: ZonaLibreFilterState): ZonaLibreCatalogoParams {
  const params: ZonaLibreCatalogoParams = {
    sort: state.sort, dir: state.dir, page: state.page, per_page: state.perPage,
  }
  const search = effectiveSearch(state.search)
  if (search !== '') params.search = search
  if (state.categoria !== '') params.categoria = state.categoria
  if (state.soloDisponibles) params.solo_disponibles = true
  return params
}

/** ¿Hay algún filtro activo (búsqueda aplicable, categoría o solo disponibles)? Distingue "catálogo vacío" de "sin resultados". */
export function hasActiveFilters(state: Pick<ZonaLibreFilterState, 'search' | 'categoria' | 'soloDisponibles'>): boolean {
  return effectiveSearch(state.search) !== '' || state.categoria !== '' || state.soloDisponibles
}

/** Clic en el encabezado de una columna: la misma columna alterna el sentido; otra columna arranca en ascendente. */
export function nextSort(
  current: { sort: ZonaLibreCatalogoSort; dir: 'asc' | 'desc' },
  clicked: ZonaLibreCatalogoSort,
): { sort: ZonaLibreCatalogoSort; dir: 'asc' | 'desc' } {
  if (current.sort === clicked) return { sort: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { sort: clicked, dir: 'asc' }
}

export function ariaSortFor(
  current: { sort: ZonaLibreCatalogoSort; dir: 'asc' | 'desc' },
  column: ZonaLibreCatalogoSort,
): 'ascending' | 'descending' | 'none' {
  if (current.sort !== column) return 'none'
  return current.dir === 'asc' ? 'ascending' : 'descending'
}

// ── Datos de un TERCERO (Lafayette): el backend los guarda y los devuelve tal cual, sin sanear (revisión de seguridad
//    SCRUM-990, hallazgo H2). El riesgo está en cómo se pintan, así que TODO texto va como texto de React y la URL de imagen solo
//    se usa en un `<img src>` si pasa `safeImageUrl`. Nunca `dangerouslySetInnerHTML`, nunca en un `href`.

/** Tope de longitud de una URL de imagen aceptada (igual al que pide la mitigación de backend de H2). */
export const MAX_IMAGE_URL_LENGTH = 2048

/** Caracteres de control C0 (incluye \0, tab y saltos de línea), DEL y C1: ninguna URL legítima los lleva. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001F\u007F-\u009F]+/g
/** Controles de dirección de texto (U+202A–202E, U+2066–2069): permiten disfrazar el texto al revés ("trojan source"). */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g

/**
 * URL de imagen segura para un `<img src>`, o `null` (se pinta el cuadro neutro). Solo `https`; rechaza `javascript:`, `data:`,
 * `http:`, `blob:`, URLs relativas o de protocolo implícito (`//host`), con credenciales (`user:pass@`), con espacios o caracteres
 * de control (incluso los que el parser de URL descartaría en silencio, como un salto de línea) y de más de 2048 caracteres.
 * Devuelve la forma normalizada (`URL.href`).
 */
export function safeImageUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_IMAGE_URL_LENGTH) return null
  if (raw !== raw.trim() || CONTROL_CHARS.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.hostname === '' || url.username !== '' || url.password !== '') return null
  if (url.href.length > MAX_IMAGE_URL_LENGTH) return null
  return url.href
}

/** Texto de un tercero listo para PINTAR (siempre como texto de React): controles C0/C1 -> espacio, controles bidi fuera,
 * espacios colapsados. No altera el dato almacenado; `null`/vacío -> `null` (el llamador muestra "—"). */
export function displayText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(BIDI_CONTROLS, '').replace(CONTROL_CHARS_GLOBAL, ' ').replace(/\s+/g, ' ').trim()
  return clean === '' ? null : clean
}
